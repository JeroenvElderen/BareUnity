"use client";

import Link from "next/link";
import { ChangeEvent, FormEvent, useState } from "react";
import { Globe2, Save } from "lucide-react";

import { COUNTRY_DISCOVERY_DATA, type CountryDiscovery } from "@/lib/country-discovery";
import { isPlatformAdminEmail } from "@/lib/platform-admin";
import { supabase } from "@/lib/supabase";
import styles from "./page.module.css";

type CountryFormState = Omit<CountryDiscovery, "glance" | "cultureScores" | "laws" | "firstTimeTips" | "etiquette" | "regions" | "beaches" | "season" | "faqs" | "tags"> & {
  glance: string;
  cultureScores: string;
  laws: string;
  firstTimeTips: string;
  etiquette: string;
  regions: string;
  beaches: string;
  season: string;
  faqs: string;
  tags: string;
};

const sampleCountry = COUNTRY_DISCOVERY_DATA.spain;

function toPrettyJson(value: unknown) {
  return JSON.stringify(value, null, 2);
}

function toLineList(value: string[]) {
  return value.join("\n");
}

function fromCountry(country: CountryDiscovery): CountryFormState {
  return {
    slug: country.slug,
    name: country.name,
    flag: country.flag,
    continent: country.continent,
    tagline: country.tagline,
    heroImage: country.heroImage,
    legalStatus: country.legalStatus,
    beachesCount: country.beachesCount,
    resortsCount: country.resortsCount,
    communityRating: country.communityRating,
    communityMembers: country.communityMembers,
    glance: toPrettyJson(country.glance),
    cultureScores: toPrettyJson(country.cultureScores),
    laws: toPrettyJson(country.laws),
    firstTimeTips: toLineList(country.firstTimeTips),
    etiquette: toLineList(country.etiquette),
    bestTime: country.bestTime,
    regions: toPrettyJson(country.regions),
    beaches: toPrettyJson(country.beaches),
    season: toPrettyJson(country.season),
    faqs: toLineList(country.faqs),
    tags: toLineList(country.tags),
  };
}

function lineList(value: string) {
  return value
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseJsonField<T>(label: string, value: string): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    throw new Error(`${label} must be valid JSON.`);
  }
}

function payloadFromForm(form: CountryFormState): CountryDiscovery {
  return {
    ...form,
    slug: form.slug.trim().toLowerCase(),
    glance: parseJsonField<Record<string, string>>("Quick glance", form.glance),
    cultureScores: parseJsonField<Record<string, number>>("Culture scores", form.cultureScores),
    laws: parseJsonField<CountryDiscovery["laws"]>("Naturist laws", form.laws),
    firstTimeTips: lineList(form.firstTimeTips),
    etiquette: lineList(form.etiquette),
    regions: parseJsonField<CountryDiscovery["regions"]>("Regions", form.regions),
    beaches: parseJsonField<CountryDiscovery["beaches"]>("Beaches", form.beaches),
    season: parseJsonField<CountryDiscovery["season"]>("Season guide", form.season),
    faqs: lineList(form.faqs),
    tags: lineList(form.tags),
  };
}

