"use client";

import AuthButton from "./auth/AuthButton";

export default function Topbar() {
  return (
    <header className="sticky top-0 z-30 border-b border-accent/20 bg-bg/92">
      <div className="mx-auto flex h-16 w-full max-w-[1400px] items-center gap-3 px-4 md:px-6">
        <div className="glass-pill rounded-full px-4 py-1 text-xs font-bold uppercase tracking-[0.18em] text-accent">BareUnity</div>

        <div className="flex flex-1 items-center">
          <div className="mx-auto w-full max-w-2xl">
            <div className="glass-input flex items-center gap-2 rounded-full px-4 py-2 transition focus-within:border-accent/70">
              <span className="text-sm text-accent/80">⌕</span>
              <input className="w-full bg-transparent text-sm text-text outline-none placeholder:text-muted" placeholder="Search channels, retreats, stories..." />
            </div>
          </div>
        </div>

        <AuthButton />
      </div>
    </header>
  );
}
