import { useLocation, useNavigate } from "react-router";
import { useTheme } from "../context/ThemeContext";
import { useAuth, useClientScope } from "../context/AuthContext";
import { useMemo, useState, useEffect } from "react";

function cls(...args: (string | boolean | undefined | null)[]) {
  return args.filter(Boolean).join(" ");
}

// moduleKey nulo = sempre visivel; adminOnly = so o dono da agencia
const NAV_STAFF = [
  {
    group: "Geral",
    items: [
      { path: "/",          label: "Dashboard",   icon: "◎", moduleKey: null,       adminOnly: false },
      { path: "/clientes",  label: "Clientes",    icon: "☷", moduleKey: "clientes", adminOnly: true },
      { path: "/equipe",    label: "Equipe",      icon: "◍", moduleKey: "equipe",   adminOnly: true },
      { path: "/projetos",  label: "Projetos",    icon: "▤", moduleKey: "projetos", adminOnly: false },
      { path: "/tarefas",   label: "Tarefas",     icon: "◑", moduleKey: "tarefas",  adminOnly: false },
    ],
  },
  {
    group: "Estrategia",
    items: [
      { path: "/estrategias", label: "Estrategias", icon: "⬡", moduleKey: "estrategias", adminOnly: false },
      { path: "/metas-kpis",  label: "Metas & KPIs", icon: "◈", moduleKey: "metas-kpis", adminOnly: false },
    ],
  },
  {
    group: "Delivery",
    items: [
      { path: "/delivery",   label: "Delivery",    icon: "◈", moduleKey: "delivery",  adminOnly: false },
      { path: "/reputacao",  label: "Reputacao",   icon: "★", moduleKey: "reputacao", adminOnly: false },
    ],
  },
  {
    group: "Marketing",
    items: [
      { path: "/trafego-pago", label: "Trafego Pago", icon: "➚", moduleKey: "trafego-pago", adminOnly: false },
      { path: "/social",       label: "Redes Sociais", icon: "≋", moduleKey: "social",     adminOnly: false },
      { path: "/cardapio",     label: "Cardapio/Site", icon: "⌂", moduleKey: "cardapio",   adminOnly: false },
    ],
  },
  {
    group: "Operacao",
    items: [
      { path: "/relatorios", label: "Relatorios", icon: "≡", moduleKey: "relatorios", adminOnly: false },
      { path: "/financeiro", label: "Financeiro", icon: "$", moduleKey: "financeiro", adminOnly: true },
      { path: "/reunioes",   label: "Reunioes",   icon: "◐", moduleKey: "reunioes",   adminOnly: false },
    ],
  },
];

const NAV_CLIENT = [
  {
    group: "Minha Conta",
    items: [
      { path: "/",           label: "Dashboard",   icon: "◎", moduleKey: null },
      { path: "/metas-kpis", label: "Metas & KPIs", icon: "◈", moduleKey: null },
    ],
  },
  {
    group: "Delivery",
    items: [
      { path: "/delivery",  label: "Delivery",   icon: "◈", moduleKey: "delivery" },
      { path: "/reputacao", label: "Reputacao",  icon: "★", moduleKey: "reputacao" },
    ],
  },
  {
    group: "Marketing",
    items: [
      { path: "/trafego-pago", label: "Trafego Pago", icon: "➚", moduleKey: "trafego-pago" },
      { path: "/social",       label: "Redes Sociais", icon: "≋", moduleKey: "social" },
      { path: "/cardapio",     label: "Cardapio",      icon: "⌂", moduleKey: "cardapio" },
    ],
  },
  {
    group: "Operacao",
    items: [
      { path: "/projetos",   label: "Projetos",   icon: "▤", moduleKey: null },
      { path: "/tarefas",    label: "Tarefas",    icon: "◑", moduleKey: null },
      { path: "/relatorios", label: "Relatorios", icon: "≡", moduleKey: null },
      { path: "/financeiro", label: "Financeiro", icon: "$", moduleKey: null },
      { path: "/reunioes",   label: "Reunioes",   icon: "◐", moduleKey: null },
    ],
  },
];

interface AppSidebarProps {
  mobileOpen: boolean;
  setMobileOpen: (open: boolean) => void;
}

