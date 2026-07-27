import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { PageWrap, Table, Btn, EmptyState, Badge } from "../../components/ui/InprorComponents";
import PageMeta from "../../components/common/PageMeta";

interface Client {
  id: string; name: string; active: boolean; email?: string; phone?: string;
  cuisine_type?: string; created_at: string;
}

export default function Clientes() {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", phone: "", cuisine_type: "" });
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from("clients").select("*").order("name");
    setClients((data as Client[]) ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleSave = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    await supabase.from("clients").insert({ ...form, active: true });
    setSaving(false);
    setShowForm(false);
    setForm({ name: "", email: "", phone: "", cuisine_type: "" });
    load();
  };

  const toggleActive = async (id: string, active: boolean) => {
    await supabase.from("clients").update({ active: !active }).eq("id", id);
    load();
  };

  const rows = clients.map(c => [
    c.name,
    c.cuisine_type || "-",
    c.email || "-",
    c.phone || "-",
    <Badge key={c.id} label={c.active ? "ativo" : "inativo"} color={c.active ? "green" : "default"} />,
    <button key={`t-${c.id}`} onClick={() => toggleActive(c.id, c.active)}
      className="font-mono text-[10px] opacity-40 hover:opacity-80 underline">
      {c.active ? "desativar" : "ativar"}
    </button>,
  ]);

  const inputCls = "w-full px-3 py-2 text-sm border hairline rounded bg-white dark:bg-[#11141b] focus:outline-none font-mono";

  return (
    <>
      <PageMeta title="Clientes | inProR Painel" />
      <PageWrap
        title="Clientes"
        subtitle={`${clients.filter(c => c.active).length} ativos`}
        action={<Btn onClick={() => setShowForm(!showForm)}>+ Novo cliente</Btn>}
      >
        {showForm && (
          <div className="border hairline rounded-xl p-5 mb-6 bg-white dark:bg-[#11141b]">
            <div className="font-display font-bold text-sm mb-4" style={{ color: "var(--brand)" }}>Novo cliente</div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
              <div>
                <label className="block font-mono text-[10px] uppercase tracking-widest opacity-50 mb-1">Nome *</label>
                <input className={inputCls} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Nome do restaurante" />
              </div>
              <div>
                <label className="block font-mono text-[10px] uppercase tracking-widest opacity-50 mb-1">Tipo de Cozinha</label>
                <input className={inputCls} value={form.cuisine_type} onChange={e => setForm(f => ({ ...f, cuisine_type: e.target.value }))} placeholder="Pizza, Hamburguer, Japonesa..." />
              </div>
              <div>
                <label className="block font-mono text-[10px] uppercase tracking-widest opacity-50 mb-1">E-mail</label>
                <input className={inputCls} type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="contato@restaurante.com" />
              </div>
              <div>
                <label className="block font-mono text-[10px] uppercase tracking-widest opacity-50 mb-1">WhatsApp</label>
                <input className={inputCls} value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="(11) 99999-9999" />
              </div>
            </div>
            <div className="flex gap-2">
              <Btn onClick={handleSave} disabled={saving || !form.name.trim()}>
                {saving ? "Salvando..." : "Salvar"}
              </Btn>
              <Btn variant="ghost" onClick={() => setShowForm(false)}>Cancelar</Btn>
            </div>
          </div>
        )}

        {loading ? (
          <div className="font-mono text-xs opacity-40 py-8 text-center">Carregando...</div>
        ) : clients.length === 0 ? (
          <EmptyState icon="☷" title="Nenhum cliente cadastrado"
            sub="Clique em Novo cliente para comecar."
            action={<Btn onClick={() => setShowForm(true)}>+ Adicionar primeiro cliente</Btn>} />
        ) : (
          <div className="border hairline rounded-xl overflow-hidden bg-white dark:bg-[#11141b]">
            <Table
              headers={["Nome", "Cozinha", "E-mail", "Telefone", "Status", ""]}
              rows={rows}
            />
          </div>
        )}
      </PageWrap>
    </>
  );
}
