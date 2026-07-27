// Tipos, constantes e helpers compartilhados entre a lista e o detalhe de tarefas.

export type Status   = "backlog" | "em_andamento" | "aguardando" | "concluida";
export type Priority = "baixa" | "media" | "alta" | "urgente";

export interface TaskRow {
  id: string; client_id: string | null; project_id: string | null;
  title: string; description: string | null;
  status: Status; priority: Priority;
  due_date: string | null; assigned_to: string | null;
  created_at: string; updated_at?: string | null;
}

export interface ProjectLite { id: string; name: string; client_id: string | null; }

export const COLUMNS: { key: Status; label: string; short: string }[] = [
  { key: "backlog",      label: "Backlog",            short: "Backlog" },
  { key: "em_andamento", label: "Em andamento",       short: "Andamento" },
  { key: "aguardando",   label: "Aguardando cliente", short: "Aguardando" },
  { key: "concluida",    label: "Concluida",          short: "Concluida" },
];
export const colIndex = (s: Status) => COLUMNS.findIndex(c => c.key === s);
export const statusLabel = (s: Status) => COLUMNS.find(c => c.key === s)?.label ?? s;

export const PRIO: Record<Priority, { label: string; color: "green" | "default" | "yellow" | "red" }> = {
  baixa:   { label: "Baixa",   color: "green" },
  media:   { label: "Media",   color: "default" },
  alta:    { label: "Alta",    color: "yellow" },
  urgente: { label: "Urgente", color: "red" },
};
export const PRIO_ORDER: Record<Priority, number> = { urgente: 0, alta: 1, media: 2, baixa: 3 };
export const PRIORITIES = Object.keys(PRIO) as Priority[];

export const today = () => new Date().toISOString().slice(0, 10);

export const fmtDate = (d: string) => {
  const [y, m, dd] = d.split("-");
  return `${dd}/${m}/${y.slice(2)}`;
};

export const fmtDateLong = (d: string) => {
  const [y, m, dd] = d.split("-");
  return new Date(Number(y), Number(m) - 1, Number(dd))
    .toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
};

export const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

export const isOverdue = (t: TaskRow) =>
  !!t.due_date && t.due_date < today() && t.status !== "concluida";

// Dias ate o prazo. Negativo = atrasado.
export function daysLeft(due: string): number {
  const ms = new Date(due + "T00:00:00").getTime() - new Date(today() + "T00:00:00").getTime();
  return Math.round(ms / 86400000);
}

export function dueLabel(due: string, status: Status): string {
  if (status === "concluida") return fmtDate(due);
  const d = daysLeft(due);
  if (d < 0)  return `${fmtDate(due)} (${Math.abs(d)}d atrasada)`;
  if (d === 0) return `${fmtDate(due)} (hoje)`;
  if (d === 1) return `${fmtDate(due)} (amanha)`;
  return `${fmtDate(due)} (${d}d)`;
}

// ── Configuracao de visualizacao (estilo Asana) ────────────────

export type ColKey =
  | "title" | "status" | "priority" | "project" | "client"
  | "assigned_to" | "due_date" | "created_at";

export const ALL_COLUMNS: { key: ColKey; label: string; sortable: boolean; adminOnly?: boolean }[] = [
  { key: "title",       label: "Tarefa",      sortable: true },
  { key: "status",      label: "Etapa",       sortable: true },
  { key: "priority",    label: "Prioridade",  sortable: true },
  { key: "project",     label: "Projeto",     sortable: true },
  { key: "client",      label: "Cliente",     sortable: true, adminOnly: true },
  { key: "assigned_to", label: "Responsavel", sortable: true },
  { key: "due_date",    label: "Prazo",       sortable: true },
  { key: "created_at",  label: "Criada em",   sortable: true },
];

export type GroupBy = "none" | "status" | "priority" | "project" | "client" | "assigned_to";

export const GROUP_OPTIONS: { key: GroupBy; label: string; adminOnly?: boolean }[] = [
  { key: "none",        label: "Sem agrupamento" },
  { key: "status",      label: "Etapa" },
  { key: "priority",    label: "Prioridade" },
  { key: "project",     label: "Projeto" },
  { key: "client",      label: "Cliente", adminOnly: true },
  { key: "assigned_to", label: "Responsavel" },
];

export interface Filters {
  search: string;
  status: Status[];
  priority: Priority[];
  project: string;   // "todos" | "sem" | project_id
  client: string;    // "todos" | "interno" | client_id
  assigned: string;  // "todos" | "sem" | nome
  overdue: boolean;
}

export interface ViewConfig {
  mode: "lista" | "quadro";
  columns: ColKey[];          // visiveis, na ordem escolhida
  sortBy: ColKey;
  sortDir: "asc" | "desc";
  groupBy: GroupBy;
  filters: Filters;
}

export const emptyFilters = (): Filters => ({
  search: "", status: [], priority: [],
  project: "todos", client: "todos", assigned: "todos", overdue: false,
});

export const defaultView = (): ViewConfig => ({
  mode: "lista",
  columns: ["title", "status", "priority", "project", "due_date", "assigned_to"],
  sortBy: "due_date",
  sortDir: "asc",
  groupBy: "status",
  filters: emptyFilters(),
});

const STORAGE_KEY = "inpror.tarefas.view";

export function loadView(): ViewConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultView();
    const parsed = JSON.parse(raw) as Partial<ViewConfig>;
    const base = defaultView();
    return {
      ...base,
      ...parsed,
      filters: { ...base.filters, ...(parsed.filters ?? {}) },
      // descarta chaves de coluna desconhecidas de versoes anteriores
      columns: (parsed.columns ?? base.columns).filter(c =>
        ALL_COLUMNS.some(ac => ac.key === c)) as ColKey[],
    };
  } catch {
    return defaultView();
  }
}

export function saveView(v: ViewConfig) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(v)); } catch { /* storage indisponivel */ }
}

export function countActiveFilters(f: Filters): number {
  let n = 0;
  if (f.search.trim()) n++;
  if (f.status.length) n++;
  if (f.priority.length) n++;
  if (f.project !== "todos") n++;
  if (f.client !== "todos") n++;
  if (f.assigned !== "todos") n++;
  if (f.overdue) n++;
  return n;
}
