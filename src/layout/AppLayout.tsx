import { useState } from "react";
import { Outlet, useLocation } from "react-router";
import AppSidebar from "./AppSidebar";
import MobileBottomNav from "./MobileBottomNav";

const ROUTE_TITLES: Record<string, string> = {
  "/":              "Dashboard",
  "/clientes":      "Clientes",
  "/tarefas":       "Tarefas",
  "/estrategias":   "Estrategias",
  "/metas-kpis":    "Metas e KPIs",
  "/delivery":      "Delivery",
  "/reputacao":     "Reputacao",
  "/trafego-pago":  "Trafego Pago",
  "/social":        "Redes Sociais",
  "/cardapio":      "Cardapio",
  "/relatorios":    "Relatorios",
  "/financeiro":    "Financeiro",
  "/reunioes":      "Reunioes",
};

const AppLayout: React.FC = () => {
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  const pageTitle = ROUTE_TITLES[location.pathname] ?? "inProR";

  return (
    <div className="flex min-h-screen" style={{ background: "var(--paper)", color: "var(--ink)" }}>
      <AppSidebar mobileOpen={mobileOpen} setMobileOpen={setMobileOpen} />

      <main className="flex-1 overflow-y-auto min-h-screen" style={{ background: "var(--paper)" }}>
        {/* Mobile top bar */}
        <div className="md:hidden flex items-center gap-3 px-4 border-b hairline sticky top-0 z-30 backdrop-blur-md"
          style={{
            background: "color-mix(in srgb, var(--paper) 93%, transparent)",
            paddingTop: "max(10px, env(safe-area-inset-top))",
            paddingBottom: "10px",
          }}>
          <div className="w-7 h-7 rounded-lg shrink-0 flex items-center justify-center font-bold text-white text-xs"
            style={{ background: "var(--brand)" }}>R</div>
          <span className="font-display text-sm font-bold flex-1 truncate" style={{ color: "var(--brand)" }}>
            {pageTitle}
          </span>
          <button onClick={() => setMobileOpen(true)}
            className="w-8 h-8 border hairline rounded-lg flex items-center justify-center text-xs opacity-50">
            ≡
          </button>
        </div>

        <div className="pb-20 md:pb-0">
          <Outlet />
        </div>
      </main>

      <MobileBottomNav onMenuOpen={() => setMobileOpen(true)} />
    </div>
  );
};

export default AppLayout;
