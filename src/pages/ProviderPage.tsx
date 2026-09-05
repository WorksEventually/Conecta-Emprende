import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ArrowLeft, Award, BadgeCheck, Bookmark, CalendarCheck, Clock3,
  ExternalLink, Flag, MapPin, MessageCircle, Package, ShieldCheck, Star, X,
} from "lucide-react";
import { useProvidersStore } from "../stores/providers-store";
import { useAuthStore } from "../stores/auth-store";
import { EmptyState, SkeletonRows, VerificationBadge } from "../components/mvp/Ui";
import { TrustScoreBadge } from "../components/provider/TrustScoreBadge";
import { canReceiveRequests, isLifecycleBlockingStatus, getProviderStatusBanner } from "../lib/identity";

const availabilityLabelMap: Record<string, string> = {
  DISPONIBLE: "Disponible",
  OCUPADO: "Ocupado",
  BAJO_PEDIDO: "Bajo pedido",
  NO_DISPONIBLE_TEMPORALMENTE: "No disponible temporalmente",
};

const priceLabelMap: Record<string, string> = {
  LOW: "Bajo",
  MEDIUM: "Medio",
  HIGH: "Alto",
  NEGOTIABLE: "A negociar",
};

const tabOptions = [
  { value: "ALL", label: "Todos" },
  { value: "PRODUCT", label: "Productos" },
  { value: "SERVICE", label: "Servicios" },
  { value: "PACKAGE", label: "Paquetes" },
  { value: "PORTFOLIO_ITEM", label: "Portafolio" },
];

const offerTypeLabel: Record<string, string> = {
  PRODUCTO_FINAL: "Producto",
  SERVICIO_ESPECIALIZADO: "Servicio",
  EQUIPO_PRODUCTIVO: "Equipo",
  ALQUILER_EQUIPO: "Alquiler",
  REPARACION_MANTENIMIENTO: "Reparación",
  CAPACITACION: "Capacitación",
  INSUMO: "Insumo",
  MATERIA_PRIMA: "Materia prima",
};

