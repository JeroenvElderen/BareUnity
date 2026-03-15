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
        setHTML: (html: string) => unknown;
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
  const [mapError, setMapError] = useState<string | null>(null);
  const [dataError, setDataError] = useState<string | null>(null);
  const [spots, setSpots] = useState<NaturistSpot[]>(FALLBACK_NATURIST_SPOTS);

  const [isAddingSpot, setIsAddingSpot] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchResults, setSearchResults] = useState<GeocodeResult[]>([]);
  const [selectedCoords, setSelectedCoords] = useState<[number, number] | null>(null);
  const [selectedLocationLabel, setSelectedLocationLabel] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [newSpot, setNewSpot] = useState({
    name: "",
    description: "",
    privacy: "Discreet" as NaturistSpot["privacy"],
  });
  const [privacyFilter, setPrivacyFilter] = useState<"All" | NaturistSpot["privacy"]>("All");

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
    let mapInstance: { remove: () => void } | null = null;

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

        visibleSpots.forEach((spot) => {
          const markerEl = document.createElement("button");
          markerEl.className = "naturist-marker";
          markerEl.type = "button";
          markerEl.setAttribute("aria-label", `Location marker for ${spot.name}`);
          markerEl.textContent = spot.privacy === "Public" ? "☀" : "🌿";

          const popup = new maplibregl.Popup({ offset: 20 }).setHTML(
            `<div class="naturist-popup text-sm"><strong>${escapeHtml(spot.name)}</strong><p>${escapeHtml(spot.description)}</p><p><em>${escapeHtml(spot.privacy)} spot</em></p></div>`,
          );

          new maplibregl.Marker({ element: markerEl }).setLngLat(spot.coordinates).setPopup(popup).addTo(mapInstance);
        });

        if (selectedCoords) {
          const draftMarker = document.createElement("span");
          draftMarker.className = "naturist-marker naturist-marker-draft";
          draftMarker.textContent = "＋";

          new maplibregl.Marker({ element: draftMarker }).setLngLat(selectedCoords).addTo(mapInstance);
        }
      } catch (error) {
        console.error(error);
        setMapError("Interactive map could not be loaded from CDN. Showing fallback view.");
      }
    }

    setupMap();

    return () => {
      active = false;
      mapInstance?.remove();
    };
  }, [mapCenter, selectedCoords, visibleSpots]);

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
    setSearchQuery("");
    setSearchResults([]);
    setSelectedCoords(null);
    setSelectedLocationLabel(null);
    setNewSpot({ name: "", description: "", privacy: "Discreet" });
  }

  return (
    <section className="flex min-h-[calc(100vh-10rem)] flex-col rounded-3xl border border-[#3a5e4e] bg-linear-to-b from-[#13211b] to-[#1b2f26] p-4 text-[#e7f3ec] shadow-[0_18px_60px_rgba(0,0,0,0.35)] md:p-6">
      <div className="mb-4 space-y-2">
        <h2 className="text-base font-semibold text-[#effaf4]">Naturist Map</h2>
        <p className="text-sm text-[#b5cfbf]">
          Explore naturist-friendly beaches, discreet hideaways, and calm nature locations. Always verify local regulations and respect
          privacy at each site.
        </p>
        <div className="flex flex-wrap gap-2 text-xs">
          {(["All", "Public", "Discreet"] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setPrivacyFilter(option)}
              className={`rounded-full border px-3 py-1.5 transition ${
                privacyFilter === option
                  ? "border-[#6da887] bg-[#2b4a3b] text-[#ecf9f2]"
                  : "border-[#3a5e4e] bg-[#1d3228] text-[#c8dfd2] hover:border-[#5f8f78]"
              }`}
            >
              {option} ({option === "All" ? spots.length : spots.filter((spot) => spot.privacy === option).length})
            </button>
          ))}
        </div>
      </div>

      {dataError ? <p className="mb-3 text-xs text-amber-200/90">{dataError}</p> : null}

      {mapError ? (
        <div className="space-y-3">
          <p className="text-xs text-amber-200/90">{mapError}</p>
          <iframe
            title="Naturist locations map fallback"
            src="https://www.openstreetmap.org/export/embed.html?bbox=3.7%2C51.75%2C5.7%2C52.8&layer=mapnik&marker=52.2%2C4.9"
            className="h-105 w-full overflow-hidden rounded-2xl border border-accent/20"
            loading="lazy"
          />
        </div>
      ) : (
        <div className="relative mt-1 flex-1 overflow-hidden rounded-2xl border border-[#3a5e4e] bg-[#15271f]/80">
          <div ref={mapContainerRef} className="h-full min-h-160 w-full overflow-hidden" />

          <aside className="absolute inset-y-3 left-3 z-10 flex h-auto max-h-[calc(100%-1.5rem)] w-full max-w-88 flex-col rounded-2xl border border-[#3a5e4e] bg-[#14231d]/75 p-3 backdrop-blur-md">
            <h3 className="text-sm font-semibold text-[#effaf4]">Visible locations</h3>
            <p className="mt-1 text-xs text-[#b5cfbf]">Select a spot to focus it on the map.</p>
            <div className="mt-3 flex-1 space-y-2 overflow-y-auto pr-1">
              {visibleSpots.map((spot) => (
                <button
                  key={spot.id}
                  type="button"
                  onClick={() => {
                    setSelectedCoords(spot.coordinates);
                    setSelectedLocationLabel(spot.name);
                  }}
                  className="w-full rounded-xl border border-[#3a5e4e] bg-[#102118]/75 px-3 py-2 text-left transition hover:border-[#6da887]"
                >
                  <p className="text-sm font-medium text-[#ecf9f2]">{spot.name}</p>
                  <p className="line-clamp-2 text-xs text-[#b5cfbf]">{spot.description}</p>
                </button>
              ))}
              {visibleSpots.length === 0 ? <p className="text-xs text-[#b5cfbf]">No spots match this filter yet.</p> : null}
            </div>

          <button
              type="button"
              className="mt-3 w-full rounded-xl bg-[#5dac7d] px-3 py-2 text-sm font-semibold text-[#072316] transition hover:bg-[#7bc095]"
              onClick={() => {
                setIsAddingSpot((current) => !current);
                setSaveError(null);
              }}
            >
              {isAddingSpot ? "Close" : "Add location"}
            </button>
          </aside>

          {isAddingSpot ? (
            <div className="absolute right-3 top-3 z-10 max-h-[calc(100%-1.5rem)] w-full max-w-105 overflow-y-auto rounded-2xl border border-[#4a7763] bg-linear-to-br from-[#1b3127]/95 to-[#13241d]/95 p-3 text-sm shadow-xl backdrop-blur-md">
              <form className="space-y-3" onSubmit={searchPlaces}>
                <p className="text-xs text-[#b5cfbf]">Search beaches, resorts, buildings, or remote places, then select a result.</p>
                <div className="flex gap-2">
                  <input
                    className="min-w-0 flex-1 rounded-lg border border-[#3a5e4e] bg-[#102118] px-3 py-2 text-[#e7f3ec]"
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder="Search location"
                  />
                  <button type="submit" className="rounded-lg border border-[#3a5e4e] bg-[#1d3228] px-3 text-xs text-[#ecf9f2]" disabled={searchLoading}>
                    {searchLoading ? "Searching..." : "Search"}
                  </button>
                </div>
              </form>

              {searchResults.length > 0 ? (
                <ul className="mt-3 space-y-2">
                  {searchResults.map((result) => (
                    <li key={result.place_id}>
                      <button
                        type="button"
                        className="w-full rounded-lg border border-[#3a5e4e] bg-[#102118]/80 px-2 py-2 text-left"
                        onClick={() => selectSearchResult(result)}
                      >
                        <p className="text-xs text-[#ecf9f2]">{result.display_name}</p>
                        <p className="text-[11px] uppercase tracking-wide text-[#b5cfbf]">{result.class} • {result.type}</p>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}

              <form className="mt-3 space-y-2" onSubmit={createSpot}>
                {selectedLocationLabel ? (
                  <p className="rounded-lg border border-accent/25 bg-accent/8 px-2 py-1 text-xs text-cyan-50">
                    Selected: {selectedLocationLabel}
                  </p>
                ) : (
                  <p className="text-xs text-[#b5cfbf]">No location selected yet.</p>
                )}

                <input
                  className="w-full rounded-lg border border-[#3a5e4e] bg-[#102118] px-3 py-2 text-[#e7f3ec]"
                  value={newSpot.name}
                  onChange={(event) => setNewSpot((current) => ({ ...current, name: event.target.value }))}
                  placeholder="Spot name"
                  required
                />
                <textarea
                  className="w-full rounded-lg border border-[#3a5e4e] bg-[#102118] px-3 py-2 text-[#e7f3ec]"
                  rows={3}
                  value={newSpot.description}
                  onChange={(event) => setNewSpot((current) => ({ ...current, description: event.target.value }))}
                  placeholder="Description"
                  required
                />
                <select
                  className="w-full rounded-lg border border-[#3a5e4e] bg-[#102118] px-3 py-2 text-[#e7f3ec]"
                  value={newSpot.privacy}
                  onChange={(event) => setNewSpot((current) => ({ ...current, privacy: event.target.value as NaturistSpot["privacy"] }))}
                >
                  <option value="Public">Public</option>
                  <option value="Discreet">Discreet</option>
                </select>

                {saveError ? <p className="text-xs text-rose-200">{saveError}</p> : null}

                <button
                  type="submit"
                  className="w-full rounded-xl bg-[#5dac7d] px-3 py-2 text-sm font-semibold text-[#072316] transition hover:bg-[#7bc095]"
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