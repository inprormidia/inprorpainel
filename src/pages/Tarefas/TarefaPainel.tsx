import { useState, useEffect, useCallback, useRef } from "react";
import { Link } from "react-router";
import {
  SectionCard, Badge, Btn, StatusDot, EmptyState, Avatar, AvatarStack, CellPicker, MenuItem, MenuData,
} from "../../components/ui/InprorComponents";
import { useClientScope } from "../../context/AuthContext";
import { supabase } from "../../lib/supabase";
import TarefaAtividade from "./TarefaAtividade";
import TextoFormatado from "../../components/ui/TextoFormatado";
import {
  TaskRow, ProjectLite, DeptLite, Status,
  COLUMNS, PRIO, PRIORITIES, REPEAT_OPTIONS, repeatLabel, colIndex, statusLabel,
  fmtDateTime, dueLabel, isOverdue,
} from "./shared";

type Variant = "pagina" | "painel";

interface Props {
  taskId: string;
  variant?: Variant;
  onClose?: () => void;
  // avisa a lista para refletir a alteracao sem recarregar tudo
  onChanged?: (task: TaskRow, assignees: string[]) => void;
  onDeleted?: (taskId: string) => void;
  onDuplicated?: (novaId: string) => void;
  // abre com o titulo selecionado, para renomear sem procurar o campo
  focarTitulo?: boolean;
}

