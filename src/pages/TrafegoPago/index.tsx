import { useState, useEffect } from "react";
import PageMeta from "../../components/common/PageMeta";
import {
  PageWrap, KpiCard, KpiGrid, SectionCard, Table, Btn,
} from "../../components/ui/InprorComponents";
import { useClientScope } from "../../context/AuthContext";
import { supabase } from "../../lib/supabase";

type AdsPlatform = "meta" | "google_ads" | "tiktok" | "outros";
type PFilter      = AdsPlatform | "todos";

interface AdsRow {
  id: string; client_id: string; platform: AdsPlatform;
  date: string; month: string;
  impressions: number; clicks: number; conversions: number;
  spend: number; cpl: number; ctr: number;
}

const PLATS: { key: PFilter; label: string; color: string }[] = [
  { key: "todos",      label: "Todos",      color: "var(--brand)" },
  { key: "meta",       label: "Meta",       color: "#1877F2" },
  { key: "google_ads", label: "Google Ads", color: "#34A853" },
  { key: "tiktok",     label: "TikTok",     color: "#010101" },
  { key: "outros",     label: "Outros",     color: "var(--copper)" },
];
const pInfo = (k: string) => PLATS.find(p => p.key === k) ?? PLATS[0];

const fmt = {
  brl: (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }),
  num: (v: number) => v.toLocaleString("pt-BR"),
  pct: (v: number) => `${(v * 100).toFixed(2)}%`,
};

interface MonthAgg { month: string; label: string; spend: number; conversions: number; }

