"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import SidebarMenu from "@/components/SidebarMenu";
import { supabase } from "@/lib/supabase";
import ThemeCustomizer from "@/components/ThemeCustomizer";

type SettingsTab = "Account" | "Profile" | "Privacy" | "Preferences" | "Notifications" | "Email";

type AccountProfile = {
  username: string | null;
  display_name: string | null;
};

type AccountSettings = {
  show_email: boolean | null;
};

const tabMap: Record<string, SettingsTab> = {
  account: "Account",
  profile: "Profile",
  privacy: "Privacy",
  preferences: "Preferences",
  notifications: "Notifications",
  email: "Email",
};

export default function SettingsPage() {
  const searchParams = useSearchParams();
  const activeTab = tabMap[(searchParams.get("tab") ?? "").toLowerCase()] ?? "Account";
  const [userEmail, setUserEmail] = useState<string>("");
  const [profile, setProfile] = useState<AccountProfile | null>(null);
  const [settings, setSettings] = useState<AccountSettings | null>(null);

  useEffect(() => {
    let active = true;

    async function loadAccountDetails() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!active || !user) {
        if (active) {
          setUserEmail("");
          setProfile(null);
          setSettings(null);
        }
        return;
      }

      setUserEmail(user.email ?? "");

      const [profileResult, settingsResult] = await Promise.all([
        supabase.from("profiles").select("username, display_name").eq("id", user.id).maybeSingle<AccountProfile>(),
        supabase.from("profile_settings").select("show_email").eq("user_id", user.id).maybeSingle<AccountSettings>(),
      ]);

      if (!active) return;

      if (!profileResult.error) setProfile(profileResult.data ?? null);
      if (!settingsResult.error) setSettings(settingsResult.data ?? null);
    }

    void loadAccountDetails();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      setUserEmail(session?.user?.email ?? "");
      if (!session?.user) {
        setProfile(null);
        setSettings(null);
      }
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const accountRows = useMemo(
    () => [
      { label: "Email address", value: userEmail || "Not set" },
      { label: "Username", value: profile?.username || "Not set" },
      { label: "Display name", value: profile?.display_name || "Not set" },
      {
        label: "Email visibility",
        value:
          settings?.show_email == null ? "Unknown" : settings.show_email ? "Visible on profile" : "Hidden on profile",
      },
      { label: "Password", value: "Managed via Supabase Auth" },
    ],
    [profile?.display_name, profile?.username, settings?.show_email, userEmail],
  );

  return (
    <main className="min-h-screen p-3 text-text sm:p-6">
      <div className="mx-auto grid min-h-[calc(100vh-1.5rem)] w-full max-w-none grid-cols-1 overflow-hidden rounded-[26px] border border-border/50 bg-linear-to-b from-card/20 to-transparent shadow-[0_20px_80px_rgba(0,0,0,0.45)] sm:min-h-[calc(100vh-3rem)] lg:grid-cols-[250px_1fr]">
        <div className="border-b border-border/50 p-3 lg:border-b-0 lg:border-r lg:p-4">
          <SidebarMenu />
        </div>

        <section className="p-6">
          <h1 className="mb-4 text-5xl font-bold">Settings</h1>
          <div className="mb-6 rounded-xl border border-border/40 bg-card/30 px-4 py-3 text-sm text-muted">
            Use the sidebar settings dropdown to switch tabs.
          </div>

          {activeTab === "Account" ? (
            <div className="space-y-10">
              <div>
                <h2 className="mb-5 text-4xl font-semibold">General</h2>
                <div className="space-y-2">
                  {accountRows.map((row) => (
                    <div key={row.label} className="flex w-full items-center justify-between rounded-xl px-3 py-3 text-left transition hover:bg-accent/10">
                      <span className="text-lg">{row.label}</span>
                      <span className="text-lg text-text/70">{row.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {activeTab === "Preferences" ? <ThemeCustomizer /> : null}
              <div className="rounded-2xl border border-accent/15 bg-card/35 p-5 text-sm text-text/75">{activeTab} settings will be added here next.</div>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
