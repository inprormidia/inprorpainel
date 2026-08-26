import { BrowserRouter as Router, Routes, Route } from "react-router";
import { ScrollToTop } from "./components/common/ScrollToTop";
import AppLayout from "./layout/AppLayout";
import ProtectedRoute from "./components/auth/ProtectedRoute";
import AdminRoute from "./components/auth/AdminRoute";
import ModuleRoute from "./components/auth/ModuleRoute";

import SignIn     from "./pages/AuthPages/SignIn";
import NotFound   from "./pages/OtherPage/NotFound";
import Dashboard  from "./pages/Dashboard";
import Clientes   from "./pages/Clientes";
import Delivery   from "./pages/Delivery";
import TrafegoPago from "./pages/TrafegoPago";
import Social     from "./pages/Social";
import Reputacao  from "./pages/Reputacao";
import Cardapio   from "./pages/Cardapio";
import Reunioes   from "./pages/Reunioes";
import Calendario from "./pages/Calendario";
import Relatorios from "./pages/Relatorios";
import Financeiro from "./pages/Financeiro";
import Tarefas    from "./pages/Tarefas";
import TarefaDetalhe from "./pages/Tarefas/Detalhe";
import Projetos   from "./pages/Projetos";
import Equipe     from "./pages/Equipe";
import Estrategias from "./pages/Estrategias";
import MetasKpis  from "./pages/MetasKpis";

export default function App() {
  return (
    <Router>
      <ScrollToTop />
      <Routes>
        <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
          <Route index path="/"              element={<Dashboard />} />
          <Route path="/delivery"            element={<ModuleRoute module="delivery"><Delivery /></ModuleRoute>} />
          <Route path="/reputacao"           element={<ModuleRoute module="reputacao"><Reputacao /></ModuleRoute>} />
          <Route path="/trafego-pago"        element={<ModuleRoute module="trafego-pago"><TrafegoPago /></ModuleRoute>} />
          <Route path="/social"              element={<ModuleRoute module="social"><Social /></ModuleRoute>} />
          <Route path="/cardapio"            element={<ModuleRoute module="cardapio"><Cardapio /></ModuleRoute>} />
          <Route path="/projetos"            element={<ModuleRoute module="projetos"><Projetos /></ModuleRoute>} />
          <Route path="/tarefas"             element={<ModuleRoute module="tarefas"><Tarefas /></ModuleRoute>} />
          <Route path="/tarefas/:id"         element={<ModuleRoute module="tarefas"><TarefaDetalhe /></ModuleRoute>} />
          <Route path="/estrategias"         element={<ModuleRoute module="estrategias"><Estrategias /></ModuleRoute>} />
          <Route path="/metas-kpis"          element={<ModuleRoute module="metas-kpis"><MetasKpis /></ModuleRoute>} />
          <Route path="/relatorios"          element={<ModuleRoute module="relatorios"><Relatorios /></ModuleRoute>} />
          <Route path="/financeiro"          element={<ModuleRoute module="financeiro"><Financeiro /></ModuleRoute>} />
          <Route path="/reunioes"            element={<ModuleRoute module="reunioes"><Reunioes /></ModuleRoute>} />
          <Route path="/calendario"          element={<ModuleRoute module="calendario"><Calendario /></ModuleRoute>} />
          <Route path="/equipe"              element={<AdminRoute><Equipe /></AdminRoute>} />
          <Route path="/clientes"            element={<AdminRoute><Clientes /></AdminRoute>} />
        </Route>

        <Route path="/signin"  element={<SignIn />} />
        <Route path="*"        element={<NotFound />} />
      </Routes>
    </Router>
  );
}
