// Tipos, constantes e helpers compartilhados entre a lista e o detalhe de tarefas.

export type Status   = "backlog" | "em_andamento" | "aguardando" | "concluida";
export type Priority = "baixa" | "media" | "alta" | "urgente";

export interface TaskRow {
  id: string; client_id: string | null; project_id: string | null;
  department_id: string | null;
  title: string; description: string | null;
  status: Status; priority: Priority;
  due_date: string | null; assigned_to: string | null; assignee_id: string | null;
  created_at: string; updated_at?: string | null; completed_at?: string | null;
  repeat_rule?: RepeatRule | null; repeat_until?: string | null;
  parent_id?: string | null;
}

export type RepeatRule = "diaria" | "semanal" | "quinzenal" | "mensal" | "anual";

export const REPEAT_OPTIONS: { key: RepeatRule; label: string }[] = [
  { key: "diaria",    label: "Todo dia" },
  { key: "semanal",   label: "Toda semana" },
  { key: "quinzenal", label: "A cada 15 dias" },
  { key: "mensal",    label: "Todo mes" },
  { key: "anual",     label: "Todo ano" },
];

export const repeatLabel = (r?: RepeatRule | null) =>
  REPEAT_OPTIONS.find(o => o.key === r)?.label ?? null;

export interface ProjectLite { id: string; name: string; client_id: string | null; }
export interface DeptLite { id: string; name: string; color: string; ordem: number; active: boolean; }

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

// Versao curta para a tabela: a cor vermelha ja comunica o atraso,
// entao a palavra "atrasada" so ocupava espaco da coluna.
export function dueLabelCurto(due: string, status: Status): string {
  if (status === "concluida") return fmtDate(due);
  const d = daysLeft(due);
  if (d < 0)   return `${fmtDate(due)} (${Math.abs(d)}d)`;
  if (d === 0) return `${fmtDate(due)} (hoje)`;
  return `${fmtDate(due)} (${d}d)`;
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
  | "title" | "status" | "priority" | "department" | "project" | "client"
  | "assigned_to" | "due_date" | "created_at";

// width mantem as colunas estaveis enquanto os campos sao editados
export const ALL_COLUMNS: {
  key: ColKey; label: string; sortable: boolean; adminOnly?: boolean; width?: string;
}[] = [
  { key: "title",       label: "Tarefa",      sortable: true },
  // larguras medidas pelos nomes reais em uso, para nao cortar texto:
  // "Aguardando cliente", "Conteudo e Social Media", "Estacao Granada Aricanduva"
  // sem width, a coluna Tarefa fica com o espaco que sobrar
  { key: "status",      label: "Etapa",       sortable: true, width: "148px" },
  { key: "priority",    label: "Prioridade",  sortable: true, width: "108px" },
  { key: "department",  label: "Departamento", sortable: true, width: "206px" },
  { key: "project",     label: "Projeto",     sortable: true, width: "180px" },
  { key: "client",      label: "Cliente",     sortable: true, adminOnly: true, width: "195px" },
  { key: "assigned_to", label: "Responsavel", sortable: true, width: "96px" },
  { key: "due_date",    label: "Prazo",       sortable: true, width: "150px" },
  { key: "created_at",  label: "Criada em",   sortable: true, width: "104px" },
];

export type GroupBy = "none" | "status" | "priority" | "department" | "project" | "client" | "assigned_to";

export const GROUP_OPTIONS: { key: GroupBy; label: string; adminOnly?: boolean }[] = [
  { key: "none",        label: "Sem agrupamento" },
  { key: "status",      label: "Etapa" },
  { key: "priority",    label: "Prioridade" },
  { key: "department",  label: "Departamento" },
  { key: "project",     label: "Projeto" },
  { key: "client",      label: "Cliente", adminOnly: true },
  { key: "assigned_to", label: "Responsavel" },
];

export interface Filters {
  search: string;
  status: Status[];
  priority: Priority[];
  department: string; // "todos" | "sem" | department_id
  project: string;   // "todos" | "sem" | project_id
  client: string;    // "todos" | "interno" | client_id
  assigned: string;  // "todos" | "sem" | "eu" | team_member.id
  overdue: boolean;
}

export interface ViewConfig {
  mode: "lista" | "quadro";
  columns: ColKey[];          // visiveis, na ordem escolhida
  sortBy: ColKey;
  sortDir: "asc" | "desc";
  groupBy: GroupBy;
  filters: Filters;
  // concluidas saem da lista por padrao e ficam num grupo recolhido
  ocultarConcluidas: boolean;
  // quantos dias de concluidas manter a vista; 0 = nenhuma
  diasConcluidas: number;
}

export const emptyFilters = (): Filters => ({
  search: "", status: [], priority: [], department: "todos",
  project: "todos", client: "todos", assigned: "todos", overdue: false,
});

export const defaultView = (): ViewConfig => ({
  mode: "lista",
  columns: ["title", "status", "priority", "department", "due_date", "assigned_to"],
  sortBy: "due_date",
  sortDir: "asc",
  groupBy: "department",
  filters: emptyFilters(),
  ocultarConcluidas: true,
  diasConcluidas: 7,
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

// Concluida ha mais de N dias sai da vista principal
export function concluidaRecente(t: TaskRow, dias: number): boolean {
  if (t.status !== "concluida") return true;
  if (dias <= 0) return false;
  const ref = t.completed_at ?? t.updated_at ?? t.created_at;
  if (!ref) return false;
  const ms = Date.now() - new Date(ref).getTime();
  return ms <= dias * 86400000;
}

export function countActiveFilters(f: Filters): number {
  let n = 0;
  if (f.search.trim()) n++;
  if (f.status.length) n++;
  if (f.priority.length) n++;
  if (f.department !== "todos") n++;
  if (f.project !== "todos") n++;
  if (f.client !== "todos") n++;
  if (f.assigned !== "todos") n++;
  if (f.overdue) n++;
  return n;
}