export default function ProviderPage() {
  const { providerId, id } = useParams();
  const key = providerId || id;
  const { currentProvider, getProvider, isLoading } = useProvidersStore();
  const { user } = useAuthStore();
  const [tab, setTab] = useState("ALL");
  const [saved, setSaved] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reason, setReason] = useState("Perfil falso");
  const [description, setDescription] = useState("");

  useEffect(() => {
    if (key) {
      getProvider(key);
    }
  }, [key, getProvider]);

  const provider = currentProvider?.provider;
  const catalogItems = currentProvider?.catalogItems || [];
  const reviews = currentProvider?.reviews || [];
  const medals = currentProvider?.medals || [];
  const photos = currentProvider?.photos || [];
  const portfolioImages = photos.map((p: any) => p.imageUrl).filter(Boolean);
  const trustScore = currentProvider?.provider?.trustScore?.finalScore ?? currentProvider?.provider?.trustScore ?? 0;

  const activeItems = useMemo(
    () => catalogItems.filter((item: any) => item.availabilityStatus === "DISPONIBLE"),
    [catalogItems]
  );

  const visibleOffers = useMemo(
    () => tab === "ALL" ? activeItems : activeItems.filter((item: any) => item.itemType === tab),
    [activeItems, tab]
  );

  const avgReview = reviews.length
    ? reviews.reduce((sum: number, r: any) => sum + (r.generalScore || r.qualityScore || 0), 0) / reviews.length
    : null;

  if (isLoading) {
    return (
      <div className="provider-page">
        <div className="content-page">
          <SkeletonRows count={4} />
        </div>
      </div>
    );
  }

  if (!provider) {
    return (
      <EmptyState title="Perfil no encontrado">
        Este proveedor no existe o ya no está disponible.
      </EmptyState>
    );
  }

  const isOwnProfile = (user?.providers?.[0]?.id || user?.providerProfileId) === provider.id;
  const providerStatus = provider.status || "ACTIVE";
  const canRequest = canReceiveRequests(providerStatus);
  const blockedFromQuotes = isLifecycleBlockingStatus(providerStatus);
  const statusBanner = getProviderStatusBanner(providerStatus);
  const activeOfferCount = activeItems.length;
  const publicProfileSignal = trustScore >= 80 && activeOfferCount > 0 ? "Perfil comercial sólido" : "Perfil en construcción";

  return (
    <div className="provider-page">
      <section
        className="provider-cover"
        style={{
          backgroundImage: `linear-gradient(90deg,rgba(13, 30, 56, .92),rgba(13, 30, 56, .25)),url(${portfolioImages[0] || provider.coverImageUrl || ""})`,
        }}
      >
        <div>
          <Link to="/search" className="back-link">
            <ArrowLeft /> Volver a resultados
          </Link>
          <span className="eyebrow">{provider.category}</span>
          <h1 title={provider.displayName}>{provider.displayName}</h1>
          <p className="provider-tagline">{provider.shortDescription || "Soluciones locales para negocios que necesitan avanzar con claridad."}</p>
          <div className="provider-identity-meta">
            <span><MapPin />{provider.city}</span>
            <span><CalendarCheck />{availabilityLabelMap[provider.availability] || provider.availability}</span>
            <span><Clock3 />Responde en {provider.responseTimeHrs || 24} h</span>
          </div>
          <div className="badges">
            <TrustScoreBadge
              trustScore={trustScore ? trustScore : null}
              bilateralCompletions={provider.metrics?.bilateralCompletions ?? 0}
              phoneVerified={provider.verified}
            />
            <VerificationBadge level={(provider.verificationLevel as any) || "UNVERIFIED"} />
            <span className="badge"><ShieldCheck />{publicProfileSignal}</span>
          </div>
          <div className="provider-primary-actions">
            {blockedFromQuotes ? (
              <span className="button secondary disabled">
                {statusBanner?.heading || "Este proveedor no puede recibir solicitudes"}
              </span>
            ) : isOwnProfile ? (
              <Link className="button primary" to="/me/profile/edit">
                Editar mi perfil público
              </Link>
            ) : (
              <Link className="button primary" to={`/requests/new?providerId=${provider.id}`}>
                <MessageCircle /> Chatear y solicitar cotización
              </Link>
            )}
            <a className="button secondary" href="#ofertas">
              <Package /> Ver productos y servicios
            </a>
          </div>
        </div>
      </section>

      <div className="provider-grid">
        <main>
          {statusBanner && (
            <section className={`provider-status-banner ${providerStatus.toLowerCase()} tone-${statusBanner.tone}`}>
              <h2>{statusBanner.heading}</h2>
              <p>
                {statusBanner.body}
                {provider.statusReason ? ` Razón: ${provider.statusReason}` : ""}
                {provider.suspendedUntil ? ` Hasta: ${new Date(provider.suspendedUntil).toLocaleDateString("es-NI")}.` : ""}
              </p>
              {canRequest && <p className="form-note">Aun con restricciones, este proveedor puede recibir nuevas solicitudes.</p>}
              {isOwnProfile && !canRequest && <p className="form-note">Como dueño del perfil, podés revisar esta restricción con administración antes de operar de nuevo.</p>}
            </section>
          )}

          <section className="content-section">
            <div className="section-heading">
              <h2>Acerca del negocio</h2>
              <span>{provider.completedRequests || 0} trabajos confirmados</span>
            </div>
            <p className="lead">{provider.aboutDescription || provider.shortDescription || ""}</p>
            <div className="business-facts">
              <div>
                <span>Área de servicio</span>
                <strong>{provider.city} y atención por acuerdo</strong>
              </div>
              <div>
                <span>Tipo de negocio</span>
                <strong>Proveedor local independiente</strong>
              </div>
              {provider.priceRange && (
                <div>
                  <span>Rango general</span>
                  <strong>{priceLabelMap[provider.priceRange] || provider.priceRange}</strong>
                </div>
              )}
            </div>
          </section>

          <section className="content-section offers-public" id="ofertas">
            <div className="section-heading">
              <div>
                <span className="eyebrow">Catálogo activo</span>
                <h2>Productos y servicios</h2>
              </div>
              <span>{activeItems.length} ofertas disponibles</span>
            </div>
            <div className="offer-tabs">
              {tabOptions.map(option => (
                <button
                  className={tab === option.value ? "active" : ""}
                  onClick={() => setTab(option.value)}
                  key={option.value}
                >
                  {option.label}
                  <span>
                    {option.value === "ALL" ? activeItems.length : activeItems.filter((i: any) => i.itemType === option.value).length}
                  </span>
                </button>
              ))}
            </div>
            {visibleOffers.length ? (
              <div className="public-offer-grid">
                {visibleOffers.map((offer: any) => (
                  <article key={offer.id}>
                    <img src={offer.mainImageUrl || portfolioImages[0] || ""} alt="" />
                    <div>
                      <span className="eyebrow">
                        {offerTypeLabel[offer.itemType] || offer.itemType} · {offer.category}
                      </span>
                      <h3>{offer.title}</h3>
                      <p>{offer.description}</p>
                      <dl>
                        <div>
                          <dt>Precio</dt>
                          <dd>
                            {offer.priceMin && offer.priceMax
                              ? `C$ ${offer.priceMin.toLocaleString()} - C$ ${offer.priceMax.toLocaleString()}`
                              : offer.priceMin ? `Desde C$ ${offer.priceMin.toLocaleString()}` : "Por consultar"}
                          </dd>
                        </div>
                        <div>
                          <dt>Entrega</dt>
                          <dd>{offer.priceUnit || "Por acordar"}</dd>
                        </div>
                      </dl>
                      <div className="card-actions">
                        {blockedFromQuotes ? (
                          <span className="button secondary disabled">No disponible por estado del perfil</span>
                        ) : isOwnProfile ? (
                          <Link className="button primary" to={`/me/products/${offer.id}/edit`}>
                            Editar oferta
                          </Link>
                        ) : (
                          <Link className="button primary" to={`/requests/new?providerId=${provider.id}&productId=${offer.id}`}>
                            Consultar por este producto
                          </Link>
                        )}
                        <Link className="button secondary" to={`/providers/${provider.id}/products/${offer.id}`}>
                          Ver detalle
                        </Link>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <EmptyState icon={<Package />} title="No hay ofertas en esta categoría">
                Podés enviar una solicitud general desde el perfil.
              </EmptyState>
            )}
          </section>

          <section className="content-section">
            <div className="section-heading">
              <h2>Reseñas verificadas</h2>
              <span>
                {avgReview ? `${avgReview.toFixed(1)} de 5 · ` : ""}
                {reviews.length} experiencias
              </span>
            </div>
            {reviews.length ? (
              reviews.map((review: any) => (
                <article className="review" key={review.id}>
                  <div>
                    <span className="stars">
                      {Array.from({ length: Math.round(review.generalScore || 4) }, (_, index) => (
                        <Star key={index} />
                      ))}
                    </span>
                    <time>{new Date(review.createdAt).toLocaleDateString("es-NI")}</time>
                  </div>
                  <p>{review.comment || review.body}</p>
                  <small><BadgeCheck /> Trabajo confirmado por ambas partes</small>
                </article>
              ))
            ) : (
              <EmptyState title="Todavía no hay reseñas verificadas">
                Iniciá una solicitud dentro de la app para dejar una reseña cuando el trabajo se complete.
              </EmptyState>
            )}
          </section>
        </main>

        <aside className="profile-sidebar">
          <section>
            <h2><ShieldCheck /> Confianza y reputación</h2>
            <strong className="big-score">{trustScore}<small>/100</small></strong>
            <p>
              Se calcula con solicitudes completadas dentro de la plataforma, reseñas verificadas y nivel del perfil.
              Las conversaciones externas no suman al historial.
            </p>
            <dl>
              <div>
                <dt>Verificación</dt>
                <dd>{provider.verificationLevel || "Sin verificar"}</dd>
              </div>
              <div>
                <dt>Trabajos bilaterales</dt>
                <dd>{provider.completedRequests || 0}</dd>
              </div>
              <div>
                <dt>Reseña promedio</dt>
                <dd>{avgReview?.toFixed(1) || "Sin reseñas"}</dd>
              </div>
            </dl>
            <Link className="text-link" to="/trust">Cómo funciona la confianza</Link>
          </section>

          <section>
            <h2><Award /> Medallas</h2>
            <div className="medal-list">
              {medals.map((medal: any) => (
                <span key={medal.id}><Award />{medal.medalType}</span>
              ))}
            </div>
          </section>

          <section>
            <h2><ShieldCheck /> Señales del perfil</h2>
            <span className="badge"><ShieldCheck />{publicProfileSignal}</span>
            <p>
              Esta señal combina información pública del perfil, catálogo activo, verificación y actividad confirmada dentro de la app.
            </p>
            <Link className="text-link" to="/trust">Ver reglas de confianza</Link>
          </section>

          <section>
            <h2>Acciones</h2>
            <button className="button secondary full" onClick={() => setSaved(!saved)}>
              <Bookmark />{saved ? "Proveedor guardado" : "Guardar proveedor"}
            </button>
            {isOwnProfile && (
              <Link className="button secondary full" to="/me/profile/edit">
                Editar mi perfil público
              </Link>
            )}
            <button className="button secondary full" disabled title="No disponible para el MVP">
              <ExternalLink /> Compartir no disponible
            </button>
            <button className="text-button danger" onClick={() => setReportOpen(true)}>
              <Flag /> Reportar perfil
            </button>
          </section>
        </aside>
      </div>

      {reportOpen && (
        <div className="dialog-backdrop" onMouseDown={() => setReportOpen(false)}>
          <form
            className="dialog"
            onMouseDown={event => event.stopPropagation()}
            onSubmit={event => {
              event.preventDefault();
              setReportOpen(false);
            }}
          >
            <div className="dialog-head">
              <div>
                <span className="eyebrow">Revisión humana</span>
                <h2>Reportar perfil</h2>
              </div>
              <button type="button" onClick={() => setReportOpen(false)}>
                <X />
              </button>
            </div>
            <label>Motivo
              <select value={reason} onChange={event => setReason(event.target.value)}>
                <option>Perfil falso</option>
                <option>Calificación sospechosa</option>
                <option>Spam</option>
                <option>Contenido inapropiado</option>
                <option>Intento de estafa</option>
                <option>Otro</option>
              </select>
            </label>
            <label>Descripción
              <textarea
                required
                minLength={10}
                maxLength={1000}
                value={description}
                onChange={event => setDescription(event.target.value)}
                placeholder="Contanos qué ocurrió"
              />
            </label>
            <p className="form-note">
              No se aplicarán sanciones automáticas. Una persona revisará el reporte.
            </p>
            <button className="button primary">Enviar reporte</button>
          </form>
        </div>
      )}
    </div>
  );
}
