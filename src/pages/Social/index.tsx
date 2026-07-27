import { useState, useEffect } from "react";
import PageMeta from "../../components/common/PageMeta";
import {
  PageWrap, KpiCard, KpiGrid, SectionCard, Table, Badge, Btn, EmptyState,
} from "../../components/ui/InprorComponents";
import { useClientScope } from "../../context/AuthContext";
import { supabase } from "../../lib/supabase";

type ArticleStatus = "rascunho" | "revisao" | "aprovado" | "publicado";
type ArticleTipo   = "Reels" | "Feed" | "Stories" | "Carrossel" | "TikTok" | "UGC" | "Pagina" | "Blog";

interface ArticleRow {
  id: string; client_id: string;
  title: string | null; tipo: ArticleTipo; status: ArticleStatus;
  plataforma: string | null; produto_destacado: string | null;
  url: string | null; published_at: string | null; notes: string | null;
  created_at: string;
}

const STATUS_LIST: { key: ArticleStatus | "todos"; label: string; color: string }[] = [
  { key: "todos",     label: "Todos",    color: "var(--brand)" },
  { key: "rascunho",  label: "Rascunho", color: "var(--ink)" },
  { key: "revisao",   label: "Revisao",  color: "var(--warn)" },
  { key: "aprovado",  label: "Aprovado", color: "var(--ok)" },
  { key: "publicado", label: "Publicado",color: "var(--copper)" },
];

const TIPOS: ArticleTipo[] = ["Reels", "Feed", "Stories", "Carrossel", "TikTok", "UGC", "Pagina", "Blog"];

const statusBadge = (s: ArticleStatus) => {
  const map: Record<ArticleStatus, "default" | "green" | "copper" | "yellow"> = {
    rascunho: "default", revisao: "yellow", aprovado: "green", publicado: "copper",
  };
  return <Badge label={s} color={map[s]} />;
};

type ViewMode = "lista" | "kanban";

const emptyForm = () => ({
  title: "", tipo: "Reels" as ArticleTipo, status: "rascunho" as ArticleStatus,
  plataforma: "", produto_destacado: "", published_at: "", notes: "",
});

