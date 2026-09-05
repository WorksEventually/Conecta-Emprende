import { useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  Archive, ArrowLeft, Edit3, Eye, MessageCircle, Package, Plus, Save,
  ToggleLeft, ToggleRight,
} from "lucide-react";
import { CATEGORY_OPTIONS, CREATIVE_CITIES, priceLabel } from "../lib/mvp-data";
import { useAuthStore } from "../stores/auth-store";
import { useProvidersStore } from "../stores/providers-store";
import { EmptyState, PageHeader, TrustBadge } from "../components/mvp/Ui";
import { useEffect } from "react";
import { canReceiveRequests, isLifecycleBlockingStatus, getProviderStatusBanner } from "../lib/identity";

const typeLabel: Record<string, string> = {
  PRODUCTO_FINAL: "Producto",
  SERVICIO_ESPECIALIZADO: "Servicio",
  EQUIPO_PRODUCTIVO: "Equipo",
  ALQUILER_EQUIPO: "Alquiler",
  REPARACION_MANTENIMIENTO: "Reparación",
  CAPACITACION: "Capacitación",
  INSUMO: "Insumo",
  MATERIA_PRIMA: "Materia prima",
};

const availabilityOptions: Record<string, string> = {
  DISPONIBLE: "Disponible",
  OCUPADO: "Ocupado",
  BAJO_PEDIDO: "Bajo pedido",
  NO_DISPONIBLE_TEMPORALMENTE: "No disponible",
};

