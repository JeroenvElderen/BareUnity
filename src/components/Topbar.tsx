"use client";

import AuthButton from "./auth/AuthButton";

export default function Topbar() {
  return (
    <header className="sticky top-0 z-30 border-b border-sand/15 bg-pine-2/70 backdrop-blur-xl">
      <div className="flex h-16 w-full items-center gap-3 px-4 md:px-6">
        <div className="rounded-xl border border-sand/30 bg-sand/10 px-2 py-1 font-bold text-sand lg:hidden">Naturist</div>

        <div className="flex flex-1 items-center">
          <div className="mx-auto w-full max-w-2xl">
            <div className="flex items-center gap-2 rounded-2xl border border-sand/20 bg-card/80 px-3 py-2 shadow-[0_10px_30px_-22px_rgba(0,0,0,0.85)] backdrop-blur">
              <span className="text-sm text-sand/80">🔎</span>
              <input
                className="w-full bg-transparent text-sm text-text outline-none placeholder:text-text/55"
                placeholder="Find anything (communities, posts, events)…"
              />
            </div>
          </div>
        </div>

        <AuthButton />
      </div>
    </header>
  );
}