import { useParams, useNavigate } from "react-router";
import PageMeta from "../../components/common/PageMeta";
import TarefaPainel from "./TarefaPainel";

// Pagina inteira da tarefa, usada por link direto e por quem
// prefere abrir a tarefa fora da lista.
export default function TarefaDetalhe() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  if (!id) return null;

  return (
    <>
      <PageMeta title="Tarefa | inProR" />
      <TarefaPainel
        taskId={id}
        variant="pagina"
        onClose={() => navigate("/tarefas")}
        onDeleted={() => navigate("/tarefas")}
      />
    </>
  );
}
