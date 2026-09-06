import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { CalendarCheck, List, Map, MapPin, Search, SlidersHorizontal, Sparkles, X } from "lucide-react";
import MvpProviderMap, { type SearchMapProvider } from "../components/map/MvpProviderMap";
import { CATEGORY_OPTIONS, CREATIVE_CITIES, type CreativeCity, type PriceRange } from "../lib/mvp-data";
import { useProvidersStore, type ProviderSearchResult } from "../stores/providers-store";
import { useAuthStore } from "../stores/auth-store";
import { AvailabilityBadge, EmptyState, IntentChip, PriceBadge, SkeletonRows, TrustBadge, VerificationBadge } from "../components/mvp/Ui";
import { useDebouncedValue } from "../hooks/use-debounced-value";
import { isSanctionedStatus } from "../lib/identity";
import { SearchFilterBar } from "../components/ui/SearchFilterBar";

const availabilityLabel: Record<string, string> = {
  DISPONIBLE: "Disponible",
  OCUPADO: "Ocupado",
  BAJO_PEDIDO: "Bajo pedido",
  NO_DISPONIBLE_TEMPORALMENTE: "No disponible temporalmente",
};

const priceLabel: Record<string, string> = {
  LOW: "Bajo",
  MEDIUM: "Medio",
  HIGH: "Alto",
  NEGOTIABLE: "A negociar",
};

const norm = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

