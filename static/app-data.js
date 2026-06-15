// Schéma global, stocké dans IndexedDB (via idb-keyval, chargé en CDN).
// Forme :
// {
//   tables: { [tableId]: { id, name, columns: [{id,name,type,editable}], rows: [{...}] } },
//   relations: [{ id, fromTable, fromColumn, toTable, toColumn }],
//   moduleConfigs: { [moduleId]: { tableId, visibleColumns:[colId], editableColumns:[colId], filters:[{column,op,value}] } }
// }

const STORE_KEY = "appgap.schema";

const MODULES = [
  { id: "inspecteur", label: "Inspecteur analyse" },
  { id: "optimisation", label: "Optimisation des points" },
  { id: "pose-echaf", label: "Pose échafaudage" },
  { id: "reception-echaf", label: "Réception échafaudage" },
  { id: "depose-isolant", label: "Dépose isolant" },
  { id: "controle-end", label: "Contrôle END" },
  { id: "interpretation", label: "Interprétation" },
  { id: "validation-sir", label: "Validation SIR" },
  { id: "rapport-icnd", label: "Rapport ICND" },
  { id: "maj-valeurs", label: "MAJ valeurs points" },
  { id: "repose-isolant", label: "Repose isolant" },
  { id: "validation-repose", label: "Validation repose isolant" },
  { id: "depose-echaf", label: "Dépose échaf" },
  { id: "admin-panel", label: "Admin" },
  { id: "utilisateurs", label: "Gestion compte utilisateur" },
  { id: "incidents", label: "Incident / Modification BDD" },
];

const COLUMN_TYPES = ["texte", "nombre", "date", "booléen", "liste"];
const FILTER_OPS = [
  { v: "eq", label: "égal à" },
  { v: "ne", label: "différent de" },
  { v: "contains", label: "contient" },
  { v: "gt", label: ">" },
  { v: "lt", label: "<" },
  { v: "gte", label: "≥" },
  { v: "lte", label: "≤" },
  { v: "empty", label: "est vide" },
  { v: "notempty", label: "non vide" },
];

function defaultSchema() {
  return { tables: {}, relations: [], moduleConfigs: {}, units: [], kpis: [], queries: [] };
}

function _normalize(parsed) {
  if (!parsed) return defaultSchema();
  return {
    tables: parsed.tables || {},
    relations: parsed.relations || [],
    moduleConfigs: parsed.moduleConfigs || {},
    units: parsed.units || [],
    kpis: parsed.kpis || [],
    queries: parsed.queries || [],
  };
}

const CHUNK_ROWS = 500;

async function _fetchSchemaRemote() {
  if (typeof sb === "undefined") return null;
  // 1. Configs principales
  const { data: mainRow, error: mainErr } = await sb.from("app_state").select("data").eq("key", "main").maybeSingle();
  if (mainErr) { console.warn("Supabase main load error", mainErr); return null; }
  const mainData = (mainRow && mainRow.data) || {};

  // 2. Tables (metadata) — d'abord app_tables, sinon fallback sur l'ancien main.tables
  const { data: tablesData, error: tErr } = await sb.from("app_tables").select("id,name,columns");
  if (tErr) { console.warn("app_tables error", tErr); return null; }
  const tables = {};
  for (const t of tablesData || []) {
    tables[t.id] = { id: t.id, name: t.name, columns: t.columns || [], rows: [] };
  }
  // Migration : tables existant dans ancien main mais pas dans app_tables → on les insère
  for (const [id, t] of Object.entries(mainData.tables || {})) {
    if (!tables[id]) {
      tables[id] = { id, name: t.name, columns: t.columns || [], rows: [], _needsMigration: true };
    }
  }

  // 3. Rows par table : nouveau format (app_rows) OU ancien format (chunks dans app_state)
  await Promise.all(Object.values(tables).map(async (t) => {
    if (t._needsMigration) {
      const PAGE = 5;
      let from = 0;
      while (true) {
        const res = await sb.from("app_state").select("key,data").like("key", `rows:${t.id}:%`).order("key", { ascending: true }).range(from, from + PAGE - 1);
        if (res.error) { console.warn("legacy chunk load error", res.error); break; }
        const page = res.data || [];
        if (page.length === 0) break;
        const sorted = page.map((r) => ({ idx: parseInt(r.key.split(":").pop(), 10), data: r.data })).sort((a, b) => a.idx - b.idx);
        for (const c of sorted) {
          if (c.data && Array.isArray(c.data.chunk)) t.rows.push(...c.data.chunk);
        }
        if (page.length < PAGE) break;
        from += PAGE;
      }
      return;
    }
    // Nouveau format : fetch N pages en parallèle
    const PAGE = 500;
    const PAR = 8;
    async function fetchPage(off) {
      for (let attempt = 0; attempt < 4; attempt++) {
        const res = await sb.from("app_rows").select("id,data").eq("table_id", t.id).order("id", { ascending: true }).range(off, off + PAGE - 1);
        if (!res.error) return res.data || [];
        await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
      }
      return null;
    }
    let from = 0;
    while (true) {
      const offsets = Array.from({ length: PAR }, (_, i) => from + i * PAGE);
      const pages = await Promise.all(offsets.map((o) => fetchPage(o)));
      let stop = false;
      for (let i = 0; i < pages.length; i++) {
        const p = pages[i];
        if (p === null) { stop = true; break; }
        if (p.length === 0) { stop = true; break; }
        for (const r of p) t.rows.push({ _id: r.id, ...(r.data || {}) });
        if (p.length < PAGE) stop = true;
      }
      if (stop) break;
      from += PAR * PAGE;
    }
  }));

  return {
    tables,
    relations: mainData.relations || [],
    moduleConfigs: mainData.moduleConfigs || {},
    units: mainData.units || [],
    kpis: mainData.kpis || [],
    queries: mainData.queries || [],
  };
}

