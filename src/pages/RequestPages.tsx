import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, CheckCircle2, Circle, MessageCircle, Search, Send, Star, UserRound } from "lucide-react";
import { CREATIVE_CITIES, priceLabel, type PriceRange } from "../lib/mvp-data";
import { useAuthStore } from "../stores/auth-store";
import { useProvidersStore } from "../stores/providers-store";
import { useQuotesStore } from "../stores/quotes-store";
import { ratingApi } from "../api/ratingApi";
import { EmptyState, PageHeader, RequestStatusBadge } from "../components/mvp/Ui";

const statusLabel: Record<string, string> = {
  OPEN: "Abierta",
  IN_CONVERSATION: "En conversación",
  COMPLETED: "Completada",
  CLOSED_REQUESTER: "Cerrada por cliente",
  CLOSED_PROVIDER: "Cerrada por proveedor",
  CANCELLED: "Cancelada",
};

const tabs = [
  { label: "Activas", statuses: ["OPEN", "IN_CONVERSATION"] },
  { label: "No leídas", statuses: ["OPEN", "IN_CONVERSATION"] },
  { label: "Completadas", statuses: ["COMPLETED"] },
  { label: "Cerradas", statuses: ["CLOSED_PROVIDER", "CLOSED_REQUESTER", "CANCELLED"] },
];

