import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Award, BadgeCheck, Check, CheckCircle2, ChevronRight,
  Clock3, ExternalLink, FileText, Landmark, LockKeyhole, Save, ShieldCheck,
  Smartphone, UserRound,
} from "lucide-react";
import { CATEGORY_OPTIONS, CREATIVE_CITIES, priceLabel } from "../lib/mvp-data";
import { useAuthStore } from "../stores/auth-store";
import { useProvidersStore } from "../stores/providers-store";
import { PageHeader, SkeletonRows, TrustBadge, UnavailableForMvpCard, VerificationBadge } from "../components/mvp/Ui";
import { getRoleLabel } from "../lib/identity";

export function MyProfilePage() {
  const { user, isAuthenticated } = useAuthStore();
  const { currentProvider, getProvider, isLoading } = useProvidersStore();

  React.useEffect(() => {
    if (user?.providers?.[0]?.id) {
      getProvider(user.providers[0].id);
    }
  }, [user?.providers?.[0]?.id, getProvider]);

  if (!isAuthenticated || !user) {
    return (
      <div className="content-page">
        <div className="empty-state">
          <h1>Iniciá sesión</h1>
          <p>Necesitás iniciar sesión para ver tu perfil.</p>
          <Link to="/auth/login" className="button primary">Iniciar sesión</Link>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="content-page">
        <SkeletonRows count={4} />
      </div>
    );
  }

  const provider = currentProvider?.provider;
  const photos = currentProvider?.photos || [];
  const medals = currentProvider?.medals || [];
  const trustScore = currentProvider?.provider?.trustScore?.finalScore ?? 0;
  const portfolioImages = photos.map((p: any) => p.imageUrl).filter(Boolean);

  if (!provider) {
    return (
      <div className="content-page">
        <PageHeader
          eyebrow="Cuenta y presencia pública"
          title="Mi perfil"
          description="Revisá lo que la plataforma sabe de vos y lo que ven tus clientes."
        />
        <div className="empty-state">
          <h2>Sin negocio registrado</h2>
          <p>Completá tu registro para que los clientes puedan encontrarte.</p>
          <Link to="/me/profile/edit" className="button primary">Crear mi negocio</Link>
        </div>
      </div>
    );
  }

  const displayName = user.name || user.email?.split("@")[0] || "Usuario";
  const initials = displayName.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);

  return (
    <div className="content-page">
      <PageHeader
        eyebrow="Cuenta y presencia pública"
        title="Mi perfil"
        description="Revisá lo que la plataforma sabe de vos y lo que ven tus clientes."
        actions={<Link className="button primary" to="/me/profile/edit">Editar perfil público</Link>}
      />
      <section className="account-summary">
        <div className="profile-monogram">{initials}</div>
        <div>
          <h2 className="text-truncate" title={user.name || "Usuario"}>{user.name || "Usuario"}</h2>
          <p className="text-truncate" title={user.email}>{user.email}</p>
          <div className="badges">
            <span className="badge"><Smartphone /> Teléfono verificado</span>
            <span className="badge"><UserRound /> {getRoleLabel([user.role, ...(user.roleLabels ?? [])])}</span>
          </div>
        </div>
      </section>

      <div className="profile-dashboard">
        <main>
          <section className="profile-preview">
            <div
              className="preview-image"
              style={{ backgroundImage: `url(${portfolioImages[0] || provider.coverImageUrl || ""})` }}
            />
            <div>
              <span className="eyebrow">Vista previa pública</span>
              <h2 className="text-truncate" title={provider.displayName}>{provider.displayName}</h2>
              <p className="text-clamp-3">{provider.aboutDescription || provider.shortDescription}</p>
              <div className="badges">
                <TrustBadge score={trustScore} />
                <VerificationBadge level={(provider.verificationLevel as any) || "UNVERIFIED"} />
                <span className="badge"><ShieldCheck /> Perfil comercial</span>
              </div>
              <div className="card-actions">
                <Link className="button secondary" to={`/providers/${provider.id}`}>
                  Ver perfil público <ExternalLink />
                </Link>
                <Link className="button primary" to="/me/profile/edit">Editar perfil público</Link>
              </div>
            </div>
          </section>
          <UnavailableForMvpCard title="Importar y exportar no disponible para el MVP" />
        </main>

        <aside>
          <section className="content-section">
            <h2><ShieldCheck /> Verificación y confianza</h2>
            <strong className="big-score">{trustScore}<small>/100</small></strong>
            <p>
              Se obtiene con verificación, perfil completo, respuestas, trabajos confirmados, reseñas y antigüedad.
            </p>
            <Link className="text-link" to="/trust">Entender mi puntaje <ChevronRight /></Link>
            <div className="medal-list">
              {medals.map((medal: any) => (
                <span key={medal.id}><Award />{medal.medalType}</span>
              ))}
            </div>
          </section>
          <section className="content-section">
            <h2><ShieldCheck /> Calidad del perfil</h2>
            <p>Completá descripción, imágenes, disponibilidad y catálogo para que clientes puedan evaluar mejor tu oferta.</p>
            <Link className="button secondary full" to="/me/profile/edit">Mejorar perfil</Link>
          </section>
        </aside>
      </div>
    </div>
  );
}

