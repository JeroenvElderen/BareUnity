"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { sendFriendRequestToProfile } from "@/lib/friend-requests";
import { promptAndSubmitReport } from "@/lib/reporting";
import { supabase } from "@/lib/supabase";

type UsernameActionPopupProps = {
  userId?: string | null;
  username?: string | null;
  displayName: string;
  triggerClassName?: string;
  variant?: "inline" | "button";
};

type PopupPosition = {
  left: number;
  top: number;
};

const POPUP_WIDTH = 240;
const POPUP_GAP = 8;
const VIEWPORT_PADDING = 12;

export function UsernameActionPopup({
  userId,
  username,
  displayName,
  triggerClassName,
  variant = "inline",
}: UsernameActionPopupProps) {
  const popupRef = useRef<HTMLDivElement | null>(null);
  const router = useRouter();
  const rootRef = useRef<HTMLSpanElement | null>(null);
  const [popupPosition, setPopupPosition] = useState<PopupPosition>({ left: VIEWPORT_PADDING, top: VIEWPORT_PADDING });
  const [isOpen, setIsOpen] = useState(false);
  const [viewerId, setViewerId] = useState<string | null>(null);
  const [viewerUsername, setViewerUsername] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [isReporting, setIsReporting] = useState(false);

  useEffect(() => {
    void supabase.auth.getUser().then(async ({ data }) => {
      const currentViewerId = data.user?.id ?? null;
      setViewerId(currentViewerId);

      if (!currentViewerId) {
        setViewerUsername(null);
        return;
      }

      const { data: profile } = await supabase.from("profiles").select("username").eq("id", currentViewerId).maybeSingle<{ username: string | null }>();
      setViewerUsername(profile?.username?.trim().toLowerCase() ?? null);
    });
  }, []);

  const updatePopupPosition = useCallback(() => {
    const trigger = rootRef.current;
    if (!trigger || typeof window === "undefined") return;

    const rect = trigger.getBoundingClientRect();
    const popupHeight = popupRef.current?.offsetHeight ?? 0;
    const maxLeft = Math.max(VIEWPORT_PADDING, window.innerWidth - POPUP_WIDTH - VIEWPORT_PADDING);
    const preferredLeft = rect.right - POPUP_WIDTH;
    const left = Math.min(Math.max(VIEWPORT_PADDING, preferredLeft), maxLeft);
    const opensAbove = popupHeight > 0 && rect.bottom + POPUP_GAP + popupHeight > window.innerHeight - VIEWPORT_PADDING;
    const preferredTop = opensAbove ? rect.top - POPUP_GAP - popupHeight : rect.bottom + POPUP_GAP;
    const maxTop = Math.max(VIEWPORT_PADDING, window.innerHeight - (popupHeight || 1) - VIEWPORT_PADDING);
    const top = Math.min(Math.max(VIEWPORT_PADDING, preferredTop), maxTop);

    setPopupPosition({ left, top });
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    updatePopupPosition();
    const onDocumentClick = (event: MouseEvent) => {
      const target = event.target as Node;
      if (rootRef.current?.contains(target) || popupRef.current?.contains(target)) return;
      setIsOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsOpen(false);
    };

    document.addEventListener("mousedown", onDocumentClick);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", updatePopupPosition);
    window.addEventListener("scroll", updatePopupPosition, true);

    return () => {
      document.removeEventListener("mousedown", onDocumentClick);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", updatePopupPosition);
      window.removeEventListener("scroll", updatePopupPosition, true);
    };
  }, [isOpen, updatePopupPosition]);

  useEffect(() => {
    if (!isOpen) return;
    updatePopupPosition();
  }, [isOpen, status, updatePopupPosition]);

  const isSelf = useMemo(() => {
    if (userId && viewerId && userId === viewerId) return true;
    if (!username || !viewerUsername) return false;
    return username.trim().toLowerCase() === viewerUsername;
  }, [userId, viewerId, username, viewerUsername]);

  const popupTargetLabel = useMemo(() => {
    if (displayName.trim().toLowerCase() !== "actions") return displayName;
    return username ? `@${username}` : "this member";
  }, [displayName, username]);

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

  const popup = isOpen ? (
    <div
      ref={popupRef}
      className="fixed z-[1000] w-[min(15rem,calc(100vw-1.5rem))] rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--card))] p-2 text-[rgb(var(--text))] shadow-2xl"
      style={{ left: popupPosition.left, top: popupPosition.top }}
      role="menu"
    >
      <p className="px-2 pb-1 text-xs text-[rgb(var(--muted))]">Actions for {popupTargetLabel}</p>
      <button
        type="button"
        className="w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-[rgb(var(--bg-soft))]"
        onClick={navigateToProfile}
        role="menuitem"
      >
        {isSelf ? "Open my profile" : "View profile"}
      </button>
      <button
        type="button"
        disabled={isSending || isSelf}
        className="mt-1 w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-[rgb(var(--bg-soft))] disabled:cursor-not-allowed disabled:opacity-60"
        onClick={() => void sendRequest()}
        role="menuitem"
      >
        {isSelf ? "Send friend request (disabled)" : isSending ? "Sending request..." : "Send friend request"}
      </button>
      {status ? <p className="mt-2 px-2 text-xs text-[rgb(var(--muted))]">{status}</p> : null}
    </div>
  ) : null;

  const reportUser = async () => {
    setIsReporting(true);
    const result = await promptAndSubmitReport({ targetType: "user", targetId: userId, label: "member" });
    if (result.message) setStatus(result.message);
    setIsReporting(false);
  };

  return (
    <span ref={rootRef} className="inline-flex items-center">
      {variant === "button" ? (
        <Button type="button" size="sm" variant="outline" className={triggerClassName} onClick={() => setIsOpen((v) => !v)} aria-expanded={isOpen}>
          {displayName}
        </Button>
      ) : (
        <button
          type="button"
          className={triggerClassName ?? "font-semibold text-[rgb(var(--text-strong))] underline-offset-2 hover:underline"}
          onClick={() => setIsOpen((v) => !v)}
          aria-expanded={isOpen}
        >
          {displayName}
        </button>
      )}

      {typeof document !== "undefined" && popup ? createPortal(popup, document.body) : null}
    </span>
  );
}