async function loadSchema() {
  let local = null;
  try { local = await idbKeyval.get(STORE_KEY); } catch {}
  if (!local) {
    try { const raw = localStorage.getItem(STORE_KEY); if (raw) { local = JSON.parse(raw); localStorage.removeItem(STORE_KEY); } } catch {}
  }
  try {
    const remote = await _fetchSchemaRemote();
    if (remote) {
      const migrated = Object.values(remote.tables).some((t) => t._needsMigration);
      for (const t of Object.values(remote.tables)) delete t._needsMigration;
      _lastSavedSnapshot = _deepSnapshot(remote);
      if (migrated) {
        // Force re-push de tout (les tables migrées seront vues comme nouvelles)
        for (const t of Object.values(_lastSavedSnapshot.tables)) {
          t.name = "__migrated__"; t.columns = []; t.rowsById = {};
        }
        console.log("Migration : push des anciennes données vers le nouveau schéma…");
        saveSchema(remote);
      }
      try { await idbKeyval.set(STORE_KEY, remote); } catch {}
      return remote;
    }
  } catch (e) { console.warn("Supabase load failed, fallback IDB", e); }
  if (local) return _normalize(local);
  return defaultSchema();
}

let _lastSavedSnapshot = null;

function _deepSnapshot(s) {
  return {
    tables: Object.fromEntries(Object.entries(s.tables || {}).map(([id, t]) => [id, {
      id: t.id, name: t.name,
      columns: JSON.parse(JSON.stringify(t.columns || [])),
      rowsById: Object.fromEntries((t.rows || []).map((r) => [r._id, _hash(r)])),
    }])),
    mainHash: _hash({ relations: s.relations || [], moduleConfigs: s.moduleConfigs || {}, units: s.units || [], kpis: s.kpis || [], queries: s.queries || [] }),
  };
}

function getCurrentUnit() {
  try { return sessionStorage.getItem("currentUnit") || ""; } catch { return ""; }
}
function setCurrentUnit(u) {
  try {
    if (u) sessionStorage.setItem("currentUnit", u);
    else sessionStorage.removeItem("currentUnit");
  } catch {}
}

let _saveQueue = Promise.resolve();
let _saveTimer = null;
function saveSchema(s) {
  _isDirty = true;
  try { idbKeyval.set(STORE_KEY, s); } catch (e) { console.warn("IDB save failed", e); }
  clearTimeout(_saveTimer);
  _saveTimer = setTimeout(() => { _pushRemote(s); }, 1200);
}

let _lastSavedSchema = null;
let _isDirty = false;

window.addEventListener("beforeunload", (e) => {
  if (_isDirty) {
    e.preventDefault();
    e.returnValue = "Synchronisation en cours. Quitter maintenant fera perdre les dernières modifications.";
    return e.returnValue;
  }
});

function _hash(obj) {
  const s = JSON.stringify(obj);
  let h = 5381;
  for (let i = 0; i < s.length; i++) { h = ((h << 5) + h + s.charCodeAt(i)) | 0; }
  return h.toString(36);
}

