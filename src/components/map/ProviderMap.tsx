import { useEffect, useMemo, useRef, useState, useCallback, type RefObject } from "react";
import {
  MapContainer, TileLayer, Marker, Popup, Tooltip,
  Circle, useMap, ZoomControl, ScaleControl,
} from "react-leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import "leaflet.markercluster";
import L from "leaflet";
import { renderToStaticMarkup } from "react-dom/server";
import {
  Palette, Wrench, Hammer, Code2, Megaphone, Zap, Sparkles,
  Calculator, Scale, Camera, UtensilsCrossed, Leaf, Car,
  Star, Clock, MapPin, ArrowRight, CheckCircle2, Plus, Minus,
  LocateFixed, Maximize2, Minimize2, SearchX, Layers, Navigation,
} from "lucide-react";
import "./ProviderMap.css";

// ============================================================
// Category metadata
// ============================================================
type CategoryMeta = {
  icon: typeof Palette;
  color: string;
  colorDark: string;
  bg: string;
};

const CATEGORY_META: Record<string, CategoryMeta> = {
  "Diseño Gráfico":   { icon: Palette,           color: "#1A3C6E", colorDark: "#1A3C6E", bg: "#F8F9FA" },
  "Plomería":         { icon: Wrench,            color: "#1A3C6E", colorDark: "#1A3C6E", bg: "#F8F9FA" },
  "Carpintería":      { icon: Hammer,            color: "#1A3C6E", colorDark: "#1A3C6E", bg: "#F8F9FA" },
  "Desarrollo Web":   { icon: Code2,             color: "#1A3C6E", colorDark: "#1A3C6E", bg: "#F8F9FA" },
  "Marketing":        { icon: Megaphone,         color: "#1A3C6E", colorDark: "#1A3C6E", bg: "#F8F9FA" },
  "Electricidad":     { icon: Zap,               color: "#1A3C6E", colorDark: "#1A3C6E", bg: "#F8F9FA" },
  "Limpieza":         { icon: Sparkles,          color: "#1A3C6E", colorDark: "#1A3C6E", bg: "#F8F9FA" },
  "Contabilidad":     { icon: Calculator,        color: "#1A3C6E", colorDark: "#1A3C6E", bg: "#F8F9FA" },
  "Abogado":          { icon: Scale,             color: "#333333", colorDark: "#1A3C6E", bg: "#F8F9FA" },
  "Fotografía":       { icon: Camera,            color: "#1A3C6E", colorDark: "#1A3C6E", bg: "#F8F9FA" },
  "Catering":         { icon: UtensilsCrossed,   color: "#1A3C6E", colorDark: "#1A3C6E", bg: "#F8F9FA" },
  "Jardinería":       { icon: Leaf,              color: "#1A3C6E", colorDark: "#1A3C6E", bg: "#F8F9FA" },
  "Mecánica":         { icon: Car,               color: "#1A3C6E", colorDark: "#1A3C6E", bg: "#F8F9FA" },
};

const DEFAULT_CATEGORY_META: CategoryMeta = {
  icon: Sparkles, color: "#1A3C6E", colorDark: "#1A3C6E", bg: "#F8F9FA",
};

function getCategoryMeta(category: string): CategoryMeta {
  return CATEGORY_META[category] || DEFAULT_CATEGORY_META;
}

// ============================================================
// Types
// ============================================================
export interface MapProvider {
  id: string;
  displayName: string;
  category: string;
  city: string;
  lat: number;
  lng: number;
  score?: number;
  availability?: string;
  responseTimeHrs?: number;
  verified?: boolean;
  photos?: string[];
  reviews?: Array<{ rating: number }>;
}

interface ProviderMapProps {
  providers: MapProvider[];
  focusCity: string | null;
  hoveredId?: string | null;
  selectedId?: string | null;
  onSelectProvider?: (id: string | null) => void;
  onHoverProvider?: (id: string | null) => void;
}

// ============================================================
// Constants
// ============================================================
const NICARAGUA_CENTER: [number, number] = [12.8654, -85.2072];

const CITY_COORDS: Record<string, [number, number]> = {
  "Managua": [12.1328, -86.2504],
  "Estelí": [13.0886, -86.3538],
  "León": [12.4346, -86.8796],
  "Nagarote": [12.2659, -86.5647],
  "Masaya": [11.9744, -86.0944],
  "Granada": [11.9344, -85.9560],
  "San Juan de Oriente": [11.9065, -86.0741],
  "Juigalpa": [12.1063, -85.3645],
  "Matagalpa": [12.9256, -85.9175],
  "Bluefields": [12.0130, -83.7628],
};

