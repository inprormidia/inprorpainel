import { ReactNode, useState, useRef, useEffect, useCallback } from "react";

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
          {/* no celular o subtitulo so consumia altura antes do conteudo */}
          {subtitle && <p className="hidden sm:block text-[13px] opacity-55 mt-1">{subtitle}</p>}
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
    <div className="border hairline rounded-xl px-3 py-2.5 sm:p-4 bg-white dark:bg-[#11141b] flex flex-col gap-1 sm:gap-2.5 shadow-sm min-w-0">
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
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3 mb-4 sm:mb-6">
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

// ── Avatar ─────────────────────────────────────────────────────
// Iniciais coloridas. Usado para identificar quem responde pela tarefa.
export function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function Avatar({ name, color, size = 28, title }: {
  name: string; color?: string | null; size?: number; title?: string;
}) {
  return (
    <span
      className="rounded-full inline-flex items-center justify-center font-semibold shrink-0 select-none"
      style={{
        width: size, height: size,
        background: color || "var(--brand)",
        color: "white",
        fontSize: Math.max(9, Math.round(size * 0.38)),
        lineHeight: 1,
      }}
      title={title ?? name}
      aria-hidden={title ? undefined : true}
    >
      {initials(name)}
    </span>
  );
}

// ── AvatarStack ────────────────────────────────────────────────
// Varios responsaveis em sequencia, com sobreposicao leve.
export function AvatarStack({ people, size = 22, max = 3, empty = "Sem responsavel" }: {
  people: { id: string; name: string; color?: string | null }[];
  size?: number; max?: number; empty?: string;
}) {
  if (!people.length)
    return <span className="text-[11px] opacity-35">{empty}</span>;

  const shown = people.slice(0, max);
  const rest  = people.length - shown.length;
  return (
    <span className="inline-flex items-center" title={people.map(p => p.name).join(", ")}>
      {shown.map((p, i) => (
        <span key={p.id} style={{ marginLeft: i === 0 ? 0 : -size * 0.28, zIndex: shown.length - i }}
          className="inline-flex rounded-full" >
          <span style={{ boxShadow: "0 0 0 1.5px var(--paper)", borderRadius: 999, display: "inline-flex" }}>
            <Avatar name={p.name} color={p.color} size={size} title={p.name} />
          </span>
        </span>
      ))}
      {rest > 0 && (
        <span className="ml-1 text-[10px] opacity-50 font-medium">+{rest}</span>
      )}
    </span>
  );
}

