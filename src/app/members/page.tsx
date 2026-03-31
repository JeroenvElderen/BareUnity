"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";

import { AppSidebar } from "@/components/sidebar/sidebar";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { loadCachedThenRefresh } from "@/lib/client-cache";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import layoutStyles from "../page.module.css";

type MemberListItem = {
  id: string;
  username: string;
  display_name: string | null;
  bio: string | null;
  avatar_url: string | null;
  location: string | null;
};

type MembersResponse = {
  members: MemberListItem[];
};

const EMPTY_MEMBERS: MemberListItem[] = [];
const MEMBERS_CACHE_MAX_AGE_MS = 1000 * 60 * 2;

function getInitials(value: string) {
  const words = value.trim().split(/\s+/).filter(Boolean);
  return words.slice(0, 2).map((word) => word[0]?.toUpperCase() ?? "").join("") || "BU";
}

function resolveMediaUrl(rawUrl: string | null): string | null {
  if (!rawUrl) return null;
  const value = rawUrl.trim();
  if (!value) return null;

  if (value.startsWith("http")) return value;

  const normalizedPath = value.startsWith("posts/") ? value : `posts/${value}`;
  const { data } = supabase.storage.from("media").getPublicUrl(normalizedPath);
  return data.publicUrl;
}

async function getMembers(accessToken: string): Promise<MemberListItem[]> {
  const response = await fetch("/api/members", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Members request failed (${response.status})`);
  }

  const payload = (await response.json()) as MembersResponse;
  return payload.members ?? [];
}

export default function MembersDirectoryPage() {
  const [members, setMembers] = useState<MemberListItem[]>(EMPTY_MEMBERS);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadMembers = useCallback(async (sessionUser: User | null, accessToken: string | null) => {
    if (!isSupabaseConfigured || !sessionUser || !accessToken) {
      setMembers(EMPTY_MEMBERS);
      setIsLoading(false);
      setLoadError("Members must be signed in to view the member directory.");
      return;
    }

    setIsLoading(true);
    setLoadError(null);

    try {
      const data = await loadCachedThenRefresh<MemberListItem[]>({
        key: `members-directory:${sessionUser.id}:v1`,
        maxAgeMs: MEMBERS_CACHE_MAX_AGE_MS,
        onCachedData: (cached) => {
          setMembers(cached);
          setIsLoading(false);
        },
        fetchFresh: () => getMembers(accessToken),
      });
      setMembers(data);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to load members.";
      setLoadError(message);
      setMembers(EMPTY_MEMBERS);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    let isMounted = true;

    void supabase.auth.getSession().then(({ data }) => {
      if (!isMounted) return;
      void loadMembers(data.session?.user ?? null, data.session?.access_token ?? null);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      void loadMembers(session?.user ?? null, session?.access_token ?? null);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [loadMembers]);

  const memberCount = useMemo(() => members.length.toLocaleString(), [members.length]);

  return (
    <main className={`${layoutStyles.main} w-full max-w-full`}>
      <AppSidebar />

      <section className="min-w-0 w-full flex-1 overflow-hidden bg-[rgb(var(--bg-deep))/0.55]">
        <Card className="min-h-full w-full max-w-full overflow-hidden rounded-none border-x-0 border-y-0 border-[rgb(var(--border))] bg-[rgb(var(--card))/0.98] shadow-none">
          <CardContent className="space-y-4 p-3 md:p-5 min-w-0 overflow-hidden">
            <section className="rounded-2xl border border-[rgb(var(--border))] bg-white p-3.5 md:p-4 min-w-0">
              <h1 className="break-words text-3xl font-black tracking-tight text-[rgb(var(--text-strong))] md:text-4xl">
                Members
              </h1>
              <p className="mt-1 break-words text-base text-[rgb(var(--muted))] md:text-lg">
                Discover people in your circle and tap a card to open their profile.
              </p>
              <div className="mt-2.5 flex flex-wrap gap-2">
                <Badge className="bg-[rgb(var(--accent-soft))] text-[rgb(var(--text-strong))]">
                  {memberCount} members
                </Badge>
              </div>
            </section>

            {loadError ? (
              <section className="rounded-2xl border border-[rgb(var(--border))] bg-white p-4 text-sm text-[rgb(var(--muted))]">
                {loadError}
              </section>
            ) : null}

            <section className="rounded-2xl border border-[rgb(var(--border))] bg-white p-3.5 md:p-4 min-w-0">
              {isLoading ? (
                <p className="text-sm text-[rgb(var(--muted))]">Loading members…</p>
              ) : members.length === 0 ? (
                <p className="text-sm text-[rgb(var(--muted))]">No members found yet.</p>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {members.map((member) => {
                    const displayName = member.display_name?.trim() || member.username;
                    const fallback = getInitials(displayName);
                    const bio = member.bio?.trim() || "No bio yet.";

                    return (
                      <Link
                        key={member.id}
                        href={`/members/${encodeURIComponent(member.username)}`}
                        className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--bg-soft))] p-3 transition-colors hover:bg-white"
                      >
                        <div className="flex items-center gap-3">
                          <Avatar
                            src={resolveMediaUrl(member.avatar_url ?? null) ?? undefined}
                            alt={displayName}
                            fallback={fallback}
                            className="h-12 w-12 border border-[rgb(var(--border))]"
                          />
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-[rgb(var(--text-strong))]">{displayName}</p>
                            <p className="truncate text-xs text-[rgb(var(--muted))]">@{member.username}</p>
                          </div>
                        </div>

                        <p className="mt-2 line-clamp-2 text-xs text-[rgb(var(--muted))]">{bio}</p>

                        {member.location ? (
                          <p className="mt-2 text-[11px] font-medium uppercase tracking-[0.08em] text-[rgb(var(--muted))]">
                            {member.location}
                          </p>
                        ) : null}
                      </Link>
                    );
                  })}
                </div>
              )}
            </section>
          </CardContent>
        </Card>
      </section>
    </main>
  );
}