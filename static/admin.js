// ====== Auth ======
try {
  if (sessionStorage.getItem("session") !== "admin") {
    window.location.href = "login.html";
  }
} catch {}

// ====== State ======
let schema = { tables: {}, relations: [], moduleConfigs: {} };
let currentTableId = null;
let currentModuleId = null;

function persist() {
  saveSchema(schema);
}

(async () => {
  schema = await loadSchema();
  activateTab((location.hash || "#tables").slice(1));
})();

// ====== Tabs ======
const tabs = document.querySelectorAll(".tab");
const panels = document.querySelectorAll(".tab-panel");

function activateTab(name) {
  tabs.forEach((t) => {
    const on = t.dataset.tab === name;
    t.classList.toggle("border-indigo-600", on);
    t.classList.toggle("text-indigo-700", on);
    t.classList.toggle("text-zinc-600", !on);
  });
  panels.forEach((p) => p.classList.toggle("hidden", p.id !== `tab-${name}`));
  if (name === "tables") renderTablesTab();
  if (name === "relations") renderRelationsTab();
  if (name === "modules") renderModulesTab();
  if (name === "kpis") renderKpisTab();
  if (name === "units") renderUnitsTab();
  location.hash = name;
}
tabs.forEach((t) => t.addEventListener("click", () => activateTab(t.dataset.tab)));

// ====== Modal ======
const modal = document.getElementById("modal");
const modalTitle = document.getElementById("modalTitle");
const modalBody = document.getElementById("modalBody");
const modalFooter = document.getElementById("modalFooter");
document.getElementById("modalClose").addEventListener("click", closeModal);
modal.addEventListener("click", (e) => { if (e.target === modal) closeModal(); });

function openModal(title, bodyHTML, actions, opts) {
  modalTitle.textContent = title;
  modalBody.innerHTML = bodyHTML;
  modalFooter.innerHTML = "";
  (actions || []).forEach((a) => {
    const b = document.createElement("button");
    b.textContent = a.label;
    b.className = a.primary
      ? "rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 px-4 py-2 text-sm font-medium text-white"
      : "rounded-lg border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50";
    b.onclick = a.onClick;
    modalFooter.appendChild(b);
  });
  const card = document.getElementById("modalCard");
  card.className = `w-full ${opts?.wide ? "max-w-4xl" : "max-w-lg"} rounded-2xl bg-white p-6 shadow-xl max-h-[90vh] overflow-y-auto`;
  modal.classList.remove("hidden");
  modal.classList.add("flex");
}
function closeModal() { modal.classList.add("hidden"); modal.classList.remove("flex"); }

// ====== Import / Export ======
document.getElementById("exportBtn").addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(schema, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = "appgap-schema.json"; a.click();
  URL.revokeObjectURL(url);
});
document.getElementById("importBtn").addEventListener("click", () => document.getElementById("importFile").click());
document.getElementById("importFile").addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  const text = await file.text();
  try {
    const parsed = JSON.parse(text);
    schema = {
      tables: parsed.tables || {},
      relations: parsed.relations || [],
      moduleConfigs: parsed.moduleConfigs || {},
    };
    await saveSchema(schema);
    activateTab(location.hash.slice(1) || "tables");
  } catch { alert("Fichier invalide"); }
  e.target.value = "";
});

// ============================================================
// ============ TABLES TAB ====================================
// ============================================================
function renderTablesTab() {
  const list = document.getElementById("tableList");
  const tables = Object.values(schema.tables);
  if (tables.length === 0) {
    list.innerHTML = `<p class="px-2 py-4 text-sm text-zinc-500">Aucune table.</p>`;
  } else {
    list.innerHTML = tables.map((t) => `
      <button data-id="${t.id}" class="tableItem w-full flex items-center justify-between rounded-lg px-3 py-2 text-left text-sm hover:bg-zinc-100 ${currentTableId===t.id?'bg-indigo-50 text-indigo-700':'text-zinc-700'}">
        <span class="truncate">${escapeHtml(t.name)}</span>
        <span class="text-xs text-zinc-400">${t.rows.length}</span>
      </button>`).join("");
    list.querySelectorAll(".tableItem").forEach((el) => el.addEventListener("click", () => {
      currentTableId = el.dataset.id; renderTablesTab();
    }));
  }
  renderTableEditor();
}

function renderTableEditor() {
  const ed = document.getElementById("tableEditor");
  const t = currentTableId ? schema.tables[currentTableId] : null;
  if (!t) {
    ed.innerHTML = `<p class="text-sm text-zinc-500">Sélectionnez ou créez une table.</p>`;
    return;
  }
  ed.innerHTML = `
    <div class="mb-5 flex items-center justify-between gap-3">
      <input id="tableName" value="${escapeAttr(t.name)}" class="flex-1 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-base font-semibold text-zinc-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20" />
      <button id="deleteTableBtn" class="rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50">Supprimer</button>
    </div>

    <div class="mb-6">
      <div class="mb-2 flex items-center justify-between">
        <h4 class="text-sm font-semibold text-zinc-900">Colonnes</h4>
        <button id="addColBtn" class="text-xs font-medium text-indigo-600 hover:text-indigo-700">+ Ajouter</button>
      </div>
      <div id="colsList" class="space-y-2"></div>
    </div>

    <div>
      <div class="mb-2 flex items-center justify-between">
        <h4 class="text-sm font-semibold text-zinc-900">Données <span id="rowsCount" class="ml-1 text-xs font-normal text-zinc-500"></span></h4>
        <div class="flex items-center gap-2">
          <input id="rowsSearch" placeholder="Rechercher…" class="rounded border border-zinc-300 px-2 py-1 text-sm" />
          <button id="addRowBtn" class="text-xs font-medium text-indigo-600 hover:text-indigo-700">+ Ajouter une ligne</button>
        </div>
      </div>
      <div class="overflow-x-auto rounded-lg border border-zinc-200">
        <table class="w-full text-sm table-fixed" style="min-width:${t.columns.length*180+40}px">
          <colgroup>${t.columns.map(() => `<col style="width:180px" />`).join("")}<col style="width:40px" /></colgroup>
          <thead class="sticky top-[100px] z-[5] bg-zinc-50 shadow-[0_1px_0_0_#e4e4e7]">
            <tr>${t.columns.map((c) => `<th title="${escapeAttr(c.name)}" class="px-3 py-2 text-left font-medium text-zinc-700 truncate"><div class="truncate">${escapeHtml(c.name)}</div><span class="text-xs font-normal text-zinc-400">${c.type}</span></th>`).join("")}<th></th></tr>
          </thead>
          <tbody id="rowsBody"></tbody>
        </table>
      </div>
      <div id="rowsPager" class="mt-3 flex items-center justify-between text-xs text-zinc-600"></div>
    </div>
  `;

  document.getElementById("tableName").addEventListener("change", (e) => {
    t.name = e.target.value.trim() || t.name;
    persist(); renderTablesTab();
  });
  document.getElementById("deleteTableBtn").addEventListener("click", () => {
    if (!confirm(`Supprimer la table "${t.name}" ?`)) return;
    delete schema.tables[t.id];
    schema.relations = schema.relations.filter((r) => r.fromTable !== t.id && r.toTable !== t.id);
    Object.values(schema.moduleConfigs).forEach((c) => { if (c.tableId === t.id) { c.tableId = ""; c.visibleColumns=[]; c.editableColumns=[]; c.filters=[]; }});
    currentTableId = null;
    persist(); renderTablesTab();
  });
  document.getElementById("addColBtn").addEventListener("click", () => openAddColumnModal(t));
  document.getElementById("addRowBtn").addEventListener("click", () => {
    const row = { _id: uid("row") };
    t.columns.forEach((c) => (row[c.id] = ""));
    t.rows.push(row); persist(); renderTableEditor();
  });

  renderColsList(t);
  rowsPage = 0;
  rowsSearch = "";
  document.getElementById("rowsSearch").addEventListener("input", (e) => {
    rowsSearch = e.target.value.toLowerCase();
    rowsPage = 0;
    renderRowsBody(t);
  });
  renderRowsBody(t);
}

