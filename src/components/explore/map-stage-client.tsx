"use client";

import { type FormEvent, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Building2, Flame, Hotel, MapPin, TentTree, Trees, Umbrella } from "lucide-react";

import { MapSpotPopup } from "@/components/explore/map-spot-popup";
import overlayStyles from "./map-stage-client.module.css";
import { Button } from "@/components/ui/button";
import { buildUserScopedCacheKey, loadCachedThenRefresh } from "@/lib/client-cache";
import { canCurrentUserAct, VIEW_ONLY_ACTION_MESSAGE } from "@/lib/client-action-access";
import { takePrefetchedRouteData } from "@/lib/prefetched-route-data";
import { promptAndSubmitReport } from "@/lib/reporting";
import { supabase } from "@/lib/supabase";

type Spot = {
  id: string;
  name: string;
  description: string;
  latitude: number | string;
  longitude: number | string;
  privacy: "Public" | "Discreet" | string;
  access_type?: string | null;
  terrain?: string | null;
  safety_level?: string | null;
  checkInCount?: number;
  spotType?: string;
  visitors?: string;
  mood?: string;
};
type ExploreFilterMode = "all" | "nearby" | "quiet" | "events";
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

type LocationRequestFormState = {
  placeName: string;
  locationHint: string;
  latitude: string;
  longitude: string;
  website: string;
  isStay: boolean;
  notes: string;
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
  getCenter?: () => { lat: number; lng: number };
  getZoom?: () => number;
  setZoom?: (zoom: number) => void;
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
  marker.style.width = "44px";
  marker.style.height = "44px";
  marker.style.minWidth = "44px";
  marker.style.minHeight = "44px";
  marker.style.display = "grid";
  marker.style.placeItems = "center";
  marker.style.padding = "0";
  marker.style.border = "0";
  marker.style.borderRadius = "999px";
  marker.style.background = "transparent";
  marker.style.cursor = "pointer";
  marker.style.lineHeight = "1";
  marker.style.setProperty("-webkit-tap-highlight-color", "transparent");

  const isPublic = privacy === "Public";
  marker.style.color = isPublic ? "rgba(90, 51, 0, 0.92)" : "rgba(225, 255, 242, 0.96)";

  const markerBadge = document.createElement("span");
  markerBadge.style.width = "30px";
  markerBadge.style.height = "30px";
  markerBadge.style.display = "grid";
  markerBadge.style.placeItems = "center";
  markerBadge.style.borderRadius = "999px";
  markerBadge.style.border = "1px solid rgba(255, 255, 255, 0.72)";
  markerBadge.style.background = isPublic
    ? "linear-gradient(145deg, rgba(250, 205, 102, 0.98), rgba(236, 165, 66, 0.98))"
    : "linear-gradient(145deg, rgba(16, 146, 112, 0.98), rgba(13, 108, 92, 0.98))";
  markerBadge.style.boxShadow = "0 8px 18px rgba(0, 0, 0, 0.26)";
  markerBadge.style.backdropFilter = "blur(1.5px)";

  const icon = document.createElement("span");
  icon.style.width = "15px";
  icon.style.height = "15px";
  icon.style.display = "inline-grid";
  icon.style.placeItems = "center";
  icon.style.filter = "drop-shadow(0 1px 0 rgba(0,0,0,0.12))";

  const Icon = terrainIconComponent(terrain);
  createRoot(icon).render(<Icon size={15} strokeWidth={2.35} />);
  markerBadge.appendChild(icon);
  marker.appendChild(markerBadge);

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
const EXPLORE_DEFAULT_MAP_CENTER: [number, number] = [-98.5795, 39.8283];
const EXPLORE_DEFAULT_MAP_ZOOM = 3;

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

const INITIAL_LOCATION_REQUEST_FORM: LocationRequestFormState = {
  placeName: "",
  locationHint: "",
  latitude: "",
  longitude: "",
  website: "",
  isStay: false,
  notes: "",
};

function formatCoordinate(value: string) {
  const num = Number(value);
  if (!Number.isFinite(num)) return "";
  return num.toFixed(6);
}

export function MapStageClient() {
  const [mapSpotsCacheKey] = useState(() => buildUserScopedCacheKey("map-spots"));
  const prefetchedMapSpotsRef = useRef<Spot[] | null>(takePrefetchedRouteData<Spot[]>("map-spots"));
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMapInstance | null>(null);
  const renderedSpotIdsRef = useRef<Set<string>>(new Set());
  const selectionMarkerRef = useRef<MapLibreMarkerInstance | null>(null);
  const [mapError, setMapError] = useState<string | null>(null);
  const [requestOpen, setRequestOpen] = useState(false);
  const [isPickingRequestFromMap, setIsPickingRequestFromMap] = useState(false);
  const [locationRequestForm, setLocationRequestForm] = useState<LocationRequestFormState>(INITIAL_LOCATION_REQUEST_FORM);
  const [isResolvingLocationRequest, setIsResolvingLocationRequest] = useState(false);
  const [isSubmittingLocationRequest, setIsSubmittingLocationRequest] = useState(false);
  const [locationRequestFeedback, setLocationRequestFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [isViewerActionLocked, setViewerActionLocked] = useState(false);
  const [open, setOpen] = useState(false);
  const [isPickingFromMap, setIsPickingFromMap] = useState(false);
  const [selectedSpot, setSelectedSpot] = useState<Spot | null>(null);
  const [isCheckingIn, setIsCheckingIn] = useState(false);
  const [checkInError, setCheckInError] = useState<string | null>(null);
  const [spotReportStatus, setSpotReportStatus] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [activeFilter, setActiveFilter] = useState<ExploreFilterMode>("all");
  const [locationForm, setLocationForm] = useState<CreateLocationFormState>(INITIAL_LOCATION_FORM);
  const [locationSearchQuery, setLocationSearchQuery] = useState("");
  const [locationSearchLoading, setLocationSearchLoading] = useState(false);
  const [locationSearchError, setLocationSearchError] = useState<string | null>(null);
  const [locationSearchResults, setLocationSearchResults] = useState<LocationSearchResult[]>([]);
  const [isSubmittingLocation, setIsSubmittingLocation] = useState(false);
  const [submitFeedback, setSubmitFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [showLocationPrompt, setShowLocationPrompt] = useState(true);
  const [isLocatingUser, setIsLocatingUser] = useState(false);
  const [locationPromptError, setLocationPromptError] = useState<string | null>(null);
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const pendingSearchTermRef = useRef("");
  
  const searchInputId = "explore-search";
  const searchSubmitButtonId = "explore-search-submit";

  useEffect(() => {
    let isMounted = true;

    void supabase.auth.getUser().then(async ({ data }) => {
      const user = data.user;
      if (!user) {
        if (isMounted) setViewerActionLocked(true);
        return;
      }

      const canAct = await canCurrentUserAct(user.id);
      if (isMounted) setViewerActionLocked(!canAct);
    });

    return () => {
      isMounted = false;
    };
  }, []);

  function getLockedActionFeedback(action: string) {
    return `${VIEW_ONLY_ACTION_MESSAGE} Verify with ID to ${action}.`;
  }

  function openLocationRequestModal() {
    if (isViewerActionLocked) {
      setLocationRequestFeedback({ type: "error", message: getLockedActionFeedback("request new locations") });
      return;
    }

    setRequestOpen(true);
  }

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
          center: EXPLORE_DEFAULT_MAP_CENTER,
          zoom: EXPLORE_DEFAULT_MAP_ZOOM,
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
              if (prefetchedMapSpotsRef.current) {
                const prefetchedSpots = prefetchedMapSpotsRef.current;
                prefetchedMapSpotsRef.current = null;
                return prefetchedSpots;
              }

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
    const searchInput = document.getElementById(searchInputId) as HTMLInputElement | null;
    const searchSubmitButton = document.getElementById(searchSubmitButtonId) as HTMLButtonElement | null;
    if (!searchInput) return;

    pendingSearchTermRef.current = searchInput.value;

    const submitSearchTerm = () => {
      setSearchTerm(pendingSearchTermRef.current);
    };

    const onSearchInput = (event: Event) => {
      pendingSearchTermRef.current = (event.target as HTMLInputElement).value;
    };
    const onSearchKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      submitSearchTerm();
    };
    const onSearchSubmitClick = () => {
      submitSearchTerm();
    };

    searchInput.addEventListener("input", onSearchInput);
    searchInput.addEventListener("keydown", onSearchKeyDown);
    searchSubmitButton?.addEventListener("click", onSearchSubmitClick);
    return () => {
      searchInput.removeEventListener("input", onSearchInput);
      searchInput.removeEventListener("keydown", onSearchKeyDown);
      searchSubmitButton?.removeEventListener("click", onSearchSubmitClick);
    };
  }, [searchInputId, searchSubmitButtonId]);

  useEffect(() => {
    const chipButtons = Array.from(document.querySelectorAll<HTMLButtonElement>("[data-explore-chip]"));
    const resetButton = document.querySelector<HTMLButtonElement>("[data-explore-reset]");
    if (!chipButtons.length && !resetButton) return;

    const handlers = chipButtons.map((button) => {
      const mode = button.dataset.exploreChipMode as ExploreFilterMode;
      const onClick = () => setActiveFilter(mode || "all");
      button.addEventListener("click", onClick);
      return { button, onClick };
    });

    const onReset = () => {
      setActiveFilter("all");
      setSearchTerm("");
      const searchInput = document.getElementById(searchInputId) as HTMLInputElement | null;
      if (searchInput) {
        searchInput.value = "";
        pendingSearchTermRef.current = "";
      }
    };

    resetButton?.addEventListener("click", onReset);

    return () => {
      for (const handler of handlers) {
        handler.button.removeEventListener("click", handler.onClick);
      }
      resetButton?.removeEventListener("click", onReset);
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const lockMap = Boolean(selectedSpot) || (open && !isPickingFromMap) || (requestOpen && !isPickingRequestFromMap);

    for (const interactionKey of MAP_LOCK_INTERACTIONS) {
      const interaction = map[interactionKey];
      if (!interaction) continue;

      if (lockMap) {
        interaction.disable?.();
      } else {
        interaction.enable?.();
      }
    }
  }, [isPickingFromMap, isPickingRequestFromMap, open, requestOpen, selectedSpot]);

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
        setUserLocation({ latitude, longitude });
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
      setCheckInError(null);
      setSelectedSpot(spot);
    });

    new window.maplibregl.Marker({ element: markerElement, anchor: "center" }).setLngLat([longitude, latitude]).addTo(map);
    renderedSpotIdsRef.current.add(spot.id);
  }

  function matchesSearchTerm(spot: Spot, query: string) {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return true;

    const queryTerms = normalizedQuery.split(/\s+/).filter(Boolean);
    const haystack = `${spot.name} ${spot.description} ${spot.terrain ?? ""} ${spot.privacy}`.toLowerCase();
    
    return queryTerms.every((term) => haystack.includes(term));
  }

  function distanceMiles(aLat: number, aLng: number, bLat: number, bLng: number) {
    const toRad = (value: number) => (value * Math.PI) / 180;
    const earthRadiusMiles = 3958.8;
    const dLat = toRad(bLat - aLat);
    const dLng = toRad(bLng - aLng);
    const lat1 = toRad(aLat);
    const lat2 = toRad(bLat);
    const haversine =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.sin(dLng / 2) * Math.sin(dLng / 2) * Math.cos(lat1) * Math.cos(lat2);
    return 2 * earthRadiusMiles * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
  }

  function matchesActiveFilter(spot: Spot) {
    if (activeFilter === "all") return true;
    if (activeFilter === "quiet") return spot.privacy.toLowerCase().includes("discreet");
    if (activeFilter === "events") {
      const text = `${spot.name} ${spot.description}`.toLowerCase();
      return text.includes("event");
    }
    if (activeFilter === "nearby") {
      const latitude = Number(spot.latitude);
      const longitude = Number(spot.longitude);
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return false;
      const center = userLocation
        ? userLocation
        : mapRef.current?.getCenter
          ? { latitude: mapRef.current.getCenter().lat, longitude: mapRef.current.getCenter().lng }
          : null;
      if (!center) return true;
      return distanceMiles(center.latitude, center.longitude, latitude, longitude) <= 6;
    }
    return true;
  }

  function applyExploreFilters(spots: Spot[]) {
    const query = searchTerm.trim().toLowerCase();
    return spots.filter((spot) => matchesSearchTerm(spot, query) && matchesActiveFilter(spot));
  }

  function zoomOutToRevealMarkers() {
    const currentZoom = mapRef.current?.getZoom?.();
    if (typeof currentZoom !== "number") return;
    mapRef.current?.setZoom?.(Math.max(2, currentZoom - 1.5));
  }

  function rerenderMarkers() {
    const query = searchTerm.trim().toLowerCase();
    renderedSpotIdsRef.current.clear();
    const mapElement = mapContainerRef.current;
    if (mapElement) {
      mapElement.querySelectorAll(".maplibregl-marker").forEach((node) => node.remove());
    }

    void loadCachedThenRefresh<Spot[]>({
      key: mapSpotsCacheKey,
      maxAgeMs: MAP_SPOTS_CACHE_MAX_AGE_MS,
      onCachedData: (cachedSpots) => {
        const filteredCachedSpots = applyExploreFilters(cachedSpots);
        for (const cachedSpot of filteredCachedSpots) {
          addSpotMarkerToMap(cachedSpot);
        }
        if (!query) {
          zoomOutToRevealMarkers();
          return;
        }

        const firstMatch = filteredCachedSpots[0];
        if (firstMatch) {
          const latitude = Number(firstMatch.latitude);
          const longitude = Number(firstMatch.longitude);
          if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
            mapRef.current?.flyTo?.({ center: [longitude, latitude], zoom: 10 });
          }
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
    })
      .then((freshSpots) => {
        const filteredFreshSpots = applyExploreFilters(freshSpots);
        for (const freshSpot of filteredFreshSpots) {
          addSpotMarkerToMap(freshSpot);
        }

        if (!query) {
          zoomOutToRevealMarkers();
          return;
        }

        const firstMatch = filteredFreshSpots[0];
        if (!firstMatch) return;

        const latitude = Number(firstMatch.latitude);
        const longitude = Number(firstMatch.longitude);
        if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
          mapRef.current?.flyTo?.({ center: [longitude, latitude], zoom: 10 });
        }
      })
      .catch((error) => {
        console.error("Failed to refresh map markers after filtering", error);
      });
  }

  useEffect(() => {
    rerenderMarkers();
  }, [activeFilter, searchTerm]);

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

  function updateLocationRequestField<K extends keyof LocationRequestFormState>(field: K, value: LocationRequestFormState[K]) {
    setLocationRequestForm((current) => ({ ...current, [field]: value }));
  }

  function setLocationRequestCoordinates(latitude: number, longitude: number) {
    setLocationRequestForm((current) => ({
      ...current,
      latitude: latitude.toFixed(6),
      longitude: longitude.toFixed(6),
    }));
  }

  function beginLocationRequestMapPicking() {
    setIsPickingRequestFromMap(true);
  }

  async function resolveLocationRequestCoordinatesFromText() {
    const query = [locationRequestForm.placeName, locationRequestForm.locationHint]
      .map((value) => value.trim())
      .filter(Boolean)
      .join(", ");

    if (query.length < 2) {
      setLocationRequestFeedback({ type: "error", message: "Type a location or stay name before finding coordinates." });
      return;
    }

    setIsResolvingLocationRequest(true);
    setLocationRequestFeedback(null);

    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=jsonv2&q=${encodeURIComponent(query)}&limit=1`,
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
      const [firstResult] = payload;
      if (!firstResult) {
        setLocationRequestFeedback({ type: "error", message: "No coordinates found. Try a more specific name or pick on the map." });
        return;
      }

      const coordinates = resolveSearchCoordinates(firstResult);
      if (!coordinates) {
        setLocationRequestFeedback({ type: "error", message: "That result did not include coordinates. Please pick on the map." });
        return;
      }

      setLocationRequestCoordinates(coordinates.latitude, coordinates.longitude);
      placeSelectionMarker(coordinates.latitude, coordinates.longitude);
      mapRef.current?.flyTo?.({ center: [coordinates.longitude, coordinates.latitude], zoom: 11 });
      setLocationRequestForm((current) => ({
        ...current,
        placeName: current.placeName.trim() ? current.placeName : resolveResultTitle(firstResult),
        locationHint: current.locationHint.trim() ? current.locationHint : firstResult.display_name,
      }));
      setLocationRequestFeedback({ type: "success", message: "Coordinates found and attached to this request." });
    } catch (error) {
      console.error("Failed to resolve request coordinates", error);
      setLocationRequestFeedback({
        type: "error",
        message: error instanceof Error ? error.message : "Could not find coordinates. Please pick on the map.",
      });
    } finally {
      setIsResolvingLocationRequest(false);
    }
  }

  function closeLocationRequestModal() {
    setRequestOpen(false);
    setIsPickingRequestFromMap(false);
    setLocationRequestFeedback(null);
  }

  async function handleLocationRequestSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLocationRequestFeedback(null);

    if (isViewerActionLocked) {
      setLocationRequestFeedback({ type: "error", message: getLockedActionFeedback("request new locations") });
      return;
    }

    if (!locationRequestForm.placeName.trim()) {
      setLocationRequestFeedback({ type: "error", message: "Add the location or stay name first." });
      return;
    }

    if (!locationRequestForm.locationHint.trim()) {
      setLocationRequestFeedback({ type: "error", message: "Add a location hint so admins know where to review." });
      return;
    }

    const requestLatitude = Number(locationRequestForm.latitude);
    const requestLongitude = Number(locationRequestForm.longitude);
    if (!Number.isFinite(requestLatitude) || !Number.isFinite(requestLongitude)) {
      setLocationRequestFeedback({ type: "error", message: "Use Find coordinates or Pick on map before sending this request." });
      return;
    }

    setIsSubmittingLocationRequest(true);

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      const response = await fetch("/api/map-spot-requests", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify({
          ...locationRequestForm,
          placeName: locationRequestForm.placeName.trim(),
          locationHint: locationRequestForm.locationHint.trim(),
          latitude: requestLatitude,
          longitude: requestLongitude,
          website: locationRequestForm.website.trim(),
          notes: locationRequestForm.notes.trim(),
          pageUrl: window.location.href,
        }),
      });

      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        throw new Error(payload?.error ?? `Request failed (${response.status}).`);
      }

      setLocationRequestForm(INITIAL_LOCATION_REQUEST_FORM);
      setLocationRequestFeedback({ type: "success", message: "Thanks — admins will review this and add the marker details." });
    } catch (error) {
      console.error("Failed to request location", error);
      setLocationRequestFeedback({
        type: "error",
        message: error instanceof Error ? error.message : "Failed to submit location request.",
      });
    } finally {
      setIsSubmittingLocationRequest(false);
    }
  }

  async function handleSpotCheckIn() {
    if (!selectedSpot || isCheckingIn) return;

    if (isViewerActionLocked) {
      setCheckInError(getLockedActionFeedback("check in to locations"));
      return;
    }

    setIsCheckingIn(true);
    setCheckInError(null);

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      const response = await fetch(`/api/map-spots/${selectedSpot.id}/check-in`, {
        method: "POST",
        headers: {
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
      });

      const payload = (await response.json().catch(() => null)) as { checkInCount?: number; error?: string } | null;
      if (!response.ok) {
        throw new Error(payload?.error ?? `Check-in failed (${response.status}).`);
      }

      const checkInCount = payload?.checkInCount ?? (selectedSpot.checkInCount ?? 0) + 1;
      setSelectedSpot((current) => (current?.id === selectedSpot.id ? { ...current, checkInCount } : current));
    } catch (error) {
      console.error("Failed to check in", error);
      setCheckInError(error instanceof Error ? error.message : "Failed to check in.");
    } finally {
      setIsCheckingIn(false);
    }
  }

  async function handleSpotReport() {
    if (!selectedSpot?.id) return;

    const result = await promptAndSubmitReport({ targetType: "map_spot", targetId: selectedSpot.id, label: "map spot" });
    if (!result.message) return;

    setSpotReportStatus(result.message);
    window.setTimeout(() => setSpotReportStatus(null), 4500);
  }

  function beginMapPicking() {
    if (isViewerActionLocked) {
      setSubmitFeedback({ type: "error", message: getLockedActionFeedback("create locations") });
      return;
    }

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

    if (isViewerActionLocked) {
      setSubmitFeedback({ type: "error", message: getLockedActionFeedback("create locations") });
      return;
    }

    const latitude = Number(locationForm.latitude);
    const longitude = Number(locationForm.longitude);

    if (!locationForm.name.trim()) {
      setSubmitFeedback({ type: "error", message: "Location name is required." });
      return;
    }

    if (!locationForm.shortDescription.trim()) {
      setSubmitFeedback({ type: "error", message: "A short description is required." });
      return;
    }

    if (!locationForm.fullDescription.trim()) {
      setSubmitFeedback({ type: "error", message: "A full description is required." });
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
    if (!map || !requestOpen || !isPickingRequestFromMap) return;

    const onClick = (event: MapClickEvent) => {
      const latitude = event.lngLat?.lat;
      const longitude = event.lngLat?.lng;
      if (typeof latitude !== "number" || typeof longitude !== "number") return;
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;

      setLocationRequestCoordinates(latitude, longitude);
      placeSelectionMarker(latitude, longitude);
      setIsPickingRequestFromMap(false);

      void resolveTitleFromCoordinates(latitude, longitude)
        .then((resolvedName) => {
          if (!resolvedName) return;
          setLocationRequestForm((current) => ({
            ...current,
            placeName: current.placeName.trim() ? current.placeName : resolvedName,
          }));
        })
        .catch((error) => {
          console.error("Failed to resolve request title from map click", error);
        });
    };

    map.on("click", onClick);
    return () => {
      map.off("click", onClick);
    };
  }, [isPickingRequestFromMap, requestOpen]);

  useEffect(() => {
    if (!selectedSpot) return;

    const previousBodyOverflow = document.body.style.overflow;
    const previousHtmlOverscroll = document.documentElement.style.overscrollBehavior;

    document.body.style.overflow = "hidden";
    document.documentElement.style.overscrollBehavior = "none";

    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overscrollBehavior = previousHtmlOverscroll;
    };
  }, [selectedSpot]);

  useEffect(() => {
    if (!requestOpen || isPickingRequestFromMap) return;

    const previousBodyOverflow = document.body.style.overflow;
    const previousHtmlOverscroll = document.documentElement.style.overscrollBehavior;

    document.body.style.overflow = "hidden";
    document.documentElement.style.overscrollBehavior = "none";

    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overscrollBehavior = previousHtmlOverscroll;
    };
  }, [isPickingRequestFromMap, requestOpen]);

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
        <div
          className={`${overlayStyles.spotPopupOverlay} fixed inset-0 z-[90] grid place-items-center justify-items-center overflow-hidden overscroll-none bg-black/40`}
        >
          <MapSpotPopup
            name={selectedSpot.name}
            description={selectedSpot.description}
            privacy={selectedSpot.privacy}
            spotType={selectedSpot.spotType ?? selectedSpot.terrain ?? selectedSpot.access_type ?? "Location"}
            visitors={selectedSpot.visitors ?? "Low"}
            safety={selectedSpot.safety_level ?? "Trusted"}
            mood={selectedSpot.mood ?? "Quiet"}
            checkInCount={selectedSpot.checkInCount ?? 0}
            isCheckingIn={isCheckingIn}
            isActionLocked={isViewerActionLocked}
            checkInError={checkInError}
            reportStatus={spotReportStatus}
            onCheckIn={() => void handleSpotCheckIn()}
            onReport={() => void handleSpotReport()}
            onClose={() => {
              setSelectedSpot(null);
              setSpotReportStatus(null);
            }}
          />
        </div>
      ) : null}
      
      {mapError ? (
        <div className="pointer-events-none absolute inset-0 grid place-items-center p-6 text-center text-sm text-[rgb(var(--muted))]">
          <p>{mapError}</p>
        </div>
      ) : null}

      <div className="absolute bottom-3 left-3 z-20 sm:bottom-4 sm:left-4">
        <Button
          type="button"
          onClick={openLocationRequestModal}
          aria-label={isViewerActionLocked ? "Verify with ID to request a location" : "Request a location"}
          className="h-12 rounded-full bg-[rgb(var(--brand))] px-4 text-[rgb(var(--text-inverse))] shadow-[0_14px_34px_rgb(var(--brand)/0.28)] hover:bg-[rgb(var(--brand-2))]"
        >
          <MapPin size={20} aria-hidden="true" />
          <span className="ml-2">{isViewerActionLocked ? "Verify to request" : "Request location"}</span>
        </Button>
      </div>

      {requestOpen && isPickingRequestFromMap ? (
        <div className="pointer-events-none fixed inset-0 z-40 flex items-start justify-center bg-transparent p-3 pt-[calc(0.75rem+env(safe-area-inset-top,0px))] sm:p-6">
          <div className="pointer-events-auto w-full max-w-3xl rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--card))] p-3 shadow-xl">
            <p className="m-0 text-sm text-[rgb(var(--text-strong))]">
              Click the map where this requested place should appear. Latitude and longitude will be attached for admins.
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={() => setIsPickingRequestFromMap(false)}>
                Back to request
              </Button>
              <Button type="button" variant="outline" onClick={closeLocationRequestModal}>
                Cancel
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {requestOpen && !isPickingRequestFromMap ? (
        <div
          className={`${overlayStyles.requestOverlay} fixed inset-0 z-[90] grid place-items-center justify-items-center overflow-hidden overscroll-none bg-black/45`}
        >
          <form
            className={`${overlayStyles.requestForm} w-full max-w-lg rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--card))] p-5 shadow-2xl`}
            onSubmit={(event) => void handleLocationRequestSubmit(event)}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="m-0 text-lg font-semibold text-[rgb(var(--text-strong))]">Request a new location</h3>
                <p className="mt-1 text-sm text-[rgb(var(--muted))]">
                  Send the place to admins. They will verify it, fill in marker details, and create a stay listing if it is a stay.
                </p>
              </div>
              <Button type="button" variant="outline" onClick={closeLocationRequestModal}>
                Close
              </Button>
            </div>

            <div className="mt-5 grid gap-4">
              <label className="grid gap-1">
                <span className="text-sm font-medium text-[rgb(var(--text-strong))]">Location or stay name *</span>
                <input
                  required
                  value={locationRequestForm.placeName}
                  onChange={(event) => updateLocationRequestField("placeName", event.target.value)}
                  placeholder="e.g. Sunset Cove or Bare Valley Retreat"
                  className="rounded-xl border border-[rgb(var(--border))] bg-transparent px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[rgb(var(--brand))]"
                />
              </label>

              <label className="grid gap-1">
                <span className="text-sm font-medium text-[rgb(var(--text-strong))]">Where is it? *</span>
                <textarea
                  required
                  rows={3}
                  value={locationRequestForm.locationHint}
                  onChange={(event) => updateLocationRequestField("locationHint", event.target.value)}
                  placeholder="City, country, address, coordinates, or any clue that helps admins find it."
                  className="rounded-xl border border-[rgb(var(--border))] bg-transparent px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[rgb(var(--brand))]"
                />
              </label>

              <section className="grid gap-2 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--bg-soft))/0.45] p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="m-0 text-sm font-medium text-[rgb(var(--text-strong))]">Map coordinates *</p>
                    <p className="m-0 text-xs text-[rgb(var(--muted))]">Coordinates are attached automatically from search or a map click.</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" variant="outline" onClick={() => void resolveLocationRequestCoordinatesFromText()} disabled={isResolvingLocationRequest}>
                      {isResolvingLocationRequest ? "Finding..." : "Find coordinates"}
                    </Button>
                    <Button type="button" variant="outline" onClick={beginLocationRequestMapPicking}>
                      Pick on map
                    </Button>
                  </div>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--card))/0.58] px-3 py-2 text-sm">
                    <span className="block text-xs font-medium text-[rgb(var(--muted))]">Latitude</span>
                    <strong className="text-[rgb(var(--text-strong))]">{formatCoordinate(locationRequestForm.latitude) || "Not selected"}</strong>
                  </div>
                  <div className="rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--card))/0.58] px-3 py-2 text-sm">
                    <span className="block text-xs font-medium text-[rgb(var(--muted))]">Longitude</span>
                    <strong className="text-[rgb(var(--text-strong))]">{formatCoordinate(locationRequestForm.longitude) || "Not selected"}</strong>
                  </div>
                </div>
              </section>

              <label className="grid gap-1">
                <span className="text-sm font-medium text-[rgb(var(--text-strong))]">Website or info link</span>
                <input
                  value={locationRequestForm.website}
                  onChange={(event) => updateLocationRequestField("website", event.target.value)}
                  placeholder="https://"
                  className="rounded-xl border border-[rgb(var(--border))] bg-transparent px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[rgb(var(--brand))]"
                />
              </label>

              <label className="flex items-center justify-between gap-3 rounded-xl border border-[rgb(var(--border))] p-3 text-sm text-[rgb(var(--text-strong))]">
                <span>This is a hotel, resort, camping, or other stay</span>
                <input
                  type="checkbox"
                  checked={locationRequestForm.isStay}
                  onChange={(event) => updateLocationRequestField("isStay", event.target.checked)}
                  className="h-4 w-4 accent-[rgb(var(--brand))]"
                />
              </label>

              <label className="grid gap-1">
                <span className="text-sm font-medium text-[rgb(var(--text-strong))]">Extra notes</span>
                <textarea
                  rows={3}
                  value={locationRequestForm.notes}
                  onChange={(event) => updateLocationRequestField("notes", event.target.value)}
                  placeholder="Why should this be added? Anything admins should verify?"
                  className="rounded-xl border border-[rgb(var(--border))] bg-transparent px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[rgb(var(--brand))]"
                />
              </label>
            </div>

            {locationRequestFeedback ? (
              <p
                className={`mt-4 rounded-xl px-3 py-2 text-sm ${
                  locationRequestFeedback.type === "success"
                    ? "bg-[rgb(24,132,84)/0.12] text-[rgb(24,132,84)]"
                    : "bg-[rgb(190,68,68)/0.12] text-[rgb(190,68,68)]"
                }`}
              >
                {locationRequestFeedback.message}
              </p>
            ) : null}

            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setLocationRequestForm(INITIAL_LOCATION_REQUEST_FORM)}>
                Reset
              </Button>
              <Button type="submit" disabled={isSubmittingLocationRequest || isViewerActionLocked}>
                {isSubmittingLocationRequest ? "Sending..." : isViewerActionLocked ? "Verify to send" : "Send request"}
              </Button>
            </div>
          </form>
        </div>
      ) : null}

      {open ? (
        <div
          className={`fixed inset-0 z-40 flex justify-center overflow-y-auto overscroll-contain ${
            isPickingFromMap
              ? "pointer-events-none items-start bg-transparent p-3 pt-[calc(0.75rem+env(safe-area-inset-top,0px))] sm:p-6"
              : "items-start bg-black/45 px-2 pb-[calc(0.5rem+env(safe-area-inset-bottom,0px))] pt-[calc(0.5rem+env(safe-area-inset-top,0px))] sm:items-center sm:p-6"
          }`}
        >
          {isPickingFromMap ? (
            <div className="pointer-events-auto w-full max-w-3xl rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--card))] p-3 shadow-xl">
              <p className="m-0 text-sm text-[rgb(var(--text-strong))]">
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
            <div className="my-auto flex max-h-[calc(100dvh-1rem)] w-full flex-col overflow-hidden rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--card))] shadow-2xl sm:max-h-[calc(100dvh-3rem)] sm:max-w-5xl">
            <div className="flex shrink-0 items-start justify-between gap-3 border-b border-[rgb(var(--border))] px-4 py-3 sm:gap-4 sm:px-5 sm:py-4">
              <div>
                <h3 className="m-0 text-base font-semibold text-[rgb(var(--text-strong))]">Create location</h3>
                <p className="mt-1 text-sm text-[rgb(var(--muted))]">
                  Pick the spot first, then add details so people understand access, vibe, safety, and local expectations.
                </p>
              </div>
              <Button type="button" variant="outline" onClick={closeCreateLocationModal}>
                Close
              </Button>
            </div>

            <form className="flex min-h-0 flex-1 flex-col" onSubmit={(event) => void handleLocationSubmit(event)}>
              <div className="grid min-h-0 flex-1 gap-5 overflow-y-auto px-4 py-4 sm:px-5 lg:grid-cols-2">
              <div className="grid gap-2 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--bg-soft))/0.45] p-3 text-xs text-[rgb(var(--muted))] sm:grid-cols-3 lg:col-span-2">
                <p className="m-0">
                  <strong className="text-[rgb(var(--text-strong))]">1. Pin location</strong>
                  <br />
                  Search or click on map
                </p>
                <p className="m-0">
                  <strong className="text-[rgb(var(--text-strong))]">2. Basics</strong>
                  <br />
                  Name + clear description
                </p>
                <p className="m-0">
                  <strong className="text-[rgb(var(--text-strong))]">3. Helpful details</strong>
                  <br />
                  Access, safety, amenities
                </p>
              </div>

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
                  <h4 className="m-0 text-sm font-semibold text-[rgb(var(--text-strong))]">Basics</h4>
                  <p className="mt-1 text-xs text-[rgb(var(--muted))]">
                    Keep this short and factual so people understand the place quickly.
                  </p>
                </div>
                <label className="space-y-1 md:col-span-2">
                  <span className="text-xs font-medium text-[rgb(var(--muted))]">Location name *</span>
                  <input
                    value={locationForm.name}
                    required
                    onChange={(event) => updateLocationField("name", event.target.value)}
                    placeholder="e.g. Sunset Cove Naturist Beach"
                    className="w-full rounded-lg border border-[rgb(var(--border))] bg-transparent px-3 py-2 text-sm outline-none ring-[rgb(var(--brand))] transition focus:ring-2"
                  />
                </label>
                <label className="space-y-1 md:col-span-2">
                  <span className="text-xs font-medium text-[rgb(var(--muted))]">Short description *</span>
                  <input
                    value={locationForm.shortDescription}
                    required
                    onChange={(event) => updateLocationField("shortDescription", event.target.value)}
                    placeholder="1 sentence summary for map popup"
                    className="w-full rounded-lg border border-[rgb(var(--border))] bg-transparent px-3 py-2 text-sm outline-none ring-[rgb(var(--brand))] transition focus:ring-2"
                  />
                </label>
                <label className="space-y-1 md:col-span-2">
                  <span className="text-xs font-medium text-[rgb(var(--muted))]">Full description *</span>
                  <textarea
                    value={locationForm.fullDescription}
                    required
                    onChange={(event) => updateLocationField("fullDescription", event.target.value)}
                    placeholder="Share atmosphere, etiquette, how busy it gets, and any known restrictions."
                    rows={4}
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

              <section className="grid gap-3 rounded-xl border border-[rgb(var(--border))] p-4 md:grid-cols-2 lg:col-span-2">
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

              </div>

              <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-[rgb(var(--border))] bg-[rgb(var(--bg-soft))/0.75] px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] sm:px-5 sm:pb-3">
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
                <div className="flex w-full gap-2 sm:w-auto">
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1 sm:flex-none"
                    onClick={() => {
                      setLocationForm(INITIAL_LOCATION_FORM);
                      clearLocationSearch();
                    }}
                  >
                    Reset
                  </Button>
                  <Button
                    type="submit"
                    disabled={isSubmittingLocation || isViewerActionLocked}
                    className="flex-1 bg-[rgb(var(--brand))] text-[rgb(var(--text-inverse))] sm:flex-none"
                  >
                    {isSubmittingLocation ? "Submitting..." : isViewerActionLocked ? "Verify to submit" : "Submit location"}
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

