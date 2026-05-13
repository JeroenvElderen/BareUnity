"use client";

import Link from "next/link";
import { ExternalLink, Plus, Sparkles } from "lucide-react";
import { type ChangeEvent, type FormEvent, useState } from "react";
import type { BookingListing } from "@/components/bookings/booking-listing-types";
import { isPlatformAdminEmail } from "@/lib/platform-admin";
import { supabase } from "@/lib/supabase";
import styles from "@/app/admin/stays/page.module.css";

type ListingFormState = {
  slug: string;
  name: string;
  country: string;
  placeName: string;
  type: string;
  rating: string;
  price: string;
  badge: string;
  vibe: string;
  amenities: string;
  description: string;
  websiteUrl: string;
  address: string;
  checkInWindow: string;
  gallery: string;
};

type PolicyDraft = { category: string; items: string };

type ImportDraft = Partial<Omit<BookingListing, "policies">> & {
  policies?: BookingListing["policies"];
  warnings?: string[];
};

type Props = {
  category: "spas" | "activities";
  importCategory: "spa" | "activity";
  title: string;
  subtitle: string;
  listingTypes: string[];
  defaultType: string;
  defaultBadge: string;
  defaultVibe: string;
  defaultCheckInWindow: string;
  viewPath: string;
  saveLabel: string;
};

function listFromText(value: string) {
  return value
    .split(/\r?\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
}

const basePolicies: PolicyDraft[] = [
  { category: "Booking policies", items: "" },
];

function updateFormWithDraft(
  current: ListingFormState,
  draft: ImportDraft,
): ListingFormState {
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
    checkInWindow: draft.checkInWindow ?? current.checkInWindow,
    gallery: draft.gallery?.length ? draft.gallery.join("\n") : current.gallery,
  };
}

function policiesFromDraft(draft: ImportDraft) {
  if (!draft.policies?.length) return null;
  return draft.policies.map((policy) => ({
    category: policy.category,
    items: policy.items.join("\n"),
  }));
}

export function AdminBookingListingManager({
  category,
  importCategory,
  title,
  subtitle,
  listingTypes,
  defaultType,
  defaultBadge,
  defaultVibe,
  defaultCheckInWindow,
  viewPath,
  saveLabel,
}: Props) {
  const emptyForm: ListingFormState = {
    slug: "",
    name: "",
    country: "",
    placeName: "",
    type: defaultType,
    rating: "4.5",
    price: "",
    badge: defaultBadge,
    vibe: defaultVibe,
    amenities: "",
    description: "",
    websiteUrl: "",
    address: "",
    checkInWindow: defaultCheckInWindow,
    gallery: "",
  };

  const [form, setForm] = useState<ListingFormState>(emptyForm);
  const [policies, setPolicies] = useState<PolicyDraft[]>(basePolicies);
  const [importUrl, setImportUrl] = useState("");
  const [isImporting, setIsImporting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState<BookingListing | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);

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

  async function getAdminToken() {
    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();
    if (sessionError || !session?.access_token)
      throw new Error(
        "Please sign in first. We could not verify your admin session.",
      );
    if (!isPlatformAdminEmail(session.user.email))
      throw new Error(
        "This listing manager is restricted to your owner account.",
      );
    return session.access_token;
  }

  async function importListing(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsImporting(true);
    setError("");
    setWarnings([]);
    setSuccess(null);

    try {
      const token = await getAdminToken();
      const response = await fetch(
        `/api/admin/map-spots/import?category=${encodeURIComponent(importCategory)}&url=${encodeURIComponent(importUrl)}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      const payload = (await response.json()) as {
        draft?: ImportDraft;
        error?: string;
      };
      if (!response.ok || !payload.draft)
        throw new Error(payload.error ?? "Could not import this website.");

      setForm((current) => updateFormWithDraft(current, payload.draft ?? {}));
      const importedPolicies = policiesFromDraft(payload.draft);
      if (importedPolicies) setPolicies(importedPolicies);
      setWarnings(payload.draft.warnings ?? []);
    } catch (importError) {
      setError(
        importError instanceof Error
          ? importError.message
          : "Could not import this website.",
      );
    } finally {
      setIsImporting(false);
    }
  }

  async function saveListing(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setError("");
    setSuccess(null);

    try {
      const token = await getAdminToken();
      const response = await fetch(`/api/admin/booking-listings/${category}`, {
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
        listing?: BookingListing;
        error?: string;
      };
      if (!response.ok || !payload.listing)
        throw new Error(payload.error ?? `Could not save this ${saveLabel}.`);

      setSuccess(payload.listing);
      setForm(emptyForm);
      setPolicies(basePolicies);
      setImportUrl("");
      setWarnings([]);
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : `Could not save this ${saveLabel}.`,
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
            <Sparkles size={20} />
          </span>
          <p className={styles.eyebrow}>Admin Studio</p>
          <h1 className={styles.title}>{title}</h1>
          <p className={styles.subtitle}>{subtitle}</p>
        </header>

        <form className={styles.importCard} onSubmit={importListing}>
          <label>
            Website URL to import
            <input
              type="url"
              value={importUrl}
              onChange={(event) => setImportUrl(event.target.value)}
              placeholder="https://example.com"
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
            <Link href={viewPath}>
              View listings <ExternalLink size={14} />
            </Link>
            .
          </p>
        ) : null}

        <form className={styles.form} onSubmit={saveListing}>
          <div className={styles.twoColumns}>
            <label>
              Name
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
              Type
              <select
                name="type"
                value={form.type}
                onChange={updateField}
                required
              >
                {listingTypes.map((type) => (
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
          <label>
            Vibe
            <input name="vibe" value={form.vibe} onChange={updateField} />
          </label>
          <label>
            Booking / schedule window
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
            Amenities / inclusions
            <textarea
              name="amenities"
              value={form.amenities}
              onChange={updateField}
              rows={5}
              required
            />
          </label>
          <label>
            Gallery image URLs
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
                Add booking rules, cancellation notes, prep requirements, or
                etiquette.
              </p>
            </div>
            {policies.map((policy, index) => (
              <div className={styles.policyCard} key={index}>
                <input
                  value={policy.category}
                  onChange={(event) =>
                    updatePolicy(index, "category", event.target.value)
                  }
                  placeholder="Policy category"
                />
                <textarea
                  value={policy.items}
                  onChange={(event) =>
                    updatePolicy(index, "items", event.target.value)
                  }
                  placeholder="Policy items, comma-separated or one per line"
                  rows={3}
                />
              </div>
            ))}
            <button
              className={styles.saveButton}
              type="button"
              onClick={() =>
                setPolicies((current) => [
                  ...current,
                  { category: "", items: "" },
                ])
              }
            >
              <Plus size={16} /> Add policy group
            </button>
          </section>

          <button
            className={styles.saveButton}
            type="submit"
            disabled={isSaving}
          >
            {isSaving ? `Saving ${saveLabel}…` : `Save ${saveLabel}`}
          </button>
        </form>
      </section>
    </main>
  );
}
