"use client";

import Link from "next/link";
import { ChangeEvent, FormEvent, useState } from "react";
import { Bot, ExternalLink, Globe2, Plus, Save, Sparkles, Trash2 } from "lucide-react";

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

const lawResearchTopics = [
  {
    topic: "Public nudity and indecency",
    summary:
      "Research national and local rules for non-sexual public nudity, public order offences, disorderly conduct, and indecent exposure. Note whether enforcement differs by municipality or context.",
  },
  {
    topic: "Official and tolerated naturist places",
    summary:
      "Find official naturist beaches, traditional nude bathing areas, resorts, clubs, spas, saunas, and places where nudity is tolerated by custom rather than written law.",
  },
  {
    topic: "Photography, privacy, and consent",
    summary:
      "Check privacy, harassment, image-sharing, and consent rules that affect taking photos or videos around naturist spaces.",
  },
  {
    topic: "Minors, family spaces, and safeguarding",
    summary:
      "Confirm any child-safeguarding, age-restricted venue, school/group, or family naturism rules that admins should summarize carefully.",
  },
  {
    topic: "Camping, hiking, and outdoor recreation",
    summary:
      "Research whether nudity rules change for camping, hiking, boats, lakes, forests, national parks, and other outdoor recreation areas.",
  },
  {
    topic: "Local enforcement and practical etiquette",
    summary:
      "Collect recent local guidance, tourist-board advice, beach signage, police/municipal notes, and community etiquette so the profile can separate legal facts from practical caution.",
  },
] satisfies Array<Omit<CountryLawRow, "status">>;

type ResearchLink = {
  label: string;
  href: string;
  description: string;
};

type ResearchSource = {
  title: string;
  url: string;
};

