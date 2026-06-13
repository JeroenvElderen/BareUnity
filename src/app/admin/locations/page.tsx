"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
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

type ImportCategory = "activity";
type LocationRequestType = "location" | "stay" | "activity";

type ImportVerification = {
  confidenceScore: number;
  primaryProvider: string;
  crosscheckProvider?: string;
  distanceMeters?: number;
  googlePlaceId?: string;
  googleAccuracy?: string;
  mapboxAccuracy?: string;
  notes: string[];
};

type ImportDraft = {
  name?: string;
  shortDescription?: string;
  fullDescription?: string;
  latitude?: number;
  longitude?: number;
  locationHint?: string;
  accessType?: string;
  terrain?: string;
  safetyLevel?: string;
  website?: string;
  amenities?: string[];
  tags?: string[];
  reporterNotes?: string;
  warnings?: string[];
  verification?: ImportVerification;
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
  requestType: LocationRequestType;
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

const REQUEST_TYPE_LABELS: Record<LocationRequestType, string> = {
  location: "Location",
  stay: "Stay",
  activity: "Activity",
};

function terrainForRequestType(requestType: LocationRequestType) {
  if (requestType === "stay") return "Stays";
  if (requestType === "activity") return "Activity";
  return "Beach";
}

function tagForRequestType(requestType: LocationRequestType) {
  if (requestType === "stay") return "stays";
  if (requestType === "activity") return "activity, events, bookings";
  return "";
}

function splitCommaList(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function prettyDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown date";
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function AdminLocationsPage() {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [requests, setRequests] = useState<LocationRequest[]>([]);
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(
    null,
  );
  const [isLoadingRequests, setIsLoadingRequests] = useState(true);
  const [deletingRequestId, setDeletingRequestId] = useState<string | null>(
    null,
  );
  const [requestLoadError, setRequestLoadError] = useState("");
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [importUrl, setImportUrl] = useState("");
  const [importCategory, setImportCategory] =
    useState<ImportCategory>("activity");
  const [isImporting, setIsImporting] = useState(false);
  const [importWarnings, setImportWarnings] = useState<string[]>([]);
  const [importVerification, setImportVerification] =
    useState<ImportVerification | null>(null);

  function buildStayImportHref(
    draft: FormState,
    requestId: string | null = selectedRequestId,
  ) {
    const params = new URLSearchParams();
    if (requestId) params.set("sourceRequestId", requestId);
    if (draft.website) params.set("website", draft.website);
    if (draft.name) params.set("name", draft.name);
    if (draft.locationHint) params.set("locationHint", draft.locationHint);
    if (draft.latitude) params.set("latitude", draft.latitude);
    if (draft.longitude) params.set("longitude", draft.longitude);
    if (draft.reporterNotes) params.set("notes", draft.reporterNotes);

    const queryString = params.toString();
    return queryString ? `/admin/stays?${queryString}` : "/admin/stays";
  }

  function buildStayRequestHref(request: LocationRequest) {
    const params = new URLSearchParams();
    params.set("sourceRequestId", request.id);
    if (request.website) params.set("website", request.website);
    if (request.placeName) params.set("name", request.placeName);
    if (request.locationHint) params.set("locationHint", request.locationHint);
    if (typeof request.latitude === "number") {
      params.set("latitude", request.latitude.toFixed(6));
    }
    if (typeof request.longitude === "number") {
      params.set("longitude", request.longitude.toFixed(6));
    }

    const notes = [
      `Requested by ${request.userEmail ?? "unknown member"}`,
      `Request ID: ${request.id}`,
      `Member requested type: ${REQUEST_TYPE_LABELS[request.requestType]}.`,
      request.notes ? `Notes: ${request.notes}` : "",
    ]
      .filter(Boolean)
      .join("\n");
    if (notes) params.set("notes", notes);

    return `/admin/stays?${params.toString()}`;
  }

  const loadRequests = useCallback(async () => {
    setRequestLoadError("");
    setIsLoadingRequests(true);

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token) {
      setRequestLoadError(
        "Please sign in first. We could not verify your admin session.",
      );
      setIsLoadingRequests(false);
      return;
    }

    const response = await fetch("/api/admin/location-requests", {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });

    const payload = (await response.json().catch(() => null)) as {
      requests?: LocationRequest[];
      error?: string;
    } | null;
    if (!response.ok) {
      setRequestLoadError(
        payload?.error ?? "Could not load location requests.",
      );
      setIsLoadingRequests(false);
      return;
    }

    setRequests(payload?.requests ?? []);
    setIsLoadingRequests(false);
  }, []);

  useEffect(() => {
    void loadRequests();
  }, [loadRequests]);

  function updateField<K extends keyof FormState>(
    field: K,
    value: FormState[K],
  ) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function copyRequestToEditor(request: LocationRequest) {
    setSelectedRequestId(request.id);
    setForm((current) => ({
      ...current,
      name: request.placeName,
      locationHint: request.locationHint,
      latitude:
        typeof request.latitude === "number"
          ? request.latitude.toFixed(6)
          : current.latitude,
      longitude:
        typeof request.longitude === "number"
          ? request.longitude.toFixed(6)
          : current.longitude,
      website: request.website,
      terrain:
        request.requestType === "location"
          ? current.terrain
          : terrainForRequestType(request.requestType),
      tags: tagForRequestType(request.requestType) || current.tags,
      reporterNotes: [
        `Requested by ${request.userEmail ?? "unknown member"}`,
        `Request ID: ${request.id}`,
        `Member requested type: ${REQUEST_TYPE_LABELS[request.requestType]}.`,
        request.notes ? `Notes: ${request.notes}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
    }));
    setFeedback({
      type: "success",
      message:
        "Request copied into the editor. Fill the remaining marker details before publishing.",
    });
  }

  async function deleteLocationRequest(
    requestId: string,
    options: { showSuccessFeedback?: boolean } = {},
  ) {
    const { showSuccessFeedback = true } = options;
    setDeletingRequestId(requestId);
    setFeedback(null);

    try {
      const { data } = await supabase.auth.getSession();
      const accessToken = data.session?.access_token;
      if (!accessToken) {
        throw new Error(
          "Please sign in first. We could not verify your admin session.",
        );
      }

      const response = await fetch(
        `/api/admin/location-requests/${encodeURIComponent(requestId)}`,
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${accessToken}` },
        },
      );
      const payload = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;
      if (!response.ok) {
        throw new Error(payload?.error ?? "Could not delete this request.");
      }

      setRequests((current) =>
        current.filter((request) => request.id !== requestId),
      );
      setSelectedRequestId((current) =>
        current === requestId ? null : current,
      );
      if (showSuccessFeedback) {
        setFeedback({
          type: "success",
          message: "Location request deleted from the admin queue.",
        });
      }
      return true;
    } catch (error) {
      setFeedback({
        type: "error",
        message:
          error instanceof Error
            ? error.message
            : "Unable to delete location request.",
      });
      return false;
    } finally {
      setDeletingRequestId(null);
    }
  }

  function copyImportToEditor(draft: ImportDraft) {
    setForm((current) => ({
      ...current,
      name: draft.name ?? current.name,
      shortDescription: draft.shortDescription ?? current.shortDescription,
      fullDescription: draft.fullDescription ?? current.fullDescription,
      latitude:
        typeof draft.latitude === "number"
          ? draft.latitude.toFixed(6)
          : current.latitude,
      longitude:
        typeof draft.longitude === "number"
          ? draft.longitude.toFixed(6)
          : current.longitude,
      locationHint: draft.locationHint ?? current.locationHint,
      accessType: draft.accessType ?? current.accessType,
      terrain: draft.terrain ?? current.terrain,
      safetyLevel: draft.safetyLevel ?? current.safetyLevel,
      website: draft.website ?? current.website,
      amenities: draft.amenities?.length
        ? draft.amenities.join(", ")
        : current.amenities,
      tags: draft.tags?.length ? draft.tags.join(", ") : current.tags,
      reporterNotes: draft.reporterNotes ?? current.reporterNotes,
    }));
  }

  async function importBookingWebsite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsImporting(true);
    setFeedback(null);
    setImportWarnings([]);
    setImportVerification(null);

    try {
      const { data } = await supabase.auth.getSession();
      const accessToken = data.session?.access_token;
      if (!accessToken) {
        throw new Error(
          "Please sign in first. We could not verify your admin session.",
        );
      }

      const response = await fetch(
        `/api/admin/map-spots/import?category=${encodeURIComponent(importCategory)}&url=${encodeURIComponent(importUrl)}`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      const payload = (await response.json().catch(() => null)) as {
        draft?: ImportDraft;
        error?: string;
      } | null;

      if (!response.ok || !payload?.draft) {
        throw new Error(payload?.error ?? "Could not import this website.");
      }

      copyImportToEditor(payload.draft);
      setImportWarnings(payload.draft.warnings ?? []);
      setImportVerification(payload.draft.verification ?? null);
      setFeedback({
        type: "success",
        message:
          "Imported the website into the marker editor. Review everything before saving.",
      });
    } catch (error) {
      setFeedback({
        type: "error",
        message:
          error instanceof Error ? error.message : "Unable to import website.",
      });
    } finally {
      setIsImporting(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFeedback(null);

    if (form.terrain === "Stays") {
      router.push(buildStayImportHref(form));
      return;
    }

    const latitude = Number(form.latitude);
    const longitude = Number(form.longitude);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      setFeedback({
        type: "error",
        message: "Enter valid numeric latitude and longitude values.",
      });
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

      const payload = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;
      if (!response.ok)
        throw new Error(
          payload?.error ?? `Unable to create location (${response.status}).`,
        );

      const selectedRequestWasDeleted = selectedRequestId
        ? await deleteLocationRequest(selectedRequestId, {
            showSuccessFeedback: false,
          })
        : false;

      if (selectedRequestId) {
        setFeedback({
          type: selectedRequestWasDeleted ? "success" : "error",
          message: selectedRequestWasDeleted
            ? "Location marker added to the Explore map and the request was removed from the queue."
            : "Location marker was added, but the request could not be deleted. Please delete it manually.",
        });
      }

      setForm(INITIAL_FORM);
      setSelectedRequestId(null);
      setImportVerification(null);
      setImportWarnings([]);
      if (!selectedRequestId) {
        setFeedback({
          type: "success",
          message: "Location marker added to the Explore map.",
        });
      }
    } catch (error) {
      setFeedback({
        type: "error",
        message:
          error instanceof Error ? error.message : "Unable to create location.",
      });
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
              <p className="m-0 text-xs font-bold uppercase tracking-[0.22em] text-[rgb(var(--brand))]">
                Member requests
              </p>
              <h1 className="mt-3 text-2xl font-bold text-[rgb(var(--text-strong))]">
                Requested locations
              </h1>
              <p className="mt-2 text-sm text-[rgb(var(--muted))]">
                Members only request places here. Admins decide whether to
                create the marker and whether it also needs a stay listing.
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={() => void loadRequests()}
            >
              Refresh
            </Button>
          </div>

          {requestLoadError ? (
            <p className="mt-4 rounded-xl bg-[rgb(190,68,68)/0.12] p-3 text-sm text-[rgb(190,68,68)]">
              {requestLoadError}
            </p>
          ) : null}

          <div className="mt-5 grid gap-3">
            {isLoadingRequests ? (
              <p className="rounded-xl border border-[rgb(var(--border))] p-3 text-sm text-[rgb(var(--muted))]">
                Loading requests…
              </p>
            ) : requests.length === 0 ? (
              <p className="rounded-xl border border-[rgb(var(--border))] p-3 text-sm text-[rgb(var(--muted))]">
                No location requests yet.
              </p>
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
                      <h2 className="m-0 text-base font-semibold text-[rgb(var(--text-strong))]">
                        {request.placeName}
                      </h2>
                      <p className="mt-1 text-xs text-[rgb(var(--muted))]">
                        {prettyDate(request.createdAt)} ·{" "}
                        {request.userEmail ?? "Unknown member"}
                      </p>
                    </div>
                    <span className="rounded-full bg-[rgb(var(--brand))/0.14] px-2 py-1 text-xs font-bold text-[rgb(var(--brand-2))]">
                      {REQUEST_TYPE_LABELS[request.requestType]}
                    </span>
                  </div>
                  <p className="mt-3 whitespace-pre-wrap text-sm text-[rgb(var(--text))]">
                    {request.locationHint}
                  </p>
                  {typeof request.latitude === "number" &&
                  typeof request.longitude === "number" ? (
                    <p className="mt-2 text-sm font-semibold text-[rgb(var(--text-strong))]">
                      Coordinates: {request.latitude.toFixed(6)},{" "}
                      {request.longitude.toFixed(6)}
                    </p>
                  ) : null}
                  {request.website ? (
                    <p className="mt-2 text-sm">
                      <a
                        className="font-semibold text-[rgb(var(--brand-2))]"
                        href={request.website}
                      >
                        {request.website}
                      </a>
                    </p>
                  ) : null}
                  {request.notes ? (
                    <p className="mt-2 whitespace-pre-wrap text-sm text-[rgb(var(--muted))]">
                      {request.notes}
                    </p>
                  ) : null}
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => copyRequestToEditor(request)}
                    >
                      Use in marker editor
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={deletingRequestId === request.id}
                      onClick={() => void deleteLocationRequest(request.id)}
                    >
                      {deletingRequestId === request.id
                        ? "Deleting..."
                        : "Delete request"}
                    </Button>
                    {request.requestType === "stay" ? (
                      <Button asChild type="button" size="sm" variant="outline">
                        <Link href={buildStayRequestHref(request)}>
                          Import stay listing
                        </Link>
                      </Button>
                    ) : null}
                  </div>
                </article>
              ))
            )}
          </div>
        </aside>

        <section className="rounded-3xl border border-[rgb(var(--border))] bg-[rgb(var(--card))] p-5 shadow-2xl sm:p-8">
          <p className="m-0 text-xs font-bold uppercase tracking-[0.22em] text-[rgb(var(--brand))]">
            Admin map tools
          </p>
          <h1 className="mt-3 text-3xl font-bold text-[rgb(var(--text-strong))]">
            Create approved marker
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-[rgb(var(--muted))]">
            Fill in the verified marker details after reviewing a member
            request. Stay and activity requests can be copied into the
            editor, then published as approved map markers.
          </p>

          <form
            className="mt-6 grid gap-4 rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--bg-soft))/0.45] p-4"
            onSubmit={(event) => void importBookingWebsite(event)}
          >
            <div>
              <p className="m-0 text-xs font-bold uppercase tracking-[0.18em] text-[rgb(var(--brand))]">
                Website import
              </p>
              <h2 className="mt-2 text-xl font-bold text-[rgb(var(--text-strong))]">
                Import activity details
              </h2>
              <p className="mt-1 text-sm text-[rgb(var(--muted))]">
                Paste an activity website and we will prefill the marker
                editor with name, description, location, website, amenities, and
                tags.
              </p>
            </div>

            <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_180px]">
              <label className="grid gap-1">
                <span className="text-sm font-medium">Website URL</span>
                <input
                  required
                  type="url"
                  value={importUrl}
                  onChange={(event) => setImportUrl(event.target.value)}
                  placeholder="https://"
                  className="rounded-xl border border-[rgb(var(--border))] bg-transparent px-3 py-2 outline-none focus:ring-2 focus:ring-[rgb(var(--brand))]"
                />
              </label>
              <label className="grid gap-1">
                <span className="text-sm font-medium">Import as</span>
                <select
                  value={importCategory}
                  onChange={(event) =>
                    setImportCategory(event.target.value as ImportCategory)
                  }
                  className="rounded-xl border border-[rgb(var(--border))] bg-transparent px-3 py-2 outline-none focus:ring-2 focus:ring-[rgb(var(--brand))]"
                >
                  <option value="activity">Activity</option>
                </select>
              </label>
            </div>

            {importVerification ? (
              <div className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--card))] p-4 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="m-0 text-xs font-bold uppercase tracking-[0.18em] text-[rgb(var(--brand))]">
                      Google details + Mapbox verification
                    </p>
                    <p className="mt-1 font-semibold text-[rgb(var(--text-strong))]">
                      Confidence {importVerification.confidenceScore}/100 · Primary {importVerification.primaryProvider}
                      {importVerification.crosscheckProvider
                        ? ` · Cross-check ${importVerification.crosscheckProvider}`
                        : ""}
                    </p>
                  </div>
                  {typeof importVerification.distanceMeters === "number" ? (
                    <span className="rounded-full bg-[rgb(var(--brand))/0.14] px-3 py-1 text-xs font-bold text-[rgb(var(--brand-2))]">
                      {importVerification.distanceMeters}m apart
                    </span>
                  ) : null}
                </div>
                <dl className="mt-3 grid gap-2 md:grid-cols-3">
                  {importVerification.googlePlaceId ? (
                    <div>
                      <dt className="text-xs font-bold uppercase text-[rgb(var(--muted))]">
                        Google place
                      </dt>
                      <dd className="m-0 break-all">{importVerification.googlePlaceId}</dd>
                    </div>
                  ) : null}
                  {importVerification.googleAccuracy ? (
                    <div>
                      <dt className="text-xs font-bold uppercase text-[rgb(var(--muted))]">
                        Google accuracy
                      </dt>
                      <dd className="m-0">{importVerification.googleAccuracy}</dd>
                    </div>
                  ) : null}
                  {importVerification.mapboxAccuracy ? (
                    <div>
                      <dt className="text-xs font-bold uppercase text-[rgb(var(--muted))]">
                        Mapbox accuracy
                      </dt>
                      <dd className="m-0">{importVerification.mapboxAccuracy}</dd>
                    </div>
                  ) : null}
                </dl>
                {importVerification.notes.length ? (
                  <ul className="mt-3 grid gap-1 pl-5 text-[rgb(var(--muted))]">
                    {importVerification.notes.map((note) => (
                      <li key={note}>{note}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}

            {importWarnings.length ? (
              <ul className="m-0 grid gap-1 rounded-xl bg-[rgb(206,143,47)/0.12] p-3 text-sm text-[rgb(145,93,24)]">
                {importWarnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            ) : null}

            <div>
              <Button type="submit" disabled={isImporting}>
                {isImporting ? "Importing..." : "Import website"}
              </Button>
            </div>
          </form>

          <form
            className="mt-6 grid gap-5"
            onSubmit={(event) => void handleSubmit(event)}
          >
            <div className="grid gap-4 md:grid-cols-2">
              <label className="grid gap-1 md:col-span-2">
                <span className="text-sm font-medium">Location name *</span>
                <input
                  required
                  value={form.name}
                  onChange={(event) => updateField("name", event.target.value)}
                  className="rounded-xl border border-[rgb(var(--border))] bg-transparent px-3 py-2 outline-none focus:ring-2 focus:ring-[rgb(var(--brand))]"
                />
              </label>
              <label className="grid gap-1">
                <span className="text-sm font-medium">Latitude *</span>
                <input
                  required
                  value={form.latitude}
                  onChange={(event) =>
                    updateField("latitude", event.target.value)
                  }
                  placeholder="37.7749"
                  className="rounded-xl border border-[rgb(var(--border))] bg-transparent px-3 py-2 outline-none focus:ring-2 focus:ring-[rgb(var(--brand))]"
                />
              </label>
              <label className="grid gap-1">
                <span className="text-sm font-medium">Longitude *</span>
                <input
                  required
                  value={form.longitude}
                  onChange={(event) =>
                    updateField("longitude", event.target.value)
                  }
                  placeholder="-122.4194"
                  className="rounded-xl border border-[rgb(var(--border))] bg-transparent px-3 py-2 outline-none focus:ring-2 focus:ring-[rgb(var(--brand))]"
                />
              </label>
              <label className="grid gap-1 md:col-span-2">
                <span className="text-sm font-medium">Location hint</span>
                <textarea
                  rows={2}
                  value={form.locationHint}
                  onChange={(event) =>
                    updateField("locationHint", event.target.value)
                  }
                  className="rounded-xl border border-[rgb(var(--border))] bg-transparent px-3 py-2 outline-none focus:ring-2 focus:ring-[rgb(var(--brand))]"
                />
              </label>
              <label className="grid gap-1 md:col-span-2">
                <span className="text-sm font-medium">Short description *</span>
                <input
                  required
                  value={form.shortDescription}
                  onChange={(event) =>
                    updateField("shortDescription", event.target.value)
                  }
                  className="rounded-xl border border-[rgb(var(--border))] bg-transparent px-3 py-2 outline-none focus:ring-2 focus:ring-[rgb(var(--brand))]"
                />
              </label>
              <label className="grid gap-1 md:col-span-2">
                <span className="text-sm font-medium">Full description *</span>
                <textarea
                  required
                  rows={4}
                  value={form.fullDescription}
                  onChange={(event) =>
                    updateField("fullDescription", event.target.value)
                  }
                  className="rounded-xl border border-[rgb(var(--border))] bg-transparent px-3 py-2 outline-none focus:ring-2 focus:ring-[rgb(var(--brand))]"
                />
              </label>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <label className="grid gap-1">
                <span className="text-sm font-medium">Access type</span>
                <select
                  value={form.accessType}
                  onChange={(event) =>
                    updateField("accessType", event.target.value)
                  }
                  className="rounded-xl border border-[rgb(var(--border))] bg-transparent px-3 py-2 outline-none focus:ring-2 focus:ring-[rgb(var(--brand))]"
                >
                  <option>Public</option>
                  <option>Discreet</option>
                  <option>Private Club</option>
                </select>
              </label>
              <label className="grid gap-1">
                <span className="text-sm font-medium">Type / terrain</span>
                <select
                  value={form.terrain}
                  onChange={(event) =>
                    updateField("terrain", event.target.value)
                  }
                  className="rounded-xl border border-[rgb(var(--border))] bg-transparent px-3 py-2 outline-none focus:ring-2 focus:ring-[rgb(var(--brand))]"
                >
                  <option>Beach</option>
                  <option>Hot spring</option>
                  <option>Campground</option>
                  <option>Forest</option>
                  <option>Urban rooftop</option>
                  <option>Resort</option>
                  <option>Activity</option>
                  <option>Stays</option>
                </select>
              </label>
              <label className="grid gap-1">
                <span className="text-sm font-medium">Safety</span>
                <select
                  value={form.safetyLevel}
                  onChange={(event) =>
                    updateField("safetyLevel", event.target.value)
                  }
                  className="rounded-xl border border-[rgb(var(--border))] bg-transparent px-3 py-2 outline-none focus:ring-2 focus:ring-[rgb(var(--brand))]"
                >
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
                <input
                  value={form.website}
                  onChange={(event) =>
                    updateField("website", event.target.value)
                  }
                  placeholder="https://"
                  className="rounded-xl border border-[rgb(var(--border))] bg-transparent px-3 py-2 outline-none focus:ring-2 focus:ring-[rgb(var(--brand))]"
                />
              </label>
              <label className="grid gap-1">
                <span className="text-sm font-medium">Amenities</span>
                <input
                  value={form.amenities}
                  onChange={(event) =>
                    updateField("amenities", event.target.value)
                  }
                  placeholder="Showers, Parking"
                  className="rounded-xl border border-[rgb(var(--border))] bg-transparent px-3 py-2 outline-none focus:ring-2 focus:ring-[rgb(var(--brand))]"
                />
              </label>
              <label className="grid gap-1">
                <span className="text-sm font-medium">Tags</span>
                <input
                  value={form.tags}
                  onChange={(event) => updateField("tags", event.target.value)}
                  placeholder="quiet, social, stays"
                  className="rounded-xl border border-[rgb(var(--border))] bg-transparent px-3 py-2 outline-none focus:ring-2 focus:ring-[rgb(var(--brand))]"
                />
              </label>
              <label className="grid gap-1">
                <span className="text-sm font-medium">Admin notes</span>
                <textarea
                  rows={3}
                  value={form.reporterNotes}
                  onChange={(event) =>
                    updateField("reporterNotes", event.target.value)
                  }
                  className="rounded-xl border border-[rgb(var(--border))] bg-transparent px-3 py-2 outline-none focus:ring-2 focus:ring-[rgb(var(--brand))]"
                />
              </label>
            </div>

            {feedback ? (
              <p
                className={
                  feedback.type === "success"
                    ? "text-sm text-[rgb(24,132,84)]"
                    : "text-sm text-[rgb(190,68,68)]"
                }
              >
                {feedback.message}
              </p>
            ) : null}

            <div className="flex flex-wrap gap-3">
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Submitting..." : "Add marker"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setForm(INITIAL_FORM);
                  setSelectedRequestId(null);
                  setImportVerification(null);
                  setImportWarnings([]);
                }}
              >
                Reset
              </Button>
              {form.terrain === "Stays" ? (
                <Button asChild type="button" variant="outline">
                  <Link href={buildStayImportHref(form)}>
                    Finish stay listing
                  </Link>
                </Button>
              ) : null}
            </div>
          </form>
        </section>
      </section>
    </main>
  );
}