const NICARAGUA_BOUNDS: L.LatLngBoundsExpression = [
  [10.5, -88.0],
  [15.5, -82.0],
];

// ============================================================
// Custom Marker Icon Builder
// ============================================================
function buildProviderIcon(
  provider: MapProvider,
  state: "default" | "hovered" | "selected"
): L.DivIcon {
  const meta = getCategoryMeta(provider.category);
  const Icon = meta.icon;
  const iconHtml = renderToStaticMarkup(
    <Icon size={22} color={meta.color} strokeWidth={2.4} />
  );
  const availabilityClass = (provider.availability || "DISPONIBLE").toUpperCase();

  const html = `
    <div class="marker-pin" style="--marker-color:${meta.color};--marker-bg:${meta.bg};">
      <div class="marker-icon">${iconHtml}</div>
      <div class="marker-score">${provider.score ?? "—"}</div>
      <div class="marker-availability ${availabilityClass}"></div>
    </div>
  `;

  return L.divIcon({
    className: `provider-marker ${state}`,
    html,
    iconSize: [44, 52],
    iconAnchor: [22, 50],
    popupAnchor: [0, -52],
    tooltipAnchor: [0, -44],
  });
}

// User location icon (blue dot with pulse)
function buildUserLocationIcon(): L.DivIcon {
  return L.divIcon({
    className: "user-location-marker",
    html: `<div class="user-location-pin"><div class="user-location-pulse"></div><div class="user-location-dot"></div></div>`,
    iconSize: [20, 20],
    iconAnchor: [10, 10],
  });
}

// ============================================================
// Rich Popup
// ============================================================
function RichPopup({ provider }: { provider: MapProvider }) {
  const meta = getCategoryMeta(provider.category);
  const reviews = provider.reviews || [];
  const avgRating = reviews.length > 0
    ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length
    : null;
  const photo = provider.photos && provider.photos.length > 0 ? provider.photos[0] : null;

  return (
    <div
      className="popup-card"
      style={{
        ["--marker-color" as any]: meta.color,
        ["--marker-color-dark" as any]: meta.colorDark,
        ["--marker-shadow" as any]: `${meta.color}55`,
      }}
    >
      <div className="popup-photo">
        {photo ? (
          <img src={photo} alt={provider.displayName} loading="lazy" />
        ) : (
          <div className="popup-photo-fallback">
            <meta.icon size={48} color="rgba(255,255,255,0.6)" strokeWidth={1.5} />
          </div>
        )}
        <div className="popup-category-chip">{provider.category}</div>
        {provider.verified && (
          <div className="popup-verified-badge" title="Verificado">
            <CheckCircle2 />
          </div>
        )}
      </div>
      <div className="popup-body">
        <div className="popup-title">{provider.displayName}</div>
        <div className="popup-meta-row">
          <MapPin />
          <span>{provider.city}</span>
          {avgRating !== null && (
            <>
              <span style={{ opacity: 0.4 }}>·</span>
              <div className="popup-rating">
                <Star style={{ fill: "#1A3C6E", stroke: "#1A3C6E" }} />
                <span style={{ color: "#1A3C6E" }}>{avgRating.toFixed(1)}</span>
                <span style={{ color: "rgba(51, 51, 51, 0.72)", fontWeight: 600 }}>({reviews.length})</span>
              </div>
            </>
          )}
        </div>
        <div className="popup-stats">
          <div className="popup-stat">
            <div className="popup-stat-value">{provider.score ?? "—"}</div>
            <div className="popup-stat-label">Trust</div>
          </div>
          <div className="popup-stat">
            <div className="popup-stat-value">
              {provider.responseTimeHrs != null ? `${provider.responseTimeHrs}h` : "—"}
            </div>
            <div className="popup-stat-label">Respuesta</div>
          </div>
          <div className="popup-stat">
            <div className="popup-stat-value" style={{ color: meta.color, fontSize: 11 }}>
              {provider.score && provider.score >= 80 ? "Sólido" : "Activo"}
            </div>
            <div className="popup-stat-label">Perfil</div>
          </div>
        </div>
        <a
          href={`/proveedor/${provider.id}`}
          className="popup-cta"
          style={{ background: meta.color, boxShadow: `0 4px 10px -2px ${meta.color}59` }}
        >
          Ver perfil completo <ArrowRight />
        </a>
      </div>
    </div>
  );
}