const ROWS_PAGE_SIZE = 100;
let rowsPage = 0;
let rowsSearch = "";

function renderColsList(t) {
  const c = document.getElementById("colsList");
  if (t.columns.length === 0) { c.innerHTML = `<p class="text-xs text-zinc-500">Aucune colonne.</p>`; return; }
  c.innerHTML = t.columns.map((col) => `
    <div class="flex items-center gap-2 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2">
      <input data-col="${col.id}" data-field="name" value="${escapeAttr(col.name)}" class="flex-1 rounded border border-zinc-200 bg-white px-2 py-1 text-sm" />
      <select data-col="${col.id}" data-field="type" class="rounded border border-zinc-200 bg-white px-2 py-1 text-sm">
        ${COLUMN_TYPES.map((tp) => `<option ${col.type===tp?'selected':''}>${tp}</option>`).join("")}
      </select>
      <label class="flex items-center gap-1 text-xs text-zinc-600"><input data-col="${col.id}" data-field="editable" type="checkbox" ${col.editable?'checked':''} /> Éditable</label>
      <button data-del="${col.id}" class="text-red-500 hover:text-red-700">✕</button>
    </div>
  `).join("");
  c.querySelectorAll("input,select").forEach((el) => {
    el.addEventListener("change", () => {
      const col = t.columns.find((c) => c.id === el.dataset.col);
      if (!col) return;
      if (el.dataset.field === "editable") col.editable = el.checked;
      else if (el.dataset.field === "type") col.type = el.value;
      else col.name = el.value;
      persist(); renderColsList(t); renderRowsBody(t);
    });
  });
  c.querySelectorAll("[data-del]").forEach((b) => b.addEventListener("click", () => {
    const colId = b.dataset.del;
    if (!confirm("Supprimer cette colonne ?")) return;
    t.columns = t.columns.filter((c) => c.id !== colId);
    t.rows.forEach((r) => delete r[colId]);
    persist(); renderTableEditor();
  }));
}

function renderRowsBody(t) {
  const tb = document.getElementById("rowsBody");
  const pager = document.getElementById("rowsPager");
  const countEl = document.getElementById("rowsCount");

  let filtered = t.rows;
  if (rowsSearch) {
    filtered = t.rows.filter((r) => t.columns.some((c) => String(r[c.id] ?? "").toLowerCase().includes(rowsSearch)));
  }

  if (countEl) countEl.textContent = `(${filtered.length}${rowsSearch ? ` filtrées sur ${t.rows.length}` : ""})`;

  if (filtered.length === 0) {
    tb.innerHTML = `<tr><td class="px-3 py-4 text-xs text-zinc-500" colspan="${t.columns.length+1}">Aucune ligne.</td></tr>`;
    if (pager) pager.innerHTML = "";
    return;
  }

  const totalPages = Math.max(1, Math.ceil(filtered.length / ROWS_PAGE_SIZE));
  if (rowsPage >= totalPages) rowsPage = totalPages - 1;
  const start = rowsPage * ROWS_PAGE_SIZE;
  const pageRows = filtered.slice(start, start + ROWS_PAGE_SIZE);

  tb.innerHTML = pageRows.map((row) => `
    <tr class="border-t border-zinc-100">
      ${t.columns.map((c) => `<td class="px-3 py-1 overflow-hidden"><input title="${escapeAttr(row[c.id] ?? "")}" data-row="${row._id}" data-col="${c.id}" type="${c.type==='nombre'?'number':c.type==='date'?'date':'text'}" value="${escapeAttr(row[c.id] ?? "")}" class="w-full rounded border border-transparent bg-transparent px-2 py-1 text-sm hover:border-zinc-200 focus:border-indigo-500 focus:bg-white focus:ring-1 focus:ring-indigo-500/20 outline-none" /></td>`).join("")}
      <td class="px-2 text-center"><button data-delrow="${row._id}" class="text-red-500 hover:text-red-700">✕</button></td>
    </tr>
  `).join("");
  tb.querySelectorAll("input").forEach((el) => el.addEventListener("change", () => {
    const row = t.rows.find((r) => r._id === el.dataset.row);
    if (row) { row[el.dataset.col] = el.value; persist(); }
  }));
  tb.querySelectorAll("[data-delrow]").forEach((b) => b.addEventListener("click", () => {
    t.rows = t.rows.filter((r) => r._id !== b.dataset.delrow);
    persist(); renderRowsBody(t); renderTablesTab();
  }));

  if (pager) {
    pager.innerHTML = `
      <span>Page ${rowsPage+1} / ${totalPages} · lignes ${start+1}–${Math.min(start+ROWS_PAGE_SIZE, filtered.length)}</span>
      <div class="flex gap-2">
        <button id="pgPrev" class="rounded border border-zinc-200 bg-white px-2 py-1 ${rowsPage===0?'opacity-40 cursor-not-allowed':''}">‹ Précédent</button>
        <button id="pgNext" class="rounded border border-zinc-200 bg-white px-2 py-1 ${rowsPage>=totalPages-1?'opacity-40 cursor-not-allowed':''}">Suivant ›</button>
      </div>`;
    document.getElementById("pgPrev").onclick = () => { if (rowsPage>0){ rowsPage--; renderRowsBody(t); } };
    document.getElementById("pgNext").onclick = () => { if (rowsPage<totalPages-1){ rowsPage++; renderRowsBody(t); } };
  }
}

