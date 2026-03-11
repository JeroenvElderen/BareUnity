"use client";

export const dynamic = "force-dynamic";

import { useMemo } from "react";
import Link from "next/link";
import Topbar from "@/components/Topbar";
import Sidebar from "@/components/Sidebar";
import { ChannelWorkspace, readStoredChannelWorkspaces } from "@/lib/channel-data";

export default function ChannelsPage() {
  const channelWorkspaces = useMemo<ChannelWorkspace[]>(() => readStoredChannelWorkspaces(), []);
  const primaryChannelWorkspace = channelWorkspaces[0];

  return (
    <div className="min-h-screen text-text">
      <Topbar />
      <div className="flex">
        <Sidebar />

        <main className="flex-1 px-6 py-6">
          <div className="grid gap-5 lg:grid-cols-[1.2fr_1fr]">
            <section className="space-y-4 rounded-3xl border border-accent/20 bg-card/60 p-4">
              {["sunrise-talk", "event-planning", "wellness-checkins"].map((name) => (
                <div key={name} className="rounded-2xl border border-accent/20 bg-bg/55 p-3 text-sm text-muted">
                  # {name}
                </div>
              ))}

              {primaryChannelWorkspace && (
                <Link href={`/channels/${primaryChannelWorkspace.id}`} className="inline-flex rounded-full bg-brand px-4 py-2 text-sm font-semibold text-[#2a2f22]">
                  Open {primaryChannelWorkspace.name}
                </Link>
              )}
            </section>

            <section className="rounded-3xl border border-accent/20 bg-card/55 p-4">
              <div className="h-80 rounded-2xl bg-cover bg-center" style={{ backgroundImage: "url(https://images.unsplash.com/photo-1511497584788-876760111969?q=80&w=1000&auto=format&fit=crop)" }} />
              <p className="mt-3 text-sm text-muted">Temporary location board for local nature-friendly activity zones.</p>
            </section>
          </div>
        </main>
      </div>
    </div>
  );
}
