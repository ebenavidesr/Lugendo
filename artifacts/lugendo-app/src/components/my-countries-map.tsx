import { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { useListMyCountries, useUpdateMyCountryStatus } from "@workspace/api-client-react";
import type { UserCountry } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";

// Public token, meant to be embedded client-side (this is how Mapbox GL JS is designed to work --
// security is enforced via URL restrictions configured in the Mapbox account, not by hiding it).
const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN as string | undefined;

// Simplified (110m) Natural Earth country borders, packaged as a static asset -- no paid
// Mapbox Boundaries tileset, no external calls. Properties: { code: ISO-2, name }.
const BORDERS_URL = "/data/country-borders-110m.geojson";

const VISITADO_COLOR = "#C4793A"; // Terracota
const OBJETIVO_COLOR = "#3D2F6B"; // Índigo
const UNSET_COLOR = "rgba(0,0,0,0)";

function buildFillColorExpr(countries: UserCountry[]) {
  // A "match" expression needs at least one label/output pair before the fallback --
  // with zero classified countries (e.g. on first load, before /me/countries resolves)
  // an empty match is invalid and map.addLayer/setPaintProperty throws, which silently
  // kills the whole fill layer (no country ever renders, not even uncolored borders).
  if (countries.length === 0) return UNSET_COLOR;
  const stops: string[] = [];
  for (const c of countries) {
    stops.push(c.countryCode, c.status === "visitado" ? VISITADO_COLOR : OBJETIVO_COLOR);
  }
  return ["match", ["get", "code"], ...stops, UNSET_COLOR];
}

export function MyCountriesMap() {
  const { data: countries } = useListMyCountries();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const popupRef = useRef<mapboxgl.Popup | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const updateStatus = useUpdateMyCountryStatus();
  const qc = useQueryClient();

  // Read via a ref inside the click handler so the map-init effect (which only runs once)
  // always sees the latest classified countries without needing to be re-run.
  const countriesRef = useRef(countries);
  useEffect(() => { countriesRef.current = countries; }, [countries]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current || !MAPBOX_TOKEN) return;

    mapboxgl.accessToken = MAPBOX_TOKEN;
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: "mapbox://styles/mapbox/light-v11",
      center: [10, 25],
      zoom: 1.1,
    });
    mapRef.current = map;
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-right");

    const resizeObserver = new ResizeObserver(() => map.resize());
    resizeObserver.observe(containerRef.current);

    map.on("load", () => {
      void fetch(BORDERS_URL)
        .then(res => res.json())
        .then((geojson) => {
          if (!mapRef.current) return; // unmounted while the fetch was in flight

          map.addSource("countries", { type: "geojson", data: geojson });
          map.addLayer({
            id: "countries-fill",
            type: "fill",
            source: "countries",
            paint: {
              "fill-color": buildFillColorExpr(countriesRef.current ?? []) as unknown as mapboxgl.DataDrivenPropertyValueSpecification<string>,
              "fill-opacity": 0.6,
              "fill-outline-color": "#7A5C3A",
            },
          });

          map.on("click", "countries-fill", (e) => {
            const feature = e.features?.[0];
            if (!feature) return;
            const code = feature.properties?.code as string | undefined;
            const name = feature.properties?.name as string | undefined;
            if (!code || !name) return;
            const current = countriesRef.current?.find(c => c.countryCode === code);

            popupRef.current?.remove();

            const el = document.createElement("div");
            el.style.cssText = "font-size:13px; min-width:150px;";
            const title = document.createElement("p");
            title.style.cssText = "font-weight:600; margin:0 0 4px; color:#2D1F0E;";
            title.textContent = name;
            el.appendChild(title);

            const statusLabel = document.createElement("p");
            statusLabel.style.cssText = "margin:0 0 8px; color:#7A5C3A;";
            statusLabel.textContent = current
              ? (current.status === "visitado" ? "Visitado" : "Quiero visitarlo")
              : "Sin clasificar";
            el.appendChild(statusLabel);

            if (current?.status === "objetivo") {
              const btn = document.createElement("button");
              btn.textContent = "Marcar como visitado";
              btn.style.cssText = "background:#C4793A;color:#fff;border:none;border-radius:6px;padding:4px 8px;font-size:12px;cursor:pointer;";
              btn.onclick = () => {
                updateStatus.mutate({ countryCode: code, data: { status: "visitado" } }, {
                  onSuccess: () => {
                    qc.invalidateQueries({ queryKey: ["/api/me/countries"] });
                    qc.invalidateQueries({ queryKey: ["/api/me/profile"] });
                  },
                });
                popupRef.current?.remove();
              };
              el.appendChild(btn);
            }

            popupRef.current = new mapboxgl.Popup({ closeButton: true, offset: 8 })
              .setLngLat(e.lngLat)
              .setDOMContent(el)
              .addTo(map);
          });

          map.on("mouseenter", "countries-fill", () => { map.getCanvas().style.cursor = "pointer"; });
          map.on("mouseleave", "countries-fill", () => { map.getCanvas().style.cursor = ""; });

          setMapReady(true);
        });
    });

    return () => {
      resizeObserver.disconnect();
      popupRef.current?.remove();
      map.remove();
      mapRef.current = null;
      setMapReady(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- map initializes once; live data flows in via countriesRef and the effect below
  }, []);

  // Keep the fill colors in sync as the traveler adds/removes/moves countries.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !map.getLayer("countries-fill")) return;
    map.setPaintProperty("countries-fill", "fill-color", buildFillColorExpr(countries ?? []) as unknown as mapboxgl.DataDrivenPropertyValueSpecification<string>);
  }, [countries, mapReady]);

  if (!MAPBOX_TOKEN) {
    return (
      <div className="bg-card border border-border rounded-[14px] p-8 text-center">
        <AlertTriangle className="w-8 h-8 mx-auto mb-3" style={{ color: "var(--terra)" }} />
        <p className="text-sm text-muted-foreground">Falta configurar el mapa. Inténtalo más tarde.</p>
      </div>
    );
  }

  return (
    <div className="relative w-full h-[420px] rounded-[14px] overflow-hidden border border-border">
      <div
        ref={containerRef}
        className="w-full h-full"
        style={{ opacity: mapReady ? 1 : 0, transition: "opacity 0.2s" }}
      />
      {!mapReady && <div className="absolute inset-0 bg-card animate-pulse pointer-events-none" />}
    </div>
  );
}
