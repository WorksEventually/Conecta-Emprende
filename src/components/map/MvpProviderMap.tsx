import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { MapContainer, Marker, TileLayer, Tooltip, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import {
  ArrowRight,
  BadgeCheck,
  LoaderCircle,
  MapPin,
  MessageCircle,
  ShieldCheck,
  X,
} from "lucide-react";
import "leaflet/dist/leaflet.css";
import { isPubliclyListable, isSanctionedStatus } from "../../lib/identity";

export interface SearchMapProvider {
  id: string;
  publicName: string;
  category: string;
  city: string;
  lat: number;
  lng: number;
  trustScore: number | null;
  availabilityLabel: string;
  status?: string;
  statusReason?: string | null;
  suspendedUntil?: string | null;
  priceLabel: string;
  verificationLabel: string;
  profileSignalLabel: string;
  description: string;
  image: string;
  isOwnProfile?: boolean;
}

const NICARAGUA_CENTER: [number, number] = [12.8654, -85.2072];
const NICARAGUA_BOUNDS: [[number, number], [number, number]] = [
  [10.5, -87.8],
  [15.2, -82.5],
];

const CITY_COORDS: Record<string, [number, number]> = {
  "Estelí": [13.0919, -86.3538],
  "León": [12.4346, -86.8796],
  Nagarote: [12.2659, -86.5647],
  Managua: [12.1328, -86.2504],
  Masaya: [11.9744, -86.0944],
  Granada: [11.9344, -85.956],
  "San Juan de Oriente": [11.9065, -86.0741],
  Juigalpa: [12.1063, -85.3645],
  Matagalpa: [12.9256, -85.9175],
  Bluefields: [12.0137, -83.7635],
};

function isInsideNicaragua(provider: SearchMapProvider) {
  return (
    Number.isFinite(provider.lat) &&
    Number.isFinite(provider.lng) &&
    provider.lat >= NICARAGUA_BOUNDS[0][0] &&
    provider.lat <= NICARAGUA_BOUNDS[1][0] &&
    provider.lng >= NICARAGUA_BOUNDS[0][1] &&
    provider.lng <= NICARAGUA_BOUNDS[1][1]
  );
}

function MapController({
  providers,
  focusCity,
  selectedProvider,
}: {
  providers: SearchMapProvider[];
  focusCity: string | null;
  selectedProvider: SearchMapProvider | null;
}) {
  const map = useMap();

  useEffect(() => {
    const timer = window.setTimeout(() => {
      map.invalidateSize(false);

      if (selectedProvider) {
        map.flyTo([selectedProvider.lat, selectedProvider.lng], Math.max(map.getZoom(), 13), { duration: 0.45 });
        return;
      }

      if (focusCity && CITY_COORDS[focusCity]) {
        map.setView(CITY_COORDS[focusCity], 11, { animate: false });
        return;
      }

      if (providers.length === 1) {
        map.setView([providers[0].lat, providers[0].lng], 11, { animate: false });
        return;
      }

      if (providers.length > 1) {
        map.fitBounds(
          L.latLngBounds(providers.map(provider => [provider.lat, provider.lng] as [number, number])),
          { padding: [42, 42], maxZoom: 9, animate: false },
        );
        return;
      }

      map.setView(NICARAGUA_CENTER, 7, { animate: false });
    }, 100);

    return () => window.clearTimeout(timer);
  }, [map, providers, focusCity, selectedProvider]);

  return null;
}

function MapClickDismiss({ onDismiss }: { onDismiss: () => void }) {
  useMapEvents({
    click: event => {
      const target = event.originalEvent?.target as Element | null;
      if (!target?.closest?.(".leaflet-marker-icon")) onDismiss();
    },
  });

  return null;
}

function ProviderMarkers({
  providers,
  hoveredId,
  selectedId,
  onSelectProvider,
}: {
  providers: SearchMapProvider[];
  hoveredId: string | null;
  selectedId: string | null;
  onSelectProvider: (id: string) => void;
}) {
  const map = useMap();
  const [zoom, setZoom] = useState(map.getZoom());

  useMapEvents({ zoomend: () => setZoom(map.getZoom()) });

  if (zoom < 10) {
    const grouped = providers.reduce<Record<string, SearchMapProvider[]>>(
      (result, provider) => ({ ...result, [provider.city]: [...(result[provider.city] ?? []), provider] }),
      {},
    );

    return (
      <>
        {Object.entries(grouped).map(([city, items]) => {
          const coords = CITY_COORDS[city] ?? [items[0].lat, items[0].lng];
          const icon = L.divIcon({
            className: "provider-map-cluster",
            html: `<div><strong>${items.length}</strong><span>${city}</span></div>`,
            iconSize: [92, 42],
            iconAnchor: [46, 21],
          });

          return (
            <Marker
              key={city}
              position={coords}
              icon={icon}
              eventHandlers={{ click: () => map.flyTo(coords, 11, { duration: 0.45 }) }}
            >
              <Tooltip direction="top">
                {items.length} proveedores en {city}
              </Tooltip>
            </Marker>
          );
        })}
      </>
    );
  }

  return (
    <>
      {providers.map(provider => {
        const selected = provider.id === selectedId;
        const hovered = provider.id === hoveredId;
        const icon = L.divIcon({
          className: `provider-map-touchpoint ${selected ? "selected" : hovered ? "hovered" : ""}`,
          html: `<div><span class="provider-map-dot"></span><strong>${provider.trustScore ?? "Evidencia insuficiente"}</strong></div>`,
          iconSize: [48, 34],
          iconAnchor: [24, 17],
        });

        return (
          <Marker
            key={provider.id}
            position={[provider.lat, provider.lng]}
            icon={icon}
            zIndexOffset={selected ? 1000 : hovered ? 500 : 0}
            eventHandlers={{
              click: event => {
                L.DomEvent.stopPropagation(event.originalEvent);
                onSelectProvider(provider.id);
              },
            }}
          >
            <Tooltip direction="top" offset={[0, -12]} opacity={0.95}>
              <strong>{provider.publicName}</strong>
              <br />
              {provider.category} · {provider.trustScore ?? "Evidencia insuficiente"}{provider.trustScore !== null && " confianza"}
            </Tooltip>
          </Marker>
        );
      })}
    </>
  );
}

export default function MvpProviderMap({
  providers,
  focusCity,
  hoveredId,
  selectedId,
  onSelectProvider,
  onShowInList,
}: {
  providers: SearchMapProvider[];
  focusCity: string | null;
  hoveredId: string | null;
  selectedId: string | null;
  onSelectProvider: (id: string | null) => void;
  onShowInList: (id: string) => void;
}) {
  const [tileState, setTileState] = useState<"loading" | "ready" | "error">("loading");
  const validProviders = useMemo(
    () => providers.filter(p => isInsideNicaragua(p) && isPubliclyListable(p.status)),
    [providers],
  );
  const selectedProvider = useMemo(
    () => validProviders.find(provider => provider.id === selectedId) || null,
    [validProviders, selectedId],
  );

  return (
    <div className="simple-provider-map">
      <MapContainer
        center={NICARAGUA_CENTER}
        zoom={7}
        minZoom={7}
        maxZoom={15}
        maxBounds={NICARAGUA_BOUNDS}
        maxBoundsViscosity={0.9}
        zoomControl
        className="simple-provider-map-canvas"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          eventHandlers={{
            loading: () => setTileState("loading"),
            load: () => setTileState("ready"),
            tileerror: () => setTileState("error"),
          }}
        />
        <ProviderMarkers
          providers={validProviders}
          hoveredId={hoveredId}
          selectedId={selectedId}
          onSelectProvider={onSelectProvider}
        />
        <MapController providers={validProviders} focusCity={focusCity} selectedProvider={selectedProvider} />
        <MapClickDismiss onDismiss={() => onSelectProvider(null)} />
      </MapContainer>

      {tileState === "loading" && (
        <div className="map-tile-status">
          <LoaderCircle /> Cargando mapa…
        </div>
      )}

      {tileState === "error" && (
        <div className="map-tile-status error">
          El mapa base no pudo cargar. Los proveedores siguen disponibles en la lista.
        </div>
      )}

      <div className="map-provider-count">
        <MapPin />
        {validProviders.length} {validProviders.length === 1 ? "proveedor" : "proveedores"} en el mapa
      </div>

      {selectedProvider && (
        <article className="map-provider-preview" aria-live="polite">
          <button className="map-preview-close" onClick={() => onSelectProvider(null)} aria-label="Cerrar vista previa">
            <X />
          </button>
          {selectedProvider.image ? (
            <img src={selectedProvider.image} alt="" />
          ) : (
            <div className="map-preview-image-placeholder" aria-hidden="true">
              <MapPin />
            </div>
          )}
          <div className="map-preview-body">
            <span className="map-preview-category">{selectedProvider.category}</span>
            <h2>{selectedProvider.publicName}</h2>
            <p className="map-preview-location">
              <MapPin />
              {selectedProvider.city} · {selectedProvider.priceLabel} · {selectedProvider.availabilityLabel}
            </p>
            <p className="map-preview-description">{selectedProvider.description}</p>
            <div className="map-preview-signals">
              <span>
                <ShieldCheck />
                {selectedProvider.trustScore ?? "Evidencia insuficiente"}{selectedProvider.trustScore !== null && " confianza"}
              </span>
              <span>
                <BadgeCheck />
                {selectedProvider.verificationLabel}
              </span>
              <span>
                <ShieldCheck />
                {selectedProvider.profileSignalLabel}
              </span>
            </div>
            <div className="map-preview-actions">
              <button className="button secondary" onClick={() => onShowInList(selectedProvider.id)}>
                Ver en lista
              </button>
              <Link className="button secondary" to={`/providers/${selectedProvider.id}`}>
                Ver perfil <ArrowRight />
              </Link>
              {isSanctionedStatus(selectedProvider.status) ? (
                <span className="button secondary disabled">
                  {selectedProvider.status === "BANNED" ? "Proveedor baneado" : "Proveedor suspendido"}
                </span>
              ) : selectedProvider.status === "TEMPORARILY_RESTRICTED" ? (
                <span className="button secondary disabled">
                  Restringido temporalmente
                </span>
              ) : selectedProvider.isOwnProfile ? (
                <Link className="button primary" to="/me/profile/edit">
                  Editar perfil
                </Link>
              ) : (
                <Link className="button primary" to={`/requests/new?providerId=${selectedProvider.id}`}>
                  <MessageCircle /> Cotizar
                </Link>
              )}
            </div>
          </div>
        </article>
      )}
    </div>
  );
}
