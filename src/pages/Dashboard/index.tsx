import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { useClientScope } from "../../context/AuthContext";
import { PageWrap, KpiGrid, KpiCard, SectionCard, EmptyState } from "../../components/ui/InprorComponents";
import PageMeta from "../../components/common/PageMeta";

interface Client { id: string; name: string; active: boolean; }

export default function Dashboard() {
  const { isAdmin, scopedClientId, adminClients } = useClientScope();
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isAdmin) { setLoading(false); return; }
    supabase.from("clients").select("id, name, active").order("name")
      .then(({ data }) => { setClients((data as Client[]) ?? []); setLoading(false); });
  }, [isAdmin]);

  const activeCount = clients.filter(c => c.active).length;

  return (
    <>
      <PageMeta title="Dashboard | inProR Painel" />
      <PageWrap
        title="Dashboard"
        subtitle={isAdmin ? "Visao geral da agencia inProR" : "Resultados da sua conta"}
      >
        {isAdmin ? (
          <>
            <KpiGrid>
              <KpiCard label="Clientes Ativos" value={loading ? "..." : activeCount} />
              <KpiCard label="Clientes Totais" value={loading ? "..." : clients.length} />
              <KpiCard label="Modulos Ativos" value="--" sub="em breve" />
              <KpiCard label="MRR" value="R$ --" sub="em breve" />
            </KpiGrid>

            <SectionCard title="Clientes">
              {loading ? (
                <div className="font-mono text-xs opacity-40 py-4 text-center">Carregando...</div>
              ) : clients.length === 0 ? (
                <EmptyState icon="☷" title="Nenhum cliente" sub="Cadastre o primeiro cliente em /clientes" />
              ) : (
                <div className="space-y-2">
                  {clients.map(c => (
                    <div key={c.id} className="flex items-center justify-between py-2.5 px-3 rounded-lg border hairline">
                      <span className="font-medium text-sm">{c.name}</span>
                      <span className="font-mono text-[10px] px-2 py-0.5 rounded-full"
                        style={{
                          background: c.active ? "rgba(8,116,67,.1)" : "rgba(0,0,0,.05)",
                          color: c.active ? "var(--ok)" : "var(--ink)",
                        }}>
                        {c.active ? "ativo" : "inativo"}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>
          </>
        ) : (
          <>
            <KpiGrid>
              <KpiCard label="Pedidos/mes" value="--" />
              <KpiCard label="Ticket Medio" value="R$ --" />
              <KpiCard label="Avaliacao" value="--" />
              <KpiCard label="Leads/mes" value="--" />
            </KpiGrid>
            <SectionCard title="Resumo">
              <EmptyState icon="◎" title="Dados em carregamento" sub="Seus indicadores aparecao aqui assim que os dados forem sincronizados." />
            </SectionCard>
          </>
        )}

        {isAdmin && scopedClientId && (
          <p className="font-mono text-[10px] opacity-40 mt-4">
            Filtrando por: {adminClients.find(c => c.id === scopedClientId)?.name}
          </p>
        )}
      </PageWrap>
    </>
  );
}