function AdsChart({ data }: { data: MonthAgg[] }) {
  if (!data.length)
    return <p className="font-mono text-xs opacity-40 text-center py-8">Sem dados para o periodo</p>;
  const W = 440, H = 110, PL = 8, PR = 8, PT = 10, PB = 24;
  const iW = W - PL - PR, iH = H - PT - PB;
  const maxS = Math.max(...data.map(d => d.spend), 1);
  const maxC = Math.max(...data.map(d => d.conversions), 1);
  const n = data.length;
  const x  = (i: number) => PL + (i / Math.max(n - 1, 1)) * iW;
  const yS = (v: number) => PT + iH - (v / maxS) * iH;
  const yC = (v: number) => PT + iH - (v / maxC) * iH;
  const pS = data.map((d, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)} ${yS(d.spend).toFixed(1)}`).join(" ");
  const pC = data.map((d, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)} ${yC(d.conversions).toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: H }}>
      <path d={pS} fill="none" stroke="var(--brand)"  strokeWidth="2" strokeLinejoin="round" />
      <path d={pC} fill="none" stroke="var(--copper)" strokeWidth="2" strokeLinejoin="round" strokeDasharray="5 3" />
      {data.map((d, i) => (
        <g key={i}>
          <circle cx={x(i)} cy={yS(d.spend)}       r="3" fill="var(--brand)" />
          <circle cx={x(i)} cy={yC(d.conversions)} r="3" fill="var(--copper)" />
          <text x={x(i)} y={H - 5} textAnchor="middle" fontSize="9" fill="currentColor" opacity={0.4}>
            {d.label}
          </text>
        </g>
      ))}
    </svg>
  );
}

const emptyForm = () => ({
  platform: "meta" as AdsPlatform,
  date: new Date().toISOString().slice(0, 10),
  impressions: "", clicks: "", conversions: "", spend: "", cpl: "", ctr: "",
});

export default function TrafegoPago() {
  const { scopedClientId, authLoading, isStaff, adminClientId, setAdminClientId, adminClients } = useClientScope();
  const [rows, setRows]         = useState<AdsRow[]>([]);
  const [loading, setLoading]   = useState(true);
  const [plat, setPlat]         = useState<PFilter>("todos");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm]         = useState(emptyForm());
  const [saving, setSaving]     = useState(false);

  useEffect(() => {
    if (authLoading) return;
    const cid = scopedClientId;
    if (!cid) { setRows([]); setLoading(false); return; }
    setLoading(true);
    supabase.from("ads_metrics")
      .select("*").eq("client_id", cid).order("date", { ascending: false })
      .then(({ data }) => { setRows((data as AdsRow[]) ?? []); setLoading(false); });
  }, [scopedClientId, authLoading]);

  const filtered = plat === "todos" ? rows : rows.filter(r => r.platform === plat);

  const totalImp  = filtered.reduce((s, r) => s + r.impressions, 0);
  const totalClk  = filtered.reduce((s, r) => s + r.clicks, 0);
  const totalConv = filtered.reduce((s, r) => s + r.conversions, 0);
  const totalSpend= filtered.reduce((s, r) => s + r.spend, 0);
  const avgCpl    = filtered.length ? filtered.reduce((s, r) => s + r.cpl, 0) / filtered.length : 0;
  const avgCtr    = totalImp ? totalClk / totalImp : 0;

  const monthMap: Record<string, MonthAgg> = {};
  filtered.forEach(r => {
    if (!monthMap[r.month]) {
      const [y, m] = r.month.split("-");
      monthMap[r.month] = {
        month: r.month,
        label: new Date(Number(y), Number(m) - 1).toLocaleString("pt-BR", { month: "short" }),
        spend: 0, conversions: 0,
      };
    }
    monthMap[r.month].spend       += r.spend;
    monthMap[r.month].conversions += r.conversions;
  });
  const chartData = Object.values(monthMap).sort((a, b) => a.month.localeCompare(b.month)).slice(-6);

  const totalAllSpend = rows.reduce((s, r) => s + r.spend, 0);

  async function handleSave() {
    if (!scopedClientId) return;
    setSaving(true);
    const { data, error } = await supabase.from("ads_metrics").insert({
      client_id: scopedClientId, platform: form.platform, date: form.date,
      impressions: Number(form.impressions) || 0,
      clicks: Number(form.clicks) || 0,
      conversions: Number(form.conversions) || 0,
      spend: Number(form.spend) || 0,
      cpl: Number(form.cpl) || 0,
      ctr: Number(form.ctr) || 0,
    }).select().single();
    setSaving(false);
    if (!error && data) {
      setRows(prev => [data as AdsRow, ...prev]);
      setShowForm(false);
      setForm(emptyForm());
    }
  }

  const f = (k: keyof typeof form) =>
    (e: { target: { value: string } }) =>
      setForm(prev => ({ ...prev, [k]: e.target.value }));

  const tableRows = filtered.slice(0, 100).map(r => [
    <span className="font-mono text-[10px] px-2 py-0.5 rounded-full text-white"
      style={{ background: pInfo(r.platform).color }}>
      {pInfo(r.platform).label}
    </span>,
    r.date,
    fmt.num(r.impressions),
    fmt.num(r.clicks),
    fmt.num(r.conversions),
    fmt.brl(r.spend),
    fmt.brl(r.cpl),
    fmt.pct(r.ctr),
  ]);

  return (
    <>
      <PageMeta title="Trafego Pago | inProR" />
      <PageWrap
        title="Trafego Pago"
        subtitle="Performance de anuncios pagos por plataforma"
        action={
          <div className="flex items-center gap-2">
            {isStaff && (
              <select className="text-xs border hairline rounded px-2 py-1.5 bg-white dark:bg-[#11141b]"
                value={adminClientId ?? ""} onChange={e => setAdminClientId(e.target.value || null)}>
                <option value="">Selecionar cliente...</option>
                {adminClients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            )}
            <Btn size="sm" onClick={() => setShowForm(v => !v)}>+ Adicionar dados</Btn>
          </div>
        }
      >
        {/* Platform chips */}
        <div className="flex flex-wrap gap-2 mb-5">
          {PLATS.map(p => (
            <button key={p.key} className="chip"
              style={plat === p.key ? { background: p.color, color: "white", borderColor: p.color } : {}}
              onClick={() => setPlat(p.key)}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Primary KPIs */}
        <KpiGrid>
          <KpiCard label="Impressoes"  value={fmt.num(totalImp)} />
          <KpiCard label="Cliques"     value={fmt.num(totalClk)} />
          <KpiCard label="Conversoes"  value={fmt.num(totalConv)} />
          <KpiCard label="Investimento"value={fmt.brl(totalSpend)} />
        </KpiGrid>

        {/* Secondary KPIs */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
          <KpiCard label="CTR Medio" value={fmt.pct(avgCtr)} />
          <KpiCard label="CPL Medio" value={fmt.brl(avgCpl)} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
          {/* Trend chart */}
          <SectionCard title="Tendencia 6 Meses" className="lg:col-span-2">
            <AdsChart data={chartData} />
            {chartData.length > 0 && (
              <div className="flex gap-5 mt-2">
                <span className="font-mono text-[10px] flex items-center gap-1.5">
                  <span className="inline-block w-5 h-px border-t-2" style={{ borderColor: "var(--brand)" }} />
                  Investimento
                </span>
                <span className="font-mono text-[10px] flex items-center gap-1.5">
                  <span className="inline-block w-5 h-px border-t-2 border-dashed" style={{ borderColor: "var(--copper)" }} />
                  Conversoes
                </span>
              </div>
            )}
          </SectionCard>

          {/* Platform breakdown */}
          <SectionCard title="Distribuicao de Verba">
            {PLATS.filter(p => p.key !== "todos").map(p => {
              const pr = rows.filter(r => r.platform === p.key);
              if (!pr.length) return null;
              const pSpend = pr.reduce((s, r) => s + r.spend, 0);
              const pct = totalAllSpend ? (pSpend / totalAllSpend) * 100 : 0;
              return (
                <div key={p.key} className="mb-3 last:mb-0">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-mono text-xs flex items-center gap-1.5">
                      <span className="inline-block w-2 h-2 rounded-full shrink-0" style={{ background: p.color }} />
                      {p.label}
                    </span>
                    <span className="font-mono text-xs">{pct.toFixed(0)}%</span>
                  </div>
                  <div className="h-1.5 rounded-full" style={{ background: "rgba(0,0,0,.06)" }}>
                    <div className="h-1.5 rounded-full transition-all"
                      style={{ width: `${pct}%`, background: p.color }} />
                  </div>
                  <div className="font-mono text-[10px] opacity-40 mt-0.5">{fmt.brl(pSpend)}</div>
                </div>
              );
            })}
            {rows.length === 0 && <p className="font-mono text-xs opacity-40 text-center py-4">Sem dados</p>}
          </SectionCard>
        </div>

        {/* Add form */}
        {showForm && (
          <SectionCard title="Adicionar Dados de Anuncio" className="mb-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
              <label className="flex flex-col gap-1">
                <span className="font-mono text-[10px] opacity-50 uppercase tracking-wider">Plataforma</span>
                <select className="text-sm border hairline rounded px-2 py-1.5 bg-white dark:bg-[#11141b]"
                  value={form.platform} onChange={f("platform")}>
                  {PLATS.filter(p => p.key !== "todos").map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="font-mono text-[10px] opacity-50 uppercase tracking-wider">Data</span>
                <input type="date" className="text-sm border hairline rounded px-2 py-1.5 bg-white dark:bg-[#11141b]"
                  value={form.date} onChange={f("date")} />
              </label>
              {[
                { k: "impressions" as const, l: "Impressoes",           ph: "10000" },
                { k: "clicks"      as const, l: "Cliques",              ph: "300" },
                { k: "conversions" as const, l: "Conversoes",           ph: "15" },
                { k: "spend"       as const, l: "Investimento (R$)",    ph: "500.00" },
                { k: "cpl"         as const, l: "CPL (R$)",             ph: "33.00" },
                { k: "ctr"         as const, l: "CTR decimal (ex 0.03)",ph: "0.03", step: "0.0001" },
              ].map(field => (
                <label key={field.k} className="flex flex-col gap-1">
                  <span className="font-mono text-[10px] opacity-50 uppercase tracking-wider">{field.l}</span>
                  <input type="number" step={field.step}
                    className="text-sm border hairline rounded px-2 py-1.5 bg-white dark:bg-[#11141b]"
                    value={form[field.k]} onChange={f(field.k)} placeholder={field.ph} />
                </label>
              ))}
            </div>
            <div className="flex gap-2 mt-4">
              <Btn onClick={handleSave} disabled={saving}>{saving ? "Salvando..." : "Salvar"}</Btn>
              <Btn variant="ghost" onClick={() => setShowForm(false)}>Cancelar</Btn>
            </div>
          </SectionCard>
        )}

        {/* History table */}
        <SectionCard title="Historico">
          {loading
            ? <p className="font-mono text-xs opacity-40 text-center py-8">Carregando...</p>
            : <Table
                headers={["Plataforma", "Data", "Impressoes", "Cliques", "Conversoes", "Investimento", "CPL", "CTR"]}
                rows={tableRows}
              />
          }
        </SectionCard>
      </PageWrap>
    </>
  );
}
