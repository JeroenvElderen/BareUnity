"use client";

import { useEffect, useMemo, useRef, useState } from "react";

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

type AccessType = "Public" | "Discreet" | "Private Club";
type TerrainType = "Beach" | "Hot spring" | "Campground" | "Forest" | "Urban rooftop" | "Resort";
type AmenityType =
  | "Showers"
  | "Restrooms"
  | "Parking"
  | "Food nearby"
  | "Overnight stay"
  | "Family area"
  | "Sauna"
  | "Pool";

type CreateLocationFormState = {
  name: string;
  shortDescription: string;
  fullDescription: string;
  latitude: string;
  longitude: string;
  locationHint: string;
  country: string;
  region: string;
  accessType: AccessType;
  terrain: TerrainType;
  clothingPolicy: "Nude only" | "Clothing optional" | "Mixed";
  safetyLevel: "Beginner friendly" | "Intermediate" | "Experienced";
  bestSeason: "Spring" | "Summer" | "Autumn" | "Winter" | "Year-round";
  entryFee: string;
  website: string;
  rules: string;
  amenities: AmenityType[];
  tags: string;
  reporterNotes: string;
};

type InteractionControl = {
  disable?: () => void;
  enable?: () => void;
};

type MapLibreMapInstance = {
  remove: () => void;
  addControl: (control: unknown, position?: string) => void;
  dragPan?: InteractionControl;
  scrollZoom?: InteractionControl;
  boxZoom?: InteractionControl;
  dragRotate?: InteractionControl;
  keyboard?: InteractionControl;
  doubleClickZoom?: InteractionControl;
  touchZoomRotate?: InteractionControl;
};