export function EditProfilePage() {
  const { user } = useAuthStore();
  const { currentProvider, getProvider, isLoading } = useProvidersStore();
  const navigate = useNavigate();

  const provider = currentProvider?.provider;
  const photos = currentProvider?.photos || [];

  React.useEffect(() => {
    if (user?.providers?.[0]?.id) {
      getProvider(user.providers[0].id);
    }
  }, [user?.providers?.[0]?.id, getProvider]);

  const [form, setForm] = useState({
    displayName: "",
    city: "",
    category: "",
    description: "",
    priceRange: "",
    availability: "",
    portfolioText: "",
  });

  React.useEffect(() => {
    if (provider) {
      setForm({
        displayName: provider.displayName || "",
        city: provider.city || "",
        category: provider.category || "",
        description: provider.aboutDescription || provider.shortDescription || "",
        priceRange: provider.priceRange || "",
        availability: provider.availability || "",
        portfolioText: photos.map((p: any) => p.imageUrl).join("\n"),
      });
    }
  }, [provider, photos]);

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (!form.displayName.trim()) next.displayName = "El nombre es obligatorio.";
    if (!CREATIVE_CITIES.includes(form.city as any)) next.city = "Elegí una ciudad creativa.";
    if (!form.category) next.category = "Elegí una categoría.";
    if (form.description.trim().length < 40) next.description = "La descripción necesita al menos 40 caracteres.";
    setErrors(next);
    if (Object.keys(next).length) return;

    setIsSaving(true);
    try {
      const res = await fetch(`/api/providers/${provider?.id}`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayName: form.displayName.trim(),
          city: form.city,
          category: form.category,
          aboutDescription: form.description.trim(),
          priceRange: form.priceRange,
          availability: form.availability,
        }),
      });
      const data = await res.json();
      if (data.success) {
        navigate("/me");
      } else {
        setErrors({ submit: data.error || "Error al guardar" });
      }
    } catch (err) {
      setErrors({ submit: "Error de conexión" });
    } finally {
      setIsSaving(false);
    }
  };

  const availabilityOptions: Record<string, string> = {
    DISPONIBLE: "Disponible",
    OCUPADO: "Ocupado",
    BAJO_PEDIDO: "Bajo pedido",
    NO_DISPONIBLE_TEMPORALMENTE: "No disponible",
  };

  if (isLoading) {
    return (
      <div className="narrow-page">
        <SkeletonRows count={5} />
      </div>
    );
  }

  return (
    <div className="narrow-page">
      <PageHeader
        eyebrow="Perfil público"
        title="Editá cómo te encuentran"
        description="Los cambios se reflejan de inmediato en búsqueda y perfil público."
      />
      <form className="form-panel" onSubmit={handleSubmit}>
        <label>
          Nombre público o comercial
          <input
            value={form.displayName}
            onChange={e => setForm({ ...form, displayName: e.target.value })}
            maxLength={80}
          />
          {errors.displayName && <span className="field-error">{errors.displayName}</span>}
        </label>
        <div className="form-grid">
          <label>
            Ciudad
            <select
              value={form.city}
              onChange={e => setForm({ ...form, city: e.target.value })}
            >
              <option value="">Elegí una ciudad</option>
              {CREATIVE_CITIES.map(c => <option key={c}>{c}</option>)}
            </select>
            {errors.city && <span className="field-error">{errors.city}</span>}
          </label>
          <label>
            Categoría
            <select
              value={form.category}
              onChange={e => setForm({ ...form, category: e.target.value })}
            >
              <option value="">Elegí una categoría</option>
              {CATEGORY_OPTIONS.map(c => <option key={c}>{c}</option>)}
            </select>
            {errors.category && <span className="field-error">{errors.category}</span>}
          </label>
        </div>
        <label>
          Descripción
          <textarea
            rows={5}
            value={form.description}
            onChange={e => setForm({ ...form, description: e.target.value })}
            maxLength={2000}
          />
          <span className={form.description.length < 40 ? "field-hint warning" : "field-hint"}>
            {form.description.length}/40 mínimo
          </span>
          {errors.description && <span className="field-error">{errors.description}</span>}
        </label>
        <div className="form-grid">
          <label>
            Rango de precio
            <select
              value={form.priceRange}
              onChange={e => setForm({ ...form, priceRange: e.target.value })}
            >
              <option value="">Sin definir</option>
              {Object.entries(priceLabel).map(([v, l]) => (
                <option value={v} key={v}>{l}</option>
              ))}
            </select>
          </label>
          <label>
            Disponibilidad
            <select
              value={form.availability}
              onChange={e => setForm({ ...form, availability: e.target.value })}
            >
              <option value="">Sin definir</option>
              {Object.entries(availabilityOptions).map(([v, l]) => (
                <option value={v} key={v}>{l}</option>
              ))}
            </select>
          </label>
        </div>
        <label>
          URLs de imágenes de portafolio
          <textarea
            rows={3}
            value={form.portfolioText}
            onChange={e => setForm({ ...form, portfolioText: e.target.value })}
            maxLength={2000}
          />
          <span className="field-hint">Una URL por línea. La carga de archivos no forma parte del MVP.</span>
        </label>
        {errors.submit && <p className="field-error">{errors.submit}</p>}
        <div className="form-actions">
          <Link className="button secondary" to="/me">Cancelar</Link>
          <button className="button primary" disabled={isSaving}>
            <Save /> {isSaving ? "Guardando..." : "Guardar cambios"}
          </button>
        </div>
      </form>
    </div>
  );
}