export default function Social() {
  const { scopedClientId, authLoading, isAdmin, adminClientId, setAdminClientId, adminClients } = useClientScope();
  const [articles, setArticles] = useState<ArticleRow[]>([]);
  const [loading, setLoading]   = useState(true);
  const [statusFilter, setStatusFilter] = useState<ArticleStatus | "todos">("todos");
  const [viewMode, setViewMode] = useState<ViewMode>("lista");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm]         = useState(emptyForm());
  const [saving, setSaving]     = useState(false);

  useEffect(() => {
    if (authLoading) return;
    const cid = scopedClientId;
    if (!cid) { setArticles([]); setLoading(false); return; }
    setLoading(true);
    supabase.from("articles")
      .select("*").eq("client_id", cid).order("created_at", { ascending: false })
      .then(({ data }) => { setArticles((data as ArticleRow[]) ?? []); setLoading(false); });
  }, [scopedClientId, authLoading]);

  const filtered = statusFilter === "todos"
    ? articles : articles.filter(a => a.status === statusFilter);

  const total      = articles.length;
  const publicados = articles.filter(a => a.status === "publicado").length;
  const emRevisao  = articles.filter(a => a.status === "revisao").length;
  const aprovados  = articles.filter(a => a.status === "aprovado").length;

  const porTipo = TIPOS
    .map(t => ({ tipo: t, count: articles.filter(a => a.tipo === t).length }))
    .filter(t => t.count > 0)
    .sort((a, b) => b.count - a.count);

  const maxTipoCount = Math.max(...porTipo.map(t => t.count), 1);

  async function changeStatus(id: string, s: ArticleStatus) {
    await supabase.from("articles").update({ status: s }).eq("id", id);
    setArticles(prev => prev.map(a => a.id === id ? { ...a, status: s } : a));
  }

  async function handleSave() {
    if (!scopedClientId) return;
    setSaving(true);
    const { data, error } = await supabase.from("articles").insert({
      client_id: scopedClientId,
      title: form.title || null, tipo: form.tipo, status: form.status,
      plataforma: form.plataforma || null,
      produto_destacado: form.produto_destacado || null,
      published_at: form.published_at || null,
      notes: form.notes || null,
    }).select().single();
    setSaving(false);
    if (!error && data) {
      setArticles(prev => [data as ArticleRow, ...prev]);
      setShowForm(false);
      setForm(emptyForm());
    }
  }

  const f = (k: keyof ReturnType<typeof emptyForm>) =>
    (e: { target: { value: string } }) =>
      setForm(prev => ({ ...prev, [k]: e.target.value }));

  const StatusSelect = ({ row }: { row: ArticleRow }) => (
    <select
      className="text-[10px] border hairline rounded px-1.5 py-0.5 bg-white dark:bg-[#11141b]"
      value={row.status}
      onChange={e => changeStatus(row.id, e.target.value as ArticleStatus)}
    >
      {STATUS_LIST.filter(s => s.key !== "todos").map(s =>
        <option key={s.key} value={s.key}>{s.label}</option>
      )}
    </select>
  );

  const tableRows = filtered.map(a => [
    statusBadge(a.status),
    a.tipo,
    a.title ?? <span className="opacity-30 italic text-xs">sem titulo</span>,
    a.plataforma ?? "-",
    a.produto_destacado ?? "-",
    a.published_at ?? "-",
    <StatusSelect row={a} />,
  ]);

  return (
    <>
      <PageMeta title="Redes Sociais | inProR" />
      <PageWrap
        title="Redes Sociais"
        subtitle="Pipeline de conteudo e publicacoes"
        action={
          <div className="flex items-center gap-2">
            {isAdmin && (
              <select className="text-xs border hairline rounded px-2 py-1.5 bg-white dark:bg-[#11141b]"
                value={adminClientId ?? ""} onChange={e => setAdminClientId(e.target.value || null)}>
                <option value="">Selecionar cliente...</option>
                {adminClients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            )}
            <Btn size="sm" onClick={() => setShowForm(v => !v)}>+ Novo conteudo</Btn>
          </div>
        }
      >
        {/* KPIs */}
        <KpiGrid>
          <KpiCard label="Total"       value={total} />
          <KpiCard label="Publicados"  value={publicados} />
          <KpiCard label="Em Revisao"  value={emRevisao} />
          <KpiCard label="Aprovados"   value={aprovados} />
        </KpiGrid>

        {/* Controls */}
        <div className="flex items-center justify-between flex-wrap gap-3 mb-5">
          <div className="filter-row">
            {STATUS_LIST.map(s => (
              <button key={s.key} className="chip"
                style={statusFilter === s.key
                  ? { background: s.color, color: "white", borderColor: s.color }
                  : {}}
                onClick={() => setStatusFilter(s.key as ArticleStatus | "todos")}
              >
                {s.label}
              </button>
            ))}
          </div>
          <div className="flex gap-1 shrink-0">
            {(["lista", "kanban"] as ViewMode[]).map(v => (
              <button key={v}
                className="font-mono text-[10px] uppercase tracking-wider px-3 py-1.5 rounded border hairline transition-colors"
                style={viewMode === v
                  ? { background: "var(--brand)", color: "white", borderColor: "var(--brand)" }
                  : {}}
                onClick={() => setViewMode(v)}
              >
                {v}
              </button>
            ))}
          </div>
        </div>

        {/* Add form */}
        {showForm && (
          <SectionCard title="Novo Conteudo" className="mb-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
              <label className="col-span-2 flex flex-col gap-1">
                <span className="font-mono text-[10px] opacity-50 uppercase tracking-wider">Titulo</span>
                <input type="text"
                  className="text-sm border hairline rounded px-2 py-1.5 bg-white dark:bg-[#11141b]"
                  value={form.title} onChange={f("title")} placeholder="Ex: Receita do dia, Combo especial..." />
              </label>
              <label className="flex flex-col gap-1">
                <span className="font-mono text-[10px] opacity-50 uppercase tracking-wider">Formato</span>
                <select className="text-sm border hairline rounded px-2 py-1.5 bg-white dark:bg-[#11141b]"
                  value={form.tipo} onChange={f("tipo")}>
                  {TIPOS.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="font-mono text-[10px] opacity-50 uppercase tracking-wider">Status</span>
                <select className="text-sm border hairline rounded px-2 py-1.5 bg-white dark:bg-[#11141b]"
                  value={form.status} onChange={f("status")}>
                  {STATUS_LIST.filter(s => s.key !== "todos").map(s =>
                    <option key={s.key} value={s.key}>{s.label}</option>
                  )}
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="font-mono text-[10px] opacity-50 uppercase tracking-wider">Plataforma</span>
                <input type="text"
                  className="text-sm border hairline rounded px-2 py-1.5 bg-white dark:bg-[#11141b]"
                  value={form.plataforma} onChange={f("plataforma")} placeholder="Instagram, TikTok..." />
              </label>
              <label className="flex flex-col gap-1">
                <span className="font-mono text-[10px] opacity-50 uppercase tracking-wider">Produto em Destaque</span>
                <input type="text"
                  className="text-sm border hairline rounded px-2 py-1.5 bg-white dark:bg-[#11141b]"
                  value={form.produto_destacado} onChange={f("produto_destacado")} placeholder="Ex: X-Burguer duplo" />
              </label>
              <label className="flex flex-col gap-1">
                <span className="font-mono text-[10px] opacity-50 uppercase tracking-wider">Data de Publicacao</span>
                <input type="date"
                  className="text-sm border hairline rounded px-2 py-1.5 bg-white dark:bg-[#11141b]"
                  value={form.published_at} onChange={f("published_at")} />
              </label>
              <label className="col-span-2 flex flex-col gap-1">
                <span className="font-mono text-[10px] opacity-50 uppercase tracking-wider">Observacoes</span>
                <input type="text"
                  className="text-sm border hairline rounded px-2 py-1.5 bg-white dark:bg-[#11141b]"
                  value={form.notes} onChange={f("notes")} placeholder="Observacoes internas..." />
              </label>
            </div>
            <div className="flex gap-2 mt-4">
              <Btn onClick={handleSave} disabled={saving}>{saving ? "Salvando..." : "Salvar"}</Btn>
              <Btn variant="ghost" onClick={() => setShowForm(false)}>Cancelar</Btn>
            </div>
          </SectionCard>
        )}

        {/* Main view: lista or kanban */}
        {viewMode === "lista" ? (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <SectionCard title="Conteudos" className="lg:col-span-2">
              {loading ? (
                <p className="font-mono text-xs opacity-40 text-center py-8">Carregando...</p>
              ) : filtered.length === 0 ? (
                <EmptyState
                  title="Nenhum conteudo"
                  sub="Adicione seu primeiro conteudo clicando em Novo conteudo."
                />
              ) : (
                <Table
                  headers={["Status", "Tipo", "Titulo", "Plataforma", "Produto", "Publicacao", "Acao"]}
                  rows={tableRows}
                />
              )}
            </SectionCard>

            <div className="flex flex-col gap-4">
              <SectionCard title="Por Formato">
                {porTipo.length === 0 ? (
                  <p className="font-mono text-xs opacity-40 text-center py-4">Sem dados</p>
                ) : (
                  <div className="flex flex-col gap-2.5">
                    {porTipo.map(t => (
                      <div key={t.tipo}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-mono text-xs">{t.tipo}</span>
                          <span className="font-mono text-xs opacity-60">{t.count}</span>
                        </div>
                        <div className="h-1.5 rounded-full" style={{ background: "rgba(0,0,0,.06)" }}>
                          <div className="h-1.5 rounded-full transition-all"
                            style={{ width: `${(t.count / maxTipoCount) * 100}%`, background: "var(--brand)" }} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </SectionCard>

              <SectionCard title="Pipeline">
                {STATUS_LIST.filter(s => s.key !== "todos").map(s => {
                  const count = articles.filter(a => a.status === s.key).length;
                  return (
                    <div key={s.key}
                      className="flex items-center justify-between py-2 border-b hairline last:border-0 cursor-pointer"
                      onClick={() => setStatusFilter(s.key as ArticleStatus | "todos")}
                    >
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full inline-block shrink-0"
                          style={{ background: s.color }} />
                        <span className="font-mono text-xs capitalize">{s.label}</span>
                      </div>
                      <span className="font-mono text-sm font-bold">{count}</span>
                    </div>
                  );
                })}
              </SectionCard>
            </div>
          </div>
        ) : (
          /* Kanban view */
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {STATUS_LIST.filter(s => s.key !== "todos").map(s => {
              const colItems = articles.filter(a => a.status === s.key);
              return (
                <div key={s.key}
                  className="border hairline rounded-xl bg-white dark:bg-[#11141b] overflow-hidden flex flex-col">
                  <div className="px-3 py-2.5 border-b hairline flex items-center justify-between"
                    style={{ boxShadow: `inset 3px 0 0 ${s.color}` }}>
                    <span className="font-display font-bold text-xs capitalize">{s.label}</span>
                    <span className="font-mono text-[10px] opacity-40 bg-black/5 dark:bg-white/10 px-2 py-0.5 rounded-full">
                      {colItems.length}
                    </span>
                  </div>
                  <div className="p-2 flex flex-col gap-2 flex-1 min-h-[200px]">
                    {colItems.map(a => (
                      <div key={a.id}
                        className="p-2.5 rounded-lg border hairline hover:shadow-sm transition-shadow bg-white dark:bg-[#0c0e14]">
                        <div className="font-mono text-[9px] opacity-40 uppercase tracking-wider mb-1">{a.tipo}</div>
                        <div className="text-xs font-medium leading-snug">
                          {a.title ?? <span className="opacity-30 italic">sem titulo</span>}
                        </div>
                        {a.plataforma && (
                          <div className="font-mono text-[9px] opacity-40 mt-1">{a.plataforma}</div>
                        )}
                        {a.produto_destacado && (
                          <div className="font-mono text-[9px] mt-0.5 opacity-60 truncate">{a.produto_destacado}</div>
                        )}
                        <div className="mt-2">
                          <select
                            className="text-[10px] border hairline rounded px-1.5 py-0.5 bg-white dark:bg-[#0c0e14] w-full"
                            value={a.status}
                            onChange={e => changeStatus(a.id, e.target.value as ArticleStatus)}
                          >
                            {STATUS_LIST.filter(st => st.key !== "todos").map(st =>
                              <option key={st.key} value={st.key}>{st.label}</option>
                            )}
                          </select>
                        </div>
                      </div>
                    ))}
                    {colItems.length === 0 && (
                      <div className="flex-1 flex items-center justify-center">
                        <p className="font-mono text-[10px] opacity-20">Vazio</p>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </PageWrap>
    </>
  );
}