type MapLibreGlobal = {
  Map: new (config: Record<string, unknown>) => MapLibreMapInstance;
  NavigationControl: new () => unknown;
  Marker: new (config: { element: HTMLElement; anchor?: string }) => {
    setLngLat: (lngLat: [number, number]) => {
      addTo: (map: unknown) => unknown;
    };
  };
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

const MAP_LOCK_INTERACTIONS: Array<keyof Pick<
  MapLibreMapInstance,
  "dragPan" | "scrollZoom" | "boxZoom" | "dragRotate" | "keyboard" | "doubleClickZoom" | "touchZoomRotate"
>> = ["dragPan", "scrollZoom", "boxZoom", "dragRotate", "keyboard", "doubleClickZoom", "touchZoomRotate"];

const AMENITY_OPTIONS: AmenityType[] = [
  "Showers",
  "Restrooms",
  "Parking",
  "Food nearby",
  "Overnight stay",
  "Family area",
  "Sauna",
  "Pool",
];

const INITIAL_LOCATION_FORM: CreateLocationFormState = {
  name: "",
  shortDescription: "",
  fullDescription: "",
  latitude: "",
  longitude: "",
  locationHint: "",
  country: "",
  region: "",
  accessType: "Public",
  terrain: "Beach",
  clothingPolicy: "Clothing optional",
  safetyLevel: "Beginner friendly",
  bestSeason: "Summer",
  entryFee: "",
  website: "",
  rules: "",
  amenities: [],
  tags: "",
  reporterNotes: "",
};

export function MapStageClient({ isVerified }: MapStageClientProps) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMapInstance | null>(null);
  const [mapError, setMapError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [selectedSpot, setSelectedSpot] = useState<Spot | null>(null);
  const [locationForm, setLocationForm] = useState<CreateLocationFormState>(INITIAL_LOCATION_FORM);

  const canCreateLocation = useMemo(() => isVerified, [isVerified]);

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

            const markerElement = buildMarkerElement(spot.privacy);
            markerElement.addEventListener("click", () => {
              if (!mounted) return;
              setSelectedSpot(spot);
            });

            new window.maplibregl.Marker({ element: markerElement, anchor: "bottom" })
              .setLngLat([longitude, latitude])
              .addTo(map);
          }
        } catch (markerError) {
          console.error("Failed to load map markers", markerError);
          if (mounted) {
            setMapError("Map loaded but markers could not be fetched. Check server env configuration.");
          }
        }

        mapInstance = map;
        mapRef.current = map;
      } catch (error) {
        if (!mounted) return;
        const message = error instanceof Error ? error.message : "Map failed to initialize.";
        setMapError(message);
      }
    }

    initMap();

    return () => {
      mounted = false;
      mapRef.current = null;
      mapInstance?.remove();
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const lockMap = Boolean(selectedSpot);

    for (const interactionKey of MAP_LOCK_INTERACTIONS) {
      const interaction = map[interactionKey];
      if (!interaction) continue;

      if (lockMap) {
        interaction.disable?.();
      } else {
        interaction.enable?.();
      }
    }
  }, [selectedSpot]);

  function updateLocationField<K extends keyof CreateLocationFormState>(field: K, value: CreateLocationFormState[K]) {
    setLocationForm((current) => ({ ...current, [field]: value }));
  }

  function toggleAmenity(amenity: AmenityType) {
    setLocationForm((current) => ({
      ...current,
      amenities: current.amenities.includes(amenity)
        ? current.amenities.filter((currentAmenity) => currentAmenity !== amenity)
        : [...current.amenities, amenity],
    }));
  }

  return (
    <>
      <div ref={mapContainerRef} className="h-full w-full rounded-[14px]" aria-label="Explore map canvas" />

      {selectedSpot ? (
        <div className="absolute inset-0 z-30 grid place-items-center p-4">
          <MapSpotPopup
            name={selectedSpot.name}
            description={selectedSpot.description}
            privacy={selectedSpot.privacy}
            onClose={() => setSelectedSpot(null)}
          />
        </div>
      ) : null}
      
      {mapError ? (
        <div className="pointer-events-none absolute inset-0 grid place-items-center p-6 text-center text-sm text-[rgb(var(--muted))]">
          <p>{mapError}</p>
        </div>
      ) : null}

      <div className="absolute bottom-3 left-3 z-20">
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
        <p className="absolute bottom-3 left-44 z-20 rounded-full border border-[rgb(var(--border))] bg-[rgb(var(--card))/0.94] px-3 py-1 text-xs text-[rgb(var(--muted))]">
          Verified users only
        </p>
      ) : null}

      {open ? (
        <div className="absolute inset-0 z-20 grid place-items-center bg-black/35 p-4">
          <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--card))] p-5 shadow-xl">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <h3 className="m-0 text-base font-semibold text-[rgb(var(--text-strong))]">Create location</h3>
                <p className="mt-1 text-sm text-[rgb(var(--muted))]">
                  Add comprehensive details so people understand access, vibe, safety, and local expectations.
                </p>
              </div>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Close
              </Button>
            </div>

            <form className="space-y-5">
              <section className="grid gap-3 md:grid-cols-2">
                <label className="space-y-1 md:col-span-2">
                  <span className="text-xs font-medium text-[rgb(var(--muted))]">Location name</span>
                  <input
                    value={locationForm.name}
                    onChange={(event) => updateLocationField("name", event.target.value)}
                    placeholder="e.g. Sunset Cove Naturist Beach"
                    className="w-full rounded-lg border border-[rgb(var(--border))] bg-transparent px-3 py-2 text-sm outline-none ring-[rgb(var(--brand))] transition focus:ring-2"
                  />
                </label>
                <label className="space-y-1 md:col-span-2">
                  <span className="text-xs font-medium text-[rgb(var(--muted))]">Short description</span>
                  <input
                    value={locationForm.shortDescription}
                    onChange={(event) => updateLocationField("shortDescription", event.target.value)}
                    placeholder="1 sentence summary for map popup"
                    className="w-full rounded-lg border border-[rgb(var(--border))] bg-transparent px-3 py-2 text-sm outline-none ring-[rgb(var(--brand))] transition focus:ring-2"
                  />
                </label>
                <label className="space-y-1 md:col-span-2">
                  <span className="text-xs font-medium text-[rgb(var(--muted))]">Full description</span>
                  <textarea
                    value={locationForm.fullDescription}
                    onChange={(event) => updateLocationField("fullDescription", event.target.value)}
                    placeholder="Share atmosphere, etiquette, how busy it gets, and any known restrictions."
                    rows={4}
                    className="w-full rounded-lg border border-[rgb(var(--border))] bg-transparent px-3 py-2 text-sm outline-none ring-[rgb(var(--brand))] transition focus:ring-2"
                  />
                </label>
              </section>

              <section className="grid gap-3 md:grid-cols-2">
                <label className="space-y-1">
                  <span className="text-xs font-medium text-[rgb(var(--muted))]">Latitude</span>
                  <input
                    value={locationForm.latitude}
                    onChange={(event) => updateLocationField("latitude", event.target.value)}
                    placeholder="37.773972"
                    className="w-full rounded-lg border border-[rgb(var(--border))] bg-transparent px-3 py-2 text-sm outline-none ring-[rgb(var(--brand))] transition focus:ring-2"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-xs font-medium text-[rgb(var(--muted))]">Longitude</span>
                  <input
                    value={locationForm.longitude}
                    onChange={(event) => updateLocationField("longitude", event.target.value)}
                    placeholder="-122.431297"
                    className="w-full rounded-lg border border-[rgb(var(--border))] bg-transparent px-3 py-2 text-sm outline-none ring-[rgb(var(--brand))] transition focus:ring-2"
                  />
                </label>
                <label className="space-y-1 md:col-span-2">
                  <span className="text-xs font-medium text-[rgb(var(--muted))]">Location hint</span>
                  <input
                    value={locationForm.locationHint}
                    onChange={(event) => updateLocationField("locationHint", event.target.value)}
                    placeholder="Parking lot name, closest trail marker, or discreet meetup point"
                    className="w-full rounded-lg border border-[rgb(var(--border))] bg-transparent px-3 py-2 text-sm outline-none ring-[rgb(var(--brand))] transition focus:ring-2"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-xs font-medium text-[rgb(var(--muted))]">Country</span>
                  <input
                    value={locationForm.country}
                    onChange={(event) => updateLocationField("country", event.target.value)}
                    placeholder="United States"
                    className="w-full rounded-lg border border-[rgb(var(--border))] bg-transparent px-3 py-2 text-sm outline-none ring-[rgb(var(--brand))] transition focus:ring-2"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-xs font-medium text-[rgb(var(--muted))]">Region / state</span>
                  <input
                    value={locationForm.region}
                    onChange={(event) => updateLocationField("region", event.target.value)}
                    placeholder="California"
                    className="w-full rounded-lg border border-[rgb(var(--border))] bg-transparent px-3 py-2 text-sm outline-none ring-[rgb(var(--brand))] transition focus:ring-2"
                  />
                </label>
              </section>

              <section className="grid gap-3 md:grid-cols-2">
                <label className="space-y-1">
                  <span className="text-xs font-medium text-[rgb(var(--muted))]">Access type</span>
                  <select
                    value={locationForm.accessType}
                    onChange={(event) => updateLocationField("accessType", event.target.value as AccessType)}
                    className="w-full rounded-lg border border-[rgb(var(--border))] bg-transparent px-3 py-2 text-sm outline-none ring-[rgb(var(--brand))] transition focus:ring-2"
                  >
                    <option>Public</option>
                    <option>Discreet</option>
                    <option>Private Club</option>
                  </select>
                </label>
                <label className="space-y-1">
                  <span className="text-xs font-medium text-[rgb(var(--muted))]">Terrain</span>
                  <select
                    value={locationForm.terrain}
                    onChange={(event) => updateLocationField("terrain", event.target.value as TerrainType)}
                    className="w-full rounded-lg border border-[rgb(var(--border))] bg-transparent px-3 py-2 text-sm outline-none ring-[rgb(var(--brand))] transition focus:ring-2"
                  >
                    <option>Beach</option>
                    <option>Hot spring</option>
                    <option>Campground</option>
                    <option>Forest</option>
                    <option>Urban rooftop</option>
                    <option>Resort</option>
                  </select>
                </label>
                <label className="space-y-1">
                  <span className="text-xs font-medium text-[rgb(var(--muted))]">Clothing policy</span>
                  <select
                    value={locationForm.clothingPolicy}
                    onChange={(event) =>
                      updateLocationField(
                        "clothingPolicy",
                        event.target.value as CreateLocationFormState["clothingPolicy"],
                      )
                    }
                    className="w-full rounded-lg border border-[rgb(var(--border))] bg-transparent px-3 py-2 text-sm outline-none ring-[rgb(var(--brand))] transition focus:ring-2"
                  >
                    <option>Nude only</option>
                    <option>Clothing optional</option>
                    <option>Mixed</option>
                  </select>
                </label>
                <label className="space-y-1">
                  <span className="text-xs font-medium text-[rgb(var(--muted))]">Safety level</span>
                  <select
                    value={locationForm.safetyLevel}
                    onChange={(event) =>
                      updateLocationField("safetyLevel", event.target.value as CreateLocationFormState["safetyLevel"])
                    }
                    className="w-full rounded-lg border border-[rgb(var(--border))] bg-transparent px-3 py-2 text-sm outline-none ring-[rgb(var(--brand))] transition focus:ring-2"
                  >
                    <option>Beginner friendly</option>
                    <option>Intermediate</option>
                    <option>Experienced</option>
                  </select>
                </label>
              </section>

              <section className="space-y-2">
                <p className="text-xs font-medium text-[rgb(var(--muted))]">Amenities</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {AMENITY_OPTIONS.map((amenity) => (
                    <label
                      key={amenity}
                      className="flex cursor-pointer items-center justify-between rounded-lg border border-[rgb(var(--border))] px-3 py-2 text-sm"
                    >
                      <span>{amenity}</span>
                      <input
                        type="checkbox"
                        checked={locationForm.amenities.includes(amenity)}
                        onChange={() => toggleAmenity(amenity)}
                        className="h-4 w-4 accent-[rgb(var(--brand))]"
                      />
                    </label>
                  ))}
                </div>
              </section>

              <section className="grid gap-3 md:grid-cols-2">
                <label className="space-y-1">
                  <span className="text-xs font-medium text-[rgb(var(--muted))]">Best season</span>
                  <select
                    value={locationForm.bestSeason}
                    onChange={(event) =>
                      updateLocationField("bestSeason", event.target.value as CreateLocationFormState["bestSeason"])
                    }
                    className="w-full rounded-lg border border-[rgb(var(--border))] bg-transparent px-3 py-2 text-sm outline-none ring-[rgb(var(--brand))] transition focus:ring-2"
                  >
                    <option>Spring</option>
                    <option>Summer</option>
                    <option>Autumn</option>
                    <option>Winter</option>
                    <option>Year-round</option>
                  </select>
                </label>
                <label className="space-y-1">
                  <span className="text-xs font-medium text-[rgb(var(--muted))]">Entry fee (optional)</span>
                  <input
                    value={locationForm.entryFee}
                    onChange={(event) => updateLocationField("entryFee", event.target.value)}
                    placeholder="$0, donation based, day pass..."
                    className="w-full rounded-lg border border-[rgb(var(--border))] bg-transparent px-3 py-2 text-sm outline-none ring-[rgb(var(--brand))] transition focus:ring-2"
                  />
                </label>
                <label className="space-y-1 md:col-span-2">
                  <span className="text-xs font-medium text-[rgb(var(--muted))]">Website or info link</span>
                  <input
                    value={locationForm.website}
                    onChange={(event) => updateLocationField("website", event.target.value)}
                    placeholder="https://"
                    className="w-full rounded-lg border border-[rgb(var(--border))] bg-transparent px-3 py-2 text-sm outline-none ring-[rgb(var(--brand))] transition focus:ring-2"
                  />
                </label>
                <label className="space-y-1 md:col-span-2">
                  <span className="text-xs font-medium text-[rgb(var(--muted))]">Rules & etiquette</span>
                  <textarea
                    value={locationForm.rules}
                    onChange={(event) => updateLocationField("rules", event.target.value)}
                    rows={3}
                    placeholder="No photography, bring towel to sit on, respect quiet zones..."
                    className="w-full rounded-lg border border-[rgb(var(--border))] bg-transparent px-3 py-2 text-sm outline-none ring-[rgb(var(--brand))] transition focus:ring-2"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-xs font-medium text-[rgb(var(--muted))]">Tags</span>
                  <input
                    value={locationForm.tags}
                    onChange={(event) => updateLocationField("tags", event.target.value)}
                    placeholder="quiet, social, LGBTQ+ friendly, couples..."
                    className="w-full rounded-lg border border-[rgb(var(--border))] bg-transparent px-3 py-2 text-sm outline-none ring-[rgb(var(--brand))] transition focus:ring-2"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-xs font-medium text-[rgb(var(--muted))]">Reporter notes</span>
                  <input
                    value={locationForm.reporterNotes}
                    onChange={(event) => updateLocationField("reporterNotes", event.target.value)}
                    placeholder="Visited in Aug 2025, calm after 5pm..."
                    className="w-full rounded-lg border border-[rgb(var(--border))] bg-transparent px-3 py-2 text-sm outline-none ring-[rgb(var(--brand))] transition focus:ring-2"
                  />
                </label>
              </section>

              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[rgb(var(--border))] pt-4">
                <p className="text-xs text-[rgb(var(--muted))]">UI-only draft. Submission endpoint can be wired next.</p>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setLocationForm(INITIAL_LOCATION_FORM)}
                  >
                    Reset
                  </Button>
                  <Button type="button" className="bg-[rgb(var(--brand))] text-[rgb(var(--text-inverse))]">
                    Save draft
                  </Button>
                </div>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}