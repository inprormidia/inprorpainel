import { ReactNode } from "react";
import { Navigate } from "react-router";
import { useClientScope } from "../../context/AuthContext";
import { PageWrap, EmptyState, Btn } from "../ui/InprorComponents";

// Bloqueia o acesso direto pela URL a um modulo que a pessoa nao tem.
// A protecao real esta nas policies do banco; isto evita a tela vazia
// e deixa claro que o acesso precisa ser liberado.
export default function ModuleRoute({ module, children }: { module: string; children: ReactNode }) {
  const { isAgency, canSeeModule, scopeLoading } = useClientScope();

  // sem esperar o papel e a equipe carregarem, todo modulo pareceria bloqueado
  if (scopeLoading) return null;

  if (isAgency && !canSeeModule(module)) {
    return (
      <PageWrap title="Acesso nao liberado">
        <EmptyState
          title="Voce nao tem acesso a esta area"
          sub="Peca para o administrador liberar este modulo no seu cadastro da equipe."
          action={<Btn size="sm" onClick={() => window.history.back()}>Voltar</Btn>}
        />
      </PageWrap>
    );
  }

  // admin e cliente seguem as proprias regras, ja aplicadas na navegacao e no banco
  return <>{children}</>;
}

// Rota exclusiva do dono da agencia
export function AdminOnlyRoute({ children }: { children: ReactNode }) {
  const { isAdmin, scopeLoading } = useClientScope();
  if (scopeLoading) return null;
  if (!isAdmin) return <Navigate to="/" replace />;
  return <>{children}</>;
}