const AppSidebar: React.FC<AppSidebarProps> = ({ mobileOpen, setMobileOpen }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();
  const { user, role, clientModules, signOut } = useAuth();
  const { adminClientId, setAdminClientId, adminClients, myModules } = useClientScope();

  // menu recolhido no desktop, lembrado entre sessoes
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem("inpror.sidebar") === "recolhido"; } catch { return false; }
  });
  useEffect(() => {
    try { localStorage.setItem("inpror.sidebar", collapsed ? "recolhido" : "aberto"); } catch { /* indisponivel */ }
  }, [collapsed]);

  const nav = useMemo(() => {
    if (role === "admin") return NAV_STAFF;
    if (role === "agency") {
      // equipe: esconde o que e exclusivo do admin e o que nao foi liberado
      return NAV_STAFF.map(group => ({
        ...group,
        items: group.items.filter(it =>
          !it.adminOnly &&
          (it.moduleKey === null || (myModules ?? []).includes(it.moduleKey))
        ),
      })).filter(g => g.items.length > 0);
    }
    return NAV_CLIENT.map(group => ({
      ...group,
      items: group.items.filter(it =>
        it.moduleKey === null ||
        (clientModules !== null && clientModules.includes(it.moduleKey))
      ),
    })).filter(g => g.items.length > 0);
  }, [role, clientModules, myModules]);

  const displayName = (user?.user_metadata?.name as string) || user?.email?.split("@")[0] || "Usuario";
  const initials = displayName.slice(0, 2).toUpperCase();
  const roleLabel = role === "admin" ? "Admin" : role === "agency" ? "Equipe" : "Cliente";

  const isActive = (path: string) =>
    path === "/" ? location.pathname === "/" : location.pathname.startsWith(path);

  const handleNav = (path: string) => { navigate(path); setMobileOpen(false); };

  const sidebarContent = (mini: boolean) => (
    <div className={cls("flex flex-col h-full sidebar-brand transition-all", mini ? "w-16" : "w-56")}>
      {/* Logo */}
      <div className="px-4 py-4 flex items-center gap-3" style={{ borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
        {/* sidebar tem fundo verde escuro, por isso a logo branca */}
        <img src="/logo-inpror-branca.png" alt="inProR" width={36} height={36}
          className="w-9 h-9 shrink-0 object-contain" />
        {!mini && (
          <div className="flex-1 min-w-0">
            <div className="font-display font-bold text-base leading-tight text-white">inProR</div>
            <div className="font-mono text-[9px] uppercase tracking-widest mt-0.5" style={{ color: "rgba(255,255,255,0.35)" }}>
              Painel de Gestao
            </div>
          </div>
        )}
        <button onClick={() => setMobileOpen(false)}
          className="md:hidden w-6 h-6 flex items-center justify-center text-sm" style={{ color: "rgba(255,255,255,0.5)" }}>
          ✕
        </button>
      </div>

      {/* Global client filter - admin */}
      {!mini && (role === "admin" || role === "agency") && adminClients.length > 0 && (
        <div className="px-3 py-2.5" style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
          <div className="nav-group-label mb-1.5">Contexto</div>
          <select
            value={adminClientId ?? ""}
            onChange={e => setAdminClientId(e.target.value || null)}
            className="w-full text-xs rounded px-2 py-1.5 font-medium focus:outline-none"
            style={{ background: "rgba(255,255,255,0.08)", color: "white", border: "1px solid rgba(255,255,255,0.15)" }}
          >
            <option value="">Todos os clientes</option>
            {adminClients.map(c => (
              <option key={c.id} value={c.id} style={{ color: "#0F172A" }}>
                {c.name}{!c.active ? " (inativo)" : ""}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-3 space-y-3">
        {nav.map(g => (
          <div key={g.group}>
            {!mini && <div className="nav-group-label mb-1">{g.group}</div>}
            <div className="space-y-0.5 px-2">
              {g.items.map(it => (
                <button
                  key={it.path}
                  onClick={() => handleNav(it.path)}
                  className={cls("nav-item", isActive(it.path) && "active", mini && "justify-center px-0")}
                  title={mini ? it.label : undefined}
                >
                  <span className="font-mono text-xs w-3 text-center shrink-0" style={{ opacity: 0.6 }}>{it.icon}</span>
                  {!mini && <span>{it.label}</span>}
                </button>
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className={cls("px-3 py-3 flex items-center gap-2", mini && "flex-col")} style={{ borderTop: "1px solid rgba(255,255,255,0.1)" }}>
        <div className="w-7 h-7 rounded-full shrink-0 flex items-center justify-center text-[11px] font-bold text-white"
          style={{ background: "var(--copper)" }}>
          {initials}
        </div>
        {!mini && (
          <div className="flex-1 min-w-0">
            <div className="text-xs font-semibold truncate text-white capitalize">{displayName}</div>
            <div className="font-mono text-[8px] uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.35)" }}>{roleLabel}</div>
          </div>
        )}
        <button onClick={() => signOut()}
          className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] transition-opacity"
          style={{ border: "1px solid rgba(255,255,255,0.2)", color: "rgba(255,255,255,0.5)" }}
          title="Sair">
          ⏻
        </button>
        <button onClick={toggleTheme}
          className="w-6 h-6 rounded-full flex items-center justify-center text-[10px]"
          style={{ border: "1px solid rgba(255,255,255,0.2)", color: "rgba(255,255,255,0.5)" }}
          title="Alternar tema">
          {theme === "dark" ? "☀" : "☾"}
        </button>
      </div>
    </div>
  );

  return (
    <>
      <div className="hidden md:block h-screen sticky top-0 shrink-0 relative">
        {sidebarContent(collapsed)}
        {/* alterna entre menu completo e apenas icones */}
        <button
          onClick={() => setCollapsed(v => !v)}
          className="absolute -right-3 top-20 w-6 h-6 rounded-full border hairline flex items-center justify-center
                     text-[11px] shadow-sm z-10 transition-transform"
          style={{ background: "var(--paper)", color: "var(--ink)" }}
          title={collapsed ? "Expandir menu" : "Recolher menu"}
          aria-label={collapsed ? "Expandir menu" : "Recolher menu"}
        >
          {collapsed ? "›" : "‹"}
        </button>
      </div>
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <div className="relative h-full shadow-2xl">{sidebarContent(false)}</div>
        </div>
      )}
    </>
  );
};

export default AppSidebar;