function slugifyCountryName(countryName: string) {
  return countryName
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function createSearchUrl(query: string) {
  return `https://www.google.com/search?q=${encodeURIComponent(query)}`;
}

function getCountryResearchLinks(countryName: string): ResearchLink[] {
  const country = countryName.trim() || "Sweden";

  return [
    {
      label: "Public nudity law",
      href: createSearchUrl(`${country} public nudity law naturism nudist legal`),
      description: "Start with statutory public-order, indecency, and non-sexual nudity rules.",
    },
    {
      label: "Official legal sources",
      href: createSearchUrl(`${country} government public order indecent exposure nudity law`),
      description: "Prioritize government, court, municipal, police, and tourist-board sources.",
    },
    {
      label: "Naturist organizations",
      href: createSearchUrl(`${country} naturist federation nude beach official advice`),
      description: "Look for local naturist federation guidance and established club information.",
    },
    {
      label: "Nude beaches and saunas",
      href: createSearchUrl(`${country} nude beach naturist sauna rules`),
      description: "Find named places, accepted customs, signage, and visitor expectations.",
    },
    {
      label: "Photography privacy",
      href: createSearchUrl(`${country} privacy photography consent beach law`),
      description: "Check image capture, sharing, harassment, and consent rules for public places.",
    },
    {
      label: "Recent enforcement/news",
      href: createSearchUrl(`${country} nudity beach police fine naturist news`),
      description: "Cross-check whether recent enforcement changes the practical risk level.",
    },
  ];
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
  const [isAutoResearching, setIsAutoResearching] = useState(false);
  const [error, setError] = useState("");
  const [successSlug, setSuccessSlug] = useState("");
  const [researchCountry, setResearchCountry] = useState(sampleCountry.name);
  const [researchSources, setResearchSources] = useState<ResearchSource[]>([]);

  const researchLinks = getCountryResearchLinks(researchCountry || form.name);

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
    setResearchCountry("");
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
      regions: [],
      beaches: [],
      tags: ["Template country", "Community data needed", "Local tips welcome"],
      heroImage: current.heroImage,
    }));
    setResearchSources([]);
    setError("");
    setSuccessSlug("");
  }

  async function autoResearchCountry() {
    const countryName = (researchCountry || form.name).trim();
    if (!countryName) {
      setError("Enter a country name before starting automatic research.");
      return;
    }

    setIsAutoResearching(true);
    setError("");
    setSuccessSlug("");
    setResearchSources([]);

    try {
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError || !session?.access_token) {
        throw new Error("Please sign in first. We could not verify your admin session.");
      }

      if (!isPlatformAdminEmail(session.user.email)) {
        throw new Error("Automatic country research is restricted to your owner account.");
      }

      const response = await fetch("/api/admin/countries/research", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ countryName }),
      });
      const payload = (await response.json()) as {
        country?: CountryDiscovery;
        sources?: ResearchSource[];
        error?: string;
      };

      if (!response.ok || !payload.country) {
        throw new Error(payload.error ?? "Could not automatically research this country.");
      }

      setForm(fromCountry(payload.country));
      setResearchCountry(payload.country.name);
      setResearchSources(payload.sources ?? []);
    } catch (researchError) {
      setError(
        researchError instanceof Error
          ? researchError.message
          : "Could not automatically research this country.",
      );
    } finally {
      setIsAutoResearching(false);
    }
  }

  function useResearchCountry() {
    const countryName = researchCountry.trim();
    if (!countryName) {
      setError("Enter a country name first, for example Sweden.");
      return;
    }

    setForm((current) => ({
      ...current,
      name: countryName,
      slug: slugifyCountryName(countryName),
      legalStatus: "Research required",
      tags: Array.from(
        new Set([
          ...current.tags.filter(Boolean),
          `${countryName} naturism`,
          "Law research needed",
          "Local source verification",
        ]),
      ),
    }));
    setError("");
  }

  function addLawResearchChecklist() {
    const countryName = (researchCountry || form.name).trim();
    if (!countryName) {
      setError("Enter a country name before adding the law research checklist.");
      return;
    }

    setForm((current) => ({
      ...current,
      name: countryName,
      slug: slugifyCountryName(countryName),
      legalStatus: "Research required",
      laws: lawResearchTopics.map((law) => ({
        ...law,
        status: "caution",
        summary: `${countryName}: ${law.summary}`,
      })),
    }));
    setError("");
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
            <code> country_discovery_profiles</code>. Use guided fields instead of writing JSON by hand.
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

        <section className={styles.panel}>
          <div className={styles.sectionHeader}>
            <div>
              <h2>Country law research assistant</h2>
              <p>
                Type a country such as Sweden, then let ChatGPT research the profile automatically with web search. Manual Google links remain available for verification.
              </p>
            </div>
            <Bot className={styles.headerIcon} size={20} aria-hidden="true" />
          </div>
          <div className={styles.researchControls}>
            <label>
              Country to research
              <input
                value={researchCountry}
                onChange={(event) => setResearchCountry(event.target.value)}
                placeholder="Sweden"
              />
            </label>
            <button className={styles.autoButton} type="button" onClick={autoResearchCountry} disabled={isAutoResearching}>
              <Sparkles size={16} /> {isAutoResearching ? "Researching..." : "Auto-fill with ChatGPT"}
            </button>
            <button className={styles.secondaryButton} type="button" onClick={useResearchCountry}>
              Use in country fields
            </button>
            <button className={styles.smallButton} type="button" onClick={addLawResearchChecklist}>
              <Plus size={14} /> Add law checklist
            </button>
          </div>
          <div className={styles.researchGrid}>
            {researchLinks.map((link) => (
              <a className={styles.researchCard} href={link.href} target="_blank" rel="noreferrer" key={link.label}>
                <span>
                  <strong>{link.label}</strong>
                  <small>{link.description}</small>
                </span>
                <ExternalLink size={16} aria-hidden="true" />
              </a>
            ))}
          </div>
          {researchSources.length > 0 ? (
            <div className={styles.sourcePanel}>
              <strong>Sources used by ChatGPT web research</strong>
              <div className={styles.sourceList}>
                {researchSources.map((source) => (
                  <a href={source.url} target="_blank" rel="noreferrer" key={source.url}>
                    {source.title || source.url}
                  </a>
                ))}
              </div>
            </div>
          ) : null}
          <p className={styles.researchNote}>
            Automatic research drafts the profile for you, but keep it as an admin review step: check the source links, confirm official or reputable local guidance, then save. This helper does not replace legal review.
          </p>
        </section>
        
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
