"use client";

import AuthButton from "./auth/AuthButton";

export default function Topbar() {
  return (
    <header className="sticky top-0 z-30 border-b border-accent/15 bg-bg/50 backdrop-blur-xl">
      <div className="mx-auto flex h-16 w-full max-w-[1400px] items-center gap-3 px-4 md:px-6">
        <div className="rounded-xl border border-accent/20 bg-white/5 px-3 py-1 text-sm font-semibold tracking-wide text-accent">BareUnity</div>

        <div className="flex flex-1 items-center">
          <div className="mx-auto w-full max-w-2xl">
            <div className="flex items-center gap-2 rounded-2xl border border-accent/20 bg-white/5 px-3 py-2 backdrop-blur-xl transition focus-within:border-accent/35">
              <span className="text-sm text-accent/80">⌕</span>
              <input
                className="w-full bg-transparent text-sm text-text outline-none placeholder:text-muted"
                placeholder="Search communities, stories, creators, events..."
              />
            </div>
          </div>
        </div>

        <AuthButton />
      </div>
    </header>
  );
}