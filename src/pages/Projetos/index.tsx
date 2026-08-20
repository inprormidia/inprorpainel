import { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import PageMeta from "../../components/common/PageMeta";
import {
  PageWrap, KpiCard, KpiGrid, SectionCard, Badge, Btn, EmptyState,
  StatusDot, CellPicker, MenuItem, MenuData, AvatarStack, cls,
} from "../../components/ui/InprorComponents";
import { useClientScope } from "../../context/AuthContext";
import { supabase } from "../../lib/supabase";

type PStatus  = "planejamento" | "em_andamento" | "pausado" | "concluido" | "cancelado";
type Priority = "baixa" | "media" | "alta" | "urgente";
type TStatus  = "backlog" | "em_andamento" | "aguardando" | "concluida";

interface ProjectRow {
  id: string; client_id: string | null; department_id: string | null;
  name: string; description: string | null;
  status: PStatus; priority: Priority;
  start_date: string | null; due_date: string | null;
  budget: number | null; owner: string | null;
  created_at: string;
}

interface TaskLite {
  id: string; project_id: string | null;
  title: string; status: TStatus; due_date: string | null;
}

interface DeptLite { id: string; name: string; color: string; ordem: number; active: boolean; }

const STATUS: { key: PStatus; label: string; color: string; dot: "ok" | "warn" | "bad" | "neutral" }[] = [
  { key: "planejamento", label: "Planejamento", color: "#64748b",       dot: "neutral" },
  { key: "em_andamento", label: "Em andamento", color: "var(--ok)",     dot: "ok" },
  { key: "pausado",      label: "Pausado",      color: "var(--warn)",   dot: "warn" },
  { key: "concluido",    label: "Concluido",    color: "var(--copper)", dot: "ok" },
  { key: "cancelado",    label: "Cancelado",    color: "var(--bad)",    dot: "bad" },
];
const sInfo = (k: PStatus) => STATUS.find(s => s.key === k) ?? STATUS[0];

const PRIO: Record<Priority, { label: string; color: "green" | "default" | "yellow" | "red" }> = {
  baixa:   { label: "Baixa",   color: "green" },
  media:   { label: "Media",   color: "default" },
  alta:    { label: "Alta",    color: "yellow" },
  urgente: { label: "Urgente", color: "red" },
};
const PRIORIDADES = Object.keys(PRIO) as Priority[];

const hoje = () => new Date().toISOString().slice(0, 10);
const fmtData = (d: string) => { const [y, m, dd] = d.split("-"); return `${dd}/${m}/${y.slice(2)}`; };
const fmtBrl  = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function diasAte(due: string): number {
  const ms = new Date(due + "T00:00:00").getTime() - new Date(hoje() + "T00:00:00").getTime();
  return Math.round(ms / 86400000);
}

export default function Projetos() {
  const navigate = useNavigate();
  const {
    scopedClientId, authLoading, isAdmin, isStaff,
    adminClientId, setAdminClientId, adminClients, team,
  } = useClientScope();

  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [tasks, setTasks]       = useState<TaskLite[]>([]);
  const [depts, setDepts]       = useState<DeptLite[]>([]);
  const [assignees, setAssignees] = useState<Record<string, string[]>>({});
  const [loading, setLoading]   = useState(true);
  const [erro, setErro]         = useState<string | null>(null);

  const [filtro, setFiltro]     = useState<PStatus | "todos">("todos");
  const [abertoId, setAbertoId] = useState<string | null>(null);
  const [criando, setCriando]   = useState(false);
  const [editando, setEditando] = useState<{ id: string; valor: string } | null>(null);

  const clientName = (id: string | null) =>
    id ? (adminClients.find(c => c.id === id)?.name ?? "Cliente") : "Interno";
  const dept = (id: string | null) => (id ? depts.find(d => d.id === id) : undefined);

  useEffect(() => {
    if (authLoading) return;
    setLoading(true);
    Promise.all([
      supabase.from("projects").select("*").order("created_at", { ascending: false }),
      supabase.from("tasks").select("id,project_id,title,status,due_date"),
      supabase.from("departments").select("id,name,color,ordem,active").order("ordem"),
      supabase.from("task_assignees").select("task_id,member_id"),
    ]).then(([p, t, d, a]) => {
      setProjects((p.data as ProjectRow[]) ?? []);
      setTasks((t.data as TaskLite[]) ?? []);
      setDepts((d.data as DeptLite[]) ?? []);
      const map: Record<string, string[]> = {};
      ((a.data as { task_id: string; member_id: string }[]) ?? [])
        .forEach(r => { (map[r.task_id] ??= []).push(r.member_id); });
      setAssignees(map);
      setLoading(false);
    });
  }, [scopedClientId, adminClientId, isStaff, authLoading]);

  // o recorte por cliente e feito aqui, para o seletor do topo valer
  const visiveis = projects.filter(p => {
    if (scopedClientId && p.client_id !== scopedClientId) return false;
    if (filtro !== "todos" && p.status !== filtro) return false;
    return true;
  });
  const doEscopo = projects.filter(p => !scopedClientId || p.client_id === scopedClientId);

  const tarefasDe = (pid: string) => tasks.filter(t => t.project_id === pid);

  const pessoasDe = (pid: string) => {
    const ids = new Set<string>();
    tarefasDe(pid).forEach(t => (assignees[t.id] ?? []).forEach(m => ids.add(m)));
    return [...ids].map(id => team.find(m => m.id === id)).filter(Boolean) as typeof team;
  };

  const ativos     = doEscopo.filter(p => p.status === "em_andamento").length;
  const concluidos = doEscopo.filter(p => p.status === "concluido").length;
  const atrasados  = doEscopo.filter(p =>
    p.due_date && p.due_date < hoje() && p.status !== "concluido" && p.status !== "cancelado").length;
  const orcamento  = doEscopo
    .filter(p => p.status !== "cancelado")
    .reduce((s, p) => s + (p.budget ?? 0), 0);

  async function salvar(id: string, mudancas: Partial<ProjectRow>) {
    const backup = projects;
    setProjects(cur => cur.map(p => p.id === id ? { ...p, ...mudancas } : p));
    const { error } = await supabase.from("projects").update(mudancas).eq("id", id);
    if (error) { setProjects(backup); setErro("Nao foi possivel salvar: " + error.message); }
  }

  // cria e ja deixa o nome pronto para digitar, sem formulario antes
  async function criar() {
    setCriando(true);
    const { data, error } = await supabase.from("projects").insert({
      client_id: (isStaff ? adminClientId : scopedClientId) ?? null,
      name: "Novo projeto",
      status: "planejamento",
      priority: "media",
      start_date: hoje(),
    }).select().single();
    setCriando(false);
    if (error) { setErro("Nao foi possivel criar: " + error.message); return; }
    const novo = data as ProjectRow;
    setProjects(cur => [novo, ...cur]);
    setEditando({ id: novo.id, valor: novo.name });
  }

  async function salvarNome() {
    if (!editando) return;
    const nome = editando.valor.trim();
    const p = projects.find(x => x.id === editando.id);
    setEditando(null);
    if (!p || !nome || nome === p.name) return;
    await salvar(p.id, { name: nome });
  }

  async function excluir(p: ProjectRow) {
    const { error } = await supabase.from("projects").delete().eq("id", p.id);
    if (error) { setErro("Nao foi possivel excluir: " + error.message); return; }
    setProjects(cur => cur.filter(x => x.id !== p.id));
    setAbertoId(null);
  }

  function Cartao({ p }: { p: ProjectRow }) {
    const lista = tarefasDe(p.id);
    const feitas = lista.filter(t => t.status === "concluida").length;
    const pct = lista.length ? (feitas / lista.length) * 100 : 0;
    const info = sInfo(p.status);
    const d = dept(p.department_id);
    const pessoas = pessoasDe(p.id);
    const dl = p.due_date ? diasAte(p.due_date) : null;
    const atrasado = dl !== null && dl < 0 && p.status !== "concluido" && p.status !== "cancelado";
    const aberto = abertoId === p.id;
    const emEdicao = editando?.id === p.id;

    return (
      <div className="border hairline rounded-xl bg-white dark:bg-[#11141b] shadow-sm overflow-hidden">
        <div className="p-4 flex flex-col gap-3">
          {/* nome e prioridade */}
          <div className="flex items-start justify-between gap-3">
            {emEdicao ? (
              <input
                autoFocus
                className="text-[15px] font-semibold border hairline rounded px-2 h-8 bg-white dark:bg-[#11141b] flex-1 min-w-0"
                value={editando.valor}
                onChange={e => setEditando({ id: p.id, valor: e.target.value })}
                onBlur={salvarNome}
                onKeyDown={e => {
                  if (e.key === "Enter") salvarNome();
                  if (e.key === "Escape") setEditando(null);
                }}
              />
            ) : (
              <button
                className="text-[15px] font-semibold leading-snug text-left min-w-0 flex-1 hover:underline underline-offset-2"
                onClick={() => setEditando({ id: p.id, valor: p.name })}
                title="Clique para renomear">
                {p.name}
              </button>
            )}

            <span className="shrink-0 w-[110px]">
              <CellPicker variante="campo" title="Alterar prioridade" width={180}
                trigger={<Badge label={PRIO[p.priority].label} color={PRIO[p.priority].color} />}>
                {fechar => PRIORIDADES.map(pr => (
                  <MenuItem key={pr} selecionado={p.priority === pr}
                    onClick={() => { salvar(p.id, { priority: pr }); fechar(); }}>
                    <Badge label={PRIO[pr].label} color={PRIO[pr].color} />
                  </MenuItem>
                ))}
              </CellPicker>
            </span>
          </div>

          {/* situacao, cliente e departamento */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-3 gap-y-1">
            <CellPicker variante="campo" title="Alterar situacao"
              trigger={
                <span className="inline-flex items-center gap-2 min-w-0 text-[13px]">
                  <StatusDot status={info.dot} />
                  <span className="truncate">{info.label}</span>
                </span>
              }>
              {fechar => STATUS.map(s => (
                <MenuItem key={s.key} selecionado={p.status === s.key}
                  onClick={() => { salvar(p.id, { status: s.key }); fechar(); }}>
                  <span className="inline-flex items-center gap-2">
                    <StatusDot status={s.dot} />{s.label}
                  </span>
                </MenuItem>
              ))}
            </CellPicker>

            {isStaff && (
              <CellPicker variante="campo" title="Alterar cliente"
                busca={adminClients.length > 8} placeholder="Buscar cliente..."
                trigger={<span className="text-[13px] truncate">{clientName(p.client_id)}</span>}>
                {(fechar, termo) => (
                  <>
                    <MenuItem selecionado={!p.client_id}
                      onClick={() => { salvar(p.id, { client_id: null }); fechar(); }}>
                      <span className="opacity-50">Interno (agencia)</span>
                    </MenuItem>
                    {adminClients
                      .filter(c => !termo || c.name.toLowerCase().includes(termo))
                      .map(c => (
                        <MenuItem key={c.id} selecionado={p.client_id === c.id}
                          onClick={() => { salvar(p.id, { client_id: c.id }); fechar(); }}>
                          {c.name}
                        </MenuItem>
                      ))}
                  </>
                )}
              </CellPicker>
            )}

            <CellPicker variante="campo" title="Alterar departamento"
              busca={depts.length > 8} placeholder="Buscar departamento..."
              trigger={
                d
                  ? <span className="inline-flex items-center gap-2 min-w-0 text-[13px]">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: d.color }} />
                      <span className="truncate">{d.name}</span>
                    </span>
                  : <span className="text-[13px] opacity-35">Sem departamento</span>
              }>
              {(fechar, termo) => (
                <>
                  <MenuItem selecionado={!p.department_id}
                    onClick={() => { salvar(p.id, { department_id: null }); fechar(); }}>
                    <span className="opacity-50">Sem departamento</span>
                  </MenuItem>
                  {depts.filter(x => x.active && (!termo || x.name.toLowerCase().includes(termo)))
                    .map(x => (
                      <MenuItem key={x.id} selecionado={p.department_id === x.id}
                        onClick={() => { salvar(p.id, { department_id: x.id }); fechar(); }}>
                        <span className="inline-flex items-center gap-2 min-w-0">
                          <span className="w-2 h-2 rounded-full shrink-0" style={{ background: x.color }} />
                          <span className="truncate">{x.name}</span>
                        </span>
                      </MenuItem>
                    ))}
                </>
              )}
            </CellPicker>
          </div>

          {p.description && (
            <p className="text-[13px] opacity-65 leading-relaxed">{p.description}</p>
          )}

          {/* andamento pelas tarefas */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between text-[11px]">
              <span className="opacity-55">
                {lista.length > 0 ? `${feitas} de ${lista.length} tarefas` : "Sem tarefas vinculadas"}
              </span>
              <span className="font-mono font-semibold tabular">{Math.round(pct)}%</span>
            </div>
            <div className="h-1.5 rounded-full overflow-hidden bg-black/[0.07] dark:bg-white/[0.08]">
              <span className="block h-full rounded-full transition-all"
                style={{ width: `${pct}%`, background: info.color }} />
            </div>
          </div>

          {/* datas, equipe e orcamento */}
          <div className="flex items-center gap-3 flex-wrap text-[12px]">
            <span className="inline-flex items-center gap-1.5">
              <span className="opacity-45">Inicio</span>
              <span className="inline-block w-[104px]">
                <CellPicker variante="campo" title="Alterar inicio" width={250}
                  trigger={<span className="text-[12px]">{p.start_date ? fmtData(p.start_date) : "Vazio"}</span>}>
                  {fechar => (
                    <MenuData valor={p.start_date} onFechar={fechar}
                      onSalvar={v => salvar(p.id, { start_date: v })} />
                  )}
                </CellPicker>
              </span>
            </span>

            <span className="inline-flex items-center gap-1.5">
              <span className="opacity-45">Prazo</span>
              <span className="inline-block w-[124px]">
                <CellPicker variante="campo" title="Alterar prazo" width={250}
                  trigger={
                    <span className="text-[12px]"
                      style={atrasado ? { color: "var(--bad)", fontWeight: 600 } : {}}>
                      {p.due_date
                        ? `${fmtData(p.due_date)}${dl !== null ? ` (${dl < 0 ? `${Math.abs(dl)}d` : `${dl}d`})` : ""}`
                        : "Vazio"}
                    </span>
                  }>
                  {fechar => (
                    <MenuData valor={p.due_date} onFechar={fechar}
                      onSalvar={v => salvar(p.id, { due_date: v })} />
                  )}
                </CellPicker>
              </span>
            </span>

            {pessoas.length > 0 && (
              <span className="inline-flex items-center gap-1.5">
                <AvatarStack people={pessoas} size={20} max={4} empty="" />
              </span>
            )}

            {/* orcamento e informacao do dono da agencia */}
            {isAdmin && p.budget != null && (
              <span className="opacity-55">
                Orcamento <span className="font-mono">{fmtBrl(p.budget)}</span>
              </span>
            )}
          </div>

          <div className="flex items-center gap-3 pt-1 border-t hairline">
            {lista.length > 0 && (
              <button className="text-[12px] font-semibold underline underline-offset-2"
                style={{ color: "var(--copper)" }}
                onClick={() => setAbertoId(aberto ? null : p.id)}>
                {aberto ? "Ocultar tarefas" : `Ver ${lista.length} tarefas`}
              </button>
            )}
            <button className="text-[12px] opacity-45 hover:opacity-90 ml-auto"
              onClick={() => navigate("/tarefas")}>
              Abrir no quadro
            </button>
            {isAdmin && (
              <CellPicker title="Remover projeto" width={230}
                trigger={<span className="text-[11px] opacity-35">···</span>}>
                {fechar => (
                  <div className="p-1 flex flex-col gap-1.5">
                    <span className="text-[12px] opacity-60 px-1">
                      As tarefas continuam, apenas sem projeto.
                    </span>
                    <button className="text-[12px] font-semibold px-2 py-1.5 rounded text-left"
                      style={{ background: "var(--bad)", color: "white" }}
                      onClick={() => { excluir(p); fechar(); }}>
                      Excluir projeto
                    </button>
                  </div>
                )}
              </CellPicker>
            )}
          </div>
        </div>

        {aberto && (
          <div className="border-t hairline bg-black/[0.015] dark:bg-white/[0.02] px-4 py-2">
            {lista.map(t => (
              <div key={t.id} className="flex items-center justify-between gap-3 py-1.5 border-b hairline last:border-0">
                <span className="flex items-center gap-2 min-w-0">
                  <StatusDot status={t.status === "concluida" ? "ok" : t.status === "em_andamento" ? "warn" : "neutral"} />
                  <span className={cls("text-[13px] truncate", t.status === "concluida" && "line-through opacity-45")}>
                    {t.title}
                  </span>
                </span>
                {t.due_date && (
                  <span className="text-[11px] opacity-55 font-mono shrink-0">{fmtData(t.due_date)}</span>
                )}
              </div>
            ))}
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
            {isStaff && (
              <select className="text-xs border hairline rounded px-2 py-1.5 bg-white dark:bg-[#11141b]"
                value={adminClientId ?? ""} onChange={e => setAdminClientId(e.target.value || null)}>
                <option value="">Todos os clientes</option>
                {adminClients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            )}
            {isStaff && (
              <Btn size="sm" onClick={criar} disabled={criando}>
                {criando ? "Criando..." : "+ Novo projeto"}
              </Btn>
            )}
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
          <KpiCard label="Em andamento" value={ativos} sub={`${doEscopo.length} no total`} />
          <KpiCard label="Concluidos"   value={concluidos} />
          <KpiCard label="Atrasados"    value={atrasados} />
          {isAdmin
            ? <KpiCard label="Orcamento" value={fmtBrl(orcamento)} sub="projetos ativos" />
            : <KpiCard label="Com tarefas"
                value={doEscopo.filter(p => tarefasDe(p.id).length > 0).length} />}
        </KpiGrid>

        <div className="filter-row mb-5">
          <button className="chip"
            style={filtro === "todos" ? { background: "var(--brand)", color: "white", borderColor: "var(--brand)" } : {}}
            onClick={() => setFiltro("todos")}>
            Todos {doEscopo.length > 0 && <span className="opacity-70">{doEscopo.length}</span>}
          </button>
          {STATUS.map(s => {
            const n = doEscopo.filter(p => p.status === s.key).length;
            if (!n) return null;
            return (
              <button key={s.key} className="chip"
                style={filtro === s.key ? { background: s.color, color: "white", borderColor: s.color } : {}}
                onClick={() => setFiltro(filtro === s.key ? "todos" : s.key)}>
                {s.label} <span className="opacity-70">{n}</span>
              </button>
            );
          })}
        </div>

        {loading ? (
          <p className="text-[13px] opacity-40 text-center py-16">Carregando...</p>
        ) : visiveis.length === 0 ? (
          <SectionCard>
            <EmptyState
              title={doEscopo.length === 0 ? "Nenhum projeto" : "Nenhum projeto nesta situacao"}
              sub={doEscopo.length === 0
                ? "Crie o primeiro projeto e ajuste os campos no proprio cartao."
                : "Use os filtros acima para ver os demais."}
              action={doEscopo.length === 0 && isStaff
                ? <Btn size="sm" onClick={criar} disabled={criando}>+ Novo projeto</Btn>
                : <Btn size="sm" variant="ghost" onClick={() => setFiltro("todos")}>Ver todos</Btn>}
            />
          </SectionCard>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            {visiveis.map(p => <Cartao key={p.id} p={p} />)}
          </div>
        )}
      </PageWrap>
    </>
  );
}
