import { useState } from "react";
import { useNavigate } from "react-router";
import { supabase } from "../../lib/supabase";

const inputCls = "w-full px-3 py-2.5 text-sm border hairline bg-white dark:bg-[#11141b] focus:outline-none font-mono placeholder:opacity-30 rounded";
const labelCls = "block text-[10px] font-mono uppercase tracking-widest opacity-50 mb-1.5";

export default function SignInForm() {
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      setError(error.message === "Invalid login credentials" ? "Email ou senha incorretos." : error.message);
    } else {
      navigate("/");
    }
  };

  return (
    <div className="w-full max-w-sm">
      {/* Logo */}
      <div className="flex items-center gap-3 mb-10">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center font-bold text-lg"
          style={{ background: "var(--brand)", color: "white" }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="white">
            <path d="M3 12L5 10M5 10L12 3L19 10M5 10V20C5 20.5523 5.44772 21 6 21H9M19 10L21 12M19 10V20C19 20.5523 18.5523 21 18 21H15M9 21C9 21 9 15 12 15C15 15 15 21 15 21M9 21H15"/>
          </svg>
        </div>
        <div>
          <div className="font-display font-bold text-lg leading-tight" style={{ color: "var(--brand)" }}>
            inProR
          </div>
          <div className="font-mono text-[9px] uppercase tracking-widest opacity-40">Painel de Gestao</div>
        </div>
      </div>

      <div className="mb-8">
        <h1 className="font-display font-bold text-2xl mb-1" style={{ color: "var(--brand)" }}>Entrar</h1>
        <p className="font-mono text-xs opacity-50">Acesso restrito para a equipe inProR.</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label className={labelCls}>E-mail</label>
          <input type="email" className={inputCls} placeholder="seu@email.com"
            value={email} onChange={e => setEmail(e.target.value)} required autoComplete="email" />
        </div>

        <div>
          <label className={labelCls}>Senha</label>
          <div className="relative">
            <input type={showPassword ? "text" : "password"} className={inputCls} placeholder="Sua senha"
              value={password} onChange={e => setPassword(e.target.value)} required autoComplete="current-password" />
            <button type="button" onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 font-mono text-[11px] opacity-40 hover:opacity-80 select-none">
              {showPassword ? "ocultar" : "ver"}
            </button>
          </div>
        </div>

        {error && (
          <p className="font-mono text-xs py-2.5 px-3 border rounded" style={{ color: "var(--bad)", borderColor: "var(--bad)" }}>
            {error}
          </p>
        )}

        <button type="submit" disabled={loading || !email || !password}
          className="w-full py-2.5 text-sm font-bold rounded transition-opacity disabled:opacity-40 font-display tracking-wide"
          style={{ background: "var(--brand)", color: "white" }}>
          {loading ? "Entrando..." : "Entrar"}
        </button>
      </form>

      <p className="font-mono text-[10px] opacity-30 mt-8 text-center">
        Acesso restrito · inProR Midia &copy; 2026
      </p>
    </div>
  );
}
