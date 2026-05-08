"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import styles from "./stays-list.module.css";
import type { Listing } from "./stays-data";

type StaysListClientProps = {
  listings: Listing[];
};

type SortOption = "rating" | "price-low" | "price-high";
type RatingFilter = "4_5" | "4" | "3_5";
type CountryOption = { country: string; count: number };

export function StaysListClient({ listings }: StaysListClientProps) {
  const [liveListings, setLiveListings] = useState<Listing[]>(listings);

  useEffect(() => {
    setLiveListings(listings);
  }, [listings]);

  useEffect(() => {
    const controller = new AbortController();

    const pullLatest = async () => {
      try {
        const response = await fetch("/api/bookings/hotels-airbnbs", {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) return;
        const data = (await response.json()) as { listings?: Listing[] };
        if (Array.isArray(data.listings)) setLiveListings(data.listings);
      } catch {
        // silently ignore polling errors
      }
    };

    pullLatest();
    const intervalId = setInterval(pullLatest, 10000);

    return () => {
      controller.abort();
      clearInterval(intervalId);
    };
  }, []);

  const stayTypes = useMemo(() => Array.from(new Set(liveListings.map((listing) => listing.type))), [liveListings]);
  const countryOptions = useMemo(() => {
    const counts = liveListings.reduce((accumulator, listing) => {
      accumulator.set(listing.country, (accumulator.get(listing.country) ?? 0) + 1);
      return accumulator;
    }, new Map<string, number>());

    return Array.from(counts, ([country, count]): CountryOption => ({ country, count })).sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return a.country.localeCompare(b.country);
    });
  }, [liveListings]);
  const emptyTypeFilters = useMemo(() => Object.fromEntries(stayTypes.map((type) => [type, false])) as Record<string, boolean>, [stayTypes]);
  const [selectedCountry, setSelectedCountry] = useState("");
  const [sortBy, setSortBy] = useState<SortOption>("rating");
  const [ratingFilter, setRatingFilter] = useState<RatingFilter | null>(null);
  const [selectedTypes, setSelectedTypes] = useState<Record<string, boolean>>(emptyTypeFilters);

  const hasTypeFilters = Object.values(selectedTypes).some(Boolean);
  const hasActiveFilters =
    selectedCountry.length > 0 ||
    ratingFilter !== null ||
    hasTypeFilters;

  const results = useMemo(() => {
    const filtered = liveListings.filter((listing) => {
      const matchesCountry = selectedCountry.length === 0 || listing.country === selectedCountry;
      const matchesType = !hasTypeFilters || (selectedTypes[listing.type] ?? false);
      const matchesRating =
        ratingFilter === null ||
        (ratingFilter === "4_5" && listing.rating >= 4.5) ||
        (ratingFilter === "4" && listing.rating >= 4) ||
        (ratingFilter === "3_5" && listing.rating >= 3.5);
      return matchesCountry && matchesType && matchesRating;
    });

    return filtered.sort((a, b) => {
      if (sortBy === "price-low") return a.price - b.price;
      if (sortBy === "price-high") return b.price - a.price;
      return b.rating - a.rating;
    });
  }, [hasTypeFilters, liveListings, ratingFilter, selectedCountry, selectedTypes, sortBy]);

  const toggleType = (type: Listing["type"]) => setSelectedTypes((current) => ({ ...current, [type]: !current[type] }));
  const resetFilters = () => {
    setSelectedCountry("");
    setRatingFilter(null);
    setSelectedTypes(emptyTypeFilters);
  };

  return (
    <div className={styles.shell}>

      <section className={styles.searchPanel}>
        <div>
          <h1 className={styles.title}>Find your next stay</h1>
          <p className={styles.subtitle}>Compare hotels, camping, and entire places with unified filters and quick booking links.</p>
        </div>
        <form className={styles.searchRow} aria-label="Accommodation search form" onSubmit={(e) => e.preventDefault()}>
          <label className={`${styles.field} ${styles.selectField}`}>
            <span>Country</span>
            <select value={selectedCountry} onChange={(e) => setSelectedCountry(e.target.value)}>
              <option value="">All countries</option>
              {countryOptions.map((option) => (
                <option key={option.country} value={option.country}>
                  {option.country} ({option.count})
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className={styles.searchButton}>Update results</button>
        </form>
      </section>

      <section className={styles.content}>
        <aside className={styles.filters}>
          <div className={styles.filterCard}>
            <h2>Filters</h2>
            <p className={styles.filterHint}>Narrow results instantly as you choose options.</p>
            <div className={styles.filterGroup}>
              <h3>Rating</h3>
              <label><input type="radio" name="rating" checked={ratingFilter === null} onChange={() => setRatingFilter(null)} /> All ratings</label>
              <label><input type="radio" name="rating" checked={ratingFilter === "4_5"} onChange={() => setRatingFilter("4_5")} /> 4.5+ Outstanding</label>
              <label><input type="radio" name="rating" checked={ratingFilter === "4"} onChange={() => setRatingFilter("4")} /> 4+ Excellent</label>
              <label><input type="radio" name="rating" checked={ratingFilter === "3_5"} onChange={() => setRatingFilter("3_5")} /> 3.5+ Great</label>
            </div>
            <div className={styles.filterGroup}>
              <h3>Type of stay</h3>
              {stayTypes.map((type) => (
                <label key={type}><input type="checkbox" checked={selectedTypes[type] ?? false} onChange={() => toggleType(type)} /> {type}</label>
              ))}
            </div>
            {hasActiveFilters ? (
              <button type="button" className={styles.searchButton} onClick={resetFilters}>
                Reset filters
              </button>
            ) : null}
          </div>
        </aside>

        <div className={styles.resultsWrap}>
          <div className={styles.resultsTop}>
            <h2>{results.length} properties found</h2>
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value as SortOption)}>
              <option value="rating">Highest rating</option>
              <option value="price-low">Price: low to high</option>
              <option value="price-high">Price: high to low</option>
            </select>
          </div>

          {results.length === 0 ? (
            <div className={styles.emptyState}>
              <h3>No stays match your filters</h3>
              <p>Try choosing a different country or enabling more stay types.</p>
            </div>
          ) : (
            <div className={styles.results}>
              {results.map((listing, idx) => (
                <article key={listing.slug} className={styles.card}>
                  <div className={styles.media} style={{ backgroundImage: `url(${listing.gallery[0] ?? `https://picsum.photos/seed/${idx}/900/600`})` }} aria-hidden="true" />

                  <div className={styles.body}>
                    <div className={styles.titleRow}>
                      <h3 className={styles.name}>{listing.name}</h3>
                      <p className={styles.ratingPill}>★ {listing.rating.toFixed(1)}</p>
                    </div>
                    <p className={styles.location}>{listing.placeName}, {listing.country}</p>
                    <ul className={styles.amenities}>
                      {listing.amenities.slice(0, 4).map((amenity) => <li key={amenity}>{amenity}</li>)}
                    </ul>

                    <div className={styles.bottom}>
                      <p className={styles.price}>€{listing.price} <span>/ night</span></p>
                      <div className={styles.actions}>
                        <a href={listing.websiteUrl} target="_blank" rel="noreferrer" className={styles.bookBtn}>Book</a>
                        <Link href={`/bookings/hotels-airbnbs/${listing.slug}`} className={styles.detailsBtn}>See more details</Link>
                      </div>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
