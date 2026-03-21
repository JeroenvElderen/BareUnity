"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";

import { MapSpotPopup } from "@/components/explore/map-spot-popup";
import { Button } from "@/components/ui/button";

type MapStageClientProps = {
  isVerified: boolean;
};

type Spot = {
  id: string;
  name: string;
  description: string;
  latitude: number | string;
  longitude: number | string;
  privacy: "Public" | "Discreet" | string;
};

type MapLibrePopupInstance = {
  setDOMContent: (htmlNode: Node) => MapLibrePopupInstance;
};

type MapLibreGlobal = {
  Map: new (config: Record<string, unknown>) => {
    remove: () => void;
    addControl: (control: unknown, position?: string) => void;
  };
  NavigationControl: new () => unknown;
  Marker: new (config: { element: HTMLElement; anchor?: string }) => {
    setLngLat: (lngLat: [number, number]) => {
      addTo: (map: unknown) => {
        setPopup: (popup: MapLibrePopupInstance) => void;
      };
    };
  };
  Popup: new (config?: { offset?: number; className?: string; closeButton?: boolean; maxWidth?: string }) => MapLibrePopupInstance;
};

declare global {
  interface Window {
    maplibregl?: MapLibreGlobal;
  }
}

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
      existing.addEventListener("error", () => reject(new Error("Failed to load MapLibre script.")), {
        once: true,
      });
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

function buildMarkerElement(privacy: Spot["privacy"]) {
  const marker = document.createElement("button");
  marker.type = "button";
  marker.style.width = "40px";
  marker.style.height = "40px";
  marker.style.borderRadius = "999px";
  marker.style.border = "1px solid rgb(var(--border))";
  marker.style.boxShadow = "0 4px 10px rgba(0, 0, 0, 0.2)";
  marker.style.display = "grid";
  marker.style.placeItems = "center";

  if (privacy === "Public") {
    marker.style.background = "rgb(var(--accent-soft))";
    marker.textContent = "☀️";
  } else {
    marker.style.background = "rgb(var(--brand))";
    marker.textContent = "🌿";
  }

  return marker;
}


function buildPopupContentNode(spot: Spot) {
  const popupContainer = document.createElement("div");
  createRoot(popupContainer).render(
    <MapSpotPopup name={spot.name} description={spot.description} privacy={spot.privacy} />,
  );

  return popupContainer;
}

export function MapStageClient({ isVerified }: MapStageClientProps) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const [mapError, setMapError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const canCreateLocation = useMemo(() => isVerified, [isVerified]);

  useEffect(() => {
    let mounted = true;
    let mapInstance: { remove: () => void } | null = null;

    async function initMap() {
      try {
        addStylesheet("https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css");
        await addScript("https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js");

        if (!mounted || !mapContainerRef.current || !window.maplibregl) return;

        const map = new window.maplibregl.Map({
          container: mapContainerRef.current,
          center: [-98.5795, 39.8283],
          zoom: 3,
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

        map.addControl(new window.maplibregl.NavigationControl(), "top-right");

        try {
          const mapSpotsResponse = await fetch("/api/map-spots", { cache: "no-store" });
          if (!mapSpotsResponse.ok) {
            throw new Error(`Map spots request failed (${mapSpotsResponse.status})`);
          }

          const payload = (await mapSpotsResponse.json()) as { spots?: Spot[] };
          const spots = payload.spots ?? [];

          for (const spot of spots) {
            const latitude = Number(spot.latitude);
            const longitude = Number(spot.longitude);

            if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
              continue;
            }

            const popup = new window.maplibregl.Popup({
              offset: 16,
              className: "spot-popup",
              closeButton: false,
              maxWidth: "320px",
            }).setDOMContent(buildPopupContentNode(spot));

            const markerElement = buildMarkerElement(spot.privacy);

            new window.maplibregl.Marker({ element: markerElement, anchor: "bottom" })
              .setLngLat([longitude, latitude])
              .addTo(map)
              .setPopup(popup);
          }
        } catch (markerError) {
          console.error("Failed to load map markers", markerError);
          if (mounted) {
            setMapError("Map loaded but markers could not be fetched. Check server env configuration.");
          }
        }

        mapInstance = map;
      } catch (error) {
        if (!mounted) return;
        const message = error instanceof Error ? error.message : "Map failed to initialize.";
        setMapError(message);
      }
    }

    initMap();

    return () => {
      mounted = false;
      mapInstance?.remove();
    };
  }, []);

  return (
    <>
      <div ref={mapContainerRef} className="h-full w-full rounded-[14px]" aria-label="Explore map canvas" />

      {mapError ? (
        <div className="pointer-events-none absolute inset-0 grid place-items-center p-6 text-center text-sm text-[rgb(var(--muted))]">
          <p>{mapError}</p>
        </div>
      ) : null}

      <div className="absolute bottom-3 left-3 z-10">
        <Button
          type="button"
          onClick={() => setOpen(true)}
          disabled={!canCreateLocation}
          className="rounded-full bg-[rgb(var(--brand))] text-[rgb(var(--text-inverse))] hover:bg-[rgb(var(--brand-2))]"
        >
          Create location
        </Button>
      </div>

      {!canCreateLocation ? (
        <p className="absolute bottom-3 left-44 z-10 rounded-full border border-[rgb(var(--border))] bg-[rgb(var(--card))/0.94] px-3 py-1 text-xs text-[rgb(var(--muted))]">
          Verified users only
        </p>
      ) : null}

      {open ? (
        <div className="absolute inset-0 z-20 grid place-items-center bg-black/35 p-4">
          <div className="w-full max-w-md rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--card))] p-5 shadow-xl">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <h3 className="m-0 text-base font-semibold text-[rgb(var(--text-strong))]">Create location</h3>
                <p className="mt-1 text-sm text-[rgb(var(--muted))]">
                  Empty popout for verified users. Fields will be added next.
                </p>
              </div>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Close
              </Button>
            </div>

            <div className="rounded-xl border border-dashed border-[rgb(var(--border))] bg-[rgb(var(--bg-soft))/0.55] p-6 text-center text-sm text-[rgb(var(--muted))]">
              Location form placeholder
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}