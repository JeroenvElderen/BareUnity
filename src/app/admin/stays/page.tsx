"use client";

import Link from "next/link";
import { Building2, ExternalLink, Plus, Sparkles } from "lucide-react";
import {
  ChangeEvent,
  FormEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import type { Listing } from "@/app/bookings/hotels-airbnbs/stays-data";
import { isPlatformAdminEmail } from "@/lib/platform-admin";
import { supabase } from "@/lib/supabase";
import styles from "./page.module.css";

const STAY_TYPES: Listing["type"][] = [
  "Hotel",
  "Entire place",
  "Boutique stay",
  "Naturist camping",
];

type StayFormState = {
  slug: string;
  name: string;
  country: string;
  placeName: string;
  type: Listing["type"];
  rating: string;
  price: string;
  badge: string;
  vibe: string;
  amenities: string;
  description: string;
  websiteUrl: string;
  address: string;
  mapLatitude: string;
  mapLongitude: string;
  checkInWindow: string;
  gallery: string;
};

type PolicyDraft = {
  category: string;
  items: string;
};

type ImportDraft = Partial<Omit<Listing, "policies">> & {
  policies?: Array<{
    category: string;
    items: string[];
  }>;
  warnings?: string[];
};

const emptyForm: StayFormState = {
  slug: "",
  name: "",
  country: "",
  placeName: "",
  type: "Hotel",
  rating: "4.5",
  price: "",
  badge: "Website-sourced stay",
  vibe: "Naturist-friendly stay",
  amenities: "",
  description: "",
  websiteUrl: "",
  address: "",
  mapLatitude: "",
  mapLongitude: "",
  checkInWindow: "Check the stay website for current arrival times",
  gallery: "",
};

function listFromText(value: string) {
  return value
    .split(/\r?\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function updateFormWithDraft(
  current: StayFormState,
  draft: ImportDraft,
): StayFormState {
  return {
    ...current,
    slug: draft.slug ?? current.slug,
    name: draft.name ?? current.name,
    country: draft.country ?? current.country,
    placeName: draft.placeName ?? current.placeName,
    type: draft.type ?? current.type,
    rating: draft.rating ? String(Math.min(5, draft.rating)) : current.rating,
    price: draft.price ? String(draft.price) : current.price,
    badge: draft.badge ?? current.badge,
    vibe: draft.vibe ?? current.vibe,
    amenities: draft.amenities?.length
      ? draft.amenities.join("\n")
      : current.amenities,
    description: draft.description ?? current.description,
    websiteUrl: draft.websiteUrl ?? current.websiteUrl,
    address: draft.address ?? current.address,
    ...draftCoordinateFields(draft, current),
    checkInWindow: draft.checkInWindow ?? current.checkInWindow,
    gallery: draft.gallery?.length ? draft.gallery.join("\n") : current.gallery,
  };
}

function draftCoordinateFields(
  draft: ImportDraft,
  current: Pick<StayFormState, "mapLatitude" | "mapLongitude">,
) {
  const latitude = draft.mapLatitude;
  const longitude = draft.mapLongitude;

  if (latitude === undefined && longitude === undefined) {
    return {
      mapLatitude: current.mapLatitude,
      mapLongitude: current.mapLongitude,
    };
  }

  const hasValidLatitude =
    typeof latitude === "number" && Number.isFinite(latitude);
  const hasValidLongitude =
    typeof longitude === "number" && Number.isFinite(longitude);

  if (
    hasValidLatitude &&
    hasValidLongitude &&
    !(latitude === 0 && longitude === 0)
  ) {
    return { mapLatitude: String(latitude), mapLongitude: String(longitude) };
  }

  return { mapLatitude: "", mapLongitude: "" };
}

function policiesFromDraft(draft: ImportDraft) {
  if (!draft.policies?.length) return null;

  return draft.policies.map((policy) => ({
    category: policy.category,
    items: policy.items.join("\n"),
  }));
}

export default function AdminStaysPage() {
  const [form, setForm] = useState<StayFormState>(emptyForm);
  const [policies, setPolicies] = useState<PolicyDraft[]>([
    { category: "Property policy", items: "" },
  ]);
  const [importUrl, setImportUrl] = useState("");
  const [isImporting, setIsImporting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState<Listing | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [sourceRequestId, setSourceRequestId] = useState("");
  const importedHandoffUrlRef = useRef("");

  function updateField(
    event: ChangeEvent<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >,
  ) {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  }

  function updatePolicy(
    index: number,
    field: keyof PolicyDraft,
    value: string,
  ) {
    setPolicies((current) =>
      current.map((policy, policyIndex) =>
        policyIndex === index ? { ...policy, [field]: value } : policy,
      ),
    );
  }

  function addPolicy() {
    setPolicies((current) => [...current, { category: "", items: "" }]);
  }

  const getAdminToken = useCallback(async () => {
    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();

    if (sessionError || !session?.access_token) {
      throw new Error(
        "Please sign in first. We could not verify your admin session.",
      );
    }

    if (!isPlatformAdminEmail(session.user.email)) {
      throw new Error("This stay manager is restricted to your owner account.");
    }

    return session.access_token;
  }, []);

  const importStayFromUrl = useCallback(async (url: string) => {
    setIsImporting(true);
    setError("");
    setWarnings([]);
    setSuccess(null);

    try {
      const token = await getAdminToken();
      const response = await fetch(
        `/api/admin/stays/import?url=${encodeURIComponent(url)}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      const payload = (await response.json()) as {
        draft?: ImportDraft;
        error?: string;
      };

      if (!response.ok || !payload.draft) {
        throw new Error(payload.error ?? "Could not import this stay website.");
      }

      setForm((current) => updateFormWithDraft(current, payload.draft ?? {}));
      const importedPolicies = policiesFromDraft(payload.draft);
      if (importedPolicies) setPolicies(importedPolicies);
      setWarnings(payload.draft.warnings ?? []);
    } catch (importError) {
      setError(
        importError instanceof Error
          ? importError.message
          : "Could not import this stay website.",
      );
    } finally {
      setIsImporting(false);
    }
  }, [getAdminToken]);

  async function importStay(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await importStayFromUrl(importUrl);
  }

  async function deleteSourceRequest(requestId: string, token: string) {
    const response = await fetch(
      `/api/admin/location-requests/${encodeURIComponent(requestId)}`,
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      },
    );
    const payload = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;

    if (!response.ok) {
      throw new Error(
        payload?.error ?? "Saved stay, but could not remove the source request.",
      );
    }
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const handoffWebsite = params.get("website")?.trim() ?? "";
    const handoffRequestId = params.get("sourceRequestId")?.trim() ?? "";
    const handoffName = params.get("name")?.trim() ?? "";
    const handoffLocationHint = params.get("locationHint")?.trim() ?? "";
    const handoffLatitude = params.get("latitude")?.trim() ?? "";
    const handoffLongitude = params.get("longitude")?.trim() ?? "";
    const handoffNotes = params.get("notes")?.trim() ?? "";

    if (handoffRequestId) setSourceRequestId(handoffRequestId);
    if (handoffWebsite) setImportUrl(handoffWebsite);

    if (
      handoffName ||
      handoffWebsite ||
      handoffLocationHint ||
      handoffLatitude ||
      handoffLongitude ||
      handoffNotes
    ) {
      setForm((current) => ({
        ...current,
        name: handoffName || current.name,
        websiteUrl: handoffWebsite || current.websiteUrl,
        address: handoffLocationHint || current.address,
        placeName: handoffLocationHint || current.placeName,
        mapLatitude: handoffLatitude || current.mapLatitude,
        mapLongitude: handoffLongitude || current.mapLongitude,
        description: handoffNotes
          ? [current.description, handoffNotes].filter(Boolean).join("\n\n")
          : current.description,
      }));
    }

    if (handoffWebsite && importedHandoffUrlRef.current !== handoffWebsite) {
      importedHandoffUrlRef.current = handoffWebsite;
      void importStayFromUrl(handoffWebsite);
    }
  }, [importStayFromUrl]);

  async function saveStay(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setError("");
    setSuccess(null);

    try {
      const token = await getAdminToken();
      const response = await fetch("/api/admin/stays", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...form,
          rating: Number(form.rating),
          price: Number(form.price),
          amenities: listFromText(form.amenities),
          gallery: listFromText(form.gallery),
          policies: policies.map((policy) => ({
            category: policy.category,
            items: listFromText(policy.items),
          })),
        }),
      });
      const payload = (await response.json()) as {
        listing?: Listing;
        warnings?: string[];
        error?: string;
      };

      if (!response.ok || !payload.listing) {
        throw new Error(payload.error ?? "Could not save this stay.");
      }

      if (sourceRequestId) {
        await deleteSourceRequest(sourceRequestId, token);
        setSourceRequestId("");
      }

      setSuccess(payload.listing);
      setForm(emptyForm);
      setPolicies([{ category: "House rules", items: "" }]);
      setImportUrl("");
      setWarnings(payload.warnings ?? []);
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Could not save this stay.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <main className={styles.page}>
      <section className={styles.shell}>
        <header className={styles.hero}>
          <span className={styles.iconPill} aria-hidden="true">
            <Building2 size={20} />
          </span>
          <p className={styles.eyebrow}>Admin Studio</p>
          <h1 className={styles.title}>Stay listing manager</h1>
          <p className={styles.subtitle}>
            Import stay details from a public website with optional Ollama cloud
            enrichment, review every field, and save verified hotel, camping,
            resort, or rental listings to the BareUnity stays data store.
          </p>
        </header>

        <form className={styles.importCard} onSubmit={importStay}>
          <label>
            Website URL to import
            <input
              type="url"
              value={importUrl}
              onChange={(event) => setImportUrl(event.target.value)}
              placeholder="https://example-stay.com"
              required
            />
          </label>
          <button type="submit" disabled={isImporting}>
            <Sparkles size={16} /> {isImporting ? "Importing…" : "Import"}
          </button>
        </form>

        {warnings.length ? (
          <aside className={styles.warningBox}>
            <strong>Review before saving</strong>
            <ul>
              {warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          </aside>
        ) : null}

        {error ? <p className={styles.error}>{error}</p> : null}
        {success ? (
          <p className={styles.success}>
            Saved <strong>{success.name}</strong>.{" "}
            <Link href={`/bookings/hotels-airbnbs/${success.slug}`}>
              View listing <ExternalLink size={14} />
            </Link>{" "}
            and added its Explore map marker.
          </p>
        ) : null}

        <form className={styles.form} onSubmit={saveStay}>
          <div className={styles.twoColumns}>
            <label>
              Stay name
              <input
                name="name"
                value={form.name}
                onChange={updateField}
                required
              />
            </label>
            <label>
              Optional slug
              <input
                name="slug"
                value={form.slug}
                onChange={updateField}
                placeholder="auto-generated when blank"
              />
            </label>
            <label>
              Country
              <input
                name="country"
                value={form.country}
                onChange={updateField}
                required
              />
            </label>
            <label>
              Place / region
              <input
                name="placeName"
                value={form.placeName}
                onChange={updateField}
                required
              />
            </label>
            <label>
              Stay type
              <select
                name="type"
                value={form.type}
                onChange={updateField}
                required
              >
                {STAY_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Rating
              <input
                name="rating"
                type="number"
                min="0"
                max="5"
                step="0.1"
                value={form.rating}
                onChange={updateField}
                required
              />
            </label>
            <label>
              Lowest website price
              <input
                name="price"
                type="number"
                min="1"
                step="1"
                value={form.price}
                onChange={updateField}
                required
              />
            </label>
            <label>
              Badge
              <input name="badge" value={form.badge} onChange={updateField} />
            </label>
          </div>

          <label>
            Website URL
            <input
              name="websiteUrl"
              type="url"
              value={form.websiteUrl}
              onChange={updateField}
              required
            />
          </label>
          <label>
            Address
            <input
              name="address"
              value={form.address}
              onChange={updateField}
              required
            />
          </label>
          <div className={styles.mapNotice}>
            <strong>Explore map marker</strong>
            <p>
              Add coordinates when you have them to place the Explore marker
              immediately. If they are blank, BareUnity will try to geocode the
              address, place, and country before saving.
            </p>
          </div>
          <div className={styles.twoColumns}>
            <label>
              Map latitude (optional)
              <input
                name="mapLatitude"
                type="number"
                min="-90"
                max="90"
                step="any"
                value={form.mapLatitude}
                onChange={updateField}
                placeholder="e.g. 38.7223"
              />
            </label>
            <label>
              Map longitude (optional)
              <input
                name="mapLongitude"
                type="number"
                min="-180"
                max="180"
                step="any"
                value={form.mapLongitude}
                onChange={updateField}
                placeholder="e.g. -9.1393"
              />
            </label>
          </div>
          <label>
            Vibe
            <input name="vibe" value={form.vibe} onChange={updateField} />
          </label>
          <label>
            Check-in window
            <input
              name="checkInWindow"
              value={form.checkInWindow}
              onChange={updateField}
            />
          </label>
          <label>
            Description
            <textarea
              name="description"
              value={form.description}
              onChange={updateField}
              rows={5}
              required
            />
          </label>
          <label>
            Amenities (comma-separated or one per line)
            <textarea
              name="amenities"
              value={form.amenities}
              onChange={updateField}
              rows={5}
              required
            />
          </label>
          <label>
            Gallery image URLs (comma-separated or one per line)
            <textarea
              name="gallery"
              value={form.gallery}
              onChange={updateField}
              rows={3}
            />
          </label>

          <section className={styles.policyEditor}>
            <div>
              <h2>Policies</h2>
              <p>
                Add only rules, fees, restrictions, cancellation notes, or
                naturist etiquette—keep activities and amenities out of
                policies.
              </p>
            </div>
            {policies.map((policy, index) => (
              <div className={styles.policyCard} key={index}>
                <input
                  value={policy.category}
                  onChange={(event) =>
                    updatePolicy(index, "category", event.target.value)
                  }
                  placeholder="Policy category (for example, Cancellation)"
                />
                <textarea
                  value={policy.items}
                  onChange={(event) =>
                    updatePolicy(index, "items", event.target.value)
                  }
                  placeholder="Policy facts only; no activities or amenity lists"
                  rows={3}
                />
              </div>
            ))}
            <button
              className={styles.saveButton}
              type="button"
              onClick={addPolicy}
            >
              <Plus size={16} /> Add policy group
            </button>
          </section>

          <button
            className={styles.saveButton}
            type="submit"
            disabled={isSaving}
          >
            {isSaving ? "Saving stay…" : "Save stay listing"}
          </button>
        </form>
      </section>
    </main>
  );
}
