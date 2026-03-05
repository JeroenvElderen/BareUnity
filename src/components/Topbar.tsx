"use client";

import AuthButton from "./auth/AuthButton";

export default function Topbar() {
  return (
    <header className="sticky top-0 z-30 border-b border-pine/20 bg-sand/95 backdrop-blur">
      <div className="flex h-14 items-center gap-3 px-4">
        <div className="font-bold text-pine lg:hidden">Naturist</div>

        <div className="flex flex-1 items-center">
          <div className="mx-auto w-full max-w-2xl">
            <div className="flex items-center gap-2 rounded-xl border border-pine/20 bg-sand-2/40 px-3 py-2 shadow-soft">
              <span className="text-sm text-pine/60">🔎</span>
              <input
                className="w-full bg-transparent text-sm text-pine outline-none placeholder:text-pine/50"
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