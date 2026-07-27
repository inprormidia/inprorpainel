import { useLocation, useNavigate } from "react-router";

const BOTTOM_NAV = [
  { path: "/",          label: "Home",     icon: "◎" },
  { path: "/tarefas",   label: "Tarefas",  icon: "◑" },
  { path: "/projetos",  label: "Projetos", icon: "▤" },
  { path: "/delivery",  label: "Delivery", icon: "◈" },
];

export default function MobileBottomNav({ onMenuOpen }: { onMenuOpen: () => void }) {
  const location = useLocation();
  const navigate = useNavigate();
  const isActive = (path: string) => path === "/" ? location.pathname === "/" : location.pathname.startsWith(path);

  return (
    <div className="md:hidden fixed bottom-0 inset-x-0 z-40 border-t hairline backdrop-blur-md"
      style={{
        background: "color-mix(in srgb, var(--paper) 95%, transparent)",
        paddingBottom: "env(safe-area-inset-bottom)",
      }}>
      <div className="flex">
        {BOTTOM_NAV.map(item => (
          <button key={item.path} onClick={() => navigate(item.path)}
            className="flex-1 flex flex-col items-center gap-0.5 py-2.5 transition-colors"
            style={{ color: isActive(item.path) ? "var(--brand)" : "var(--ink)", opacity: isActive(item.path) ? 1 : 0.4 }}>
            <span className="font-mono text-base">{item.icon}</span>
            <span className="font-mono text-[9px] uppercase tracking-wider">{item.label}</span>
          </button>
        ))}
        <button onClick={onMenuOpen}
          className="flex-1 flex flex-col items-center gap-0.5 py-2.5 opacity-40">
          <span className="font-mono text-base">≡</span>
          <span className="font-mono text-[9px] uppercase tracking-wider">Menu</span>
        </button>
      </div>
    </div>
  );
}
