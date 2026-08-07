import { useState, useEffect } from "react";
import PageMeta from "../../components/common/PageMeta";
import {
  PageWrap, KpiCard, KpiGrid, SectionCard, Table, Btn, StatusDot,
} from "../../components/ui/InprorComponents";
import { useClientScope } from "../../context/AuthContext";
import { supabase } from "../../lib/supabase";

type Source = "google" | "ifood" | "rappi" | "ubereats" | "tripadvisor" | "outros";
type SFilter = Source | "todos";

interface RepRow {
  id: string; client_id: string; source: Source;
  date: string;
  rating: number | null;
  total_reviews: number; new_reviews: number;
  positive: number; negative: number;
  response_rate: number | null;
}

const SOURCES: { key: SFilter; label: string; color: string }[] = [
  { key: "todos",       label: "Todos",       color: "var(--brand)" },
  { key: "google",      label: "Google",      color: "#4285F4" },
  { key: "ifood",       label: "iFood",       color: "#EA1D2C" },
  { key: "rappi",       label: "Rappi",       color: "#FF441F" },
  { key: "ubereats",    label: "Uber Eats",   color: "#06C167" },
  { key: "tripadvisor", label: "TripAdvisor", color: "#00AA6C" },
  { key: "outros",      label: "Outros",      color: "var(--copper)" },
];
const sInfo = (k: string) => SOURCES.find(s => s.key === k) ?? SOURCES[0];

const fmt = {
  num: (v: number) => v.toLocaleString("pt-BR"),
  pct: (v: number | null) => v != null ? `${v.toFixed(1)}%` : "-",
  rat: (v: number | null) => v != null ? `${v.toFixed(2)} ★` : "-",
  delta: (v: number) => `${v > 0 ? "+" : ""}${v.toFixed(2)}`,
};

// Media ponderada de nota por total de avaliacoes
function weightedRating(rows: { rating: number | null; total_reviews: number }[]): number | null {
  const rated = rows.filter(r => r.rating != null && r.total_reviews > 0);
  if (!rated.length) {
    const anyRated = rows.filter(r => r.rating != null);
    if (!anyRated.length) return null;
    return anyRated.reduce((s, r) => s + (r.rating ?? 0), 0) / anyRated.length;
  }
  const totW = rated.reduce((s, r) => s + r.total_reviews, 0);
  return rated.reduce((s, r) => s + (r.rating ?? 0) * r.total_reviews, 0) / totW;
}

interface MonthAgg { month: string; label: string; rating: number; }

function RatingTrend({ data }: { data: MonthAgg[] }) {
  if (data.length < 2)
    return <p className="text-[13px] opacity-40 text-center py-8">Sem historico suficiente para o grafico</p>;
  const W = 440, H = 120, PL = 8, PR = 8, PT = 12, PB = 24;
  const iW = W - PL - PR, iH = H - PT - PB;
  // Escala dinamica: destaca variacoes pequenas dentro do range 1-5
  const vals = data.map(d => d.rating);
  const lo = Math.max(1, Math.floor((Math.min(...vals) - 0.3) * 10) / 10);
  const hi = Math.min(5, Math.ceil((Math.max(...vals) + 0.3) * 10) / 10);
  const span = Math.max(hi - lo, 0.5);
  const n = data.length;
  const x = (i: number) => PL + (i / Math.max(n - 1, 1)) * iW;
  const y = (v: number) => PT + iH - ((v - lo) / span) * iH;
  const path = data.map((d, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)} ${y(d.rating).toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: H }}>
      {[lo, (lo + hi) / 2, hi].map((gv, i) => (
        <g key={i}>
          <line x1={PL} y1={y(gv)} x2={W - PR} y2={y(gv)} stroke="currentColor" strokeWidth="0.5" opacity={0.08} />
          <text x={W - PR} y={y(gv) - 2} textAnchor="end" fontSize="8" fill="currentColor" opacity={0.3}>
            {gv.toFixed(1)}
          </text>
        </g>
      ))}
      <path d={path} fill="none" stroke="var(--brand)" strokeWidth="2" strokeLinejoin="round" />
      {data.map((d, i) => (
        <g key={i}>
          <circle cx={x(i)} cy={y(d.rating)} r="3" fill="var(--brand)" />
          <text x={x(i)} y={H - 5} textAnchor="middle" fontSize="9" fill="currentColor" opacity={0.4}>
            {d.label}
          </text>
        </g>
      ))}
    </svg>
  );
}