function openAddColumnModal(t) {
  openModal("Nouvelle colonne", `
    <div class="space-y-3">
      <div><label class="mb-1 block text-xs font-medium text-zinc-600">Nom</label><input id="m_colName" class="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm" placeholder="ex. numéro_point" /></div>
      <div><label class="mb-1 block text-xs font-medium text-zinc-600">Type</label><select id="m_colType" class="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm">${COLUMN_TYPES.map((tp) => `<option>${tp}</option>`).join("")}</select></div>
      <label class="flex items-center gap-2 text-sm text-zinc-700"><input id="m_colEdit" type="checkbox" checked /> Modifiable par défaut</label>
    </div>
  `, [
    { label: "Annuler", onClick: closeModal },
    { label: "Créer", primary: true, onClick: () => {
      const name = document.getElementById("m_colName").value.trim();
      if (!name) return;
      t.columns.push({ id: uid("col"), name, type: document.getElementById("m_colType").value, editable: document.getElementById("m_colEdit").checked });
      t.rows.forEach((r) => (r[t.columns.at(-1).id] = ""));
      persist(); closeModal(); renderTableEditor();
    }},
  ]);
}

// ===== Excel import =====
document.getElementById("importExcelBtn").addEventListener("click", () => document.getElementById("excelFile").click());
document.getElementById("excelFile").addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  try {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array", cellDates: true });
    const sheetName = wb.SheetNames[0];
    if (!sheetName) { alert("Fichier vide."); e.target.value = ""; return; }
    const sheet = wb.Sheets[sheetName];
    const aoa = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: false, dateNF: "yyyy-mm-dd" });
    if (aoa.length === 0) { alert("Feuille vide."); e.target.value = ""; return; }
    const headers = (aoa[0] || []).map((h, i) => String(h ?? "").trim() || `colonne_${i+1}`);
    const dataRows = aoa.slice(1).filter((r) => r.some((v) => v !== "" && v !== null && v !== undefined));
    openExcelPreview(file.name.replace(/\.[^.]+$/, ""), wb.SheetNames, sheetName, headers, dataRows, buf);
  } catch (err) {
    alert("Erreur lecture du fichier : " + err.message);
  }
  e.target.value = "";
});

function detectType(values) {
  const nonEmpty = values.filter((v) => v !== "" && v !== null && v !== undefined);
  if (nonEmpty.length === 0) return "texte";
  const allNum = nonEmpty.every((v) => v !== "" && !isNaN(Number(String(v).replace(",", "."))));
  if (allNum) return "nombre";
  const dateRe = /^\d{4}-\d{2}-\d{2}|^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}/;
  const allDate = nonEmpty.every((v) => dateRe.test(String(v)));
  if (allDate) return "date";
  const boolSet = new Set(["true","false","vrai","faux","oui","non","yes","no","1","0"]);
  const allBool = nonEmpty.every((v) => boolSet.has(String(v).toLowerCase()));
  if (allBool) return "booléen";
  return "texte";
}

function openExcelPreview(suggestedName, sheetNames, currentSheet, headers, dataRows, buf) {
  const typesGuess = headers.map((_, i) => detectType(dataRows.map((r) => r[i])));
  const previewRows = dataRows.slice(0, 5);

  const html = `
    <div class="space-y-4">
      <div class="grid grid-cols-2 gap-3">
        <div>
          <label class="mb-1 block text-xs font-medium text-zinc-600">Nom de la table</label>
          <input id="imp_name" value="${escapeAttr(suggestedName)}" class="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm" />
        </div>
        <div>
          <label class="mb-1 block text-xs font-medium text-zinc-600">Feuille</label>
          <select id="imp_sheet" class="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm">
            ${sheetNames.map((s) => `<option ${s===currentSheet?'selected':''}>${escapeHtml(s)}</option>`).join("")}
          </select>
        </div>
      </div>

      <div>
        <p class="mb-2 text-xs font-medium text-zinc-600">Colonnes détectées (${headers.length}) — ajustez si besoin</p>
        <div class="space-y-2">
          ${headers.map((h, i) => `
            <div class="flex items-center gap-2 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2">
              <input data-h="${i}" data-f="name" value="${escapeAttr(h)}" class="flex-1 rounded border border-zinc-200 bg-white px-2 py-1 text-sm" />
              <select data-h="${i}" data-f="type" class="rounded border border-zinc-200 bg-white px-2 py-1 text-sm">
                ${COLUMN_TYPES.map((t) => `<option ${typesGuess[i]===t?'selected':''}>${t}</option>`).join("")}
              </select>
              <label class="flex items-center gap-1 text-xs text-zinc-600"><input data-h="${i}" data-f="skip" type="checkbox" /> Ignorer</label>
            </div>
          `).join("")}
        </div>
      </div>

      <div>
        <p class="mb-2 text-xs font-medium text-zinc-600">Aperçu (${Math.min(5, dataRows.length)}/${dataRows.length} lignes)</p>
        <div class="overflow-x-auto rounded-lg border border-zinc-200">
          <table class="min-w-full text-xs">
            <thead class="bg-zinc-50"><tr>${headers.map((h) => `<th class="px-2 py-1.5 text-left font-medium text-zinc-700">${escapeHtml(h)}</th>`).join("")}</tr></thead>
            <tbody>${previewRows.map((r) => `<tr class="border-t border-zinc-100">${headers.map((_, i) => `<td class="px-2 py-1 text-zinc-700">${escapeHtml(r[i] ?? "")}</td>`).join("")}</tr>`).join("")}</tbody>
          </table>
        </div>
      </div>
    </div>
  `;

  openModal("Importer un fichier", html, [
    { label: "Annuler", onClick: closeModal },
    { label: `Importer ${dataRows.length} ligne(s)`, primary: true, onClick: () => {
      try {
        const nameInput = document.getElementById("imp_name");
        const name = (nameInput?.value || "").trim() || "import";
        const cols = headers.map((h, i) => {
          const nameEl = modalBody.querySelector('input[data-h="' + i + '"][data-f="name"]');
          const typeEl = modalBody.querySelector('select[data-h="' + i + '"][data-f="type"]');
          const skipEl = modalBody.querySelector('input[data-h="' + i + '"][data-f="skip"]');
          return {
            idx: i,
            name: (nameEl?.value || h || ("colonne_" + (i+1))).trim() || ("colonne_" + (i+1)),
            type: typeEl?.value || "texte",
            skip: !!(skipEl && skipEl.checked),
          };
        });
        const kept = cols.filter((c) => !c.skip);
        if (kept.length === 0) { alert("Sélectionnez au moins une colonne."); return; }
        const tableId = uid("tbl");
        const tableCols = kept.map((c) => ({ id: uid("col"), name: c.name, type: c.type, editable: true }));
        const rows = dataRows.map((r) => {
          const row = { _id: uid("row") };
          kept.forEach((c, i) => { row[tableCols[i].id] = castValue(r[c.idx], c.type); });
          return row;
        });
        schema.tables[tableId] = { id: tableId, name, columns: tableCols, rows };
        currentTableId = tableId;
        persist();
        closeModal();
        activateTab("tables");
      } catch (err) {
        console.error(err);
        alert("Erreur lors de l'import : " + (err && err.message ? err.message : err));
      }
    }},
  ], { wide: true });

  // Changement de feuille → recharger
  document.getElementById("imp_sheet").addEventListener("change", async (e) => {
    const newSheet = e.target.value;
    const wb = XLSX.read(buf, { type: "array", cellDates: true });
    const sheet = wb.Sheets[newSheet];
    const aoa = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: false, dateNF: "yyyy-mm-dd" });
    const newHeaders = (aoa[0] || []).map((h, i) => String(h ?? "").trim() || `colonne_${i+1}`);
    const newDataRows = aoa.slice(1).filter((r) => r.some((v) => v !== "" && v !== null && v !== undefined));
    closeModal();
    openExcelPreview(suggestedName, sheetNames, newSheet, newHeaders, newDataRows, buf);
  });
}

