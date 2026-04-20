"use client";

import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Building2, Flame, Hotel, MapPin, TentTree, Trees, Umbrella } from "lucide-react";

import { MapSpotPopup } from "@/components/explore/map-spot-popup";
import { Button } from "@/components/ui/button";
import { buildUserScopedCacheKey, loadCachedThenRefresh } from "@/lib/client-cache";
import { supabase } from "@/lib/supabase";

type Spot = {
  id: string;
  name: string;
  description: string;
  latitude: number | string;
  longitude: number | string;
  privacy: "Public" | "Discreet" | string;
  terrain?: string | null;
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

type LocationSearchResult = {
  place_id: number;
  display_name: string;
  lat?: string;
  lon?: string;
  lng?: string;
  latitude?: string;
  longitude?: string;
  type?: string;
  class?: string;
};

type InteractionControl = {
  disable?: () => void;
  enable?: () => void;
};

type MapClickEvent = {
  lngLat?: {
    lat: number;
    lng: number;
  };
};

type MapLibreMapInstance = {
  remove: () => void;
  addControl: (control: unknown, position?: string) => void;
  on: (event: "click", listener: (event: MapClickEvent) => void) => void;
  off: (event: "click", listener: (event: MapClickEvent) => void) => void;
  flyTo?: (config: { center: [number, number]; zoom?: number }) => void;
  dragPan?: InteractionControl;
  scrollZoom?: InteractionControl;
  boxZoom?: InteractionControl;
  dragRotate?: InteractionControl;
  keyboard?: InteractionControl;
  doubleClickZoom?: InteractionControl;
  touchZoomRotate?: InteractionControl;
};

type MapLibreMarkerInstance = {
  remove: () => void;
  getLngLat?: () => { lat: number; lng: number };
  setLngLat: (lngLat: [number, number]) => MapLibreMarkerInstance;
  addTo: (map: unknown) => unknown;
};

type MapLibreGlobal = {
  Map: new (config: Record<string, unknown>) => MapLibreMapInstance;
  NavigationControl: new () => unknown;
  Marker: new (config: { element: HTMLElement; anchor?: string }) => MapLibreMarkerInstance;
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

function terrainIconComponent(terrain: Spot["terrain"]) {
  const normalized = (terrain ?? "").toLowerCase();

  if (normalized.includes("beach")) return Umbrella;
  if (normalized.includes("forest")) return Trees;
  if (normalized.includes("resort")) return Hotel;
  if (normalized.includes("camp")) return TentTree;
  if (normalized.includes("hot spring")) return Flame;
  if (normalized.includes("urban") || normalized.includes("rooftop")) return Building2;
  return MapPin;
}

function buildMarkerElement(privacy: Spot["privacy"], terrain: Spot["terrain"]) {
  const marker = document.createElement("button");
  marker.type = "button";
  marker.style.width = "24px";
  marker.style.height = "24px";
  marker.style.display = "grid";
  marker.style.placeItems = "center";
  marker.style.padding = "0";
  marker.style.borderRadius = "999px";
  marker.style.border = "1px solid rgba(255, 255, 255, 0.72)";
  marker.style.boxShadow = "0 8px 16px rgba(0, 0, 0, 0.22)";
  marker.style.backdropFilter = "blur(1.5px)";

  const isPublic = privacy === "Public";
  marker.style.background = isPublic
    ? "linear-gradient(145deg, rgba(250, 205, 102, 0.98), rgba(236, 165, 66, 0.98))"
    : "linear-gradient(145deg, rgba(16, 146, 112, 0.98), rgba(13, 108, 92, 0.98))";
  marker.style.color = isPublic ? "rgba(90, 51, 0, 0.92)" : "rgba(225, 255, 242, 0.96)";

  const icon = document.createElement("span");
  icon.style.width = "13px";
  icon.style.height = "13px";
  icon.style.display = "inline-grid";
  icon.style.placeItems = "center";
  icon.style.filter = "drop-shadow(0 1px 0 rgba(0,0,0,0.12))";

  const Icon = terrainIconComponent(terrain);
  createRoot(icon).render(<Icon size={13} strokeWidth={2.25} />);
  marker.appendChild(icon);

  marker.style.lineHeight = "1";

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
const MAP_SPOTS_CACHE_MAX_AGE_MS = 1000 * 60 * 5;

function resolveSearchCoordinates(result: LocationSearchResult) {
  const latitudeCandidate = result.lat ?? result.latitude;
  const longitudeCandidate = result.lon ?? result.lng ?? result.longitude;

  const latitude = Number(latitudeCandidate);
  const longitude = Number(longitudeCandidate);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }

  return { latitude, longitude };
}

function resolveResultTitle(result: LocationSearchResult) {
  const rawTitle = result.display_name.split(",")[0]?.trim();
  return rawTitle || result.display_name.trim();
}

type ReverseLookupResult = {
  name?: string;
  display_name?: string;
  category?: string;
  class?: string;
  type?: string;
  addresstype?: string;
};

function resolveTitleFromReverseResult(payload: ReverseLookupResult) {
  const primaryName = payload.name?.trim();
  if (primaryName) return primaryName;

  const displayName = payload.display_name?.split(",")[0]?.trim();
  return displayName || null;
}

async function reverseLookup(latitude: number, longitude: number, querySuffix = "") {
  const response = await fetch(
    `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latitude}&lon=${longitude}&zoom=18${querySuffix}`,
    {
      headers: {
        Accept: "application/json",
      },
    },
  );

  if (!response.ok) {
    throw new Error(`Reverse lookup failed (${response.status})`);
  }

  return (await response.json()) as ReverseLookupResult;
}

function isNatureLikeResult(payload: ReverseLookupResult) {
  const combined = `${payload.category ?? ""} ${payload.class ?? ""} ${payload.type ?? ""} ${payload.addresstype ?? ""}`
    .toLowerCase()
    .trim();

  return (
    combined.includes("natural") ||
    combined.includes("beach") ||
    combined.includes("forest") ||
    combined.includes("wood") ||
    combined.includes("park") ||
    combined.includes("lake") ||
    combined.includes("water")
  );
}

async function resolveTitleFromCoordinates(latitude: number, longitude: number) {
  try {
    const naturalResult = await reverseLookup(latitude, longitude, "&layer=natural");
    const naturalTitle = resolveTitleFromReverseResult(naturalResult);
    if (naturalTitle && isNatureLikeResult(naturalResult)) {
      return naturalTitle;
    }
  } catch (error) {
    console.warn("Natural reverse lookup unavailable, falling back to generic lookup", error);
  }

  const fallbackResult = await reverseLookup(latitude, longitude);
  return resolveTitleFromReverseResult(fallbackResult);
}

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

function formatCoordinate(value: string) {
  const num = Number(value);
  if (!Number.isFinite(num)) return "";
  return num.toFixed(6);
}

export function MapStageClient() {
  const [mapSpotsCacheKey] = useState(() => buildUserScopedCacheKey("map-spots"));
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMapInstance | null>(null);
  const renderedSpotIdsRef = useRef<Set<string>>(new Set());
  const selectionMarkerRef = useRef<MapLibreMarkerInstance | null>(null);
  const [mapError, setMapError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [isPickingFromMap, setIsPickingFromMap] = useState(false);
  const [selectedSpot, setSelectedSpot] = useState<Spot | null>(null);
  const [locationForm, setLocationForm] = useState<CreateLocationFormState>(INITIAL_LOCATION_FORM);
  const [locationSearchQuery, setLocationSearchQuery] = useState("");
  const [locationSearchLoading, setLocationSearchLoading] = useState(false);
  const [locationSearchError, setLocationSearchError] = useState<string | null>(null);
  const [locationSearchResults, setLocationSearchResults] = useState<LocationSearchResult[]>([]);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isSubmittingLocation, setIsSubmittingLocation] = useState(false);
  const [submitFeedback, setSubmitFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [showLocationPrompt, setShowLocationPrompt] = useState(true);
  const [isLocatingUser, setIsLocatingUser] = useState(false);
  const [locationPromptError, setLocationPromptError] = useState<string | null>(null);

  const canCreateLocation = useMemo(() => isLoggedIn, [isLoggedIn]);

  useEffect(() => {
    let mounted = true;

    void supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setIsLoggedIn(Boolean(data.session?.user));
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsLoggedIn(Boolean(session?.user));
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    let mapInstance: MapLibreMapInstance | null = null;
    const renderedSpotIds = renderedSpotIdsRef.current;
    renderedSpotIds.clear();

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
        mapRef.current = map;

        try {
          const spots = await loadCachedThenRefresh<Spot[]>({
            key: mapSpotsCacheKey,
            maxAgeMs: MAP_SPOTS_CACHE_MAX_AGE_MS,
            onCachedData: (cachedSpots) => {
              for (const cachedSpot of cachedSpots) {
                addSpotMarkerToMap(cachedSpot);
              }
            },
            fetchFresh: async () => {
              const mapSpotsResponse = await fetch("/api/map-spots", { cache: "no-store" });
              if (!mapSpotsResponse.ok) {
                throw new Error(`Map spots request failed (${mapSpotsResponse.status})`);
              }

              const payload = (await mapSpotsResponse.json()) as { spots?: Spot[] };
              return payload.spots ?? [];
            },
          });

          for (const spot of spots) {
            addSpotMarkerToMap(spot);
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
      selectionMarkerRef.current = null;
      renderedSpotIds.clear();
      mapRef.current = null;
      mapInstance?.remove();
    };
  }, [mapSpotsCacheKey]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const lockMap = Boolean(selectedSpot) || (open && !isPickingFromMap);

    for (const interactionKey of MAP_LOCK_INTERACTIONS) {
      const interaction = map[interactionKey];
      if (!interaction) continue;

      if (lockMap) {
        interaction.disable?.();
      } else {
        interaction.enable?.();
      }
    }
  }, [isPickingFromMap, open, selectedSpot]);

  function dismissLocationPrompt() {
    setShowLocationPrompt(false);
    setLocationPromptError(null);
  }

  function focusMapOnUserLocation() {
    if (!navigator.geolocation) {
      setLocationPromptError("Geolocation is not supported in this browser.");
      return;
    }

    setIsLocatingUser(true);
    setLocationPromptError(null);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const latitude = position.coords.latitude;
        const longitude = position.coords.longitude;
        mapRef.current?.flyTo?.({ center: [longitude, latitude], zoom: 11 });
        dismissLocationPrompt();
        setIsLocatingUser(false);
      },
      (error) => {
        console.error("Failed to retrieve user location", error);
        const message =
          error.code === error.PERMISSION_DENIED
            ? "Location access was denied. You can continue with the default map view."
            : "We couldn't fetch your location. Please try again or continue with the default view.";
        setLocationPromptError(message);
        setIsLocatingUser(false);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
      },
    );
  }

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

  function clearLocationSearch() {
    setLocationSearchResults([]);
    setLocationSearchError(null);
  }

  function setFormCoordinates(latitude: number, longitude: number) {
    setLocationForm((current) => ({
      ...current,
      latitude: latitude.toFixed(6),
      longitude: longitude.toFixed(6),
    }));
  }

  function placeSelectionMarker(latitude: number, longitude: number) {
    const map = mapRef.current;
    if (!map || !window.maplibregl) return;

    if (!selectionMarkerRef.current) {
      const markerElement = document.createElement("div");
      markerElement.style.width = "16px";
      markerElement.style.height = "16px";
      markerElement.style.borderRadius = "999px";
      markerElement.style.border = "2px solid white";
      markerElement.style.background = "rgb(var(--brand))";
      markerElement.style.boxShadow = "0 0 0 5px rgba(16, 100, 81, 0.25)";
      selectionMarkerRef.current = new window.maplibregl.Marker({ element: markerElement, anchor: "bottom" });
    }

    selectionMarkerRef.current.setLngLat([longitude, latitude]).addTo(map);
  }

  function addSpotMarkerToMap(spot: Spot) {
    const map = mapRef.current;
    if (!map || !window.maplibregl) return;
    if (renderedSpotIdsRef.current.has(spot.id)) return;

    const latitude = Number(spot.latitude);
    const longitude = Number(spot.longitude);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;

    const markerElement = buildMarkerElement(spot.privacy, spot.terrain);
    markerElement.addEventListener("click", () => {
      setSelectedSpot(spot);
    });

    new window.maplibregl.Marker({ element: markerElement, anchor: "center" }).setLngLat([longitude, latitude]).addTo(map);
    renderedSpotIdsRef.current.add(spot.id);
  }

  async function searchLocations() {
    const query = locationSearchQuery.trim();
    if (query.length < 2) {
      setLocationSearchError("Type at least 2 characters to search for a place.");
      setLocationSearchResults([]);
      return;
    }

    setLocationSearchLoading(true);
    setLocationSearchError(null);

    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=jsonv2&q=${encodeURIComponent(query)}&limit=8`,
        {
          headers: {
            Accept: "application/json",
          },
        },
      );

      if (!response.ok) {
        throw new Error(`Search failed (${response.status})`);
      }

      const payload = (await response.json()) as LocationSearchResult[];
      setLocationSearchResults(payload);

      if (payload.length === 0) {
        setLocationSearchError("No results found. You can click “Pick on map” and choose the spot manually.");
      }
    } catch (error) {
      console.error("Failed to search locations", error);
      setLocationSearchResults([]);
      setLocationSearchError("Search failed. You can still pick the location directly on the map.");
    } finally {
      setLocationSearchLoading(false);
    }
  }

  function selectSearchResult(result: LocationSearchResult) {
    const coordinates = resolveSearchCoordinates(result);
    if (!coordinates) {
      setLocationSearchError("This result did not include coordinates. Try a different result or pick on map.");
      return;
    }

    setFormCoordinates(coordinates.latitude, coordinates.longitude);
    const selectedTitle = resolveResultTitle(result);
    setLocationForm((current) => ({
      ...current,
      name: selectedTitle,
    }));
    placeSelectionMarker(coordinates.latitude, coordinates.longitude);
    mapRef.current?.flyTo?.({ center: [coordinates.longitude, coordinates.latitude], zoom: 11 });
    clearLocationSearch();
  }

  function beginMapPicking() {
    setIsPickingFromMap(true);
  }

  function closeCreateLocationModal() {
    setOpen(false);
    setIsPickingFromMap(false);
    clearLocationSearch();
    setSubmitFeedback(null);
  }

  async function handleLocationSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitFeedback(null);

    const latitude = Number(locationForm.latitude);
    const longitude = Number(locationForm.longitude);

    if (!locationForm.name.trim()) {
      setSubmitFeedback({ type: "error", message: "Location name is required." });
      return;
    }

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      setSubmitFeedback({ type: "error", message: "Please choose valid coordinates before submitting." });
      return;
    }

    setIsSubmittingLocation(true);

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      const response = await fetch("/api/map-spots", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify({
          name: locationForm.name.trim(),
          shortDescription: locationForm.shortDescription.trim(),
          fullDescription: locationForm.fullDescription.trim(),
          latitude,
          longitude,
          locationHint: locationForm.locationHint.trim(),
          country: locationForm.country.trim(),
          region: locationForm.region.trim(),
          accessType: locationForm.accessType,
          terrain: locationForm.terrain,
          clothingPolicy: locationForm.clothingPolicy,
          safetyLevel: locationForm.safetyLevel,
          bestSeason: locationForm.bestSeason,
          entryFee: locationForm.entryFee.trim(),
          website: locationForm.website.trim(),
          rules: locationForm.rules.trim(),
          amenities: locationForm.amenities,
          tags: locationForm.tags
            .split(",")
            .map((tag) => tag.trim())
            .filter(Boolean),
          reporterNotes: locationForm.reporterNotes.trim(),
        }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? `Submission failed (${response.status}).`);
      }

      const payload = (await response.json()) as { id?: string };
      const newSpot: Spot = {
        id: payload.id ?? crypto.randomUUID(),
        name: locationForm.name.trim(),
        description: locationForm.fullDescription.trim() || locationForm.shortDescription.trim() || locationForm.name.trim(),
        latitude,
        longitude,
        privacy: locationForm.accessType,
        terrain: locationForm.terrain,
      };

      addSpotMarkerToMap(newSpot);
      setLocationForm(INITIAL_LOCATION_FORM);
      clearLocationSearch();
      closeCreateLocationModal();
    } catch (error) {
      console.error("Failed to submit location", error);
      setSubmitFeedback({
        type: "error",
        message: error instanceof Error ? error.message : "Failed to submit location.",
      });
    } finally {
      setIsSubmittingLocation(false);
    }
  }

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !open || !isPickingFromMap) return;

    const onClick = (event: MapClickEvent) => {
      const latitude = event.lngLat?.lat;
      const longitude = event.lngLat?.lng;
      if (typeof latitude !== "number" || typeof longitude !== "number") return;
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;

      setFormCoordinates(latitude, longitude);
      placeSelectionMarker(latitude, longitude);
      setIsPickingFromMap(false);

      void resolveTitleFromCoordinates(latitude, longitude)
        .then((resolvedName) => {
          if (!resolvedName) return;
          setLocationForm((current) => ({
            ...current,
            name: resolvedName,
          }));
        })
        .catch((error) => {
          console.error("Failed to resolve location title from map click", error);
        });
    };

    map.on("click", onClick);
    return () => {
      map.off("click", onClick);
    };
  }, [isPickingFromMap, open]);

  return (
    <>
      <div ref={mapContainerRef} className="h-full w-full rounded-[14px]" aria-label="Explore map canvas" />

      {showLocationPrompt ? (
        <div className="absolute inset-0 z-30 grid place-items-center bg-black/30 p-4">
          <div className="w-full max-w-md rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--card))] p-4 shadow-2xl">
            <h3 className="m-0 text-base font-semibold text-[rgb(var(--text-strong))]">Use your location?</h3>
            <p className="mt-2 text-sm text-[rgb(var(--muted))]">
              Share your location and we’ll fly the map to where you are now.
            </p>
            {locationPromptError ? (
              <p className="mt-2 rounded-lg bg-[rgb(190,68,68)/0.12] px-3 py-2 text-xs text-[rgb(190,68,68)]">
                {locationPromptError}
              </p>
            ) : null}
            <div className="mt-4 flex flex-wrap gap-2">
              <Button type="button" onClick={focusMapOnUserLocation} disabled={isLocatingUser}>
                {isLocatingUser ? "Locating..." : "Yes, use my location"}
              </Button>
              <Button type="button" variant="outline" onClick={dismissLocationPrompt} disabled={isLocatingUser}>
                No thanks
              </Button>
            </div>
          </div>
        </div>
      ) : null}
      
      {selectedSpot ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
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
          onClick={() => {
            setOpen(true);
            setIsPickingFromMap(false);
          }}
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
        <div className={`fixed inset-0 z-40 p-4 sm:p-6 ${isPickingFromMap ? "pointer-events-none bg-transparent" : "bg-black/45"}`}>
          {isPickingFromMap ? (
            <div className="pointer-events-auto mx-auto mb-3 w-full max-w-3xl rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--card))] p-3 shadow-xl">
              <p className="text-sm text-[rgb(var(--text-strong))]">
                Click the exact location on the map to fill latitude/longitude automatically.
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button type="button" variant="outline" onClick={() => setIsPickingFromMap(false)}>
                  Back to form
                </Button>
                <Button type="button" variant="outline" onClick={closeCreateLocationModal}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : null}

          {!isPickingFromMap ? (
            <div className="mx-auto max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--card))] p-5 shadow-xl">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <h3 className="m-0 text-base font-semibold text-[rgb(var(--text-strong))]">Create location</h3>
                <p className="mt-1 text-sm text-[rgb(var(--muted))]">
                  Add comprehensive details so people understand access, vibe, safety, and local expectations.
                </p>
              </div>
              <Button type="button" variant="outline" onClick={closeCreateLocationModal}>
                Close
              </Button>
            </div>

            <form className="space-y-5" onSubmit={(event) => void handleLocationSubmit(event)}>
              <div className="grid gap-2 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--bg-soft))/0.45] p-3 text-xs text-[rgb(var(--muted))] sm:grid-cols-3">
                <p className="m-0">
                  <strong className="text-[rgb(var(--text-strong))]">1. Basics</strong>
                  <br />
                  Name + clear description
                </p>
                <p className="m-0">
                  <strong className="text-[rgb(var(--text-strong))]">2. Pin location</strong>
                  <br />
                  Search or click on map
                </p>
                <p className="m-0">
                  <strong className="text-[rgb(var(--text-strong))]">3. Helpful details</strong>
                  <br />
                  Access, safety, amenities
                </p>
              </div>

              <section className="grid gap-3 rounded-xl border border-[rgb(var(--border))] p-4 md:grid-cols-2">
                <div className="md:col-span-2">
                  <h4 className="m-0 text-sm font-semibold text-[rgb(var(--text-strong))]">Basics</h4>
                  <p className="mt-1 text-xs text-[rgb(var(--muted))]">
                    Keep this short and factual so people understand the place quickly.
                  </p>
                </div>
                <label className="space-y-1 md:col-span-2">
                  <span className="text-xs font-medium text-[rgb(var(--muted))]">Location name *</span>
                  <input
                    value={locationForm.name}
                    onChange={(event) => updateLocationField("name", event.target.value)}
                    placeholder="e.g. Sunset Cove Naturist Beach"
                    className="w-full rounded-lg border border-[rgb(var(--border))] bg-transparent px-3 py-2 text-sm outline-none ring-[rgb(var(--brand))] transition focus:ring-2"
                  />
                </label>
                <label className="space-y-1 md:col-span-2">
                  <span className="text-xs font-medium text-[rgb(var(--muted))]">Short description *</span>
                  <input
                    value={locationForm.shortDescription}
                    onChange={(event) => updateLocationField("shortDescription", event.target.value)}
                    placeholder="1 sentence summary for map popup"
                    className="w-full rounded-lg border border-[rgb(var(--border))] bg-transparent px-3 py-2 text-sm outline-none ring-[rgb(var(--brand))] transition focus:ring-2"
                  />
                </label>
                <label className="space-y-1 md:col-span-2">
                  <span className="text-xs font-medium text-[rgb(var(--muted))]">Full description *</span>
                  <textarea
                    value={locationForm.fullDescription}
                    onChange={(event) => updateLocationField("fullDescription", event.target.value)}
                    placeholder="Share atmosphere, etiquette, how busy it gets, and any known restrictions."
                    rows={4}
                    className="w-full rounded-lg border border-[rgb(var(--border))] bg-transparent px-3 py-2 text-sm outline-none ring-[rgb(var(--brand))] transition focus:ring-2"
                  />
                </label>
              </section>

              <section className="grid gap-3 rounded-xl border border-[rgb(var(--border))] p-4 md:grid-cols-2">
                <div className="md:col-span-2">
                  <h4 className="m-0 text-sm font-semibold text-[rgb(var(--text-strong))]">Map location</h4>
                  <p className="mt-1 text-xs text-[rgb(var(--muted))]">
                    Coordinates are required. Use search for speed, then fine-tune with map picking.
                  </p>
                </div>
                <div className="space-y-2 md:col-span-2">
                  <span className="text-xs font-medium text-[rgb(var(--muted))]">Coordinates *</span>
                  <div className="grid gap-2 rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--bg-soft))/0.55] p-3 sm:grid-cols-2">
                    <p className="m-0 text-sm text-[rgb(var(--text))]">
                      Latitude:{" "}
                      <strong>{formatCoordinate(locationForm.latitude) || "Not selected yet"}</strong>
                    </p>
                    <p className="m-0 text-sm text-[rgb(var(--text))]">
                      Longitude:{" "}
                      <strong>{formatCoordinate(locationForm.longitude) || "Not selected yet"}</strong>
                    </p>
                  </div>
                  <p className="m-0 text-xs text-[rgb(var(--muted))]">
                    Search for any place (beach, lake, forest, building, etc.) or choose directly on the map.
                  </p>
                </div>
                <div className="space-y-2 md:col-span-2">
                  <label className="space-y-1">
                    <span className="text-xs font-medium text-[rgb(var(--muted))]">Find a place</span>
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <input
                        value={locationSearchQuery}
                        onChange={(event) => setLocationSearchQuery(event.target.value)}
                        placeholder="Try: Baker Beach, Yosemite Valley, Central Park..."
                        className="w-full rounded-lg border border-[rgb(var(--border))] bg-transparent px-3 py-2 text-sm outline-none ring-[rgb(var(--brand))] transition focus:ring-2"
                      />
                      <Button type="button" onClick={() => void searchLocations()} disabled={locationSearchLoading}>
                        {locationSearchLoading ? "Searching..." : "Search"}
                      </Button>
                      <Button type="button" variant="outline" onClick={beginMapPicking}>
                        Pick on map
                      </Button>
                    </div>
                  </label>
                  {locationSearchError ? (
                    <p className="m-0 text-xs text-[rgb(190,68,68)]">{locationSearchError}</p>
                  ) : null}
                  {locationSearchResults.length > 0 ? (
                    <ul className="m-0 grid list-none gap-2 p-0">
                      {locationSearchResults.map((result) => (
                        <li key={result.place_id}>
                          <button
                            type="button"
                            onClick={() => selectSearchResult(result)}
                            className="w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--bg-soft))/0.5] p-2 text-left text-sm transition hover:border-[rgb(var(--brand))]"
                          >
                            <p className="m-0 font-medium text-[rgb(var(--text-strong))]">{result.display_name}</p>
                            <p className="m-0 mt-1 text-xs text-[rgb(var(--muted))]">
                              {(() => {
                                const coordinates = resolveSearchCoordinates(result);
                                if (!coordinates) return "Coordinates unavailable";
                                return `${coordinates.latitude.toFixed(5)}, ${coordinates.longitude.toFixed(5)}`;
                              })()}
                            </p>
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
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

              <section className="grid gap-3 rounded-xl border border-[rgb(var(--border))] p-4 md:grid-cols-2">
                <div className="md:col-span-2">
                  <h4 className="m-0 text-sm font-semibold text-[rgb(var(--text-strong))]">Access & environment</h4>
                </div>
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

              <section className="space-y-2 rounded-xl border border-[rgb(var(--border))] p-4">
                <p className="m-0 text-sm font-semibold text-[rgb(var(--text-strong))]">Amenities</p>
                <p className="m-0 text-xs text-[rgb(var(--muted))]">Select everything visitors should reasonably expect.</p>
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

              <section className="grid gap-3 rounded-xl border border-[rgb(var(--border))] p-4 md:grid-cols-2">
                <div className="md:col-span-2">
                  <h4 className="m-0 text-sm font-semibold text-[rgb(var(--text-strong))]">Extra details</h4>
                  <p className="mt-1 text-xs text-[rgb(var(--muted))]">
                    Optional notes improve trust and help people prepare respectfully.
                  </p>
                </div>
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

              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--bg-soft))/0.35] px-4 py-3">
                {submitFeedback ? (
                  <p
                    className={`text-xs ${
                      submitFeedback.type === "success" ? "text-[rgb(24,132,84)]" : "text-[rgb(190,68,68)]"
                    }`}
                  >
                    {submitFeedback.message}
                  </p>
                ) : (
                  <p className="text-xs text-[rgb(var(--muted))]">
                    Fields marked * are required. Submitted locations are added to the map immediately.
                  </p>
                )}
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setLocationForm(INITIAL_LOCATION_FORM);
                      clearLocationSearch();
                    }}
                  >
                    Reset
                  </Button>
                  <Button
                    type="submit"
                    disabled={isSubmittingLocation}
                    className="bg-[rgb(var(--brand))] text-[rgb(var(--text-inverse))]"
                  >
                    {isSubmittingLocation ? "Submitting..." : "Submit location"}
                  </Button>
                </div>
              </div>
            </form>
            </div>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
