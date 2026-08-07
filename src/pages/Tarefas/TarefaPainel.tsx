import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router";
import {
  SectionCard, Badge, Btn, StatusDot, EmptyState, AvatarStack, AssigneePicker,
} from "../../components/ui/InprorComponents";
import { useClientScope } from "../../context/AuthContext";
import { supabase } from "../../lib/supabase";
import {
  TaskRow, ProjectLite, Status, Priority,
  COLUMNS, PRIO, PRIORITIES, colIndex, statusLabel,
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
}

export default function TarefaPainel({
  taskId, variant = "pagina", onClose, onChanged, onDeleted,
}: Props) {
  const { isAdmin, adminClients, authLoading, team, myMemberId } = useClientScope();
  const painel = variant === "painel";

  const [task, setTask]         = useState<TaskRow | null>(null);
  const [projects, setProjects] = useState<ProjectLite[]>([]);
  const [assignees, setAssignees] = useState<string[]>([]);
  const [loading, setLoading]   = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [erro, setErro]         = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState(false);

  const [titleDraft, setTitleDraft] = useState("");
  const [descDraft, setDescDraft]   = useState("");
  const [dirty, setDirty]           = useState({ title: false, desc: false });
  const [savingText, setSavingText] = useState(false);

  useEffect(() => {
    if (authLoading || !taskId) return;
    setLoading(true);
    setNotFound(false);
    Promise.all([
      supabase.from("tasks").select("*").eq("id", taskId).maybeSingle(),
      supabase.from("projects").select("id,name,client_id"),
      supabase.from("task_assignees").select("member_id").eq("task_id", taskId),
    ]).then(([t, p, a]) => {
      if (!t.data) { setNotFound(true); setLoading(false); return; }
      const row = t.data as TaskRow;
      setTask(row);
      setTitleDraft(row.title);
      setDescDraft(row.description ?? "");
      setDirty({ title: false, desc: false });
      setProjects((p.data as ProjectLite[]) ?? []);
      setAssignees(((a.data as { member_id: string }[]) ?? []).map(r => r.member_id));
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
  const projectsForClient = task.client_id
    ? projects.filter(p => p.client_id === task.client_id || !p.client_id)
    : projects;

  const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div className="flex flex-col gap-1 py-2.5 border-b hairline last:border-0">
      <span className="text-[11px] uppercase tracking-wide opacity-50">{label}</span>
      {children}
    </div>
  );

  const selectCls = "text-sm border hairline rounded px-2 py-1.5 bg-white dark:bg-[#11141b] w-full";

  const propriedades = (
    <>
      <Field label="Etapa">
        <select className={selectCls} value={task.status}
          onChange={e => patch({ status: e.target.value as Status })}>
          {COLUMNS.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
        </select>
      </Field>

      <Field label="Prioridade">
        <div className="flex items-center gap-2">
          <select className={selectCls} value={task.priority}
            onChange={e => patch({ priority: e.target.value as Priority })}>
            {PRIORITIES.map(p => <option key={p} value={p}>{PRIO[p].label}</option>)}
          </select>
          <Badge label={PRIO[task.priority].label} color={PRIO[task.priority].color} />
        </div>
      </Field>

      <Field label="Prazo">
        <input type="date" className={selectCls} value={task.due_date ?? ""}
          onChange={e => patch({ due_date: e.target.value || null })} />
        {task.due_date && (
          <span className="text-[11px] mt-1"
            style={overdue ? { color: "var(--bad)", fontWeight: 600 } : { opacity: 0.55 }}>
            {dueLabel(task.due_date, task.status)}
          </span>
        )}
      </Field>

      <Field label="Responsaveis">
        <div className="mb-2">
          <AvatarStack people={assigneePeople} size={26} max={5} />
        </div>
        <AssigneePicker
          people={team.filter(m => m.active || assignees.includes(m.id))}
          selected={assignees}
          onToggle={toggleAssignee}
          emptyHint="Cadastre a equipe em Equipe para poder atribuir." />
        {!assignees.length && task.assigned_to && (
          <span className="text-[11px] opacity-45 mt-1.5">Registro anterior: {task.assigned_to}</span>
        )}
        {myMemberId && !assignees.includes(myMemberId) && (
          <button className="text-[12px] mt-2 text-left underline underline-offset-2 w-fit"
            style={{ color: "var(--copper)" }}
            onClick={() => toggleAssignee(myMemberId)}>
            Incluir a mim
          </button>
        )}
      </Field>

      <Field label="Projeto">
        <select className={selectCls} value={task.project_id ?? ""}
          onChange={e => patch({ project_id: e.target.value || null })}>
          <option value="">Sem projeto</option>
          {projectsForClient.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </Field>

      {isAdmin && (
        <Field label="Cliente">
          <select className={selectCls} value={task.client_id ?? ""}
            onChange={e => patch({ client_id: e.target.value || null, project_id: null })}>
            <option value="">Interno (agencia)</option>
            {adminClients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
      )}
    </>
  );

  const descricao = (
    <>
      <textarea
        className="text-[14px] leading-relaxed bg-transparent w-full resize-none border-0 outline-none
                   focus:bg-black/[0.02] dark:focus:bg-white/[0.03] rounded p-1 -m-1 min-h-[110px]"
        value={descDraft}
        placeholder="Adicione contexto, criterios de aceite e proximos passos."
        onChange={e => { setDescDraft(e.target.value); setDirty(d => ({ ...d, desc: true })); }}
        onBlur={saveDesc}
      />
      {dirty.desc && (
        <div className="flex items-center gap-2 mt-2">
          <Btn size="sm" onClick={saveDesc} disabled={savingText}>
            {savingText ? "Salvando..." : "Salvar"}
          </Btn>
          <button className="text-[12px] opacity-55"
            onClick={() => { setDescDraft(task.description ?? ""); setDirty(d => ({ ...d, desc: false })); }}>
            Descartar
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
          onInput={e => {
            const el = e.currentTarget;
            el.style.height = "auto";
            el.style.height = el.scrollHeight + "px";
          }}
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
    <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
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
        <div className="flex items-center justify-between gap-2 px-4 py-3 border-b hairline shrink-0">
          <Link to={`/tarefas/${task.id}`}
            className="text-[12px] opacity-55 hover:opacity-100 underline underline-offset-2">
            Abrir em pagina inteira
          </Link>
          <button onClick={onClose}
            className="w-7 h-7 rounded-lg border hairline flex items-center justify-center text-sm opacity-60 hover:opacity-100"
            aria-label="Fechar painel">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
          {alerta}
          {cabecalho}
          {trilhaEtapas}
          <div>
            <div className="text-[11px] uppercase tracking-wide opacity-50 mb-1.5">Descricao</div>
            {descricao}
          </div>
          <div className="border-t hairline pt-1">{propriedades}</div>
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 flex flex-col gap-4">
          <SectionCard title="Descricao">{descricao}</SectionCard>
          <SectionCard title="Registro">
            <div className="flex flex-col gap-2 text-[13px]">
              <div className="flex items-center justify-between gap-3">
                <span className="opacity-55">Criada em</span>
                <span className="font-mono text-xs">{fmtDateTime(task.created_at)}</span>
              </div>
              {task.updated_at && (
                <div className="flex items-center justify-between gap-3">
                  <span className="opacity-55">Ultima alteracao</span>
                  <span className="font-mono text-xs">{fmtDateTime(task.updated_at)}</span>
                </div>
              )}
              <div className="flex items-center justify-between gap-3">
                <span className="opacity-55">Identificador</span>
                <span className="font-mono text-[11px] opacity-50">{task.id.slice(0, 8)}</span>
              </div>
            </div>
          </SectionCard>
        </div>

        <div className="flex flex-col gap-4">
          <SectionCard title="Propriedades">{propriedades}</SectionCard>
          <SectionCard title="Acoes">{acoes}</SectionCard>
        </div>
      </div>
    </div>
  );
}
