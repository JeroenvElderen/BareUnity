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
    <div className="min-h-screen bg-bg text-text">
      <Topbar />
      <div className="flex">
        <Sidebar />

        <main className="flex-1 px-6 py-6">
          <section className="rounded-2xl border border-orange-300/25 bg-[#1a0d0b]/75 p-6">
            <p className="text-xs uppercase tracking-[0.2em] text-orange-200/70">Brand mode</p>
            <h1 className="mt-2 text-3xl font-bold text-orange-50">BareUnity Channel Workspace</h1>
            <p className="mt-2 max-w-3xl text-sm text-orange-100/85">
              Server and workspace creation is disabled. BareUnity runs one shared channel workspace with managed rules, flairs, and automated moderation.
            </p>

            {primaryChannelWorkspace ? (
              <div className="mt-6 grid gap-4 lg:grid-cols-[1.2fr_1fr]">
                <Link
                  href={`/channels/${primaryChannelWorkspace.id}`}
                  className="rounded-2xl border border-orange-300/25 bg-black/25 p-4 transition hover:border-orange-200/60"
                >
                  <div
                    className="h-28 rounded-xl bg-cover bg-center"
                    style={primaryChannelWorkspace.bannerUrl ? { backgroundImage: `url(${primaryChannelWorkspace.bannerUrl})` } : { background: `linear-gradient(90deg, ${primaryChannelWorkspace.theme.primary}, ${primaryChannelWorkspace.theme.secondary})` }}
                  />
                  <h2 className="mt-4 text-2xl font-bold text-orange-50">{primaryChannelWorkspace.name}</h2>
                  <p className="mt-1 text-sm text-orange-100/80">{primaryChannelWorkspace.description}</p>
                  <div className="mt-4 inline-flex rounded-full bg-orange-500 px-4 py-2 text-sm font-semibold text-white">Open channels</div>
                </Link>

                <div className="rounded-2xl border border-orange-300/25 bg-black/20 p-4">
                  <h3 className="text-lg font-semibold text-orange-50">How this works</h3>
                  <ul className="mt-3 space-y-2 text-sm text-orange-100/85">
                    <li>• One shared channel workspace for all members</li>
                    <li>• Team-managed rules, channels, and moderation</li>
                    <li>• Owner controls for flairs and automod stay available</li>
                    <li>• No user-created servers or workspaces</li>
                  </ul>
                </div>
              </div>
            ) : (
              <div className="mt-6 rounded-xl border border-dashed border-orange-300/30 p-6 text-sm text-orange-100/80">
                No channel workspace is configured yet.
              </div>
            )}
          </section>
        </main>
      </div>
    </div>
  );
}
