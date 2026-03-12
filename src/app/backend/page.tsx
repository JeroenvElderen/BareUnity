"use client";

import { useEffect, useState } from "react";
import Topbar from "@/components/Topbar";
import { CHANNEL_ADMIN_EMAIL, isChannelAdmin } from "@/lib/channel-data";
import { supabase } from "@/lib/supabase";

type EditableChannel = {
  id: string;
  name: string;
  slug: string;
  icon_url: string | null;
  content_type: "forum" | "map" | "feed" | "events" | "custom";
  component_key: "general" | "retreats" | "mindful" | "map" | "custom";
  position: number;
  is_enabled: boolean;
};

type ChannelApiRow = {
  id: string;
  name: string;
  slug: string;
  icon_url: string | null;
  content_type: EditableChannel["content_type"];
  content_config?: { component_key?: EditableChannel["component_key"] } | null;
  position: number;
  is_enabled: boolean;
};

const EMPTY_FORM = {
  name: "",
  slug: "",
  icon_url: "",
  content_type: "custom" as const,
  component_key: "general" as const,
  position: 0,
  is_enabled: true,
};

export default function BackendPage() {
  const [owner, setOwner] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [channels, setChannels] = useState<EditableChannel[]>([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [status, setStatus] = useState<string>("");

  async function loadChannels(currentToken: string) {
    const res = await fetch("/api/admin/channels", { headers: { Authorization: `Bearer ${currentToken}` } });
    const body = await res.json();
    if (!res.ok) {
      setStatus(body.error ?? "Could not load channels");
      return;
    }

    const mapped = (body.channels ?? []).map((channel: ChannelApiRow) => ({
      id: channel.id,
      name: channel.name,
      slug: channel.slug,
      icon_url: channel.icon_url,
      content_type: channel.content_type,
      component_key: channel.content_config?.component_key ?? "general",
      position: channel.position ?? 0,
      is_enabled: channel.is_enabled ?? true,
    })) as EditableChannel[];

    setChannels(mapped);
  }

  useEffect(() => {
    let active = true;

    async function readSession() {
      const [{ data: userData }, { data: sessionData }] = await Promise.all([supabase.auth.getUser(), supabase.auth.getSession()]);
      if (!active) return;

      const isOwner = isChannelAdmin(userData.user?.email);
      const accessToken = sessionData.session?.access_token ?? null;
      setOwner(isOwner);
      setToken(accessToken);
      if (isOwner && accessToken) {
        await loadChannels(accessToken);
      }
    }

    readSession();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      const isOwner = isChannelAdmin(session?.user?.email);
      const accessToken = session?.access_token ?? null;
      setOwner(isOwner);
      setToken(accessToken);
      if (isOwner && accessToken) {
        void loadChannels(accessToken);
      }
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  async function createChannel() {
    if (!token) return;
    setStatus("Saving...");

    const res = await fetch("/api/admin/channels", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ ...form, icon_url: form.icon_url || null }),
    });

    const body = await res.json();
    if (!res.ok) {
      setStatus(body.error ?? "Failed to create channel");
      return;
    }

    setForm(EMPTY_FORM);
    setStatus("Channel created");
    await loadChannels(token);
  }

  async function saveChannel(channel: EditableChannel) {
    if (!token) return;
    const res = await fetch("/api/admin/channels", {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(channel),
    });

    const body = await res.json();
    setStatus(res.ok ? "Channel updated" : body.error ?? "Failed to update channel");
    if (res.ok) await loadChannels(token);
  }

  async function deleteChannel(id: string) {
    if (!token) return;
    const res = await fetch("/api/admin/channels", {
      method: "DELETE",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ id }),
    });

    const body = await res.json();
    setStatus(res.ok ? "Channel removed" : body.error ?? "Failed to remove channel");
    if (res.ok) await loadChannels(token);
  }

  return (
    <div className="min-h-screen text-text">
      <Topbar />
      <main className="mx-auto w-full max-w-5xl px-4 py-6 md:px-6">
        <section className="rounded-3xl border border-accent/20 bg-card/50 p-6">
          <h1 className="text-xl font-semibold">Backend · Channel Manager</h1>
          {!owner ? (
            <p className="mt-2 text-sm text-muted">Only {CHANNEL_ADMIN_EMAIL} can access this page.</p>
          ) : (
            <p className="mt-2 text-sm text-muted">Manage channels here. Component key controls which channel component renders in the channel page.</p>
          )}
        </section>

        {owner && (
          <>
            <section className="mt-4 rounded-3xl border border-accent/20 bg-card/40 p-6">
              <h2 className="mb-3 text-base font-semibold">Create channel</h2>
              <div className="grid gap-3 md:grid-cols-2">
                <input className="glass-input rounded-xl px-3 py-2" placeholder="Name" value={form.name} onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))} />
                <input className="glass-input rounded-xl px-3 py-2" placeholder="Slug" value={form.slug} onChange={(e) => setForm((s) => ({ ...s, slug: e.target.value }))} />
                <input className="glass-input rounded-xl px-3 py-2" placeholder="Icon URL (optional)" value={form.icon_url} onChange={(e) => setForm((s) => ({ ...s, icon_url: e.target.value }))} />
                <input className="glass-input rounded-xl px-3 py-2" type="number" placeholder="Position" value={form.position} onChange={(e) => setForm((s) => ({ ...s, position: Number(e.target.value) }))} />
                <select className="glass-input rounded-xl px-3 py-2" value={form.content_type} onChange={(e) => setForm((s) => ({ ...s, content_type: e.target.value as EditableChannel["content_type"] }))}>
                  <option value="custom">custom</option>
                  <option value="forum">forum</option>
                  <option value="feed">feed</option>
                  <option value="events">events</option>
                  <option value="map">map</option>
                </select>
                <select className="glass-input rounded-xl px-3 py-2" value={form.component_key} onChange={(e) => setForm((s) => ({ ...s, component_key: e.target.value as EditableChannel["component_key"] }))}>
                  <option value="general">general</option>
                  <option value="retreats">retreats</option>
                  <option value="mindful">mindful</option>
                  <option value="map">map</option>
                  <option value="custom">custom</option>
                </select>
                <label className="flex items-center gap-2 text-sm text-muted"><input type="checkbox" checked={form.is_enabled} onChange={(e) => setForm((s) => ({ ...s, is_enabled: e.target.checked }))} /> Enabled</label>
              </div>
              <button type="button" onClick={createChannel} className="glass-pill mt-4 rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-accent">Create</button>
            </section>

            <section className="mt-4 space-y-3">
              {channels.map((channel) => (
                <div key={channel.id} className="rounded-2xl border border-accent/20 bg-card/35 p-4">
                  <div className="grid gap-2 md:grid-cols-3">
                    <input className="glass-input rounded-xl px-3 py-2" value={channel.name} onChange={(e) => setChannels((rows) => rows.map((row) => row.id === channel.id ? { ...row, name: e.target.value } : row))} />
                    <input className="glass-input rounded-xl px-3 py-2" value={channel.slug} onChange={(e) => setChannels((rows) => rows.map((row) => row.id === channel.id ? { ...row, slug: e.target.value } : row))} />
                    <input className="glass-input rounded-xl px-3 py-2" value={channel.icon_url ?? ""} placeholder="Icon URL" onChange={(e) => setChannels((rows) => rows.map((row) => row.id === channel.id ? { ...row, icon_url: e.target.value || null } : row))} />
                    <input className="glass-input rounded-xl px-3 py-2" type="number" value={channel.position} onChange={(e) => setChannels((rows) => rows.map((row) => row.id === channel.id ? { ...row, position: Number(e.target.value) } : row))} />
                    <select className="glass-input rounded-xl px-3 py-2" value={channel.content_type} onChange={(e) => setChannels((rows) => rows.map((row) => row.id === channel.id ? { ...row, content_type: e.target.value as EditableChannel["content_type"] } : row))}>
                      <option value="custom">custom</option>
                      <option value="forum">forum</option>
                      <option value="feed">feed</option>
                      <option value="events">events</option>
                      <option value="map">map</option>
                    </select>
                    <select className="glass-input rounded-xl px-3 py-2" value={channel.component_key} onChange={(e) => setChannels((rows) => rows.map((row) => row.id === channel.id ? { ...row, component_key: e.target.value as EditableChannel["component_key"] } : row))}>
                      <option value="general">general</option>
                      <option value="retreats">retreats</option>
                      <option value="mindful">mindful</option>
                      <option value="map">map</option>
                      <option value="custom">custom</option>
                    </select>
                    <label className="flex items-center gap-2 text-sm text-muted"><input type="checkbox" checked={channel.is_enabled} onChange={(e) => setChannels((rows) => rows.map((row) => row.id === channel.id ? { ...row, is_enabled: e.target.checked } : row))} /> Enabled</label>
                  </div>
                  <div className="mt-3 flex gap-2">
                    <button type="button" onClick={() => saveChannel(channel)} className="glass-pill rounded-full px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-accent">Save</button>
                    <button type="button" onClick={() => deleteChannel(channel.id)} className="rounded-full border border-red-400/40 px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-red-300">Delete</button>
                  </div>
                </div>
              ))}
            </section>
          </>
        )}

        {status && <p className="mt-4 text-sm text-muted">{status}</p>}
      </main>
    </div>
  );
}
