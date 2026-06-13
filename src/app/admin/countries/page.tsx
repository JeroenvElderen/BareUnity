"use client";

import Link from "next/link";
import { ChangeEvent, FormEvent, useEffect, useRef, useState } from "react";
import { Globe2, Plus, Save, Trash2 } from "lucide-react";

import {
  COUNTRY_DISCOVERY_DATA,
  type CountryDiscovery,
  type CountryLawRow,
} from "@/lib/country-discovery";
import { isPlatformAdminEmail } from "@/lib/platform-admin";
import { supabase } from "@/lib/supabase";
import styles from "./page.module.css";

type KeyValueRow = {
  key: string;
  value: string;
};

type ScoreRow = {
  label: string;
  score: number;
};

type SeasonRow = {
  month: string;
  air: number;
  sea: number;
  vibe: string;
};

type CountryFormState = Omit<
  CountryDiscovery,
  | "glance"
  | "cultureScores"
  | "firstTimeTips"
  | "etiquette"
  | "season"
  | "faqs"
  | "tags"
> & {
  glance: KeyValueRow[];
  cultureScores: ScoreRow[];
  firstTimeTips: string[];
  etiquette: string[];
  season: SeasonRow[];
  faqs: string[];
  tags: string[];
};

const sampleCountry = COUNTRY_DISCOVERY_DATA.spain;

