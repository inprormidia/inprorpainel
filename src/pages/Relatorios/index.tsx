import { useState, useEffect } from "react";
import PageMeta from "../../components/common/PageMeta";
import {
  PageWrap, KpiCard, KpiGrid, SectionCard, Table, Btn, EmptyState,
} from "../../components/ui/InprorComponents";
import { useClientScope } from "../../context/AuthContext";
import { supabase } from "../../lib/supabase";

interface ReportRow {
  id: string; client_id: string | null;
  title: string; period: string | null; url: string | null;
  created_at: string;
}

// Periodo sugerido: mes anterior no formato YYYY-MM
const lastMonth = () => {
  const d = new Date();
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

const periodLabel = (p: string | null) => {
  if (!p) return "-";
  const m = /^(\d{4})-(\d{2})$/.exec(p);
  if (!m) return p;
  const nome = new Date(Number(m[1]), Number(m[2]) - 1)
    .toLocaleString("pt-BR", { month: "long", year: "numeric" });
  return nome.charAt(0).toUpperCase() + nome.slice(1);
};

const fmtDate = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleDateString("pt-BR");
};

const emptyForm = () => ({ title: "", period: lastMonth(), url: "" });

export default function Relatorios() {
  const { scopedClientId, authLoading, isAdmin, isStaff, adminClientId, setAdminClientId, adminClients } = useClientScope();
  const [rows, setRows]       = useState<ReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm]       = useState(emptyForm());
  const [saving, setSaving]   = useState(false);

  useEffect(() => {
    if (authLoading) return;
    setLoading(true);
    let q = supabase.from("reports").select("*").order("created_at", { ascending: false });
    if (!isAdmin && scopedClientId) q = q.eq("client_id", scopedClientId);
    else if (isAdmin && adminClientId) q = q.eq("client_id", adminClientId);
    q.then(({ data }) => { setRows((data as ReportRow[]) ?? []); setLoading(false); });
  }, [scopedClientId, adminClientId, isAdmin, authLoading]);

  const clientName = (id: string | null) =>
    id ? (adminClients.find(c => c.id === id)?.name ?? "Cliente") : "Interno";

  const comLink = rows.filter(r => r.url).length;
  const periodos = new Set(rows.map(r => r.period).filter(Boolean)).size;
  const ultimo = rows[0];

  async function handleSave() {
    setSaving(true);
    const target = isAdmin ? (adminClientId || null) : scopedClientId;
    const { data, error } = await supabase.from("reports").insert({
      client_id: target,
      title: form.title,
      period: form.period || null,
      url: form.url || null,
    }).select().single();
    setSaving(false);
    if (!error && data) {
      setRows(prev => [data as ReportRow, ...prev]);
      setShowForm(false);
      setForm(emptyForm());
    }
  }

  const f = (k: keyof ReturnType<typeof emptyForm>) =>
    (e: { target: { value: string } }) => setForm(prev => ({ ...prev, [k]: e.target.value }));

  // Agrupa por periodo para leitura cronologica
  const byPeriod: Record<string, ReportRow[]> = {};
  rows.forEach(r => {
    const k = r.period ?? "sem-periodo";
    (byPeriod[k] ??= []).push(r);
  });
  const periodKeys = Object.keys(byPeriod).sort((a, b) => b.localeCompare(a));

  return (
    <>
      <PageMeta title="Relatorios | inProR" />
      <PageWrap
        title="Relatorios"
        subtitle="Relatorios de performance entregues"
        action={
          <div className="flex items-center gap-2">
            {isStaff && (
              <select className="text-xs border hairline rounded px-2 py-1.5 bg-white dark:bg-[#11141b]"
                value={adminClientId ?? ""} onChange={e => setAdminClientId(e.target.value || null)}>
                <option value="">Todos os clientes</option>
                {adminClients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            )}
            <Btn size="sm" onClick={() => setShowForm(v => !v)}>+ Novo relatorio</Btn>
          </div>
        }
      >
        <KpiGrid>
          <KpiCard label="Total"          value={rows.length} />
          <KpiCard label="Periodos"       value={periodos} />
          <KpiCard label="Com link"       value={comLink} />
          <KpiCard label="Ultimo"         value={ultimo ? periodLabel(ultimo.period) : "-"}
            sub={ultimo ? fmtDate(ultimo.created_at) : undefined} />
        </KpiGrid>

        {showForm && (
          <SectionCard title="Novo Relatorio" className="mb-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <label className="flex flex-col gap-1">
                <span className="text-[11px] opacity-55 uppercase tracking-wide">Titulo</span>
                <input className="text-sm border hairline rounded px-2 py-1.5 bg-white dark:bg-[#11141b]"
                  value={form.title} onChange={f("title")} placeholder="Relatorio mensal" />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[11px] opacity-55 uppercase tracking-wide">Periodo</span>
                <input type="month" className="text-sm border hairline rounded px-2 py-1.5 bg-white dark:bg-[#11141b]"
                  value={form.period} onChange={f("period")} />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[11px] opacity-55 uppercase tracking-wide">Link</span>
                <input type="url" className="text-sm border hairline rounded px-2 py-1.5 bg-white dark:bg-[#11141b]"
                  value={form.url} onChange={f("url")} placeholder="https://" />
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
        ) : rows.length === 0 ? (
          <SectionCard>
            <EmptyState
              title="Nenhum relatorio"
              sub="Cadastre o primeiro relatorio clicando em Novo relatorio."
            />
          </SectionCard>
        ) : (
          <>
            {/* Agrupado por periodo */}
            <div className="flex flex-col gap-4 mb-4">
              {periodKeys.map(pk => (
                <SectionCard key={pk} title={pk === "sem-periodo" ? "Sem periodo definido" : periodLabel(pk)}>
                  <div className="flex flex-col">
                    {byPeriod[pk].map(r => (
                      <div key={r.id} className="flex items-center justify-between gap-3 py-2.5 border-b hairline last:border-0">
                        <div className="min-w-0">
                          <div className="text-[14px] font-medium leading-snug">{r.title}</div>
                          <div className="text-[11px] opacity-55 mt-0.5 flex items-center gap-2 flex-wrap">
                            <span className="font-mono">{fmtDate(r.created_at)}</span>
                            {isAdmin && <span>{clientName(r.client_id)}</span>}
                          </div>
                        </div>
                        {r.url && (
                          <a href={r.url} target="_blank" rel="noopener noreferrer"
                            className="text-[12px] font-semibold shrink-0 underline underline-offset-2"
                            style={{ color: "var(--copper)" }}>
                            Abrir
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                </SectionCard>
              ))}
            </div>

            <SectionCard title="Todos os Relatorios">
              <Table
                headers={isAdmin
                  ? ["Periodo", "Titulo", "Cliente", "Criado em", "Link"]
                  : ["Periodo", "Titulo", "Criado em", "Link"]}
                rows={rows.map(r => {
                  const head = [periodLabel(r.period), r.title];
                  const tail = [
                    fmtDate(r.created_at),
                    r.url
                      ? <a href={r.url} target="_blank" rel="noopener noreferrer"
                          className="underline underline-offset-2" style={{ color: "var(--copper)" }}>Abrir</a>
                      : "-",
                  ];
                  return isAdmin ? [...head, clientName(r.client_id), ...tail] : [...head, ...tail];
                })}
              />
            </SectionCard>
          </>
        )}
      </PageWrap>
    </>
  );
}
