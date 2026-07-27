import { BrowserRouter as Router, Routes, Route } from "react-router";
import { ScrollToTop } from "./components/common/ScrollToTop";
import AppLayout from "./layout/AppLayout";
import ProtectedRoute from "./components/auth/ProtectedRoute";
import AdminRoute from "./components/auth/AdminRoute";

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
import Relatorios from "./pages/Relatorios";
import Financeiro from "./pages/Financeiro";
import Tarefas    from "./pages/Tarefas";
import TarefaDetalhe from "./pages/Tarefas/Detalhe";
import Projetos   from "./pages/Projetos";
import Estrategias from "./pages/Estrategias";
import MetasKpis  from "./pages/MetasKpis";

export default function App() {
  return (
    <Router>
      <ScrollToTop />
      <Routes>
        <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
          <Route index path="/"              element={<Dashboard />} />
          <Route path="/delivery"            element={<Delivery />} />
          <Route path="/reputacao"           element={<Reputacao />} />
          <Route path="/trafego-pago"        element={<TrafegoPago />} />
          <Route path="/social"              element={<Social />} />
          <Route path="/cardapio"            element={<Cardapio />} />
          <Route path="/projetos"            element={<Projetos />} />
          <Route path="/tarefas"             element={<Tarefas />} />
          <Route path="/tarefas/:id"         element={<TarefaDetalhe />} />
          <Route path="/estrategias"         element={<Estrategias />} />
          <Route path="/metas-kpis"          element={<MetasKpis />} />
          <Route path="/relatorios"          element={<Relatorios />} />
          <Route path="/financeiro"          element={<Financeiro />} />
          <Route path="/reunioes"            element={<Reunioes />} />
          <Route path="/clientes"            element={<AdminRoute><Clientes /></AdminRoute>} />
        </Route>

        <Route path="/signin"  element={<SignIn />} />
        <Route path="*"        element={<NotFound />} />
      </Routes>
    </Router>
  );
}
