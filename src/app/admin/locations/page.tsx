"use client";

import Link from "next/link";
import { type FormEvent, useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";

type FormState = {
  name: string;
  shortDescription: string;
  fullDescription: string;
  latitude: string;
  longitude: string;
  locationHint: string;
  accessType: string;
  terrain: string;
  safetyLevel: string;
  website: string;
  amenities: string;
  tags: string;
  reporterNotes: string;
};

type LocationRequest = {
  id: string;
  status: string;
  pageUrl: string | null;
  userEmail: string | null;
  userId: string | null;
  createdAt: string;
  placeName: string;
  locationHint: string;
  latitude: number | null;
  longitude: number | null;
  website: string;
  isStay: boolean;
  notes: string;
};

const INITIAL_FORM: FormState = {
  name: "",
  shortDescription: "",
  fullDescription: "",
  latitude: "",
  longitude: "",
  locationHint: "",
  accessType: "Public",
  terrain: "Beach",
  safetyLevel: "Beginner friendly",
  website: "",
  amenities: "",
  tags: "",
  reporterNotes: "",
};

function splitCommaList(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function prettyDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown date";
  return date.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function AdminLocationsPage() {
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [requests, setRequests] = useState<LocationRequest[]>([]);
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);
  const [isLoadingRequests, setIsLoadingRequests] = useState(true);
  const [requestLoadError, setRequestLoadError] = useState("");
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loadRequests = useCallback(async () => {
    setRequestLoadError("");
    setIsLoadingRequests(true);

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token) {
      setRequestLoadError("Please sign in first. We could not verify your admin session.");
      setIsLoadingRequests(false);
      return;
    }

    const response = await fetch("/api/admin/location-requests", {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });

    const payload = (await response.json().catch(() => null)) as { requests?: LocationRequest[]; error?: string } | null;
    if (!response.ok) {
      setRequestLoadError(payload?.error ?? "Could not load location requests.");
      setIsLoadingRequests(false);
      return;
    }

    setRequests(payload?.requests ?? []);
    setIsLoadingRequests(false);
  }, []);

  useEffect(() => {
    void loadRequests();
  }, [loadRequests]);

  function updateField<K extends keyof FormState>(field: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function copyRequestToEditor(request: LocationRequest) {
    setSelectedRequestId(request.id);
    setForm((current) => ({
      ...current,
      name: request.placeName,
      locationHint: request.locationHint,
      latitude: typeof request.latitude === "number" ? request.latitude.toFixed(6) : current.latitude,
      longitude: typeof request.longitude === "number" ? request.longitude.toFixed(6) : current.longitude,
      website: request.website,
      terrain: request.isStay ? "Stays" : current.terrain,
      tags: request.isStay ? "stays" : current.tags,
      reporterNotes: [
        `Requested by ${request.userEmail ?? "unknown member"}`,
        `Request ID: ${request.id}`,
        request.isStay ? "Member marked this as a stay." : "Member marked this as a map location.",
        request.notes ? `Notes: ${request.notes}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
    }));
    setFeedback({ type: "success", message: "Request copied into the editor. Fill the remaining marker details before publishing." });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFeedback(null);

    const latitude = Number(form.latitude);
    const longitude = Number(form.longitude);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      setFeedback({ type: "error", message: "Enter valid numeric latitude and longitude values." });
      return;
    }

    setIsSubmitting(true);
    try {
      const { data } = await supabase.auth.getSession();
      const accessToken = data.session?.access_token;
      const response = await fetch("/api/map-spots", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify({
          name: form.name,
          shortDescription: form.shortDescription,
          fullDescription: form.fullDescription,
          latitude,
          longitude,
          locationHint: form.locationHint,
          accessType: form.accessType,
          terrain: form.terrain,
          safetyLevel: form.safetyLevel,
          website: form.website,
          amenities: splitCommaList(form.amenities),
          tags: splitCommaList(form.tags),
          reporterNotes: form.reporterNotes,
        }),
      });

      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) throw new Error(payload?.error ?? `Unable to create location (${response.status}).`);

      setForm(INITIAL_FORM);
      setSelectedRequestId(null);
      setFeedback({ type: "success", message: "Location marker added to the Explore map." });
    } catch (error) {
      setFeedback({ type: "error", message: error instanceof Error ? error.message : "Unable to create location." });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-[rgb(var(--bg))] px-4 py-8 text-[rgb(var(--text))] sm:px-6 lg:px-8">
      <section className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <aside className="rounded-3xl border border-[rgb(var(--border))] bg-[rgb(var(--card))] p-5 shadow-2xl sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="m-0 text-xs font-bold uppercase tracking-[0.22em] text-[rgb(var(--brand))]">Member requests</p>
              <h1 className="mt-3 text-2xl font-bold text-[rgb(var(--text-strong))]">Requested locations</h1>
              <p className="mt-2 text-sm text-[rgb(var(--muted))]">
                Members only request places here. Admins decide whether to create the marker and whether it also needs a stay listing.
              </p>
            </div>
            <Button type="button" variant="outline" onClick={() => void loadRequests()}>
              Refresh
            </Button>
          </div>

          {requestLoadError ? <p className="mt-4 rounded-xl bg-[rgb(190,68,68)/0.12] p-3 text-sm text-[rgb(190,68,68)]">{requestLoadError}</p> : null}

          <div className="mt-5 grid gap-3">
            {isLoadingRequests ? (
              <p className="rounded-xl border border-[rgb(var(--border))] p-3 text-sm text-[rgb(var(--muted))]">Loading requests…</p>
            ) : requests.length === 0 ? (
              <p className="rounded-xl border border-[rgb(var(--border))] p-3 text-sm text-[rgb(var(--muted))]">No location requests yet.</p>
            ) : (
              requests.map((request) => (
                <article
                  key={request.id}
                  className={`rounded-2xl border p-4 ${
                    selectedRequestId === request.id
                      ? "border-[rgb(var(--brand))] bg-[rgb(var(--brand)/0.08)]"
                      : "border-[rgb(var(--border))] bg-[rgb(var(--bg-soft))/0.45]"
                  }`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <h2 className="m-0 text-base font-semibold text-[rgb(var(--text-strong))]">{request.placeName}</h2>
                      <p className="mt-1 text-xs text-[rgb(var(--muted))]">{prettyDate(request.createdAt)} · {request.userEmail ?? "Unknown member"}</p>
                    </div>
                    {request.isStay ? <span className="rounded-full bg-[rgb(var(--brand))/0.14] px-2 py-1 text-xs font-bold text-[rgb(var(--brand-2))]">Stay</span> : null}
                  </div>
                  <p className="mt-3 whitespace-pre-wrap text-sm text-[rgb(var(--text))]">{request.locationHint}</p>
                  {typeof request.latitude === "number" && typeof request.longitude === "number" ? (
                    <p className="mt-2 text-sm font-semibold text-[rgb(var(--text-strong))]">
                      Coordinates: {request.latitude.toFixed(6)}, {request.longitude.toFixed(6)}
                    </p>
                  ) : null}
                  {request.website ? <p className="mt-2 text-sm"><a className="font-semibold text-[rgb(var(--brand-2))]" href={request.website}>{request.website}</a></p> : null}
                  {request.notes ? <p className="mt-2 whitespace-pre-wrap text-sm text-[rgb(var(--muted))]">{request.notes}</p> : null}
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button type="button" size="sm" onClick={() => copyRequestToEditor(request)}>
                      Use in marker editor
                    </Button>
                    {request.isStay ? (
                      <Button asChild type="button" size="sm" variant="outline">
                        <Link href="/admin/stays">Open stay manager</Link>
                      </Button>
                    ) : null}
                  </div>
                </article>
              ))
            )}
          </div>
        </aside>

        <section className="rounded-3xl border border-[rgb(var(--border))] bg-[rgb(var(--card))] p-5 shadow-2xl sm:p-8">
          <p className="m-0 text-xs font-bold uppercase tracking-[0.22em] text-[rgb(var(--brand))]">Admin map tools</p>
          <h1 className="mt-3 text-3xl font-bold text-[rgb(var(--text-strong))]">Create approved marker</h1>
          <p className="mt-2 max-w-2xl text-sm text-[rgb(var(--muted))]">
            Fill in the verified marker details after reviewing a member request. If the request is a stay, publish this marker as
            type <strong>Stays</strong> and complete the full accommodation record in the stay manager.
          </p>

          <form className="mt-6 grid gap-5" onSubmit={(event) => void handleSubmit(event)}>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="grid gap-1 md:col-span-2">
                <span className="text-sm font-medium">Location name *</span>
                <input required value={form.name} onChange={(event) => updateField("name", event.target.value)} className="rounded-xl border border-[rgb(var(--border))] bg-transparent px-3 py-2 outline-none focus:ring-2 focus:ring-[rgb(var(--brand))]" />
              </label>
              <label className="grid gap-1">
                <span className="text-sm font-medium">Latitude *</span>
                <input required value={form.latitude} onChange={(event) => updateField("latitude", event.target.value)} placeholder="37.7749" className="rounded-xl border border-[rgb(var(--border))] bg-transparent px-3 py-2 outline-none focus:ring-2 focus:ring-[rgb(var(--brand))]" />
              </label>
              <label className="grid gap-1">
                <span className="text-sm font-medium">Longitude *</span>
                <input required value={form.longitude} onChange={(event) => updateField("longitude", event.target.value)} placeholder="-122.4194" className="rounded-xl border border-[rgb(var(--border))] bg-transparent px-3 py-2 outline-none focus:ring-2 focus:ring-[rgb(var(--brand))]" />
              </label>
              <label className="grid gap-1 md:col-span-2">
                <span className="text-sm font-medium">Location hint</span>
                <textarea rows={2} value={form.locationHint} onChange={(event) => updateField("locationHint", event.target.value)} className="rounded-xl border border-[rgb(var(--border))] bg-transparent px-3 py-2 outline-none focus:ring-2 focus:ring-[rgb(var(--brand))]" />
              </label>
              <label className="grid gap-1 md:col-span-2">
                <span className="text-sm font-medium">Short description *</span>
                <input required value={form.shortDescription} onChange={(event) => updateField("shortDescription", event.target.value)} className="rounded-xl border border-[rgb(var(--border))] bg-transparent px-3 py-2 outline-none focus:ring-2 focus:ring-[rgb(var(--brand))]" />
              </label>
              <label className="grid gap-1 md:col-span-2">
                <span className="text-sm font-medium">Full description *</span>
                <textarea required rows={4} value={form.fullDescription} onChange={(event) => updateField("fullDescription", event.target.value)} className="rounded-xl border border-[rgb(var(--border))] bg-transparent px-3 py-2 outline-none focus:ring-2 focus:ring-[rgb(var(--brand))]" />
              </label>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <label className="grid gap-1">
                <span className="text-sm font-medium">Access type</span>
                <select value={form.accessType} onChange={(event) => updateField("accessType", event.target.value)} className="rounded-xl border border-[rgb(var(--border))] bg-transparent px-3 py-2 outline-none focus:ring-2 focus:ring-[rgb(var(--brand))]">
                  <option>Public</option>
                  <option>Discreet</option>
                  <option>Private Club</option>
                </select>
              </label>
              <label className="grid gap-1">
                <span className="text-sm font-medium">Type / terrain</span>
                <select value={form.terrain} onChange={(event) => updateField("terrain", event.target.value)} className="rounded-xl border border-[rgb(var(--border))] bg-transparent px-3 py-2 outline-none focus:ring-2 focus:ring-[rgb(var(--brand))]">
                  <option>Beach</option>
                  <option>Hot spring</option>
                  <option>Campground</option>
                  <option>Forest</option>
                  <option>Urban rooftop</option>
                  <option>Resort</option>
                  <option>Stays</option>
                </select>
              </label>
              <label className="grid gap-1">
                <span className="text-sm font-medium">Safety</span>
                <select value={form.safetyLevel} onChange={(event) => updateField("safetyLevel", event.target.value)} className="rounded-xl border border-[rgb(var(--border))] bg-transparent px-3 py-2 outline-none focus:ring-2 focus:ring-[rgb(var(--brand))]">
                  <option>Beginner friendly</option>
                  <option>Trusted</option>
                  <option>Verified</option>
                  <option>Intermediate</option>
                  <option>Experienced</option>
                </select>
              </label>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="grid gap-1">
                <span className="text-sm font-medium">Website</span>
                <input value={form.website} onChange={(event) => updateField("website", event.target.value)} placeholder="https://" className="rounded-xl border border-[rgb(var(--border))] bg-transparent px-3 py-2 outline-none focus:ring-2 focus:ring-[rgb(var(--brand))]" />
              </label>
              <label className="grid gap-1">
                <span className="text-sm font-medium">Amenities</span>
                <input value={form.amenities} onChange={(event) => updateField("amenities", event.target.value)} placeholder="Showers, Parking" className="rounded-xl border border-[rgb(var(--border))] bg-transparent px-3 py-2 outline-none focus:ring-2 focus:ring-[rgb(var(--brand))]" />
              </label>
              <label className="grid gap-1">
                <span className="text-sm font-medium">Tags</span>
                <input value={form.tags} onChange={(event) => updateField("tags", event.target.value)} placeholder="quiet, social, stays" className="rounded-xl border border-[rgb(var(--border))] bg-transparent px-3 py-2 outline-none focus:ring-2 focus:ring-[rgb(var(--brand))]" />
              </label>
              <label className="grid gap-1">
                <span className="text-sm font-medium">Admin notes</span>
                <textarea rows={3} value={form.reporterNotes} onChange={(event) => updateField("reporterNotes", event.target.value)} className="rounded-xl border border-[rgb(var(--border))] bg-transparent px-3 py-2 outline-none focus:ring-2 focus:ring-[rgb(var(--brand))]" />
              </label>
            </div>

            {feedback ? (
              <p className={feedback.type === "success" ? "text-sm text-[rgb(24,132,84)]" : "text-sm text-[rgb(190,68,68)]"}>
                {feedback.message}
              </p>
            ) : null}

            <div className="flex flex-wrap gap-3">
              <Button type="submit" disabled={isSubmitting}>{isSubmitting ? "Submitting..." : "Add marker"}</Button>
              <Button type="button" variant="outline" onClick={() => { setForm(INITIAL_FORM); setSelectedRequestId(null); }}>Reset</Button>
              {form.terrain === "Stays" ? (
                <Button asChild type="button" variant="outline">
                  <Link href="/admin/stays">Finish stay listing</Link>
                </Button>
              ) : null}
            </div>
          </form>
        </section>
      </section>
    </main>
  );
}
