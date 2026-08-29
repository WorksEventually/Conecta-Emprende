import { useEffect } from "react";
import { Link } from "react-router-dom";
import {
  Award,
  Check,
  Circle,
  ExternalLink,
  MessageCircle,
  Package,
  Plus,
  Search,
  ShieldCheck,
  Smartphone,
  UserRound,
} from "lucide-react";
import { useAuthStore, type AuthUser } from "../stores/auth-store";
import { useProvidersStore } from "../stores/providers-store";
import { useQuotesStore, type QuoteThread } from "../stores/quotes-store";
import {
  EmptyState,
  PageHeader,
  RequestStatusBadge,
  SkeletonRows,
  TrustBadge,
  UnavailableForMvpCard,
  VerificationBadge,
} from "../components/mvp/Ui";

const ACTIVE_STATUSES = ["OPEN", "IN_CONVERSATION"];

function AccountSummary({ user }: { user: AuthUser }) {
  const displayName = user.name || user.email?.split("@")[0] || "Usuario";
  const initials = displayName
    .split(" ")
    .map(name => name[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <section className="account-summary">
      <div className="profile-monogram">{initials}</div>
      <div>
        <h2>{displayName}</h2>
        <p>{user.email}</p>
        <div className="badges">
          <span className="badge">
            <UserRound /> {user.providerProfileId ? "Proveedor y solicitante" : "Solicitante"}
          </span>
          <span className="badge">
            <Smartphone /> Teléfono pendiente
          </span>
          <span className="badge">{user.emailVerified ? "Email verificado" : "Email pendiente"}</span>
        </div>
      </div>
    </section>
  );
}

function RecentRequests({ threads }: { threads: QuoteThread[] }) {
  const recent = [...threads].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 3);

  if (!recent.length) {
    return (
      <EmptyState icon={<Search />} title="Todavía no tenés solicitudes">
        Buscá un proveedor y abrí una conversación para guardar el acuerdo dentro de la plataforma.
      </EmptyState>
    );
  }

  return (
    <div className="mini-request-list">
      {recent.map(thread => (
        <Link to={`/requests/${thread.id}/chat`} key={thread.id}>
          <span>
            <RequestStatusBadge status={thread.status as any} />
            <strong>{thread.subject}</strong>
            <small>{thread.providerDisplayName || "Proveedor"} · {thread.messages.at(-1)?.text || "Sin mensajes"}</small>
          </span>
          <MessageCircle />
        </Link>
      ))}
    </div>
  );
}

