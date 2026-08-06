import { ReactNode } from "react";
import { Navigate } from "react-router";
import { useClientScope } from "../../context/AuthContext";
import { PageWrap, EmptyState, Btn } from "../ui/InprorComponents";

// Bloqueia o acesso direto pela URL a um modulo que o membro nao tem.
// A protecao real esta nas policies do banco; isto evita a tela vazia
// e deixa claro que o acesso precisa ser liberado.
export default function ModuleRoute({ module, children }: { module: string; children: ReactNode }) {
  const { isAdmin, isAgency, canSeeModule, authLoading } = useClientScope();

  if (authLoading) return null;
  if (isAdmin) return <>{children}</>;

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

  if (!isAgency && !isAdmin) {
    // cliente segue com as regras de modulo dele, ja aplicadas na navegacao
    return <>{children}</>;
  }

  return <>{children}</>;
}

// Rota exclusiva do dono da agencia
export function AdminOnlyRoute({ children }: { children: ReactNode }) {
  const { isAdmin, authLoading } = useClientScope();
  if (authLoading) return null;
  if (!isAdmin) return <Navigate to="/" replace />;
  return <>{children}</>;
}