export default function AdminCountriesPage() {
  const [form, setForm] = useState<CountryFormState>(fromCountry(sampleCountry));
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [successSlug, setSuccessSlug] = useState("");

  function updateField(event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  }

  function startBlankCountry() {
    setForm((current) => ({
      ...fromCountry(sampleCountry),
      slug: "",
      name: "",
      flag: "🌍",
      continent: "",
      tagline: "",
      legalStatus: "Researching",
      beachesCount: "Coming soon",
      resortsCount: "Coming soon",
      communityRating: "New",
      communityMembers: "0",
      regions: "[]",
      beaches: "[]",
      tags: "Template country\nCommunity data needed\nLocal tips welcome",
      heroImage: current.heroImage,
    }));
    setError("");
    setSuccessSlug("");
  }

  async function saveCountry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setError("");
    setSuccessSlug("");

    try {
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError || !session?.access_token) {
        throw new Error("Please sign in first. We could not verify your admin session.");
      }

      if (!isPlatformAdminEmail(session.user.email)) {
        throw new Error("This country manager is restricted to your owner account.");
      }

      const country = payloadFromForm(form);
      const response = await fetch("/api/admin/countries", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(country),
      });
      const payload = (await response.json()) as {
        country?: { slug: string; name: string };
        error?: string;
      };

      if (!response.ok || !payload.country) {
        throw new Error(payload.error ?? "Could not save this country profile.");
      }

      setSuccessSlug(payload.country.slug);
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Could not save this country profile.",
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
            <Globe2 size={20} />
          </span>
          <p className={styles.eyebrow}>Admin Studio</p>
          <h1 className={styles.title}>Country discovery manager</h1>
          <p className={styles.subtitle}>
            Fill every country detail shown on the public Countries page, then save it to
            <code> country_discovery_profiles</code>. Use the Spain template as a safe starting point.
          </p>
          <button className={styles.secondaryButton} type="button" onClick={startBlankCountry}>
            Start a blank country
          </button>
        </header>

        {error ? <p className={styles.error}>{error}</p> : null}
        {successSlug ? (
          <p className={styles.success}>
            Saved country profile. <Link href={`/countries/${successSlug}`}>View public page</Link>
          </p>
        ) : null}

        <form className={styles.form} onSubmit={saveCountry}>
          <section className={styles.panel}>
            <h2>Core details</h2>
            <div className={styles.twoColumns}>
              <label>Country name<input name="name" value={form.name} onChange={updateField} required /></label>
              <label>URL slug<input name="slug" value={form.slug} onChange={updateField} placeholder="spain" required /></label>
              <label>Flag emoji<input name="flag" value={form.flag} onChange={updateField} required /></label>
              <label>Continent<input name="continent" value={form.continent} onChange={updateField} required /></label>
              <label>Legal status<input name="legalStatus" value={form.legalStatus} onChange={updateField} required /></label>
              <label>Official beaches<input name="beachesCount" value={form.beachesCount} onChange={updateField} required /></label>
              <label>Naturist resorts<input name="resortsCount" value={form.resortsCount} onChange={updateField} required /></label>
              <label>Community rating<input name="communityRating" value={form.communityRating} onChange={updateField} required /></label>
              <label>Community members<input name="communityMembers" value={form.communityMembers} onChange={updateField} required /></label>
              <label>Hero image URL<input name="heroImage" type="url" value={form.heroImage} onChange={updateField} required /></label>
            </div>
            <label>Tagline<textarea name="tagline" value={form.tagline} onChange={updateField} rows={3} required /></label>
            <label>Best time to visit<textarea name="bestTime" value={form.bestTime} onChange={updateField} rows={2} required /></label>
          </section>

          <section className={styles.panel}>
            <h2>Page sections</h2>
            <div className={styles.twoColumns}>
              <label>Quick glance JSON<textarea name="glance" value={form.glance} onChange={updateField} rows={10} required /></label>
              <label>Culture scores JSON<textarea name="cultureScores" value={form.cultureScores} onChange={updateField} rows={10} required /></label>
              <label>Naturist laws JSON<textarea name="laws" value={form.laws} onChange={updateField} rows={14} required /></label>
              <label>Regions JSON<textarea name="regions" value={form.regions} onChange={updateField} rows={14} required /></label>
              <label>Beaches JSON<textarea name="beaches" value={form.beaches} onChange={updateField} rows={14} required /></label>
              <label>Season guide JSON<textarea name="season" value={form.season} onChange={updateField} rows={14} required /></label>
            </div>
          </section>

          <section className={styles.panel}>
            <h2>Lists</h2>
            <p>Enter one item per line.</p>
            <div className={styles.twoColumns}>
              <label>First-time tips<textarea name="firstTimeTips" value={form.firstTimeTips} onChange={updateField} rows={7} required /></label>
              <label>Etiquette<textarea name="etiquette" value={form.etiquette} onChange={updateField} rows={7} required /></label>
              <label>FAQs<textarea name="faqs" value={form.faqs} onChange={updateField} rows={7} required /></label>
              <label>Tags<textarea name="tags" value={form.tags} onChange={updateField} rows={7} required /></label>
            </div>
          </section>

          <button className={styles.saveButton} type="submit" disabled={isSaving}>
            <Save size={16} /> {isSaving ? "Saving country…" : "Save country profile"}
          </button>
        </form>
      </section>
    </main>
  );
}
