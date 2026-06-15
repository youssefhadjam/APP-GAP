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
  const { data: mainRow, error: mainErr } = await sb.from("app_state").select("data").eq("key", "main").maybeSingle();
  if (mainErr) { console.warn("Supabase main load error", mainErr); return null; }
  if (!mainRow || !mainRow.data) return null;
  const norm = _normalize(mainRow.data);

  const tableList = Object.values(norm.tables);
  // Fetch chunks de chaque table en parallèle
  await Promise.all(tableList.map(async (t) => {
    t.rows = [];
    const PAGE = 5;
    let from = 0;
    while (true) {
      const to = from + PAGE - 1;
      const { data: page, error } = await sb
        .from("app_state")
        .select("key,data")
        .like("key", `rows:${t.id}:%`)
        .order("key", { ascending: true })
        .range(from, to);
      if (error) { console.warn("chunk load error", error); break; }
      if (!page || page.length === 0) break;
      const sorted = page
        .map((r) => ({ idx: parseInt(r.key.split(":").pop(), 10), data: r.data }))
        .sort((a, b) => a.idx - b.idx);
      for (const c of sorted) {
        if (c.data && Array.isArray(c.data.chunk)) t.rows.push(...c.data.chunk);
      }
      if (page.length < PAGE) break;
      from += PAGE;
    }
  }));
  return norm;
}

async function loadSchema() {
  // Lit le cache pour fallback offline
  let local = null;
  try { local = await idbKeyval.get(STORE_KEY); } catch {}
  if (!local) {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) { local = JSON.parse(raw); localStorage.removeItem(STORE_KEY); }
    } catch {}
  }

  // Si Supabase répond, c'est la source de vérité
  try {
    const remote = await _fetchSchemaRemote();
    if (remote) {
      try { await idbKeyval.set(STORE_KEY, remote); } catch {}
      return remote;
    }
  } catch (e) { console.warn("Supabase load failed, fallback IDB", e); }

  // Fallback : IDB cache si pas de réseau
  if (local) return _normalize(local);
  return defaultSchema();
}

function _backgroundRefresh() {
  _fetchSchemaRemote().then((remote) => {
    if (remote) idbKeyval.set(STORE_KEY, remote).catch(() => {});
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
  _isDirty = true;
  try { idbKeyval.set(STORE_KEY, s); } catch (e) { console.warn("IDB save failed", e); }
  clearTimeout(_saveTimer);
  _saveTimer = setTimeout(() => { _pushRemote(s); }, 1200);
}

let _lastSavedSchema = null;
const _lastPushed = {}; // key -> hash
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
        const main = {
          ..._normalize(s),
          tables: Object.fromEntries(Object.entries(s.tables).map(([id, t]) => [id, {
            id: t.id, name: t.name, columns: t.columns, _rowsChunks: Math.ceil((t.rows || []).length / CHUNK_ROWS)
          }])),
        };
        const allPayloads = [{ key: "main", data: main }];
        for (const t of Object.values(s.tables)) {
          const rows = t.rows || [];
          const nChunks = Math.max(1, Math.ceil(rows.length / CHUNK_ROWS));
          for (let i = 0; i < nChunks; i++) {
            const chunk = rows.slice(i * CHUNK_ROWS, (i + 1) * CHUNK_ROWS);
            allPayloads.push({ key: `rows:${t.id}:${i}`, data: { chunk } });
          }
        }

        // Filtrer ceux qui ont changé depuis le dernier push
        const dirty = allPayloads.filter((p) => {
          const h = _hash(p.data);
          if (_lastPushed[p.key] === h) return false;
          p._h = h;
          return true;
        });

        if (dirty.length === 0) { _isDirty = false; _showSyncOk(); return; }

        const total = dirty.length;
        let done = 0;
        _showSyncing(`0/${total}`);

        const PAR = 6;
        async function pushOne(payload, attempt = 0) {
          const { error } = await sb.from("app_state").upsert({ key: payload.key, data: payload.data, updated_at: new Date().toISOString() });
          if (error) {
            if (attempt < 3) {
              await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
              return pushOne(payload, attempt + 1);
            }
            throw error;
          }
          _lastPushed[payload.key] = payload._h;
        }
        async function worker(queue) {
          while (queue.length) {
            const p = queue.shift();
            if (!p) return;
            await pushOne(p);
            done++;
            _showSyncing(`${done}/${total}`);
          }
        }
        const queue = dirty.slice();
        await Promise.all(Array.from({ length: PAR }, () => worker(queue)));

        // Nettoyer orphelins (chunks au-delà du nouveau nombre)
        try {
          for (const t of Object.values(s.tables)) {
            const nChunks = Math.max(1, Math.ceil((t.rows || []).length / CHUNK_ROWS));
            await sb.from("app_state").delete().like("key", `rows:${t.id}:%`).gte("key", `rows:${t.id}:${nChunks}`);
          }
        } catch {}
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