// ============================================================
// Map behavior hooks
// ============================================================

/**
 * CRITICAL FIX: Call map.invalidateSize() on mount and whenever the
 * container resizes. This is the fix for the "invisible markers" bug —
 * Leaflet initializes panes at 0×0 if the container isn't sized yet,
 * and never updates unless invalidateSize() is called.
 */
function MapSizeFixer({ containerRef }: { containerRef: RefObject<HTMLElement | null> }) {
  const map = useMap();
  const didInit = useRef(false);

  useEffect(() => {
    // Call invalidateSize shortly after mount to let the flex layout settle.
    const t1 = setTimeout(() => map.invalidateSize(), 100);
    const t2 = setTimeout(() => map.invalidateSize(), 500);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [map]);

  // Watch container resize via ResizeObserver and invalidateSize accordingly.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      map.invalidateSize();
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [map, containerRef]);

  return null;
}

/** Smoothly fly to the focused city. */
function CityFocuser({ focusCity }: { focusCity: string | null }) {
  const map = useMap();
  useEffect(() => {
    if (focusCity && CITY_COORDS[focusCity]) {
      map.flyTo(CITY_COORDS[focusCity], 12, { duration: 1.2, easeLinearity: 0.25 });
    }
  }, [focusCity, map]);
  return null;
}

/** Fly to a specific provider when selected (clicked). */
function SelectionFocuser({
  selectedId,
  providers,
}: {
  selectedId: string | null;
  providers: MapProvider[];
}) {
  const map = useMap();
  const lastSelected = useRef<string | null>(null);

  useEffect(() => {
    if (!selectedId || selectedId === lastSelected.current) return;
    const provider = providers.find(p => p.id === selectedId);
    if (!provider) return;
    map.flyTo([provider.lat, provider.lng], Math.max(map.getZoom(), 13), {
      duration: 0.8,
      easeLinearity: 0.25,
    });
    lastSelected.current = selectedId;
  }, [selectedId, providers, map]);

  useEffect(() => {
    if (!selectedId) lastSelected.current = null;
  }, [selectedId]);

  return null;
}

/** One-shot: fit bounds to all providers on first load. */
function FitAllOnMount({ providers }: { providers: MapProvider[] }) {
  const map = useMap();
  const didFit = useRef(false);

  useEffect(() => {
    if (didFit.current || providers.length === 0) return;
    // Wait for invalidateSize to run first (in MapSizeFixer).
    const timer = setTimeout(() => {
      if (providers.length === 1) {
        map.setView([providers[0].lat, providers[0].lng], 12, { animate: false });
        didFit.current = true;
        return;
      }
      const bounds = L.latLngBounds(providers.map(p => [p.lat, p.lng] as [number, number]));
      map.fitBounds(bounds, { padding: [80, 80], maxZoom: 11 });
      didFit.current = true;
    }, 300);
    return () => clearTimeout(timer);
  }, [providers, map]);

  return null;
}

// ============================================================
// Map Controls
// ============================================================
function MapControls({
  map,
  providers,
  focusCity,
  isFullscreen,
  onToggleFullscreen,
  onLocateMe,
}: {
  map: L.Map | null;
  providers: MapProvider[];
  focusCity: string | null;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
  onLocateMe: () => void;
}) {
  if (!map) return null;

  const fitAll = () => {
    if (providers.length === 0) {
      map.flyTo(NICARAGUA_CENTER, 7, { duration: 1.0 });
      return;
    }
    if (providers.length === 1) {
      map.flyTo([providers[0].lat, providers[0].lng], 12, { duration: 1.0 });
      return;
    }
    const bounds = L.latLngBounds(providers.map(p => [p.lat, p.lng] as [number, number]));
    map.flyToBounds(bounds, { padding: [80, 80], maxZoom: 11, duration: 1.0 });
  };

  const recenter = () => {
    if (focusCity && CITY_COORDS[focusCity]) {
      map.flyTo(CITY_COORDS[focusCity], 12, { duration: 1.0 });
    } else {
      map.flyTo(NICARAGUA_CENTER, 7, { duration: 1.0 });
    }
  };

  return (
    <div className="map-controls" role="group" aria-label="Controles del mapa">
      <button className="map-control-btn" onClick={() => map.zoomIn()} title="Acercar" aria-label="Acercar">
        <Plus />
      </button>
      <button className="map-control-btn" onClick={() => map.zoomOut()} title="Alejar" aria-label="Alejar">
        <Minus />
      </button>
      <div className="map-controls-divider" />
      <button className="map-control-btn" onClick={recenter} title="Centrar en ciudad" aria-label="Centrar en ciudad">
        <Navigation />
      </button>
      <button className="map-control-btn" onClick={fitAll} title="Ver todos" aria-label="Ver todos los proveedores">
        <Maximize2 />
      </button>
      <button className="map-control-btn" onClick={onLocateMe} title="Mi ubicación" aria-label="Mi ubicación">
        <LocateFixed />
      </button>
      <button
        className="map-control-btn"
        onClick={onToggleFullscreen}
        title={isFullscreen ? "Salir de pantalla completa" : "Pantalla completa"}
        aria-label={isFullscreen ? "Salir de pantalla completa" : "Pantalla completa"}
      >
        {isFullscreen ? <Minimize2 /> : <Maximize2 />}
      </button>
    </div>
  );
}

