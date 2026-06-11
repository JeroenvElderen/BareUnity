import Image from "next/image";
import Link from "next/link";
import { ChevronRight, Globe2, Star } from "lucide-react";

import { AppSidebar } from "@/components/sidebar/sidebar";
import { getFeaturedCountries } from "@/lib/country-discovery";
import layoutStyles from "../page.module.css";
import styles from "./page.module.css";

export default async function CountriesPage() {
  const countries = await getFeaturedCountries();

  return (
    <main className={`${layoutStyles.main} ${styles.countriesMain}`}>
      <AppSidebar />
      <section className={styles.pageShell} aria-label="Country discovery">
        <div className={styles.heroPanel}>
          <p><Globe2 size={18} /> Country discovery</p>
          <h1>Explore naturist laws, beaches, resorts, and community tips by country.</h1>
          <span>
            These dynamic country pages are reusable templates, so BareUnity can add local content for every destination.
          </span>
        </div>

        <div className={styles.countryGrid}>
          {countries.map((country) => (
            <Link className={styles.countryCard} href={`/countries/${country.slug}`} key={country.slug}>
              <Image src={country.heroImage} alt={`${country.name} coastline`} width={680} height={380} />
              <div>
                <p>{country.flag} {country.continent}</p>
                <h2>{country.name}</h2>
                <span>{country.tagline}</span>
                <strong><Star size={15} /> {country.communityRating} / 5 <ChevronRight size={16} /></strong>
              </div>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}