function _pushRemote(s) {
  _lastSavedSchema = s;
  _saveQueue = _saveQueue
    .then(async () => {
      if (typeof sb === "undefined") return;
      try {
        const snap = _lastSavedSnapshot || { tables: {}, mainHash: null };

        // 1) Diff "main" (configs)
        const main = {
          relations: s.relations || [],
          moduleConfigs: s.moduleConfigs || {},
          units: s.units || [],
          kpis: s.kpis || [],
          queries: s.queries || [],
        };
        const mainH = _hash(main);
        const pushMain = mainH !== snap.mainHash;

        // 2) Diff tables (meta + rows)
        const newTables = s.tables || {};
        const oldTables = snap.tables || {};

        const tableMetaUpserts = [];
        const tableDeletes = [];
        const rowUpserts = [];
        const rowDeleteIds = [];

        // Tables ajoutées ou modifiées (meta)
        for (const [id, t] of Object.entries(newTables)) {
          const old = oldTables[id];
          if (!old || old.name !== t.name || _hash(old.columns) !== _hash(t.columns || [])) {
            tableMetaUpserts.push({ id, name: t.name, columns: t.columns || [], updated_at: new Date().toISOString() });
          }
          // Diff rows
          const oldRows = old?.rowsById || {};
          const seen = new Set();
          for (const r of t.rows || []) {
            seen.add(r._id);
            const h = _hash(r);
            if (oldRows[r._id] !== h) {
              const { _id, ...data } = r;
              rowUpserts.push({ id: _id, table_id: id, data, updated_at: new Date().toISOString(), _h: h, _tableId: id });
            }
          }
          // Suppressions
          for (const oldId of Object.keys(oldRows)) {
            if (!seen.has(oldId)) rowDeleteIds.push(oldId);
          }
        }

        // Tables supprimées
        for (const oldId of Object.keys(oldTables)) {
          if (!newTables[oldId]) tableDeletes.push(oldId);
        }

        const totalOps = (pushMain ? 1 : 0) + tableMetaUpserts.length + Math.ceil(rowUpserts.length / 500) + (rowDeleteIds.length ? 1 : 0) + (tableDeletes.length ? 1 : 0);
        if (totalOps === 0) { _isDirty = false; _showSyncOk(); return; }
        let done = 0;
        _showSyncing(`0/${totalOps}`);

        async function withRetry(fn, attempt = 0) {
          try { return await fn(); }
          catch (e) {
            if (attempt < 3) {
              await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
              return withRetry(fn, attempt + 1);
            }
            throw e;
          }
        }

        // a) main
        if (pushMain) {
          await withRetry(async () => {
            const { error } = await sb.from("app_state").upsert({ key: "main", data: main, updated_at: new Date().toISOString() });
            if (error) throw error;
          });
          done++; _showSyncing(`${done}/${totalOps}`);
        }

        // b) tables meta
        for (const meta of tableMetaUpserts) {
          await withRetry(async () => {
            const { error } = await sb.from("app_tables").upsert(meta);
            if (error) throw error;
          });
          done++; _showSyncing(`${done}/${totalOps}`);
        }

        // c) rows en batches de 500, parallèle
        const BATCH = 500;
        const PAR = 4;
        const batches = [];
        for (let i = 0; i < rowUpserts.length; i += BATCH) batches.push(rowUpserts.slice(i, i + BATCH));

        async function worker(queue) {
          while (queue.length) {
            const batch = queue.shift();
            if (!batch) return;
            await withRetry(async () => {
              const payload = batch.map(({ _h, _tableId, ...r }) => r);
              const { error } = await sb.from("app_rows").upsert(payload);
              if (error) throw error;
            });
            done++; _showSyncing(`${done}/${totalOps}`);
          }
        }
        const queue = batches.slice();
        await Promise.all(Array.from({ length: PAR }, () => worker(queue)));

        // d) row deletes
        if (rowDeleteIds.length) {
          await withRetry(async () => {
            const { error } = await sb.from("app_rows").delete().in("id", rowDeleteIds);
            if (error) throw error;
          });
          done++; _showSyncing(`${done}/${totalOps}`);
        }

        // e) table deletes (cascade les rows)
        if (tableDeletes.length) {
          await withRetry(async () => {
            const { error } = await sb.from("app_tables").delete().in("id", tableDeletes);
            if (error) throw error;
          });
          done++; _showSyncing(`${done}/${totalOps}`);
        }

        _lastSavedSnapshot = _deepSnapshot(s);
        _isDirty = false;
        _showSyncOk();
      } catch (e) {
        console.error("Supabase save error", e);
        _showSyncError(e?.message || String(e));
      }
    })
    .catch((e) => { console.error("saveSchema error", e); });
  return _saveQueue;
}

async function forceSync() {
  let s = _lastSavedSchema;
  if (!s) { try { s = await idbKeyval.get(STORE_KEY); } catch {} }
  if (!s) { alert("Aucune donnée locale à synchroniser."); return; }
  await _pushRemote(s);
}

function _showSyncing(progress) {
  const el = document.getElementById("syncStatus");
  if (!el) return;
  el.textContent = progress ? `Synchronisation ${progress}…` : "Synchronisation…";
  el.className = "text-xs text-zinc-500 cursor-pointer";
  el.onclick = forceSync;
}
function _showSyncOk() {
  const el = document.getElementById("syncStatus");
  if (!el) return;
  el.textContent = "✓ Synchronisé";
  el.className = "text-xs text-emerald-600 cursor-pointer";
  el.title = "Cliquer pour forcer une re-synchronisation";
  el.onclick = forceSync;
}
function _showSyncError(msg) {
  const el = document.getElementById("syncStatus");
  if (!el) return;
  el.textContent = "⚠ Sync échouée — cliquer pour réessayer";
  el.title = msg;
  el.className = "text-xs text-amber-600 cursor-pointer underline";
  el.onclick = forceSync;
}

