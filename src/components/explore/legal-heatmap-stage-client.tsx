"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import type { LegalHeatmapEntry, LegalStatus } from "@/lib/legal-heatmap-data";

type HeatmapFeature = {
  type: "Feature";
  geometry: {
    type: "Point";
    coordinates: [number, number];
  };
  properties: {
    id: string;
    status: LegalStatus;
  };
};

type HeatmapFeatureCollection = {
  type: "FeatureCollection";
  features: HeatmapFeature[];
};

type GeoJSONSourceLike = {
  setData: (data: HeatmapFeatureCollection) => void;
};

type MapLibreMapInstance = {
  remove: () => void;
  addControl: (control: unknown, position?: string) => void;
  addSource: (id: string, source: Record<string, unknown>) => void;
  addLayer: (layer: Record<string, unknown>) => void;
  getSource: (id: string) => GeoJSONSourceLike | undefined;
  on: (event: "load", listener: () => void) => void;
  off: (event: "load", listener: () => void) => void;
  flyTo?: (config: { center: [number, number]; zoom?: number }) => void;
};

type MapLibreGlobal = {
  Map: new (config: Record<string, unknown>) => MapLibreMapInstance;
  NavigationControl: new () => unknown;
};

type HeatmapApiResponse = {
  updatedAt: string;
  countries: string[];
  entries: LegalHeatmapEntry[];
};

declare global {
  interface Window {
    maplibregl?: MapLibreGlobal;
  }
}

const STATUS_COLORS: Record<LegalStatus, string> = {
  Legal: "#1f9d55",
  Gray: "#f59e0b",
  Illegal: "#dc2626",
};

const HEATMAP_SOURCE_ID = "legal-regions";

function addStylesheet(href: string) {
  if (document.querySelector(`link[data-maplibre-css=\"${href}\"]`)) return;

  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  link.dataset.maplibreCss = href;
  document.head.appendChild(link);
}

function addScript(src: string) {
  return new Promise<void>((resolve, reject) => {
    const existing = document.querySelector(`script[data-maplibre-js=\"${src}\"]`) as HTMLScriptElement | null;

    if (existing) {
      if (existing.dataset.loaded === "true") {
        resolve();
        return;
      }

      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("Failed to load MapLibre script.")), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.dataset.maplibreJs = src;
    script.addEventListener("load", () => {
      script.dataset.loaded = "true";
      resolve();
    });
    script.addEventListener("error", () => reject(new Error("Failed to load MapLibre script.")));
    document.body.appendChild(script);
  });
}

function toFeatureCollection(entries: LegalHeatmapEntry[]): HeatmapFeatureCollection {
  return {
    type: "FeatureCollection",
    features: entries.map((entry) => ({
      type: "Feature",
      geometry: {
        type: "Point",
        coordinates: [entry.longitude, entry.latitude],
      },
      properties: {
        id: entry.id,
        status: entry.status,
      },
    })),
  };
}

