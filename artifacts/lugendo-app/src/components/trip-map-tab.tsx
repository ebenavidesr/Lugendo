import { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { useGetMyTripMap } from "@workspace/api-client-react";
import { Map as MapIcon, AlertTriangle } from "lucide-react";

// Public token, meant to be embedded client-side (this is how Mapbox GL JS is designed to work --
// security is enforced via URL restrictions configured in the Mapbox account, not by hiding it).
const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN as string | undefined;

interface TripMapTabProps {
  tripId: number;
  onNavigateToDay?: (dayNumber: number) => void;
}

interface Waypoint {
  city: string;
  country: string | null;
  lat: number;
  lng: number;
  dayNumbers: number[];
}

interface RouteLineString {
  type: "LineString";
  coordinates: [number, number][];
}

// Real road routing between consecutive waypoints via the Directions API, falling back to a
// straight line if no drivable route exists (e.g. waypoints separated by water/different
// islands) so a routing failure never breaks the map -- it just draws a plainer line.
async function fetchRouteGeometry(waypoints: Waypoint[]): Promise<RouteLineString> {
  const straightLine: RouteLineString = {
    type: "LineString",
    coordinates: waypoints.map(w => [w.lng, w.lat]),
  };
  if (!MAPBOX_TOKEN || waypoints.length < 2) return straightLine;

  const coords = waypoints.map(w => `${w.lng},${w.lat}`).join(";");
  const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${coords}?geometries=geojson&overview=full&access_token=${MAPBOX_TOKEN}`;

  try {
    const response = await fetch(url);
    if (!response.ok) return straightLine;
    const json = await response.json() as { routes?: { geometry?: RouteLineString }[] };
    const geometry = json.routes?.[0]?.geometry;
    return geometry?.type === "LineString" ? geometry : straightLine;
  } catch {
    return straightLine;
  }
}

export function TripMapTab({ tripId, onNavigateToDay }: TripMapTabProps) {
  const { data, isLoading } = useGetMyTripMap(tripId);
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<mapboxgl.Marker[]>([]);
  const [mapReady, setMapReady] = useState(false);

  const waypoints = (data?.waypoints ?? []) as Waypoint[];

  // onNavigateToDay is a fresh closure on every render of the parent (traveler-trip.tsx doesn't
  // memoize it), so it can't be a dependency of the map-setup effect below without tearing the
  // map down and rebuilding it (re-fetching the route, etc.) on every unrelated parent re-render.
  // Route it through a ref instead -- the click handler reads the latest value without the effect
  // needing to depend on it.
  const onNavigateToDayRef = useRef(onNavigateToDay);
  useEffect(() => { onNavigateToDayRef.current = onNavigateToDay; }, [onNavigateToDay]);

  // Map only ever initializes once this component is mounted, which only happens while the
  // traveler is actually on the Mapa tab (see traveler-trip.tsx's activeTab conditional) -- no
  // extra guard needed here to avoid spending map loads on tabs the traveler never opens.
  useEffect(() => {
    if (!containerRef.current || mapRef.current || waypoints.length === 0 || !MAPBOX_TOKEN) return;

    mapboxgl.accessToken = MAPBOX_TOKEN;
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: "mapbox://styles/mapbox/light-v11",
      center: [waypoints[0].lng, waypoints[0].lat],
      zoom: 5,
    });
    mapRef.current = map;
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-right");

    map.on("load", () => {
      setMapReady(true);

      markersRef.current.forEach(m => m.remove());
      markersRef.current = waypoints.map((wp, idx) => {
        const el = document.createElement("button");
        el.type = "button";
        el.setAttribute("aria-label", `Ir al día ${wp.dayNumbers[0]}: ${wp.city}`);
        el.textContent = String(idx + 1);
        el.style.cssText = [
          "width:28px", "height:28px", "border-radius:9999px",
          "background:var(--indigo)", "color:var(--arena)",
          "display:flex", "align-items:center", "justify-content:center",
          "font-size:12px", "font-weight:600", "font-family:var(--font-sans, sans-serif)",
          "cursor:pointer", "border:2px solid #fff", "box-shadow:0 1px 4px rgba(0,0,0,0.35)",
        ].join(";");
        el.addEventListener("click", () => onNavigateToDayRef.current?.(wp.dayNumbers[0]));

        return new mapboxgl.Marker({ element: el })
          .setLngLat([wp.lng, wp.lat])
          .setPopup(new mapboxgl.Popup({ offset: 18, closeButton: false }).setText(
            `${idx + 1}. ${wp.city}${wp.country ? `, ${wp.country}` : ""}`
          ))
          .addTo(map);
      });

      if (waypoints.length > 1) {
        const bounds = new mapboxgl.LngLatBounds();
        waypoints.forEach(wp => bounds.extend([wp.lng, wp.lat]));
        map.fitBounds(bounds, { padding: 56, maxZoom: 11 });

        void fetchRouteGeometry(waypoints).then(geometry => {
          if (!mapRef.current) return; // unmounted while the fetch was in flight
          map.addSource("trip-route", { type: "geojson", data: { type: "Feature", properties: {}, geometry } });
          map.addLayer({
            id: "trip-route-line",
            type: "line",
            source: "trip-route",
            layout: { "line-join": "round", "line-cap": "round" },
            paint: { "line-color": "#C4793A", "line-width": 3 },
          });
        });
      }
    });

    return () => {
      markersRef.current.forEach(m => m.remove());
      markersRef.current = [];
      map.remove();
      mapRef.current = null;
      setMapReady(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onNavigateToDay is read via a ref (see above), deliberately excluded
  }, [waypoints]);

  if (isLoading) {
    return <div className="h-[420px] bg-card border border-border rounded-[14px] animate-pulse" />;
  }

  if (!MAPBOX_TOKEN) {
    return (
      <div className="bg-card border border-border rounded-[14px] p-8 text-center">
        <AlertTriangle className="w-8 h-8 mx-auto mb-3" style={{ color: "var(--terra)" }} />
        <p className="text-sm text-muted-foreground">Falta configurar el mapa. Inténtalo más tarde.</p>
      </div>
    );
  }

  if (waypoints.length === 0) {
    return (
      <div className="bg-card border border-border rounded-[14px] p-8 text-center">
        <MapIcon className="w-8 h-8 mx-auto mb-3" style={{ color: "var(--terra)" }} />
        <p className="text-sm font-medium mb-1" style={{ color: "var(--noche)" }}>Sin datos suficientes</p>
        <p className="text-sm text-muted-foreground">
          Todavía no hay ciudades con ubicación conocida en este itinerario.
        </p>
      </div>
    );
  }

  return (
    <div className="relative w-full h-[420px] rounded-[14px] overflow-hidden border border-border">
      <div
        ref={containerRef}
        className="absolute inset-0"
        style={{ opacity: mapReady ? 1 : 0, transition: "opacity 0.2s" }}
      />
      {!mapReady && <div className="absolute inset-0 bg-card animate-pulse pointer-events-none" />}
    </div>
  );
}
