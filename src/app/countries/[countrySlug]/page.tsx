import Image from "next/image";
import type { ReactNode } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Clock,
  Compass,
  Euro,
  Globe2,
  Heart,
  Home,
  Info,
  Languages,
  Map,
  MapPin,
  Share2,
  ShieldCheck,
  Sparkles,
  Star,
  Sun,
  ThermometerSun,
  Umbrella,
  Users,
  Waves,
} from "lucide-react";

import { AppSidebar } from "@/components/sidebar/sidebar";
import { getCountryDiscovery } from "@/lib/country-discovery";
import layoutStyles from "../../page.module.css";
import styles from "./page.module.css";

type CountryDiscoveryPageProps = {
  params: Promise<{ countrySlug: string }>;
};

const glanceIcons: Record<string, typeof Home> = {
  Capital: Home,
  Language: Languages,
  Population: Users,
  Currency: Euro,
  "Time Zone": Clock,
  "Driving Side": Compass,
  "Plug Type": Globe2,
};

export default async function CountryDiscoveryPage({
  params,
}: CountryDiscoveryPageProps) {
  const { countrySlug } = await params;
  const country = await getCountryDiscovery(countrySlug);
  const regions = country.regions.length > 0 ? country.regions : [
    {
      name: `${country.name} regions`,
      score: 1,
      details: "Add regional acceptance, beaches, climate, and resort notes.",
    },
  ];
  const beaches = country.beaches.length > 0 ? country.beaches : [
    {
      name: `${country.name} beach guide`,
      region: "Coming soon",
      rating: "New",
      image:
        "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=700&q=80",
      summary: "Community beach recommendations will appear here.",
    },
  ];

  return (
    <main className={`${layoutStyles.main} ${styles.discoveryMain}`}>
      <AppSidebar />

      <section className={styles.pageShell} aria-label={`${country.name} naturist discovery`}>
        <header className={styles.topBar}>
          <nav className={styles.breadcrumbs} aria-label="Breadcrumb">
            <Link href="/countries">Countries</Link>
            <ChevronRight size={14} aria-hidden />
            <span>{country.continent}</span>
            <ChevronRight size={14} aria-hidden />
            <strong>{country.name}</strong>
          </nav>
          <label className={styles.searchBox}>
            <span className={styles.srOnly}>Search discovery guide</span>
            <input placeholder="Search for places, beaches, resorts..." />
            <Compass size={18} aria-hidden />
          </label>
        </header>

        <section className={styles.heroCard}>
          <Image
            src={country.heroImage}
            alt={`${country.name} coastline`}
            fill
            priority
            sizes="(min-width: 1100px) 1180px, 100vw"
            className={styles.heroImage}
          />
          <div className={styles.heroOverlay} />
          <div className={styles.heroContent}>
            <p className={styles.flagPill}>{country.flag}</p>
            <div>
              <h1>{country.name}</h1>
              <p>{country.tagline}</p>
            </div>
            <div className={styles.heroActions}>
              <button type="button"><Heart size={16} /> Add to favorites</button>
              <button type="button"><Share2 size={16} /> Share</button>
            </div>
          </div>
        </section>

        <section className={styles.statGrid} aria-label={`${country.name} quick stats`}>
          <StatCard icon={ShieldCheck} label="Legal Status" value={country.legalStatus} detail="Naturism guidance" />
          <StatCard icon={Users} label="Social Acceptance" value={`${country.cultureScores["Social Acceptance"] || "New"}%`} detail="Community signal" />
          <StatCard icon={Umbrella} label="Official Beaches" value={country.beachesCount} detail="Along the coastline" />
          <StatCard icon={Home} label="Naturist Resorts" value={country.resortsCount} detail="Resorts & campsites" />
          <StatCard icon={Star} label="BareUnity Rating" value={`${country.communityRating} / 5`} detail="From community" accent />
        </section>

        <section className={styles.contentGrid}>
          <div className={styles.leftColumn}>
            <Card title={`Naturist Laws in ${country.name}`} icon={ShieldCheck}>
              <div className={styles.lawTable}>
                <div className={styles.lawHeader}>Topic</div>
                <div className={styles.lawHeader}>Status</div>
                {country.laws.map((law) => (
                  <div className={styles.lawRow} key={law.topic}>
                    <span>{law.topic}</span>
                    <span>
                      {law.status === "allowed" ? (
                        <CheckCircle2 size={15} className={styles.okIcon} />
                      ) : (
                        <AlertTriangle size={15} className={styles.warnIcon} />
                      )}
                      {law.summary}
                    </span>
                  </div>
                ))}
              </div>
              <aside className={styles.notice}><Info size={18} /> Laws can be interpreted differently in some regions. Always respect local customs and other people.</aside>
            </Card>

            <Card title="Best Regions for Naturists" icon={Map}>
              <div className={styles.regionsLayout}>
                <div className={styles.mapPreview} aria-hidden>
                  <MapPin size={34} />
                  <span>{country.name}</span>
                </div>
                <ol className={styles.regionList}>
                  {regions.map((region) => (
                    <li key={region.name}>
                      <span>{region.score}</span>
                      <div>
                        <strong>{region.name}</strong>
                        <p>{region.details}</p>
                      </div>
                    </li>
                  ))}
                </ol>
                <div className={styles.summaryPanel}>
                  <h3>{country.name} Summary</h3>
                  {country.firstTimeTips.slice(0, 5).map((tip) => (
                    <p key={tip}><CheckCircle2 size={14} />{tip}</p>
                  ))}
                  <div className={styles.ratingStars}>★★★★★ <strong>{country.communityRating}</strong></div>
                </div>
              </div>
            </Card>

            <section className={styles.beachSection}>
              <div className={styles.sectionHeading}>
                <h2>Top Naturist Beaches</h2>
                <Link href="/explore">View all beaches →</Link>
              </div>
              <div className={styles.beachGrid}>
                {beaches.map((beach) => (
                  <article className={styles.beachCard} key={beach.name}>
                    <Image src={beach.image} alt={beach.name} width={420} height={240} />
                    <div>
                      <h3>{beach.name}</h3>
                      <p>{beach.region}</p>
                      <small><Star size={13} /> {beach.rating} · {beach.summary}</small>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          </div>

          <div className={styles.middleColumn}>
            <Card title={`Naturism Culture in ${country.name}`} icon={Sparkles}>
              <div className={styles.scoreList}>
                {Object.entries(country.cultureScores).map(([label, value]) => (
                  <div className={styles.scoreRow} key={label}>
                    <span>{label}</span>
                    <div className={styles.scoreBar}><span style={{ width: `${value}%` }} /></div>
                    <strong>{value}%</strong>
                  </div>
                ))}
              </div>
            </Card>

            <Card title={`First Time Visiting ${country.name}?`} icon={CheckCircle2}>
              <ul className={styles.checkList}>
                {country.firstTimeTips.map((tip) => (
                  <li key={tip}><CheckCircle2 size={15} /> {tip}</li>
                ))}
              </ul>
            </Card>

            <Card title="Naturist Season Guide" icon={ThermometerSun}>
              <div className={styles.seasonTable}>
                <span />
                {country.season.months.map((month, index) => <strong key={`${month}-${index}`}>{month}</strong>)}
                <span>Air Temp (°C)</span>
                {country.season.air.map((temp, index) => <em key={`air-${index}`}>{temp}</em>)}
                <span>Sea Temp (°C)</span>
                {country.season.sea.map((temp, index) => <em key={`sea-${index}`}>{temp}</em>)}
                <span>Naturist Suitability</span>
                {country.season.vibe.map((vibe, index) => <em key={`vibe-${index}`}>{vibe}</em>)}
              </div>
            </Card>

            <Card title="Frequently Asked" icon={Info}>
              <div className={styles.faqList}>
                {country.faqs.map((faq) => (
                  <button type="button" key={faq}>{faq}<ChevronRight size={15} /></button>
                ))}
              </div>
            </Card>
          </div>

          <aside className={styles.rightColumn}>
            <Card title="At a glance" icon={Globe2}>
              <dl className={styles.glanceList}>
                {Object.entries(country.glance).map(([label, value]) => {
                  const Icon = glanceIcons[label] ?? Globe2;
                  return (
                    <div key={label}>
                      <dt><Icon size={15} /> {label}</dt>
                      <dd>{value}</dd>
                    </div>
                  );
                })}
              </dl>
            </Card>

            <Card title="BareUnity Community" icon={Users}>
              <div className={styles.communityStats}>
                <strong>{country.communityMembers}<span>Members visited</span></strong>
                <strong>{country.communityRating}<span>Average rating</span></strong>
              </div>
              <p className={styles.tagIntro}>Most mentioned by members</p>
              <div className={styles.tags}>{country.tags.map((tag) => <span key={tag}>{tag}</span>)}</div>
            </Card>

            <Card title="Naturist Etiquette" icon={Waves}>
              <ul className={styles.iconList}>
                {country.etiquette.map((item, index) => (
                  <li key={item}>{["🧺", "📷", "🚶", "👨‍👩‍👧", "👀", "🌱"][index] ?? "•"} {item}</li>
                ))}
              </ul>
            </Card>

            <Card title="Best time to visit" icon={Sun}>
              <p className={styles.bestTime}>{country.bestTime}</p>
            </Card>

            <div className={styles.ctaCard}>
              <h2>Ready to explore {country.name}?</h2>
              <p>Find beaches, resorts and connect with naturists.</p>
              <div>
                <Link href="/explore">Explore Map</Link>
                <Link href="/bookings/hotels-airbnbs">Find Resorts</Link>
              </div>
            </div>
          </aside>
        </section>
      </section>
    </main>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  detail,
  accent = false,
}: {
  icon: typeof Home;
  label: string;
  value: string;
  detail: string;
  accent?: boolean;
}) {
  return (
    <article className={styles.statCard}>
      <Icon size={31} className={accent ? styles.accentIcon : undefined} aria-hidden />
      <div>
        <p>{label}</p>
        <strong>{value}</strong>
        <span>{detail}</span>
      </div>
    </article>
  );
}

function Card({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: typeof Home;
  children: ReactNode;
}) {
  return (
    <section className={styles.card}>
      <h2><Icon size={18} /> {title}</h2>
      {children}
    </section>
  );
}