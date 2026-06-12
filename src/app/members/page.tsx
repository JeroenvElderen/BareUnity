"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";

import { AppSidebar } from "@/components/sidebar/sidebar";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { loadCachedThenRefresh } from "@/lib/client-cache";
import { takePrefetchedRouteData } from "@/lib/prefetched-route-data";
import { MEMBERS_REALTIME_TABLES, subscribeToTables } from "@/lib/realtime";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import layoutStyles from "../page.module.css";

type MemberListItem = {
  id: string;
  username: string;
  display_name: string | null;
  bio: string | null;
  avatar_url: string | null;
  location: string | null;
  is_verified?: boolean;
};

type MembersResponse = {
  members: MemberListItem[];
};

const EMPTY_MEMBERS: MemberListItem[] = [];
const MEMBERS_CACHE_MAX_AGE_MS = 1000 * 60 * 2;

type MemberCardGroup = {
  title: string;
  description: string;
  emptyMessage: string;
  members: MemberListItem[];
};

function getInitials(value: string) {
  const words = value.trim().split(/\s+/).filter(Boolean);
  return words.slice(0, 2).map((word) => word[0]?.toUpperCase() ?? "").join("") || "BU";
}

function MemberCard({ member }: { member: MemberListItem }) {
  const displayName = member.display_name?.trim() || member.username;
  const fallback = getInitials(displayName);
  const bio = member.bio?.trim() || "No bio yet.";

  return (
    <Link
      href={`/members/${encodeURIComponent(member.username)}`}
      className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--bg-soft))] p-3 transition-colors hover:bg-[rgb(var(--card))]"
    >
      <div className="flex items-center gap-3">
        <Avatar
          src={member.avatar_url ?? undefined}
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
}

function MemberCardSection({ description, emptyMessage, members, title }: MemberCardGroup) {
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-lg font-bold text-[rgb(var(--text-strong))]">{title}</h2>
          <p className="text-sm text-[rgb(var(--muted))]">{description}</p>
        </div>
        <Badge className="bg-[rgb(var(--accent-soft))] text-[rgb(var(--text-strong))]">
          {members.length.toLocaleString()}
        </Badge>
      </div>

      {members.length === 0 ? (
        <p className="rounded-xl border border-dashed border-[rgb(var(--border))] p-3 text-sm text-[rgb(var(--muted))]">
          {emptyMessage}
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {members.map((member) => (
            <MemberCard key={member.id} member={member} />
          ))}
        </div>
      )}
    </section>
  );
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
  const [prefetchedMembers] = useState<MemberListItem[] | null>(() => takePrefetchedRouteData<MemberListItem[]>("members-directory"));
  const [members, setMembers] = useState<MemberListItem[]>(() => prefetchedMembers ?? EMPTY_MEMBERS);
  const membersCountRef = useRef(members.length);
  const [isLoading, setIsLoading] = useState(() => prefetchedMembers === null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sessionContext, setSessionContext] = useState<{ user: User | null; accessToken: string | null }>({
    user: null,
    accessToken: null,
  });

  useEffect(() => {
    membersCountRef.current = members.length;
  }, [members.length]);

  const loadMembers = useCallback(async (sessionUser: User | null, accessToken: string | null) => {
    setSessionContext({ user: sessionUser, accessToken });

    if (!isSupabaseConfigured || !sessionUser || !accessToken) {
      setMembers(EMPTY_MEMBERS);
      setIsLoading(false);
      setLoadError("Members must be signed in to view the member directory.");
      return;
    }

    setIsLoading(membersCountRef.current === 0);
    setLoadError(null);

    try {
      const data = await loadCachedThenRefresh<MemberListItem[]>({
        key: `members-directory:${sessionUser.id}:v3`,
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

  useEffect(() => {
    if (!sessionContext.user || !sessionContext.accessToken) return;

    return subscribeToTables({
      channelName: `members-live-updates:${sessionContext.user.id}`,
      client: supabase,
      tables: MEMBERS_REALTIME_TABLES,
      onChange: () => {
        void loadMembers(sessionContext.user, sessionContext.accessToken);
      },
      debounceMs: 450,
    });
  }, [loadMembers, sessionContext.accessToken, sessionContext.user]);

  const memberGroups = useMemo<MemberCardGroup[]>(() => {
    const verifiedMembers = members.filter((member) => member.is_verified === true);
    const guestMembers = members.filter((member) => member.is_verified !== true);

    return [
      {
        title: "Verified cards",
        description: "Members who have completed BareUnity verification.",
        emptyMessage: "No verified members found yet.",
        members: verifiedMembers,
      },
      {
        title: "Guest cards",
        description: "Members still browsing with guest or pending access.",
        emptyMessage: "No guest cards found yet.",
        members: guestMembers,
      },
    ];
  }, [members]);
  const memberCount = useMemo(() => members.length.toLocaleString(), [members.length]);

  return (
    <main className={`${layoutStyles.main} w-full max-w-full`}>
      <AppSidebar />

      <section className="min-w-0 w-full flex-1 overflow-hidden bg-[rgb(var(--bg-deep))/0.55]">
        <Card className="min-h-full w-full max-w-full overflow-hidden rounded-none border-x-0 border-y-0 border-[rgb(var(--border))] bg-[rgb(var(--card))/0.98] shadow-none">
          <CardContent className="space-y-4 p-3 md:p-5 min-w-0 overflow-hidden">
            <section className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--card))] p-3.5 md:p-4 min-w-0">
              <h1 className="break-words text-3xl font-black tracking-tight text-[rgb(var(--text-strong))] md:text-4xl">
                Members
              </h1>
              <p className="mt-1 break-words text-base text-[rgb(var(--muted))] md:text-lg">
                Browse verified BareUnity cards first, with guest cards grouped below.
              </p>
              <div className="mt-2.5 flex flex-wrap gap-2">
                <Badge className="bg-[rgb(var(--accent-soft))] text-[rgb(var(--text-strong))]">
                  {memberCount} members
                </Badge>
              </div>
            </section>

            {loadError ? (
              <section className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--card))] p-4 text-sm text-[rgb(var(--muted))]">
                {loadError}
              </section>
            ) : null}

            <section className="space-y-5 rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--card))] p-3.5 md:p-4 min-w-0">
              {isLoading ? (
                <p className="text-sm text-[rgb(var(--muted))]">Loading members…</p>
              ) : members.length === 0 ? (
                <p className="text-sm text-[rgb(var(--muted))]">No members found yet.</p>
              ) : (
                memberGroups.map((group) => (
                  <MemberCardSection key={group.title} {...group} />
                ))
              )}
            </section>
          </CardContent>
        </Card>
      </section>
    </main>
  );
}
