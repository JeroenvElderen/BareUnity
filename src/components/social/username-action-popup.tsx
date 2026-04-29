"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { sendFriendRequestToProfile } from "@/lib/friend-requests";
import { supabase } from "@/lib/supabase";

type UsernameActionPopupProps = {
  userId?: string | null;
  username?: string | null;
  displayName: string;
  triggerClassName?: string;
  variant?: "inline" | "button";
};

export function UsernameActionPopup({
  userId,
  username,
  displayName,
  triggerClassName,
  variant = "inline",
}: UsernameActionPopupProps) {
  const router = useRouter();
  const rootRef = useRef<HTMLSpanElement | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [viewerId, setViewerId] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);

  useEffect(() => {
    void supabase.auth.getUser().then(({ data }) => {
      setViewerId(data.user?.id ?? null);
    });
  }, []);

  useEffect(() => {
    const onDocumentClick = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", onDocumentClick);
    return () => document.removeEventListener("mousedown", onDocumentClick);
  }, []);

  const isSelf = useMemo(() => Boolean(userId && viewerId && userId === viewerId), [userId, viewerId]);

  const navigateToProfile = () => {
    if (isSelf) {
      router.push("/profile");
      setIsOpen(false);
      return;
    }

    if (username) {
      router.push(`/members/${encodeURIComponent(username)}`);
      setIsOpen(false);
    }
  };

  const sendRequest = async () => {
    setIsSending(true);
    const result = await sendFriendRequestToProfile({ id: userId, username });
    setStatus(result.message);
    setIsSending(false);
  };

  return (
    <span ref={rootRef} className="relative inline-flex items-center">
      {variant === "button" ? (
        <Button type="button" size="sm" variant="outline" className={triggerClassName} onClick={() => setIsOpen((v) => !v)}>
          {displayName}
        </Button>
      ) : (
        <button
          type="button"
          className={triggerClassName ?? "font-semibold text-[rgb(var(--text-strong))] underline-offset-2 hover:underline"}
          onClick={() => setIsOpen((v) => !v)}
        >
          {displayName}
        </button>
      )}

      {isOpen ? (
        <div className="absolute left-0 top-[calc(100%+0.4rem)] z-50 min-w-52 rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--card))] p-2 shadow-lg">
          <p className="px-2 pb-1 text-xs text-[rgb(var(--muted))]">Actions for {displayName}</p>
          <button
            type="button"
            className="w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-[rgb(var(--bg-soft))]"
            onClick={navigateToProfile}
          >
            {isSelf ? "Open my profile" : "View profile"}
          </button>
          {!isSelf ? (
            <button
              type="button"
              disabled={isSending}
              className="mt-1 w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-[rgb(var(--bg-soft))] disabled:opacity-60"
              onClick={() => void sendRequest()}
            >
              {isSending ? "Sending request..." : "Send friend request"}
            </button>
          ) : null}
          {status ? <p className="mt-2 px-2 text-xs text-[rgb(var(--muted))]">{status}</p> : null}
        </div>
      ) : null}
    </span>
  );
}