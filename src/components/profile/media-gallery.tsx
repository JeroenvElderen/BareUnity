"use client";

import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type MediaItem = {
  id: number;
  title: string;
  location: string;
  height: string;
  tones: string;
};

const mediaItems: MediaItem[] = [
  {
    id: 1,
    title: "Sunrise dunes",
    location: "White Sands",
    height: "h-52",
    tones: "from-amber-200 via-orange-200 to-rose-200",
  },
  {
    id: 2,
    title: "Forest stream",
    location: "Blue Ridge",
    height: "h-80",
    tones: "from-emerald-200 via-teal-200 to-cyan-200",
  },
  {
    id: 3,
    title: "Lakeside pause",
    location: "Lake Tahoe",
    height: "h-64",
    tones: "from-sky-200 via-cyan-100 to-teal-100",
  },
  {
    id: 4,
    title: "Warm granite",
    location: "Joshua Tree",
    height: "h-72",
    tones: "from-stone-200 via-amber-100 to-orange-100",
  },
  {
    id: 5,
    title: "Coastal mist",
    location: "Big Sur",
    height: "h-56",
    tones: "from-slate-200 via-zinc-100 to-blue-100",
  },
  {
    id: 6,
    title: "Golden field",
    location: "Sonoma",
    height: "h-96",
    tones: "from-yellow-100 via-amber-100 to-orange-100",
  },
];

export function MediaGallery() {
  const [open, setOpen] = useState(false);
  const count = useMemo(() => mediaItems.length, []);

  return (
    <>
      <div className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--bg-soft))] p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-[rgb(var(--text-strong))]">
              Personal media collection
            </p>
            <p className="text-xs text-[rgb(var(--muted))]">
              {count} nature-forward captures from recent naturist travels.
            </p>
          </div>
          <Badge variant="secondary">Masonry</Badge>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {mediaItems.slice(0, 3).map((item) => (
            <div
              key={item.id}
              className={`rounded-md bg-gradient-to-br ${item.tones} p-2 text-[11px] text-[rgb(var(--text-strong))]`}
            >
              <div className="rounded bg-white/70 px-2 py-1">{item.title}</div>
            </div>
          ))}
        </div>
        <Button className="mt-4 w-full" onClick={() => setOpen(true)}>
          Open media gallery
        </Button>
      </div>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4">
          <div className="max-h-[92vh] w-full max-w-5xl overflow-hidden rounded-2xl border border-[rgb(var(--border))] bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-[rgb(var(--border))] p-4">
              <div>
                <h3 className="text-lg font-semibold text-[rgb(var(--text-strong))]">
                  Jordan&apos;s media
                </h3>
                <p className="text-sm text-[rgb(var(--muted))]">
                  Masonry view of uploaded moments in nature.
                </p>
              </div>
              <Button variant="outline" onClick={() => setOpen(false)}>
                Close
              </Button>
            </div>

            <div className="max-h-[78vh] overflow-y-auto p-4">
              <div className="columns-1 gap-4 sm:columns-2 lg:columns-3">
                {mediaItems.map((item) => (
                  <figure
                    key={item.id}
                    className={`mb-4 break-inside-avoid rounded-xl border border-[rgb(var(--border))] bg-gradient-to-br ${item.tones} p-3 ${item.height}`}
                  >
                    <div className="flex h-full flex-col justify-end rounded-lg bg-white/40 p-3 backdrop-blur-[1px]">
                      <p className="text-sm font-semibold text-[rgb(var(--text-strong))]">
                        {item.title}
                      </p>
                      <p className="text-xs text-[rgb(var(--muted))]">{item.location}</p>
                    </div>
                  </figure>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}