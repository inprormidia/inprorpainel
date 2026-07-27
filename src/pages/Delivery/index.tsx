import { useState, useEffect } from "react";
import PageMeta from "../../components/common/PageMeta";
import {
  PageWrap, KpiCard, KpiGrid, SectionCard, Table, Btn,
} from "../../components/ui/InprorComponents";
import { useClientScope } from "../../context/AuthContext";
import { supabase } from "../../lib/supabase";

type Platform = "ifood" | "rappi" | "ubereats" | "aiqfome" | "outros";
type PFilter   = Platform | "todos";

interface DeliveryRow {
  id: string; client_id: string; platform: Platform;
  date: string; month: string;
  orders: number; avg_ticket: number; gmv: number;
  cancellation_rate: number | null; avg_delivery_time: number | null;
  rating: number | null; impressions: number | null;
}

const PLATS: { key: PFilter; label: string; color: string }[] = [
  { key: "todos",    label: "Todos",    color: "var(--brand)" },
  { key: "ifood",    label: "iFood",    color: "#EA1D2C" },
  { key: "rappi",    label: "Rappi",    color: "#FF441F" },
  { key: "ubereats", label: "Uber Eats",color: "#06C167" },
  { key: "aiqfome",  label: "AiqFome",  color: "#F59E0B" },
  { key: "outros",   label: "Outros",   color: "var(--copper)" },
];
const pInfo = (k: string) => PLATS.find(p => p.key === k) ?? PLATS[0];

const fmt = {
  brl: (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }),
  num: (v: number) => v.toLocaleString("pt-BR"),
  pct: (v: number | null) => v != null ? `${v.toFixed(1)}%` : "-",
  rat: (v: number | null) => v != null ? `${v.toFixed(1)} ★` : "-",
  min: (v: number | null) => v != null ? `${v} min` : "-",
};

interface MonthAgg { month: string; label: string; orders: number; gmv: number; }