// ── CellPicker ─────────────────────────────────────────────────
// Celula de tabela que se le como texto e vira menu ao clicar.
// O menu usa posicao fixa porque a tabela rola na horizontal e
// recortaria qualquer coisa posicionada por dentro dela.
export function CellPicker({
  trigger, children, width = 230, title, busca, placeholder, variante = "celula",
  aoCriar, criarRotulo,
}: {
  trigger: ReactNode;
  // recebe o fechar e o termo digitado na busca
  children: (fechar: () => void, termo: string) => ReactNode;
  width?: number;
  title?: string;
  // mostra campo de busca: util quando a lista e longa
  busca?: boolean;
  placeholder?: string;
  variante?: "celula" | "campo";
  // permite cadastrar uma opcao nova sem sair da tela
  aoCriar?: (nome: string) => Promise<void>;
  criarRotulo?: string;
}) {
  const [pos, setPos] = useState<{ top: number; left: number; acima: boolean } | null>(null);
  const [termo, setTermo] = useState("");
  const [criando, setCriando] = useState(false);
  const [nomeNovo, setNomeNovo] = useState("");
  const [salvando, setSalvando] = useState(false);
  const btnRef  = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const fechar = useCallback(() => {
    setPos(null); setTermo(""); setCriando(false); setNomeNovo("");
  }, []);

  function abrir() {
    const el = btnRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const margem = 10;
    const larg = variante === "campo" ? Math.max(width, r.width) : width;
    const left = Math.min(Math.max(margem, r.left), window.innerWidth - larg - margem);
    // altura util disponivel abaixo e acima do campo
    const abaixo = window.innerHeight - r.bottom - margem;
    const acima  = r.top - margem;
    const cabeAbaixo = abaixo >= 220 || abaixo >= acima;
    setPos({
      top: cabeAbaixo ? r.bottom + 4 : Math.max(margem, r.top - 4),
      left,
      acima: !cabeAbaixo,
    });
  }

  useEffect(() => {
    if (!pos) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") fechar(); };
    // rolar dentro do proprio menu nao pode fecha-lo
    const onScroll = (e: Event) => {
      if (menuRef.current && e.target instanceof Node && menuRef.current.contains(e.target)) return;
      fechar();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", fechar);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", fechar);
    };
  }, [pos, fechar]);

  const larguraMenu = variante === "campo"
    ? Math.max(width, btnRef.current?.getBoundingClientRect().width ?? width)
    : width;

  // altura maxima conforme o espaco real na tela
  const alturaMax = pos
    ? (pos.acima ? pos.top - 12 : window.innerHeight - pos.top - 12)
    : 320;

  async function confirmarCriacao() {
    const nome = nomeNovo.trim();
    if (!nome || !aoCriar) return;
    setSalvando(true);
    await aoCriar(nome);
    setSalvando(false);
    setCriando(false);
    setNomeNovo("");
  }

  return (
    <>
      <button
        ref={btnRef}
        onClick={() => (pos ? fechar() : abrir())}
        title={title}
        className={cls(
          "w-full text-left rounded flex items-center gap-1.5 transition-colors",
          variante === "campo"
            ? "px-2 h-8 justify-between border border-transparent hover:border-[color:var(--line-light)]"
            : "px-1.5 h-7",
          "hover:bg-black/[0.05] dark:hover:bg-white/[0.07]",
          pos && "bg-black/[0.05] dark:bg-white/[0.07]",
        )}
      >
        <span className="min-w-0 flex-1 flex items-center gap-1.5 truncate">{trigger}</span>
        {variante === "campo" && (
          <span className="text-[10px] opacity-50 shrink-0">▾</span>
        )}
      </button>

      {pos && (
        <>
          <div className="fixed inset-0 z-40" onClick={fechar} aria-hidden="true" />
          <div
            ref={menuRef}
            className="fixed z-50 border hairline rounded-xl shadow-lg bg-white dark:bg-[#11141b] flex flex-col"
            style={{
              top: pos.top, left: pos.left, width: larguraMenu,
              maxHeight: Math.max(180, Math.min(360, alturaMax)),
              transform: pos.acima ? "translateY(-100%)" : undefined,
            }}
            role="menu"
          >
            {busca && (
              <div className="p-1.5 pb-1 shrink-0">
                <input
                  autoFocus
                  className="w-full text-[13px] border hairline rounded px-2 py-1.5 bg-white dark:bg-[#11141b]"
                  placeholder={placeholder ?? "Buscar..."}
                  value={termo}
                  onChange={e => setTermo(e.target.value)}
                  onKeyDown={e => { if (e.key === "Escape") fechar(); }}
                />
              </div>
            )}

            {/* a area de opcoes e a unica que rola */}
            <div className="overflow-y-auto flex-1 p-1.5 pt-0.5">
              {children(fechar, termo.trim().toLowerCase())}
            </div>

            {aoCriar && (
              <div className="border-t hairline p-1.5 shrink-0">
                {criando ? (
                  <div className="flex flex-col gap-1.5">
                    <input
                      autoFocus
                      className="w-full text-[13px] border hairline rounded px-2 py-1.5 bg-white dark:bg-[#11141b]"
                      placeholder="Nome"
                      value={nomeNovo}
                      onChange={e => setNomeNovo(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === "Enter") confirmarCriacao();
                        if (e.key === "Escape") { setCriando(false); setNomeNovo(""); }
                      }}
                    />
                    <div className="flex gap-1.5">
                      <button
                        className="text-[12px] font-semibold px-2.5 py-1 rounded"
                        style={{ background: "var(--brand)", color: "white" }}
                        onClick={confirmarCriacao} disabled={salvando || !nomeNovo.trim()}>
                        {salvando ? "Salvando..." : "Criar"}
                      </button>
                      <button className="text-[12px] px-2 py-1 opacity-55"
                        onClick={() => { setCriando(false); setNomeNovo(""); }}>
                        Cancelar
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    className="w-full text-left text-[13px] px-2 py-1.5 rounded font-medium
                               hover:bg-black/[0.05] dark:hover:bg-white/[0.07]"
                    style={{ color: "var(--copper)" }}
                    onClick={() => { setCriando(true); setNomeNovo(termo); }}>
                    + {criarRotulo ?? "Adicionar"}
                    {termo && <span className="opacity-70"> {termo}</span>}
                  </button>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </>
  );
}

// Item de menu com marca de selecionado
export function MenuItem({ selecionado, onClick, children }: {
  selecionado?: boolean; onClick: () => void; children: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      role="menuitem"
      className="w-full flex items-center gap-2 text-left text-[13px] px-2 py-1.5 rounded
                 hover:bg-black/[0.05] dark:hover:bg-white/[0.07]"
    >
      <span className="w-3.5 shrink-0 text-[11px]" style={{ color: "var(--ok)" }}>
        {selecionado ? "✓" : ""}
      </span>
      <span className="min-w-0 flex-1 truncate">{children}</span>
    </button>
  );
}

// ── MenuData ───────────────────────────────────────────────────
// Campo de data para usar dentro de um menu. Guarda o valor em
// rascunho e so grava quando o usuario confirma, porque o input
// nativo dispara change a cada pedaco digitado: sem isso, quem
// digita a data no teclado tem o menu fechado no meio do caminho.
export function MenuData({ valor, onSalvar, onFechar, atalhos = true, permiteLimpar = true }: {
  valor: string | null;
  onSalvar: (data: string | null) => void;
  onFechar: () => void;
  atalhos?: boolean;
  permiteLimpar?: boolean;
}) {
  const [rascunho, setRascunho] = useState(valor ?? "");
  const valido = /^\d{4}-\d{2}-\d{2}$/.test(rascunho);
  const mudou = rascunho !== (valor ?? "");

  const emDias = (n: number) => {
    const d = new Date();
    d.setDate(d.getDate() + n);
    return d.toISOString().slice(0, 10);
  };

  const aplicar = (data: string | null) => { onSalvar(data); onFechar(); };

  return (
    <div className="p-1 flex flex-col gap-2">
      <input
        type="date"
        className="text-sm border hairline rounded px-2 py-1.5 bg-white dark:bg-[#11141b] w-full"
        value={rascunho}
        onChange={e => setRascunho(e.target.value)}
        onKeyDown={e => {
          if (e.key === "Enter" && valido) aplicar(rascunho);
          if (e.key === "Escape") onFechar();
        }}
      />

      {atalhos && (
        <div className="flex flex-wrap gap-1">
          <button className="text-[11px] px-2 py-1 rounded border hairline hover:bg-black/[0.04] dark:hover:bg-white/[0.06]"
            onClick={() => aplicar(emDias(0))}>Hoje</button>
          <button className="text-[11px] px-2 py-1 rounded border hairline hover:bg-black/[0.04] dark:hover:bg-white/[0.06]"
            onClick={() => aplicar(emDias(1))}>Amanha</button>
          <button className="text-[11px] px-2 py-1 rounded border hairline hover:bg-black/[0.04] dark:hover:bg-white/[0.06]"
            onClick={() => aplicar(emDias(7))}>Em 7 dias</button>
        </div>
      )}

      <div className="flex items-center gap-1.5 border-t hairline pt-2">
        <button
          className="text-[12px] font-semibold px-2.5 py-1 rounded disabled:opacity-35"
          style={{ background: "var(--brand)", color: "white" }}
          disabled={!valido || !mudou}
          onClick={() => aplicar(rascunho)}>
          Aplicar
        </button>
        {permiteLimpar && valor && (
          <button className="text-[12px] px-2 py-1 rounded border hairline"
            style={{ color: "var(--bad)" }}
            onClick={() => aplicar(null)}>
            Limpar
          </button>
        )}
        <button className="text-[12px] px-2 py-1 opacity-55 ml-auto" onClick={onFechar}>
          Cancelar
        </button>
      </div>
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
