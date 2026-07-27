import { useState, useEffect } from "react";
import PageMeta from "../../components/common/PageMeta";
import {
  PageWrap, KpiCard, KpiGrid, SectionCard, Table, Badge, Btn, StatusDot,
} from "../../components/ui/InprorComponents";
import { useClientScope } from "../../context/AuthContext";
import { supabase } from "../../lib/supabase";

type Status   = "backlog" | "em_andamento" | "aguardando" | "concluida";
type Priority = "baixa" | "media" | "alta" | "urgente";

interface TaskRow {
  id: string; client_id: string | null; project_id: string | null;
  title: string; description: string | null;
  status: Status; priority: Priority;
  due_date: string | null; assigned_to: string | null;
  created_at: string;
}

interface ProjectLite { id: string; name: string; status: string; }

const COLUMNS: { key: Status; label: string }[] = [
  { key: "backlog",      label: "Backlog" },
  { key: "em_andamento", label: "Em andamento" },
  { key: "aguardando",   label: "Aguardando cliente" },
  { key: "concluida",    label: "Concluida" },
];
const colIndex = (s: Status) => COLUMNS.findIndex(c => c.key === s);

const PRIO: Record<Priority, { label: string; color: "green" | "default" | "yellow" | "red" }> = {
  baixa:   { label: "Baixa",   color: "green" },
  media:   { label: "Media",   color: "default" },
  alta:    { label: "Alta",    color: "yellow" },
  urgente: { label: "Urgente", color: "red" },
};

const today = () => new Date().toISOString().slice(0, 10);
const fmtDate = (d: string) => {
  const [y, m, dd] = d.split("-");
  return `${dd}/${m}/${y.slice(2)}`;
};

const emptyForm = () => ({
  title: "", description: "",
  status: "backlog" as Status, priority: "media" as Priority,
  due_date: "", assigned_to: "", project_id: "",
});

type ViewMode = "kanban" | "lista";