function castValue(v, type) {
  if (v === null || v === undefined || v === "") return "";
  if (type === "nombre") {
    const n = Number(String(v).replace(",", "."));
    return isNaN(n) ? String(v) : n;
  }
  if (type === "date") {
    if (v instanceof Date) return v.toISOString().slice(0, 10);
    const d = new Date(v);
    return isNaN(d.getTime()) ? String(v) : d.toISOString().slice(0, 10);
  }
  if (type === "booléen") {
    const s = String(v).toLowerCase();
    return ["true","vrai","oui","yes","1"].includes(s);
  }
  return String(v);
}

document.getElementById("newTableBtn").addEventListener("click", () => {
  openModal("Nouvelle table", `
    <div><label class="mb-1 block text-xs font-medium text-zinc-600">Nom de la table</label><input id="m_tableName" class="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm" placeholder="ex. points_inspection" /></div>
  `, [
    { label: "Annuler", onClick: closeModal },
    { label: "Créer", primary: true, onClick: () => {
      const name = document.getElementById("m_tableName").value.trim();
      if (!name) return;
      const id = uid("tbl");
      schema.tables[id] = { id, name, columns: [], rows: [] };
      currentTableId = id;
      persist(); closeModal(); renderTablesTab();
    }},
  ]);
});

// ============================================================
// ============ RELATIONS TAB ================================
// ============================================================
function renderRelationsTab() {
  const list = document.getElementById("relationsList");
  if (schema.relations.length === 0) {
    list.innerHTML = `<p class="text-sm text-zinc-500">Aucune relation.</p>`;
    return;
  }
  list.innerHTML = `<div class="space-y-2">${schema.relations.map((r) => {
    const ft = schema.tables[r.fromTable], tt = schema.tables[r.toTable];
    const fc = ft?.columns.find((c) => c.id === r.fromColumn);
    const tc = tt?.columns.find((c) => c.id === r.toColumn);
    return `<div class="flex items-center gap-3 rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm">
      <span class="font-medium text-zinc-900">${escapeHtml(ft?.name||"?")}</span>
      <span class="text-zinc-500">.${escapeHtml(fc?.name||"?")}</span>
      <span class="text-indigo-500">→</span>
      <span class="font-medium text-zinc-900">${escapeHtml(tt?.name||"?")}</span>
      <span class="text-zinc-500">.${escapeHtml(tc?.name||"?")}</span>
      <button data-delrel="${r.id}" class="ml-auto text-red-500 hover:text-red-700">✕</button>
    </div>`;
  }).join("")}</div>`;
  list.querySelectorAll("[data-delrel]").forEach((b) => b.addEventListener("click", () => {
    schema.relations = schema.relations.filter((r) => r.id !== b.dataset.delrel);
    persist(); renderRelationsTab();
  }));
}