function uid(prefix) {
  return (
    (prefix || "id") +
    "_" +
    Math.random().toString(36).slice(2, 9) +
    Date.now().toString(36).slice(-3)
  );
}

// Cherche, pour une ligne donnée de `table`, la valeur d'une colonne d'une table liée via une relation.
// joined = { viaRelation, column }
function getJoinedValue(row, table, joined, schema) {
  const rel = schema.relations.find((r) => r.id === joined.viaRelation);
  if (!rel) return "";
  let myCol, otherTable, otherCol;
  if (rel.fromTable === table.id) {
    myCol = rel.fromColumn; otherTable = schema.tables[rel.toTable]; otherCol = rel.toColumn;
  } else if (rel.toTable === table.id) {
    myCol = rel.toColumn; otherTable = schema.tables[rel.fromTable]; otherCol = rel.fromColumn;
  } else return "";
  if (!otherTable) return "";
  const v = row[myCol];
  if (v === undefined || v === null || v === "") return "";
  const match = otherTable.rows.find((r) => String(r[otherCol] ?? "") === String(v));
  return match ? (match[joined.column] ?? "") : "";
}

// Liste les relations impliquant une table (utile pour proposer des joins).
function relationsForTable(tableId, schema) {
  return schema.relations.filter((r) => r.fromTable === tableId || r.toTable === tableId);
}

// Renvoie la "table cible" d'une relation depuis le point de vue de tableId.
function otherSideOfRelation(rel, tableId, schema) {
  if (rel.fromTable === tableId) return { table: schema.tables[rel.toTable], col: rel.toColumn };
  if (rel.toTable === tableId) return { table: schema.tables[rel.fromTable], col: rel.fromColumn };
  return { table: null, col: null };
}

// Calcule la valeur d'un KPI dans le contexte (unité courante prise en compte automatiquement).
// kpi : { id, name, tableId, filters, distinctColumn?, color? }
function computeKpi(kpi, schema) {
  const table = schema.tables[kpi.tableId];
  if (!table) return { value: 0, valid: false };
  // filtre par unité (auto-détecté ou colonne nommée)
  const unit = getCurrentUnit();
  let unitColId = kpi.unitColumn;
  if (!unitColId && unit) {
    const auto = table.columns.find((c) => /^(unit[ée]|u|unit)$/i.test(c.name.trim()));
    if (auto) unitColId = auto.id;
  }
  let rows = table.rows;
  if (unitColId && unit) {
    const target = String(unit).trim().toLowerCase();
    rows = rows.filter((r) => String(r[unitColId] ?? "").trim().toLowerCase() === target);
  }
  rows = applyFilters(rows, kpi.filters || [], table.columns);
  if (kpi.distinctColumn) {
    const set = new Set();
    for (const r of rows) {
      const v = r[kpi.distinctColumn];
      if (v !== undefined && v !== null && v !== "") set.add(String(v));
    }
    return { value: set.size, valid: true };
  }
  return { value: rows.length, valid: true };
}

const KPI_COLORS = [
  { v: "indigo", bg: "bg-indigo-50", text: "text-indigo-700", border: "border-indigo-200" },
  { v: "emerald", bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200" },
  { v: "amber", bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200" },
  { v: "rose", bg: "bg-rose-50", text: "text-rose-700", border: "border-rose-200" },
  { v: "sky", bg: "bg-sky-50", text: "text-sky-700", border: "border-sky-200" },
  { v: "violet", bg: "bg-violet-50", text: "text-violet-700", border: "border-violet-200" },
];

function applyFilters(rows, filters, columns) {
  if (!filters || filters.length === 0) return rows;
  return rows.filter((row) =>
    filters.every((f) => {
      const col = columns.find((c) => c.id === f.column);
      if (!col) return true;
      const v = row[col.id];
      const target = f.value;
      switch (f.op) {
        case "eq": return String(v ?? "") === String(target ?? "");
        case "ne": return String(v ?? "") !== String(target ?? "");
        case "contains": return String(v ?? "").toLowerCase().includes(String(target ?? "").toLowerCase());
        case "gt": return Number(v) > Number(target);
        case "lt": return Number(v) < Number(target);
        case "gte": return Number(v) >= Number(target);
        case "lte": return Number(v) <= Number(target);
        case "empty": return v === undefined || v === null || v === "";
        case "notempty": return !(v === undefined || v === null || v === "");
        default: return true;
      }
    })
  );
}
