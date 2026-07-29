import { ReactNode } from "react";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen flex" style={{ background: "var(--paper)" }}>
      {/* Left panel - brand */}
      <div className="hidden lg:flex w-1/2 flex-col justify-between p-12"
        style={{ background: "var(--brand)", color: "white" }}>
        <div className="flex items-center gap-4">
          <img src="/logo-inpror-branca.png" alt="" aria-hidden="true" width={56} height={56}
            className="w-14 h-14 object-contain" />
          <div>
            <div className="font-display font-bold text-4xl" style={{ color: "white" }}>inProR</div>
            <div className="font-mono text-sm opacity-50 uppercase tracking-widest">Midia</div>
          </div>
        </div>
        <div>
          <p className="font-display text-2xl font-bold leading-snug mb-4" style={{ color: "white" }}>
            Gestao de marketing para restaurantes que vendem pelo delivery.
          </p>
          <p className="font-mono text-xs opacity-40">
            Dashboard · Delivery · Reputacao · Trafego Pago
          </p>
        </div>
        <div className="font-mono text-[10px] opacity-30">
          inProR Midia &copy; 2026
        </div>
      </div>

      {/* Right panel - form */}
      <div className="flex-1 flex items-center justify-center p-8">
        {children}
      </div>
    </div>
  );
}
