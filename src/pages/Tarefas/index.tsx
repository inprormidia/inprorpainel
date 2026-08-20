import { useState, useEffect, useMemo, ReactNode } from "react";
import PageMeta from "../../components/common/PageMeta";
import {
  PageWrap, KpiCard, KpiGrid, SectionCard, Badge, Btn, StatusDot, EmptyState,
  Avatar, AvatarStack, CellPicker, MenuItem, MenuData, cls,
} from "../../components/ui/InprorComponents";
import { useClientScope } from "../../context/AuthContext";
import { supabase } from "../../lib/supabase";
import TarefaPainel from "./TarefaPainel";
import {
  TaskRow, ProjectLite, DeptLite, Status, Priority, ColKey, GroupBy, ViewConfig,
  COLUMNS, ALL_COLUMNS, GROUP_OPTIONS, PRIO, PRIORITIES, PRIO_ORDER,
  colIndex, statusLabel, fmtDate, isOverdue, dueLabel, dueLabelCurto,
  loadView, saveView, defaultView, emptyFilters, countActiveFilters, concluidaRecente,
} from "./shared";

// task_id -> ids dos membros responsaveis
type AssigneeMap = Record<string, string[]>;

export default function Tarefas() {
  const {
    scopedClientId, authLoading, isAdmin, isStaff, adminClientId, setAdminClientId, adminClients,
    team, myMemberId, reloadClients,
  } = useClientScope();

  const [tasks, setTasks]       = useState<TaskRow[]>([]);
  const [projects, setProjects] = useState<ProjectLite[]>([]);
  const [depts, setDepts]       = useState<DeptLite[]>([]);
  const [verConcluidas, setVerConcluidas] = useState(false);
  const [assignees, setAssignees] = useState<AssigneeMap>({});
  // uma tarefa pode atender varios clientes
  const [taskClients, setTaskClients] = useState<Record<string, string[]>>({});
  // filhas ficam fora da lista principal e aparecem dentro da tarefa mae
  const [subtasks, setSubtasks] = useState<Record<string, TaskRow[]>>({});
  const [loading, setLoading]   = useState(true);
  const [erro, setErro]         = useState<string | null>(null);

  const [view, setView] = useState<ViewConfig>(loadView);
  const [panel, setPanel] = useState<"none" | "filtros" | "colunas">("none");

  // tarefa aberta no painel lateral e titulo em edicao direta na linha
  const [peekId, setPeekId]       = useState<string | null>(null);
  const [editing, setEditing]     = useState<{ id: string; value: string } | null>(null);

  const [criandoTopo, setCriandoTopo] = useState(false);
  // tarefa recem criada abre com o titulo pronto para digitar
  const [recemCriada, setRecemCriada] = useState<string | null>(null);
  // linha de criacao rapida aberta em um grupo especifico
  const [novaEmGrupo, setNovaEmGrupo] = useState<string | null>(null);
  const [tituloNovo, setTituloNovo]   = useState("");

  useEffect(() => { saveView(view); }, [view]);

  useEffect(() => {
    if (!peekId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPeekId(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [peekId]);

  const upd  = (patch: Partial<ViewConfig>) => setView(v => ({ ...v, ...patch }));
  const updF = (patch: Partial<ViewConfig["filters"]>) =>
    setView(v => ({ ...v, filters: { ...v.filters, ...patch } }));

  const clientName = (id: string | null) =>
    id ? (adminClients.find(c => c.id === id)?.name ?? "Cliente") : "Interno";
  const projectName = (id: string | null) =>
    id ? (projects.find(p => p.id === id)?.name ?? "Projeto") : null;
  const dept = (id: string | null) => (id ? depts.find(d => d.id === id) : undefined);
  const clientesDe = (t: TaskRow): string[] => {
    const v = taskClients[t.id];
    if (v && v.length) return v;
    return t.client_id ? [t.client_id] : [];
  };
  const nomesClientes = (t: TaskRow) =>
    clientesDe(t).map(id => adminClients.find(c => c.id === id)?.name ?? "Cliente");
  const eu = team.find(m => m.id === myMemberId);
  // uma tarefa pode ter varias pessoas; a lista vem de task_assignees
  const peopleOf = (taskId: string) =>
    (assignees[taskId] ?? []).map(id => team.find(m => m.id === id)).filter(Boolean) as typeof team;
  const assigneeName = (t: TaskRow) => {
    const names = peopleOf(t.id).map(m => m.name);
    return names.length ? names.join(", ") : (t.assigned_to ?? null);
  };

  useEffect(() => {
    if (authLoading) return;
    setLoading(true);
    // o recorte por cliente acontece depois, ja considerando os varios
    // vinculos; a policy do banco continua limitando o que chega aqui
    const q  = supabase.from("tasks").select("*").order("created_at", { ascending: false });
    const pq = supabase.from("projects").select("id,name,client_id");
    Promise.all([
      q, pq,
      supabase.from("task_assignees").select("task_id,member_id"),
      supabase.from("departments").select("id,name,color,ordem,active").order("ordem"),
      supabase.from("task_clients").select("task_id,client_id"),
    ])
      .then(([t, p, a, d, tc]) => {
        const todas = (t.data as TaskRow[]) ?? [];
        setTasks(todas.filter(x => !x.parent_id));
        const subs: Record<string, TaskRow[]> = {};
        todas.filter(x => x.parent_id).forEach(x => {
          (subs[x.parent_id as string] ??= []).push(x);
        });
        setSubtasks(subs);
        setProjects((p.data as ProjectLite[]) ?? []);
        setDepts((d.data as DeptLite[]) ?? []);
        const map: AssigneeMap = {};
        ((a.data as { task_id: string; member_id: string }[]) ?? [])
          .forEach(r => { (map[r.task_id] ??= []).push(r.member_id); });
        setAssignees(map);
        const cmap: Record<string, string[]> = {};
        ((tc.data as { task_id: string; client_id: string }[]) ?? [])
          .forEach(r => { (cmap[r.task_id] ??= []).push(r.client_id); });
        setTaskClients(cmap);
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
      if (f.department === "sem" && t.department_id) return false;
      if (f.department !== "todos" && f.department !== "sem" && t.department_id !== f.department) return false;
      if (f.project === "sem" && t.project_id) return false;
      if (f.project !== "todos" && f.project !== "sem" && t.project_id !== f.project) return false;
      const cls_ = clientesDe(t);
      if (scopedClientId && !cls_.includes(scopedClientId)) return false;
      if (f.client === "interno" && cls_.length) return false;
      if (f.client !== "todos" && f.client !== "interno" && !cls_.includes(f.client)) return false;
      const people = assignees[t.id] ?? [];
      if (f.assigned === "sem" && people.length) return false;
      if (f.assigned === "eu" && !(myMemberId && people.includes(myMemberId))) return false;
      if (!["todos", "sem", "eu"].includes(f.assigned) && !people.includes(f.assigned)) return false;
      if (f.overdue && !isOverdue(t)) return false;
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks, view.filters, team, myMemberId, assignees, depts, taskClients, adminClients, scopedClientId]);

  // ── Ordenacao ────────────────────────────────────────────────
  const sortValue = (t: TaskRow, key: ColKey): string | number => {
    switch (key) {
      case "title":       return t.title.toLowerCase();
      case "status":      return colIndex(t.status);
      case "priority":    return PRIO_ORDER[t.priority];
      case "department":  return dept(t.department_id)?.ordem ?? 9999;
      case "project":     return (projectName(t.project_id) ?? "￿").toLowerCase();
      case "client":      return (nomesClientes(t)[0] ?? "\uffff").toLowerCase();
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
  }, [filtered, view.sortBy, view.sortDir, projects, adminClients, team, assignees, depts]);

  // Concluidas saem dos grupos e vao para uma secao propria no fim
  const emAberto = view.ocultarConcluidas
    ? sorted.filter(t => t.status !== "concluida")
    : sorted;
  const concluidas = view.ocultarConcluidas
    ? sorted.filter(t => t.status === "concluida" && concluidaRecente(t, view.diasConcluidas))
    : [];

  // ── Agrupamento ──────────────────────────────────────────────
  const groups = useMemo(() => {
    const g = view.groupBy;
    if (g === "none") return [{ key: "all", label: "", items: emAberto }];
    const map = new Map<string, { key: string; label: string; items: TaskRow[]; order: number }>();
    emAberto.forEach(t => {
      let key: string, label: string, order = 0;
      switch (g) {
        case "status":      key = t.status; label = statusLabel(t.status); order = colIndex(t.status); break;
        case "priority":    key = t.priority; label = PRIO[t.priority].label; order = PRIO_ORDER[t.priority]; break;
        case "department": {
          const d = dept(t.department_id);
          key = d?.id ?? "sem"; label = d?.name ?? "Sem departamento"; order = d?.ordem ?? 9999;
          break;
        }
        case "project":     key = t.project_id ?? "sem"; label = projectName(t.project_id) ?? "Sem projeto"; order = t.project_id ? 0 : 1; break;
        case "client": {
          const ids = clientesDe(t);
          if (!ids.length) { key = "interno"; label = "Interno (agencia)"; order = 1; break; }
          // atendendo varios clientes, a tarefa aparece em cada um
          ids.forEach(cid => {
            const nome = adminClients.find(c => c.id === cid)?.name ?? "Cliente";
            if (!map.has(cid)) map.set(cid, { key: cid, label: nome, items: [], order: 0 });
            map.get(cid)!.items.push(t);
          });
          return;
        }
        case "assigned_to": {
          const ppl = peopleOf(t.id);
          if (!ppl.length) { key = "sem"; label = "Sem responsavel"; order = 1; break; }
          // com varias pessoas a tarefa entra no grupo de cada uma
          ppl.forEach(m => {
            if (!map.has(m.id)) map.set(m.id, { key: m.id, label: m.name, items: [], order: 0 });
            map.get(m.id)!.items.push(t);
          });
          return;
        }
        default:            key = "all"; label = "";
      }
      if (!map.has(key)) map.set(key, { key, label, items: [], order });
      map.get(key)!.items.push(t);
    });
    return [...map.values()].sort((a, b) => a.order - b.order || a.label.localeCompare(b.label));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [emAberto, view.groupBy, projects, adminClients, team, assignees, depts]);

  // ── Carga por membro (cards da equipe) ───────────────────────
  const workload = useMemo(() => {
    const base = tasks.filter(t => t.status !== "concluida");
    return team.filter(m => m.active).map(m => {
      const mine = base.filter(t => (assignees[t.id] ?? []).includes(m.id));
      return {
        member: m,
        abertas: mine.length,
        atrasadas: mine.filter(isOverdue).length,
        andamento: mine.filter(t => t.status === "em_andamento").length,
      };
    }).sort((a, b) => b.abertas - a.abertas);
  }, [tasks, team, assignees]);

  const semDono = tasks.filter(t => t.status !== "concluida" && !(assignees[t.id] ?? []).length).length;

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

  // grava um campo direto da linha, sem abrir a tarefa
  const setField = (id: string, changes: Partial<TaskRow>, msg: string) =>
    patchTask(id, changes, msg);

  async function salvarTitulo() {
    if (!editing) return;
    const t = tasks.find(x => x.id === editing.id);
    const novo = editing.value.trim();
    setEditing(null);
    if (!t || !novo || novo === t.title) return;
    await patchTask(editing.id, { title: novo }, "Nao foi possivel renomear a tarefa.");
  }

  // liga ou desliga um cliente da tarefa, mantendo client_id como principal
  async function toggleClienteNaLinha(t: TaskRow, clientId: string) {
    const atuais = clientesDe(t);
    const on = atuais.includes(clientId);
    const novos = on ? atuais.filter(x => x !== clientId) : [...atuais, clientId];
    setTaskClients(cur => ({ ...cur, [t.id]: novos }));

    const { error } = on
      ? await supabase.from("task_clients").delete()
          .eq("task_id", t.id).eq("client_id", clientId)
      : await supabase.from("task_clients").insert({ task_id: t.id, client_id: clientId });
    if (error) {
      setTaskClients(cur => ({ ...cur, [t.id]: atuais }));
      setErro("Nao foi possivel alterar os clientes.");
      return;
    }
    // o campo principal acompanha o primeiro vinculo
    const principal = novos[0] ?? null;
    if (principal !== t.client_id) {
      await patchTask(t.id, { client_id: principal }, "Nao foi possivel alterar o cliente principal.");
    }
  }

  // Cadastro rapido a partir da propria lista
  async function criarDepartamentoNaLinha(t: TaskRow, nome: string) {
    const ordem = (depts.reduce((m, d) => Math.max(m, d.ordem), 0) || 0) + 10;
    const { data, error } = await supabase.from("departments")
      .insert({ name: nome, ordem }).select().single();
    if (error) { setErro("Nao foi possivel criar o departamento: " + error.message); return; }
    const novo = data as DeptLite;
    setDepts(cur => [...cur, novo].sort((a, b) => a.ordem - b.ordem));
    await patchTask(t.id, { department_id: novo.id }, "Nao foi possivel aplicar o departamento.");
  }

  async function criarProjetoNaLinha(t: TaskRow, nome: string) {
    const { data, error } = await supabase.from("projects")
      .insert({ name: nome, client_id: t.client_id ?? null }).select().single();
    if (error) { setErro("Nao foi possivel criar o projeto: " + error.message); return; }
    const novo = data as ProjectLite;
    setProjects(cur => [...cur, novo]);
    await patchTask(t.id, { project_id: novo.id }, "Nao foi possivel aplicar o projeto.");
  }

  async function criarClienteNaLinha(t: TaskRow, nome: string) {
    const { data, error } = await supabase.from("clients")
      .insert({ name: nome, active: true }).select().single();
    if (error) { setErro("Nao foi possivel criar o cliente: " + error.message); return; }
    await reloadClients();
    await toggleClienteNaLinha(t, (data as { id: string }).id);
  }

  async function duplicar(t: TaskRow) {
    const { data, error } = await supabase.rpc("duplicar_tarefa", { origem: t.id });
    if (error || !data) { setErro("Nao foi possivel duplicar: " + (error?.message ?? "")); return; }
    const { data: nova } = await supabase.from("tasks").select("*").eq("id", data).maybeSingle();
    if (nova) {
      setTasks(cur => [nova as TaskRow, ...cur]);
      setAssignees(cur => ({ ...cur, [(nova as TaskRow).id]: assignees[t.id] ?? [] }));
      setTaskClients(cur => ({ ...cur, [(nova as TaskRow).id]: clientesDe(t) }));
      setPeekId((nova as TaskRow).id);
    }
  }

  async function toggleAssigneeNaLinha(taskId: string, memberId: string) {
    const atuais = assignees[taskId] ?? [];
    const on = atuais.includes(memberId);
    const novos = on ? atuais.filter(x => x !== memberId) : [...atuais, memberId];
    setAssignees(cur => ({ ...cur, [taskId]: novos }));
    const { error } = on
      ? await supabase.from("task_assignees").delete()
          .eq("task_id", taskId).eq("member_id", memberId)
      : await supabase.from("task_assignees").insert({ task_id: taskId, member_id: memberId });
    if (error) {
      setAssignees(cur => ({ ...cur, [taskId]: atuais }));
      setErro("Nao foi possivel alterar os responsaveis.");
    }
  }

  const setStatus = (id: string, s: Status) =>
    patchTask(id, { status: s }, "Nao foi possivel alterar a etapa.");

  function toggleDone(t: TaskRow) {
    setStatus(t.id, t.status === "concluida" ? "em_andamento" : "concluida");
  }

  function move(id: string, dir: -1 | 1) {
    const t = tasks.find(x => x.id === id);
    if (!t) return;
    const next = COLUMNS[colIndex(t.status) + dir];
    if (next) setStatus(id, next.key);
  }

  // Cria a tarefa na hora. O contexto vem do grupo onde o botao
  // foi usado: criar dentro de "Trafego Pago" ja nasce nesse
  // departamento, sem precisar preencher formulario antes.
  async function criarTarefa(titulo: string, contexto: Partial<TaskRow> = {}) {
    const nome = titulo.trim();
    if (!nome) return null;

    const base: Partial<TaskRow> = {
      client_id: (isStaff ? adminClientId : scopedClientId) ?? null,
      status: "backlog",
      priority: "media",
      ...contexto,
      title: nome,
    };

    const { data, error } = await supabase.from("tasks").insert(base).select().single();
    if (error) { setErro("Nao foi possivel criar: " + error.message); return null; }
    const nova = data as TaskRow;

    // quem cria ja entra como responsavel, e o cliente em contexto e vinculado
    if (myMemberId) {
      await supabase.from("task_assignees").insert({ task_id: nova.id, member_id: myMemberId });
      setAssignees(cur => ({ ...cur, [nova.id]: [myMemberId] }));
    }
    if (nova.client_id) {
      await supabase.from("task_clients").insert({ task_id: nova.id, client_id: nova.client_id });
      setTaskClients(cur => ({ ...cur, [nova.id]: [nova.client_id as string] }));
    }

    setTasks(cur => [nova, ...cur]);
    return nova;
  }

  // contexto implicito de cada grupo, conforme o agrupamento ativo
  function contextoDoGrupo(chave: string): Partial<TaskRow> {
    if (chave === "all" || chave === "sem") return {};
    switch (view.groupBy) {
      case "status":      return { status: chave as Status };
      case "priority":    return { priority: chave as Priority };
      case "department":  return { department_id: chave };
      case "project":     return { project_id: chave };
      case "client":      return { client_id: chave };
      default:            return {};
    }
  }

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
  // Celulas: leem-se como texto e viram menu ao clicar, sem cara de formulario
  const STATUS_DOT: Record<Status, "ok" | "warn" | "bad" | "neutral"> = {
    backlog: "neutral", em_andamento: "warn", aguardando: "bad", concluida: "ok",
  };
  const vazio = <span className="opacity-30">Vazio</span>;

  function cell(col: ColKey, t: TaskRow): ReactNode {
    switch (col) {
      case "title": {
        const emEdicao = editing?.id === t.id;
        return (
          <div className="flex items-center gap-2 min-w-0 pr-2">
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

            {emEdicao ? (
              <input
                autoFocus
                className="text-[13px] font-medium border hairline rounded px-1.5 h-7 bg-white dark:bg-[#11141b] w-full"
                value={editing.value}
                onChange={e => setEditing({ id: t.id, value: e.target.value })}
                onBlur={salvarTitulo}
                onKeyDown={e => {
                  if (e.key === "Enter") salvarTitulo();
                  if (e.key === "Escape") setEditing(null);
                }}
              />
            ) : (
              <>
                <button
                  className={cls("text-left font-medium truncate flex-1 min-w-0 rounded px-1 h-7 flex items-center",
                    "hover:bg-black/[0.04] dark:hover:bg-white/[0.06] transition-colors",
                    t.status === "concluida" && "line-through opacity-45")}
                  onClick={() => setPeekId(t.id)}
                  onDoubleClick={e => { e.stopPropagation(); setEditing({ id: t.id, value: t.title }); }}
                  title={`${t.title}

Clique para abrir, clique duplo para renomear`}
                >
                  {t.title}
                </button>
                {(subtasks[t.id]?.length ?? 0) > 0 && (
                  <span className="text-[11px] opacity-45 shrink-0 tabular"
                    title="Subtarefas concluidas">
                    {subtasks[t.id].filter(x => x.status === "concluida").length}/{subtasks[t.id].length}
                  </span>
                )}
                {t.repeat_rule && (
                  <span className="text-[11px] opacity-40 shrink-0" title="Tarefa que se repete">⟳</span>
                )}
              </>
            )}
          </div>
        );
      }

      case "status":
        return (
          <CellPicker title="Alterar etapa"
            trigger={
              <span className="inline-flex items-center gap-1.5 min-w-0">
                <StatusDot status={STATUS_DOT[t.status]} />
                <span className="truncate">
                  {COLUMNS.find(c => c.key === t.status)?.short ?? statusLabel(t.status)}
                </span>
              </span>
            }>
            {fechar => COLUMNS.map(c => (
              <MenuItem key={c.key} selecionado={t.status === c.key}
                onClick={() => { setStatus(t.id, c.key); fechar(); }}>
                <span className="inline-flex items-center gap-2">
                  <StatusDot status={STATUS_DOT[c.key]} />{c.label}
                </span>
              </MenuItem>
            ))}
          </CellPicker>
        );

      case "priority":
        return (
          <CellPicker title="Alterar prioridade" width={180}
            trigger={<Badge label={PRIO[t.priority].label} color={PRIO[t.priority].color} />}>
            {fechar => PRIORITIES.map(pr => (
              <MenuItem key={pr} selecionado={t.priority === pr}
                onClick={() => {
                  setField(t.id, { priority: pr }, "Nao foi possivel alterar a prioridade.");
                  fechar();
                }}>
                <Badge label={PRIO[pr].label} color={PRIO[pr].color} />
              </MenuItem>
            ))}
          </CellPicker>
        );

      case "department": {
        const d = dept(t.department_id);
        return (
          <CellPicker title="Alterar departamento" busca={depts.length > 8}
            placeholder="Buscar departamento..."
            aoCriar={isAdmin ? (nome => criarDepartamentoNaLinha(t, nome)) : undefined}
            criarRotulo="Novo departamento"
            trigger={
              d
                ? <span className="inline-flex items-center gap-1.5 min-w-0">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ background: d.color }} />
                    <span className="truncate">{d.name}</span>
                  </span>
                : vazio
            }>
            {fechar => (
              <>
                <MenuItem selecionado={!t.department_id}
                  onClick={() => {
                    setField(t.id, { department_id: null }, "Nao foi possivel alterar o departamento.");
                    fechar();
                  }}>
                  <span className="opacity-50">Sem departamento</span>
                </MenuItem>
                {depts.filter(x => x.active).map(x => (
                  <MenuItem key={x.id} selecionado={t.department_id === x.id}
                    onClick={() => {
                      setField(t.id, { department_id: x.id }, "Nao foi possivel alterar o departamento.");
                      fechar();
                    }}>
                    <span className="inline-flex items-center gap-2 min-w-0">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: x.color }} />
                      <span className="truncate">{x.name}</span>
                    </span>
                  </MenuItem>
                ))}
              </>
            )}
          </CellPicker>
        );
      }

      case "project": {
        const nome = projectName(t.project_id);
        const disponiveis = projects.filter(pj =>
          !t.client_id || pj.client_id === t.client_id || !pj.client_id);
        return (
          <CellPicker title="Alterar projeto" busca={projects.length > 8}
            placeholder="Buscar projeto..."
            aoCriar={nome => criarProjetoNaLinha(t, nome)} criarRotulo="Novo projeto"
            trigger={<span className="truncate">{nome ?? vazio}</span>}>
            {fechar => (
              <>
                <MenuItem selecionado={!t.project_id}
                  onClick={() => {
                    setField(t.id, { project_id: null }, "Nao foi possivel alterar o projeto.");
                    fechar();
                  }}>
                  <span className="opacity-50">Sem projeto</span>
                </MenuItem>
                {disponiveis.map(pj => (
                  <MenuItem key={pj.id} selecionado={t.project_id === pj.id}
                    onClick={() => {
                      setField(t.id, { project_id: pj.id }, "Nao foi possivel alterar o projeto.");
                      fechar();
                    }}>
                    {pj.name}
                  </MenuItem>
                ))}
                {disponiveis.length === 0 && (
                  <p className="text-[12px] opacity-45 px-2 py-1.5">Nenhum projeto para este cliente.</p>
                )}
              </>
            )}
          </CellPicker>
        );
      }

      case "client": {
        const ids = clientesDe(t);
        const nomes = nomesClientes(t);
        return (
          <CellPicker title="Alterar clientes" busca={adminClients.length > 8}
            placeholder="Buscar cliente..."
            aoCriar={isAdmin ? (nome => criarClienteNaLinha(t, nome)) : undefined}
            criarRotulo="Novo cliente"
            trigger={
              ids.length === 0
                ? <span className="truncate opacity-55">Interno</span>
                : ids.length === 1
                  ? <span className="truncate">{nomes[0]}</span>
                  : <span className="truncate" title={nomes.join(", ")}>
                      {nomes[0]} <span className="opacity-50">+{ids.length - 1}</span>
                    </span>
            }>
            {() => (
              <>
                <div className="text-[11px] uppercase tracking-wide opacity-50 px-2 py-1">
                  Clientes atendidos
                </div>
                {adminClients.map(c => (
                  <MenuItem key={c.id} selecionado={ids.includes(c.id)}
                    onClick={() => toggleClienteNaLinha(t, c.id)}>
                    {c.name}
                  </MenuItem>
                ))}
                {adminClients.length === 0 && (
                  <p className="text-[12px] opacity-45 px-2 py-1.5">Nenhum cliente disponivel.</p>
                )}
              </>
            )}
          </CellPicker>
        );
      }

      case "assigned_to":
        return (
          <CellPicker title="Alterar responsaveis" busca={team.length > 8}
            placeholder="Buscar pessoa..."
            trigger={<AvatarStack people={peopleOf(t.id)} size={22} empty="Vazio" />}>
            {() => (
              team.filter(m => m.active).length === 0
                ? <p className="text-[12px] opacity-45 px-2 py-1.5">Cadastre a equipe primeiro.</p>
                : <>
                    {team.filter(m => m.active).map(m => (
                      <MenuItem key={m.id}
                        selecionado={(assignees[t.id] ?? []).includes(m.id)}
                        onClick={() => toggleAssigneeNaLinha(t.id, m.id)}>
                        <span className="inline-flex items-center gap-2 min-w-0">
                          <Avatar name={m.name} color={m.color} size={20} />
                          <span className="truncate">{m.name}</span>
                        </span>
                      </MenuItem>
                    ))}
                  </>
            )}
          </CellPicker>
        );

      case "due_date": {
        const atrasada = isOverdue(t);
        return (
          <CellPicker title="Alterar prazo" width={250}
            trigger={
              <span className="truncate" style={atrasada ? { color: "var(--bad)", fontWeight: 600 } : {}}>
                {t.due_date ? dueLabelCurto(t.due_date, t.status) : vazio}
              </span>
            }>
            {fechar => (
              <MenuData
                valor={t.due_date}
                onFechar={fechar}
                onSalvar={d => setField(t.id, { due_date: d }, "Nao foi possivel alterar o prazo.")}
              />
            )}
          </CellPicker>
        );
      }

      case "created_at":
        return <span className="opacity-55 px-1.5">{fmtDate(t.created_at.slice(0, 10))}</span>;
    }
  }

  // No celular a tabela obrigaria rolagem lateral e esconderia
  // quase tudo, entao cada tarefa vira um cartao com o conteudo aberto.
  function CardMobile({ t }: { t: TaskRow }) {
    const d = dept(t.department_id);
    const nomes = nomesClientes(t);
    const pessoas = peopleOf(t.id);
    const subs = subtasks[t.id] ?? [];
    const feito = t.status === "concluida";
    const atrasada = isOverdue(t);

    return (
      <div className="py-3 border-b hairline last:border-0 flex flex-col gap-2">
        <div className="flex items-start gap-2.5">
          <button
            onClick={() => toggleDone(t)}
            className="w-[18px] h-[18px] mt-0.5 rounded-full border-2 shrink-0 flex items-center justify-center"
            style={feito
              ? { background: "var(--ok)", borderColor: "var(--ok)", color: "white" }
              : { borderColor: "var(--line-light)" }}
            aria-label={feito ? "Reabrir tarefa" : "Concluir tarefa"}
          >
            {feito && <span className="text-[10px] leading-none">✓</span>}
          </button>

          <button className={cls("text-left text-[14px] font-medium leading-snug flex-1 min-w-0",
            feito && "line-through opacity-45")}
            onClick={() => setPeekId(t.id)}>
            {t.title}
          </button>

          <Badge label={PRIO[t.priority].label} color={PRIO[t.priority].color} />
        </div>

        {/* contexto: departamento e clientes, sem cortar */}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 pl-[27px] text-[12px]">
          {d && (
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full shrink-0" style={{ background: d.color }} />
              {d.name}
            </span>
          )}
          {d && nomes.length > 0 && <span className="opacity-25">·</span>}
          {nomes.length > 0 && (
            <span className="opacity-70" title={nomes.join(", ")}>
              {nomes.slice(0, 2).join(", ")}
              {nomes.length > 2 && (
                <span className="opacity-70"> +{nomes.length - 2}</span>
              )}
            </span>
          )}
          {projectName(t.project_id) && (
            <>
              <span className="opacity-25">·</span>
              <span className="opacity-60">{projectName(t.project_id)}</span>
            </>
          )}
        </div>

        {/* quem faz, quando vence e progresso */}
        <div className="flex items-center gap-3 flex-wrap pl-[27px] text-[12px]">
          {pessoas.length > 0 ? (
            <span className="inline-flex items-center gap-1.5 min-w-0">
              <AvatarStack people={pessoas} size={20} max={3} empty="" />
              <span className="opacity-70 truncate">
                {pessoas.map(m => m.name.split(" ")[0]).join(", ")}
              </span>
            </span>
          ) : (
            <span className="opacity-35">Sem responsavel</span>
          )}

          {t.due_date && (
            <span style={atrasada ? { color: "var(--bad)", fontWeight: 600 } : { opacity: 0.7 }}>
              {dueLabel(t.due_date, t.status)}
            </span>
          )}

          {subs.length > 0 && (
            <span className="opacity-55 tabular">
              {subs.filter(x => x.status === "concluida").length}/{subs.length} subtarefas
            </span>
          )}

          {t.repeat_rule && <span className="opacity-45" title="Repete">⟳</span>}
        </div>

        <div className="flex items-center gap-3 pl-[27px]">
          <span className="inline-flex items-center gap-1.5 text-[11px] opacity-55">
            <StatusDot status={
              t.status === "concluida" ? "ok"
              : t.status === "em_andamento" ? "warn"
              : t.status === "aguardando" ? "bad" : "neutral"} />
            {statusLabel(t.status)}
          </span>
          <button className="text-[11px] opacity-45 ml-auto" onClick={() => duplicar(t)}>Duplicar</button>
          <button className="text-[11px] font-semibold" style={{ color: "var(--copper)" }}
            onClick={() => setPeekId(t.id)}>Abrir</button>
        </div>
      </div>
    );
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
            {isStaff && (
              <select className="text-xs border hairline rounded px-2 py-1.5 bg-white dark:bg-[#11141b]"
                value={adminClientId ?? ""} onChange={e => setAdminClientId(e.target.value || null)}>
                <option value="">Todos os clientes</option>
                {adminClients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            )}
            <Btn size="sm" disabled={criandoTopo}
              onClick={async () => {
                setCriandoTopo(true);
                const nova = await criarTarefa("Nova tarefa");
                setCriandoTopo(false);
                if (nova) { setRecemCriada(nova.id); setPeekId(nova.id); }
              }}>
              {criandoTopo ? "Criando..." : "+ Nova tarefa"}
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
          <div className="faixa-rolavel flex gap-3 -mx-4 px-4 pb-1 mb-4 sm:mx-0 sm:px-0 sm:flex-wrap sm:overflow-visible">
            {myMemberId && (
              <button
                onClick={() => updF({ assigned: fa === "eu" ? "todos" : "eu" })}
                className="border hairline rounded-xl px-3 py-2 sm:py-3 bg-white dark:bg-[#11141b] shadow-sm shrink-0
                           flex items-center gap-2.5 min-w-[160px] sm:min-w-[170px] transition-colors text-left"
                style={fa === "eu" ? { borderColor: "var(--brand)", boxShadow: "0 0 0 1px var(--brand)" } : {}}
              >
                <Avatar name={eu?.name ?? "Eu"} color={eu?.color} size={30} />
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
                className="border hairline rounded-xl px-3 py-2 sm:py-3 bg-white dark:bg-[#11141b] shadow-sm shrink-0
                           flex items-center gap-2.5 min-w-[160px] sm:min-w-[170px] transition-colors text-left"
                style={fa === w.member.id ? { borderColor: "var(--brand)", boxShadow: "0 0 0 1px var(--brand)" } : {}}
              >
                <Avatar name={w.member.name} color={w.member.color} size={30} />
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
                className="border border-dashed hairline rounded-xl px-3 py-2 sm:py-3 shrink-0
                           flex items-center gap-2.5 min-w-[145px] transition-colors text-left"
                style={fa === "sem" ? { borderColor: "var(--brand)", borderStyle: "solid" } : {}}
              >
                <span className="w-[30px] h-[30px] rounded-full border border-dashed hairline shrink-0
                                 flex items-center justify-center text-[12px] opacity-35">?</span>
                <div className="min-w-0">
                  <div className="text-[13px] font-semibold truncate">Sem responsavel</div>
                  <div className="text-[11px] opacity-55">{semDono} abertas</div>
                </div>
              </button>
            )}
          </div>
        )}

        {/* Barra de controles */}
        <div className="faixa-rolavel flex items-center gap-2 mb-3 -mx-4 px-4 sm:mx-0 sm:px-0 pb-1">
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
            style={!view.ocultarConcluidas ? { borderColor: "var(--ok)", color: "var(--ok)" } : {}}
            onClick={() => upd({ ocultarConcluidas: !view.ocultarConcluidas })}
            title={view.ocultarConcluidas
              ? "As concluidas estao reunidas no fim da lista"
              : "As concluidas estao misturadas com as demais"}>
            {view.ocultarConcluidas ? "Ocultando concluidas" : "Mostrando concluidas"}
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
            <button className={cls(ctrlBtn, "hidden md:inline-flex")}
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
            className="hidden sm:block text-[12px] border hairline rounded-lg px-2.5 py-1.5 bg-white dark:bg-[#11141b] min-w-[150px] shrink-0"
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

        <input
          className="sm:hidden w-full text-[13px] border hairline rounded-lg px-3 py-2 mb-3 bg-white dark:bg-[#11141b]"
          placeholder="Buscar tarefa..."
          value={view.filters.search}
          onChange={e => updF({ search: e.target.value })}
        />

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
                  <span className="text-[11px] opacity-55 uppercase tracking-wide">Departamento</span>
                  <select className="text-sm border hairline rounded px-2 py-1.5 bg-white dark:bg-[#11141b]"
                    value={view.filters.department} onChange={e => updF({ department: e.target.value })}>
                    <option value="todos">Todos</option>
                    <option value="sem">Sem departamento</option>
                    {depts.filter(d => d.active).map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </label>
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
              onClick={() => upd({ columns: defaultView().columns })}>
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

        {/* Conteudo */}
        {loading ? (
          <p className="text-[13px] opacity-40 text-center py-16">Carregando...</p>
        ) : tasks.length === 0 ? (
          <SectionCard>
            <EmptyState title="Nenhuma tarefa"
              sub="Crie a primeira tarefa e detalhe no painel que abre."
              action={
                <Btn size="sm" disabled={criandoTopo}
                  onClick={async () => {
                    setCriandoTopo(true);
                    const nova = await criarTarefa("Nova tarefa");
                    setCriandoTopo(false);
                    if (nova) setPeekId(nova.id);
                  }}>
                  + Nova tarefa
                </Btn>
              } />
          </SectionCard>
        ) : filtered.length === 0 ? (
          <SectionCard>
            <EmptyState title="Nenhuma tarefa neste filtro"
              sub="Ajuste ou limpe os filtros para ver mais resultados."
              action={<Btn size="sm" variant="ghost" onClick={() => updF(emptyFilters())}>Limpar filtros</Btn>} />
          </SectionCard>
        ) : view.mode === "quadro" ? (
          <div className="faixa-rolavel flex gap-3 -mx-4 px-4 pb-2 snap-x snap-mandatory
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
                      return (
                        <div key={t.id} className="border hairline rounded-lg p-3 bg-white dark:bg-[#11141b] shadow-sm flex flex-col gap-2">
                          <div className="flex items-start justify-between gap-2">
                            <button className="text-[13px] font-medium leading-snug text-left hover:underline underline-offset-2"
                              onClick={() => setPeekId(t.id)}>{t.title}</button>
                            <Badge label={PRIO[t.priority].label} color={PRIO[t.priority].color} />
                          </div>
                          {t.project_id && (
                            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full w-fit"
                              style={{ background: "rgba(168,87,48,.12)", color: "var(--copper)" }}>
                              {projectName(t.project_id)}
                            </span>
                          )}
                          <div className="flex items-center gap-2 flex-wrap text-[11px] opacity-60">
                            <AvatarStack people={peopleOf(t.id)} size={18} max={4} />
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
                              onClick={() => setPeekId(t.id)}>Abrir</button>
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
                {/* celular: cartoes com tudo visivel */}
                <div className="md:hidden flex flex-col -my-1">
                  {g.items.map(t => <CardMobile key={t.id} t={t} />)}
                </div>

                {/* desktop: tabela com colunas configuraveis */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full border-collapse" style={{ tableLayout: "fixed" }}>
                    <thead>
                      <tr className="border-b hairline">
                        {orderedCols.map(c => {
                          const active = view.sortBy === c.key;
                          return (
                            <th key={c.key}
                              style={c.width ? { width: c.width } : undefined}
                              className={cls("text-[11px] font-semibold uppercase tracking-wide opacity-50 text-left py-2.5 px-3 whitespace-nowrap",
                                c.key === "title" && "min-w-[240px]")}>
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
                          className={cls("border-b hairline last:border-0 transition-colors group",
                            peekId === t.id
                              ? "bg-black/[0.04] dark:bg-white/[0.05]"
                              : "hover:bg-black/[0.02] dark:hover:bg-white/[0.02]")}>
                          {orderedCols.map(c => (
                            <td key={c.key}
                              style={c.width ? { width: c.width } : undefined}
                              className="py-1.5 px-3 text-[13px] tabular align-middle">
                              {cell(c.key, t)}
                            </td>
                          ))}
                          <td className="py-2.5 px-2 text-right whitespace-nowrap">
                            <button className="text-[11px] opacity-0 group-hover:opacity-45 hover:!opacity-100 px-1"
                              onClick={() => duplicar(t)} title="Duplicar tarefa">⧉</button>
                            <button className="text-[11px] opacity-35 hover:opacity-100 px-1"
                              onClick={() => setPeekId(t.id)} title="Abrir tarefa">›</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* criar sem sair da lista, ja no contexto deste grupo */}
                <div className="pt-2 mt-1 border-t hairline">
                  {novaEmGrupo === g.key ? (
                    <input
                      autoFocus
                      className="w-full text-[13px] border hairline rounded px-2 py-1.5 bg-white dark:bg-[#11141b]"
                      placeholder="Titulo da tarefa, Enter para criar"
                      value={tituloNovo}
                      onChange={e => setTituloNovo(e.target.value)}
                      onKeyDown={async e => {
                        if (e.key === "Escape") { setNovaEmGrupo(null); setTituloNovo(""); }
                        if (e.key === "Enter" && tituloNovo.trim()) {
                          const t = tituloNovo;
                          setTituloNovo("");
                          await criarTarefa(t, contextoDoGrupo(g.key));
                        }
                      }}
                      onBlur={() => { if (!tituloNovo.trim()) setNovaEmGrupo(null); }}
                    />
                  ) : (
                    <button
                      className="text-[13px] opacity-45 hover:opacity-90 py-1 px-1"
                      onClick={() => { setNovaEmGrupo(g.key); setTituloNovo(""); }}>
                      + Adicionar tarefa
                      {view.groupBy !== "none" && g.label && (
                        <span className="opacity-70"> em {g.label}</span>
                      )}
                    </button>
                  )}
                </div>
              </SectionCard>
            ))}

            {/* Concluidas saem da lista e ficam reunidas aqui */}
            {view.ocultarConcluidas && concluidas.length > 0 && (
              <div className="border hairline rounded-xl bg-white dark:bg-[#11141b]">
                <button
                  onClick={() => setVerConcluidas(v => !v)}
                  className="w-full flex items-center justify-between gap-3 px-4 sm:px-5 py-3 text-left"
                >
                  <span className="flex items-center gap-2 min-w-0">
                    <StatusDot status="ok" />
                    <span className="font-semibold text-[14px]" style={{ color: "var(--brand)" }}>
                      Concluidas
                    </span>
                    <span className="text-[12px] opacity-45">
                      {concluidas.length} {view.diasConcluidas > 0 && `nos ultimos ${view.diasConcluidas} dias`}
                    </span>
                  </span>
                  <span className="text-xs opacity-45 shrink-0">{verConcluidas ? "ocultar" : "mostrar"}</span>
                </button>

                {verConcluidas && (
                  <div className="border-t hairline px-4 sm:px-5 py-2">
                    {concluidas.map(t => (
                      <div key={t.id}
                        className="flex items-center gap-3 py-2 border-b hairline last:border-0">
                        <button
                          onClick={() => toggleDone(t)}
                          className="w-4 h-4 rounded-full shrink-0 flex items-center justify-center"
                          style={{ background: "var(--ok)", color: "white" }}
                          title="Reabrir tarefa">
                          <span className="text-[9px] leading-none">✓</span>
                        </button>
                        <button
                          className="text-[13px] line-through opacity-50 truncate flex-1 min-w-0 text-left hover:opacity-80"
                          onClick={() => setPeekId(t.id)}>
                          {t.title}
                        </button>
                        <span className="text-[11px] opacity-40 shrink-0 hidden sm:inline">
                          {dept(t.department_id)?.name ?? ""}
                        </span>
                        <AvatarStack people={peopleOf(t.id)} size={18} max={2} empty="" />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </PageWrap>

      {/* Painel lateral da tarefa, no lugar de trocar de pagina */}
      {peekId && (
        <>
          <div className="fixed inset-0 z-40 bg-black/20 dark:bg-black/50 veu-entra"
            onClick={() => setPeekId(null)} aria-hidden="true" />
          <aside
            className="fixed inset-y-0 right-0 z-50 w-full sm:w-[480px] lg:w-[560px] xl:w-[600px]
                       shadow-2xl border-l hairline flex flex-col painel-entra"
            style={{ background: "var(--paper)" }}
            role="dialog" aria-label="Detalhes da tarefa"
          >
            <TarefaPainel
              taskId={peekId}
              variant="painel"
              focarTitulo={recemCriada === peekId}
              onClose={() => { setPeekId(null); setRecemCriada(null); }}
              onChanged={(t, ppl) => {
                setTasks(cur => cur.map(x => x.id === t.id ? t : x));
                setAssignees(cur => ({ ...cur, [t.id]: ppl }));
              }}
              onDeleted={id => {
                setTasks(cur => cur.filter(x => x.id !== id));
                setPeekId(null);
              }}
              onDuplicated={async novaId => {
                const { data } = await supabase.from("tasks").select("*").eq("id", novaId).maybeSingle();
                if (data) setTasks(cur => [data as TaskRow, ...cur]);
                setPeekId(novaId);
              }}
            />
          </aside>
        </>
      )}
    </>
  );
}