export function LegalHeatmapStageClient() {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMapInstance | null>(null);
  const [mapError, setMapError] = useState<string | null>(null);
  const [selectedCountry, setSelectedCountry] = useState("All countries");
  const [countries, setCountries] = useState<string[]>(["All countries"]);
  const [entries, setEntries] = useState<LegalHeatmapEntry[]>([]);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [isMapReady, setIsMapReady] = useState(false);

  const filteredPoints = useMemo(
    () =>
      entries.filter((point) => {
        if (selectedCountry === "All countries") return true;
        return point.country === selectedCountry;
      }),
    [entries, selectedCountry],
  );

  useEffect(() => {
    let active = true;

    async function loadData() {
      setIsLoadingData(true);

      try {
        const response = await fetch("/api/legal-heatmap", { cache: "no-store" });
        if (!response.ok) {
          throw new Error(`Failed to load legal heatmap data (${response.status}).`);
        }

        const payload = (await response.json()) as HeatmapApiResponse;
        if (!active) return;

        setEntries(payload.entries);
        setCountries(["All countries", ...payload.countries]);
        setUpdatedAt(payload.updatedAt);
      } catch (error) {
        if (!active) return;
        setMapError(error instanceof Error ? error.message : "Failed to load legal heatmap data.");
      } finally {
        if (!active) return;
        setIsLoadingData(false);
      }
    }

    void loadData();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    let mapInstance: MapLibreMapInstance | null = null;

    async function initMap() {
      try {
        addStylesheet("https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css");
        await addScript("https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js");

        if (!mounted || !mapContainerRef.current || !window.maplibregl) return;

        const map = new window.maplibregl.Map({
          container: mapContainerRef.current,
          center: [-20, 28],
          zoom: 1.8,
          style: {
            version: 8,
            sources: {
              osm: {
                type: "raster",
                tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
                tileSize: 256,
                attribution: "© OpenStreetMap contributors",
              },
            },
            layers: [
              {
                id: "osm",
                type: "raster",
                source: "osm",
              },
            ],
          },
        });

        const onLoad = () => {
          map.addControl(new window.maplibregl!.NavigationControl(), "top-right");
          map.addSource(HEATMAP_SOURCE_ID, {
            type: "geojson",
            data: toFeatureCollection([]),
          });

          map.addLayer({
            id: "legal-regions-legal",
            type: "circle",
            source: HEATMAP_SOURCE_ID,
            filter: ["==", ["get", "status"], "Legal"],
            paint: {
              "circle-color": STATUS_COLORS.Legal,
              "circle-opacity": 0.45,
              "circle-blur": 0.7,
              "circle-radius": ["interpolate", ["linear"], ["zoom"], 2, 34, 5, 62],
            },
          });

          map.addLayer({
            id: "legal-regions-gray",
            type: "circle",
            source: HEATMAP_SOURCE_ID,
            filter: ["==", ["get", "status"], "Gray"],
            paint: {
              "circle-color": STATUS_COLORS.Gray,
              "circle-opacity": 0.42,
              "circle-blur": 0.7,
              "circle-radius": ["interpolate", ["linear"], ["zoom"], 2, 34, 5, 62],
            },
          });

          map.addLayer({
            id: "legal-regions-illegal",
            type: "circle",
            source: HEATMAP_SOURCE_ID,
            filter: ["==", ["get", "status"], "Illegal"],
            paint: {
              "circle-color": STATUS_COLORS.Illegal,
              "circle-opacity": 0.45,
              "circle-blur": 0.7,
              "circle-radius": ["interpolate", ["linear"], ["zoom"], 2, 34, 5, 62],
            },
          });

          setIsMapReady(true);
        };

        map.on("load", onLoad);

        mapRef.current = map;
        mapInstance = map;
      } catch (error) {
        if (!mounted) return;
        const message = error instanceof Error ? error.message : "Map failed to initialize.";
        setMapError(message);
      }
    }

    void initMap();

    return () => {
      mounted = false;
      setIsMapReady(false);
      mapRef.current = null;
      mapInstance?.remove();
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isMapReady) return;

    const source = map.getSource(HEATMAP_SOURCE_ID);
    source?.setData(toFeatureCollection(filteredPoints));

    if (filteredPoints.length === 1) {
      const point = filteredPoints[0];
      map.flyTo?.({ center: [point.longitude, point.latitude], zoom: 5.2 });
      return;
    }

    map.flyTo?.({ center: [-20, 28], zoom: 1.8 });
  }, [filteredPoints, isMapReady]);

  return (
    <div className="h-full w-full">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <label className="text-sm text-[rgb(var(--muted))]">
          Country filter
          <select
            className="ml-2 rounded-md border border-[rgb(var(--border))] bg-[rgb(var(--card))] px-2 py-1 text-sm text-[rgb(var(--text))]"
            value={selectedCountry}
            onChange={(event) => setSelectedCountry(event.target.value)}
          >
            {countries.map((country) => (
              <option key={country} value={country}>
                {country}
              </option>
            ))}
          </select>
        </label>

        <div className="flex items-center gap-3 text-xs text-[rgb(var(--muted))]">
          <span className="inline-flex items-center gap-1">
            <i style={{ background: STATUS_COLORS.Legal }} className="h-3 w-3 rounded-full" />Legal
          </span>
          <span className="inline-flex items-center gap-1">
            <i style={{ background: STATUS_COLORS.Gray }} className="h-3 w-3 rounded-full" />Gray
          </span>
          <span className="inline-flex items-center gap-1">
            <i style={{ background: STATUS_COLORS.Illegal }} className="h-3 w-3 rounded-full" />Illegal
          </span>
        </div>
      </div>

      <div ref={mapContainerRef} className="relative h-[540px] w-full overflow-hidden rounded-[14px] border border-dashed border-[rgb(var(--border))]" />

      {updatedAt ? <p className="mt-2 text-xs text-[rgb(var(--muted))]">Last reviewed: {updatedAt}</p> : null}

      {mapError ? <p className="mt-2 text-sm text-red-600">{mapError}</p> : null}

      {isLoadingData ? <p className="mt-3 text-sm text-[rgb(var(--muted))]">Loading legal data…</p> : null}

      <ul className="mt-3 grid gap-2 text-sm">
        {filteredPoints.map((point) => (
          <li key={point.id} className="rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--bg-soft))/0.6] p-2">
            <p className="font-semibold text-[rgb(var(--text-strong))]">
              {point.country} • {point.region}
            </p>
            <p className="text-[rgb(var(--muted))]">{point.summary}</p>
            <a className="text-xs text-[rgb(var(--brand-2))] underline" href={point.sourceUrl} target="_blank" rel="noreferrer">
              Source: {point.sourceLabel}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}