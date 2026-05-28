// ====== Auth ======
try {
  if (sessionStorage.getItem("session") !== "admin") {
    window.location.href = "login.html";
  }
} catch {}

// ====== State ======
let schema = loadSchema();
let currentTableId = null;
let currentModuleId = null;

function persist() {
  saveSchema(schema);
}

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
  location.hash = name;
}
tabs.forEach((t) => t.addEventListener("click", () => activateTab(t.dataset.tab)));
activateTab((location.hash || "#tables").slice(1));

// ====== Modal ======
const modal = document.getElementById("modal");
const modalTitle = document.getElementById("modalTitle");
const modalBody = document.getElementById("modalBody");
const modalFooter = document.getElementById("modalFooter");
document.getElementById("modalClose").addEventListener("click", closeModal);
modal.addEventListener("click", (e) => { if (e.target === modal) closeModal(); });

function openModal(title, bodyHTML, actions) {
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
    persist();
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
        <h4 class="text-sm font-semibold text-zinc-900">Données</h4>
        <button id="addRowBtn" class="text-xs font-medium text-indigo-600 hover:text-indigo-700">+ Ajouter une ligne</button>
      </div>
      <div class="overflow-x-auto rounded-lg border border-zinc-200">
        <table class="min-w-full text-sm"><thead class="bg-zinc-50">
          <tr>${t.columns.map((c) => `<th class="px-3 py-2 text-left font-medium text-zinc-700">${escapeHtml(c.name)}<span class="ml-1 text-xs text-zinc-400">${c.type}</span></th>`).join("")}<th class="w-10"></th></tr>
        </thead><tbody id="rowsBody"></tbody></table>
      </div>
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
  renderRowsBody(t);
}

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
  if (t.rows.length === 0) {
    tb.innerHTML = `<tr><td class="px-3 py-4 text-xs text-zinc-500" colspan="${t.columns.length+1}">Aucune ligne.</td></tr>`;
    return;
  }
  tb.innerHTML = t.rows.map((row) => `
    <tr class="border-t border-zinc-100">
      ${t.columns.map((c) => `<td class="px-3 py-1"><input data-row="${row._id}" data-col="${c.id}" type="${c.type==='nombre'?'number':c.type==='date'?'date':'text'}" value="${escapeAttr(row[c.id] ?? "")}" class="w-full rounded border border-transparent bg-transparent px-2 py-1 text-sm hover:border-zinc-200 focus:border-indigo-500 focus:bg-white focus:ring-1 focus:ring-indigo-500/20 outline-none" /></td>`).join("")}
      <td class="px-2"><button data-delrow="${row._id}" class="text-red-500 hover:text-red-700">✕</button></td>
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
  const cfg = schema.moduleConfigs[currentModuleId] || { tableId: "", visibleColumns: [], editableColumns: [], filters: [] };
  schema.moduleConfigs[currentModuleId] = cfg;

  const tables = Object.values(schema.tables);
  const table = cfg.tableId ? schema.tables[cfg.tableId] : null;

  ed.innerHTML = `
    <div class="mb-5">
      <h3 class="text-base font-semibold text-zinc-900">${escapeHtml(mod.label)}</h3>
      <p class="mt-1 text-xs text-zinc-500">Configurez la source de données et l'affichage de ce module.</p>
    </div>

    <div class="mb-5">
      <label class="mb-1 block text-xs font-medium text-zinc-600">Table source</label>
      <select id="cfg_table" class="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm">
        <option value="">— Aucune —</option>
        ${tables.map((t) => `<option value="${t.id}" ${cfg.tableId===t.id?'selected':''}>${escapeHtml(t.name)}</option>`).join("")}
      </select>
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

      <div class="mb-3">
        <div class="mb-2 flex items-center justify-between">
          <h4 class="text-sm font-semibold text-zinc-900">Filtres (lignes affichées)</h4>
          <button id="addFilterBtn" class="text-xs font-medium text-indigo-600 hover:text-indigo-700">+ Ajouter</button>
        </div>
        <div id="filtersList" class="space-y-2"></div>
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
    renderFiltersList(table, cfg);
  }
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
function escapeHtml(s) { return String(s ?? "").replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m])); }
function escapeAttr(s) { return escapeHtml(s); }
