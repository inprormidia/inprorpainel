import { useState, useEffect, useMemo, ReactNode } from "react";
import { useNavigate } from "react-router";
import PageMeta from "../../components/common/PageMeta";
import {
  PageWrap, KpiCard, KpiGrid, SectionCard, Badge, Btn, StatusDot, EmptyState, Avatar, cls,
} from "../../components/ui/InprorComponents";
import { useClientScope } from "../../context/AuthContext";
import { supabase } from "../../lib/supabase";
import {
  TaskRow, ProjectLite, Status, Priority, ColKey, GroupBy, ViewConfig,
  COLUMNS, ALL_COLUMNS, GROUP_OPTIONS, PRIO, PRIORITIES, PRIO_ORDER,
  colIndex, statusLabel, fmtDate, isOverdue, dueLabel,
  loadView, saveView, emptyFilters, countActiveFilters,
} from "./shared";

const emptyForm = () => ({
  title: "", description: "",
  status: "backlog" as Status, priority: "media" as Priority,
  due_date: "", assignee_id: "", project_id: "", client_id: "",
});
type FormShape = ReturnType<typeof emptyForm>;

export default function Tarefas() {
  const navigate = useNavigate();
  const {
    scopedClientId, authLoading, isAdmin, adminClientId, setAdminClientId, adminClients,
    team, myMemberId,
  } = useClientScope();

  const [tasks, setTasks]       = useState<TaskRow[]>([]);
  const [projects, setProjects] = useState<ProjectLite[]>([]);
  const [loading, setLoading]   = useState(true);
  const [erro, setErro]         = useState<string | null>(null);

  const [view, setView] = useState<ViewConfig>(loadView);
  const [panel, setPanel] = useState<"none" | "filtros" | "colunas">("none");

  const [showForm, setShowForm] = useState(false);
  const [form, setForm]         = useState<FormShape>(emptyForm());
  const [saving, setSaving]     = useState(false);

  useEffect(() => { saveView(view); }, [view]);

  const upd  = (patch: Partial<ViewConfig>) => setView(v => ({ ...v, ...patch }));
  const updF = (patch: Partial<ViewConfig["filters"]>) =>
    setView(v => ({ ...v, filters: { ...v.filters, ...patch } }));

  const clientName = (id: string | null) =>
    id ? (adminClients.find(c => c.id === id)?.name ?? "Cliente") : "Interno";
  const projectName = (id: string | null) =>
    id ? (projects.find(p => p.id === id)?.name ?? "Projeto") : null;
  const member = (id: string | null) => (id ? team.find(m => m.id === id) : undefined);
  // tarefas antigas guardam so o texto; o membro vinculado tem prioridade
  const assigneeName = (t: TaskRow) => member(t.assignee_id)?.name ?? t.assigned_to ?? null;

  useEffect(() => {
    if (authLoading) return;
    setLoading(true);
    let q  = supabase.from("tasks").select("*").order("created_at", { ascending: false });
    let pq = supabase.from("projects").select("id,name,client_id");
    if (!isAdmin && scopedClientId) {
      q = q.eq("client_id", scopedClientId); pq = pq.eq("client_id", scopedClientId);
    } else if (isAdmin && adminClientId) {
      q = q.eq("client_id", adminClientId); pq = pq.eq("client_id", adminClientId);
    }
    Promise.all([q, pq]).then(([t, p]) => {
      setTasks((t.data as TaskRow[]) ?? []);
      setProjects((p.data as ProjectLite[]) ?? []);
      setLoading(false);
    });
  }, [scopedClientId, adminClientId, isAdmin, authLoading]);

  // ── Filtros ──────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const f = view.filters;
    const term = f.search.trim().toLowerCase();
    return tasks.filter(t => {
      if (term && !(`${t.title} ${t.description ?? ""} ${assigneeName(t) ?? ""}`.toLowerCase().includes(term))) return false;
      if (f.status.length && !f.status.includes(t.status)) return false;
      if (f.priority.length && !f.priority.includes(t.priority)) return false;
      if (f.project === "sem" && t.project_id) return false;
      if (f.project !== "todos" && f.project !== "sem" && t.project_id !== f.project) return false;
      if (f.client === "interno" && t.client_id) return false;
      if (f.client !== "todos" && f.client !== "interno" && t.client_id !== f.client) return false;
      if (f.assigned === "sem" && (t.assignee_id || t.assigned_to)) return false;
      if (f.assigned === "eu" && t.assignee_id !== myMemberId) return false;
      if (!["todos", "sem", "eu"].includes(f.assigned) && t.assignee_id !== f.assigned) return false;
      if (f.overdue && !isOverdue(t)) return false;
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks, view.filters, team, myMemberId]);

  // ── Ordenacao ────────────────────────────────────────────────
  const sortValue = (t: TaskRow, key: ColKey): string | number => {
    switch (key) {
      case "title":       return t.title.toLowerCase();
      case "status":      return colIndex(t.status);
      case "priority":    return PRIO_ORDER[t.priority];
      case "project":     return (projectName(t.project_id) ?? "￿").toLowerCase();
      case "client":      return clientName(t.client_id).toLowerCase();
      case "assigned_to": return (assigneeName(t) ?? "￿").toLowerCase();
      case "due_date":    return t.due_date ?? "9999-99-99";
      case "created_at":  return t.created_at;
    }
  };

  const sorted = useMemo(() => {
    const dir = view.sortDir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const va = sortValue(a, view.sortBy), vb = sortValue(b, view.sortBy);
      if (va < vb) return -1 * dir;
      if (va > vb) return 1 * dir;
      return a.title.localeCompare(b.title);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, view.sortBy, view.sortDir, projects, adminClients, team]);

  // ── Agrupamento ──────────────────────────────────────────────
  const groups = useMemo(() => {
    const g = view.groupBy;
    if (g === "none") return [{ key: "all", label: "", items: sorted }];
    const map = new Map<string, { key: string; label: string; items: TaskRow[]; order: number }>();
    sorted.forEach(t => {
      let key: string, label: string, order = 0;
      switch (g) {
        case "status":      key = t.status; label = statusLabel(t.status); order = colIndex(t.status); break;
        case "priority":    key = t.priority; label = PRIO[t.priority].label; order = PRIO_ORDER[t.priority]; break;
        case "project":     key = t.project_id ?? "sem"; label = projectName(t.project_id) ?? "Sem projeto"; order = t.project_id ? 0 : 1; break;
        case "client":      key = t.client_id ?? "interno"; label = clientName(t.client_id); order = 0; break;
        case "assigned_to": key = t.assignee_id ?? "sem"; label = assigneeName(t) ?? "Sem responsavel"; order = t.assignee_id ? 0 : 1; break;
        default:            key = "all"; label = "";
      }
      if (!map.has(key)) map.set(key, { key, label, items: [], order });
      map.get(key)!.items.push(t);
    });
    return [...map.values()].sort((a, b) => a.order - b.order || a.label.localeCompare(b.label));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sorted, view.groupBy, projects, adminClients, team]);

  // ── Carga por membro (cards da equipe) ───────────────────────
  const workload = useMemo(() => {
    const base = tasks.filter(t => t.status !== "concluida");
    return team.filter(m => m.active).map(m => {
      const mine = base.filter(t => t.assignee_id === m.id);
      return {
        member: m,
        abertas: mine.length,
        atrasadas: mine.filter(isOverdue).length,
        andamento: mine.filter(t => t.status === "em_andamento").length,
      };
    }).sort((a, b) => b.abertas - a.abertas);
  }, [tasks, team]);

  const semDono = tasks.filter(t => t.status !== "concluida" && !t.assignee_id).length;

  const total     = filtered.length;
  const andamento = filtered.filter(t => t.status === "em_andamento").length;
  const atrasadas = filtered.filter(isOverdue).length;
  const concl     = filtered.filter(t => t.status === "concluida").length;

  const visibleCols = ALL_COLUMNS.filter(c => view.columns.includes(c.key) && (!c.adminOnly || isAdmin));
  const orderedCols = view.columns
    .map(k => visibleCols.find(c => c.key === k))
    .filter(Boolean) as typeof ALL_COLUMNS;

  // ── Acoes ────────────────────────────────────────────────────
  async function patchTask(id: string, changes: Partial<TaskRow>, msgErro: string) {
    const backup = tasks;
    setTasks(cur => cur.map(x => x.id === id ? { ...x, ...changes } : x));
    const { error } = await supabase.from("tasks").update(changes).eq("id", id);
    if (error) { setTasks(backup); setErro(msgErro); }
  }

  const setStatus = (id: string, s: Status) =>
    patchTask(id, { status: s }, "Nao foi possivel alterar a etapa.");

  const setAssignee = (id: string, memberId: string) =>
    patchTask(id, { assignee_id: memberId || null }, "Nao foi possivel alterar o responsavel.");

  function toggleDone(t: TaskRow) {
    setStatus(t.id, t.status === "concluida" ? "em_andamento" : "concluida");
  }

  function move(id: string, dir: -1 | 1) {
    const t = tasks.find(x => x.id === id);
    if (!t) return;
    const next = COLUMNS[colIndex(t.status) + dir];
    if (next) setStatus(id, next.key);
  }

  async function handleSave() {
    if (!form.title.trim()) return;
    setSaving(true);
    const { data, error } = await supabase.from("tasks").insert({
      client_id: form.client_id || null,
      project_id: form.project_id || null,
      assignee_id: form.assignee_id || null,
      title: form.title.trim(),
      description: form.description.trim() || null,
      status: form.status, priority: form.priority,
      due_date: form.due_date || null,
    }).select().single();
    setSaving(false);
    if (error) { setErro("Erro ao criar: " + error.message); return; }
    setTasks(cur => [data as TaskRow, ...cur]);
    setShowForm(false);
    setForm(emptyForm());
  }

  const f = (k: keyof FormShape) =>
    (e: { target: { value: string } }) => setForm(prev => ({ ...prev, [k]: e.target.value }));

  function toggleSort(key: ColKey) {
    if (view.sortBy === key) upd({ sortDir: view.sortDir === "asc" ? "desc" : "asc" });
    else upd({ sortBy: key, sortDir: "asc" });
  }
  function toggleColumn(key: ColKey) {
    setView(v => ({
      ...v,
      columns: v.columns.includes(key) ? v.columns.filter(c => c !== key) : [...v.columns, key],
    }));
  }
  function moveColumn(key: ColKey, dir: -1 | 1) {
    setView(v => {
      const i = v.columns.indexOf(key), j = i + dir;
      if (i < 0 || j < 0 || j >= v.columns.length) return v;
      const next = [...v.columns];
      [next[i], next[j]] = [next[j], next[i]];
      return { ...v, columns: next };
    });
  }

  // ── Celulas ──────────────────────────────────────────────────
  function cell(col: ColKey, t: TaskRow): ReactNode {
    switch (col) {
      case "title":
        return (
          <div className="flex items-center gap-2 min-w-0">
            {/* concluir sem sair da lista */}
            <button
              onClick={() => toggleDone(t)}
              className="w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center"
              style={t.status === "concluida"
                ? { background: "var(--ok)", borderColor: "var(--ok)", color: "white" }
                : { borderColor: "var(--line-light)" }}
              title={t.status === "concluida" ? "Reabrir" : "Concluir"}
              aria-label={t.status === "concluida" ? "Reabrir tarefa" : "Concluir tarefa"}
            >
              {t.status === "concluida" && <span className="text-[9px] leading-none">✓</span>}
            </button>
            <button className={cls("text-left hover:underline underline-offset-2 font-medium truncate",
              t.status === "concluida" && "line-through opacity-50")}
              onClick={() => navigate(`/tarefas/${t.id}`)}>
              {t.title}
            </button>
          </div>
        );
      case "status":
        return (
          <select className="text-[11px] border hairline rounded px-1.5 py-0.5 bg-white dark:bg-[#11141b]"
            value={t.status} onChange={e => setStatus(t.id, e.target.value as Status)}>
            {COLUMNS.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
          </select>
        );
      case "priority":
        return <Badge label={PRIO[t.priority].label} color={PRIO[t.priority].color} />;
      case "project":
        return projectName(t.project_id) ?? <span className="opacity-30">-</span>;
      case "client":
        return clientName(t.client_id);
      case "assigned_to": {
        const m = member(t.assignee_id);
        return (
          <select
            className="text-[11px] border hairline rounded px-1.5 py-0.5 bg-white dark:bg-[#11141b] max-w-[150px]"
            value={t.assignee_id ?? ""}
            onChange={e => setAssignee(t.id, e.target.value)}
            title={m?.name ?? "Sem responsavel"}
          >
            <option value="">Sem responsavel</option>
            {team.filter(x => x.active || x.id === t.assignee_id).map(x =>
              <option key={x.id} value={x.id}>{x.name}</option>)}
          </select>
        );
      }
      case "due_date":
        return t.due_date
          ? <span style={isOverdue(t) ? { color: "var(--bad)", fontWeight: 600 } : {}}>
              {dueLabel(t.due_date, t.status)}
            </span>
          : <span className="opacity-30">-</span>;
      case "created_at":
        return <span className="opacity-60">{fmtDate(t.created_at.slice(0, 10))}</span>;
    }
  }

  const activeFilters = countActiveFilters(view.filters);
  const ctrlBtn = "text-[12px] px-3 py-1.5 rounded-lg border hairline inline-flex items-center gap-1.5 whitespace-nowrap shrink-0";
  const fa = view.filters.assigned;

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
            <Btn size="sm" onClick={() => {
              setForm({
                ...emptyForm(),
                client_id: isAdmin ? (adminClientId ?? "") : (scopedClientId ?? ""),
                assignee_id: myMemberId ?? "",
              });
              setShowForm(v => !v);
            }}>
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

        {/* Primeiro bloco: indicadores */}
        <KpiGrid>
          <KpiCard label="Total"        value={total} />
          <KpiCard label="Em andamento" value={andamento} />
          <KpiCard label="Atrasadas"    value={atrasadas} />
          <KpiCard label="Concluidas"   value={concl} />
        </KpiGrid>

        {/* Cards da equipe: carga de cada pessoa, clicaveis para filtrar */}
        {team.length > 0 && (
          <div className="flex gap-3 overflow-x-auto -mx-4 px-4 pb-2 mb-4 sm:mx-0 sm:px-0 sm:flex-wrap">
            {myMemberId && (
              <button
                onClick={() => updF({ assigned: fa === "eu" ? "todos" : "eu" })}
                className="border hairline rounded-xl px-3.5 py-3 bg-white dark:bg-[#11141b] shadow-sm shrink-0
                           flex items-center gap-3 min-w-[170px] transition-colors text-left"
                style={fa === "eu" ? { borderColor: "var(--brand)", boxShadow: "0 0 0 1px var(--brand)" } : {}}
              >
                <Avatar name={member(myMemberId)?.name ?? "Eu"} color={member(myMemberId)?.color} size={34} />
                <div className="min-w-0">
                  <div className="text-[13px] font-semibold truncate">Minhas tarefas</div>
                  <div className="text-[11px] opacity-55">
                    {workload.find(w => w.member.id === myMemberId)?.abertas ?? 0} abertas
                  </div>
                </div>
              </button>
            )}

            {workload.filter(w => w.member.id !== myMemberId).map(w => (
              <button
                key={w.member.id}
                onClick={() => updF({ assigned: fa === w.member.id ? "todos" : w.member.id })}
                className="border hairline rounded-xl px-3.5 py-3 bg-white dark:bg-[#11141b] shadow-sm shrink-0
                           flex items-center gap-3 min-w-[170px] transition-colors text-left"
                style={fa === w.member.id ? { borderColor: "var(--brand)", boxShadow: "0 0 0 1px var(--brand)" } : {}}
              >
                <Avatar name={w.member.name} color={w.member.color} size={34} />
                <div className="min-w-0">
                  <div className="text-[13px] font-semibold truncate">{w.member.name}</div>
                  <div className="text-[11px] opacity-55 truncate">
                    {w.abertas} abertas
                    {w.atrasadas > 0 && (
                      <span style={{ color: "var(--bad)", fontWeight: 600 }}> · {w.atrasadas} atrasada{w.atrasadas > 1 ? "s" : ""}</span>
                    )}
                  </div>
                  {w.member.role_title && (
                    <div className="text-[10px] opacity-35 truncate">{w.member.role_title}</div>
                  )}
                </div>
              </button>
            ))}

            {semDono > 0 && (
              <button
                onClick={() => updF({ assigned: fa === "sem" ? "todos" : "sem" })}
                className="border border-dashed hairline rounded-xl px-3.5 py-3 shrink-0
                           flex items-center gap-3 min-w-[150px] transition-colors text-left"
                style={fa === "sem" ? { borderColor: "var(--brand)", borderStyle: "solid" } : {}}
              >
                <span className="w-[34px] h-[34px] rounded-full border border-dashed hairline shrink-0
                                 flex items-center justify-center text-[13px] opacity-35">?</span>
                <div className="min-w-0">
                  <div className="text-[13px] font-semibold truncate">Sem responsavel</div>
                  <div className="text-[11px] opacity-55">{semDono} abertas</div>
                </div>
              </button>
            )}
          </div>
        )}

        {/* Barra de controles */}
        <div className="flex items-center gap-2 mb-3 overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0 pb-1">
          <div className="flex gap-1 shrink-0">
            {(["lista", "quadro"] as const).map(m => (
              <button key={m}
                className="text-[11px] uppercase tracking-wide px-3 py-1.5 rounded-lg border hairline whitespace-nowrap"
                style={view.mode === m ? { background: "var(--brand)", color: "white", borderColor: "var(--brand)" } : {}}
                onClick={() => upd({ mode: m })}
              >{m}</button>
            ))}
          </div>

          <span className="w-px h-5 bg-current opacity-10 shrink-0" />

          {myMemberId && (
            <button className={ctrlBtn}
              style={fa === "eu" ? { background: "var(--brand)", color: "white", borderColor: "var(--brand)" } : {}}
              onClick={() => updF({ assigned: fa === "eu" ? "todos" : "eu" })}>
              Minhas
            </button>
          )}

          <button className={ctrlBtn}
            style={view.filters.overdue ? { background: "var(--bad)", color: "white", borderColor: "var(--bad)" } : {}}
            onClick={() => updF({ overdue: !view.filters.overdue })}>
            Atrasadas
          </button>

          <button className={ctrlBtn}
            style={panel === "filtros" || activeFilters ? { borderColor: "var(--brand)", color: "var(--brand)" } : {}}
            onClick={() => setPanel(p => p === "filtros" ? "none" : "filtros")}>
            Filtros
            {activeFilters > 0 && (
              <span className="text-[10px] font-bold px-1.5 rounded-full"
                style={{ background: "var(--brand)", color: "white" }}>{activeFilters}</span>
            )}
          </button>

          {view.mode === "lista" && (
            <button className={ctrlBtn}
              style={panel === "colunas" ? { borderColor: "var(--brand)", color: "var(--brand)" } : {}}
              onClick={() => setPanel(p => p === "colunas" ? "none" : "colunas")}>
              Colunas <span className="opacity-50">{orderedCols.length}</span>
            </button>
          )}

          <label className="flex items-center gap-1.5 shrink-0">
            <span className="text-[11px] opacity-50 uppercase tracking-wide whitespace-nowrap">Agrupar</span>
            <select className="text-[12px] border hairline rounded-lg px-2 py-1.5 bg-white dark:bg-[#11141b]"
              value={view.groupBy} onChange={e => upd({ groupBy: e.target.value as GroupBy })}>
              {GROUP_OPTIONS.filter(o => !o.adminOnly || isAdmin).map(o =>
                <option key={o.key} value={o.key}>{o.label}</option>)}
            </select>
          </label>

          <input
            className="text-[12px] border hairline rounded-lg px-2.5 py-1.5 bg-white dark:bg-[#11141b] min-w-[150px] shrink-0"
            placeholder="Buscar tarefa..."
            value={view.filters.search}
            onChange={e => updF({ search: e.target.value })}
          />

          {activeFilters > 0 && (
            <button className="text-[12px] opacity-55 hover:opacity-100 whitespace-nowrap shrink-0 underline underline-offset-2"
              onClick={() => updF(emptyFilters())}>
              Limpar
            </button>
          )}
        </div>

        {/* Painel de filtros */}
        {panel === "filtros" && (
          <SectionCard title="Filtros" className="mb-4"
            action={<button className="text-[12px] opacity-60 hover:opacity-100"
              onClick={() => updF(emptyFilters())}>Limpar</button>}>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
              <div className="flex flex-col gap-1.5">
                <span className="text-[11px] opacity-55 uppercase tracking-wide">Etapa</span>
                {COLUMNS.map(c => (
                  <label key={c.key} className="flex items-center gap-2 text-[13px] cursor-pointer">
                    <input type="checkbox" checked={view.filters.status.includes(c.key)}
                      onChange={e => updF({
                        status: e.target.checked
                          ? [...view.filters.status, c.key]
                          : view.filters.status.filter(s => s !== c.key),
                      })} />
                    {c.label}
                  </label>
                ))}
              </div>

              <div className="flex flex-col gap-1.5">
                <span className="text-[11px] opacity-55 uppercase tracking-wide">Prioridade</span>
                {PRIORITIES.map(p => (
                  <label key={p} className="flex items-center gap-2 text-[13px] cursor-pointer">
                    <input type="checkbox" checked={view.filters.priority.includes(p)}
                      onChange={e => updF({
                        priority: e.target.checked
                          ? [...view.filters.priority, p]
                          : view.filters.priority.filter(x => x !== p),
                      })} />
                    {PRIO[p].label}
                  </label>
                ))}
              </div>

              <div className="flex flex-col gap-2.5">
                <label className="flex flex-col gap-1">
                  <span className="text-[11px] opacity-55 uppercase tracking-wide">Projeto</span>
                  <select className="text-sm border hairline rounded px-2 py-1.5 bg-white dark:bg-[#11141b]"
                    value={view.filters.project} onChange={e => updF({ project: e.target.value })}>
                    <option value="todos">Todos</option>
                    <option value="sem">Sem projeto</option>
                    {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </label>
                {isAdmin && (
                  <label className="flex flex-col gap-1">
                    <span className="text-[11px] opacity-55 uppercase tracking-wide">Cliente</span>
                    <select className="text-sm border hairline rounded px-2 py-1.5 bg-white dark:bg-[#11141b]"
                      value={view.filters.client} onChange={e => updF({ client: e.target.value })}>
                      <option value="todos">Todos</option>
                      <option value="interno">Interno (agencia)</option>
                      {adminClients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </label>
                )}
              </div>

              <div className="flex flex-col gap-2.5">
                <label className="flex flex-col gap-1">
                  <span className="text-[11px] opacity-55 uppercase tracking-wide">Responsavel</span>
                  <select className="text-sm border hairline rounded px-2 py-1.5 bg-white dark:bg-[#11141b]"
                    value={view.filters.assigned} onChange={e => updF({ assigned: e.target.value })}>
                    <option value="todos">Todos</option>
                    {myMemberId && <option value="eu">Somente minhas</option>}
                    <option value="sem">Sem responsavel</option>
                    {team.filter(m => m.active).map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                </label>
                <label className="flex items-center gap-2 text-[13px] cursor-pointer mt-1">
                  <input type="checkbox" checked={view.filters.overdue}
                    onChange={e => updF({ overdue: e.target.checked })} />
                  Somente atrasadas
                </label>
              </div>
            </div>
          </SectionCard>
        )}

        {/* Painel de colunas */}
        {panel === "colunas" && view.mode === "lista" && (
          <SectionCard title="Colunas" className="mb-4"
            action={<button className="text-[12px] opacity-60 hover:opacity-100"
              onClick={() => upd({ columns: ["title", "status", "priority", "project", "due_date", "assigned_to"] })}>
              Restaurar padrao
            </button>}>
            <p className="text-[12px] opacity-50 mb-3">
              Marque as colunas visiveis e use as setas para mudar a ordem.
            </p>
            <div className="flex flex-col gap-1">
              {view.columns.map((key, i) => {
                const meta = ALL_COLUMNS.find(c => c.key === key);
                if (!meta || (meta.adminOnly && !isAdmin)) return null;
                return (
                  <div key={key} className="flex items-center gap-2 py-1.5 border-b hairline last:border-0">
                    <input type="checkbox" checked onChange={() => toggleColumn(key)} />
                    <span className="text-[13px] flex-1">{meta.label}</span>
                    <button className="w-7 h-7 rounded border hairline text-xs disabled:opacity-25"
                      disabled={i === 0} onClick={() => moveColumn(key, -1)} aria-label="Subir">↑</button>
                    <button className="w-7 h-7 rounded border hairline text-xs disabled:opacity-25"
                      disabled={i === view.columns.length - 1} onClick={() => moveColumn(key, 1)} aria-label="Descer">↓</button>
                  </div>
                );
              })}
              {ALL_COLUMNS.filter(c => !view.columns.includes(c.key) && (!c.adminOnly || isAdmin)).map(c => (
                <div key={c.key} className="flex items-center gap-2 py-1.5 border-b hairline last:border-0 opacity-50">
                  <input type="checkbox" checked={false} onChange={() => toggleColumn(c.key)} />
                  <span className="text-[13px] flex-1">{c.label}</span>
                </div>
              ))}
            </div>
          </SectionCard>
        )}

        {/* Nova tarefa */}
        {showForm && (
          <SectionCard title="Nova Tarefa" className="mb-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
              <label className="flex flex-col gap-1 sm:col-span-2">
                <span className="text-[11px] opacity-55 uppercase tracking-wide">Titulo</span>
                <input className="text-sm border hairline rounded px-2 py-1.5 bg-white dark:bg-[#11141b]"
                  value={form.title} onChange={f("title")} placeholder="Descreva a tarefa" autoFocus />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[11px] opacity-55 uppercase tracking-wide">Responsavel</span>
                <select className="text-sm border hairline rounded px-2 py-1.5 bg-white dark:bg-[#11141b]"
                  value={form.assignee_id} onChange={f("assignee_id")}>
                  <option value="">Sem responsavel</option>
                  {team.filter(m => m.active).map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
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
                  {(form.client_id
                    ? projects.filter(p => p.client_id === form.client_id || !p.client_id)
                    : projects
                  ).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[11px] opacity-55 uppercase tracking-wide">Prioridade</span>
                <select className="text-sm border hairline rounded px-2 py-1.5 bg-white dark:bg-[#11141b]"
                  value={form.priority} onChange={f("priority")}>
                  {PRIORITIES.map(p => <option key={p} value={p}>{PRIO[p].label}</option>)}
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
              <label className="flex flex-col gap-1 sm:col-span-2 md:col-span-4">
                <span className="text-[11px] opacity-55 uppercase tracking-wide">Descricao</span>
                <textarea className="text-sm border hairline rounded px-2 py-1.5 bg-white dark:bg-[#11141b] resize-none leading-relaxed"
                  rows={2} value={form.description} onChange={f("description")} placeholder="Detalhes (opcional)" />
              </label>
            </div>
            <div className="flex gap-2 mt-4">
              <Btn onClick={handleSave} disabled={saving || !form.title.trim()}>
                {saving ? "Salvando..." : "Criar tarefa"}
              </Btn>
              <Btn variant="ghost" onClick={() => setShowForm(false)}>Cancelar</Btn>
            </div>
          </SectionCard>
        )}

        {/* Conteudo */}
        {loading ? (
          <p className="text-[13px] opacity-40 text-center py-16">Carregando...</p>
        ) : tasks.length === 0 ? (
          <SectionCard>
            <EmptyState title="Nenhuma tarefa"
              sub="Crie a primeira tarefa clicando em Nova tarefa."
              action={<Btn size="sm" onClick={() => setShowForm(true)}>+ Nova tarefa</Btn>} />
          </SectionCard>
        ) : filtered.length === 0 ? (
          <SectionCard>
            <EmptyState title="Nenhuma tarefa neste filtro"
              sub="Ajuste ou limpe os filtros para ver mais resultados."
              action={<Btn size="sm" variant="ghost" onClick={() => updF(emptyFilters())}>Limpar filtros</Btn>} />
          </SectionCard>
        ) : view.mode === "quadro" ? (
          <div className="flex gap-3 overflow-x-auto -mx-4 px-4 pb-2 snap-x snap-mandatory
                          md:grid md:grid-cols-2 xl:grid-cols-4 md:gap-4 md:overflow-visible md:mx-0 md:px-0 md:pb-0">
            {COLUMNS.map(col => {
              const colTasks = sorted.filter(t => t.status === col.key);
              return (
                <div key={col.key} className="flex flex-col gap-3 w-[82vw] shrink-0 snap-start md:w-auto md:shrink">
                  <div className="flex items-center justify-between px-1">
                    <span className="font-semibold text-[13px]" style={{ color: "var(--brand)" }}>{col.label}</span>
                    <span className="font-mono text-xs opacity-40">{colTasks.length}</span>
                  </div>
                  <div className="flex flex-col gap-3 min-h-[60px]">
                    {colTasks.map(t => {
                      const idx = colIndex(t.status);
                      const m = member(t.assignee_id);
                      return (
                        <div key={t.id} className="border hairline rounded-lg p-3 bg-white dark:bg-[#11141b] shadow-sm flex flex-col gap-2">
                          <div className="flex items-start justify-between gap-2">
                            <button className="text-[13px] font-medium leading-snug text-left hover:underline underline-offset-2"
                              onClick={() => navigate(`/tarefas/${t.id}`)}>{t.title}</button>
                            <Badge label={PRIO[t.priority].label} color={PRIO[t.priority].color} />
                          </div>
                          {t.project_id && (
                            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full w-fit"
                              style={{ background: "rgba(168,87,48,.12)", color: "var(--copper)" }}>
                              {projectName(t.project_id)}
                            </span>
                          )}
                          <div className="flex items-center gap-2 flex-wrap text-[11px] opacity-60">
                            {m
                              ? <span className="inline-flex items-center gap-1.5">
                                  <Avatar name={m.name} color={m.color} size={18} />{m.name}
                                </span>
                              : <span className="opacity-60">Sem responsavel</span>}
                            {isAdmin && (
                              <span className="inline-flex items-center gap-1">
                                <StatusDot status="neutral" />{clientName(t.client_id)}
                              </span>
                            )}
                            {t.due_date && (
                              <span className="font-mono" style={isOverdue(t) ? { color: "var(--bad)", fontWeight: 600 } : {}}>
                                {fmtDate(t.due_date)}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center justify-between pt-1 gap-2 border-t hairline mt-0.5">
                            <button className="text-sm w-9 h-8 flex items-center justify-center rounded border hairline disabled:opacity-25 shrink-0"
                              disabled={idx === 0} onClick={() => move(t.id, -1)} aria-label="Voltar etapa">‹</button>
                            <button className="text-[10px] uppercase tracking-wide opacity-45 hover:opacity-90 px-2.5 py-1.5"
                              onClick={() => navigate(`/tarefas/${t.id}`)}>Abrir</button>
                            <button className="text-sm w-9 h-8 flex items-center justify-center rounded border hairline disabled:opacity-25 shrink-0"
                              disabled={idx === COLUMNS.length - 1} onClick={() => move(t.id, 1)} aria-label="Avancar etapa">›</button>
                          </div>
                        </div>
                      );
                    })}
                    {colTasks.length === 0 && (
                      <div className="border border-dashed hairline rounded-lg py-6 text-center text-[11px] opacity-30">Vazio</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {groups.map(g => (
              <SectionCard key={g.key} title={view.groupBy === "none" ? undefined : `${g.label}  (${g.items.length})`}>
                <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="border-b hairline">
                        {orderedCols.map(c => {
                          const active = view.sortBy === c.key;
                          return (
                            <th key={c.key}
                              className="text-[11px] font-semibold uppercase tracking-wide opacity-50 text-left py-2.5 px-3 whitespace-nowrap">
                              {c.sortable ? (
                                <button className="inline-flex items-center gap-1 hover:opacity-100"
                                  style={active ? { color: "var(--brand)", opacity: 1 } : {}}
                                  onClick={() => toggleSort(c.key)}>
                                  {c.label}
                                  <span className="text-[9px]">{active ? (view.sortDir === "asc" ? "▲" : "▼") : "◇"}</span>
                                </button>
                              ) : c.label}
                            </th>
                          );
                        })}
                        <th className="w-8" />
                      </tr>
                    </thead>
                    <tbody>
                      {g.items.map(t => (
                        <tr key={t.id}
                          className="border-b hairline last:border-0 hover:bg-black/[0.02] dark:hover:bg-white/[0.02]">
                          {orderedCols.map(c => (
                            <td key={c.key} className="py-2.5 px-3 text-[13px] tabular align-middle">
                              {cell(c.key, t)}
                            </td>
                          ))}
                          <td className="py-2.5 px-2 text-right">
                            <button className="text-[11px] opacity-35 hover:opacity-100"
                              onClick={() => navigate(`/tarefas/${t.id}`)} title="Abrir tarefa">›</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </SectionCard>
            ))}
          </div>
        )}
      </PageWrap>
    </>
  );
}