export default function MyProfileDashboardPage() {
  const { user, isAuthenticated, isLoading: authLoading } = useAuthStore();
  const { currentProvider, getProvider, clearCurrentProvider, isLoading: providerLoading } = useProvidersStore();
  const { threads, fetchMyThreads, clearThreads } = useQuotesStore();

  const providerId = user?.providers?.[0]?.id ?? user?.providerProfileId ?? null;
  const provider = currentProvider?.provider;

  useEffect(() => {
    if (providerId) {
      getProvider(providerId);
    } else {
      clearCurrentProvider();
    }
  }, [providerId, getProvider, clearCurrentProvider]);

  useEffect(() => {
    if (!user) {
      clearThreads();
      return;
    }
    fetchMyThreads();
  }, [user?.id, fetchMyThreads, clearThreads]);

  if (authLoading || providerLoading) {
    return (
      <div className="content-page">
        <SkeletonRows count={4} />
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return (
      <div className="content-page">
        <div className="empty-state">
          <h1>Iniciá sesión</h1>
          <p>Necesitás iniciar sesión para ver tu cuenta.</p>
          <Link to="/auth/login" className="button primary">Iniciar sesión</Link>
        </div>
      </div>
    );
  }

  const openThreads = threads.filter(thread => ACTIVE_STATUSES.includes(thread.status));
  const completedThreads = threads.filter(thread => thread.status === "COMPLETED");

  if (!providerId || !provider) {
    return (
      <div className="content-page">
        <PageHeader
          eyebrow="Mi cuenta"
          title="Panel de solicitante"
          description="Seguí tus solicitudes, retomá conversaciones y prepará tu cuenta para pedir cotizaciones con proveedores locales."
        />

        <AccountSummary user={user} />

        <div className="profile-dashboard requester-dashboard">
          <main>
            <section className="dashboard-panel">
              <div className="section-heading">
                <div>
                  <span className="eyebrow">Actividad como solicitante</span>
                  <h2>Solicitudes y conversaciones</h2>
                </div>
                <MessageCircle />
              </div>
              <div className="business-metrics">
                <div>
                  <strong>{openThreads.length}</strong>
                  <span>Activas</span>
                </div>
                <div>
                  <strong>{completedThreads.length}</strong>
                  <span>Completadas</span>
                </div>
                <div>
                  <strong>{threads.length}</strong>
                  <span>Total</span>
                </div>
              </div>
              <RecentRequests threads={threads} />
              <div className="card-actions">
                <Link className="button primary" to="/search">
                  <Search /> Buscar proveedores
                </Link>
                <Link className="button secondary" to="/requests">
                  Ver todas mis solicitudes
                </Link>
              </div>
            </section>

            <section className="provider-upgrade-panel">
              <div>
                <span className="eyebrow">También podés vender</span>
                <h2>Creá un perfil proveedor cuando estés listo</h2>
                <p>
                  La cuenta puede funcionar como solicitante ahora y, más adelante, activar un negocio con catálogo,
                  mapa, confianza y conversaciones comerciales.
                </p>
              </div>
              <Link to="/me/profile/edit" className="button primary">
                <Plus /> Crear perfil proveedor
              </Link>
            </section>
          </main>

          <aside>
            <section className="content-section">
              <h2><ShieldCheck /> Estado de cuenta</h2>
              <div className="profile-checklist">
                <div className="done"><Check /> Cuenta creada</div>
                <div className={user.emailVerified ? "done" : ""}>{user.emailVerified ? <Check /> : <Circle />} Email verificado</div>
                <div><Circle /> Teléfono pendiente</div>
                <div><Circle /> Perfil proveedor opcional</div>
              </div>
            </section>
            <UnavailableForMvpCard title="Favoritos y recomendaciones guardadas no disponibles para el MVP" />
          </aside>
        </div>
      </div>
    );
  }

  const catalogItems = currentProvider?.catalogItems || [];
  const activeItems = catalogItems.filter((item: any) => item.availabilityStatus === "DISPONIBLE");
  const inactiveItems = catalogItems.filter((item: any) => item.availabilityStatus !== "DISPONIBLE");
  const mostConsulted = [...catalogItems].sort((a: any, b: any) => b.inquiryCount - a.inquiryCount)[0];
  const portfolioImages = currentProvider?.photos?.map((photo: any) => photo.imageUrl).filter(Boolean) || [];
  const trustScore = currentProvider?.provider?.trustScore?.finalScore ?? provider.trustScore ?? 0;
  const medals = currentProvider?.medals || [];

  const checklist = [
    { label: "Nombre público", done: !!provider.displayName },
    { label: "Ciudad creativa", done: !!provider.city },
    { label: "Categoría principal", done: !!provider.category },
    { label: "Descripción completa", done: (provider.aboutDescription || "").length >= 40 },
    { label: "Producto o servicio activo", done: activeItems.length > 0 },
    { label: "Imagen o portafolio", done: portfolioImages.length > 0 },
    { label: "Rango de precio", done: !!provider.priceRange },
    { label: "Disponibilidad", done: !!provider.availability },
  ];

  const completeness = Math.round((checklist.filter(item => item.done).length / checklist.length) * 100);

  return (
    <div className="content-page">
      <PageHeader
        eyebrow="Centro de negocio"
        title="Mi perfil"
        description="Gestioná tu cuenta, presencia pública, catálogo, conversaciones y crecimiento de confianza."
        actions={
          <div className="page-actions">
            <Link className="button secondary" to={`/providers/${provider.id}`}>
              Ver perfil público <ExternalLink />
            </Link>
            <Link className="button primary" to="/me/profile/edit">
              Editar perfil público
            </Link>
          </div>
        }
      />

      <AccountSummary user={user} />

      <div className="profile-dashboard">
        <main>
          <section className="profile-preview">
            <div
              className="preview-image"
              style={{ backgroundImage: `url(${portfolioImages[0] || provider.coverImageUrl || ""})` }}
            />
            <div>
              <span className="eyebrow">Resumen de gestión</span>
              <h2>{provider.displayName}</h2>
              <p>{provider.aboutDescription || provider.shortDescription}</p>
              <div className="badges">
                <TrustBadge score={trustScore} />
                <VerificationBadge level={provider.verificationLevel} />
                <span className="badge">
                  <ShieldCheck /> {completeness >= 80 ? "Perfil comercial sólido" : "Perfil en construcción"}
                </span>
              </div>
            </div>
          </section>

          <section className="dashboard-panel">
            <div className="section-heading">
              <div>
                <span className="eyebrow">Fortaleza del perfil</span>
                <h2>{completeness}% completo</h2>
              </div>
              <strong>{checklist.filter(item => item.done).length}/{checklist.length}</strong>
            </div>
            <div className="progress"><span style={{ width: `${completeness}%` }} /></div>
            <div className="profile-checklist">
              {checklist.map(item => (
                <div className={item.done ? "done" : ""} key={item.label}>
                  {item.done ? <Check /> : <Circle />}
                  {item.label}
                </div>
              ))}
            </div>
          </section>

          <section className="dashboard-panel">
            <div className="section-heading">
              <div>
                <span className="eyebrow">Catálogo</span>
                <h2>Productos y servicios</h2>
              </div>
              <Package />
            </div>
            <div className="business-metrics">
              <div><strong>{activeItems.length}</strong><span>Activos</span></div>
              <div><strong>{inactiveItems.length}</strong><span>Inactivos</span></div>
              <div><strong>{mostConsulted?.title || "Sin datos"}</strong><span>Más consultado</span></div>
            </div>
            <div className="card-actions">
              <Link className="button secondary" to="/me/products">Administrar productos y servicios</Link>
              <Link className="button primary" to="/me/products/new"><Plus /> Agregar oferta</Link>
            </div>
          </section>

          <section className="dashboard-panel">
            <div className="section-heading">
              <div>
                <span className="eyebrow">Actividad comercial</span>
                <h2>Conversaciones y solicitudes</h2>
              </div>
              <MessageCircle />
            </div>
            <div className="business-metrics">
              <div><strong>{openThreads.length}</strong><span>Activas</span></div>
              <div><strong>{completedThreads.length}</strong><span>Completadas</span></div>
              <div><strong>{threads.length}</strong><span>Total</span></div>
            </div>
            <RecentRequests threads={threads} />
            <div className="card-actions">
              <Link className="button primary" to="/requests">Ver conversaciones</Link>
              <Link className="button secondary" to="/requests">Ver solicitudes</Link>
            </div>
          </section>

          <UnavailableForMvpCard title="Importar y exportar no disponible para el MVP" />
        </main>

        <aside>
          <section className="content-section">
            <h2><ShieldCheck /> Confianza y medallas</h2>
            <strong className="big-score">{trustScore}<small>/100</small></strong>
            <p>Respondé dentro de la app, completá trabajos con confirmación bilateral y mantené actualizado tu catálogo.</p>
            <div className="medal-list">
              {medals.map((medal: any) => <span key={medal.id}><Award />{medal.medalType}</span>)}
              {activeItems.length < 3 && <span className="locked"><Package /> Catálogo activo: faltan {3 - activeItems.length}</span>}
            </div>
            <Link className="text-link" to="/trust">Entender mi puntaje</Link>
          </section>

          <section className="content-section">
            <h2><ShieldCheck /> Calidad del perfil</h2>
            <span className="badge"><ShieldCheck /> {completeness}% completo</span>
            <p>Completá descripción, catálogo, imágenes y disponibilidad para que el perfil sea más claro en búsqueda.</p>
            <Link className="button secondary full" to="/me/profile/edit">Mejorar perfil público</Link>
          </section>
        </aside>
      </div>
    </div>
  );
}
