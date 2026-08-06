import { useState, useEffect } from "react";
import PageMeta from "../../components/common/PageMeta";
import {
  PageWrap, KpiCard, KpiGrid, SectionCard, Btn, EmptyState, Avatar,
} from "../../components/ui/InprorComponents";
import { useClientScope } from "../../context/AuthContext";
import { supabase } from "../../lib/supabase";
import { TaskRow, isOverdue } from "../Tarefas/shared";

// Paleta dos avatares, alinhada as cores da marca
const COLORS = [
  "#0C2118", "#A85730", "#1a3d2b", "#8f4a28",
  "#2c5f45", "#b5744a", "#3d6b52", "#64748b",
];

// Modulos que podem ser liberados para a equipe.
// Financeiro, clientes e equipe ficam fora: sao exclusivos do admin.
const MODULOS: { key: string; label: string }[] = [
  { key: "tarefas",      label: "Tarefas" },
  { key: "projetos",     label: "Projetos" },
  { key: "delivery",     label: "Delivery" },
  { key: "reputacao",    label: "Reputacao" },
  { key: "trafego-pago", label: "Trafego pago" },
  { key: "social",       label: "Redes sociais" },
  { key: "cardapio",     label: "Cardapio e site" },
  { key: "estrategias",  label: "Estrategias" },
  { key: "metas-kpis",   label: "Metas e KPIs" },
  { key: "relatorios",   label: "Relatorios" },
  { key: "reunioes",     label: "Reunioes" },
];

const emptyForm = () => ({
  name: "", role_title: "", email: "", color: COLORS[0], active: "sim",
});
type FormShape = ReturnType<typeof emptyForm>;

interface Member {
  id: string; user_id: string | null; name: string;
  email: string | null; role_title: string | null;
  color: string | null; active: boolean;
  modules?: string[] | null;
}