document.getElementById("newRelationBtn").addEventListener("click", () => {
  const tables = Object.values(schema.tables);
  if (tables.length < 1) { alert("Créez d'abord des tables."); return; }
  const tblOptions = tables.map((t) => `<option value="${t.id}">${escapeHtml(t.name)}</option>`).join("");
  openModal("Nouvelle relation", `
    <div class="space-y-3">
      <div class="grid grid-cols-2 gap-2">
        <div><label class="mb-1 block text-xs font-medium text-zinc-600">Table source</label><select id="m_fromTable" class="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm">${tblOptions}</select></div>
        <div><label class="mb-1 block text-xs font-medium text-zinc-600">Colonne source</label><select id="m_fromCol" class="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"></select></div>
      </div>
      <div class="grid grid-cols-2 gap-2">
        <div><label class="mb-1 block text-xs font-medium text-zinc-600">Table cible</label><select id="m_toTable" class="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm">${tblOptions}</select></div>
        <div><label class="mb-1 block text-xs font-medium text-zinc-600">Colonne cible</label><select id="m_toCol" class="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"></select></div>
      </div>
    </div>
  `, [
    { label: "Annuler", onClick: closeModal },
    { label: "Créer", primary: true, onClick: () => {
      const r = {
        id: uid("rel"),
        fromTable: document.getElementById("m_fromTable").value,
        fromColumn: document.getElementById("m_fromCol").value,
        toTable: document.getElementById("m_toTable").value,
        toColumn: document.getElementById("m_toCol").value,
      };
      if (!r.fromColumn || !r.toColumn) return;
      schema.relations.push(r); persist(); closeModal(); renderRelationsTab();
    }},
  ]);
  function syncCols(tblSelId, colSelId) {
    const tbl = schema.tables[document.getElementById(tblSelId).value];
    document.getElementById(colSelId).innerHTML = (tbl?.columns||[]).map((c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join("");
  }
  document.getElementById("m_fromTable").addEventListener("change", () => syncCols("m_fromTable","m_fromCol"));
  document.getElementById("m_toTable").addEventListener("change", () => syncCols("m_toTable","m_toCol"));
  syncCols("m_fromTable","m_fromCol"); syncCols("m_toTable","m_toCol");
});

// ============================================================
// ============ MODULES TAB ===================================
// ============================================================
function renderModulesTab() {
  const list = document.getElementById("moduleList");
  list.innerHTML = MODULES.map((m) => {
    const cfg = schema.moduleConfigs[m.id];
    const linked = cfg?.tableId && schema.tables[cfg.tableId];
    return `<button data-id="${m.id}" class="moduleItem w-full flex items-center justify-between rounded-lg px-3 py-2 text-left text-sm hover:bg-zinc-100 ${currentModuleId===m.id?'bg-indigo-50 text-indigo-700':'text-zinc-700'}">
      <span class="truncate">${escapeHtml(m.label)}</span>
      <span class="text-xs ${linked?'text-emerald-600':'text-zinc-400'}">${linked?'●':'○'}</span>
    </button>`;
  }).join("");
  list.querySelectorAll(".moduleItem").forEach((el) => el.addEventListener("click", () => {
    currentModuleId = el.dataset.id; renderModulesTab();
  }));
  renderModuleEditor();
}

function renderModuleEditor() {
  const ed = document.getElementById("moduleEditor");
  if (!currentModuleId) { ed.innerHTML = `<p class="text-sm text-zinc-500">Sélectionnez un module.</p>`; return; }
  const mod = MODULES.find((m) => m.id === currentModuleId);
  const cfg = schema.moduleConfigs[currentModuleId] || { tableId: "", visibleColumns: [], editableColumns: [], filters: [], selectors: [], joinedColumns: [], kpis: [] };
  cfg.selectors = cfg.selectors || [];
  cfg.joinedColumns = cfg.joinedColumns || [];
  cfg.kpis = cfg.kpis || [];
  schema.moduleConfigs[currentModuleId] = cfg;

  const tables = Object.values(schema.tables);
  const table = cfg.tableId ? schema.tables[cfg.tableId] : null;

  ed.innerHTML = `
    <div class="mb-5">
      <h3 class="text-base font-semibold text-zinc-900">${escapeHtml(mod.label)}</h3>
      <p class="mt-1 text-xs text-zinc-500">Configurez la source de données et l'affichage de ce module.</p>
    </div>

    <div class="mb-5 grid gap-3 sm:grid-cols-2">
      <div>
        <label class="mb-1 block text-xs font-medium text-zinc-600">Table source</label>
        <select id="cfg_table" class="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm">
          <option value="">— Aucune —</option>
          ${tables.map((t) => `<option value="${t.id}" ${cfg.tableId===t.id?'selected':''}>${escapeHtml(t.name)}</option>`).join("")}
        </select>
      </div>
      <div>
        <label class="mb-1 block text-xs font-medium text-zinc-600">Mode d'affichage</label>
        <select id="cfg_layout" class="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm">
          <option value="table" ${(!cfg.layout||cfg.layout==='table')?'selected':''}>Tableau direct</option>
          <option value="form" ${cfg.layout==='form'?'selected':''}>Page d'accueil avec sélecteurs</option>
        </select>
      </div>
    </div>

    ${table ? `
      <div class="mb-5">
        <h4 class="mb-2 text-sm font-semibold text-zinc-900">Colonnes affichées</h4>
        <div class="grid gap-2 sm:grid-cols-2">
          ${table.columns.map((c) => `
            <label class="flex items-center justify-between gap-2 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm">
              <span class="flex items-center gap-2">
                <input data-vis="${c.id}" type="checkbox" ${cfg.visibleColumns.includes(c.id)?'checked':''} />
                <span>${escapeHtml(c.name)} <span class="text-xs text-zinc-400">${c.type}</span></span>
              </span>
              <label class="flex items-center gap-1 text-xs text-zinc-600">
                <input data-edit="${c.id}" type="checkbox" ${cfg.editableColumns.includes(c.id)?'checked':''} ${cfg.visibleColumns.includes(c.id)?'':'disabled'} />
                Éditable
              </label>
            </label>
          `).join("")}
        </div>
      </div>

      <div class="mb-5">
        <div class="mb-2 flex items-center justify-between">
          <h4 class="text-sm font-semibold text-zinc-900">Sélecteurs (filtres dynamiques)</h4>
          <button id="addSelectorBtn" class="text-xs font-medium text-indigo-600 hover:text-indigo-700">+ Ajouter</button>
        </div>
        <p class="mb-2 text-xs text-zinc-500">Un dropdown apparaîtra dans le module pour filtrer les lignes par la valeur de cette colonne (ex. choisir un repère).</p>
        <div id="selectorsList" class="space-y-2"></div>
      </div>

      <div class="mb-5">
        <div class="mb-2 flex items-center justify-between">
          <h4 class="text-sm font-semibold text-zinc-900">Colonnes liées (via relations)</h4>
          <button id="addJoinBtn" class="text-xs font-medium text-indigo-600 hover:text-indigo-700">+ Ajouter</button>
        </div>
        <p class="mb-2 text-xs text-zinc-500">Affichez une colonne d'une autre table en croisant les données via une relation existante.</p>
        <div id="joinsList" class="space-y-2"></div>
      </div>

      <div class="mb-3">
        <div class="mb-2 flex items-center justify-between">
          <h4 class="text-sm font-semibold text-zinc-900">Filtres fixes</h4>
          <button id="addFilterBtn" class="text-xs font-medium text-indigo-600 hover:text-indigo-700">+ Ajouter</button>
        </div>
        <div id="filtersList" class="space-y-2"></div>
      </div>

      <div class="mb-5">
        <h4 class="mb-2 text-sm font-semibold text-zinc-900">Compteurs KPI à afficher</h4>
        ${(schema.kpis || []).length === 0
          ? `<p class="text-xs text-zinc-500">Aucun KPI défini. <a class="font-medium text-indigo-600 hover:underline" href="#kpis">Créer un KPI</a></p>`
          : `<div class="grid gap-2 sm:grid-cols-2">${(schema.kpis || []).map((k) => `
              <label class="flex items-center gap-2 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm">
                <input data-kpi="${k.id}" type="checkbox" ${cfg.kpis.includes(k.id)?'checked':''} />
                <span class="truncate">${escapeHtml(k.name)}</span>
              </label>
            `).join("")}</div>`}
      </div>

      <div class="mt-6 border-t border-zinc-100 pt-4 text-right">
        <a href="module.html?id=${encodeURIComponent(currentModuleId)}" target="_blank" class="rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 px-4 py-2 text-sm font-medium text-white">Aperçu →</a>
      </div>
    ` : `<p class="text-sm text-zinc-500">Choisissez une table pour configurer les colonnes et filtres.</p>`}
  `;

  document.getElementById("cfg_table").addEventListener("change", (e) => {
    cfg.tableId = e.target.value;
    cfg.visibleColumns = [];
    cfg.editableColumns = [];
    cfg.filters = [];
    persist(); renderModulesTab();
  });
  document.getElementById("cfg_layout").addEventListener("change", (e) => {
    cfg.layout = e.target.value;
    persist();
  });

  if (table) {
    ed.querySelectorAll("[data-vis]").forEach((el) => el.addEventListener("change", () => {
      const id = el.dataset.vis;
      if (el.checked) {
        if (!cfg.visibleColumns.includes(id)) cfg.visibleColumns.push(id);
      } else {
        cfg.visibleColumns = cfg.visibleColumns.filter((x) => x !== id);
        cfg.editableColumns = cfg.editableColumns.filter((x) => x !== id);
      }
      persist(); renderModuleEditor();
    }));
    ed.querySelectorAll("[data-edit]").forEach((el) => el.addEventListener("change", () => {
      const id = el.dataset.edit;
      if (el.checked) { if (!cfg.editableColumns.includes(id)) cfg.editableColumns.push(id); }
      else cfg.editableColumns = cfg.editableColumns.filter((x) => x !== id);
      persist();
    }));
    document.getElementById("addFilterBtn").addEventListener("click", () => {
      cfg.filters.push({ column: table.columns[0]?.id || "", op: "eq", value: "" });
      persist(); renderModuleEditor();
    });
    document.getElementById("addSelectorBtn").addEventListener("click", () => {
      cfg.selectors.push({ id: uid("sel"), column: table.columns[0]?.id || "" });
      persist(); renderModuleEditor();
    });
    document.getElementById("addJoinBtn").addEventListener("click", () => {
      const rels = relationsForTable(table.id, schema);
      if (rels.length === 0) { alert("Aucune relation impliquant cette table. Créez-en une dans l'onglet Relations."); return; }
      const firstRel = rels[0];
      const other = otherSideOfRelation(firstRel, table.id, schema);
      cfg.joinedColumns.push({ id: uid("jcol"), viaRelation: firstRel.id, column: other.table?.columns[0]?.id || "" });
      persist(); renderModuleEditor();
    });
    renderFiltersList(table, cfg);
    renderSelectorsList(table, cfg);
    renderJoinsList(table, cfg);

    ed.querySelectorAll("[data-kpi]").forEach((el) => el.addEventListener("change", () => {
      const id = el.dataset.kpi;
      if (el.checked) { if (!cfg.kpis.includes(id)) cfg.kpis.push(id); }
      else cfg.kpis = cfg.kpis.filter((x) => x !== id);
      persist();
    }));
  }
}

function renderSelectorsList(table, cfg) {
  const c = document.getElementById("selectorsList");
  if (!c) return;
  if (cfg.selectors.length === 0) { c.innerHTML = `<p class="text-xs text-zinc-500">Aucun sélecteur.</p>`; return; }
  c.innerHTML = cfg.selectors.map((s, i) => `
    <div class="flex items-center gap-2 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2">
      <span class="text-xs text-zinc-500">Filtrer par</span>
      <select data-sel="${i}" class="flex-1 rounded border border-zinc-200 bg-white px-2 py-1 text-sm">
        ${table.columns.map((col) => `<option value="${col.id}" ${s.column===col.id?'selected':''}>${escapeHtml(col.name)}</option>`).join("")}
      </select>
      <button data-delsel="${i}" class="text-red-500 hover:text-red-700">✕</button>
    </div>
  `).join("");
  c.querySelectorAll("[data-sel]").forEach((el) => el.addEventListener("change", () => {
    cfg.selectors[+el.dataset.sel].column = el.value; persist();
  }));
  c.querySelectorAll("[data-delsel]").forEach((b) => b.addEventListener("click", () => {
    cfg.selectors.splice(+b.dataset.delsel, 1); persist(); renderSelectorsList(table, cfg);
  }));
}

function renderJoinsList(table, cfg) {
  const c = document.getElementById("joinsList");
  if (!c) return;
  const rels = relationsForTable(table.id, schema);
  if (cfg.joinedColumns.length === 0) {
    c.innerHTML = `<p class="text-xs text-zinc-500">${rels.length === 0 ? "Aucune relation disponible pour cette table." : "Aucune colonne liée."}</p>`;
    return;
  }
  c.innerHTML = cfg.joinedColumns.map((jc, i) => {
    const rel = schema.relations.find((r) => r.id === jc.viaRelation);
    const other = rel ? otherSideOfRelation(rel, table.id, schema) : { table: null };
    const otherTable = other.table;
    return `
      <div class="flex items-center gap-2 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2">
        <span class="text-xs text-zinc-500">Via</span>
        <select data-jrel="${i}" class="rounded border border-zinc-200 bg-white px-2 py-1 text-sm">
          ${rels.map((r) => {
            const o = otherSideOfRelation(r, table.id, schema);
            return `<option value="${r.id}" ${jc.viaRelation===r.id?'selected':''}>→ ${escapeHtml(o.table?.name || "?")}</option>`;
          }).join("")}
        </select>
        <span class="text-xs text-zinc-500">afficher</span>
        <select data-jcol="${i}" class="flex-1 rounded border border-zinc-200 bg-white px-2 py-1 text-sm">
          ${(otherTable?.columns || []).map((col) => `<option value="${col.id}" ${jc.column===col.id?'selected':''}>${escapeHtml(col.name)}</option>`).join("")}
        </select>
        <button data-deljoin="${i}" class="text-red-500 hover:text-red-700">✕</button>
      </div>`;
  }).join("");
  c.querySelectorAll("[data-jrel]").forEach((el) => el.addEventListener("change", () => {
    const i = +el.dataset.jrel;
    cfg.joinedColumns[i].viaRelation = el.value;
    const rel = schema.relations.find((r) => r.id === el.value);
    const other = otherSideOfRelation(rel, table.id, schema);
    cfg.joinedColumns[i].column = other.table?.columns[0]?.id || "";
    persist(); renderJoinsList(table, cfg);
  }));
  c.querySelectorAll("[data-jcol]").forEach((el) => el.addEventListener("change", () => {
    cfg.joinedColumns[+el.dataset.jcol].column = el.value; persist();
  }));
  c.querySelectorAll("[data-deljoin]").forEach((b) => b.addEventListener("click", () => {
    cfg.joinedColumns.splice(+b.dataset.deljoin, 1); persist(); renderJoinsList(table, cfg);
  }));
}

function renderFiltersList(table, cfg) {
  const c = document.getElementById("filtersList");
  if (cfg.filters.length === 0) { c.innerHTML = `<p class="text-xs text-zinc-500">Aucun filtre (toutes les lignes seront affichées).</p>`; return; }
  c.innerHTML = cfg.filters.map((f, i) => `
    <div class="flex items-center gap-2 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2">
      <select data-i="${i}" data-f="column" class="rounded border border-zinc-200 bg-white px-2 py-1 text-sm">
        ${table.columns.map((c) => `<option value="${c.id}" ${f.column===c.id?'selected':''}>${escapeHtml(c.name)}</option>`).join("")}
      </select>
      <select data-i="${i}" data-f="op" class="rounded border border-zinc-200 bg-white px-2 py-1 text-sm">
        ${FILTER_OPS.map((o) => `<option value="${o.v}" ${f.op===o.v?'selected':''}>${o.label}</option>`).join("")}
      </select>
      <input data-i="${i}" data-f="value" value="${escapeAttr(f.value||"")}" class="flex-1 rounded border border-zinc-200 bg-white px-2 py-1 text-sm" ${["empty","notempty"].includes(f.op)?'disabled':''} placeholder="valeur" />
      <button data-delf="${i}" class="text-red-500 hover:text-red-700">✕</button>
    </div>
  `).join("");
  c.querySelectorAll("[data-f]").forEach((el) => el.addEventListener("change", () => {
    const i = +el.dataset.i; const field = el.dataset.f;
    cfg.filters[i][field] = el.value;
    persist(); renderFiltersList(table, cfg);
  }));
  c.querySelectorAll("[data-delf]").forEach((b) => b.addEventListener("click", () => {
    cfg.filters.splice(+b.dataset.delf, 1); persist(); renderFiltersList(table, cfg);
  }));
}

// ============================================================
// ============ KPIs TAB ======================================
// ============================================================
let currentKpiId = null;

function renderKpisTab() {
  schema.kpis = schema.kpis || [];
  const list = document.getElementById("kpiList");
  if (schema.kpis.length === 0) {
    list.innerHTML = `<p class="px-2 py-4 text-sm text-zinc-500">Aucun KPI.</p>`;
  } else {
    list.innerHTML = schema.kpis.map((k) => `
      <button data-id="${k.id}" class="kpiItem w-full flex items-center justify-between rounded-lg px-3 py-2 text-left text-sm hover:bg-zinc-100 ${currentKpiId===k.id?'bg-indigo-50 text-indigo-700':'text-zinc-700'}">
        <span class="truncate">${escapeHtml(k.name || "Sans nom")}</span>
        <span class="text-xs text-zinc-400">${k.distinctColumn ? "≠" : "#"}</span>
      </button>
    `).join("");
    list.querySelectorAll(".kpiItem").forEach((el) => el.addEventListener("click", () => {
      currentKpiId = el.dataset.id; renderKpisTab();
    }));
  }
  renderKpiEditor();
}

function renderKpiEditor() {
  const ed = document.getElementById("kpiEditor");
  const k = currentKpiId ? schema.kpis.find((x) => x.id === currentKpiId) : null;
  if (!k) { ed.innerHTML = `<p class="text-sm text-zinc-500">Sélectionnez ou créez un KPI.</p>`; return; }
  const tables = Object.values(schema.tables);
  const table = schema.tables[k.tableId];

  ed.innerHTML = `
    <div class="mb-5 flex items-center justify-between gap-3">
      <input id="kpiName" value="${escapeAttr(k.name)}" placeholder="Nom du KPI" class="flex-1 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-base font-semibold text-zinc-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20" />
      <button id="deleteKpiBtn" class="rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50">Supprimer</button>
    </div>

    <div class="mb-5 grid gap-3 sm:grid-cols-2">
      <div>
        <label class="mb-1 block text-xs font-medium text-zinc-600">Table source</label>
        <select id="kpiTable" class="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm">
          <option value="">— Aucune —</option>
          ${tables.map((t) => `<option value="${t.id}" ${k.tableId===t.id?'selected':''}>${escapeHtml(t.name)}</option>`).join("")}
        </select>
      </div>
      <div>
        <label class="mb-1 block text-xs font-medium text-zinc-600">Couleur</label>
        <select id="kpiColor" class="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm">
          ${KPI_COLORS.map((c) => `<option value="${c.v}" ${k.color===c.v?'selected':''}>${c.v}</option>`).join("")}
        </select>
      </div>
    </div>

    ${table ? `
      <div class="mb-5">
        <label class="mb-1 block text-xs font-medium text-zinc-600">Type de comptage</label>
        <select id="kpiMode" class="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm">
          <option value="count" ${!k.distinctColumn?'selected':''}>Nombre de lignes</option>
          <option value="distinct" ${k.distinctColumn?'selected':''}>Nombre de valeurs distinctes</option>
        </select>
      </div>

      <div id="kpiDistinctWrap" class="mb-5 ${k.distinctColumn?'':'hidden'}">
        <label class="mb-1 block text-xs font-medium text-zinc-600">Colonne (valeurs distinctes)</label>
        <select id="kpiDistinctCol" class="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm">
          ${table.columns.map((c) => `<option value="${c.id}" ${k.distinctColumn===c.id?'selected':''}>${escapeHtml(c.name)}</option>`).join("")}
        </select>
      </div>

      <div class="mb-5">
        <label class="mb-1 block text-xs font-medium text-zinc-600">Colonne unité (optionnel)</label>
        <select id="kpiUnitCol" class="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm">
          <option value="">— auto-détection —</option>
          ${table.columns.map((c) => `<option value="${c.id}" ${k.unitColumn===c.id?'selected':''}>${escapeHtml(c.name)}</option>`).join("")}
        </select>
      </div>

      <div class="mb-5">
        <div class="mb-2 flex items-center justify-between">
          <h4 class="text-sm font-semibold text-zinc-900">Filtres</h4>
          <button id="kpiAddFilter" class="text-xs font-medium text-indigo-600 hover:text-indigo-700">+ Ajouter</button>
        </div>
        <div id="kpiFilters" class="space-y-2"></div>
      </div>

      <div class="mt-6 rounded-2xl border border-zinc-100 bg-zinc-50 p-4">
        <p class="text-xs font-medium uppercase tracking-wide text-zinc-500">Aperçu (unité ${escapeHtml(getCurrentUnit() || "—")})</p>
        <p class="mt-1 text-3xl font-bold text-zinc-900" id="kpiPreview">—</p>
      </div>
    ` : `<p class="text-sm text-zinc-500">Choisissez une table.</p>`}
  `;

  document.getElementById("kpiName").addEventListener("change", (e) => { k.name = e.target.value.trim() || k.name; persist(); renderKpisTab(); });
  document.getElementById("deleteKpiBtn").addEventListener("click", () => {
    if (!confirm(`Supprimer le KPI "${k.name}" ?`)) return;
    schema.kpis = schema.kpis.filter((x) => x.id !== k.id);
    Object.values(schema.moduleConfigs).forEach((c) => { if (c.kpis) c.kpis = c.kpis.filter((id) => id !== k.id); });
    currentKpiId = null; persist(); renderKpisTab();
  });
  document.getElementById("kpiTable").addEventListener("change", (e) => {
    k.tableId = e.target.value; k.filters = []; k.distinctColumn = ""; k.unitColumn = "";
    persist(); renderKpiEditor();
  });
  document.getElementById("kpiColor").addEventListener("change", (e) => { k.color = e.target.value; persist(); });

  if (table) {
    document.getElementById("kpiMode").addEventListener("change", (e) => {
      if (e.target.value === "distinct") {
        k.distinctColumn = k.distinctColumn || table.columns[0]?.id || "";
      } else {
        k.distinctColumn = "";
      }
      persist(); renderKpiEditor();
    });
    const dc = document.getElementById("kpiDistinctCol");
    if (dc) dc.addEventListener("change", (e) => { k.distinctColumn = e.target.value; persist(); refreshKpiPreview(k); });
    document.getElementById("kpiUnitCol").addEventListener("change", (e) => { k.unitColumn = e.target.value; persist(); refreshKpiPreview(k); });
    document.getElementById("kpiAddFilter").addEventListener("click", () => {
      k.filters = k.filters || [];
      k.filters.push({ column: table.columns[0]?.id || "", op: "eq", value: "" });
      persist(); renderKpiEditor();
    });
    renderKpiFilters(k, table);
    refreshKpiPreview(k);
  }
}

function renderKpiFilters(k, table) {
  k.filters = k.filters || [];
  const c = document.getElementById("kpiFilters");
  if (k.filters.length === 0) { c.innerHTML = `<p class="text-xs text-zinc-500">Aucun filtre.</p>`; return; }
  c.innerHTML = k.filters.map((f, i) => `
    <div class="flex items-center gap-2 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2">
      <select data-i="${i}" data-f="column" class="rounded border border-zinc-200 bg-white px-2 py-1 text-sm">
        ${table.columns.map((c) => `<option value="${c.id}" ${f.column===c.id?'selected':''}>${escapeHtml(c.name)}</option>`).join("")}
      </select>
      <select data-i="${i}" data-f="op" class="rounded border border-zinc-200 bg-white px-2 py-1 text-sm">
        ${FILTER_OPS.map((o) => `<option value="${o.v}" ${f.op===o.v?'selected':''}>${o.label}</option>`).join("")}
      </select>
      <input data-i="${i}" data-f="value" value="${escapeAttr(f.value||"")}" class="flex-1 rounded border border-zinc-200 bg-white px-2 py-1 text-sm" ${["empty","notempty"].includes(f.op)?'disabled':''} placeholder="valeur" />
      <button data-delf="${i}" class="text-red-500 hover:text-red-700">✕</button>
    </div>
  `).join("");
  c.querySelectorAll("[data-f]").forEach((el) => el.addEventListener("change", () => {
    k.filters[+el.dataset.i][el.dataset.f] = el.value;
    persist(); renderKpiFilters(k, table); refreshKpiPreview(k);
  }));
  c.querySelectorAll("[data-delf]").forEach((b) => b.addEventListener("click", () => {
    k.filters.splice(+b.dataset.delf, 1); persist(); renderKpiFilters(k, table); refreshKpiPreview(k);
  }));
}

function refreshKpiPreview(k) {
  const el = document.getElementById("kpiPreview");
  if (!el) return;
  const r = computeKpi(k, schema);
  el.textContent = r.valid ? r.value : "—";
}

document.getElementById("newKpiBtn").addEventListener("click", () => {
  const id = uid("kpi");
  schema.kpis = schema.kpis || [];
  schema.kpis.push({ id, name: "Nouveau KPI", tableId: "", filters: [], color: "indigo" });
  currentKpiId = id; persist(); renderKpisTab();
});

// ============================================================
// ============ UNITS TAB =====================================
// ============================================================
function renderUnitsTab() {
  schema.units = schema.units || [];
  const list = document.getElementById("unitsList");
  if (schema.units.length === 0) {
    list.innerHTML = `<p class="text-xs text-zinc-500">Aucune unité.</p>`;
  } else {
    list.innerHTML = schema.units.map((u, i) => `
      <span class="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-sm text-zinc-800">
        ${escapeHtml(u)}
        <button data-deluni="${i}" class="text-red-500 hover:text-red-700">✕</button>
      </span>
    `).join("");
    list.querySelectorAll("[data-deluni]").forEach((b) => b.addEventListener("click", () => {
      schema.units.splice(+b.dataset.deluni, 1); persist(); renderUnitsTab();
    }));
  }

  // Liaison colonne d'unité par module
  const mlist = document.getElementById("unitModulesList");
  mlist.innerHTML = MODULES.map((m) => {
    const cfg = schema.moduleConfigs[m.id];
    const table = cfg?.tableId ? schema.tables[cfg.tableId] : null;
    if (!table) {
      return `<div class="flex items-center justify-between rounded-lg border border-zinc-100 px-3 py-2 text-sm text-zinc-400">
        <span>${escapeHtml(m.label)}</span><span class="text-xs">aucune table</span>
      </div>`;
    }
    return `<div class="flex items-center justify-between gap-3 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm">
      <span class="text-zinc-800">${escapeHtml(m.label)} <span class="text-xs text-zinc-400">· ${escapeHtml(table.name)}</span></span>
      <select data-unitmod="${m.id}" class="rounded border border-zinc-200 bg-white px-2 py-1 text-sm">
        <option value="">— aucune —</option>
        ${table.columns.map((c) => `<option value="${c.id}" ${cfg.unitColumn===c.id?'selected':''}>${escapeHtml(c.name)}</option>`).join("")}
      </select>
    </div>`;
  }).join("");
  mlist.querySelectorAll("[data-unitmod]").forEach((el) => el.addEventListener("change", () => {
    const id = el.dataset.unitmod;
    schema.moduleConfigs[id].unitColumn = el.value || "";
    persist();
  }));
}

function addUnit() {
  const input = document.getElementById("newUnitName");
  const v = input.value.trim();
  if (!v) return;
  schema.units = schema.units || [];
  if (!schema.units.includes(v)) schema.units.push(v);
  input.value = "";
  persist(); renderUnitsTab();
}
document.getElementById("addUnitInline").addEventListener("click", addUnit);
document.getElementById("newUnitName").addEventListener("keydown", (e) => { if (e.key === "Enter") addUnit(); });
document.getElementById("addUnitBtn").addEventListener("click", () => document.getElementById("newUnitName").focus());

// ============================================================
function escapeHtml(s) { return String(s ?? "").replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m])); }
function escapeAttr(s) { return escapeHtml(s); }