export default function SearchPage() {
  const { providers, searchProviders, searchProvidersAI, isLoading, aiUsed, aiIntent, patchIntent } = useProvidersStore();
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState(params.get("query") || "");
  const debouncedQuery = useDebouncedValue(query, 400);
  const abortRef = useRef<AbortController | null>(null);
  const [city, setCity] = useState(params.get("city") || "");
  const [category, setCategory] = useState("");
  const [price, setPrice] = useState("");
  const [trust, setTrust] = useState(0);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mobileView, setMobileView] = useState<"list" | "map">("list");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const cardRefs = useRef<Record<string, HTMLElement | null>>({});
  const filterMenuRef = useRef<HTMLDivElement | null>(null);

  const ownedProviderId = user?.providers?.[0]?.id || user?.providerProfileId;

  useEffect(() => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const trimmed = debouncedQuery.trim();
    if (trimmed.length >= 2) {
      searchProvidersAI({ query: trimmed, signal: controller.signal });
      setParams(trimmed ? { query: trimmed } : {}, { replace: true });
    } else {
      searchProviders({ q: "", city });
    }
  }, [debouncedQuery, city]);

  const results = useMemo(() => {
    const base = providers;

    const cityFilter = city || aiIntent?.city || "";
    const categoryFilter = category || aiIntent?.category || "";

    return base
      .map((provider: ProviderSearchResult) => {
        const cityTarget = cityFilter as CreativeCity | null;
        const categoryTarget = categoryFilter;
        const match =
          (!cityTarget || provider.city === cityTarget) &&
          (!categoryTarget || norm(provider.category).includes(norm(categoryTarget))) &&
          (!price || provider.priceRange === price) &&
           (provider.trustScore ?? -1) >= trust;

        return { ...provider, match };
      })
      .filter((provider: any) => provider.match)
       .sort((a: any, b: any) => (b.trustScore ?? -1) - (a.trustScore ?? -1));
  }, [providers, city, category, price, trust, aiIntent]);

  const mapProviders = useMemo<SearchMapProvider[]>(() => {
    return results.map((provider: any) => ({
      id: provider.id,
      publicName: provider.displayName,
      category: provider.category,
      city: provider.city,
      lat: provider.lat,
      lng: provider.lng,
       trustScore: provider.trustScore,
      availabilityLabel: availabilityLabel[provider.availability] || provider.availability,
      status: provider.status,
      statusReason: provider.statusReason,
      suspendedUntil: provider.suspendedUntil,
      priceLabel: priceLabel[provider.priceRange] || provider.priceRange || "",
      verificationLabel: { UNVERIFIED: "Sin verificar", PHONE: "Teléfono verificado", COMPLETE: "Perfil verificado" }[provider.verificationLevel] || provider.verificationLevel || "Sin verificar",
       profileSignalLabel: provider.trustScore == null ? "Evidencia insuficiente" : provider.trustScore >= 80 ? "Perfil comercial sólido" : "Perfil en construcción",
      description: provider.shortDescription || "",
      image: provider.photos?.[0] || "",
      isOwnProfile: provider.id === ownedProviderId,
    }));
  }, [results, ownedProviderId]);

  useEffect(() => {
    if (selectedId) {
      cardRefs.current[selectedId]?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [selectedId]);

  useEffect(() => {
    if (!filtersOpen) return;

    const closeOnOutsidePress = (event: MouseEvent) => {
      if (!filterMenuRef.current?.contains(event.target as Node)) setFiltersOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setFiltersOpen(false);
    };

    document.addEventListener("mousedown", closeOnOutsidePress);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsidePress);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [filtersOpen]);

  const showInList = (id: string) => {
    setSelectedId(id);
    setMobileView("list");
    window.requestAnimationFrame(() => cardRefs.current[id]?.scrollIntoView({ behavior: "smooth", block: "center" }));
  };

  const handleSearch = (e: FormEvent) => {
    e.preventDefault();
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const trimmed = query.trim();
    setParams(trimmed ? { query: trimmed } : {}, { replace: true });
    searchProvidersAI({ query: trimmed, signal: controller.signal });
  };

  return (
    <div className="search-page">
      <header className="search-toolbar">
        <SearchFilterBar
          value={query}
          onChange={setQuery}
          onSubmit={handleSearch}
          placeholder="¿Qué proveedor necesitás?"
          ariaLabel="Buscar proveedores"
        />
        <div className="search-filter-menu-wrap" ref={filterMenuRef}>
          <button
            type="button"
            className="filter-toggle"
            aria-expanded={filtersOpen}
            aria-controls="search-filters-menu"
            onClick={() => setFiltersOpen(value => !value)}
          >
            <SlidersHorizontal aria-hidden="true" />
            <span>Filtros</span>
            {(city || category || price || trust > 0) && <span className="filter-toggle-count">{[city, category, price, trust > 0 ? "trust" : ""].filter(Boolean).length}</span>}
          </button>
          {filtersOpen && (
            <div className="filters-dropdown" id="search-filters-menu" role="dialog" aria-label="Filtros de búsqueda">
              <div className="filters-dropdown-head">
                <strong>Filtrar resultados</strong>
                <button type="button" className="filter-menu-close" aria-label="Cerrar filtros" onClick={() => setFiltersOpen(false)}>
                  <X aria-hidden="true" />
                </button>
              </div>
              <aside className="filters filters-dropdown-panel" aria-label="Opciones de filtro">
                <label>Ciudad
                  <select value={city} onChange={event => setCity(event.target.value)}>
                    <option value="">Todas</option>
                    {CREATIVE_CITIES.map(item => <option key={item}>{item}</option>)}
                  </select>
                </label>
                <label>Categoría
                  <select value={category} onChange={event => setCategory(event.target.value)}>
                    <option value="">Todas</option>
                    {CATEGORY_OPTIONS.map(item => <option key={item}>{item}</option>)}
                  </select>
                </label>
                <label>Precio
                  <select value={price} onChange={event => setPrice(event.target.value)}>
                    <option value="">Cualquier rango</option>
                    {Object.entries(priceLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </label>
                <label>Confianza mínima <strong>{trust}</strong>
                  <input type="range" min="0" max="90" step="10" value={trust} onChange={event => setTrust(Number(event.target.value))} />
                </label>
                <label className="check">
                  <input type="checkbox" checked={false} onChange={() => {}} />
                  <CalendarCheck /> Disponible ahora
                </label>
              </aside>
            </div>
          )}
        </div>
        <div className="mobile-view-switch" aria-label="Vista de resultados">
          <button className={mobileView === "list" ? "active" : ""} onClick={() => setMobileView("list")}><List /> Lista</button>
          <button className={mobileView === "map" ? "active" : ""} onClick={() => setMobileView("map")}><Map /> Mapa</button>
        </div>
      </header>

      <div className="search-layout">
        <main className={`results ${mobileView === "list" ? "mobile-active" : ""}`}>
          {aiIntent && (
            <section className="intent-summary" data-confidence={aiIntent.confidence}>
              <Sparkles />
              <div>
                <strong>Entendimos tu búsqueda{aiUsed ? " con IA" : ""}</strong>
                <span className="badges">
                  {aiIntent.category && (
                    <IntentChip
                      label={`Categoría: ${aiIntent.category}`}
                      onRemove={() => patchIntent({ category: null })}
                    />
                  )}
                  {aiIntent.city && (
                    <IntentChip
                      label={`Ciudad: ${aiIntent.city}`}
                      onRemove={() => patchIntent({ city: null })}
                    />
                  )}
                  {aiIntent.maxPriceNIO && (
                    <IntentChip
                      label={`Presupuesto: hasta C$${aiIntent.maxPriceNIO.toLocaleString()}`}
                      onRemove={() => patchIntent({ maxPriceNIO: null })}
                    />
                  )}
                  {aiIntent.urgency && (
                    <IntentChip
                      label={`Urgencia: ${aiIntent.urgency}`}
                      onRemove={() => patchIntent({ urgency: null })}
                    />
                  )}
                </span>
              </div>
            </section>
          )}

          <div className="results-heading">
            <div>
              <h1>{results.length} proveedores para comparar</h1>
              <p>Ordenados por relevancia{aiUsed ? " IA" : ""}, confianza, cercanía y disponibilidad.</p>
            </div>
          </div>

          {isLoading ? (
            <SkeletonRows count={5} />
          ) : results.length === 0 ? (
            <EmptyState icon={<Search />} title="No encontramos proveedores exactos">
              Probá con otra ciudad, categoría o rango de precio.
            </EmptyState>
          ) : (
            <div className="provider-list">
              {results.map((provider: any) => (
                <article
                  ref={node => { cardRefs.current[provider.id] = node; }}
                  className={`provider-result ${hoveredId === provider.id || selectedId === provider.id ? "map-linked-active" : ""}`}
                  key={provider.id}
                  onMouseEnter={() => setHoveredId(provider.id)}
                  onMouseLeave={() => setHoveredId(null)}
                  onClick={() => setSelectedId(provider.id)}
                >
                  {provider.photos?.[0] ? (
                    <img src={provider.photos[0]} alt="" />
                  ) : (
                    <div className="provider-result-image-placeholder" aria-hidden="true">
                      <MapPin />
                    </div>
                  )}
                  <div className="provider-body">
                    <div className="provider-title">
                      <div className="provider-title-copy">
                        <span>{provider.category}</span>
                        <h2 className="provider-name text-truncate" title={provider.displayName}>{provider.displayName}</h2>
                      </div>
                      <TrustBadge score={provider.trustScore} />
                    </div>
                    <p className="provider-description text-clamp-2">{provider.shortDescription}</p>
                    <div className="badges">
                      <span className="badge"><MapPin />{provider.city}</span>
                      {provider.priceRange && <PriceBadge value={provider.priceRange as any} />}
                      <AvailabilityBadge value={provider.availability as any} />
                      <VerificationBadge level={provider.verificationLevel as any} />
                    </div>
                    <div className="recommendation">
                      <Sparkles /> Recomendado porque combina {provider.trustScore >= 80 ? "confianza alta" : "experiencia local"} y {availabilityLabel[provider.availability]?.toLowerCase() || "disponibilidad"}.
                    </div>
                    <div className="card-actions">
                      <Link className="button secondary" to={`/providers/${provider.id}`}>Ver perfil</Link>
                      {isSanctionedStatus(provider.status) ? (
                        <span className="button secondary disabled">{provider.status === "BANNED" ? "Proveedor baneado" : "Proveedor suspendido"}</span>
                      ) : provider.id === ownedProviderId ? (
                        <Link className="button primary" to="/me/profile/edit">Editar mi perfil</Link>
                      ) : (
                        <button className="button primary" onClick={() => navigate(`/requests/new?providerId=${provider.id}`)}>Solicitar cotización</button>
                      )}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </main>

        <aside className={`map-panel ${mobileView === "map" ? "mobile-active" : ""}`} aria-label="Mapa interactivo de proveedores">
          <MvpProviderMap
            providers={mapProviders}
            focusCity={(city || aiIntent?.city || null) as string | null}
            hoveredId={hoveredId}
            selectedId={selectedId}
            onSelectProvider={setSelectedId}
            onShowInList={showInList}
          />
        </aside>
      </div>
    </div>
  );
}
