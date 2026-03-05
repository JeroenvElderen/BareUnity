"use client";

import { FormEvent, useMemo, useState } from "react";
import Topbar from "@/components/Topbar";
import Sidebar from "@/components/Sidebar";

type CommunityType = "public" | "private";

type Community = {
  id: string;
  name: string;
  description: string;
  type: CommunityType;
};

export default function CommunitiesPage() {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState<CommunityType>("public");
  const [communities, setCommunities] = useState<Community[]>([]);

  function handleCreateCommunity(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!name.trim()) {
      return;
    }

    const newCommunity: Community = {
      id: crypto.randomUUID(),
      name: name.trim(),
      description: description.trim(),
      type,
    };

    setCommunities((current) => [newCommunity, ...current]);
    setName("");
    setDescription("");
    setType("public");
  }

  const publicCount = useMemo(() => communities.filter((community) => community.type === "public").length, [communities]);
  const privateCount = communities.length - publicCount;

  return (
    <div className="min-h-screen bg-bg text-text">
      <Topbar />
      <div className="mx-auto max-w-[1400px]">
        <div className="flex">
          <Sidebar />

          <main className="flex-1 px-4 py-6">
            <div className="mx-auto max-w-3xl space-y-6">
              <section className="rounded-2xl border border-sand/20 bg-card/75 p-5">
                <h1 className="text-2xl font-bold text-sand">Create communities</h1>
                <p className="mt-1 text-sm text-muted">Start a public or private space for your members.</p>

                <form className="mt-4 space-y-3" onSubmit={handleCreateCommunity}>
                  <input
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    className="w-full rounded-xl border border-sand/20 bg-sand/80 px-3 py-2 text-sm text-pine outline-none"
                    placeholder="Community name"
                  />
                  <textarea
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    className="min-h-20 w-full rounded-xl border border-sand/20 bg-sand/80 px-3 py-2 text-sm text-pine outline-none"
                    placeholder="Community description"
                  />

                  <div className="flex gap-3">
                    <label className="flex items-center gap-2 text-sm text-text/90">
                      <input type="radio" name="communityType" checked={type === "public"} onChange={() => setType("public")} />
                      Public community
                    </label>
                    <label className="flex items-center gap-2 text-sm text-text/90">
                      <input type="radio" name="communityType" checked={type === "private"} onChange={() => setType("private")} />
                      Private community
                    </label>
                  </div>

                  <button className="rounded-xl bg-pine px-4 py-2 text-sm font-semibold text-sand transition hover:bg-pine-2" type="submit">
                    Create community
                  </button>
                </form>
              </section>

              <section className="rounded-2xl border border-sand/20 bg-card/70 p-5">
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-lg font-bold text-sand">Community list</h2>
                  <p className="text-xs text-muted">Public: {publicCount} • Private: {privateCount}</p>
                </div>

                <div className="space-y-3">
                  {communities.length === 0 ? (
                    <p className="text-sm text-muted">No communities created yet.</p>
                  ) : (
                    communities.map((community) => (
                      <article key={community.id} className="rounded-xl border border-sand/20 bg-pine/20 p-3">
                        <div className="mb-1 flex items-center gap-2">
                          <h3 className="font-semibold text-sand">{community.name}</h3>
                          <span className="rounded-full border border-sand/30 px-2 py-0.5 text-xs uppercase text-sand/90">{community.type}</span>
                        </div>
                        <p className="text-sm text-text/85">{community.description || "No description added."}</p>
                      </article>
                    ))
                  )}
                </div>
              </section>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}