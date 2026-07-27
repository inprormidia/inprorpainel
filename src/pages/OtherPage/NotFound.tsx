import { useNavigate } from "react-router";
export default function NotFound() {
  const nav = useNavigate();
  return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-4" style={{ background: "var(--paper)" }}>
      <div className="font-display font-bold text-6xl" style={{ color: "var(--brand)", opacity: 0.2 }}>404</div>
      <div className="font-display font-bold text-xl" style={{ color: "var(--brand)" }}>Pagina nao encontrada</div>
      <button onClick={() => nav("/")} className="font-mono text-xs underline opacity-50">Voltar ao Dashboard</button>
    </div>
  );
}
