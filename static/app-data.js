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
  return { tables: {}, relations: [], moduleConfigs: {}, units: [], kpis: [] };
}

function _normalize(parsed) {
  if (!parsed) return defaultSchema();
  return {
    tables: parsed.tables || {},
    relations: parsed.relations || [],
    moduleConfigs: parsed.moduleConfigs || {},
    units: parsed.units || [],
    kpis: parsed.kpis || [],
  };
}

const CHUNK_ROWS = 3000;

async function _fetchSchemaRemote() {
  if (typeof sb === "undefined") return null;
  const { data: rows, error } = await sb.from("app_state").select("key,data");
  if (error || !rows || rows.length === 0) return null;
  const mainRow = rows.find((r) => r.key === "main");
  if (!mainRow || !mainRow.data) return null;
  const norm = _normalize(mainRow.data);
  for (const t of Object.values(norm.tables)) {
    t.rows = [];
    const chunks = rows
      .filter((r) => r.key.startsWith(`rows:${t.id}:`))
      .map((r) => ({ idx: parseInt(r.key.split(":").pop(), 10), data: r.data }))
      .sort((a, b) => a.idx - b.idx);
    for (const c of chunks) {
      if (c.data && Array.isArray(c.data.chunk)) t.rows.push(...c.data.chunk);
    }
  }
  return norm;
}

async function loadSchema() {
  // 1) Cache local immédiat
  let local = null;
  try { local = await idbKeyval.get(STORE_KEY); } catch {}
  if (!local) {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) { local = JSON.parse(raw); localStorage.removeItem(STORE_KEY); }
    } catch {}
  }

  if (local) {
    // Refresh en arrière-plan (les changements distants seront visibles au prochain chargement)
    _backgroundRefresh();
    return _normalize(local);
  }

  // Pas de cache → fetch direct depuis Supabase
  try {
    const remote = await _fetchSchemaRemote();
    if (remote) {
      try { await idbKeyval.set(STORE_KEY, remote); } catch {}
      return remote;
    }
  } catch (e) { console.warn("Supabase load failed", e); }

  return defaultSchema();
}

function _backgroundRefresh() {
  _fetchSchemaRemote().then((remote) => {
    if (remote) {
      idbKeyval.set(STORE_KEY, remote).catch(() => {});
    }
  }).catch(() => {});
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
  // cache local immédiat
  try { idbKeyval.set(STORE_KEY, s); } catch (e) { console.warn("IDB save failed", e); }
  // debounce remote
  clearTimeout(_saveTimer);
  _saveTimer = setTimeout(() => { _pushRemote(s); }, 400);
}

function _pushRemote(s) {
  _saveQueue = _saveQueue
    .then(async () => {
      if (typeof sb === "undefined") return;
      _showSyncing();
      try {
        // main = schema sans les rows volumineux
        const main = {
          ..._normalize(s),
          tables: Object.fromEntries(Object.entries(s.tables).map(([id, t]) => [id, {
            id: t.id, name: t.name, columns: t.columns, _rowsChunks: Math.ceil((t.rows || []).length / CHUNK_ROWS)
          }])),
        };
        const upserts = [{ key: "main", data: main, updated_at: new Date().toISOString() }];
        for (const t of Object.values(s.tables)) {
          const rows = t.rows || [];
          const nChunks = Math.max(1, Math.ceil(rows.length / CHUNK_ROWS));
          for (let i = 0; i < nChunks; i++) {
            const chunk = rows.slice(i * CHUNK_ROWS, (i + 1) * CHUNK_ROWS);
            upserts.push({
              key: `rows:${t.id}:${i}`,
              data: { chunk },
              updated_at: new Date().toISOString(),
            });
          }
        }
        // Pousse en lots pour éviter les gros payloads
        const BATCH = 1;
        for (let i = 0; i < upserts.length; i += BATCH) {
          const slice = upserts.slice(i, i + BATCH);
          const { error } = await sb.from("app_state").upsert(slice);
          if (error) throw error;
        }
        // Nettoyer les anciens chunks orphelins
        for (const t of Object.values(s.tables)) {
          const nChunks = Math.max(1, Math.ceil((t.rows || []).length / CHUNK_ROWS));
          await sb.from("app_state").delete().like("key", `rows:${t.id}:%`).gte("key", `rows:${t.id}:${nChunks}`);
        }
        _showSyncOk();
      } catch (e) {
        console.error("Supabase save error", e);
        _showSyncError(e?.message || String(e));
      }
    })
    .catch((e) => { console.error("saveSchema error", e); });
  return _saveQueue;
}

function _showSyncing() {
  const el = document.getElementById("syncStatus");
  if (!el) return;
  el.textContent = "Synchronisation…";
  el.className = "text-xs text-zinc-500";
}
function _showSyncOk() {
  const el = document.getElementById("syncStatus");
  if (!el) return;
  el.textContent = "✓ Synchronisé";
  el.className = "text-xs text-emerald-600";
}
function _showSyncError(msg) {
  const el = document.getElementById("syncStatus");
  if (!el) return;
  el.textContent = "⚠ Sync échouée";
  el.title = msg;
  el.className = "text-xs text-amber-600";
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
