"use client";

import AuthButton from "./auth/AuthButton";

export default function Topbar() {
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-bg">
      <div className="h-14 flex items-center gap-3 px-4">
        <div className="lg:hidden font-bold">Naturist</div>

        <div className="flex-1 flex items-center">
          <div className="w-full max-w-2xl mx-auto">
            <div className="flex items-center gap-2 rounded-xl border border-border bg-pine-2 px-3 py-2 shadow-soft">
              <span className="text-muted text-sm">🔎</span>
              <input
                className="w-full bg-transparent outline-none text-sm placeholder:text-muted"
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