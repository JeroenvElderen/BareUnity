"use client";

import { useState } from "react";
import { Search, X } from "lucide-react";

import styles from "./explore.module.css";

export function ExploreSearchOverlay() {
  const [isMobileSearchOpen, setIsMobileSearchOpen] = useState(false);

  return (
    <>
      <div className={`${styles.commandBar} ${isMobileSearchOpen ? styles.commandBarOpen : ""}`}>
        <label htmlFor="explore-search" className={styles.searchWrap}>
          <span className={styles.searchLabel}>Search the map</span>
          <div className={styles.searchControls}>
            <input id="explore-search" type="text" placeholder="Search spots, events, routes..." />
            <button
              id="explore-search-submit"
              type="button"
              onClick={() => setIsMobileSearchOpen(false)}
            >
              Search
            </button>
          </div>
        </label>
      </div>

      <button
        className={styles.searchBubble}
        type="button"
        aria-expanded={isMobileSearchOpen}
        aria-controls="explore-search"
        aria-label={isMobileSearchOpen ? "Close map search" : "Open map search"}
        onClick={() => setIsMobileSearchOpen((current) => !current)}
      >
        {isMobileSearchOpen ? <X size={22} /> : <Search size={22} />}
        <span>Search</span>
      </button>
    </>
  );
}
