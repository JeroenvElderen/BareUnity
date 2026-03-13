"use client";

import { useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";
import Topbar from "@/components/Topbar";
import { supabase } from "@/lib/supabase";

type SettingsTab = "Account" | "Profile" | "Privacy" | "Preferences" | "Notifications" | "Email";

const tabs: SettingsTab[] = ["Account", "Profile", "Privacy", "Preferences", "Notifications", "Email"];

const accountRows = [
  { label: "Email address", value: "" },
  { label: "Phone number", value: "" },
  { label: "Password", value: "" },
  { label: "Gender", value: "Man" },
  { label: "Location customization", value: "Use approximate location (based on IP)" },
];

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<SettingsTab>("Account");
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user));

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  const accountEmail = useMemo(() => user?.email ?? "", [user]);

  return (
    <div className="min-h-screen text-text">
      <Topbar />
      <main className="px-4 py-6 md:px-6">
        <section className="mx-auto w-full max-w-5xl rounded-3xl border border-accent/20 bg-card/55 p-6 md:p-8">
          <h1 className="mb-6 text-3xl font-semibold text-text">Settings</h1>

            <div className="mb-6 flex flex-wrap gap-6 border-b border-sand/20 pb-3">
              {tabs.map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setActiveTab(tab)}
                  className={`text-sm transition ${activeTab === tab ? "font-semibold text-text" : "text-text/65 hover:text-text"}`}
                >
                  {tab}
                </button>
              ))}
            </div>

            {activeTab === "Account" ? (
              <div className="space-y-10">
                <div>
                  <h2 className="mb-5 text-2xl font-semibold">General</h2>
                  <div className="space-y-2">
                    {accountRows.map((row) => (
                      <button
                        key={row.label}
                        type="button"
                        className="flex w-full items-center justify-between rounded-xl px-3 py-3 text-left transition hover:bg-sand/10"
                      >
                        <span className="text-sm text-text">{row.label}</span>
                        <span className="flex items-center gap-4 text-sm text-text/80">
                          {row.label === "Email address" ? accountEmail : row.value}
                          <span className="text-xl leading-none text-text/60">›</span>
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <h2 className="mb-4 text-2xl font-semibold">Account authorization</h2>
                  <div className="space-y-4">
                    {[
                      { title: "Google", body: "Connect to log in with your Google account" },
                      { title: "Apple", body: "Connect to log in with your Apple account" },
                    ].map((item) => (
                      <div key={item.title} className="flex items-center justify-between rounded-xl px-3 py-3 hover:bg-sand/10">
                        <span>
                          <span className="block text-sm font-medium">{item.title}</span>
                          <span className="block text-xs text-text/60">{item.body}</span>
                        </span>
                        <button type="button" className="rounded-full bg-sand/20 px-4 py-2 text-sm font-semibold text-text transition hover:bg-sand/30">
                          Connect
                        </button>
                      </div>
                    ))}
                    <div className="flex items-center justify-between rounded-xl px-3 py-3 hover:bg-sand/10">
                      <span className="text-sm font-medium">Two-factor authentication</span>
                      <span className="h-8 w-14 rounded-full bg-sand/25 p-1">
                        <span className="block h-6 w-6 rounded-full bg-text" />
                      </span>
                    </div>
                  </div>
                </div>

                <div>
                  <h2 className="mb-4 text-2xl font-semibold">Apps</h2>
                  <button type="button" className="flex w-full items-center justify-between rounded-xl px-3 py-3 text-left transition hover:bg-sand/10">
                    <span className="text-sm">App settings</span>
                    <span className="text-xl leading-none text-text/60">›</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border border-sand/15 bg-card/35 p-5 text-sm text-text/75">
                {activeTab} settings will be added here next.
              </div>
            )}
          </section>
      </main>
    </div>
  );
}