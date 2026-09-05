import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Save, Globe, AlertCircle } from "lucide-react";
import { CATEGORY_OPTIONS, CREATIVE_CITIES, priceLabel } from "../lib/mvp-data";
import { useAuthStore } from "../stores/auth-store";
import { useProvidersStore } from "../stores/providers-store";
import { useMvpStore } from "../stores/mvp-store";
import { PageHeader } from "../components/mvp/Ui";
import { useEffect } from "react";
import { getProviderStatusBanner } from "../lib/identity";
import { profileApi } from "../api/profileApi";

export default function EditPublicProfilePage() {
  const { user, fetchMe } = useAuthStore();
  const { currentProvider, getProvider, clearCurrentProvider } = useProvidersStore();
  const updateDemoProvider = useMvpStore(state => state.updateProvider);
  const navigate = useNavigate();

  const providerId = user?.providers?.[0]?.id ?? user?.providerProfileId ?? null;
  const isDemoProvider = !!providerId && providerId.includes("_demo");
  const provider = currentProvider?.provider;
  const catalogItems = currentProvider?.catalogItems || [];
  const photos = currentProvider?.photos || [];

  useEffect(() => {
    if (providerId) {
      getProvider(providerId);
    } else {
      clearCurrentProvider();
    }
  }, [providerId, getProvider, clearCurrentProvider]);

  const [form, setForm] = useState({
    displayName: "",
    tagline: "",
    city: "Managua",
    category: "",
    description: "",
    serviceArea: "Managua",
    priceRange: "",
    availability: "DISPONIBLE",
    contactPreference: "Mensajes de la plataforma",
    avatarUrl: "",
    coverImageUrl: "",
    responseTimeHrs: "1",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);

  const isDraft = provider?.status === "DRAFT";
  const activeCatalogCount = catalogItems.filter(item => item.availabilityStatus === "DISPONIBLE").length;
  const readiness = {
    tagline: form.tagline.trim().length >= 10,
    description: form.description.trim().length >= 40,
    catalog: activeCatalogCount >= 1,
  };
  const canPublish = readiness.tagline && readiness.description && readiness.catalog;

  const handlePublish = async () => {
    if (!provider?.id) return;
    setPublishing(true);
    setPublishError(null);
    try {
      await profileApi.publishProviderProfile(provider.id);
      await getProvider(provider.id);
    } catch (err) {
      setPublishError((err as Error).message);
    } finally {
      setPublishing(false);
    }
  };

  useEffect(() => {
    if (provider) {
      setForm({
        displayName: provider.displayName || "",
        tagline: provider.shortDescription || "",
        city: provider.city || "",
        category: provider.category || "",
        description: provider.aboutDescription || provider.shortDescription || "",
        serviceArea: provider.serviceRadius || provider.city || "",
        priceRange: provider.priceRange || "",
        availability: provider.availability || "",
        contactPreference: "Mensajes de la plataforma",
        avatarUrl: provider.logoUrl || "",
        coverImageUrl: provider.coverImageUrl || photos[0]?.imageUrl || "",
        responseTimeHrs: String(provider.responseTimeHrs || 1),
      });
    }
  }, [provider, photos]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const next: Record<string, string> = {};
    if (!form.displayName.trim()) next.displayName = "Ingresá el nombre público del negocio.";
    if (!form.category) next.category = "Elegí la categoría principal.";
    if (form.description.trim().length < 40) next.description = "La descripción debe explicar qué ofrecés y tener al menos 40 caracteres.";
    setErrors(next);
    if (Object.keys(next).length) return;

    const payload = {
      displayName: form.displayName.trim(),
      shortDescription: form.tagline.trim(),
      city: form.city,
      category: form.category,
      aboutDescription: form.description.trim(),
      serviceRadius: form.serviceArea,
      priceRange: form.priceRange,
      availability: form.availability,
      logoUrl: form.avatarUrl.trim() || undefined,
      coverImageUrl: form.coverImageUrl.trim() || undefined,
      responseTimeHrs: Math.max(1, Number(form.responseTimeHrs) || 1),
    };

    setIsSaving(true);
    try {
      if (isDemoProvider && provider?.id) {
        const availabilityMap: Record<string, "AVAILABLE" | "BUSY" | "UNAVAILABLE"> = {
          DISPONIBLE: "AVAILABLE",
          OCUPADO: "BUSY",
          BAJO_PEDIDO: "BUSY",
          NO_DISPONIBLE_TEMPORALMENTE: "UNAVAILABLE",
        };
        const ok = updateDemoProvider(provider.id, {
          publicName: payload.displayName,
          tagline: payload.shortDescription,
          city: payload.city as any,
          category: payload.category,
          description: payload.aboutDescription,
          serviceArea: [payload.serviceRadius as any],
          priceRange: payload.priceRange as any,
          availability: availabilityMap[payload.availability] ?? "AVAILABLE",
          avatarUrl: form.avatarUrl.trim() || undefined,
          coverImageUrl: form.coverImageUrl.trim() || undefined,
          responseTimeHrs: payload.responseTimeHrs,
        });
        if (!ok) {
          setErrors({ submit: "No se pudo actualizar este perfil demo." });
          return;
        }
        await getProvider(provider.id);
        navigate("/me");
        return;
      }

      const isEditing = !!provider?.id;
      const res = await fetch(isEditing ? `/api/providers/${provider.id}` : "/api/providers", {
        method: isEditing ? "PUT" : "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.success) {
        await fetchMe();
        if (data.data?.id) await getProvider(data.data.id);
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

  return (
    <div className="narrow-page">
      <Link className="back-link" to="/me">
        <ArrowLeft /> Mi perfil
      </Link>
      <PageHeader
        eyebrow="Identidad pública"
        title="Editar perfil público"
        description="Esta información explica quién sos. Los productos y servicios se administran en el catálogo."
      />
      <form className="form-panel" onSubmit={handleSubmit}>
        <label>
          Nombre público o comercial
          <input
            value={form.displayName}
            onChange={event => setForm({ ...form, displayName: event.target.value })}
            maxLength={80}
          />
          {errors.displayName && <span className="field-error">{errors.displayName}</span>}
        </label>
        <label>
          Frase corta
          <input
            value={form.tagline}
            onChange={event => setForm({ ...form, tagline: event.target.value })}
            placeholder="Ej. Empaques responsables para marcas locales"
            maxLength={140}
          />
        </label>
        <div className="form-grid">
          <label>
            Ciudad
            <select
              value={form.city}
              onChange={event => setForm({ ...form, city: event.target.value })}
            >
              {CREATIVE_CITIES.map(city => <option key={city}>{city}</option>)}
            </select>
          </label>
          <label>
            Categoría principal
            <select
              value={form.category}
              onChange={event => setForm({ ...form, category: event.target.value })}
            >
              <option value="">Elegí categoría</option>
              {CATEGORY_OPTIONS.map(category => <option key={category}>{category}</option>)}
            </select>
            {errors.category && <span className="field-error">{errors.category}</span>}
          </label>
          <label>
            Área de servicio
            <select
              value={form.serviceArea}
              onChange={event => setForm({ ...form, serviceArea: event.target.value })}
            >
              {CREATIVE_CITIES.map(city => <option key={city}>{city}</option>)}
            </select>
          </label>
          <label>
            Rango general
            <select
              value={form.priceRange}
              onChange={event => setForm({ ...form, priceRange: event.target.value })}
            >
              <option value="">Sin definir</option>
              {Object.entries(priceLabel).map(([value, label]) => (
                <option value={value} key={value}>{label}</option>
              ))}
            </select>
          </label>
          <label>
            Disponibilidad
            <select
              value={form.availability}
              onChange={event => setForm({ ...form, availability: event.target.value })}
            >
              <option value="">Sin definir</option>
              {Object.entries(availabilityOptions).map(([value, label]) => (
                <option value={value} key={value}>{label}</option>
              ))}
            </select>
          </label>
          <label>
            Respuesta estimada (horas)
            <input
              type="number"
              min="1"
              value={form.responseTimeHrs}
              onChange={event => setForm({ ...form, responseTimeHrs: event.target.value })}
            />
          </label>
          <label>
            Contacto preferido
            <select
              value={form.contactPreference}
              onChange={event => setForm({ ...form, contactPreference: event.target.value })}
            >
              <option>Mensajes de la plataforma</option>
            </select>
          </label>
        </div>
        <label>
          Descripción
          <textarea
            rows={6}
            value={form.description}
            onChange={event => setForm({ ...form, description: event.target.value })}
            maxLength={2000}
          />
          {errors.description && <span className="field-error">{errors.description}</span>}
          <span className="field-hint">{form.description.length}/40 mínimo</span>
        </label>
        <label>
          URL de avatar
          <input
            value={form.avatarUrl}
            onChange={event => setForm({ ...form, avatarUrl: event.target.value })}
            maxLength={500}
          />
        </label>
        <label>
          URL de portada
          <input
            value={form.coverImageUrl}
            onChange={event => setForm({ ...form, coverImageUrl: event.target.value })}
            maxLength={500}
          />
        </label>
        {errors.submit && <p className="field-error">{errors.submit}</p>}
        {isDraft && (
          <section className="publish-readiness-panel">
            <div className="section-header">
              <Globe size={20} />
              <strong>Publicar perfil</strong>
            </div>
            {!canPublish ? (
              <>
                <p className="form-note">
                  Tu perfil está en borrador y no es visible públicamente. Completá los siguientes requisitos para publicarlo:
                </p>
                <ul className="readiness-checklist">
                  <li className={readiness.tagline ? "ok" : "missing"}>
                    {readiness.tagline ? "✓" : "✗"} Frase corta (mínimo 10 caracteres)
                  </li>
                  <li className={readiness.description ? "ok" : "missing"}>
                    {readiness.description ? "✓" : "✗"} Descripción detallada (mínimo 40 caracteres)
                  </li>
                  <li className={readiness.catalog ? "ok" : "missing"}>
                    {readiness.catalog ? "✓" : "✗"} Al menos un catálogo activo
                  </li>
                </ul>
              </>
            ) : (
              <p className="form-note">
                Tu perfil está listo para publicarse y aparecer en búsquedas y mapas.
              </p>
            )}
            {publishError && <p className="field-error" role="alert">{publishError}</p>}
            <button
              type="button"
              className="button primary"
              disabled={!canPublish || publishing}
              onClick={handlePublish}
            >
              <Globe />
              {publishing ? "Publicando..." : "Publicar perfil"}
            </button>
          </section>
        )}
        <button className="button primary" disabled={isSaving}>
          <Save /> {isSaving ? "Guardando..." : "Guardar perfil público"}
        </button>
      </form>
    </div>
  );
}