// ============================================================
// Legend
// ============================================================
function MapLegend({ providers }: { providers: MapProvider[] }) {
  const presentCategories = useMemo(() => {
    const set = new Set<string>();
    providers.forEach(p => set.add(p.category));
    return Array.from(set);
  }, [providers]);

  if (presentCategories.length === 0) return null;

  return (
    <div className="map-legend">
      <div className="map-legend-title">Categorías</div>
      <div className="map-legend-items">
        {presentCategories.map(cat => {
          const meta = getCategoryMeta(cat);
          const Icon = meta.icon;
          return (
            <div className="map-legend-item" key={cat}>
              <span className="map-legend-swatch" style={{ background: meta.bg, color: meta.color }}>
                <Icon size={9} color={meta.color} strokeWidth={3} style={{ display: "inline-block", verticalAlign: "middle" }} />
              </span>
              <span>{cat}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================
// Results Pill (top-left count badge)
// ============================================================
function MapResultsPill({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <div className="map-results-pill">
      <span className="results-count">{count}</span>
      <span>{count === 1 ? "proveedor" : "proveedores"}</span>
    </div>
  );
}

// ============================================================
// Empty State
// ============================================================
function MapEmptyState() {
  return (
    <div className="map-empty-state">
      <div className="map-empty-state-icon">
        <SearchX />
      </div>
      <div className="map-empty-state-title">Sin resultados en el mapa</div>
      <div className="map-empty-state-text">
        Ajusta los filtros de búsqueda para ver proveedores cercanos.
      </div>
    </div>
  );
}

// ============================================================
// Main Component
// ============================================================
export default function ProviderMap({
  providers,
  focusCity,
  hoveredId,
  selectedId,
  onSelectProvider,
  onHoverProvider,
}: ProviderMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [mapInstance, setMapInstance] = useState<L.Map | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [showRadius, setShowRadius] = useState(false);
  const [mapReady, setMapReady] = useState(false);

  // Pre-build icons per provider per state
  const iconsByProvider = useMemo(() => {
    const map = new Map<string, { default: L.DivIcon; hovered: L.DivIcon; selected: L.DivIcon }>();
    providers.forEach(p => {
      map.set(p.id, {
        default: buildProviderIcon(p, "default"),
        hovered: buildProviderIcon(p, "hovered"),
        selected: buildProviderIcon(p, "selected"),
      });
    });
    return map;
  }, [providers]);

  const userLocationIcon = useMemo(() => buildUserLocationIcon(), []);

  // Geolocation handler
  const handleLocateMe = useCallback(() => {
    if (!navigator.geolocation || !mapInstance) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        setUserLocation({ lat: latitude, lng: longitude });
        setShowRadius(true);
        mapInstance.flyTo([latitude, longitude], 14, { duration: 1.2 });
      },
      (err) => {
        console.warn("Geolocation error:", err.message);
        // Fallback: center on Managua
        setUserLocation({ lat: NICARAGUA_CENTER[0], lng: NICARAGUA_CENTER[1] });
        setShowRadius(true);
        mapInstance.flyTo(NICARAGUA_CENTER, 12, { duration: 1.0 });
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  }, [mapInstance]);

  // Fullscreen toggle
  const handleToggleFullscreen = useCallback(() => {
    setIsFullscreen(prev => !prev);
  }, []);

  // After fullscreen changes, invalidateSize so the map refits
  useEffect(() => {
    if (mapInstance) {
      const t = setTimeout(() => mapInstance.invalidateSize(), 200);
      return () => clearTimeout(t);
    }
  }, [isFullscreen, mapInstance]);

  // Mark map as ready once we have the instance (tiles will start loading)
  useEffect(() => {
    if (mapInstance) {
      const t = setTimeout(() => setMapReady(true), 1500);
      return () => clearTimeout(t);
    }
  }, [mapInstance]);

  return (
    <div
      ref={containerRef}
      className={`provider-map-container w-full h-full relative z-0 bg-[#F8F9FA] ${isFullscreen ? "fullscreen" : ""}`}
    >
      {/* Loading skeleton */}
      <div className={`map-loading-skeleton ${mapReady ? "hidden" : ""}`}>
        <div className="map-loading-content">
          <div className="map-loading-spinner"></div>
          <div className="map-loading-text">Cargando mapa…</div>
        </div>
      </div>

      <MapContainer
        center={NICARAGUA_CENTER}
        zoom={7}
        minZoom={6}
        maxBounds={NICARAGUA_BOUNDS}
        maxBoundsViscosity={1.0}
        className="w-full h-full outline-none z-0"
        zoomControl={false}
        attributionControl={true}
        ref={setMapInstance}
        whenReady={() => {
          // Slight delay to ensure container has final dimensions
          setTimeout(() => mapInstance?.invalidateSize(), 50);
        }}
      >
        <TileLayer
          attribution='&copy; <a href="https://osm.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          maxZoom={19}
          noWrap={true}
        />

        {/* Scale control (Google Maps style, bottom-left) */}
        <ScaleControl position="bottomleft" imperial={false} metric={true} />

        {/* Search radius circle around user location */}
        {userLocation && showRadius && (
          <Circle
            center={[userLocation.lat, userLocation.lng]}
            radius={2000}
            pathOptions={{
              color: "#1A3C6E",
              weight: 2,
              opacity: 0.5,
              fillColor: "#1A3C6E",
              fillOpacity: 0.08,
              dashArray: "6, 6",
            }}
            className="search-radius-circle"
          />
        )}

        {/* User location marker */}
        {userLocation && (
          <Marker
            position={[userLocation.lat, userLocation.lng]}
            icon={userLocationIcon}
            zIndexOffset={2000}
          >
            <Tooltip direction="top" offset={[0, -10]} opacity={1}>
              Estás aquí
            </Tooltip>
          </Marker>
        )}

        {/* Provider markers with tooltips and popups */}
        {providers.map(p => {
          const icons = iconsByProvider.get(p.id);
          if (!icons) return null;
          const isHovered = hoveredId === p.id;
          const isSelected = selectedId === p.id;
          const icon = isSelected
            ? icons.selected
            : isHovered
            ? icons.hovered
            : icons.default;

          return (
            <Marker
              key={p.id}
              position={[p.lat, p.lng]}
              icon={icon}
              zIndexOffset={isSelected ? 1000 : isHovered ? 500 : 0}
              eventHandlers={{
                click: () => {
                  onSelectProvider?.(isSelected ? null : p.id);
                },
                mouseover: () => {
                  onHoverProvider?.(p.id);
                },
                mouseout: () => {
                  onHoverProvider?.(null);
                },
              }}
            >
              <Tooltip
                className="provider-tooltip"
                direction="top"
                offset={[0, -44]}
                opacity={1}
              >
                <span className="provider-tooltip-name">{p.displayName}</span>
                <span className="provider-tooltip-meta">{p.category} · {p.city}</span>
              </Tooltip>
              <Popup className="rich-popup" closeButton={false} autoPanPadding={[60, 60]} maxWidth={300}>
                <RichPopup provider={p} />
              </Popup>
            </Marker>
          );
        })}

        {/* Behavior hooks */}
        <MapSizeFixer containerRef={containerRef} />
        <CityFocuser focusCity={focusCity} />
        <SelectionFocuser selectedId={selectedId} providers={providers} />
        <FitAllOnMount providers={providers} />
      </MapContainer>

      {/* Overlays */}
      <MapResultsPill count={providers.length} />
      <MapControls
        map={mapInstance}
        providers={providers}
        focusCity={focusCity}
        isFullscreen={isFullscreen}
        onToggleFullscreen={handleToggleFullscreen}
        onLocateMe={handleLocateMe}
      />
      <MapLegend providers={providers} />

      {providers.length === 0 && <MapEmptyState />}
    </div>
  );
}