export default function Equipe() {
  const { authLoading, team, reloadTeam, myMemberId, adminClients } = useClientScope();

  const [tasks, setTasks]   = useState<TaskRow[]>([]);
  const [assignees, setAssignees] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(true);
  const [erro, setErro]     = useState<string | null>(null);

  const [showForm, setShowForm]   = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm]           = useState<FormShape>(emptyForm());
  const [saving, setSaving]       = useState(false);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  // painel de acesso: clientes atendidos e modulos liberados
  const [accessId, setAccessId]   = useState<string | null>(null);
  const [memberClients, setMemberClients] = useState<Record<string, string[]>>({});
  const [savingAccess, setSavingAccess]   = useState(false);
  const [convidando, setConvidando]       = useState<string | null>(null);
  const [aviso, setAviso]                 = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;
    Promise.all([
      supabase.from("tasks").select("*"),
      supabase.from("task_assignees").select("task_id,member_id"),
      supabase.from("member_clients").select("member_id,client_id"),
    ]).then(([t, a, mc]) => {
      const byMember: Record<string, string[]> = {};
      ((mc.data as { member_id: string; client_id: string }[]) ?? [])
        .forEach(r => { (byMember[r.member_id] ??= []).push(r.client_id); });
      setMemberClients(byMember);
      setTasks((t.data as TaskRow[]) ?? []);
      const map: Record<string, string[]> = {};
      ((a.data as { task_id: string; member_id: string }[]) ?? [])
        .forEach(r => { (map[r.task_id] ??= []).push(r.member_id); });
      setAssignees(map);
      setLoading(false);
    });
  }, [authLoading]);

  const statsFor = (memberId: string) => {
    const mine = tasks.filter(t => (assignees[t.id] ?? []).includes(memberId));
    const abertas = mine.filter(t => t.status !== "concluida");
    return {
      total: mine.length,
      abertas: abertas.length,
      atrasadas: abertas.filter(isOverdue).length,
      concluidas: mine.filter(t => t.status === "concluida").length,
    };
  };

  const semDono = tasks.filter(t => t.status !== "concluida" && !(assignees[t.id] ?? []).length).length;
  const ativos  = team.filter(m => m.active).length;

  function openNew() {
    setEditingId(null); setForm(emptyForm()); setErro(null); setShowForm(true);
  }

  function openEdit(m: Member) {
    setEditingId(m.id);
    setForm({
      name: m.name,
      role_title: m.role_title ?? "",
      email: m.email ?? "",
      color: m.color ?? COLORS[0],
      active: m.active ? "sim" : "nao",
    });
    setErro(null);
    setShowForm(true);
  }

  async function handleSave() {
    if (!form.name.trim()) return;
    setSaving(true);
    const payload = {
      name: form.name.trim(),
      role_title: form.role_title.trim() || null,
      email: form.email.trim() || null,
      color: form.color,
      active: form.active === "sim",
    };
    const { error } = editingId
      ? await supabase.from("team_members").update(payload).eq("id", editingId)
      : await supabase.from("team_members").insert(payload);
    setSaving(false);
    if (error) { setErro("Nao foi possivel salvar: " + error.message); return; }
    await reloadTeam();
    setShowForm(false);
    setEditingId(null);
    setForm(emptyForm());
  }

  async function handleDelete(id: string) {
    const s = statsFor(id);
    setConfirmId(null);
    // as tarefas nao somem: assignee_id fica nulo pela FK
    const { error } = await supabase.from("team_members").delete().eq("id", id);
    if (error) { setErro("Nao foi possivel remover: " + error.message); return; }
    await reloadTeam();
    if (s.abertas > 0) {
      setAssignees(cur => Object.fromEntries(
        Object.entries(cur).map(([k, v]) => [k, v.filter(x => x !== id)])));
    }
  }

  // liga ou desliga um cliente do escopo do membro
  async function toggleClient(memberId: string, clientId: string) {
    const atuais = memberClients[memberId] ?? [];
    const on = atuais.includes(clientId);
    setSavingAccess(true);
    setMemberClients(cur => ({
      ...cur,
      [memberId]: on ? atuais.filter(c => c !== clientId) : [...atuais, clientId],
    }));
    const { error } = on
      ? await supabase.from("member_clients").delete()
          .eq("member_id", memberId).eq("client_id", clientId)
      : await supabase.from("member_clients")
          .insert({ member_id: memberId, client_id: clientId });
    setSavingAccess(false);
    if (error) {
      setMemberClients(cur => ({ ...cur, [memberId]: atuais }));
      setErro("Nao foi possivel alterar os clientes: " + error.message);
    }
  }

  async function toggleModule(m: Member, key: string) {
    const atuais = m.modules ?? [];
    const novos = atuais.includes(key) ? atuais.filter(x => x !== key) : [...atuais, key];
    setSavingAccess(true);
    const { error } = await supabase.from("team_members")
      .update({ modules: novos }).eq("id", m.id);
    setSavingAccess(false);
    if (error) { setErro("Nao foi possivel alterar os modulos: " + error.message); return; }
    await reloadTeam();
  }

  // dispara o convite por e-mail (Edge Function convidar-membro)
  async function convidar(m: Member) {
    const email = (m.email ?? "").trim();
    if (!email) { setErro("Cadastre o e-mail da pessoa antes de convidar."); return; }
    setConvidando(m.id);
    setErro(null); setAviso(null);
    const { data, error } = await supabase.functions.invoke("convidar-membro", {
      body: { email, member_id: m.id, redirect_to: window.location.origin + "/signin" },
    });
    setConvidando(null);
    if (error || (data && data.error)) {
      setErro("Convite nao enviado: " + (data?.error ?? error?.message ?? "erro desconhecido"));
      return;
    }
    setAviso(`Convite enviado para ${email}.`);
    await reloadTeam();
  }

  const f = (k: keyof FormShape) =>
    (e: { target: { value: string } }) => setForm(prev => ({ ...prev, [k]: e.target.value }));

  return (
    <>
      <PageMeta title="Equipe | inProR" />
      <PageWrap
        title="Equipe"
        subtitle="Quem executa as tarefas da agencia"
        action={
          <Btn size="sm" onClick={() => showForm ? setShowForm(false) : openNew()}>
            {showForm ? "Fechar" : "+ Novo membro"}
          </Btn>
        }
      >
        {erro && (
          <div className="mb-4 border hairline rounded-lg px-4 py-2.5 flex items-center justify-between gap-3"
            style={{ borderColor: "var(--bad)" }}>
            <span className="text-[13px]" style={{ color: "var(--bad)" }}>{erro}</span>
            <button className="text-[11px] opacity-60" onClick={() => setErro(null)}>fechar</button>
          </div>
        )}
        {aviso && (
          <div className="mb-4 border hairline rounded-lg px-4 py-2.5 flex items-center justify-between gap-3"
            style={{ borderColor: "var(--ok)" }}>
            <span className="text-[13px]" style={{ color: "var(--ok)" }}>{aviso}</span>
            <button className="text-[11px] opacity-60" onClick={() => setAviso(null)}>fechar</button>
          </div>
        )}

        <KpiGrid>
          <KpiCard label="Membros ativos"  value={ativos} sub={`${team.length} cadastrados`} />
          <KpiCard label="Tarefas abertas" value={tasks.filter(t => t.status !== "concluida").length} />
          <KpiCard label="Sem responsavel" value={semDono} />
          <KpiCard label="Atrasadas"       value={tasks.filter(isOverdue).length} />
        </KpiGrid>

        {showForm && (
          <SectionCard title={editingId ? "Editar Membro" : "Novo Membro"} className="mb-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
              <label className="flex flex-col gap-1">
                <span className="text-[11px] opacity-55 uppercase tracking-wide">Nome</span>
                <input className="text-sm border hairline rounded px-2 py-1.5 bg-white dark:bg-[#11141b]"
                  value={form.name} onChange={f("name")} placeholder="Nome da pessoa" autoFocus />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[11px] opacity-55 uppercase tracking-wide">Funcao</span>
                <input className="text-sm border hairline rounded px-2 py-1.5 bg-white dark:bg-[#11141b]"
                  value={form.role_title} onChange={f("role_title")} placeholder="Social media, trafego, design" />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[11px] opacity-55 uppercase tracking-wide">E-mail</span>
                <input type="email" className="text-sm border hairline rounded px-2 py-1.5 bg-white dark:bg-[#11141b]"
                  value={form.email} onChange={f("email")} placeholder="opcional" />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[11px] opacity-55 uppercase tracking-wide">Situacao</span>
                <select className="text-sm border hairline rounded px-2 py-1.5 bg-white dark:bg-[#11141b]"
                  value={form.active} onChange={f("active")}>
                  <option value="sim">Ativo</option>
                  <option value="nao">Inativo</option>
                </select>
              </label>
              <div className="flex flex-col gap-1.5 sm:col-span-2 md:col-span-4">
                <span className="text-[11px] opacity-55 uppercase tracking-wide">Cor do avatar</span>
                <div className="flex items-center gap-2 flex-wrap">
                  {COLORS.map(c => (
                    <button key={c} type="button"
                      onClick={() => setForm(prev => ({ ...prev, color: c }))}
                      className="w-8 h-8 rounded-full transition-transform"
                      style={{
                        background: c,
                        outline: form.color === c ? "2px solid var(--ink)" : "none",
                        outlineOffset: 2,
                      }}
                      aria-label={`Cor ${c}`} />
                  ))}
                  <span className="ml-2 flex items-center gap-2 text-[12px] opacity-55">
                    Previa <Avatar name={form.name || "Novo"} color={form.color} size={30} />
                  </span>
                </div>
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <Btn onClick={handleSave} disabled={saving || !form.name.trim()}>
                {saving ? "Salvando..." : editingId ? "Salvar alteracoes" : "Cadastrar"}
              </Btn>
              <Btn variant="ghost" onClick={() => { setShowForm(false); setEditingId(null); }}>Cancelar</Btn>
            </div>
          </SectionCard>
        )}

        {loading ? (
          <p className="text-[13px] opacity-40 text-center py-16">Carregando...</p>
        ) : team.length === 0 ? (
          <SectionCard>
            <EmptyState
              title="Nenhum membro cadastrado"
              sub="Cadastre quem executa as tarefas para poder atribuir responsaveis."
              action={<Btn size="sm" onClick={openNew}>+ Novo membro</Btn>}
            />
          </SectionCard>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {team.map(m => {
              const s = statsFor(m.id);
              const eu = m.id === myMemberId;
              return (
                <div key={m.id}
                  className="border hairline rounded-xl bg-white dark:bg-[#11141b] shadow-sm p-4 flex flex-col gap-3"
                  style={!m.active ? { opacity: 0.6 } : {}}>
                  <div className="flex items-start gap-3">
                    <Avatar name={m.name} color={m.color} size={44} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[15px] font-semibold truncate">{m.name}</span>
                        {eu && (
                          <span className="text-[10px] font-medium px-2 py-0.5 rounded-full"
                            style={{ background: "rgba(168,87,48,.12)", color: "var(--copper)" }}>voce</span>
                        )}
                        {!m.active && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full"
                            style={{ background: "rgba(0,0,0,.06)" }}>inativo</span>
                        )}
                      </div>
                      {m.role_title && <div className="text-[12px] opacity-55 truncate">{m.role_title}</div>}
                      {m.email && <div className="text-[11px] opacity-40 truncate">{m.email}</div>}
                      <div className="text-[11px] mt-1 flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full inline-block"
                          style={{ background: m.user_id ? "var(--ok)" : "var(--line-light)" }} />
                        <span className="opacity-50">
                          {m.user_id ? "acesso liberado" : "sem acesso ao painel"}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="border hairline rounded-lg py-2">
                      <div className="font-mono text-base font-bold tabular" style={{ color: "var(--brand)" }}>{s.abertas}</div>
                      <div className="text-[10px] opacity-50 uppercase tracking-wide">Abertas</div>
                    </div>
                    <div className="border hairline rounded-lg py-2"
                      style={s.atrasadas > 0 ? { borderColor: "var(--bad)" } : {}}>
                      <div className="font-mono text-base font-bold tabular"
                        style={{ color: s.atrasadas > 0 ? "var(--bad)" : "var(--ink)" }}>{s.atrasadas}</div>
                      <div className="text-[10px] opacity-50 uppercase tracking-wide">Atrasadas</div>
                    </div>
                    <div className="border hairline rounded-lg py-2">
                      <div className="font-mono text-base font-bold tabular opacity-70">{s.concluidas}</div>
                      <div className="text-[10px] opacity-50 uppercase tracking-wide">Feitas</div>
                    </div>
                  </div>

                  {/* Acesso: clientes atendidos e modulos liberados */}
                  {accessId === m.id && (
                    <div className="border-t hairline pt-3 flex flex-col gap-3">
                      <div>
                        <div className="text-[11px] uppercase tracking-wide opacity-55 mb-1.5">
                          Clientes atendidos
                          <span className="ml-1 opacity-70">({(memberClients[m.id] ?? []).length})</span>
                        </div>
                        {adminClients.length === 0 ? (
                          <p className="text-[12px] opacity-45">Nenhum cliente cadastrado.</p>
                        ) : (
                          <div className="flex flex-wrap gap-1.5">
                            {adminClients.map(c => {
                              const on = (memberClients[m.id] ?? []).includes(c.id);
                              return (
                                <button key={c.id} type="button"
                                  onClick={() => toggleClient(m.id, c.id)}
                                  className="text-[11px] px-2.5 py-1 rounded-full border transition-colors"
                                  style={on
                                    ? { background: "var(--brand)", color: "white", borderColor: "var(--brand)" }
                                    : { borderColor: "var(--line-light)" }}
                                  aria-pressed={on}>
                                  {c.name}
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      <div>
                        <div className="text-[11px] uppercase tracking-wide opacity-55 mb-1.5">
                          Modulos liberados
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {MODULOS.map(mod => {
                            const on = (m.modules ?? []).includes(mod.key);
                            return (
                              <button key={mod.key} type="button"
                                onClick={() => toggleModule(m as Member, mod.key)}
                                className="text-[11px] px-2.5 py-1 rounded-full border transition-colors"
                                style={on
                                  ? { background: "var(--copper)", color: "white", borderColor: "var(--copper)" }
                                  : { borderColor: "var(--line-light)" }}
                                aria-pressed={on}>
                                {mod.label}
                              </button>
                            );
                          })}
                        </div>
                        <p className="text-[11px] opacity-40 mt-2 leading-relaxed">
                          Financeiro, clientes e equipe ficam sempre restritos ao administrador.
                        </p>
                      </div>

                      <div className="flex items-center gap-2 flex-wrap">
                        {!m.user_id && (
                          <Btn size="sm" onClick={() => convidar(m as Member)}
                            disabled={convidando === m.id || !m.email}>
                            {convidando === m.id ? "Enviando..." : "Convidar por e-mail"}
                          </Btn>
                        )}
                        {!m.user_id && !m.email && (
                          <span className="text-[11px] opacity-50">Cadastre o e-mail para poder convidar.</span>
                        )}
                        {savingAccess && <span className="text-[11px] opacity-50">salvando...</span>}
                      </div>
                    </div>
                  )}

                  <div className="flex items-center justify-between gap-2 pt-1 border-t hairline">
                    <button className="text-[12px] font-semibold underline underline-offset-2"
                      style={{ color: "var(--copper)" }}
                      onClick={() => setAccessId(accessId === m.id ? null : m.id)}>
                      {accessId === m.id ? "Fechar acesso" : "Acesso"}
                    </button>
                    {confirmId === m.id ? (
                      <span className="flex items-center gap-1.5">
                        <span className="text-[11px] opacity-55">Remover?</span>
                        <button className="text-[11px] font-semibold px-2 py-1 rounded"
                          style={{ background: "var(--bad)", color: "white" }}
                          onClick={() => handleDelete(m.id)}>Sim</button>
                        <button className="text-[11px] px-2 py-1 rounded border hairline"
                          onClick={() => setConfirmId(null)}>Nao</button>
                      </span>
                    ) : (
                      <span className="flex items-center gap-2">
                        <button className="text-[11px] uppercase tracking-wide opacity-45 hover:opacity-90 px-2 py-1"
                          onClick={() => openEdit(m as Member)}>Editar</button>
                        <button className="text-[11px] uppercase tracking-wide opacity-45 hover:opacity-100 px-2 py-1"
                          style={{ color: "var(--bad)" }}
                          onClick={() => setConfirmId(m.id)}>Remover</button>
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <p className="text-[12px] opacity-45 mt-5 leading-relaxed">
          Remover um membro nao apaga as tarefas dele: elas voltam para o estado sem responsavel.
          Para o atalho de tarefas proprias funcionar, o membro precisa estar vinculado a um login,
          o que e feito no Supabase pelo campo user_id.
        </p>
      </PageWrap>
    </>
  );
}
