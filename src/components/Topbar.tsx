"use client";

import AuthButton from "./auth/AuthButton";

export default function Topbar() {
  return (
    <header className="sticky top-0 z-30 border-b border-accent/20 bg-bg/80 backdrop-blur-2xl">
      <div className="mx-auto flex h-16 w-full max-w-[1400px] items-center gap-3 px-4 md:px-6">
        <div className="rounded-full border border-accent/35 bg-brand/15 px-4 py-1 text-xs font-bold uppercase tracking-[0.18em] text-accent">BareUnity</div>

        <div className="flex flex-1 items-center">
          <div className="mx-auto w-full max-w-2xl">
            <div className="flex items-center gap-2 rounded-full border border-accent/25 bg-card/70 px-4 py-2 transition focus-within:border-accent/50">
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
