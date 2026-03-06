"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import Topbar from "@/components/Topbar";
import Sidebar from "@/components/Sidebar";
import { COMMUNITY_STORAGE_KEY, Community, CommunityPrivacy, readStoredCommunities } from "@/lib/community-data";

export default function CommunitiesPage() {
  const searchParams = useSearchParams();
  const [communities, setCommunities] = useState<Community[]>(() => readStoredCommunities());
  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const [createParamDismissed, setCreateParamDismissed] = useState(false);
  const [wizardStep, setWizardStep] = useState(1);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [privacy, setPrivacy] = useState<CommunityPrivacy>("public");
  const [mature, setMature] = useState(false);
  const [primaryColor, setPrimaryColor] = useState("#ff5a0a");
  const [secondaryColor, setSecondaryColor] = useState("#340b05");

  useEffect(() => {
    localStorage.setItem(COMMUNITY_STORAGE_KEY, JSON.stringify(communities));
  }, [communities]);

  const canAdvanceStepOne = name.trim().length > 2 && description.trim().length > 4;

  const roleCounts = useMemo(
    () => ({
      owner: communities.filter((community) => community.role === "owner").length,
      member: communities.filter((community) => community.role === "member").length,
    }),
    [communities],
  );

  function resetWizard() {
    setWizardStep(1);
    setName("");
    setDescription("");
    setPrivacy("public");
    setMature(false);
    setPrimaryColor("#ff5a0a");
    setSecondaryColor("#340b05");
  }

  function closeWizard() {
    setIsWizardOpen(false);
    setCreateParamDismissed(true);
    resetWizard();
    if (typeof window !== "undefined") {
      window.history.replaceState({}, "", "/communities");
    }
  }

  function handleCreateCommunity(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canAdvanceStepOne) {
      return;
    }

    const normalized = name.trim();

    const newCommunity: Community = {
      id: crypto.randomUUID(),
      name: normalized,
      description: description.trim(),
      privacy,
      mature,
      role: "owner",
      theme: {
        primary: primaryColor,
        secondary: secondaryColor,
      },
      textChannels: ["general"],
      voiceChannels: ["Lobby"],
    };

    setCommunities((current) => [newCommunity, ...current.filter((community) => community.id !== newCommunity.id)]);
    closeWizard();
  }

  return (
    <div className="min-h-screen bg-bg text-text">
      <Topbar />
      <div className="flex">
        <Sidebar />

        <main className="flex-1 px-6 py-6">
          <section className="rounded-2xl border border-orange-300/25 bg-[#1a0d0b]/75 p-5">
            <h1 className="text-2xl font-bold text-orange-50">Your communities</h1>
            <p className="mt-1 text-sm text-orange-100/80">Use the left menu icon to open/close navigation and the + button to create communities.</p>
            <p className="mt-2 text-xs text-orange-200/80">Owner: {roleCounts.owner} • Member: {roleCounts.member}</p>

            <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {communities.map((community) => (
                <Link
                  key={community.id}
                  href={`/communities/${community.id}`}
                  className="rounded-xl border border-orange-300/25 bg-black/20 p-4 transition hover:border-orange-200/60"
                >
                  <div className="h-3 w-full rounded-full" style={{ background: `linear-gradient(90deg, ${community.theme.primary}, ${community.theme.secondary})` }} />
                  <p className="mt-3 font-semibold text-orange-50">r/{community.name}</p>
                  <p className="text-xs uppercase text-orange-200/80">{community.role}</p>
                  <p className="mt-3 text-sm text-orange-100/85">{community.description}</p>
                </Link>
              ))}
            </div>
          </section>
        </main>
      </div>

      {(isWizardOpen || (searchParams.get("create") === "1" && !createParamDismissed)) && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 px-4 py-8">
          <div className="w-full max-w-3xl rounded-2xl border border-slate-300/20 bg-[#111823] p-6 text-slate-100 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Create community</p>
                <h3 className="text-2xl font-bold">Step {wizardStep} of 3</h3>
              </div>
              <button onClick={closeWizard} className="rounded-full border border-slate-400/30 px-3 py-1 text-sm" type="button">
                ✕
              </button>
            </div>

            {wizardStep === 1 && (
              <div className="grid gap-4 md:grid-cols-[1.15fr_0.85fr]">
                <div className="space-y-3">
                  <h4 className="text-xl font-semibold">Tell us about your community</h4>
                  <input
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="Community name"
                    maxLength={21}
                    className="w-full rounded-xl border border-slate-400/20 bg-slate-900/40 px-3 py-2 outline-none"
                  />
                  <textarea
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    placeholder="Description"
                    rows={5}
                    className="w-full rounded-xl border border-slate-400/20 bg-slate-900/40 px-3 py-2 outline-none"
                  />
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="text-xs uppercase tracking-wide text-slate-400">
                      Primary color
                      <input type="color" value={primaryColor} onChange={(event) => setPrimaryColor(event.target.value)} className="mt-1 h-10 w-full rounded border border-slate-500/30 bg-transparent" />
                    </label>
                    <label className="text-xs uppercase tracking-wide text-slate-400">
                      Secondary color
                      <input type="color" value={secondaryColor} onChange={(event) => setSecondaryColor(event.target.value)} className="mt-1 h-10 w-full rounded border border-slate-500/30 bg-transparent" />
                    </label>
                  </div>
                </div>
                <div className="rounded-2xl border border-slate-400/20 bg-slate-900/30 p-4">
                  <p className="text-xs uppercase text-slate-400">Preview</p>
                  <div className="mt-2 h-8 rounded" style={{ background: `linear-gradient(90deg, ${primaryColor}, ${secondaryColor})` }} />
                  <p className="mt-3 text-2xl font-bold text-white">r/{name || "communityname"}</p>
                  <p className="mt-2 text-sm text-slate-300">{description || "Your community description"}</p>
                </div>
              </div>
            )}

            {wizardStep === 2 && (
              <div>
                <h4 className="text-xl font-semibold">What kind of community is this?</h4>
                <p className="mt-1 text-sm text-slate-300">Choose who can view and contribute.</p>
                <div className="mt-4 space-y-2">
                  {[
                    { key: "public", label: "Public", helper: "Anyone can view and contribute" },
                    { key: "restricted", label: "Restricted", helper: "Anyone can view, approved users contribute" },
                    { key: "private", label: "Private", helper: "Only approved members can view and contribute" },
                  ].map((item) => (
                    <button
                      key={item.key}
                      onClick={() => setPrivacy(item.key as CommunityPrivacy)}
                      type="button"
                      className={`w-full rounded-xl border px-4 py-3 text-left ${
                        privacy === item.key ? "border-blue-400 bg-slate-700/60" : "border-slate-400/20 bg-slate-900/40"
                      }`}
                    >
                      <p className="font-semibold">{item.label}</p>
                      <p className="text-sm text-slate-300">{item.helper}</p>
                    </button>
                  ))}
                </div>
                <label className="mt-4 flex cursor-pointer items-center justify-between rounded-xl border border-slate-400/20 bg-slate-900/40 p-4">
                  <span>
                    <p className="font-semibold">Mature (18+)</p>
                    <p className="text-sm text-slate-300">Users must be over 18 to view and contribute.</p>
                  </span>
                  <input checked={mature} onChange={(event) => setMature(event.target.checked)} type="checkbox" />
                </label>
              </div>
            )}

            {wizardStep === 3 && (
              <form onSubmit={handleCreateCommunity}>
                <h4 className="text-xl font-semibold">Review and create</h4>
                <div className="mt-4 rounded-xl border border-slate-400/20 bg-slate-900/40 p-4 text-sm text-slate-200">
                  <p>
                    <span className="text-slate-400">Name:</span> r/{name}
                  </p>
                  <p className="mt-2">
                    <span className="text-slate-400">Description:</span> {description}
                  </p>
                  <p className="mt-2">
                    <span className="text-slate-400">Theme:</span>
                    <span className="ml-2 inline-flex h-3 w-16 rounded" style={{ background: `linear-gradient(90deg, ${primaryColor}, ${secondaryColor})` }} />
                  </p>
                  <p className="mt-2">
                    <span className="text-slate-400">Privacy:</span> <span className="capitalize">{privacy}</span>
                  </p>
                  <p className="mt-2">
                    <span className="text-slate-400">Mature:</span> {mature ? "Yes" : "No"}
                  </p>
                </div>
                <div className="mt-6 flex justify-end gap-2">
                  <button onClick={() => setWizardStep(2)} type="button" className="rounded-xl border border-slate-400/30 px-4 py-2 text-sm">
                    Back
                  </button>
                  <button type="submit" className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500">
                    Create Community
                  </button>
                </div>
              </form>
            )}

            {wizardStep < 3 && (
              <div className="mt-6 flex justify-end gap-2">
                {wizardStep > 1 && (
                  <button onClick={() => setWizardStep((step) => step - 1)} type="button" className="rounded-xl border border-slate-400/30 px-4 py-2 text-sm">
                    Back
                  </button>
                )}
                <button
                  onClick={() => setWizardStep((step) => step + 1)}
                  disabled={wizardStep === 1 && !canAdvanceStepOne}
                  type="button"
                  className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