const medalRules = [
  ["Perfil completo", "Nombre, ciudad, categoría, descripción, precio y disponibilidad."],
  ["Teléfono verificado", "El número de contacto fue confirmado."],
  ["Responde rápido", "Respondió al menos cinco solicitudes."],
  ["Trabajo confirmado", "Completó tres solicitudes con confirmación bilateral."],
  ["Perfil comercial completo", "Publicó información suficiente para evaluar su oferta."],
  ["Catálogo activo", "Mantiene productos o servicios disponibles para cotizar."],
  ["Confianza alta", "Alcanzó 80 puntos o más."],
];

export function TrustPage() {
  return (
    <div className="content-page">
      <PageHeader
        eyebrow="Reglas transparentes"
        title="La confianza no es solo una estrella"
        description="Identidad y reputación se muestran por separado para reducir la inflación del puntaje."
      />
      <div className="trust-explainer">
        <section>
          <BadgeCheck />
          <h2>Verificación</h2>
          <p>Responde quién es la cuenta. Puede avanzar de correo básico a teléfono confirmado y perfil completo.</p>
        </section>
        <section>
          <ShieldCheck />
          <h2>Reputación</h2>
          <p>Responde qué ha demostrado. Solo cuenta actividad completada entre ambas partes y reseñas vinculadas.</p>
        </section>
        <section>
          <Clock3 />
          <h2>Antigüedad</h2>
          <p>Las cuentas nuevas tienen menor peso. Nadie alcanza confianza alta de un día para otro.</p>
        </section>
      </div>
      <section className="content-section">
        <h2>Medallas y reglas</h2>
        <div className="rule-list">
          {medalRules.map(([name, rule]) => (
            <div key={name}>
              <Award />
              <span>
                <strong>{name}</strong>
                {rule}
              </span>
            </div>
          ))}
        </div>
      </section>
      <section className="content-section">
        <h2>Protecciones del MVP</h2>
        <ul className="check-list">
          <li><Check /> Una solicitud solo se completa cuando cliente y proveedor confirman.</li>
          <li><Check /> Una reseña requiere una solicitud completada y solo puede publicarse una vez.</li>
          <li><Check /> Los aportes por actividad tienen límites para evitar crecimiento artificial.</li>
          <li><Check /> Los reportes pasan a revisión humana, nunca a sanción automática.</li>
        </ul>
      </section>
    </div>
  );
}

export function SecurityPage() {
  return (
    <div className="content-page">
      <PageHeader
        eyebrow="Configuración"
        title="Seguridad de la cuenta"
        description="Información clara sobre la sesión y las protecciones disponibles."
      />
      <div className="settings-list">
        <section>
          <div>
            <Smartphone />
            <span>
              <h2>Teléfono</h2>
              <p>+505 8••• ••42</p>
            </span>
          </div>
          <span className="status status-completed">
            <CheckCircle2 /> Verificado
          </span>
        </section>
        <section>
          <div>
            <UserRound />
            <span>
              <h2>Rol y permisos</h2>
              <p>Proveedor · Administrador de demostración</p>
            </span>
          </div>
          <span className="badge">Acceso controlado</span>
        </section>
        <section>
          <div>
            <LockKeyhole />
            <span>
              <h2>Sesión actual</h2>
              <p>Este dispositivo · Managua · vence tras 30 minutos de inactividad</p>
            </span>
          </div>
          <button className="button secondary">Cerrar otras sesiones</button>
        </section>
      </div>
      <UnavailableForMvpCard title="2FA no disponible para el MVP" />
    </div>
  );
}
