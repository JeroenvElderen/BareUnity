"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

import { supabase } from "@/lib/supabase";

type NaturistSpot = {
  id: string;
  name: string;
  description: string;
  coordinates: [number, number];
  privacy: "Public" | "Discreet";
};

type SupabaseMapSpot = {
  id: string;
  name: string;
  description: string;
  latitude: number;
  longitude: number;
  privacy: "Public" | "Discreet" | null;
};

type GeocodeResult = {
  place_id: string;
  display_name: string;
  lat: string;
  lon: string;
  type: string;
  class: string;
};

declare global {
  interface Window {
    maplibregl?: {
      Map: new (config: {
        container: HTMLElement;
        style: object;
        center: [number, number];
        zoom: number;
      }) => {
        remove: () => void;
        flyTo: (config: { center: [number, number]; zoom?: number }) => void;
      };
      Marker: new (config?: { element?: HTMLElement }) => {
        setLngLat: (coords: [number, number]) => {
          setPopup: (popup: unknown) => {
            addTo: (map: unknown) => void;
          };
          addTo: (map: unknown) => void;
        };
      };
      Popup: new (config?: { offset?: number }) => {
        setHTML: (html: string) => {
          setLngLat: (coords: [number, number]) => {
            addTo: (map: unknown) => {
              remove?: () => void;
            };
          };
        };
      };
    };
  }
}

const FALLBACK_NATURIST_SPOTS: NaturistSpot[] = [
  {
    id: "dunes-cove",
    name: "Sun Dunes Cove",
    description: "A sandy cove known for respectful naturist visitors during calm mornings.",
    coordinates: [4.245, 52.108],
    privacy: "Public",
  },
  {
    id: "pine-lake",
    name: "Pine Lake Point",
    description: "Quiet shoreline clearing. Ideal for short mindful sessions and sunbathing.",
    coordinates: [5.287, 52.167],
    privacy: "Discreet",
  },
  {
    id: "river-bend",
    name: "River Bend Meadow",
    description: "Natural grass terrace by the river. Keep noise low and leave no trace.",
    coordinates: [5.124, 51.942],
    privacy: "Discreet",
  },
  {
    id: "north-beach",
    name: "North Shore Naturist Area",
    description: "Open beach section with easy access and enough space for groups.",
    coordinates: [4.477, 52.632],
    privacy: "Public",
  },
];

let mapLibreLoader: Promise<void> | null = null;

function loadMapLibreAssets() {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.maplibregl) return Promise.resolve();
  if (mapLibreLoader) return mapLibreLoader;

  mapLibreLoader = new Promise<void>((resolve, reject) => {
    const cssId = "maplibre-css";
    if (!document.getElementById(cssId)) {
      const css = document.createElement("link");
      css.id = cssId;
      css.rel = "stylesheet";
      css.href = "https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css";
      document.head.appendChild(css);
    }

    const script = document.createElement("script");
    script.src = "https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load MapLibre from CDN."));
    document.head.appendChild(script);
  });

  return mapLibreLoader;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function toNaturistSpot(row: SupabaseMapSpot): NaturistSpot {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    coordinates: [row.longitude, row.latitude],
    privacy: row.privacy === "Public" ? "Public" : "Discreet",
  };
}