// Barra de sentimento positivo x negativo
function SentimentBar({ positive, negative }: { positive: number; negative: number }) {
  const tot = positive + negative;
  const pPos = tot ? (positive / tot) * 100 : 0;
  const pNeg = tot ? (negative / tot) * 100 : 0;
  return (
    <div className="flex h-1.5 rounded-full overflow-hidden bg-black/[0.06] dark:bg-white/[0.06] w-full">
      <span style={{ width: `${pPos}%`, background: "var(--ok)" }} />
      <span style={{ width: `${pNeg}%`, background: "var(--bad)" }} />
    </div>
  );
}

const emptyForm = () => ({
  source: "google" as Source,
  date: new Date().toISOString().slice(0, 10),
  rating: "", total_reviews: "", new_reviews: "",
  positive: "", negative: "", response_rate: "",
});

export default function Reputacao() {
  const { scopedClientId, authLoading, isStaff, adminClientId, setAdminClientId, adminClients } = useClientScope();
  const [rows, setRows]         = useState<RepRow[]>([]);
  const [loading, setLoading]   = useState(true);
  const [src, setSrc]           = useState<SFilter>("todos");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm]         = useState(emptyForm());
  const [saving, setSaving]     = useState(false);

  useEffect(() => {
    if (authLoading) return;
    const cid = scopedClientId;
    if (!cid) { setRows([]); setLoading(false); return; }
    setLoading(true);
    supabase.from("reputation_metrics")
      .select("*").eq("client_id", cid).order("date", { ascending: false })
      .then(({ data }) => { setRows((data as RepRow[]) ?? []); setLoading(false); });
  }, [scopedClientId, authLoading]);

  const filtered = src === "todos" ? rows : rows.filter(r => r.source === src);

  // Ultimo snapshot por fonte (rating/total sao cumulativos)
  const latestBySource: Record<string, RepRow> = {};
  const prevBySource: Record<string, RepRow> = {};
  // rows ja vem ordenado por data desc
  rows.forEach(r => {
    if (!latestBySource[r.source]) latestBySource[r.source] = r;
    else if (!prevBySource[r.source]) prevBySource[r.source] = r;
  });
  const latestList = Object.values(latestBySource);
  const scopedLatest = src === "todos" ? latestList : latestList.filter(r => r.source === src);

  const overallRating = weightedRating(scopedLatest);
  const totalReviews  = scopedLatest.reduce((s, r) => s + r.total_reviews, 0);
  const newReviews    = filtered.reduce((s, r) => s + r.new_reviews, 0);
  const respRows      = scopedLatest.filter(r => r.response_rate != null && r.total_reviews > 0);
  const responseRate  = respRows.length
    ? respRows.reduce((s, r) => s + (r.response_rate ?? 0) * r.total_reviews, 0) /
      respRows.reduce((s, r) => s + r.total_reviews, 0)
    : null;

  // Serie mensal de nota ponderada
  const monthGroups: Record<string, RepRow[]> = {};
  filtered.forEach(r => {
    const m = r.date.slice(0, 7);
    (monthGroups[m] ??= []).push(r);
  });
  const chartData: MonthAgg[] = Object.entries(monthGroups)
    .map(([m, rs]) => {
      const wr = weightedRating(rs);
      const [y, mm] = m.split("-");
      return {
        month: m,
        label: new Date(Number(y), Number(mm) - 1).toLocaleString("pt-BR", { month: "short" }),
        rating: wr ?? 0,
      };
    })
    .filter(d => d.rating > 0)
    .sort((a, b) => a.month.localeCompare(b.month))
    .slice(-6);

  // Alertas de queda de nota (compara ultimo vs anterior por fonte)
  const alerts = Object.keys(latestBySource)
    .map(s => {
      const cur = latestBySource[s], prev = prevBySource[s];
      if (!cur || !prev || cur.rating == null || prev.rating == null) return null;
      const d = cur.rating - prev.rating;
      return d <= -0.1 ? { source: s as Source, delta: d, from: prev.rating, to: cur.rating } : null;
    })
    .filter(Boolean) as { source: Source; delta: number; from: number; to: number }[];

  async function handleSave() {
    if (!scopedClientId) return;
    setSaving(true);
    const { data, error } = await supabase.from("reputation_metrics").insert({
      client_id: scopedClientId, source: form.source, date: form.date,
      rating: form.rating ? Number(form.rating) : null,
      total_reviews: Number(form.total_reviews) || 0,
      new_reviews: Number(form.new_reviews) || 0,
      positive: Number(form.positive) || 0,
      negative: Number(form.negative) || 0,
      response_rate: form.response_rate ? Number(form.response_rate) : null,
    }).select().single();
    setSaving(false);
    if (!error && data) {
      setRows(prev => [data as RepRow, ...prev].sort((a, b) => b.date.localeCompare(a.date)));
      setShowForm(false);
      setForm(emptyForm());
    }
  }

  const tableRows = filtered.slice(0, 100).map(r => [
    <span className="font-mono text-[10px] px-2 py-0.5 rounded-full text-white"
      style={{ background: sInfo(r.source).color }}>
      {sInfo(r.source).label}
    </span>,
    r.date,
    fmt.rat(r.rating),
    fmt.num(r.total_reviews),
    r.new_reviews ? `+${fmt.num(r.new_reviews)}` : "-",
    fmt.num(r.positive),
    fmt.num(r.negative),
    fmt.pct(r.response_rate),
  ]);

  const f = (k: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm(prev => ({ ...prev, [k]: e.target.value }));

  return (
    <>
      <PageMeta title="Reputacao | inProR" />
      <PageWrap
        title="Reputacao Online"
        subtitle="Notas e avaliacoes por plataforma"
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
        {/* Source chips */}
        <div className="filter-row mb-5">
          {SOURCES.map(s => (
            <button key={s.key} className="chip"
              style={src === s.key ? { background: s.color, color: "white", borderColor: s.color } : {}}
              onClick={() => setSrc(s.key)}
            >
              {s.label}
            </button>
          ))}
        </div>

        {/* KPIs */}
        <KpiGrid>
          <KpiCard label="Nota Geral"     value={fmt.rat(overallRating)} sub="media ponderada" />
          <KpiCard label="Avaliacoes"     value={fmt.num(totalReviews)} sub="total acumulado" />
          <KpiCard label="Novas"          value={fmt.num(newReviews)} sub="no periodo" />
          <KpiCard label="Taxa Resposta"  value={fmt.pct(responseRate)} />
        </KpiGrid>

        {/* Alertas de queda */}
        {alerts.length > 0 && (
          <div className="mb-4 border hairline rounded-xl p-4 bg-white dark:bg-[#11141b]"
            style={{ borderColor: "var(--bad)" }}>
            <div className="flex items-center gap-2 mb-2.5">
              <StatusDot status="bad" />
              <span className="font-semibold text-sm" style={{ color: "var(--bad)" }}>Queda de nota detectada</span>
            </div>
            <div className="flex flex-col gap-1.5">
              {alerts.map(a => (
                <div key={a.source} className="flex items-center gap-2 font-mono text-xs">
                  <span className="w-2 h-2 rounded-full inline-block shrink-0" style={{ background: sInfo(a.source).color }} />
                  <span className="font-semibold">{sInfo(a.source).label}</span>
                  <span className="opacity-60">
                    {a.from.toFixed(2)} → {a.to.toFixed(2)} ★
                  </span>
                  <span className="font-semibold" style={{ color: "var(--bad)" }}>{fmt.delta(a.delta)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
          {/* Rating trend */}
          <SectionCard title="Evolucao da Nota · 6 meses" className="lg:col-span-2">
            <RatingTrend data={chartData} />
          </SectionCard>

          {/* Breakdown por fonte */}
          <SectionCard title="Por Plataforma">
            {SOURCES.filter(s => s.key !== "todos").map(s => {
              const cur = latestBySource[s.key];
              if (!cur) return null;
              const prev = prevBySource[s.key];
              const d = prev && cur.rating != null && prev.rating != null ? cur.rating - prev.rating : null;
              return (
                <div key={s.key} className="py-2.5 border-b hairline last:border-0">
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full inline-block shrink-0" style={{ background: s.color }} />
                      <span className="font-mono text-xs">{s.label}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-semibold">{fmt.rat(cur.rating)}</span>
                      {d != null && Math.abs(d) >= 0.01 && (
                        <span className="font-mono text-[10px] font-semibold"
                          style={{ color: d >= 0 ? "var(--ok)" : "var(--bad)" }}>
                          {fmt.delta(d)}
                        </span>
                      )}
                    </div>
                  </div>
                  <SentimentBar positive={cur.positive} negative={cur.negative} />
                  <div className="font-mono text-[10px] opacity-40 mt-1">
                    {fmt.num(cur.total_reviews)} avaliacoes · {fmt.pct(cur.response_rate)} resposta
                  </div>
                </div>
              );
            })}
            {latestList.length === 0 && <p className="text-[13px] opacity-40 text-center py-4">Sem dados</p>}
          </SectionCard>
        </div>

        {/* Add form */}
        {showForm && (
          <SectionCard title="Adicionar Snapshot de Reputacao" className="mb-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { k: "source" as const, label: "Plataforma", type: "select",
                  options: SOURCES.filter(s => s.key !== "todos").map(s => ({ v: s.key, l: s.label })) },
                { k: "date" as const,          label: "Data",            type: "date" },
                { k: "rating" as const,        label: "Nota (0-5)",      type: "number", ph: "4.80", step: "0.01" },
                { k: "total_reviews" as const, label: "Total Avaliacoes",type: "number", ph: "0" },
                { k: "new_reviews" as const,   label: "Novas no periodo",type: "number", ph: "0" },
                { k: "positive" as const,      label: "Positivas (4-5★)",type: "number", ph: "0" },
                { k: "negative" as const,      label: "Negativas (1-2★)",type: "number", ph: "0" },
                { k: "response_rate" as const, label: "Taxa Resposta (%)",type: "number", ph: "85" },
              ].map(field => (
                <label key={field.k} className="flex flex-col gap-1">
                  <span className="font-mono text-[10px] opacity-50 uppercase tracking-wider">{field.label}</span>
                  {field.type === "select" ? (
                    <select className="text-sm border hairline rounded px-2 py-1.5 bg-white dark:bg-[#11141b]"
                      value={form[field.k]} onChange={f(field.k)}>
                      {field.options?.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
                    </select>
                  ) : (
                    <input type={field.type} step={field.step}
                      className="text-sm border hairline rounded px-2 py-1.5 bg-white dark:bg-[#11141b]"
                      value={form[field.k]} onChange={f(field.k)} placeholder={field.ph} />
                  )}
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
            ? <p className="text-[13px] opacity-40 text-center py-8">Carregando...</p>
            : <Table
                headers={["Plataforma", "Data", "Nota", "Total", "Novas", "Positivas", "Negativas", "Resposta"]}
                rows={tableRows}
              />
          }
        </SectionCard>
      </PageWrap>
    </>
  );
}
