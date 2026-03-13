"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import SidebarMenu from "@/components/SidebarMenu";

type SettingsTab = "Account" | "Profile" | "Privacy" | "Preferences" | "Notifications" | "Email";

const tabs: SettingsTab[] = ["Account", "Profile", "Privacy", "Preferences", "Notifications", "Email"];

const tabMap: Record<string, SettingsTab> = {
  account: "Account",
  profile: "Profile",
  privacy: "Privacy",
  preferences: "Preferences",
  notifications: "Notifications",
  email: "Email",
};

const accountRows = [
  { label: "Email address", value: "" },
  { label: "Phone number", value: "" },
  { label: "Password", value: "" },
  { label: "Gender", value: "Man" },
  { label: "Location customization", value: "Use approximate location (based on IP)" },
];

export default function SettingsPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const initialTab = tabMap[(searchParams.get("tab") ?? "").toLowerCase()] ?? "Account";
  const [activeTab, setActiveTab] = useState<SettingsTab>(initialTab);

  function selectTab(tab: SettingsTab) {
    setActiveTab(tab);
    router.replace(`/settings?tab=${tab.toLowerCase()}`);
  }
  
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_0%_0%,rgba(124,92,255,0.2),transparent_35%),radial-gradient(circle_at_100%_10%,rgba(45,212,191,0.12),transparent_25%),#0a0b10] p-3 text-[#eef2ff] sm:p-6">
      <div className="mx-auto grid min-h-[calc(100vh-1.5rem)] w-full max-w-none grid-cols-1 overflow-hidden rounded-[26px] border border-[#242941] bg-gradient-to-b from-white/[0.02] to-white/[0] shadow-[0_20px_80px_rgba(0,0,0,0.45)] sm:min-h-[calc(100vh-3rem)] lg:grid-cols-[250px_1fr]">
        <div className="border-b border-[#242941] p-3 lg:border-b-0 lg:border-r lg:p-4">
          <SidebarMenu />
        </div>

        <section className="p-6">
          <h1 className="mb-4 text-5xl font-bold">Settings</h1>
          <div className="mb-6 flex flex-wrap gap-5 border-b border-[#2a3151] pb-4">
            {tabs.map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => selectTab(tab)}
                className={`text-sm ${activeTab === tab ? "font-semibold text-white" : "text-[#8e97b8]"}`}
              >
                {tab}
              </button>
            ))}
          </div>

          {activeTab === "Account" ? (
            <div className="space-y-10">
              <div>
                <h2 className="mb-5 text-4xl font-semibold">General</h2>
                <div className="space-y-2">
                  {accountRows.map((row) => (
                    <button key={row.label} type="button" className="flex w-full items-center justify-between rounded-xl px-3 py-3 text-left transition hover:bg-sand/10">
                      <span className="text-lg">{row.label}</span>
                      <span className="text-lg text-text/70">{row.value || "›"}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-sand/15 bg-card/35 p-5 text-sm text-text/75">{activeTab} settings will be added here next.</div>
          )}
        </section>
      </div>
    </main>
  );
}