export default function Tarefas() {
  const { scopedClientId, authLoading, isAdmin, adminClientId, setAdminClientId, adminClients } = useClientScope();
  const [tasks, setTasks]     = useState<TaskRow[]>([]);
  const [projects, setProjects] = useState<ProjectLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView]       = useState<ViewMode>("kanban");
  const [projFilter, setProjFilter] = useState<string>("todos");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm]       = useState(emptyForm());
  const [saving, setSaving]   = useState(false);

  const projectName = (id: string | null) =>
    id ? (projects.find(p => p.id === id)?.name ?? "Projeto") : null;

  // Admin: filtra por cliente selecionado (ou vazio = todos, incluindo internas)
  const clientName = (id: string | null) =>
    id ? (adminClients.find(c => c.id === id)?.name ?? "Cliente") : "Interno";

  useEffect(() => {
    if (authLoading) return;
    setLoading(true);
    let q  = supabase.from("tasks").select("*").order("created_at", { ascending: false });
    let pq = supabase.from("projects").select("id,name,status").order("created_at", { ascending: false });
    if (!isAdmin && scopedClientId) {
      q = q.eq("client_id", scopedClientId);
      pq = pq.eq("client_id", scopedClientId);
    } else if (isAdmin && adminClientId) {
      q = q.eq("client_id", adminClientId);
      pq = pq.eq("client_id", adminClientId);
    }
    Promise.all([q, pq]).then(([t, p]) => {
      setTasks((t.data as TaskRow[]) ?? []);
      setProjects((p.data as ProjectLite[]) ?? []);
      setLoading(false);
    });
  }, [scopedClientId, adminClientId, isAdmin, authLoading]);

  // Filtro por projeto: todos, um projeto especifico, ou avulsas (sem projeto)
  const visible = projFilter === "todos"
    ? tasks
    : projFilter === "sem"
      ? tasks.filter(t => !t.project_id)
      : tasks.filter(t => t.project_id === projFilter);

  const total     = visible.length;
  const andamento = visible.filter(t => t.status === "em_andamento").length;
  const aguard    = visible.filter(t => t.status === "aguardando").length;
  const concl     = visible.filter(t => t.status === "concluida").length;

  async function move(id: string, dir: -1 | 1) {
    const t = tasks.find(x => x.id === id);
    if (!t) return;
    const next = COLUMNS[colIndex(t.status) + dir];
    if (!next) return;
    setTasks(prev => prev.map(x => x.id === id ? { ...x, status: next.key } : x));
    await supabase.from("tasks").update({ status: next.key }).eq("id", id);
  }

  async function setStatus(id: string, s: Status) {
    setTasks(prev => prev.map(x => x.id === id ? { ...x, status: s } : x));
    await supabase.from("tasks").update({ status: s }).eq("id", id);
  }

  async function handleSave() {
    setSaving(true);
    const target = isAdmin ? (adminClientId || null) : scopedClientId;
    const { data, error } = await supabase.from("tasks").insert({
      client_id: target,
      project_id: form.project_id || null,
      title: form.title,
      description: form.description || null,
      status: form.status,
      priority: form.priority,
      due_date: form.due_date || null,
      assigned_to: form.assigned_to || null,
    }).select().single();
    setSaving(false);
    if (!error && data) {
      setTasks(prev => [data as TaskRow, ...prev]);
      setShowForm(false);
      setForm(emptyForm());
    }
  }

  const f = (k: keyof ReturnType<typeof emptyForm>) =>
    (e: { target: { value: string } }) => setForm(prev => ({ ...prev, [k]: e.target.value }));

  function Card({ t }: { t: TaskRow }) {
    const overdue = t.due_date && t.due_date < today() && t.status !== "concluida";
    const idx = colIndex(t.status);
    return (
      <div className="border hairline rounded-lg p-3 bg-white dark:bg-[#11141b] shadow-sm flex flex-col gap-2">
        <div className="flex items-start justify-between gap-2">
          <span className="text-[13px] font-medium leading-snug">{t.title}</span>
          <Badge label={PRIO[t.priority].label} color={PRIO[t.priority].color} />
        </div>
        {t.description && (
          <p className="text-xs opacity-55 leading-relaxed line-clamp-2">{t.description}</p>
        )}
        {t.project_id && (
          <span className="text-[10px] font-medium px-2 py-0.5 rounded-full w-fit"
            style={{ background: "rgba(168,87,48,.12)", color: "var(--copper)" }}>
            {projectName(t.project_id)}
          </span>
        )}
        <div className="flex items-center gap-2 flex-wrap text-[11px] opacity-60">
          {isAdmin && (
            <span className="inline-flex items-center gap-1">
              <StatusDot status="neutral" />{clientName(t.client_id)}
            </span>
          )}
          {t.assigned_to && <span>{t.assigned_to}</span>}
          {t.due_date && (
            <span className="font-mono" style={overdue ? { color: "var(--bad)", fontWeight: 600 } : {}}>
              {fmtDate(t.due_date)}
            </span>
          )}
        </div>
        <div className="flex items-center justify-between pt-1">
          <button
            className="text-[11px] px-2 py-0.5 rounded border hairline disabled:opacity-25"
            disabled={idx === 0} onClick={() => move(t.id, -1)} aria-label="Voltar etapa"
          >‹</button>
          <span className="text-[10px] uppercase tracking-wide opacity-40">{COLUMNS[idx].label}</span>
          <button
            className="text-[11px] px-2 py-0.5 rounded border hairline disabled:opacity-25"
            disabled={idx === COLUMNS.length - 1} onClick={() => move(t.id, 1)} aria-label="Avancar etapa"
          >›</button>
        </div>
      </div>
    );
  }

  const tableRows = visible.map(t => [
    <Badge label={PRIO[t.priority].label} color={PRIO[t.priority].color} />,
    t.title,
    projectName(t.project_id) ?? <span className="opacity-35">-</span>,
    isAdmin ? clientName(t.client_id) : (t.assigned_to ?? "-"),
    t.due_date
      ? <span style={t.due_date < today() && t.status !== "concluida" ? { color: "var(--bad)", fontWeight: 600 } : {}}>{fmtDate(t.due_date)}</span>
      : "-",
    <select
      className="text-[11px] border hairline rounded px-1.5 py-0.5 bg-white dark:bg-[#11141b]"
      value={t.status} onChange={e => setStatus(t.id, e.target.value as Status)}
    >
      {COLUMNS.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
    </select>,
  ]);

  return (
    <>
      <PageMeta title="Tarefas | inProR" />
      <PageWrap
        title="Tarefas"
        subtitle="Gestao de atividades da agencia"
        action={
          <div className="flex items-center gap-2">
            {isAdmin && (
              <select className="text-xs border hairline rounded px-2 py-1.5 bg-white dark:bg-[#11141b]"
                value={adminClientId ?? ""} onChange={e => setAdminClientId(e.target.value || null)}>
                <option value="">Todos os clientes</option>
                {adminClients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            )}
            <Btn size="sm" onClick={() => setShowForm(v => !v)}>+ Nova tarefa</Btn>
          </div>
        }
      >
        <KpiGrid>
          <KpiCard label="Total"          value={total} />
          <KpiCard label="Em andamento"   value={andamento} />
          <KpiCard label="Aguardando"     value={aguard} />
          <KpiCard label="Concluidas"     value={concl} />
        </KpiGrid>

        {/* Filtro por projeto + view toggle */}
        <div className="flex items-start justify-between gap-3 flex-wrap mb-5">
          <div className="flex flex-wrap gap-2">
            <button className="chip"
              style={projFilter === "todos" ? { background: "var(--brand)", color: "white", borderColor: "var(--brand)" } : {}}
              onClick={() => setProjFilter("todos")}
            >
              Todas {tasks.length > 0 && <span className="opacity-70">{tasks.length}</span>}
            </button>
            {projects.map(p => {
              const n = tasks.filter(t => t.project_id === p.id).length;
              return (
                <button key={p.id} className="chip"
                  style={projFilter === p.id ? { background: "var(--copper)", color: "white", borderColor: "var(--copper)" } : {}}
                  onClick={() => setProjFilter(p.id)}
                >
                  {p.name} {n > 0 && <span className="opacity-70">{n}</span>}
                </button>
              );
            })}
            {tasks.some(t => !t.project_id) && (
              <button className="chip"
                style={projFilter === "sem" ? { background: "var(--ink)", color: "white", borderColor: "var(--ink)" } : {}}
                onClick={() => setProjFilter("sem")}
              >
                Avulsas <span className="opacity-70">{tasks.filter(t => !t.project_id).length}</span>
              </button>
            )}
          </div>
          <div className="flex gap-1 shrink-0">
            {(["kanban", "lista"] as ViewMode[]).map(v => (
              <button key={v}
                className="text-[11px] uppercase tracking-wide px-3 py-1.5 rounded-lg border hairline transition-colors"
                style={view === v ? { background: "var(--brand)", color: "white", borderColor: "var(--brand)" } : {}}
                onClick={() => setView(v)}
              >
                {v}
              </button>
            ))}
          </div>
        </div>

        {/* Add form */}
        {showForm && (
          <SectionCard title="Nova Tarefa" className="mb-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <label className="flex flex-col gap-1 col-span-2">
                <span className="text-[11px] opacity-55 uppercase tracking-wide">Titulo</span>
                <input className="text-sm border hairline rounded px-2 py-1.5 bg-white dark:bg-[#11141b]"
                  value={form.title} onChange={f("title")} placeholder="Descreva a tarefa" />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[11px] opacity-55 uppercase tracking-wide">Projeto</span>
                <select className="text-sm border hairline rounded px-2 py-1.5 bg-white dark:bg-[#11141b]"
                  value={form.project_id} onChange={f("project_id")}>
                  <option value="">Sem projeto</option>
                  {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[11px] opacity-55 uppercase tracking-wide">Prioridade</span>
                <select className="text-sm border hairline rounded px-2 py-1.5 bg-white dark:bg-[#11141b]"
                  value={form.priority} onChange={f("priority")}>
                  {(Object.keys(PRIO) as Priority[]).map(p => <option key={p} value={p}>{PRIO[p].label}</option>)}
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[11px] opacity-55 uppercase tracking-wide">Etapa</span>
                <select className="text-sm border hairline rounded px-2 py-1.5 bg-white dark:bg-[#11141b]"
                  value={form.status} onChange={f("status")}>
                  {COLUMNS.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[11px] opacity-55 uppercase tracking-wide">Prazo</span>
                <input type="date" className="text-sm border hairline rounded px-2 py-1.5 bg-white dark:bg-[#11141b]"
                  value={form.due_date} onChange={f("due_date")} />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[11px] opacity-55 uppercase tracking-wide">Responsavel</span>
                <input className="text-sm border hairline rounded px-2 py-1.5 bg-white dark:bg-[#11141b]"
                  value={form.assigned_to} onChange={f("assigned_to")} placeholder="Nome" />
              </label>
              <label className="flex flex-col gap-1 col-span-2 md:col-span-4">
                <span className="text-[11px] opacity-55 uppercase tracking-wide">Descricao</span>
                <textarea className="text-sm border hairline rounded px-2 py-1.5 bg-white dark:bg-[#11141b] resize-none" rows={2}
                  value={form.description} onChange={f("description")} placeholder="Detalhes (opcional)" />
              </label>
            </div>
            <div className="flex gap-2 mt-4">
              <Btn onClick={handleSave} disabled={saving || !form.title.trim()}>
                {saving ? "Salvando..." : "Salvar"}
              </Btn>
              <Btn variant="ghost" onClick={() => setShowForm(false)}>Cancelar</Btn>
            </div>
          </SectionCard>
        )}

        {loading ? (
          <p className="text-[13px] opacity-40 text-center py-16">Carregando...</p>
        ) : view === "kanban" ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            {COLUMNS.map(col => {
              const colTasks = visible.filter(t => t.status === col.key);
              return (
                <div key={col.key} className="flex flex-col gap-3">
                  <div className="flex items-center justify-between px-1">
                    <span className="font-semibold text-[13px]" style={{ color: "var(--brand)" }}>{col.label}</span>
                    <span className="font-mono text-xs opacity-40">{colTasks.length}</span>
                  </div>
                  <div className="flex flex-col gap-3 min-h-[60px]">
                    {colTasks.map(t => <Card key={t.id} t={t} />)}
                    {colTasks.length === 0 && (
                      <div className="border border-dashed hairline rounded-lg py-6 text-center text-[11px] opacity-30">
                        Vazio
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <SectionCard>
            <Table
              headers={["Prioridade", "Tarefa", "Projeto", isAdmin ? "Cliente" : "Responsavel", "Prazo", "Etapa"]}
              rows={tableRows}
              empty="Nenhuma tarefa cadastrada."
            />
          </SectionCard>
        )}
      </PageWrap>
    </>
  );
}