export default function NaturistMapChannel() {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<{ remove: () => void; flyTo: (config: { center: [number, number]; zoom?: number }) => void } | null>(null);
  const popupRef = useRef<{ remove?: () => void } | null>(null);

  const [mapError, setMapError] = useState<string | null>(null);
  const [dataError, setDataError] = useState<string | null>(null);
  const [spots, setSpots] = useState<NaturistSpot[]>(FALLBACK_NATURIST_SPOTS);
  const [mode, setMode] = useState<"Explorer" | "Creator">("Explorer");

  const [isAddingSpot, setIsAddingSpot] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchResults, setSearchResults] = useState<GeocodeResult[]>([]);
  const [selectedCoords, setSelectedCoords] = useState<[number, number] | null>(null);
  const [selectedLocationLabel, setSelectedLocationLabel] = useState<string | null>(null);
  const [selectedSpotId, setSelectedSpotId] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [newSpot, setNewSpot] = useState({
    name: "",
    description: "",
    privacy: "Discreet" as NaturistSpot["privacy"],
  });
  const [privacyFilter, setPrivacyFilter] = useState<"All" | NaturistSpot["privacy"]>("All");

  const publicCount = useMemo(() => spots.filter((spot) => spot.privacy === "Public").length, [spots]);
  const discreetCount = useMemo(() => spots.filter((spot) => spot.privacy === "Discreet").length, [spots]);

  useEffect(() => {
    let active = true;

    async function loadSpots() {
      const { data, error } = await supabase
        .from("naturist_map_spots")
        .select("id, name, description, latitude, longitude, privacy")
        .order("name", { ascending: true });

      if (!active) return;

      if (error) {
        console.error(error);
        setDataError("Could not load locations from Supabase. Showing fallback locations.");
        return;
      }

      const mapped = (data as SupabaseMapSpot[] | null)?.map(toNaturistSpot) ?? [];
      if (mapped.length > 0) {
        setSpots(mapped);
      }
    }

    loadSpots();

    return () => {
      active = false;
    };
  }, []);

  const mapCenter = useMemo<[number, number]>(() => {
    if (selectedCoords) return selectedCoords;
    if (spots.length === 0) return [4.9, 52.2];

    const [lngTotal, latTotal] = spots.reduce(
      ([lngSum, latSum], spot) => [lngSum + spot.coordinates[0], latSum + spot.coordinates[1]],
      [0, 0],
    );

    return [lngTotal / spots.length, latTotal / spots.length];
  }, [selectedCoords, spots]);

  const visibleSpots = useMemo(
    () => (privacyFilter === "All" ? spots : spots.filter((spot) => spot.privacy === privacyFilter)),
    [privacyFilter, spots],
  );

  useEffect(() => {
    let active = true;
    let mapInstance: { remove: () => void; flyTo: (config: { center: [number, number]; zoom?: number }) => void } | null = null;

    async function setupMap() {
      if (!mapContainerRef.current) return;

      try {
        await loadMapLibreAssets();
        if (!active || !window.maplibregl || !mapContainerRef.current) return;

        const maplibregl = window.maplibregl;

        mapInstance = new maplibregl.Map({
          container: mapContainerRef.current,
          style: {
            version: 8,
            sources: {
              osm: {
                type: "raster",
                tiles: ["https://a.tile.openstreetmap.org/{z}/{x}/{y}.png"],
                tileSize: 256,
                attribution:
                  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>',
              },
            },
            layers: [{ id: "osm", type: "raster", source: "osm" }],
          },
          center: mapCenter,
          zoom: selectedCoords ? 12 : 7,
        });

        mapRef.current = mapInstance;

        visibleSpots.forEach((spot) => {
          const markerEl = document.createElement("button");
          markerEl.className = "naturist-marker";
          markerEl.type = "button";
          markerEl.setAttribute("aria-label", `Location marker for ${spot.name}`);
          markerEl.textContent = mode === "Explorer" ? (spot.privacy === "Public" ? "☀" : "🌿") : "●";

          if (mode === "Creator") {
            markerEl.style.background = "#9ca3af";
            markerEl.style.color = "#1f2937";
            markerEl.style.borderColor = "#d1d5db";
          }

          const popup = new maplibregl.Popup({ offset: 20 }).setHTML(
            `<div class="naturist-popup text-sm"><strong>${escapeHtml(spot.name)}</strong><p>${escapeHtml(spot.description)}</p><p><em>${escapeHtml(spot.privacy)} spot</em></p></div>`,
          );

          const marker = new maplibregl.Marker({ element: markerEl }).setLngLat(spot.coordinates);
          if (mode === "Explorer") {
            marker.setPopup(popup);
          }

          marker.addTo(mapInstance);
        });

        if (selectedCoords) {
          const draftMarker = document.createElement("span");
          draftMarker.className = "naturist-marker naturist-marker-draft";
          draftMarker.textContent = "＋";

          new maplibregl.Marker({ element: draftMarker }).setLngLat(selectedCoords).addTo(mapInstance);
        }

        if (mode === "Explorer" && selectedSpotId) {
          const selectedSpot = visibleSpots.find((spot) => spot.id === selectedSpotId);
          if (selectedSpot) {
            popupRef.current?.remove?.();
            popupRef.current = new maplibregl.Popup({ offset: 20 })
              .setHTML(
                `<div class="naturist-popup text-sm"><strong>${escapeHtml(selectedSpot.name)}</strong><p>${escapeHtml(selectedSpot.description)}</p><p><em>${escapeHtml(selectedSpot.privacy)} spot</em></p></div>`,
              )
              .setLngLat(selectedSpot.coordinates)
              .addTo(mapInstance);
          }
        }
      } catch (error) {
        console.error(error);
        setMapError("Interactive map could not be loaded from CDN. Showing fallback view.");
      }
    }

    setupMap();

    return () => {
      active = false;
      popupRef.current?.remove?.();
      popupRef.current = null;
      mapInstance?.remove();
      mapRef.current = null;
    };
  }, [mapCenter, mode, selectedCoords, selectedSpotId, visibleSpots]);

  async function searchPlaces(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();

    const trimmed = searchQuery.trim();
    if (!trimmed) return;

    setSearchLoading(true);
    setSaveError(null);

    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=8&q=${encodeURIComponent(trimmed)}`,
      );

      if (!response.ok) {
        throw new Error(`Search failed with status ${response.status}`);
      }

      const data = (await response.json()) as GeocodeResult[];
      setSearchResults(data);
      if (data.length === 0) {
        setSaveError("No matching places found. Try a nearby town or landmark.");
      }
    } catch (error) {
      console.error(error);
      setSaveError("Location search is unavailable right now. Please try again.");
    } finally {
      setSearchLoading(false);
    }
  }

  function selectSearchResult(result: GeocodeResult) {
    const coords: [number, number] = [Number(result.lon), Number(result.lat)];
    setSelectedCoords(coords);
    setSelectedLocationLabel(result.display_name);
    setSaveError(null);

    if (!newSpot.name) {
      setNewSpot((current) => ({
        ...current,
        name: result.display_name.split(",")[0]?.trim() || current.name,
      }));
    }
  }

  async function createSpot(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaveError(null);

    if (!selectedCoords) {
      setSaveError("Select a location from search results first.");
      return;
    }

    if (!newSpot.name.trim() || !newSpot.description.trim()) {
      setSaveError("Name and description are required.");
      return;
    }

    setSaving(true);

    const payload = {
      name: newSpot.name.trim(),
      description: newSpot.description.trim(),
      latitude: selectedCoords[1],
      longitude: selectedCoords[0],
      privacy: newSpot.privacy,
    };

    const { data, error } = await supabase
      .from("naturist_map_spots")
      .insert(payload)
      .select("id, name, description, latitude, longitude, privacy")
      .single();

    if (error) {
      console.error(error);
      setSaveError("Could not save location. Please make sure the public insert policy is enabled in Supabase.");
      setSaving(false);
      return;
    }

    if (data) {
      setSpots((current) => [toNaturistSpot(data as SupabaseMapSpot), ...current]);
    }

    setSaving(false);
    setIsAddingSpot(false);
    setSelectedSpotId(null);
    setSearchQuery("");
    setSearchResults([]);
    setSelectedCoords(null);
    setSelectedLocationLabel(null);
    setNewSpot({ name: "", description: "", privacy: "Discreet" });
  }

  return (
    <section className="flex max-h-[calc(100vh-6.75rem)] min-h-[32rem] flex-col overflow-hidden rounded-3xl border border-accent/20 bg-linear-to-b from-bg-deep via-card to-bg-deep text-text shadow-[0_24px_80px_rgba(0,0,0,0.45)]">
      <div className="bg-bg-deep/60 px-4 py-3 backdrop-blur-sm sm:px-5 sm:py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-text-strong sm:text-lg">Naturist Map · Orbital Explorer</h2>
            <p className="mt-1 text-xs text-muted sm:text-sm">Cleaner view with explorer and creator controls.</p>
          </div>
          <div className="flex flex-wrap gap-2 text-[11px] text-text/85 sm:text-xs">
            <span className="rounded-full border border-accent/25 bg-card/70 px-3 py-1.5">Total spots: {spots.length}</span>
            <span className="rounded-full border border-accent/25 bg-card/70 px-3 py-1.5">Public: {publicCount}</span>
            <span className="rounded-full border border-accent/25 bg-card/70 px-3 py-1.5">Discreet: {discreetCount}</span>
            <button
              type="button"
              onClick={() => {
                setMode((current) => (current === "Explorer" ? "Creator" : "Explorer"));
                setIsAddingSpot(false);
                setSelectedCoords(null);
                setSelectedSpotId(null);
              }}
              className="rounded-full border border-accent/45 bg-accent px-3 py-1.5 font-semibold text-text-inverse transition hover:bg-accent/90"
            >
              Switch to {mode === "Explorer" ? "Creator" : "Explorer"}
            </button>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          {(["All", "Public", "Discreet"] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setPrivacyFilter(option)}
              className={`rounded-full border px-3 py-1.5 transition ${
                privacyFilter === option
                  ? "border-accent/60 bg-accent/20 text-text-strong"
                  : "border-accent/25 bg-card/60 text-text/85 hover:border-accent/50"
              }`}
            >
              {option} ({option === "All" ? spots.length : spots.filter((spot) => spot.privacy === option).length})
            </button>
          ))}
        </div>

        {dataError ? <p className="mt-3 text-xs text-accent/90">{dataError}</p> : null}
      </div>

      {mapError ? (
        <div className="space-y-3 p-4 sm:p-5">
          <p className="text-xs text-accent/90">{mapError}</p>
          <iframe
            title="Naturist locations map fallback"
            src="https://www.openstreetmap.org/export/embed.html?bbox=3.7%2C51.75%2C5.7%2C52.8&layer=mapnik&marker=52.2%2C4.9"
            className="h-72 w-full overflow-hidden rounded-2xl border border-accent/20 sm:h-105"
            loading="lazy"
          />
        </div>
      ) : (
        <div className="grid min-h-0 flex-1 gap-3 p-3 sm:gap-4 sm:p-4 lg:grid-cols-[minmax(0,2fr)_minmax(19rem,1fr)] lg:p-4">
          <div className="min-h-0 overflow-hidden rounded-3xl border border-accent/25 bg-bg-deep/70">
            <div className="relative">
              <div className="pointer-events-none absolute inset-0 z-[1] bg-[radial-gradient(circle_at_20%_20%,rgba(var(--brand),0.28),transparent_38%),radial-gradient(circle_at_78%_64%,rgba(var(--accent),0.22),transparent_36%),radial-gradient(circle_at_48%_84%,rgba(var(--brand-2),0.24),transparent_34%)]" />
              <div ref={mapContainerRef} className="relative z-0 h-[55vh] max-h-[62vh] min-h-[20rem] w-full overflow-hidden lg:h-[66vh]" />
            </div>
          </div>

          <aside className="flex min-h-0 flex-col gap-3">
            <div className="flex min-h-0 flex-1 flex-col rounded-2xl border border-accent/25 bg-bg-deep/72 p-3 backdrop-blur-md sm:p-4">
              <h3 className="text-sm font-semibold text-text-strong">Visible locations</h3>
              <p className="mt-1 text-xs text-muted">
                {mode === "Explorer" ? "Tap a card to focus and open a map popup." : "Creator mode uses gray dots to avoid duplicates."}
              </p>

              <div className="mt-3 min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
                {visibleSpots.map((spot) => (
                  <button
                    key={spot.id}
                    type="button"
                    onClick={() => {
                      setSelectedCoords(spot.coordinates);
                      setSelectedLocationLabel(spot.name);
                      setSelectedSpotId(spot.id);
                      mapRef.current?.flyTo({ center: spot.coordinates, zoom: 12 });
                    }}
                    className="w-full rounded-xl border border-accent/25 bg-card/55 px-3 py-2 text-left transition hover:border-accent/50"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium text-text">{spot.name}</p>
                      <span className="rounded-full border border-accent/20 px-2 py-0.5 text-[10px] uppercase tracking-wide text-text/80">
                        {spot.privacy}
                      </span>
                    </div>
                    <p className="mt-1 line-clamp-2 text-xs text-muted">{spot.description}</p>
                  </button>
                ))}
                {visibleSpots.length === 0 ? <p className="text-xs text-muted">No spots match this filter yet.</p> : null}
              </div>

              <button
                type="button"
                className="mt-3 w-full rounded-xl bg-accent/85 px-3 py-2 text-sm font-semibold text-text-inverse transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
                disabled={mode !== "Creator"}
                onClick={() => {
                  setIsAddingSpot((current) => !current);
                  setSaveError(null);
                }}
              >
                {mode !== "Creator" ? "Switch to creator to add" : isAddingSpot ? "Close creator" : "Add location"}
              </button>
            </div>
          </aside>

          {isAddingSpot && mode === "Creator" ? (
            <div className="rounded-2xl border border-accent/30 bg-linear-to-br from-bg-deep/95 to-card/95 p-3 text-sm shadow-xl backdrop-blur-md lg:col-span-2 lg:p-4">
              <form className="space-y-3" onSubmit={searchPlaces}>
                <p className="text-xs text-muted">Search beaches, resorts, buildings, or remote places, then select a result.</p>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <input
                    className="min-w-0 flex-1 rounded-lg border border-accent/30 bg-bg-deep/70 px-3 py-2 text-text"
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder="Search location"
                  />
                  <button type="submit" className="rounded-lg border border-accent/30 bg-card/70 px-3 py-2 text-xs text-text" disabled={searchLoading}>
                    {searchLoading ? "Searching..." : "Search"}
                  </button>
                </div>
              </form>

              {searchResults.length > 0 ? (
                <ul className="mt-3 max-h-40 space-y-2 overflow-y-auto pr-1">
                  {searchResults.map((result) => (
                    <li key={result.place_id}>
                      <button
                        type="button"
                        className="w-full rounded-lg border border-accent/30 bg-bg-deep/80 px-2 py-2 text-left"
                        onClick={() => selectSearchResult(result)}
                      >
                        <p className="text-xs text-text">{result.display_name}</p>
                        <p className="text-[11px] uppercase tracking-wide text-muted">
                          {result.class} • {result.type}
                        </p>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}

              <form className="mt-3 grid gap-2 sm:grid-cols-2" onSubmit={createSpot}>
                <div className="sm:col-span-2">
                  {selectedLocationLabel ? (
                    <p className="rounded-lg border border-accent/30 bg-accent/12 px-2 py-1 text-xs text-text">Selected: {selectedLocationLabel}</p>
                  ) : (
                    <p className="text-xs text-muted">No location selected yet.</p>
                  )}
                </div>

                <input
                  className="w-full rounded-lg border border-accent/30 bg-bg-deep/70 px-3 py-2 text-text"
                  value={newSpot.name}
                  onChange={(event) => setNewSpot((current) => ({ ...current, name: event.target.value }))}
                  placeholder="Spot name"
                  required
                />
                <select
                  className="w-full rounded-lg border border-accent/30 bg-bg-deep/70 px-3 py-2 text-text"
                  value={newSpot.privacy}
                  onChange={(event) => setNewSpot((current) => ({ ...current, privacy: event.target.value as NaturistSpot["privacy"] }))}
                >
                  <option value="Public">Public</option>
                  <option value="Discreet">Discreet</option>
                </select>
                <textarea
                  className="w-full rounded-lg border border-accent/30 bg-bg-deep/70 px-3 py-2 text-text sm:col-span-2"
                  rows={3}
                  value={newSpot.description}
                  onChange={(event) => setNewSpot((current) => ({ ...current, description: event.target.value }))}
                  placeholder="Description"
                  required
                />

                {saveError ? <p className="text-xs text-rose-200 sm:col-span-2">{saveError}</p> : null}

                <button
                  type="submit"
                  className="w-full rounded-xl bg-accent/85 px-3 py-2 text-sm font-semibold text-text-inverse transition hover:bg-accent sm:col-span-2"
                  disabled={saving}
                >
                  {saving ? "Saving..." : "Save to Supabase"}
                </button>
              </form>
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}