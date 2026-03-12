"use client";

import { useEffect, useRef, useState } from "react";

type NaturistSpot = {
  id: string;
  name: string;
  description: string;
  coordinates: [number, number];
  privacy: "Public" | "Discreet";
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
      };
      Marker: new (config?: { element?: HTMLElement }) => {
        setLngLat: (coords: [number, number]) => {
          setPopup: (popup: unknown) => {
            addTo: (map: unknown) => void;
          };
        };
      };
      Popup: new (config?: { offset?: number }) => {
        setHTML: (html: string) => unknown;
      };
    };
  }
}

const NATURIST_SPOTS: NaturistSpot[] = [
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

export default function NaturistMapChannel() {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const [mapError, setMapError] = useState<string | null>(null);

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
          center: [4.9, 52.2],
          zoom: 7,
        });

        NATURIST_SPOTS.forEach((spot) => {
          const markerEl = document.createElement("button");
          markerEl.className = "naturist-marker";
          markerEl.type = "button";
          markerEl.setAttribute("aria-label", `Location marker for ${spot.name}`);
          markerEl.textContent = spot.privacy === "Public" ? "☀" : "🌿";

          const popup = new maplibregl.Popup({ offset: 20 }).setHTML(
            `<div class="text-sm"><strong>${spot.name}</strong><p>${spot.description}</p><p><em>${spot.privacy} spot</em></p></div>`,
          );

          new maplibregl.Marker({ element: markerEl }).setLngLat(spot.coordinates).setPopup(popup).addTo(mapInstance);
        });
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
  }, []);

  return (
    <section className="rounded-3xl border border-accent/20 bg-card/40 p-4 md:p-6">
      <div className="mb-4 space-y-2">
        <h2 className="text-base font-semibold text-text">Naturist Map</h2>
        <p className="text-sm text-muted">
          Explore naturist-friendly beaches, discreet hideaways, and calm nature locations. Always verify local regulations and respect
          privacy at each site.
        </p>
      </div>

      {mapError ? (
        <div className="space-y-3">
          <p className="text-xs text-amber-200/90">{mapError}</p>
          <iframe
            title="Naturist locations map fallback"
            src="https://www.openstreetmap.org/export/embed.html?bbox=3.7%2C51.75%2C5.7%2C52.8&layer=mapnik&marker=52.2%2C4.9"
            className="h-[420px] w-full overflow-hidden rounded-2xl border border-accent/20"
            loading="lazy"
          />
        </div>
      ) : (
        <div ref={mapContainerRef} className="h-[420px] w-full overflow-hidden rounded-2xl border border-accent/20" />
      )}
    </section>
  );
}