export function NewRequestPage() {
  const [params] = useSearchParams();
  const providerId = params.get("providerId") || "";
  const productId = params.get("productId");
  const { getProvider, currentProvider } = useProvidersStore();
  const { createThread } = useQuotesStore();
  const navigate = useNavigate();

  const [form, setForm] = useState({
    title: "",
    description: "",
    date: "",
    budget: "" as PriceRange | "",
    location: "Managua",
    contact: "Mensajes de la plataforma",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const provider = currentProvider?.provider;

  useEffect(() => {
    if (providerId) {
      getProvider(providerId);
    }
  }, [providerId, getProvider]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const next: Record<string, string> = {};
    if (!form.title.trim()) next.title = "Escribí un título.";
    if (form.description.trim().length < 20) next.description = "Contanos un poco más, al menos 20 caracteres.";
    setErrors(next);
    if (Object.keys(next).length) return;

    setIsSubmitting(true);
    try {
      const thread = await createThread({
        providerId,
        subject: form.title,
        body: form.description,
        catalogItemId: productId || undefined,
      });
      if (thread) {
        navigate(`/requests/${thread.id}/chat`);
      } else {
        setErrors({ submit: "No se pudo crear la solicitud. RevisÃ¡ que no sea tu propio perfil e intentÃ¡ de nuevo." });
      }
    } catch (e) {
      setErrors({ submit: "No se pudo crear la solicitud. Intentá de nuevo." });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!providerId) {
    return (
      <EmptyState title="Elegí un proveedor primero">
        Volvé a la búsqueda para iniciar una solicitud.
      </EmptyState>
    );
  }

  return (
    <div className="narrow-page">
      <Link to={`/providers/${providerId}`} className="back-link">
        <ArrowLeft /> Volver al perfil
      </Link>
      <PageHeader
        eyebrow="Nueva solicitud"
        title={provider ? `Cotizá con ${provider.displayName}` : "Nueva solicitud"}
        description="La solicitud abrirá una conversación protegida dentro de la plataforma."
      />
      <form className="form-panel" onSubmit={handleSubmit}>
        <label>
          Título de la solicitud
          <input
            value={form.title}
            onChange={event => setForm({ ...form, title: event.target.value })}
            placeholder="Ej. 200 empaques para café"
          />
          {errors.title && <span className="field-error">{errors.title}</span>}
        </label>
        <label>
          Descripción
          <textarea
            rows={6}
            value={form.description}
            onChange={event => setForm({ ...form, description: event.target.value })}
            placeholder="Cantidad, medidas, materiales y cualquier detalle importante…"
          />
          {errors.description && <span className="field-error">{errors.description}</span>}
        </label>
        <div className="form-grid">
          <label>
            Fecha deseada
            <input type="date" value={form.date} onChange={event => setForm({ ...form, date: event.target.value })} />
          </label>
          <label>
            Presupuesto
            <select
              value={form.budget}
              onChange={event => setForm({ ...form, budget: event.target.value as PriceRange })}
            >
              <option value="">Sin definir</option>
              {Object.entries(priceLabel).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label>
          <label>
            Ciudad
            <select
              value={form.location}
              onChange={event => setForm({ ...form, location: event.target.value })}
            >
              {CREATIVE_CITIES.map(city => (
                <option key={city}>{city}</option>
              ))}
            </select>
          </label>
          <label>
            Canal principal
            <select
              value={form.contact}
              onChange={event => setForm({ ...form, contact: event.target.value })}
            >
              <option>Mensajes de la plataforma</option>
              <option disabled>Contacto externo no disponible para el MVP</option>
            </select>
          </label>
        </div>
        {errors.submit && <p className="field-error">{errors.submit}</p>}
        <p className="form-note">
          Mantener la conversación acá permite confirmar el trabajo y desbloquear una reseña verificada.
        </p>
        <button className="button primary" disabled={isSubmitting}>
          <MessageCircle /> {isSubmitting ? "Creando..." : "Chatear y solicitar cotización"}
        </button>
      </form>
    </div>
  );
}

export function RequestsPage() {
  const { user, isAuthenticated } = useAuthStore();
  const { threads, fetchMyThreads, clearThreads, isLoading } = useQuotesStore();
  const [tab, setTab] = useState(0);

  useEffect(() => {
    if (!isAuthenticated || !user) {
      clearThreads();
      return;
    }
    fetchMyThreads();
  }, [isAuthenticated, user?.id, fetchMyThreads, clearThreads]);

  const list = threads.filter(thread => tabs[tab].statuses.includes(thread.status));

  return (
    <div className="content-page">
      <PageHeader
        eyebrow="Bandeja comercial"
        title="Solicitudes y conversaciones"
        description="Cada conversación conserva el alcance, la cotización y el estado del acuerdo."
      />
      <div className="tabs">
        {tabs.map((item, index) => (
          <button
            className={tab === index ? "active" : ""}
            onClick={() => setTab(index)}
            key={item.label}
          >
            {item.label}
            <span>
              {threads.filter(thread => item.statuses.includes(thread.status)).length}
            </span>
          </button>
        ))}
      </div>
      {isLoading ? (
        <EmptyState title="Cargando...">Obteniendo conversaciones...</EmptyState>
      ) : list.length === 0 ? (
        <EmptyState icon={<Search />} title="No hay conversaciones en esta vista">
          Iniciá una solicitud desde un perfil o producto para mantener el acuerdo organizado.
        </EmptyState>
      ) : (
        <div className="request-list">
          {list.map(thread => (
            <Link to={`/requests/${thread.id}/chat`} className="request-row" key={thread.id}>
              <div className="request-icon">
                <MessageCircle />
              </div>
              <div>
                <div className="request-meta">
                  <RequestStatusBadge status={thread.status as any} />
                  <time>{thread.dateLabel || new Date(thread.createdAt).toLocaleDateString("es-NI")}</time>
                </div>
                <h2>{thread.subject}</h2>
                <p>
                  {thread.providerDisplayName || "Proveedor"}
                  {thread.catalogItemId ? " · Producto" : ""} · {thread.messages.at(-1)?.text}
                </p>
              </div>
              <span className="button secondary">Abrir chat</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export function RequestDetailPage() {
  const { requestId } = useParams();
  const { user } = useAuthStore();
  const { getThread, currentThread, updateThread } = useQuotesStore();
  const { currentProvider, getProvider } = useProvidersStore();
  const [score, setScore] = useState(5);
  const [review, setReview] = useState("");
  const [isReviewing, setIsReviewing] = useState(false);
  const [myReview, setMyReview] = useState<{ id: string; score: number; comment: string | null; createdAt: string } | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editScore, setEditScore] = useState(5);
  const [editComment, setEditComment] = useState("");
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [editError, setEditError] = useState("");

  const thread = currentThread;
  const provider = currentProvider?.provider;

  useEffect(() => {
    if (requestId) {
      getThread(requestId);
    }
  }, [requestId, getThread]);

  useEffect(() => {
    if (thread?.providerId) {
      getProvider(thread.providerId);
    }
  }, [thread?.providerId, getProvider]);

  useEffect(() => {
    if (thread?.providerId && user?.id) {
      ratingApi.getVerifiedReviews(thread.providerId)
        .then(reviews => {
          const mine = reviews.find(r => r.requestId === thread.id && r.reviewerId === user.id);
          if (mine) setMyReview({ id: mine.id, score: mine.qualityScore, comment: mine.comment, createdAt: mine.createdAt });
        })
        .catch(() => {});
    }
  }, [thread?.providerId, thread?.id, user?.id]);

  const providerIdForUser = user?.providers?.[0]?.id || user?.providerProfileId;
  const isRequester = !!user && thread?.senderId === user.id;
  const isProviderParticipant = !!providerIdForUser && thread?.providerId === providerIdForUser;

  const handleConfirm = async (as: "requester" | "provider") => {
    if (!thread) return;
    try {
      if (as === "requester") {
        await updateThread(thread.id, { confirmedByRequesterAt: new Date().toISOString() });
      } else {
        await updateThread(thread.id, { confirmedByProviderAt: new Date().toISOString(), status: "COMPLETED" });
      }
    } catch (e) {
      console.error("Confirm error:", e);
    }
  };

  const handleClose = async () => {
    if (!thread) return;
    try {
      await updateThread(thread.id, {
        status: isProviderParticipant ? "CLOSED_PROVIDER" : "CLOSED_REQUESTER",
      });
    } catch (e) {
      console.error("Close error:", e);
    }
  };

  const handleAddReview = async (event: FormEvent) => {
    event.preventDefault();
    if (!thread || !user) return;
    setIsReviewing(true);
    try {
      const res = await fetch("/api/reviews", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          providerId: thread.providerId,
          requestId: thread.id,
          qualityScore: score,
          responseTimeScore: score,
          fulfillmentScore: score,
          communicationScore: score,
          valueScore: score,
          comment: review,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setReview("");
        setScore(5);
      }
    } catch (e) {
      console.error("Review error:", e);
    } finally {
      setIsReviewing(false);
    }
  };

  const handleEditReview = async (event: FormEvent) => {
    event.preventDefault();
    if (!myReview) return;
    setIsSavingEdit(true);
    setEditError("");
    try {
      await ratingApi.updateReview(myReview.id, {
        qualityScore: editScore,
        responseTimeScore: editScore,
        fulfillmentScore: editScore,
        communicationScore: editScore,
        valueScore: editScore,
        comment: editComment,
      });
      setMyReview({ id: myReview.id, score: editScore, comment: editComment, createdAt: myReview.createdAt });
      setIsEditing(false);
    } catch (e) {
      setEditError(e instanceof Error ? e.message : "Error al editar reseña");
    } finally {
      setIsSavingEdit(false);
    }
  };

  const canEditReview = !!myReview && Date.now() - new Date(myReview.createdAt).getTime() <= 7 * 24 * 60 * 60 * 1000;

  if (!requestId) {
    return (
      <EmptyState title="Solicitud no encontrada">
        Revisá el enlace o volvé a Mis solicitudes.
      </EmptyState>
    );
  }

  if (!thread) {
    return (
      <EmptyState title="Cargando...">
        Obteniendo detalles de la solicitud...
      </EmptyState>
    );
  }

  return (
    <div className="content-page">
      <Link to="/requests" className="back-link">
        <ArrowLeft /> Mis solicitudes
      </Link>
      <PageHeader
        eyebrow="Detalle de solicitud"
        title={thread.subject}
        description={`${provider?.displayName || "Proveedor"} · ${thread.catalogItemId ? "Producto" : "Solicitud general"} · ${thread.quotedPriceLabel || "Ubicación por acordar"}`}
        actions={
          <div className="page-actions">
            <RequestStatusBadge status={thread.status as any} />
            <Link className="button primary" to={`/requests/${thread.id}/chat`}>
              <MessageCircle /> Abrir conversación
            </Link>
          </div>
        }
      />
      <div className="detail-grid">
        <main>
          <section className="content-section">
            <h2>Necesidad compartida</h2>
            <p>{thread.messages.find(m => m.author === "client")?.text || "Sin descripción"}</p>
            {thread.quotedPriceLabel && (
              <div className="quote-detail">
                <strong>{thread.quotedPriceLabel}</strong>
                <span>Entrega: {thread.quotedDeliveryTime || "Por acordar"}</span>
              </div>
            )}
          </section>
          <section className="content-section">
            <h2>Resumen de conversación</h2>
            <p>{thread.messages.length} mensajes vinculados a esta solicitud.</p>
            <Link className="button secondary" to={`/requests/${thread.id}/chat`}>
              Ver todos los mensajes
            </Link>
          </section>
          {thread.status === "COMPLETED" && (
            <section className="content-section">
              <h2>Reseña del trabajo</h2>
              {myReview ? (
                isEditing ? (
                  <form onSubmit={handleEditReview}>
                    <div className="rating">
                      {[1, 2, 3, 4, 5].map(value => (
                        <button type="button" className={value <= editScore ? "active" : ""} onClick={() => setEditScore(value)} key={value}>
                          <Star />
                        </button>
                      ))}
                    </div>
                    <textarea
                      required
                      minLength={10}
                      value={editComment}
                      onChange={event => setEditComment(event.target.value)}
                      placeholder="¿Cómo fue trabajar con este proveedor?"
                    />
                    {editError && <p className="form-error">{editError}</p>}
                    <div className="stack-actions">
                      <button className="button primary" disabled={isSavingEdit}>
                        {isSavingEdit ? "Guardando..." : "Guardar cambios"}
                      </button>
                      <button type="button" className="button secondary" onClick={() => setIsEditing(false)}>
                        Cancelar
                      </button>
                    </div>
                  </form>
                ) : (
                  <>
                    <p className="success-note">
                      <CheckCircle2 /> Ya dejaste una reseña ({myReview.score} ★)
                      {!canEditReview && <span className="text-gray-400"> · La ventana de edición (7 días) ya cerró</span>}
                    </p>
                    {myReview.comment && <p>{myReview.comment}</p>}
                    {canEditReview && (
                      <button className="button secondary" onClick={() => { setEditScore(myReview.score); setEditComment(myReview.comment ?? ""); setIsEditing(true); }}>
                        <Star /> Editar reseña
                      </button>
                    )}
                  </>
                )
              ) : (
                <form onSubmit={handleAddReview}>
                  <p className="success-note">
                    <CheckCircle2 /> El trabajo fue completado. Podés dejar una reseña.
                  </p>
                  <div className="rating">
                    {[1, 2, 3, 4, 5].map(value => (
                      <button type="button" className={value <= score ? "active" : ""} onClick={() => setScore(value)} key={value}>
                        <Star />
                      </button>
                    ))}
                  </div>
                  <textarea
                    required
                    minLength={10}
                    value={review}
                    onChange={event => setReview(event.target.value)}
                    placeholder="¿Cómo fue trabajar con este proveedor?"
                  />
                  <button className="button primary" disabled={isReviewing}>
                    {isReviewing ? "Publicando..." : "Publicar reseña"}
                  </button>
                </form>
              )}
            </section>
          )}
        </main>
        <aside>
          <section className="content-section">
            <h2>Estado del acuerdo</h2>
            <div className="timeline">
              <div className="done">
                <CheckCircle2 />
                <span>
                  <strong>Solicitud enviada</strong>
                  {new Date(thread.createdAt).toLocaleDateString("es-NI")}
                </span>
              </div>
              <div className={thread.status !== "OPEN" ? "done" : ""}>
                <Circle />
                <span>
                  <strong>Conversación iniciada</strong>
                  Respuesta entre las partes
                </span>
              </div>
              <div className={["COMPLETED"].includes(thread.status) ? "done" : ""}>
                <Circle />
                <span>
                  <strong>Cotización</strong>
                  {thread.quotedPriceLabel || "Pendiente"}
                </span>
              </div>
              <div className={thread.confirmedByRequesterAt ? "done" : ""}>
                <Circle />
                <span>
                  <strong>Cliente confirmó</strong>
                  {thread.confirmedByRequesterAt ? "Registrado" : "Pendiente"}
                </span>
              </div>
              <div className={thread.confirmedByProviderAt ? "done" : ""}>
                <Circle />
                <span>
                  <strong>Proveedor confirmó</strong>
                  {thread.confirmedByProviderAt ? "Registrado" : "Pendiente"}
                </span>
              </div>
            </div>
            {thread.status !== "COMPLETED" && (
              <>
                <p className="form-note">
                  Esperando confirmación de la otra parte para completar la solicitud.
                </p>
                <div className="stack-actions">
                  <button
                    className="button primary"
                    disabled={!!thread.confirmedByRequesterAt || !isRequester}
                    onClick={() => handleConfirm("requester")}
                  >
                    Confirmar como cliente
                  </button>
                  <button
                    className="button secondary"
                    disabled={!!thread.confirmedByProviderAt || !isProviderParticipant}
                    onClick={() => handleConfirm("provider")}
                  >
                    Confirmar como proveedor
                  </button>
                  <button className="text-button danger" onClick={handleClose} disabled={!isRequester && !isProviderParticipant}>
                    Cerrar mi parte
                  </button>
                </div>
              </>
            )}
          </section>
          <section className="content-section">
            <h2>Participantes</h2>
            <p><UserRound /> {thread.clientName || "Cliente"}</p>
            <p><UserRound /> {provider?.displayName || "Proveedor"}</p>
          </section>
        </aside>
      </div>
    </div>
  );
}
