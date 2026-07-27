import { ReactNode } from "react";

// ── Helpers ────────────────────────────────────────────────────
export function cls(...args: (string | boolean | undefined | null)[]) {
  return args.filter(Boolean).join(" ");
}

// ── PageWrap ───────────────────────────────────────────────────
export function PageWrap({ title, subtitle, action, children }: {
  title: string; subtitle?: string; action?: ReactNode; children: ReactNode;
}) {
  return (
    <div className="p-4 sm:p-5 md:p-7 max-w-7xl mx-auto">
      {/* Mobile: titulo e acoes empilhados; desktop: lado a lado */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 sm:gap-4 mb-5 sm:mb-6">
        <div className="min-w-0">
          <h1 className="font-display font-bold text-2xl sm:text-3xl tracking-tight" style={{ color: "var(--brand)" }}>{title}</h1>
          {subtitle && <p className="text-[13px] opacity-55 mt-1">{subtitle}</p>}
        </div>
        {action && (
          <div className="shrink-0 w-full sm:w-auto [&>div]:w-full sm:[&>div]:w-auto [&_select]:flex-1 sm:[&_select]:flex-none [&_select]:min-w-0">
            {action}
          </div>
        )}
      </div>
      {children}
    </div>
  );
}

// ── KpiCard ────────────────────────────────────────────────────
export function KpiCard({ label, value, sub, delta }: {
  label: string; value: string | number; sub?: string; delta?: number;
}) {
  const deltaColor = delta === undefined ? "" : delta >= 0 ? "var(--ok)" : "var(--bad)";
  const deltaSign  = delta === undefined ? "" : delta >= 0 ? "+" : "";
  return (
    <div className="border hairline rounded-xl p-3 sm:p-4 bg-white dark:bg-[#11141b] flex flex-col gap-1.5 sm:gap-2.5 shadow-sm min-w-0">
      <span className="text-[10px] sm:text-[11px] font-semibold uppercase tracking-wide opacity-50 truncate">{label}</span>
      {/* Valor encolhe no mobile para nao estourar o card */}
      <div className="font-mono text-[19px] sm:text-[22px] md:text-[26px] leading-none font-bold tabular truncate"
        style={{ color: "var(--brand)" }}>
        {value}
      </div>
      {(sub || delta !== undefined) && (
        <div className="flex items-center gap-2 min-w-0">
          {sub && <span className="text-[11px] sm:text-xs opacity-50 truncate">{sub}</span>}
          {delta !== undefined && (
            <span className="text-[11px] sm:text-xs font-semibold shrink-0" style={{ color: deltaColor }}>
              {deltaSign}{delta}%
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// ── KpiGrid ────────────────────────────────────────────────────
export function KpiGrid({ children }: { children: ReactNode }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
      {children}
    </div>
  );
}

// ── SectionCard ────────────────────────────────────────────────
export function SectionCard({ title, action, children, className }: {
  title?: string; action?: ReactNode; children: ReactNode; className?: string;
}) {
  return (
    <div className={cls("border hairline rounded-xl bg-white dark:bg-[#11141b]", className)}>
      {title && (
        <div className="px-4 sm:px-5 py-3 sm:py-3.5 border-b hairline flex items-center justify-between gap-2">
          <span className="font-semibold text-[14px] sm:text-[15px] min-w-0 truncate" style={{ color: "var(--brand)" }}>{title}</span>
          {action}
        </div>
      )}
      <div className="p-4 sm:p-5">{children}</div>
    </div>
  );
}

// ── Table ──────────────────────────────────────────────────────
export function Table({ headers, rows, empty = "Nenhum registro encontrado." }: {
  headers: string[];
  rows: (string | number | ReactNode)[][];
  empty?: string;
}) {
  return (
    // No mobile o scroll vai de borda a borda do card, sem cortar na metade
    <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b hairline">
            {headers.map((h, i) => (
              <th key={i} className="text-[11px] font-semibold uppercase tracking-wide opacity-50 text-left py-2.5 px-3 whitespace-nowrap">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={headers.length} className="text-sm opacity-40 py-8 text-center">
                {empty}
              </td>
            </tr>
          ) : (
            rows.map((row, ri) => (
              <tr key={ri} className="border-b hairline last:border-0 hover:bg-black/[0.02] dark:hover:bg-white/[0.02]">
                {row.map((cell, ci) => (
                  <td key={ci} className="py-2.5 px-3 text-[13px] tabular align-middle">{cell}</td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

// ── StatusDot ──────────────────────────────────────────────────
export function StatusDot({ status }: { status: "ok" | "warn" | "bad" | "neutral" }) {
  const colors: Record<string, string> = {
    ok: "var(--ok)", warn: "var(--warn)", bad: "var(--bad)", neutral: "var(--line-light)"
  };
  return (
    <span className="inline-block w-2 h-2 rounded-full shrink-0"
      style={{ background: colors[status] ?? colors.neutral }} />
  );
}

// ── EmptyState ─────────────────────────────────────────────────
export function EmptyState({ icon = "○", title, sub, action }: {
  icon?: string; title: string; sub?: string; action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
      <span className="text-4xl opacity-20">{icon}</span>
      <div className="font-semibold text-base opacity-70">{title}</div>
      {sub && <p className="text-[13px] opacity-45 max-w-sm leading-relaxed">{sub}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

// ── Badge ──────────────────────────────────────────────────────
export function Badge({ label, color = "default" }: {
  label: string; color?: "default" | "green" | "copper" | "red" | "yellow";
}) {
  const styles: Record<string, string> = {
    default: "background:rgba(0,0,0,.06);color:var(--ink)",
    green:   "background:rgba(8,116,67,.12);color:var(--ok)",
    copper:  `background:rgba(168,87,48,.12);color:var(--copper)`,
    red:     "background:rgba(179,38,30,.12);color:var(--bad)",
    yellow:  "background:rgba(177,90,12,.12);color:var(--warn)",
  };
  return (
    <span className="text-[11px] font-medium px-2 py-0.5 rounded-full"
      style={Object.fromEntries(styles[color].split(";").map(s => s.split(":"))) as React.CSSProperties}>
      {label}
    </span>
  );
}

// ── Btn ────────────────────────────────────────────────────────
export function Btn({ children, onClick, variant = "primary", size = "md", disabled }: {
  children: ReactNode; onClick?: () => void;
  variant?: "primary" | "secondary" | "ghost"; size?: "sm" | "md";
  disabled?: boolean;
}) {
  const base = "font-semibold rounded-lg transition-opacity disabled:opacity-40 inline-flex items-center gap-2";
  const sizes = { sm: "px-3 py-1.5 text-[13px]", md: "px-4 py-2 text-sm" };
  const variants = {
    primary:   { background: "var(--brand)", color: "white" },
    secondary: { background: "var(--copper)", color: "white" },
    ghost:     { background: "transparent", color: "var(--ink)", border: "1px solid var(--line-light)" },
  };
  return (
    <button className={cls(base, sizes[size])} onClick={onClick}
      style={variants[variant]} disabled={disabled}>
      {children}
    </button>
  );
}

// ── ComingSoon ─────────────────────────────────────────────────
export function ComingSoon({ pageName }: { pageName: string }) {
  return (
    <PageWrap title={pageName}>
      <EmptyState
        icon="○"
        title="Em construcao"
        sub="Esta pagina esta sendo desenvolvida e estara disponivel em breve."
      />
    </PageWrap>
  );
}
