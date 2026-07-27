import { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import PageMeta from "../../components/common/PageMeta";
import {
  PageWrap, KpiCard, KpiGrid, SectionCard, Badge, Btn, EmptyState, StatusDot,
} from "../../components/ui/InprorComponents";
import { useClientScope } from "../../context/AuthContext";
import { supabase } from "../../lib/supabase";

type PStatus  = "planejamento" | "em_andamento" | "pausado" | "concluido" | "cancelado";
type Priority = "baixa" | "media" | "alta" | "urgente";
type TStatus  = "backlog" | "em_andamento" | "aguardando" | "concluida";

interface ProjectRow {
  id: string; client_id: string | null;
  name: string; description: string | null;
  status: PStatus; priority: Priority;
  start_date: string | null; due_date: string | null;
  budget: number | null; owner: string | null;
  created_at: string;
}

interface TaskLite {
  id: string; project_id: string | null;
  title: string; status: TStatus; priority: Priority;
  due_date: string | null; assigned_to: string | null;
}

const STATUS: { key: PStatus | "todos"; label: string; color: string }[] = [
  { key: "todos",        label: "Todos",        color: "var(--brand)" },
  { key: "planejamento", label: "Planejamento", color: "#64748b" },
  { key: "em_andamento", label: "Em andamento", color: "var(--ok)" },
  { key: "pausado",      label: "Pausado",      color: "var(--warn)" },
  { key: "concluido",    label: "Concluido",    color: "var(--copper)" },
  { key: "cancelado",    label: "Cancelado",    color: "var(--bad)" },
];
const sInfo = (k: string) => STATUS.find(s => s.key === k) ?? STATUS[0];

const PRIO: Record<Priority, { label: string; color: "green" | "default" | "yellow" | "red" }> = {
  baixa:   { label: "Baixa",   color: "green" },
  media:   { label: "Media",   color: "default" },
  alta:    { label: "Alta",    color: "yellow" },
  urgente: { label: "Urgente", color: "red" },
};

const TASK_LABEL: Record<TStatus, string> = {
  backlog: "Backlog", em_andamento: "Em andamento",
  aguardando: "Aguardando", concluida: "Concluida",
};

const today = () => new Date().toISOString().slice(0, 10);
const fmtDate = (d: string) => { const [y, m, dd] = d.split("-"); return `${dd}/${m}/${y.slice(2)}`; };
const fmtBrl  = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

// Dias restantes ate o prazo (negativo = atrasado)
function daysLeft(due: string): number {
  const ms = new Date(due + "T00:00:00").getTime() - new Date(today() + "T00:00:00").getTime();
  return Math.round(ms / 86400000);
}

function ProgressBar({ pct, color }: { pct: number; color: string }) {
  return (
    <div className="h-1.5 rounded-full overflow-hidden bg-black/[0.07] dark:bg-white/[0.08] w-full">
      <span className="block h-full rounded-full transition-all"
        style={{ width: `${Math.min(100, Math.max(0, pct))}%`, background: color }} />
    </div>
  );
}

const emptyForm = () => ({
  name: "", description: "",
  status: "planejamento" as PStatus, priority: "media" as Priority,
  start_date: today(), due_date: "", budget: "", owner: "",
});

export default function Projetos() {
  const navigate = useNavigate();
  const { scopedClientId, authLoading, isAdmin, adminClientId, setAdminClientId, adminClients } = useClientScope();
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [tasks, setTasks]       = useState<TaskLite[]>([]);
  const [loading, setLoading]   = useState(true);
  const [filter, setFilter]     = useState<PStatus | "todos">("todos");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm]         = useState(emptyForm());
  const [saving, setSaving]     = useState(false);
  const [openId, setOpenId]     = useState<string | null>(null);

  const clientName = (id: string | null) =>
    id ? (adminClients.find(c => c.id === id)?.name ?? "Cliente") : "Interno";

  useEffect(() => {
    if (authLoading) return;
    setLoading(true);
    let pq = supabase.from("projects").select("*").order("created_at", { ascending: false });
    let tq = supabase.from("tasks").select("id,project_id,title,status,priority,due_date,assigned_to");
    if (!isAdmin && scopedClientId) {
      pq = pq.eq("client_id", scopedClientId);
      tq = tq.eq("client_id", scopedClientId);
    } else if (isAdmin && adminClientId) {
      pq = pq.eq("client_id", adminClientId);
      tq = tq.eq("client_id", adminClientId);
    }
    Promise.all([pq, tq]).then(([p, t]) => {
      setProjects((p.data as ProjectRow[]) ?? []);
      setTasks((t.data as TaskLite[]) ?? []);
      setLoading(false);
    });
  }, [scopedClientId, adminClientId, isAdmin, authLoading]);

  // Estatisticas de tarefas por projeto
  const statsFor = (pid: string) => {
    const list = tasks.filter(t => t.project_id === pid);
    const done = list.filter(t => t.status === "concluida").length;
    return { total: list.length, done, pct: list.length ? (done / list.length) * 100 : 0, list };
  };

  const filtered = filter === "todos" ? projects : projects.filter(p => p.status === filter);

  const ativos     = projects.filter(p => p.status === "em_andamento").length;
  const concluidos = projects.filter(p => p.status === "concluido").length;
  const atrasados  = projects.filter(p =>
    p.due_date && p.due_date < today() && p.status !== "concluido" && p.status !== "cancelado").length;
  const orcamento  = projects
    .filter(p => p.status !== "cancelado")
    .reduce((s, p) => s + (p.budget ?? 0), 0);

  async function changeStatus(id: string, s: PStatus) {
    setProjects(prev => prev.map(p => p.id === id ? { ...p, status: s } : p));
    await supabase.from("projects").update({ status: s }).eq("id", id);
  }

  async function handleSave() {
    setSaving(true);
    const target = isAdmin ? (adminClientId || null) : scopedClientId;
    const { data, error } = await supabase.from("projects").insert({
      client_id: target,
      name: form.name,
      description: form.description || null,
      status: form.status,
      priority: form.priority,
      start_date: form.start_date || null,
      due_date: form.due_date || null,
      budget: form.budget ? Number(form.budget) : null,
      owner: form.owner || null,
    }).select().single();
    setSaving(false);
    if (!error && data) {
      setProjects(prev => [data as ProjectRow, ...prev]);
      setShowForm(false);
      setForm(emptyForm());
    }
  }

  const f = (k: keyof ReturnType<typeof emptyForm>) =>
    (e: { target: { value: string } }) => setForm(prev => ({ ...prev, [k]: e.target.value }));

  function ProjectCard({ p }: { p: ProjectRow }) {
    const { total, done, pct, list } = statsFor(p.id);
    const info = sInfo(p.status);
    const open = openId === p.id;
    const dl = p.due_date ? daysLeft(p.due_date) : null;
    const late = dl !== null && dl < 0 && p.status !== "concluido" && p.status !== "cancelado";

    return (
      <div className="border hairline rounded-xl bg-white dark:bg-[#11141b] shadow-sm overflow-hidden">
        <div className="p-4 flex flex-col gap-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[15px] font-semibold leading-snug">{p.name}</span>
                <Badge label={PRIO[p.priority].label} color={PRIO[p.priority].color} />
              </div>
              <div className="text-[11px] opacity-55 mt-1 flex items-center gap-2 flex-wrap">
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full inline-block" style={{ background: info.color }} />
                  {info.label}
                </span>
                {isAdmin && <span>{clientName(p.client_id)}</span>}
                {p.owner && <span>{p.owner}</span>}
              </div>
            </div>
            <select
              className="text-[11px] border hairline rounded px-1.5 py-1 bg-white dark:bg-[#11141b] shrink-0"
              value={p.status} onChange={e => changeStatus(p.id, e.target.value as PStatus)}
            >
              {STATUS.filter(s => s.key !== "todos").map(s =>
                <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
          </div>

          {p.description && (
            <p className="text-[13px] opacity-65 leading-relaxed">{p.description}</p>
          )}

          {/* Progresso */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between text-[11px]">
              <span className="opacity-55">
                {total > 0 ? `${done} de ${total} tarefas` : "Sem tarefas vinculadas"}
              </span>
              <span className="font-mono font-semibold tabular">{Math.round(pct)}%</span>
            </div>
            <ProgressBar pct={pct} color={info.color} />
          </div>

          {/* Datas e orcamento */}
          <div className="flex items-center gap-4 flex-wrap text-[11px]">
            {p.start_date && (
              <span className="opacity-55">Inicio <span className="font-mono">{fmtDate(p.start_date)}</span></span>
            )}
            {p.due_date && (
              <span style={late ? { color: "var(--bad)", fontWeight: 600 } : { opacity: 0.55 }}>
                Prazo <span className="font-mono">{fmtDate(p.due_date)}</span>
                {dl !== null && (
                  <span className="ml-1">
                    {late ? `(${Math.abs(dl)}d atrasado)` : dl === 0 ? "(hoje)" : `(${dl}d)`}
                  </span>
                )}
              </span>
            )}
            {p.budget != null && (
              <span className="opacity-55">Orcamento <span className="font-mono">{fmtBrl(p.budget)}</span></span>
            )}
          </div>

          {total > 0 && (
            <button
              className="text-[12px] font-semibold text-left underline underline-offset-2 w-fit"
              style={{ color: "var(--copper)" }}
              onClick={() => setOpenId(open ? null : p.id)}
            >
              {open ? "Ocultar tarefas" : `Ver ${total} tarefas`}
            </button>
          )}
        </div>

        {/* Drill-down de tarefas */}
        {open && (
          <div className="border-t hairline bg-black/[0.015] dark:bg-white/[0.02] px-4 py-3 flex flex-col">
            {list.map(t => {
              const tLate = t.due_date && t.due_date < today() && t.status !== "concluida";
              return (
                <div key={t.id} className="flex items-center justify-between gap-3 py-1.5 border-b hairline last:border-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <StatusDot status={
                      t.status === "concluida" ? "ok"
                      : t.status === "em_andamento" ? "warn"
                      : "neutral"} />
                    <span className={`text-[13px] truncate ${t.status === "concluida" ? "line-through opacity-45" : ""}`}>
                      {t.title}
                    </span>
                  </div>
                  <div className="flex items-center gap-2.5 shrink-0 text-[11px] opacity-60">
                    <span>{TASK_LABEL[t.status]}</span>
                    {t.due_date && (
                      <span className="font-mono" style={tLate ? { color: "var(--bad)", fontWeight: 600 } : {}}>
                        {fmtDate(t.due_date)}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
            <button
              className="text-[12px] font-semibold mt-2.5 w-fit underline underline-offset-2"
              style={{ color: "var(--copper)" }}
              onClick={() => navigate("/tarefas")}
            >
              Gerenciar no quadro de tarefas
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <>
      <PageMeta title="Projetos | inProR" />
      <PageWrap
        title="Projetos"
        subtitle="Gestao de projetos da agencia por cliente"
        action={
          <div className="flex items-center gap-2">
            {isAdmin && (
              <select className="text-xs border hairline rounded px-2 py-1.5 bg-white dark:bg-[#11141b]"
                value={adminClientId ?? ""} onChange={e => setAdminClientId(e.target.value || null)}>
                <option value="">Todos os clientes</option>
                {adminClients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            )}
            <Btn size="sm" onClick={() => setShowForm(v => !v)}>+ Novo projeto</Btn>
          </div>
        }
      >
        <KpiGrid>
          <KpiCard label="Em andamento" value={ativos} sub={`${projects.length} no total`} />
          <KpiCard label="Concluidos"   value={concluidos} />
          <KpiCard label="Atrasados"    value={atrasados} />
          <KpiCard label="Orcamento"    value={fmtBrl(orcamento)} sub="projetos ativos" />
        </KpiGrid>

        {/* Filtro por status */}
        <div className="flex flex-wrap gap-2 mb-5">
          {STATUS.map(s => {
            const count = s.key === "todos"
              ? projects.length
              : projects.filter(p => p.status === s.key).length;
            return (
              <button key={s.key} className="chip"
                style={filter === s.key ? { background: s.color, color: "white", borderColor: s.color } : {}}
                onClick={() => setFilter(s.key as PStatus | "todos")}
              >
                {s.label} {count > 0 && <span className="opacity-70">{count}</span>}
              </button>
            );
          })}
        </div>

        {/* Form */}
        {showForm && (
          <SectionCard title="Novo Projeto" className="mb-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <label className="flex flex-col gap-1 col-span-2">
                <span className="text-[11px] opacity-55 uppercase tracking-wide">Nome</span>
                <input className="text-sm border hairline rounded px-2 py-1.5 bg-white dark:bg-[#11141b]"
                  value={form.name} onChange={f("name")} placeholder="Nome do projeto" />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[11px] opacity-55 uppercase tracking-wide">Status</span>
                <select className="text-sm border hairline rounded px-2 py-1.5 bg-white dark:bg-[#11141b]"
                  value={form.status} onChange={f("status")}>
                  {STATUS.filter(s => s.key !== "todos").map(s =>
                    <option key={s.key} value={s.key}>{s.label}</option>)}
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[11px] opacity-55 uppercase tracking-wide">Prioridade</span>
                <select className="text-sm border hairline rounded px-2 py-1.5 bg-white dark:bg-[#11141b]"
                  value={form.priority} onChange={f("priority")}>
                  {(Object.keys(PRIO) as Priority[]).map(p =>
                    <option key={p} value={p}>{PRIO[p].label}</option>)}
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[11px] opacity-55 uppercase tracking-wide">Inicio</span>
                <input type="date" className="text-sm border hairline rounded px-2 py-1.5 bg-white dark:bg-[#11141b]"
                  value={form.start_date} onChange={f("start_date")} />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[11px] opacity-55 uppercase tracking-wide">Prazo</span>
                <input type="date" className="text-sm border hairline rounded px-2 py-1.5 bg-white dark:bg-[#11141b]"
                  value={form.due_date} onChange={f("due_date")} />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[11px] opacity-55 uppercase tracking-wide">Orcamento (R$)</span>
                <input type="number" className="text-sm border hairline rounded px-2 py-1.5 bg-white dark:bg-[#11141b]"
                  value={form.budget} onChange={f("budget")} placeholder="0.00" />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[11px] opacity-55 uppercase tracking-wide">Responsavel</span>
                <input className="text-sm border hairline rounded px-2 py-1.5 bg-white dark:bg-[#11141b]"
                  value={form.owner} onChange={f("owner")} placeholder="Nome" />
              </label>
              <label className="flex flex-col gap-1 col-span-2 md:col-span-4">
                <span className="text-[11px] opacity-55 uppercase tracking-wide">Descricao</span>
                <textarea rows={2} className="text-sm border hairline rounded px-2 py-1.5 bg-white dark:bg-[#11141b] resize-none leading-relaxed"
                  value={form.description} onChange={f("description")} placeholder="Objetivo e escopo do projeto" />
              </label>
            </div>
            <div className="flex gap-2 mt-4">
              <Btn onClick={handleSave} disabled={saving || !form.name.trim()}>
                {saving ? "Salvando..." : "Salvar"}
              </Btn>
              <Btn variant="ghost" onClick={() => setShowForm(false)}>Cancelar</Btn>
            </div>
          </SectionCard>
        )}

        {/* Lista */}
        {loading ? (
          <p className="text-[13px] opacity-40 text-center py-16">Carregando...</p>
        ) : filtered.length === 0 ? (
          <SectionCard>
            <EmptyState
              title={projects.length === 0 ? "Nenhum projeto" : "Nenhum projeto neste status"}
              sub={projects.length === 0
                ? "Crie o primeiro projeto clicando em Novo projeto."
                : "Ajuste o filtro para ver os demais projetos."}
            />
          </SectionCard>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            {filtered.map(p => <ProjectCard key={p.id} p={p} />)}
          </div>
        )}
      </PageWrap>
    </>
  );
}
