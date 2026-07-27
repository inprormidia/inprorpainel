import { useState, useEffect } from "react";
import PageMeta from "../../components/common/PageMeta";
import {
  PageWrap, KpiCard, KpiGrid, SectionCard, Table, Badge, Btn, StatusDot, EmptyState,
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

interface ProjectLite { id: string; name: string; client_id: string | null; }

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
const PRIO_ORDER: Record<Priority, number> = { urgente: 0, alta: 1, media: 2, baixa: 3 };

const today = () => new Date().toISOString().slice(0, 10);
const fmtDate = (d: string) => {
  const [y, m, dd] = d.split("-");
  return `${dd}/${m}/${y.slice(2)}`;
};

const emptyForm = () => ({
  title: "", description: "",
  status: "backlog" as Status, priority: "media" as Priority,
  due_date: "", assigned_to: "", project_id: "", client_id: "",
});
type FormShape = ReturnType<typeof emptyForm>;

const formFromTask = (t: TaskRow): FormShape => ({
  title: t.title,
  description: t.description ?? "",
  status: t.status,
  priority: t.priority,
  due_date: t.due_date ?? "",
  assigned_to: t.assigned_to ?? "",
  project_id: t.project_id ?? "",
  client_id: t.client_id ?? "",
});

type ViewMode = "kanban" | "lista";

export default function Tarefas() {
  const { scopedClientId, authLoading, isAdmin, adminClientId, setAdminClientId, adminClients } = useClientScope();
  const [tasks, setTasks]       = useState<TaskRow[]>([]);
  const [projects, setProjects] = useState<ProjectLite[]>([]);
  const [loading, setLoading]   = useState(true);
  const [view, setView]         = useState<ViewMode>("kanban");
  const [projFilter, setProjFilter] = useState<string>("todos");

  const [showForm, setShowForm]   = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm]           = useState<FormShape>(emptyForm());
  const [saving, setSaving]       = useState(false);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [erro, setErro]           = useState<string | null>(null);

  const clientName = (id: string | null) =>
    id ? (adminClients.find(c => c.id === id)?.name ?? "Cliente") : "Interno";
  const projectName = (id: string | null) =>
    id ? (projects.find(p => p.id === id)?.name ?? "Projeto") : null;

  async function load() {
    setLoading(true);
    let q  = supabase.from("tasks").select("*").order("created_at", { ascending: false });
    let pq = supabase.from("projects").select("id,name,client_id").order("created_at", { ascending: false });
    if (!isAdmin && scopedClientId) {
      q = q.eq("client_id", scopedClientId);
      pq = pq.eq("client_id", scopedClientId);
    } else if (isAdmin && adminClientId) {
      q = q.eq("client_id", adminClientId);
      pq = pq.eq("client_id", adminClientId);
    }
    const [t, p] = await Promise.all([q, pq]);
    setTasks((t.data as TaskRow[]) ?? []);
    setProjects((p.data as ProjectLite[]) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    if (authLoading) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopedClientId, adminClientId, isAdmin, authLoading]);

  // Filtro por projeto: todos, um projeto especifico, ou avulsas
  const visible = projFilter === "todos"
    ? tasks
    : projFilter === "sem"
      ? tasks.filter(t => !t.project_id)
      : tasks.filter(t => t.project_id === projFilter);

  const total     = visible.length;
  const andamento = visible.filter(t => t.status === "em_andamento").length;
  const atrasadas = visible.filter(t => t.due_date && t.due_date < today() && t.status !== "concluida").length;
  const concl     = visible.filter(t => t.status === "concluida").length;

  // Dentro da coluna: urgentes primeiro, depois por prazo mais proximo
  const sortTasks = (list: TaskRow[]) => [...list].sort((a, b) => {
    const p = PRIO_ORDER[a.priority] - PRIO_ORDER[b.priority];
    if (p !== 0) return p;
    if (a.due_date && b.due_date) return a.due_date.localeCompare(b.due_date);
    if (a.due_date) return -1;
    if (b.due_date) return 1;
    return 0;
  });

  function openNew() {
    setEditingId(null);
    setForm({ ...emptyForm(), client_id: (isAdmin ? (adminClientId ?? "") : (scopedClientId ?? "")) });
    setErro(null);
    setShowForm(true);
  }

  function openEdit(t: TaskRow) {
    setEditingId(t.id);
    setForm(formFromTask(t));
    setErro(null);
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditingId(null);
    setForm(emptyForm());
    setErro(null);
  }

  async function move(id: string, dir: -1 | 1) {
    const t = tasks.find(x => x.id === id);
    if (!t) return;
    const next = COLUMNS[colIndex(t.status) + dir];
    if (!next) return;
    const prev = t.status;
    setTasks(cur => cur.map(x => x.id === id ? { ...x, status: next.key } : x));
    const { error } = await supabase.from("tasks").update({ status: next.key }).eq("id", id);
    if (error) {
      setTasks(cur => cur.map(x => x.id === id ? { ...x, status: prev } : x));
      setErro("Nao foi possivel mover a tarefa.");
    }
  }

  async function setStatus(id: string, s: Status) {
    const prev = tasks.find(x => x.id === id)?.status;
    setTasks(cur => cur.map(x => x.id === id ? { ...x, status: s } : x));
    const { error } = await supabase.from("tasks").update({ status: s }).eq("id", id);
    if (error && prev) {
      setTasks(cur => cur.map(x => x.id === id ? { ...x, status: prev } : x));
      setErro("Nao foi possivel alterar o status.");
    }
  }

  async function handleSave() {
    if (!form.title.trim()) return;
    setSaving(true);
    setErro(null);
    const payload = {
      client_id: form.client_id || null,
      project_id: form.project_id || null,
      title: form.title.trim(),
      description: form.description.trim() || null,
      status: form.status,
      priority: form.priority,
      due_date: form.due_date || null,
      assigned_to: form.assigned_to.trim() || null,
    };

    if (editingId) {
      const { data, error } = await supabase.from("tasks")
        .update(payload).eq("id", editingId).select().single();
      setSaving(false);
      if (error) { setErro("Erro ao salvar: " + error.message); return; }
      setTasks(cur => cur.map(x => x.id === editingId ? (data as TaskRow) : x));
    } else {
      const { data, error } = await supabase.from("tasks")
        .insert(payload).select().single();
      setSaving(false);
      if (error) { setErro("Erro ao criar: " + error.message); return; }
      setTasks(cur => [data as TaskRow, ...cur]);
    }
    closeForm();
  }

  async function handleDelete(id: string) {
    const backup = tasks;
    setTasks(cur => cur.filter(x => x.id !== id));
    setConfirmId(null);
    const { error } = await supabase.from("tasks").delete().eq("id", id);
    if (error) {
      setTasks(backup);
      setErro("Nao foi possivel excluir a tarefa.");
    }
  }

  const f = (k: keyof FormShape) =>
    (e: { target: { value: string } }) => setForm(prev => ({ ...prev, [k]: e.target.value }));

  function Card({ t }: { t: TaskRow }) {
    const overdue = t.due_date && t.due_date < today() && t.status !== "concluida";
    const idx = colIndex(t.status);
    const confirming = confirmId === t.id;
    return (
      <div className="border hairline rounded-lg p-3 bg-white dark:bg-[#11141b] shadow-sm flex flex-col gap-2">
        <div className="flex items-start justify-between gap-2">
          <button className="text-[13px] font-medium leading-snug text-left hover:underline underline-offset-2"
            onClick={() => openEdit(t)} title="Editar tarefa">
            {t.title}
          </button>
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

        <div className="flex items-center justify-between pt-1 gap-2 border-t hairline mt-0.5">
          <button
            className="text-sm w-9 h-8 flex items-center justify-center rounded border hairline disabled:opacity-25 shrink-0"
            disabled={idx === 0} onClick={() => move(t.id, -1)} aria-label="Voltar etapa"
          >‹</button>

          {confirming ? (
            <span className="flex items-center gap-1.5">
              <button className="text-[11px] font-semibold px-2.5 py-1.5 rounded"
                style={{ background: "var(--bad)", color: "white" }}
                onClick={() => handleDelete(t.id)}>Excluir</button>
              <button className="text-[11px] px-2.5 py-1.5 rounded border hairline"
                onClick={() => setConfirmId(null)}>Nao</button>
            </span>
          ) : (
            <span className="flex items-center gap-1">
              <button className="text-[10px] uppercase tracking-wide opacity-45 hover:opacity-90 px-2.5 py-1.5"
                onClick={() => openEdit(t)}>Editar</button>
              <button className="text-[10px] uppercase tracking-wide opacity-45 hover:opacity-100 px-2.5 py-1.5"
                style={{ color: "var(--bad)" }}
                onClick={() => setConfirmId(t.id)}>Excluir</button>
            </span>
          )}

          <button
            className="text-sm w-9 h-8 flex items-center justify-center rounded border hairline disabled:opacity-25 shrink-0"
            disabled={idx === COLUMNS.length - 1} onClick={() => move(t.id, 1)} aria-label="Avancar etapa"
          >›</button>
        </div>
      </div>
    );
  }

  const tableRows = sortTasks(visible).map(t => [
    <Badge label={PRIO[t.priority].label} color={PRIO[t.priority].color} />,
    <button className="text-left hover:underline underline-offset-2" onClick={() => openEdit(t)}>
      {t.title}
    </button>,
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
    confirmId === t.id ? (
      <span className="flex items-center gap-1.5">
        <button className="text-[10px] font-semibold px-2 py-0.5 rounded"
          style={{ background: "var(--bad)", color: "white" }}
          onClick={() => handleDelete(t.id)}>Sim</button>
        <button className="text-[10px] px-1.5 py-0.5 rounded border hairline"
          onClick={() => setConfirmId(null)}>Nao</button>
      </span>
    ) : (
      <button className="text-[11px] opacity-45 hover:opacity-100" style={{ color: "var(--bad)" }}
        onClick={() => setConfirmId(t.id)}>Excluir</button>
    ),
  ]);

  // Projetos oferecidos no form seguem o cliente escolhido
  const formProjects = form.client_id
    ? projects.filter(p => p.client_id === form.client_id || !p.client_id)
    : projects;

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
            <Btn size="sm" onClick={() => showForm ? closeForm() : openNew()}>
              {showForm ? "Fechar" : "+ Nova tarefa"}
            </Btn>
          </div>
        }
      >
        {erro && (
          <div className="mb-4 border hairline rounded-lg px-4 py-2.5 flex items-center justify-between gap-3"
            style={{ borderColor: "var(--bad)" }}>
            <span className="text-[13px]" style={{ color: "var(--bad)" }}>{erro}</span>
            <button className="text-[11px] opacity-60" onClick={() => setErro(null)}>fechar</button>
          </div>
        )}

        <KpiGrid>
          <KpiCard label="Total"        value={total} />
          <KpiCard label="Em andamento" value={andamento} />
          <KpiCard label="Atrasadas"    value={atrasadas} />
          <KpiCard label="Concluidas"   value={concl} />
        </KpiGrid>

        {/* Filtro por projeto + view toggle */}
        <div className="flex items-start justify-between gap-3 flex-wrap mb-5">
          <div className="filter-row">
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

        {/* Form de criar / editar */}
        {showForm && (
          <SectionCard title={editingId ? "Editar Tarefa" : "Nova Tarefa"} className="mb-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
              <label className="flex flex-col gap-1 col-span-2">
                <span className="text-[11px] opacity-55 uppercase tracking-wide">Titulo</span>
                <input className="text-sm border hairline rounded px-2 py-1.5 bg-white dark:bg-[#11141b]"
                  value={form.title} onChange={f("title")} placeholder="Descreva a tarefa" autoFocus />
              </label>

              {isAdmin && (
                <label className="flex flex-col gap-1">
                  <span className="text-[11px] opacity-55 uppercase tracking-wide">Cliente</span>
                  <select className="text-sm border hairline rounded px-2 py-1.5 bg-white dark:bg-[#11141b]"
                    value={form.client_id} onChange={f("client_id")}>
                    <option value="">Interno (agencia)</option>
                    {adminClients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </label>
              )}

              <label className="flex flex-col gap-1">
                <span className="text-[11px] opacity-55 uppercase tracking-wide">Projeto</span>
                <select className="text-sm border hairline rounded px-2 py-1.5 bg-white dark:bg-[#11141b]"
                  value={form.project_id} onChange={f("project_id")}>
                  <option value="">Sem projeto</option>
                  {formProjects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
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
                <textarea className="text-sm border hairline rounded px-2 py-1.5 bg-white dark:bg-[#11141b] resize-none leading-relaxed"
                  rows={2} value={form.description} onChange={f("description")} placeholder="Detalhes (opcional)" />
              </label>
            </div>
            <div className="flex gap-2 mt-4">
              <Btn onClick={handleSave} disabled={saving || !form.title.trim()}>
                {saving ? "Salvando..." : editingId ? "Salvar alteracoes" : "Criar tarefa"}
              </Btn>
              <Btn variant="ghost" onClick={closeForm}>Cancelar</Btn>
            </div>
          </SectionCard>
        )}

        {loading ? (
          <p className="text-[13px] opacity-40 text-center py-16">Carregando...</p>
        ) : tasks.length === 0 ? (
          <SectionCard>
            <EmptyState
              title="Nenhuma tarefa"
              sub="Crie a primeira tarefa clicando em Nova tarefa."
              action={<Btn size="sm" onClick={openNew}>+ Nova tarefa</Btn>}
            />
          </SectionCard>
        ) : view === "kanban" ? (
          // Mobile: colunas deslizam na horizontal, preservando a leitura de kanban
          <div className="flex gap-3 overflow-x-auto -mx-4 px-4 pb-2 snap-x snap-mandatory
                          md:grid md:grid-cols-2 xl:grid-cols-4 md:gap-4 md:overflow-visible md:mx-0 md:px-0 md:pb-0">
            {COLUMNS.map(col => {
              const colTasks = sortTasks(visible.filter(t => t.status === col.key));
              return (
                <div key={col.key} className="flex flex-col gap-3 w-[82vw] shrink-0 snap-start md:w-auto md:shrink">
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
              headers={["Prioridade", "Tarefa", "Projeto", isAdmin ? "Cliente" : "Responsavel", "Prazo", "Etapa", ""]}
              rows={tableRows}
              empty="Nenhuma tarefa neste filtro."
            />
          </SectionCard>
        )}
      </PageWrap>
    </>
  );
}
