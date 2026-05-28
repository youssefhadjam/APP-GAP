// Schéma global, stocké dans localStorage.
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

const COLUMN_TYPES = ["texte", "nombre", "date", "booléen"];
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
  return { tables: {}, relations: [], moduleConfigs: {} };
}

function loadSchema() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return defaultSchema();
    const parsed = JSON.parse(raw);
    return {
      tables: parsed.tables || {},
      relations: parsed.relations || [],
      moduleConfigs: parsed.moduleConfigs || {},
    };
  } catch {
    return defaultSchema();
  }
}

function saveSchema(s) {
  localStorage.setItem(STORE_KEY, JSON.stringify(s));
}

function uid(prefix) {
  return (
    (prefix || "id") +
    "_" +
    Math.random().toString(36).slice(2, 9) +
    Date.now().toString(36).slice(-3)
  );
}

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
