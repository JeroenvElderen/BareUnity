"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { CHANNEL_ADMIN_EMAIL, isChannelAdmin } from "@/lib/channel-data";

export default function OwnerChannelEditorHelp() {
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function readUser() {
      const { data } = await supabase.auth.getUser();
      if (active) setEmail(data.user?.email ?? null);
    }

    readUser();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setEmail(session?.user?.email ?? null);
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const owner = isChannelAdmin(email);

  return (
    <section className="rounded-3xl border border-accent/30 bg-card/50 p-5 text-sm text-text">
      <h2 className="mb-2 text-base font-semibold">Channel management</h2>
      {owner ? (
        <p className="text-muted">Owner mode enabled for {CHANNEL_ADMIN_EMAIL}. End users cannot create channels in this setup.</p>
      ) : (
        <p className="text-muted">
          Channels are code-managed only. Sign in as <span className="font-medium text-text">{CHANNEL_ADMIN_EMAIL}</span> to access owner mode.
        </p>
      )}
            <p className="mt-3 text-muted">Open <code>/backend</code> to create, edit, and remove channels from an admin page.</p>
      <ol className="mt-3 list-decimal space-y-1 pl-5 text-muted">
        <li>Run <code>supabase-backend-channel-admin.sql</code> once in Supabase SQL editor.</li>
        <li>Use <code>/backend</code> for day-to-day channel management.</li>
        <li>Add or edit per-channel component files in <code>src/components/channels/</code>.</li>
        <li>Map content types to components in <code>src/components/channels/ChannelContent.tsx</code>.</li>
        <li>Deploy your changes when you update frontend component code.</li>
      </ol>
    </section>
  );
}