function TrendChart({ data }: { data: MonthAgg[] }) {
  if (!data.length)
    return <p className="font-mono text-xs opacity-40 text-center py-8">Sem dados para o periodo</p>;
  const W = 440, H = 110, PL = 8, PR = 8, PT = 10, PB = 24;
  const iW = W - PL - PR, iH = H - PT - PB;
  const maxO = Math.max(...data.map(d => d.orders), 1);
  const maxG = Math.max(...data.map(d => d.gmv), 1);
  const n = data.length;
  const x  = (i: number) => PL + (i / Math.max(n - 1, 1)) * iW;
  const yO = (v: number) => PT + iH - (v / maxO) * iH;
  const yG = (v: number) => PT + iH - (v / maxG) * iH;
  const pO = data.map((d, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)} ${yO(d.orders).toFixed(1)}`).join(" ");
  const pG = data.map((d, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)} ${yG(d.gmv).toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: H }}>
      <path d={pO} fill="none" stroke="var(--brand)"  strokeWidth="2" strokeLinejoin="round" />
      <path d={pG} fill="none" stroke="var(--copper)" strokeWidth="2" strokeLinejoin="round" strokeDasharray="5 3" />
      {data.map((d, i) => (
        <g key={i}>
          <circle cx={x(i)} cy={yO(d.orders)} r="3" fill="var(--brand)" />
          <circle cx={x(i)} cy={yG(d.gmv)}    r="3" fill="var(--copper)" />
          <text x={x(i)} y={H - 5} textAnchor="middle" fontSize="9" fill="currentColor" opacity={0.4}>
            {d.label}
          </text>
        </g>
      ))}
    </svg>
  );
}

const emptyForm = () => ({
  platform: "ifood" as Platform,
  date: new Date().toISOString().slice(0, 10),
  orders: "", avg_ticket: "", gmv: "",
  cancellation_rate: "", avg_delivery_time: "", rating: "", impressions: "",
});

export default function Delivery() {
  const { scopedClientId, authLoading, isAdmin, adminClientId, setAdminClientId, adminClients } = useClientScope();
  const [rows, setRows]       = useState<DeliveryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [plat, setPlat]       = useState<PFilter>("todos");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm]       = useState(emptyForm());
  const [saving, setSaving]   = useState(false);

  useEffect(() => {
    if (authLoading) return;
    const cid = scopedClientId;
    if (!cid) { setRows([]); setLoading(false); return; }
    setLoading(true);
    supabase.from("delivery_metrics")
      .select("*").eq("client_id", cid).order("date", { ascending: false })
      .then(({ data }) => { setRows((data as DeliveryRow[]) ?? []); setLoading(false); });
  }, [scopedClientId, authLoading]);

  const filtered = plat === "todos" ? rows : rows.filter(r => r.platform === plat);

  const totalOrders = filtered.reduce((s, r) => s + r.orders, 0);
  const totalGmv    = filtered.reduce((s, r) => s + r.gmv, 0);
  const avgTicket   = filtered.length ? filtered.reduce((s, r) => s + r.avg_ticket, 0) / filtered.length : 0;
  const ratedRows   = filtered.filter(r => r.rating != null);
  const avgRating   = ratedRows.length ? ratedRows.reduce((s, r) => s + (r.rating ?? 0), 0) / ratedRows.length : null;

  const monthMap: Record<string, MonthAgg> = {};
  filtered.forEach(r => {
    if (!monthMap[r.month]) {
      const [y, m] = r.month.split("-");
      monthMap[r.month] = {
        month: r.month,
        label: new Date(Number(y), Number(m) - 1).toLocaleString("pt-BR", { month: "short" }),
        orders: 0, gmv: 0,
      };
    }
    monthMap[r.month].orders += r.orders;
    monthMap[r.month].gmv    += r.gmv;
  });
  const chartData = Object.values(monthMap).sort((a, b) => a.month.localeCompare(b.month)).slice(-6);

  async function handleSave() {
    if (!scopedClientId) return;
    setSaving(true);
    const { data, error } = await supabase.from("delivery_metrics").insert({
      client_id: scopedClientId, platform: form.platform, date: form.date,
      orders: Number(form.orders) || 0,
      avg_ticket: Number(form.avg_ticket) || 0,
      gmv: Number(form.gmv) || 0,
      cancellation_rate: form.cancellation_rate ? Number(form.cancellation_rate) : null,
      avg_delivery_time: form.avg_delivery_time ? Number(form.avg_delivery_time) : null,
      rating: form.rating ? Number(form.rating) : null,
      impressions: form.impressions ? Number(form.impressions) : null,
    }).select().single();
    setSaving(false);
    if (!error && data) {
      setRows(prev => [data as DeliveryRow, ...prev]);
      setShowForm(false);
      setForm(emptyForm());
    }
  }

  const tableRows = filtered.slice(0, 100).map(r => [
    <span className="font-mono text-[10px] px-2 py-0.5 rounded-full text-white"
      style={{ background: pInfo(r.platform).color }}>
      {pInfo(r.platform).label}
    </span>,
    r.date,
    fmt.num(r.orders),
    fmt.brl(r.gmv),
    fmt.brl(r.avg_ticket),
    fmt.rat(r.rating),
    fmt.pct(r.cancellation_rate),
    fmt.min(r.avg_delivery_time),
  ]);

  const f = (k: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm(prev => ({ ...prev, [k]: e.target.value }));

  return (
    <>
      <PageMeta title="Delivery | inProR" />
      <PageWrap
        title="Delivery"
        subtitle="Performance por plataforma de entrega"
        action={
          <div className="flex items-center gap-2">
            {isAdmin && (
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
        <div className="filter-row mb-5">
          {PLATS.map(p => (
            <button key={p.key} className="chip"
              style={plat === p.key
                ? { background: p.color, color: "white", borderColor: p.color }
                : {}}
              onClick={() => setPlat(p.key)}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* KPIs */}
        <KpiGrid>
          <KpiCard label="Pedidos"       value={fmt.num(totalOrders)} />
          <KpiCard label="GMV Total"     value={fmt.brl(totalGmv)} />
          <KpiCard label="Ticket Medio"  value={fmt.brl(avgTicket)} />
          <KpiCard label="Avaliacao"     value={fmt.rat(avgRating)} />
        </KpiGrid>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
          {/* Trend chart */}
          <SectionCard title="Tendencia 6 Meses" className="lg:col-span-2">
            <TrendChart data={chartData} />
            {chartData.length > 0 && (
              <div className="flex gap-5 mt-2">
                <span className="font-mono text-[10px] flex items-center gap-1.5">
                  <span className="inline-block w-5 h-px border-t-2" style={{ borderColor: "var(--brand)" }} />
                  Pedidos
                </span>
                <span className="font-mono text-[10px] flex items-center gap-1.5">
                  <span className="inline-block w-5 h-px border-t-2 border-dashed" style={{ borderColor: "var(--copper)" }} />
                  GMV
                </span>
              </div>
            )}
          </SectionCard>

          {/* Per-platform summary */}
          <SectionCard title="Por Plataforma">
            {PLATS.filter(p => p.key !== "todos").map(p => {
              const pr = rows.filter(r => r.platform === p.key);
              if (!pr.length) return null;
              const pGmv = pr.reduce((s, r) => s + r.gmv, 0);
              const pOrd = pr.reduce((s, r) => s + r.orders, 0);
              return (
                <div key={p.key} className="flex items-center justify-between py-2 border-b hairline last:border-0">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full inline-block shrink-0" style={{ background: p.color }} />
                    <span className="font-mono text-xs">{p.label}</span>
                  </div>
                  <div className="text-right">
                    <div className="font-mono text-xs font-semibold">{fmt.brl(pGmv)}</div>
                    <div className="font-mono text-[10px] opacity-40">{fmt.num(pOrd)} pedidos</div>
                  </div>
                </div>
              );
            })}
            {rows.length === 0 && <p className="font-mono text-xs opacity-40 text-center py-4">Sem dados</p>}
          </SectionCard>
        </div>

        {/* Add form */}
        {showForm && (
          <SectionCard title="Adicionar Dados de Entrega" className="mb-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { k: "platform" as const, label: "Plataforma", type: "select",
                  options: PLATS.filter(p => p.key !== "todos").map(p => ({ v: p.key, l: p.label })) },
                { k: "date" as const,              label: "Data",              type: "date" },
                { k: "orders" as const,            label: "Pedidos",           type: "number", ph: "0" },
                { k: "gmv" as const,               label: "GMV (R$)",          type: "number", ph: "0.00" },
                { k: "avg_ticket" as const,        label: "Ticket Medio (R$)", type: "number", ph: "0.00" },
                { k: "rating" as const,            label: "Avaliacao (0-5)",   type: "number", ph: "4.8", step: "0.1" },
                { k: "cancellation_rate" as const, label: "Cancelamentos (%)", type: "number", ph: "2.5" },
                { k: "avg_delivery_time" as const, label: "Tempo Medio (min)", type: "number", ph: "35" },
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
            ? <p className="font-mono text-xs opacity-40 text-center py-8">Carregando...</p>
            : <Table
                headers={["Plataforma", "Data", "Pedidos", "GMV", "Ticket", "Avaliacao", "Cancelamentos", "Tempo"]}
                rows={tableRows}
              />
          }
        </SectionCard>
      </PageWrap>
    </>
  );
}