function slugFromName(name: string) {
  return name
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function blankCountryFromName(name: string, currentHeroImage: string): CountryFormState {
  return {
    ...fromCountry(sampleCountry),
    slug: slugFromName(name),
    name,
    flag: "🌍",
    continent: "",
    tagline: "",
    legalStatus: "Researching",
    beachesCount: "Coming soon",
    resortsCount: "Coming soon",
    communityRating: "New",
    communityMembers: "0",
    regions: [],
    beaches: [],
    tags: ["Template country", "Community data needed", "Local tips welcome"],
    heroImage: currentHeroImage,
  };
}

async function parseJsonResponse<T>(response: Response): Promise<T | null> {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    return null;
  }

  try {
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

function fallbackRequestError(response: Response, action: string) {
  return `${action} failed with a non-JSON response (${response.status} ${response.statusText || "Unknown status"}). Please try again or check the server logs.`;
}

function recordToRows(record: Record<string, string>): KeyValueRow[] {
  return Object.entries(record).map(([key, value]) => ({ key, value }));
}

function scoresToRows(record: Record<string, number>): ScoreRow[] {
  return Object.entries(record).map(([label, score]) => ({ label, score }));
}

function seasonToRows(season: CountryDiscovery["season"]): SeasonRow[] {
  return season.months.map((month, index) => ({
    month,
    air: season.air[index] ?? 0,
    sea: season.sea[index] ?? 0,
    vibe: season.vibe[index] ?? "☀️",
  }));
}

function rowsToStringRecord(rows: KeyValueRow[]) {
  return Object.fromEntries(
    rows
      .map((row) => [row.key.trim(), row.value.trim()] as const)
      .filter(([key, value]) => key && value),
  );
}

function rowsToNumberRecord(rows: ScoreRow[]) {
  return Object.fromEntries(
    rows
      .map((row) => [row.label.trim(), Number(row.score)] as const)
      .filter(([label]) => label),
  );
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
    glance: recordToRows(country.glance),
    cultureScores: scoresToRows(country.cultureScores),
    laws: country.laws,
    firstTimeTips: country.firstTimeTips,
    etiquette: country.etiquette,
    bestTime: country.bestTime,
    regions: country.regions,
    beaches: country.beaches,
    season: seasonToRows(country.season),
    faqs: country.faqs,
    tags: country.tags,
  };
}

function payloadFromForm(form: CountryFormState): CountryDiscovery {
  return {
    ...form,
    slug: form.slug.trim().toLowerCase(),
    glance: rowsToStringRecord(form.glance),
    cultureScores: rowsToNumberRecord(form.cultureScores),
    laws: form.laws.map((law) => ({
      topic: law.topic.trim(),
      status: law.status,
      summary: law.summary.trim(),
    })),
    firstTimeTips: form.firstTimeTips.map((item) => item.trim()).filter(Boolean),
    etiquette: form.etiquette.map((item) => item.trim()).filter(Boolean),
    regions: form.regions.map((region) => ({
      name: region.name.trim(),
      score: Number(region.score),
      details: region.details.trim(),
    })),
    beaches: form.beaches.map((beach) => ({
      name: beach.name.trim(),
      region: beach.region.trim(),
      rating: beach.rating.trim(),
      image: beach.image.trim(),
      summary: beach.summary.trim(),
    })),
    season: {
      months: form.season.map((row) => row.month.trim()),
      air: form.season.map((row) => Number(row.air)),
      sea: form.season.map((row) => Number(row.sea)),
      vibe: form.season.map((row) => row.vibe.trim()),
    },
    faqs: form.faqs.map((item) => item.trim()).filter(Boolean),
    tags: form.tags.map((item) => item.trim()).filter(Boolean),
  };
}

export default function AdminCountriesPage() {
  const [form, setForm] = useState<CountryFormState>(fromCountry(sampleCountry));
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [successSlug, setSuccessSlug] = useState("");
  const [lookupStatus, setLookupStatus] = useState("");
  const lastLookupName = useRef(sampleCountry.name.toLowerCase());
  function updateField(event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  }

  function updateRow<T extends keyof CountryFormState>(
    field: T,
    index: number,
    value: CountryFormState[T] extends Array<infer Item> ? Partial<Item> : never,
  ) {
    setForm((current) => {
      const rows = current[field];
      if (!Array.isArray(rows)) return current;

      return {
        ...current,
        [field]: rows.map((row, rowIndex) =>
          rowIndex === index && typeof row === "object" && row !== null
            ? { ...row, ...value }
            : row,
        ),
      };
    });
  }

  function addRow<T extends keyof CountryFormState>(field: T, row: CountryFormState[T] extends Array<infer Item> ? Item : never) {
    setForm((current) => {
      const rows = current[field];
      if (!Array.isArray(rows)) return current;
      return { ...current, [field]: [...rows, row] };
    });
  }

  function removeRow<T extends keyof CountryFormState>(field: T, index: number) {
    setForm((current) => {
      const rows = current[field];
      if (!Array.isArray(rows)) return current;
      return { ...current, [field]: rows.filter((_, rowIndex) => rowIndex !== index) };
    });
  }

  function updateListItem(field: "firstTimeTips" | "etiquette" | "faqs" | "tags", index: number, value: string) {
    setForm((current) => ({
      ...current,
      [field]: current[field].map((item, itemIndex) => (itemIndex === index ? value : item)),
    }));
  }

  function addListItem(field: "firstTimeTips" | "etiquette" | "faqs" | "tags") {
    setForm((current) => ({ ...current, [field]: [...current[field], ""] }));
  }

  function removeListItem(field: "firstTimeTips" | "etiquette" | "faqs" | "tags", index: number) {
    setForm((current) => ({
      ...current,
      [field]: current[field].filter((_, itemIndex) => itemIndex !== index),
    }));
  }

  function startBlankCountry() {
    setForm((current) => blankCountryFromName("", current.heroImage));
    lastLookupName.current = "";
    setLookupStatus("");
    setError("");
    setSuccessSlug("");
  }

  useEffect(() => {
    const requestedName = form.name.trim();
    const lookupKey = requestedName.toLowerCase();
    if (!requestedName || lookupKey === lastLookupName.current) return;

    const timeout = window.setTimeout(async () => {
      setLookupStatus(`Checking ${requestedName}…`);
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

        const response = await fetch(`/api/admin/countries?name=${encodeURIComponent(requestedName)}`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        const payload = await parseJsonResponse<{
          country?: CountryDiscovery | null;
          error?: string;
        }>(response);

        if (!response.ok) {
          throw new Error(payload?.error ?? fallbackRequestError(response, "Loading this country profile"));
        }

        lastLookupName.current = lookupKey;
        if (payload?.country) {
          setForm(fromCountry(payload.country));
          setLookupStatus(`Loaded existing data for ${payload.country.name}.`);
          return;
        }

        setForm((current) => blankCountryFromName(requestedName, current.heroImage));
        setLookupStatus(`No saved data for ${requestedName} yet. Started a new profile.`);
      } catch (lookupError) {
        setLookupStatus("");
        setError(
          lookupError instanceof Error
            ? lookupError.message
            : "Could not check whether this country already exists.",
        );
      }
    }, 800);

    return () => window.clearTimeout(timeout);
  }, [form.name]);

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
      const payload = await parseJsonResponse<{
        country?: { slug: string; name: string };
        error?: string;
      }>(response);

      if (!response.ok || !payload?.country) {
        throw new Error(payload?.error ?? fallbackRequestError(response, "Saving this country profile"));
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
            <code> country_discovery_profiles</code>. Use guided fields instead of writing JSON by hand.
          </p>
          <button className={styles.secondaryButton} type="button" onClick={startBlankCountry}>
            Start a blank country
          </button>
        </header>

        {error ? <p className={styles.error}>{error}</p> : null}
        {lookupStatus ? <p className={styles.info}>{lookupStatus}</p> : null}
        {successSlug ? (
          <p className={styles.success}>
            Saved country profile. <Link href={`/countries/${successSlug}`}>View public page</Link>
          </p>
        ) : null}

        <form className={styles.form} onSubmit={saveCountry}>
          <section className={styles.panel}>
            <h2>Core details</h2>
            <div className={styles.twoColumns}>
              <label>Country name<input name="name" value={form.name} onChange={updateField} placeholder="Type a country name" required /></label>
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
            <div className={styles.sectionHeader}>
              <div>
                <h2>Quick glance</h2>
                <p>Add small facts such as capital, language, currency, or plug type.</p>
              </div>
              <button className={styles.smallButton} type="button" onClick={() => addRow("glance", { key: "", value: "" })}>
                <Plus size={14} /> Add fact
              </button>
            </div>
            <div className={styles.stack}>
              {form.glance.map((row, index) => (
                <div className={styles.inlineRow} key={`glance-${index}`}>
                  <label>Label<input value={row.key} onChange={(event) => updateRow("glance", index, { key: event.target.value })} placeholder="Capital" required /></label>
                  <label>Value<input value={row.value} onChange={(event) => updateRow("glance", index, { value: event.target.value })} placeholder="Madrid" required /></label>
                  <button className={styles.iconButton} type="button" onClick={() => removeRow("glance", index)} aria-label="Remove quick glance fact">
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
          </section>

          <section className={styles.panel}>
            <div className={styles.sectionHeader}>
              <div>
                <h2>Culture scores</h2>
                <p>Score each category from 0 to 100.</p>
              </div>
              <button className={styles.smallButton} type="button" onClick={() => addRow("cultureScores", { label: "", score: 80 })}>
                <Plus size={14} /> Add score
              </button>
            </div>
            <div className={styles.twoColumns}>
              {form.cultureScores.map((row, index) => (
                <div className={styles.inlineRow} key={`score-${index}`}>
                  <label>Category<input value={row.label} onChange={(event) => updateRow("cultureScores", index, { label: event.target.value })} placeholder="Beginner Friendly" required /></label>
                  <label>Score<input type="number" min="0" max="100" value={row.score} onChange={(event) => updateRow("cultureScores", index, { score: Number(event.target.value) })} required /></label>
                  <button className={styles.iconButton} type="button" onClick={() => removeRow("cultureScores", index)} aria-label="Remove culture score">
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
          </section>

          <section className={styles.panel}>
            <div className={styles.sectionHeader}>
              <div>
                <h2>Naturist laws</h2>
                <p>Use cards for each law or practical rule.</p>
              </div>
              <button className={styles.smallButton} type="button" onClick={() => addRow("laws", { topic: "", status: "caution", summary: "" })}>
                <Plus size={14} /> Add law
              </button>
            </div>
            <div className={styles.cardGrid}>
              {form.laws.map((law, index) => (
                <article className={styles.editCard} key={`law-${index}`}>
                  <div className={styles.cardHeader}>
                    <strong>Law #{index + 1}</strong>
                    <button className={styles.iconButton} type="button" onClick={() => removeRow("laws", index)} aria-label="Remove law">
                      <Trash2 size={16} />
                    </button>
                  </div>
                  <label>Topic<input value={law.topic} onChange={(event) => updateRow("laws", index, { topic: event.target.value })} required /></label>
                  <label>Status<select value={law.status} onChange={(event: ChangeEvent<HTMLSelectElement>) => updateRow("laws", index, { status: event.target.value as CountryLawRow["status"] })} required><option value="allowed">Allowed</option><option value="caution">Caution</option></select></label>
                  <label>Summary<textarea value={law.summary} onChange={(event) => updateRow("laws", index, { summary: event.target.value })} rows={3} required /></label>
                </article>
              ))}
            </div>
          </section>

          <section className={styles.panel}>
            <div className={styles.sectionHeader}>
              <div>
                <h2>Regions</h2>
                <p>Add notable regions and give each one a friendliness score.</p>
              </div>
              <button className={styles.smallButton} type="button" onClick={() => addRow("regions", { name: "", score: 80, details: "" })}>
                <Plus size={14} /> Add region
              </button>
            </div>
            <div className={styles.cardGrid}>
              {form.regions.map((region, index) => (
                <article className={styles.editCard} key={`region-${index}`}>
                  <div className={styles.cardHeader}>
                    <strong>Region #{index + 1}</strong>
                    <button className={styles.iconButton} type="button" onClick={() => removeRow("regions", index)} aria-label="Remove region">
                      <Trash2 size={16} />
                    </button>
                  </div>
                  <label>Name<input value={region.name} onChange={(event) => updateRow("regions", index, { name: event.target.value })} required /></label>
                  <label>Score<input type="number" min="1" value={region.score} onChange={(event) => updateRow("regions", index, { score: Number(event.target.value) })} required /></label>
                  <label>Details<textarea value={region.details} onChange={(event) => updateRow("regions", index, { details: event.target.value })} rows={3} required /></label>
                </article>
              ))}
            </div>
          </section>

          <section className={styles.panel}>
            <div className={styles.sectionHeader}>
              <div>
                <h2>Beaches</h2>
                <p>Add beach cards with ratings, images, and short summaries.</p>
              </div>
              <button className={styles.smallButton} type="button" onClick={() => addRow("beaches", { name: "", region: "", rating: "4.5", image: "", summary: "" })}>
                <Plus size={14} /> Add beach
              </button>
            </div>
            <div className={styles.cardGrid}>
              {form.beaches.map((beach, index) => (
                <article className={styles.editCard} key={`beach-${index}`}>
                  <div className={styles.cardHeader}>
                    <strong>Beach #{index + 1}</strong>
                    <button className={styles.iconButton} type="button" onClick={() => removeRow("beaches", index)} aria-label="Remove beach">
                      <Trash2 size={16} />
                    </button>
                  </div>
                  <div className={styles.twoColumns}>
                    <label>Name<input value={beach.name} onChange={(event) => updateRow("beaches", index, { name: event.target.value })} required /></label>
                    <label>Region<input value={beach.region} onChange={(event) => updateRow("beaches", index, { region: event.target.value })} required /></label>
                    <label>Rating<input value={beach.rating} onChange={(event) => updateRow("beaches", index, { rating: event.target.value })} required /></label>
                    <label>Image URL<input type="url" value={beach.image} onChange={(event) => updateRow("beaches", index, { image: event.target.value })} required /></label>
                  </div>
                  <label>Summary<textarea value={beach.summary} onChange={(event) => updateRow("beaches", index, { summary: event.target.value })} rows={3} required /></label>
                </article>
              ))}
            </div>
          </section>

          <section className={styles.panel}>
            <div className={styles.sectionHeader}>
              <div>
                <h2>Season guide</h2>
                <p>Fill the 12 monthly temperature and vibe rows.</p>
              </div>
            </div>
            <div className={styles.seasonGrid}>
              {form.season.map((row, index) => (
                <div className={styles.seasonRow} key={`season-${index}`}>
                  <label>Month<input value={row.month} onChange={(event) => updateRow("season", index, { month: event.target.value })} required /></label>
                  <label>Air °C<input type="number" value={row.air} onChange={(event) => updateRow("season", index, { air: Number(event.target.value) })} required /></label>
                  <label>Sea °C<input type="number" value={row.sea} onChange={(event) => updateRow("season", index, { sea: Number(event.target.value) })} required /></label>
                  <label>Vibe<input value={row.vibe} onChange={(event) => updateRow("season", index, { vibe: event.target.value })} required /></label>
                </div>
              ))}
            </div>
          </section>

          <section className={styles.panel}>
            <h2>Lists</h2>
            <p>Add one item per field. Use the plus buttons for more entries.</p>
            <div className={styles.listGrid}>
              <EditableList title="First-time tips" items={form.firstTimeTips} onAdd={() => addListItem("firstTimeTips")} onChange={(index, value) => updateListItem("firstTimeTips", index, value)} onRemove={(index) => removeListItem("firstTimeTips", index)} />
              <EditableList title="Etiquette" items={form.etiquette} onAdd={() => addListItem("etiquette")} onChange={(index, value) => updateListItem("etiquette", index, value)} onRemove={(index) => removeListItem("etiquette", index)} />
              <EditableList title="FAQs" items={form.faqs} onAdd={() => addListItem("faqs")} onChange={(index, value) => updateListItem("faqs", index, value)} onRemove={(index) => removeListItem("faqs", index)} />
              <EditableList title="Tags" items={form.tags} onAdd={() => addListItem("tags")} onChange={(index, value) => updateListItem("tags", index, value)} onRemove={(index) => removeListItem("tags", index)} />
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

type EditableListProps = {
  title: string;
  items: string[];
  onAdd: () => void;
  onChange: (index: number, value: string) => void;
  onRemove: (index: number) => void;
};

function EditableList({ title, items, onAdd, onChange, onRemove }: EditableListProps) {
  return (
    <section className={styles.listPanel}>
      <div className={styles.sectionHeader}>
        <h3>{title}</h3>
        <button className={styles.smallButton} type="button" onClick={onAdd}>
          <Plus size={14} /> Add
        </button>
      </div>
      <div className={styles.stack}>
        {items.map((item, index) => (
          <div className={styles.inlineRow} key={`${title}-${index}`}>
            <label>
              Item #{index + 1}
              <input value={item} onChange={(event) => onChange(index, event.target.value)} required />
            </label>
            <button className={styles.iconButton} type="button" onClick={() => onRemove(index)} aria-label={`Remove ${title} item`}>
              <Trash2 size={16} />
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