export default function TarefaPainel({
  taskId, variant = "pagina", onClose, onChanged, onDeleted, onDuplicated, focarTitulo,
}: Props) {
  const { isAdmin, adminClients, authLoading, team, myMemberId,
          reloadTeam, reloadClients } = useClientScope();
  const painel = variant === "painel";

  const [task, setTask]         = useState<TaskRow | null>(null);
  const [projects, setProjects] = useState<ProjectLite[]>([]);
  const [depts, setDepts]       = useState<DeptLite[]>([]);
  const [clientes, setClientes] = useState<string[]>([]);
  const [subs, setSubs]         = useState<TaskRow[]>([]);
  const [novaSub, setNovaSub]   = useState("");
  const [duplicando, setDuplicando] = useState(false);
  // a descricao fica em leitura formatada ate voce clicar para editar
  const [editandoDesc, setEditandoDesc] = useState(false);
  const [assignees, setAssignees] = useState<string[]>([]);
  const [loading, setLoading]   = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [erro, setErro]         = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState(false);

  const [titleDraft, setTitleDraft] = useState("");
  const [descDraft, setDescDraft]   = useState("");
  const [dirty, setDirty]           = useState({ title: false, desc: false });
  const [savingText, setSavingText] = useState(false);
  const tituloRef = useRef<HTMLTextAreaElement>(null);

  // o campo do titulo cresce conforme o texto; sem isto, um titulo
  // longo abre cortado em uma linha ate alguem digitar nele
  const ajustarAltura = useCallback(() => {
    const el = tituloRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = el.scrollHeight + "px";
  }, []);

  useEffect(() => { ajustarAltura(); }, [titleDraft, ajustarAltura]);

  useEffect(() => {
    if (!focarTitulo || loading || !tituloRef.current) return;
    tituloRef.current.focus();
    tituloRef.current.select();
  }, [focarTitulo, loading]);

  useEffect(() => {
    if (authLoading || !taskId) return;
    setLoading(true);
    setNotFound(false);
    Promise.all([
      supabase.from("tasks").select("*").eq("id", taskId).maybeSingle(),
      supabase.from("projects").select("id,name,client_id"),
      supabase.from("task_assignees").select("member_id").eq("task_id", taskId),
      supabase.from("departments").select("id,name,color,ordem,active").order("ordem"),
      supabase.from("task_clients").select("client_id").eq("task_id", taskId),
      supabase.from("tasks").select("*").eq("parent_id", taskId).order("created_at"),
    ]).then(([t, p, a, d, tc, sb]) => {
      if (!t.data) { setNotFound(true); setLoading(false); return; }
      const row = t.data as TaskRow;
      setTask(row);
      setTitleDraft(row.title);
      setDescDraft(row.description ?? "");
      setDirty({ title: false, desc: false });
      setProjects((p.data as ProjectLite[]) ?? []);
      setAssignees(((a.data as { member_id: string }[]) ?? []).map(r => r.member_id));
      setDepts((d.data as DeptLite[]) ?? []);
      const vinculos = ((tc.data as { client_id: string }[]) ?? []).map(r => r.client_id);
      setClientes(vinculos.length ? vinculos : (row.client_id ? [row.client_id] : []));
      setSubs((sb.data as TaskRow[]) ?? []);
      setLoading(false);
    });
  }, [taskId, authLoading]);

  const patch = useCallback(async (changes: Partial<TaskRow>) => {
    if (!task) return false;
    const backup = task;
    setTask({ ...task, ...changes });
    const { data, error } = await supabase.from("tasks")
      .update(changes).eq("id", task.id).select().single();
    if (error) {
      setTask(backup);
      setErro("Nao foi possivel salvar: " + error.message);
      return false;
    }
    setTask(data as TaskRow);
    setErro(null);
    onChanged?.(data as TaskRow, assignees);
    return true;
  }, [task, assignees, onChanged]);

  async function saveTitle() {
    const v = titleDraft.trim();
    if (!task || !v || v === task.title) { setDirty(d => ({ ...d, title: false })); return; }
    setSavingText(true); await patch({ title: v }); setSavingText(false);
    setDirty(d => ({ ...d, title: false }));
  }

  async function saveDesc() {
    const v = descDraft.trim();
    if (!task || v === (task.description ?? "")) { setDirty(d => ({ ...d, desc: false })); return; }
    setSavingText(true); await patch({ description: v || null }); setSavingText(false);
    setDirty(d => ({ ...d, desc: false }));
  }

  // marca ou desmarca um item da lista de passos direto na leitura
  async function marcarPasso(indice: number, marcado: boolean) {
    if (!task?.description) return;
    const linhas = task.description.split("\n");
    linhas[indice] = linhas[indice].replace(
      /^(\s*[-*]\s+)\[[ xX]\]/,
      `$1[${marcado ? "x" : " "}]`,
    );
    const novo = linhas.join("\n");
    setDescDraft(novo);
    await patch({ description: novo });
  }

  async function toggleAssignee(memberId: string) {
    if (!task) return;
    const on = assignees.includes(memberId);
    const backup = assignees;
    const novos = on ? assignees.filter(x => x !== memberId) : [...assignees, memberId];
    setAssignees(novos);
    const { error } = on
      ? await supabase.from("task_assignees").delete()
          .eq("task_id", task.id).eq("member_id", memberId)
      : await supabase.from("task_assignees")
          .insert({ task_id: task.id, member_id: memberId });
    if (error) {
      setAssignees(backup);
      setErro("Nao foi possivel alterar os responsaveis.");
      return;
    }
    onChanged?.(task, novos);
  }

  // liga ou desliga um cliente, mantendo client_id como principal
  async function toggleCliente(clientId: string) {
    if (!task) return;
    const on = clientes.includes(clientId);
    const backup = clientes;
    const novos = on ? clientes.filter(x => x !== clientId) : [...clientes, clientId];
    setClientes(novos);

    const { error } = on
      ? await supabase.from("task_clients").delete()
          .eq("task_id", task.id).eq("client_id", clientId)
      : await supabase.from("task_clients").insert({ task_id: task.id, client_id: clientId });
    if (error) {
      setClientes(backup);
      setErro("Nao foi possivel alterar os clientes.");
      return;
    }
    const principal = novos[0] ?? null;
    if (principal !== task.client_id) await patch({ client_id: principal });
  }

  async function criarSubtarefa() {
    const titulo = novaSub.trim();
    if (!titulo || !task) return;
    const { data, error } = await supabase.from("tasks").insert({
      parent_id: task.id,
      client_id: task.client_id,
      project_id: task.project_id,
      department_id: task.department_id,
      title: titulo,
      status: "backlog",
      priority: task.priority,
    }).select().single();
    if (error) { setErro("Nao foi possivel criar a subtarefa: " + error.message); return; }
    setSubs(cur => [...cur, data as TaskRow]);
    setNovaSub("");
  }

  async function alternarSub(sub: TaskRow) {
    const novo = sub.status === "concluida" ? "backlog" : "concluida";
    const backup = subs;
    setSubs(cur => cur.map(x => x.id === sub.id ? { ...x, status: novo as Status } : x));
    const { error } = await supabase.from("tasks").update({ status: novo }).eq("id", sub.id);
    if (error) { setSubs(backup); setErro("Nao foi possivel atualizar a subtarefa."); }
  }

  async function removerSub(sub: TaskRow) {
    const backup = subs;
    setSubs(cur => cur.filter(x => x.id !== sub.id));
    const { error } = await supabase.from("tasks").delete().eq("id", sub.id);
    if (error) { setSubs(backup); setErro("Nao foi possivel remover a subtarefa."); }
  }

  async function duplicarTarefa() {
    if (!task) return;
    setDuplicando(true);
    const { data, error } = await supabase.rpc("duplicar_tarefa", { origem: task.id });
    setDuplicando(false);
    if (error || !data) { setErro("Nao foi possivel duplicar: " + (error?.message ?? "")); return; }
    onDuplicated?.(data as string);
  }

  // Cadastro rapido de opcoes, sem sair da tarefa
  async function criarDepartamento(nome: string) {
    const ordem = (depts.reduce((m, d) => Math.max(m, d.ordem), 0) || 0) + 10;
    const { data, error } = await supabase.from("departments")
      .insert({ name: nome, ordem }).select().single();
    if (error) { setErro("Nao foi possivel criar o departamento: " + error.message); return; }
    const novo = data as DeptLite;
    setDepts(cur => [...cur, novo].sort((a, b) => a.ordem - b.ordem));
    await patch({ department_id: novo.id });
  }

  async function criarProjeto(nome: string) {
    const { data, error } = await supabase.from("projects")
      .insert({ name: nome, client_id: task?.client_id ?? null }).select().single();
    if (error) { setErro("Nao foi possivel criar o projeto: " + error.message); return; }
    const novo = data as ProjectLite;
    setProjects(cur => [...cur, novo]);
    await patch({ project_id: novo.id });
  }

  async function criarCliente(nome: string) {
    const { data, error } = await supabase.from("clients")
      .insert({ name: nome, active: true }).select().single();
    if (error) { setErro("Nao foi possivel criar o cliente: " + error.message); return; }
    await reloadClients();
    await toggleCliente((data as { id: string }).id);
  }

  async function criarMembro(nome: string) {
    const { data, error } = await supabase.from("team_members")
      .insert({ name: nome }).select().single();
    if (error) { setErro("Nao foi possivel cadastrar a pessoa: " + error.message); return; }
    await reloadTeam();
    await toggleAssignee((data as { id: string }).id);
  }

  async function handleDelete() {
    if (!task) return;
    const { error } = await supabase.from("tasks").delete().eq("id", task.id);
    if (error) { setErro("Nao foi possivel excluir."); setConfirmDel(false); return; }
    onDeleted?.(task.id);
    onClose?.();
  }

  if (loading)
    return <p className="text-[13px] opacity-40 text-center py-20">Carregando...</p>;

  if (notFound || !task)
    return (
      <EmptyState
        title="Tarefa nao encontrada"
        sub="Ela pode ter sido excluida ou voce nao tem acesso a ela."
        action={onClose && <Btn size="sm" onClick={onClose}>Fechar</Btn>}
      />
    );

  const idx = colIndex(task.status);
  const done = task.status === "concluida";
  const overdue = isOverdue(task);
  const project = projects.find(p => p.id === task.project_id);
  const assigneePeople = assignees.map(id => team.find(m => m.id === id)).filter(Boolean) as typeof team;
  const clientLabel = task.client_id
    ? (adminClients.find(c => c.id === task.client_id)?.name ?? "Cliente")
    : "Interno (agencia)";
  const dept = depts.find(d => d.id === task.department_id);
  const projectsForClient = task.client_id
    ? projects.filter(p => p.client_id === task.client_id || !p.client_id)
    : projects;

  // Propriedades no formato rotulo + valor, com lista suspensa,
  // no lugar de campos de formulario empilhados.
  const Prop = ({ label, children }: { label: string; children: React.ReactNode }) => (
    // no celular o rotulo fica acima, liberando a linha inteira para o valor
    <div className="flex flex-col gap-0.5 py-1.5 sm:flex-row sm:items-center sm:gap-3 sm:py-0.5 sm:min-h-[34px]">
      <span className="text-[12px] opacity-50 sm:w-[96px] sm:shrink-0">{label}</span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );

  const semValor = <span className="opacity-35 text-[13px]">Vazio</span>;
  const STATUS_DOT: Record<Status, "ok" | "warn" | "bad" | "neutral"> = {
    backlog: "neutral", em_andamento: "warn", aguardando: "bad", concluida: "ok",
  };

  const clientesNomes = clientes
    .map(id => adminClients.find(c => c.id === id)?.name ?? "Cliente");

  const propriedades = (
    <div className="flex flex-col divide-y divide-[color:var(--line-light)]">
      <Prop label="Etapa">
        <CellPicker variante="campo" title="Alterar etapa"
          trigger={
            <span className="inline-flex items-center gap-2 min-w-0 text-[13px]">
              <StatusDot status={STATUS_DOT[task.status]} />
              <span className="truncate">{statusLabel(task.status)}</span>
            </span>
          }>
          {fechar => COLUMNS.map(c => (
            <MenuItem key={c.key} selecionado={task.status === c.key}
              onClick={() => { patch({ status: c.key }); fechar(); }}>
              <span className="inline-flex items-center gap-2">
                <StatusDot status={STATUS_DOT[c.key]} />{c.label}
              </span>
            </MenuItem>
          ))}
        </CellPicker>
      </Prop>

      <Prop label="Prioridade">
        <CellPicker variante="campo" title="Alterar prioridade" width={190}
          trigger={<Badge label={PRIO[task.priority].label} color={PRIO[task.priority].color} />}>
          {fechar => PRIORITIES.map(pr => (
            <MenuItem key={pr} selecionado={task.priority === pr}
              onClick={() => { patch({ priority: pr }); fechar(); }}>
              <Badge label={PRIO[pr].label} color={PRIO[pr].color} />
            </MenuItem>
          ))}
        </CellPicker>
      </Prop>

      <Prop label="Prazo">
        <CellPicker variante="campo" title="Alterar prazo" width={250}
          trigger={
            <span className="text-[13px] truncate"
              style={overdue ? { color: "var(--bad)", fontWeight: 600 } : {}}>
              {task.due_date ? dueLabel(task.due_date, task.status) : semValor}
            </span>
          }>
          {fechar => (
            <MenuData
              valor={task.due_date}
              onFechar={fechar}
              onSalvar={d => patch({ due_date: d })}
            />
          )}
        </CellPicker>
      </Prop>

      <Prop label="Responsaveis">
        <CellPicker variante="campo" title="Alterar responsaveis" busca={team.length > 8}
          placeholder="Buscar pessoa..."
          aoCriar={isAdmin ? criarMembro : undefined} criarRotulo="Cadastrar pessoa"
          trigger={
            assigneePeople.length === 0
              ? semValor
              : <span className="inline-flex items-center gap-2 min-w-0">
                  <AvatarStack people={assigneePeople} size={20} max={3} empty="" />
                  <span className="text-[13px] truncate">
                    {assigneePeople[0].name}
                    {assigneePeople.length > 1 && ` +${assigneePeople.length - 1}`}
                  </span>
                </span>
          }>
          {(_, termo) => {
            const lista = team.filter(m => (m.active || assignees.includes(m.id))
              && (!termo || m.name.toLowerCase().includes(termo)));
            return (
              <>
                {myMemberId && !assignees.includes(myMemberId) && !termo && (
                  <MenuItem onClick={() => toggleAssignee(myMemberId)}>
                    <span style={{ color: "var(--copper)" }}>Incluir a mim</span>
                  </MenuItem>
                )}
                {!lista.length && (
                  <p className="text-[12px] opacity-45 px-2 py-1.5">Nenhuma pessoa encontrada.</p>
                )}
                {lista.map(m => (
                  <MenuItem key={m.id} selecionado={assignees.includes(m.id)}
                    onClick={() => toggleAssignee(m.id)}>
                    <span className="inline-flex items-center gap-2 min-w-0">
                      <Avatar name={m.name} color={m.color} size={20} />
                      <span className="truncate">{m.name}</span>
                    </span>
                  </MenuItem>
                ))}
              </>
            );
          }}
        </CellPicker>
      </Prop>

      <Prop label="Departamento">
        <CellPicker variante="campo" title="Alterar departamento" busca={depts.length > 8}
          placeholder="Buscar departamento..."
          aoCriar={isAdmin ? criarDepartamento : undefined} criarRotulo="Novo departamento"
          trigger={
            dept
              ? <span className="inline-flex items-center gap-2 min-w-0 text-[13px]">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ background: dept.color }} />
                  <span className="truncate">{dept.name}</span>
                </span>
              : semValor
          }>
          {(fechar, termo) => (
            <>
              <MenuItem selecionado={!task.department_id}
                onClick={() => { patch({ department_id: null }); fechar(); }}>
                <span className="opacity-50">Sem departamento</span>
              </MenuItem>
              {depts.filter(d => d.active && (!termo || d.name.toLowerCase().includes(termo))).map(d => (
                <MenuItem key={d.id} selecionado={task.department_id === d.id}
                  onClick={() => { patch({ department_id: d.id }); fechar(); }}>
                  <span className="inline-flex items-center gap-2 min-w-0">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ background: d.color }} />
                    <span className="truncate">{d.name}</span>
                  </span>
                </MenuItem>
              ))}
            </>
          )}
        </CellPicker>
      </Prop>

      {isAdmin && (
        <Prop label="Clientes">
          <CellPicker variante="campo" title="Alterar clientes" busca={adminClients.length > 8}
            placeholder="Buscar cliente..."
            aoCriar={isAdmin ? criarCliente : undefined} criarRotulo="Novo cliente"
            trigger={
              clientes.length === 0
                ? <span className="text-[13px] opacity-55">Interno (agencia)</span>
                : <span className="text-[13px] truncate" title={clientesNomes.join(", ")}>
                    {clientesNomes[0]}
                    {clientes.length > 1 && <span className="opacity-55"> +{clientes.length - 1}</span>}
                  </span>
            }>
            {(_, termo) => {
              const lista = adminClients.filter(c => !termo || c.name.toLowerCase().includes(termo));
              if (!lista.length)
                return <p className="text-[12px] opacity-45 px-2 py-1.5">Nenhum cliente encontrado.</p>;
              return (
                <>
                  <div className="text-[11px] uppercase tracking-wide opacity-45 px-2 py-1">
                    Marque quantos precisar
                  </div>
                  {lista.map(c => (
                    <MenuItem key={c.id} selecionado={clientes.includes(c.id)}
                      onClick={() => toggleCliente(c.id)}>
                      {c.name}
                    </MenuItem>
                  ))}
                </>
              );
            }}
          </CellPicker>
        </Prop>
      )}

      <Prop label="Projeto">
        <CellPicker variante="campo" title="Alterar projeto" busca={projectsForClient.length > 8}
          placeholder="Buscar projeto..."
          aoCriar={criarProjeto} criarRotulo="Novo projeto"
          trigger={<span className="text-[13px] truncate">{project?.name ?? semValor}</span>}>
          {(fechar, termo) => (
            <>
              <MenuItem selecionado={!task.project_id}
                onClick={() => { patch({ project_id: null }); fechar(); }}>
                <span className="opacity-50">Sem projeto</span>
              </MenuItem>
              {projectsForClient
                .filter(pj => !termo || pj.name.toLowerCase().includes(termo))
                .map(pj => (
                  <MenuItem key={pj.id} selecionado={task.project_id === pj.id}
                    onClick={() => { patch({ project_id: pj.id }); fechar(); }}>
                    {pj.name}
                  </MenuItem>
                ))}
            </>
          )}
        </CellPicker>
      </Prop>

      <Prop label="Repetir">
        <CellPicker variante="campo" title="Repetir tarefa" width={220}
          trigger={
            <span className="text-[13px] truncate">
              {task.repeat_rule
                ? <>⟳ {repeatLabel(task.repeat_rule)}</>
                : <span className="opacity-35">Nao repete</span>}
            </span>
          }>
          {fechar => (
            <>
              <MenuItem selecionado={!task.repeat_rule}
                onClick={() => { patch({ repeat_rule: null, repeat_until: null }); fechar(); }}>
                <span className="opacity-50">Nao repete</span>
              </MenuItem>
              {REPEAT_OPTIONS.map(o => (
                <MenuItem key={o.key} selecionado={task.repeat_rule === o.key}
                  onClick={() => { patch({ repeat_rule: o.key }); fechar(); }}>
                  {o.label}
                </MenuItem>
              ))}
              {task.repeat_rule && (
                <div className="border-t hairline mt-1 pt-2">
                  <span className="text-[11px] opacity-50 px-2">Repetir ate</span>
                  <MenuData
                    valor={task.repeat_until ?? null}
                    atalhos={false}
                    onFechar={fechar}
                    onSalvar={d => patch({ repeat_until: d })}
                  />
                </div>
              )}
            </>
          )}
        </CellPicker>
      </Prop>

      {task.repeat_rule && (
        <div className="text-[11px] opacity-45 py-2">
          Ao concluir, a proxima ocorrencia e criada sozinha.
        </div>
      )}
    </div>
  );

  const feitas = subs.filter(x => x.status === "concluida").length;

  const subtarefas = (
    <div className="flex flex-col gap-2">
      {subs.length > 0 && (
        <div className="flex items-center gap-2 mb-0.5">
          <div className="h-1.5 rounded-full overflow-hidden bg-black/[0.07] dark:bg-white/[0.08] flex-1">
            <span className="block h-full rounded-full transition-all"
              style={{ width: `${(feitas / subs.length) * 100}%`, background: "var(--ok)" }} />
          </div>
          <span className="text-[11px] opacity-50 tabular shrink-0">{feitas}/{subs.length}</span>
        </div>
      )}

      {subs.map(sub => (
        <div key={sub.id} className="flex items-center gap-2.5 group">
          <button
            onClick={() => alternarSub(sub)}
            className="w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center"
            style={sub.status === "concluida"
              ? { background: "var(--ok)", borderColor: "var(--ok)", color: "white" }
              : { borderColor: "var(--line-light)" }}
            aria-label={sub.status === "concluida" ? "Reabrir subtarefa" : "Concluir subtarefa"}
          >
            {sub.status === "concluida" && <span className="text-[9px] leading-none">✓</span>}
          </button>
          <span className={`text-[13px] flex-1 min-w-0 truncate ${
            sub.status === "concluida" ? "line-through opacity-45" : ""}`}>
            {sub.title}
          </span>
          <button
            className="text-[11px] opacity-0 group-hover:opacity-40 hover:!opacity-100 shrink-0 px-1"
            style={{ color: "var(--bad)" }}
            onClick={() => removerSub(sub)}
            title="Remover subtarefa">✕</button>
        </div>
      ))}

      <div className="flex items-center gap-2 mt-1">
        <span className="w-4 h-4 rounded-full border border-dashed hairline shrink-0" />
        <input
          className="text-[13px] bg-transparent border-0 outline-none flex-1 min-w-0
                     focus:bg-black/[0.02] dark:focus:bg-white/[0.03] rounded px-1 py-0.5"
          placeholder="Adicionar subtarefa"
          value={novaSub}
          onChange={e => setNovaSub(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") criarSubtarefa(); }}
        />
        {novaSub.trim() && (
          <button className="text-[12px] font-semibold shrink-0" style={{ color: "var(--copper)" }}
            onClick={criarSubtarefa}>Adicionar</button>
        )}
      </div>
    </div>
  );

  const descricao = (
    <>
      {editandoDesc || !task.description?.trim() ? (
        <>
          <textarea
            autoFocus={editandoDesc}
            className="text-[13px] leading-relaxed bg-transparent w-full resize-none border-0 outline-none
                       focus:bg-black/[0.02] dark:focus:bg-white/[0.03] rounded p-1 -m-1 min-h-[110px] font-mono"
            value={descDraft}
            placeholder={"Passo a passo do processo. Exemplo:\n\n## Preparacao\n1. Abrir o painel do cliente\n2. Conferir o saldo\n\n- [ ] Item a marcar\n[Nome do link](https://endereco)"}
            onChange={e => { setDescDraft(e.target.value); setDirty(d => ({ ...d, desc: true })); }}
            onBlur={() => { saveDesc(); if (descDraft.trim()) setEditandoDesc(false); }}
          />
          <div className="flex items-center gap-2 mt-2">
            {dirty.desc && (
              <>
                <Btn size="sm" onClick={() => { saveDesc(); setEditandoDesc(false); }} disabled={savingText}>
                  {savingText ? "Salvando..." : "Salvar"}
                </Btn>
                <button className="text-[12px] opacity-55"
                  onClick={() => {
                    setDescDraft(task.description ?? "");
                    setDirty(d => ({ ...d, desc: false }));
                    setEditandoDesc(false);
                  }}>
                  Descartar
                </button>
              </>
            )}
            <span className="text-[11px] opacity-35">
              Aceita titulos com ##, passos numerados, itens a marcar e links
            </span>
          </div>
        </>
      ) : (
        <div className="group">
          <TextoFormatado texto={task.description} onMarcar={marcarPasso} />
          <button
            className="text-[12px] mt-2 opacity-0 group-hover:opacity-60 hover:!opacity-100 underline underline-offset-2"
            onClick={() => { setDescDraft(task.description ?? ""); setEditandoDesc(true); }}>
            Editar passo a passo
          </button>
        </div>
      )}
    </>
  );

  const cabecalho = (
    <div className="flex items-start gap-3">
      <button
        onClick={() => patch({ status: done ? "em_andamento" : "concluida" })}
        className="mt-1 w-5 h-5 rounded-full border-2 shrink-0 flex items-center justify-center transition-colors"
        style={done
          ? { background: "var(--ok)", borderColor: "var(--ok)", color: "white" }
          : { borderColor: "var(--line-light)" }}
        title={done ? "Reabrir tarefa" : "Marcar como concluida"}
        aria-label={done ? "Reabrir tarefa" : "Marcar como concluida"}
      >
        {done && <span className="text-[11px] leading-none">✓</span>}
      </button>

      <div className="min-w-0 flex-1">
        <textarea
          ref={tituloRef}
          className={`font-display font-bold tracking-tight bg-transparent w-full resize-none
                      border-0 outline-none focus:bg-black/[0.03] dark:focus:bg-white/[0.04] rounded px-1 -mx-1
                      ${painel ? "text-xl" : "text-2xl sm:text-3xl"} ${done ? "line-through opacity-50" : ""}`}
          style={{ color: "var(--brand)" }}
          rows={1}
          value={titleDraft}
          onChange={e => { setTitleDraft(e.target.value); setDirty(d => ({ ...d, title: true })); }}
          onBlur={saveTitle}
          onKeyDown={e => {
            if (e.key === "Enter") { e.preventDefault(); (e.target as HTMLTextAreaElement).blur(); }
          }}
          onInput={ajustarAltura}
        />
        <div className="flex items-center gap-2 mt-1.5 flex-wrap text-[11px] opacity-55">
          <span className="inline-flex items-center gap-1.5">
            <StatusDot status={done ? "ok" : task.status === "em_andamento" ? "warn" : "neutral"} />
            {statusLabel(task.status)}
          </span>
          {isAdmin && <span>{clientLabel}</span>}
          {dirty.title && <span style={{ color: "var(--warn)" }}>alteracao nao salva</span>}
          {savingText && <span>salvando...</span>}
        </div>
      </div>
    </div>
  );

  const trilhaEtapas = (
    <div className="faixa-rolavel flex items-center gap-1.5 pb-1">
      {COLUMNS.map((c, i) => (
        <button key={c.key} onClick={() => patch({ status: c.key })}
          className="text-[11px] px-3 py-1.5 rounded-lg border hairline whitespace-nowrap shrink-0 transition-colors"
          style={i === idx
            ? { background: "var(--brand)", color: "white", borderColor: "var(--brand)" }
            : i < idx ? { opacity: 0.55 } : {}}>
          {painel ? c.short : c.label}
        </button>
      ))}
    </div>
  );

  const acoes = (
    <div className="flex flex-col gap-2">
      <Btn variant={done ? "ghost" : "primary"}
        onClick={() => patch({ status: done ? "em_andamento" : "concluida" })}>
        {done ? "Reabrir tarefa" : "Marcar como concluida"}
      </Btn>
      <Btn variant="ghost" onClick={duplicarTarefa} disabled={duplicando}>
        {duplicando ? "Duplicando..." : "Duplicar tarefa"}
      </Btn>
      {confirmDel ? (
        <div className="border hairline rounded-lg p-3 flex flex-col gap-2" style={{ borderColor: "var(--bad)" }}>
          <span className="text-[13px]">Excluir esta tarefa? A acao nao pode ser desfeita.</span>
          <div className="flex gap-2">
            <button className="text-[12px] font-semibold px-3 py-1.5 rounded"
              style={{ background: "var(--bad)", color: "white" }}
              onClick={handleDelete}>Excluir</button>
            <button className="text-[12px] px-3 py-1.5 rounded border hairline"
              onClick={() => setConfirmDel(false)}>Cancelar</button>
          </div>
        </div>
      ) : (
        <button className="text-[12px] py-1.5 opacity-55 hover:opacity-100 text-left"
          style={{ color: "var(--bad)" }}
          onClick={() => setConfirmDel(true)}>
          Excluir tarefa
        </button>
      )}
    </div>
  );

  const alerta = erro && (
    <div className="border hairline rounded-lg px-3 py-2 flex items-center justify-between gap-3"
      style={{ borderColor: "var(--bad)" }}>
      <span className="text-[13px]" style={{ color: "var(--bad)" }}>{erro}</span>
      <button className="text-[11px] opacity-60" onClick={() => setErro(null)}>fechar</button>
    </div>
  );

  // ── Modo painel lateral ──────────────────────────────────────
  if (painel) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center justify-between gap-2 px-4 sm:px-5 py-3 border-b hairline shrink-0">
          <Link to={`/tarefas/${task.id}`}
            className="text-[12px] opacity-55 hover:opacity-100 underline underline-offset-2">
            Abrir em pagina inteira
          </Link>
          <button onClick={onClose}
            className="w-7 h-7 rounded-lg border hairline flex items-center justify-center text-sm opacity-60 hover:opacity-100"
            aria-label="Fechar painel">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 sm:p-5 flex flex-col gap-4">
          {alerta}
          {cabecalho}
          {trilhaEtapas}
          <div>
            <div className="text-[11px] uppercase tracking-wide opacity-50 mb-1.5">Descricao</div>
            {descricao}
          </div>
          <div className="border-t hairline pt-4">
            <div className="text-[11px] uppercase tracking-wide opacity-50 mb-2">
              Subtarefas {subs.length > 0 && <span className="opacity-70">({feitas}/{subs.length})</span>}
            </div>
            {subtarefas}
          </div>
          <div className="border-t hairline pt-1">{propriedades}</div>
          <div className="border-t hairline pt-4">
            <TarefaAtividade taskId={task.id} compacto />
          </div>
          <div className="border-t hairline pt-3">{acoes}</div>
          <div className="text-[11px] opacity-40 leading-relaxed">
            Criada em {fmtDateTime(task.created_at)}
            {task.updated_at && <> · alterada em {fmtDateTime(task.updated_at)}</>}
          </div>
        </div>
      </div>
    );
  }

  // ── Modo pagina inteira ──────────────────────────────────────
  return (
    <div className="p-4 sm:p-5 md:p-7 max-w-5xl mx-auto">
      <div className="flex items-center gap-2 text-[12px] mb-4 flex-wrap">
        <Link to="/tarefas" className="opacity-55 hover:opacity-100 underline underline-offset-2">Tarefas</Link>
        {project && (
          <>
            <span className="opacity-30">/</span>
            <Link to="/projetos" className="opacity-55 hover:opacity-100 underline underline-offset-2">
              {project.name}
            </Link>
          </>
        )}
        <span className="opacity-30">/</span>
        <span className="opacity-40 truncate max-w-[40ch]">{task.title}</span>
      </div>

      {alerta && <div className="mb-4">{alerta}</div>}

      <div className="mb-5">{cabecalho}</div>
      <div className="mb-5 -mx-4 px-4 sm:mx-0 sm:px-0">{trilhaEtapas}</div>

      {/* Propriedades em largura total: na coluna estreita anterior
          nomes como "Estacao Granada Aricanduva" ficavam cortados. */}
      <SectionCard title="Propriedades" className="mb-4">
        <div className="grid grid-cols-1 lg:grid-cols-2 lg:gap-x-8">
          {propriedades}
        </div>
      </SectionCard>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 flex flex-col gap-4">
          <SectionCard title="Descricao">{descricao}</SectionCard>
          <SectionCard title={`Subtarefas${subs.length ? ` (${feitas}/${subs.length})` : ""}`}>
            {subtarefas}
          </SectionCard>
          <SectionCard title="Anexos e comentarios">
            <TarefaAtividade taskId={task.id} />
          </SectionCard>
        </div>

        <div className="flex flex-col gap-4">
          <SectionCard title="Acoes">{acoes}</SectionCard>
          <SectionCard title="Registro">
            <div className="flex flex-col gap-2 text-[13px]">
              <div className="flex items-center justify-between gap-3">
                <span className="opacity-55 shrink-0">Criada em</span>
                <span className="font-mono text-xs text-right">{fmtDateTime(task.created_at)}</span>
              </div>
              {task.updated_at && (
                <div className="flex items-center justify-between gap-3">
                  <span className="opacity-55 shrink-0">Alterada em</span>
                  <span className="font-mono text-xs text-right">{fmtDateTime(task.updated_at)}</span>
                </div>
              )}
              <div className="flex items-center justify-between gap-3">
                <span className="opacity-55 shrink-0">Identificador</span>
                <span className="font-mono text-[11px] opacity-50">{task.id.slice(0, 8)}</span>
              </div>
            </div>
          </SectionCard>
        </div>
      </div>
    </div>
  );
}
