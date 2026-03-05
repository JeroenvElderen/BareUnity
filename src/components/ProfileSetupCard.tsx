"use client";

import { useState } from "react";
import type { User } from "@supabase/supabase-js";

type ProfileDraft = {
  bannerUrl: string;
  bio: string;
  identityRequested: boolean;
  ageVerified: boolean;
};

const defaultDraft: ProfileDraft = {
  bannerUrl: "",
  bio: "",
  identityRequested: false,
  ageVerified: false,
};

function loadDraft(userId: string): ProfileDraft {
  if (typeof window === "undefined") return defaultDraft;

  const raw = localStorage.getItem(`profile-setup:${userId}`);
  if (!raw) return defaultDraft;

  try {
    return { ...defaultDraft, ...JSON.parse(raw) };
  } catch {
    return defaultDraft;
  }
}

export default function ProfileSetupCard({ user }: { user: User }) {
  const [draft, setDraft] = useState<ProfileDraft>(() => loadDraft(user.id));

  function saveDraft() {
    localStorage.setItem(`profile-setup:${user.id}`, JSON.stringify(draft));
  }

  return (
    <section className="rounded-xl border border-pine/20 bg-card/80 p-4 shadow-soft">
      <div className="mb-3">
        <h2 className="text-lg font-bold text-pine">Profile setup</h2>
        <p className="text-sm text-pine/70">Finish your profile with a banner, bio, and verification details.</p>
      </div>

      <div className="space-y-3">
        <div>
          <label className="text-sm font-semibold text-pine">Profile banner URL</label>
          <input
            type="url"
            value={draft.bannerUrl}
            onChange={(e) => setDraft((current) => ({ ...current, bannerUrl: e.target.value }))}
            placeholder="https://example.com/banner.jpg"
            className="mt-1 w-full rounded-lg border border-pine/25 bg-sand/75 px-3 py-2 text-sm text-pine outline-none placeholder:text-pine/50 focus:ring-2 focus:ring-pine/30"
          />
        </div>

        {draft.bannerUrl && (
          <div
            className="h-24 rounded-lg border border-pine/20 bg-cover bg-center"
            style={{ backgroundImage: `url(${draft.bannerUrl})` }}
          />
        )}

        <div>
          <label className="text-sm font-semibold text-pine">Profile bio</label>
          <textarea
            value={draft.bio}
            onChange={(e) => setDraft((current) => ({ ...current, bio: e.target.value }))}
            placeholder="Tell people about yourself"
            className="mt-1 min-h-24 w-full rounded-lg border border-pine/25 bg-sand/75 px-3 py-2 text-sm text-pine outline-none placeholder:text-pine/50 focus:ring-2 focus:ring-pine/30"
          />
        </div>

        <label className="flex items-center gap-2 text-sm text-pine">
          <input
            type="checkbox"
            checked={draft.identityRequested}
            onChange={(e) => setDraft((current) => ({ ...current, identityRequested: e.target.checked }))}
          />
          Request identity verification
        </label>

        <label className="flex items-center gap-2 text-sm text-pine">
          <input
            type="checkbox"
            checked={draft.ageVerified}
            onChange={(e) => setDraft((current) => ({ ...current, ageVerified: e.target.checked }))}
          />
          Confirm age verification (18+)
        </label>

        <button
          type="button"
          onClick={saveDraft}
          className="rounded-lg bg-pine px-4 py-2 text-sm font-semibold text-sand hover:bg-pine-2"
        >
          Save profile details
        </button>
      </div>
    </section>
  );
}