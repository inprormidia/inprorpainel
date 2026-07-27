import { useState, useEffect } from "react";
import PageMeta from "../../components/common/PageMeta";
import {
  PageWrap, KpiCard, KpiGrid, SectionCard, Table, Btn,
} from "../../components/ui/InprorComponents";
import { useClientScope } from "../../context/AuthContext";
import { supabase } from "../../lib/supabase";

interface MeetingRow {
  id: string; client_id: string | null;
  title: string; date: string | null; notes: string | null;
  created_at: string;
}

const today = () => new Date().toISOString().slice(0, 10);
const fmtDate = (d: string) => {
  const [y, m, dd] = d.split("-");
  return `${dd}/${m}/${y}`;
};

const emptyForm = () => ({ title: "", date: today(), notes: "" });

export default function Reunioes() {
  const { scopedClientId, authLoading, isAdmin, adminClientId, setAdminClientId, adminClients } = useClientScope();
  const [rows, setRows]       = useState<MeetingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm]       = useState(emptyForm());
  const [saving, setSaving]   = useState(false);
  const [openId, setOpenId]   = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;
    setLoading(true);
    let q = supabase.from("meetings").select("*").order("date", { ascending: false, nullsFirst: false });
    if (!isAdmin && scopedClientId) q = q.eq("client_id", scopedClientId);
    else if (isAdmin && adminClientId) q = q.eq("client_id", adminClientId);
    q.then(({ data }) => { setRows((data as MeetingRow[]) ?? []); setLoading(false); });
  }, [scopedClientId, adminClientId, isAdmin, authLoading]);

  const t = today();
  const futuras  = rows.filter(r => r.date && r.date >= t);
  const passadas = rows.filter(r => !r.date || r.date < t);
  const proxima  = [...futuras].sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""))[0];
  const comNotas = rows.filter(r => r.notes && r.notes.trim()).length;

  const clientName = (id: string | null) =>
    id ? (adminClients.find(c => c.id === id)?.name ?? "Cliente") : "Interno";

  async function handleSave() {
    setSaving(true);
    const target = isAdmin ? (adminClientId || null) : scopedClientId;
    const { data, error } = await supabase.from("meetings").insert({
      client_id: target,
      title: form.title,
      date: form.date || null,
      notes: form.notes || null,
    }).select().single();
    setSaving(false);
    if (!error && data) {
      setRows(prev => [data as MeetingRow, ...prev].sort((a, b) => (b.date ?? "").localeCompare(a.date ?? "")));
      setShowForm(false);
      setForm(emptyForm());
    }
  }

  const f = (k: keyof ReturnType<typeof emptyForm>) =>
    (e: { target: { value: string } }) => setForm(prev => ({ ...prev, [k]: e.target.value }));

  function List({ items, empty }: { items: MeetingRow[]; empty: string }) {
    if (!items.length)
      return <p className="text-[13px] opacity-40 text-center py-8">{empty}</p>;
    return (
      <div className="flex flex-col">
        {items.map(r => (
          <div key={r.id} className="border-b hairline last:border-0 py-3">
            <button
              className="w-full text-left flex items-start justify-between gap-3"
              onClick={() => setOpenId(openId === r.id ? null : r.id)}
            >
              <div className="min-w-0">
                <div className="text-[14px] font-medium leading-snug">{r.title}</div>
                <div className="text-[11px] opacity-55 mt-0.5 flex items-center gap-2 flex-wrap">
                  {r.date && <span className="font-mono">{fmtDate(r.date)}</span>}
                  {isAdmin && <span>{clientName(r.client_id)}</span>}
                  {r.notes && <span>com anotacoes</span>}
                </div>
              </div>
              <span className="text-xs opacity-40 shrink-0 mt-1">{openId === r.id ? "−" : "+"}</span>
            </button>
            {openId === r.id && (
              <div className="mt-2.5 text-[13px] leading-relaxed opacity-75 whitespace-pre-wrap">
                {r.notes?.trim() || <span className="opacity-50 italic">Sem anotacoes registradas.</span>}
              </div>
            )}
          </div>
        ))}
      </div>
    );
  }

  return (
    <>
      <PageMeta title="Reunioes | inProR" />
      <PageWrap
        title="Reunioes"
        subtitle="Agenda e atas de reuniao"
        action={
          <div className="flex items-center gap-2">
            {isAdmin && (
              <select className="text-xs border hairline rounded px-2 py-1.5 bg-white dark:bg-[#11141b]"
                value={adminClientId ?? ""} onChange={e => setAdminClientId(e.target.value || null)}>
                <option value="">Todos os clientes</option>
                {adminClients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            )}
            <Btn size="sm" onClick={() => setShowForm(v => !v)}>+ Nova reuniao</Btn>
          </div>
        }
      >
        <KpiGrid>
          <KpiCard label="Total"      value={rows.length} />
          <KpiCard label="Agendadas"  value={futuras.length} />
          <KpiCard label="Realizadas" value={passadas.length} />
          <KpiCard label="Proxima"    value={proxima?.date ? fmtDate(proxima.date) : "-"} sub={proxima?.title} />
        </KpiGrid>

        {showForm && (
          <SectionCard title="Nova Reuniao" className="mb-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <label className="flex flex-col gap-1 md:col-span-2">
                <span className="text-[11px] opacity-55 uppercase tracking-wide">Titulo</span>
                <input className="text-sm border hairline rounded px-2 py-1.5 bg-white dark:bg-[#11141b]"
                  value={form.title} onChange={f("title")} placeholder="Assunto da reuniao" />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[11px] opacity-55 uppercase tracking-wide">Data</span>
                <input type="date" className="text-sm border hairline rounded px-2 py-1.5 bg-white dark:bg-[#11141b]"
                  value={form.date} onChange={f("date")} />
              </label>
              <label className="flex flex-col gap-1 md:col-span-3">
                <span className="text-[11px] opacity-55 uppercase tracking-wide">Ata / anotacoes</span>
                <textarea className="text-sm border hairline rounded px-2 py-1.5 bg-white dark:bg-[#11141b] resize-none leading-relaxed"
                  rows={4} value={form.notes} onChange={f("notes")}
                  placeholder="Pontos discutidos, decisoes e proximos passos" />
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
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <SectionCard title="Agendadas">
              <List items={futuras} empty="Nenhuma reuniao agendada." />
            </SectionCard>
            <SectionCard title="Historico">
              <List items={passadas} empty="Nenhuma reuniao realizada." />
            </SectionCard>
          </div>
        )}

        {!loading && rows.length > 0 && (
          <SectionCard title="Todas as Reunioes" className="mt-4">
            <Table
              headers={isAdmin ? ["Data", "Titulo", "Cliente", "Ata"] : ["Data", "Titulo", "Ata"]}
              rows={rows.map(r => {
                const head = [r.date ? fmtDate(r.date) : "-", r.title];
                const tail = [r.notes?.trim() ? "Sim" : "-"];
                return isAdmin ? [...head, clientName(r.client_id), ...tail] : [...head, ...tail];
              })}
            />
            <p className="text-[11px] opacity-40 mt-3">
              {comNotas} de {rows.length} reunioes com ata registrada
            </p>
          </SectionCard>
        )}
      </PageWrap>
    </>
  );
}