export function ManageOffersPage() {
  const { user } = useAuthStore();
  const { currentProvider, getProvider } = useProvidersStore();

  const providerId = user?.providers?.[0]?.id;
  const catalogItems = currentProvider?.catalogItems || [];
  const providerStatus = currentProvider?.provider?.status || "ACTIVE";
  // Un proveedor sancionado o inactivo no puede mutar su catálogo.
  // DRAFT puede editar libremente (está construyendo su perfil público).
  const catalogLocked = providerStatus === "SUSPENDED" || providerStatus === "BANNED" || providerStatus === "INACTIVE";
  const lockBanner = getProviderStatusBanner(providerStatus);
  const isLoading = false;

  useEffect(() => {
    if (providerId) {
      getProvider(providerId);
    }
  }, [providerId, getProvider]);

  const [filter, setFilter] = useState("ALL");

  const filteredItems = catalogItems.filter((item: any) => {
    if (filter === "ALL") return true;
    if (filter === "ACTIVE") return item.availabilityStatus === "DISPONIBLE";
    if (filter === "INACTIVE") return item.availabilityStatus !== "DISPONIBLE";
    return item.itemType === filter;
  });

  const handleToggleStatus = async (item: any) => {
    const newStatus = item.availabilityStatus === "DISPONIBLE" ? "BAJO_PEDIDO" : "DISPONIBLE";
    try {
      await fetch(`/api/catalog-items/${item.id}`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ availabilityStatus: newStatus }),
      });
      if (providerId) getProvider(providerId);
    } catch (e) {
      console.error("Toggle status error:", e);
    }
  };

  const handleArchive = async (itemId: string) => {
    try {
      await fetch(`/api/catalog-items/${itemId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (providerId) getProvider(providerId);
    } catch (e) {
      console.error("Archive error:", e);
    }
  };

  const priceDisplay = (item: any) => {
    if (item.priceMin && item.priceMax) {
      return `C$ ${item.priceMin.toLocaleString()} - C$ ${item.priceMax.toLocaleString()}`;
    }
    if (item.priceMin) return `Desde C$ ${item.priceMin.toLocaleString()}`;
    return "Por consultar";
  };

  return (
    <div className="content-page">
      <PageHeader
        eyebrow="Catálogo público"
        title="Productos y servicios"
        description="Administrá ofertas concretas para que los clientes sepan qué pueden solicitar."
        actions={
          <Link className={`button primary${catalogLocked ? " disabled" : ""}`} to={catalogLocked ? "#" : "/me/products/new"} aria-disabled={catalogLocked}>
            <Plus /> Agregar producto o servicio
          </Link>
        }
      />
      {catalogLocked && lockBanner && (
        <section className={`provider-status-banner ${providerStatus.toLowerCase()} tone-${lockBanner.tone}`}>
          <h2>{lockBanner.heading}</h2>
          <p>
            {lockBanner.body}
            {currentProvider?.provider?.statusReason ? ` Razón: ${currentProvider.provider.statusReason}` : ""}
            {currentProvider?.provider?.suspendedUntil ? ` Hasta: ${new Date(currentProvider.provider.suspendedUntil).toLocaleDateString("es-NI")}.` : ""}
          </p>
          <p className="form-note">Mientras dure esta condición no podés agregar, editar ni eliminar ofertas del catálogo.</p>
        </section>
      )}
      <div className="offer-filters">
        {[
          ["ALL", "Todos"],
          ["ACTIVE", "Activos"],
          ["INACTIVE", "Inactivos"],
          ["PRODUCTO_FINAL", "Productos"],
          ["SERVICIO_ESPECIALIZADO", "Servicios"],
        ].map(([value, label]) => (
          <button
            className={filter === value ? "active" : ""}
            onClick={() => setFilter(value)}
            key={value}
          >
            {label}
          </button>
        ))}
      </div>
      {filteredItems.length ? (
        <div className="offer-manager-list">
          {filteredItems.map((item: any) => (
            <article key={item.id}>
              <img src={item.mainImageUrl || ""} alt="" />
              <div>
                <span className="eyebrow">
                  {typeLabel[item.itemType] || item.itemType} ·{" "}
                  {item.availabilityStatus === "DISPONIBLE" ? "Activo" : "Inactivo"}
                </span>
                <h2 className="offer-manager-title text-truncate" title={item.title}>{item.title}</h2>
                <p className="offer-manager-description text-clamp-2">{item.description || "Sin descripción"}</p>
                <small>
                  {priceDisplay(item)} · {item.priceUnit || "Por unidad"} · {item.inquiryCount || 0} consultas
                </small>
              </div>
              <div className="offer-manager-actions">
                <button onClick={() => handleToggleStatus(item)} disabled={catalogLocked}>
                  {item.availabilityStatus === "DISPONIBLE" ? (
                    <ToggleRight />
                  ) : (
                    <ToggleLeft />
                  )}
                  {item.availabilityStatus === "DISPONIBLE" ? "Desactivar" : "Activar"}
                </button>
                <Link to={`/providers/${item.providerId}/products/${item.id}`}>
                  <Eye /> Vista pública
                </Link>
                <Link to={catalogLocked ? "#" : `/me/products/${item.id}/edit`} aria-disabled={catalogLocked} className={catalogLocked ? "disabled" : ""}>
                  <Edit3 /> Editar
                </Link>
                <button className="danger" onClick={() => handleArchive(item.id)} disabled={catalogLocked}>
                  <Archive /> Eliminar
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <EmptyState icon={<Package />} title="No hay ofertas en este filtro">
          Agregá tu primer producto o servicio para explicar mejor qué ofrecés.
        </EmptyState>
      )}
    </div>
  );
}

export function OfferEditorPage() {
  const { productId } = useParams();
  const { user } = useAuthStore();
  const { currentProvider, getProvider } = useProvidersStore();
  const navigate = useNavigate();

  const providerId = user?.providers?.[0]?.id;
  const catalogItems = currentProvider?.catalogItems || [];
  const providerStatus = currentProvider?.provider?.status || "ACTIVE";
  // Un proveedor sancionado o inactivo no puede mutar su catálogo.
  const catalogLocked = providerStatus === "SUSPENDED" || providerStatus === "BANNED" || providerStatus === "INACTIVE";
  const lockBanner = getProviderStatusBanner(providerStatus);
  const existing = productId ? catalogItems.find((item: any) => item.id === productId) : null;

  useEffect(() => {
    if (providerId) {
      getProvider(providerId);
    }
  }, [providerId, getProvider]);

  const [form, setForm] = useState({
    title: "",
    itemType: "SERVICIO_ESPECIALIZADO",
    category: CATEGORY_OPTIONS[0],
    description: "",
    priceMin: "",
    priceMax: "",
    priceUnit: "",
    city: "Managua",
    availabilityStatus: "DISPONIBLE",
    mainImageUrl: "",
    deliveryAvailable: false,
    pickupAvailable: false,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (existing) {
      setForm({
        title: existing.title || "",
        itemType: existing.itemType || "SERVICIO_ESPECIALIZADO",
        category: existing.category || CATEGORY_OPTIONS[0],
        description: existing.description || "",
        priceMin: existing.priceMin ? String(existing.priceMin) : "",
        priceMax: existing.priceMax ? String(existing.priceMax) : "",
        priceUnit: existing.priceUnit || "",
        city: existing.city || "Managua",
        availabilityStatus: existing.availabilityStatus || "DISPONIBLE",
        mainImageUrl: existing.mainImageUrl || "",
        deliveryAvailable: existing.deliveryAvailable || false,
        pickupAvailable: existing.pickupAvailable || false,
      });
    }
  }, [existing]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const next: Record<string, string> = {};
    if (!form.title.trim()) next.title = "Ingresá el nombre de la oferta.";
    if (form.description.trim().length < 20) next.description = "La descripción debe tener al menos 20 caracteres.";
    setErrors(next);
    if (Object.keys(next).length) return;

    setIsSaving(true);
    try {
      const payload = {
        providerId,
        title: form.title.trim(),
        itemType: form.itemType,
        category: form.category,
        description: form.description.trim(),
        priceMin: form.priceMin ? Number(form.priceMin) : null,
        priceMax: form.priceMax ? Number(form.priceMax) : null,
        priceUnit: form.priceUnit || null,
        city: form.city,
        availabilityStatus: form.availabilityStatus,
        mainImageUrl: form.mainImageUrl.trim() || null,
        deliveryAvailable: form.deliveryAvailable,
        pickupAvailable: form.pickupAvailable,
      };

      const url = existing
        ? `/api/catalog-items/${existing.id}`
        : "/api/catalog-items";
      const method = existing ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (data.success) {
        navigate("/me/products");
      } else {
        setErrors({ submit: data.error || "Error al guardar" });
      }
    } catch (e) {
      setErrors({ submit: "Error de conexión" });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="narrow-page">
      <Link className="back-link" to="/me/products">
        <ArrowLeft /> Productos y servicios
      </Link>
      <PageHeader
        eyebrow="Editor de oferta"
        title={existing ? "Editar producto o servicio" : "Agregar producto o servicio"}
        description="Publicá información concreta, precios comprensibles y tiempos realistas."
      />
      <form className="form-panel" onSubmit={handleSubmit}>
        <label>
          Nombre
          <input
            value={form.title}
            onChange={e => setForm({ ...form, title: e.target.value })}
            maxLength={120}
          />
          {errors.title && <span className="field-error">{errors.title}</span>}
        </label>
        <div className="form-grid">
          <label>
            Tipo
            <select
              value={form.itemType}
              onChange={e => setForm({ ...form, itemType: e.target.value })}
            >
              {Object.entries(typeLabel).map(([value, label]) => (
                <option value={value} key={value}>{label}</option>
              ))}
            </select>
          </label>
          <label>
            Categoría
            <select
              value={form.category}
              onChange={e => setForm({ ...form, category: e.target.value })}
            >
              {CATEGORY_OPTIONS.map(cat => <option key={cat}>{cat}</option>)}
            </select>
          </label>
        </div>
        <label>
          Descripción
          <textarea
            value={form.description}
            onChange={e => setForm({ ...form, description: e.target.value })}
            maxLength={2000}
          />
          {errors.description && <span className="field-error">{errors.description}</span>}
        </label>
        <div className="form-grid">
          <label>
            Precio mínimo (C$)
            <input
              type="number"
              value={form.priceMin}
              onChange={e => setForm({ ...form, priceMin: e.target.value })}
              placeholder="Ej. 1000"
            />
          </label>
          <label>
            Precio máximo (C$)
            <input
              type="number"
              value={form.priceMax}
              onChange={e => setForm({ ...form, priceMax: e.target.value })}
              placeholder="Ej. 5000"
            />
          </label>
          <label>
            Unidad de precio
            <input
              value={form.priceUnit}
              onChange={e => setForm({ ...form, priceUnit: e.target.value })}
              placeholder="Ej. por unidad, por hora"
              maxLength={50}
            />
          </label>
          <label>
            Ciudad
            <select
              value={form.city}
              onChange={e => setForm({ ...form, city: e.target.value })}
            >
              {CREATIVE_CITIES.map(c => <option key={c}>{c}</option>)}
            </select>
          </label>
          <label>
            Disponibilidad
            <select
              value={form.availabilityStatus}
              onChange={e => setForm({ ...form, availabilityStatus: e.target.value })}
            >
              {Object.entries(availabilityOptions).map(([v, l]) => (
                <option value={v} key={v}>{l}</option>
              ))}
            </select>
          </label>
        </div>
        <label>
          URL de imagen principal
          <input
            value={form.mainImageUrl}
            onChange={e => setForm({ ...form, mainImageUrl: e.target.value })}
            maxLength={500}
          />
        </label>
        {errors.submit && <p className="field-error">{errors.submit}</p>}
        <button className="button primary" disabled={isSaving}>
          <Save /> {isSaving ? "Guardando..." : "Guardar oferta"}
        </button>
      </form>
    </div>
  );
}

export function OfferDetailPage() {
  const { providerId, productId } = useParams();
  const { currentProvider, getProvider } = useProvidersStore();
  const { user } = useAuthStore();
  const navigate = useNavigate();

  const provider = currentProvider?.provider;
  const catalogItems = currentProvider?.catalogItems || [];
  const offer = catalogItems.find((item: any) => item.id === productId);

  useEffect(() => {
    if (providerId) {
      getProvider(providerId);
    }
  }, [providerId, getProvider]);

  if (!provider || !offer) {
    return (
      <EmptyState title="Oferta no encontrada">
        Esta oferta está inactiva o ya no está disponible.
      </EmptyState>
    );
  }

  const photos = currentProvider?.photos || [];
  const portfolioImages = photos.map((p: any) => p.imageUrl).filter(Boolean);
  const isOwnOffer = (user?.providers?.[0]?.id || user?.providerProfileId) === provider.id;
  const blockedFromQuotes = isLifecycleBlockingStatus(provider.status);

  const priceDisplay = () => {
    if (offer.priceMin && offer.priceMax) {
      return `C$ ${offer.priceMin.toLocaleString()} - C$ ${offer.priceMax.toLocaleString()}`;
    }
    if (offer.priceMin) return `Desde C$ ${offer.priceMin.toLocaleString()}`;
    return "Por consultar";
  };

  return (
    <div className="content-page">
      <Link className="back-link" to={`/providers/${provider.id}`}>
        <ArrowLeft /> Perfil de {provider.displayName}
      </Link>
      {(() => {
        const banner = getProviderStatusBanner(provider.status);
        if (!banner) return null;
        const canStillRequest = canReceiveRequests(provider.status);
        return (
          <section className={`provider-status-banner ${String(provider.status).toLowerCase()} tone-${banner.tone}`}>
            <h2>{banner.heading}</h2>
            <p>
              {banner.body}
              {provider.statusReason ? ` Razón: ${provider.statusReason}` : ""}
              {provider.suspendedUntil ? ` Hasta: ${new Date(provider.suspendedUntil).toLocaleDateString("es-NI")}.` : ""}
            </p>
            {canStillRequest && <p className="form-note">Aun con restricciones, este proveedor puede recibir nuevas solicitudes.</p>}
          </section>
        );
      })()}
      <div className="offer-detail">
        <img
          src={offer.mainImageUrl || portfolioImages[0] || ""}
          alt={`Muestra de ${offer.title}`}
        />
        <main>
          <span className="eyebrow">
            {typeLabel[offer.itemType] || offer.itemType} · {offer.category}
          </span>
          <h1 className="offer-detail-title" title={offer.title}>{offer.title}</h1>
          <p className="lead">{offer.description}</p>
          <div className="offer-detail-facts">
            <div>
              <span>Precio</span>
              <strong>{priceDisplay()}</strong>
            </div>
            <div>
              <span>Entrega</span>
              <strong>{offer.priceUnit || "Por acordar"}</strong>
            </div>
            <div>
              <span>Disponibilidad</span>
              <strong>{availabilityOptions[offer.availabilityStatus] || offer.availabilityStatus}</strong>
            </div>
          </div>
          <section className="offer-provider-summary">
            <div>
              <strong className="text-truncate" title={provider.displayName}>{provider.displayName}</strong>
              <span>{provider.city} · {provider.category}</span>
            </div>
            <TrustBadge score={provider.trustScore?.finalScore ?? 0} />
          </section>
          <div className="card-actions">
            {blockedFromQuotes ? (
              <span className="button secondary disabled">
                {getProviderStatusBanner(provider.status)?.heading || "No disponible por estado del proveedor"}
              </span>
            ) : isOwnOffer ? (
              <Link className="button primary" to={`/me/products/${offer.id}/edit`}>
                <Edit3 /> Editar oferta
              </Link>
            ) : (
              <Link
                className="button primary"
                to={`/requests/new?providerId=${provider.id}&productId=${offer.id}`}
              >
                <MessageCircle /> Consultar por este producto
              </Link>
            )}
          </div>
          <p className="form-note">
            La conversación quedará vinculada a esta oferta y podrá desbloquear una reseña verificada al completar el trabajo.
          </p>
        </main>
      </div>
    </div>
  );
}
