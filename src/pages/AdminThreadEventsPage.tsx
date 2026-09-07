import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Clock, User, ChevronDown, ChevronUp, ShieldAlert } from "lucide-react";
import { adminApi, type RequestEvent, type RequestEventType } from "../api/adminApi";
import { EmptyState, PageHeader } from "../components/mvp/Ui";
import { useAuthStore } from "../stores/auth-store";

const eventTypeLabels: Record<RequestEventType, string> = {
  REQUEST_CREATED: "Solicitud creada",
  PROVIDER_RESPONDED: "Proveedor respondió",
  QUOTE_ACCEPTED: "Cotización aceptada",
  COMPLETION_REQUESTED: "Cierre solicitado",
  COMPLETION_CONFIRMED: "Cierre confirmado",
  COMPLETION_TIMEOUT: "Timeout de cierre",
  CANCELLED_BY_REQUESTER: "Cancelada por solicitante",
  CANCELLED_BY_PROVIDER: "Cancelada por proveedor",
  MODERATION_FLAG: "Marcada por moderación",
  MODERATION_CLOSURE: "Cerrada por moderación",
  REOPENED: "Reabierta",
  MESSAGE_SENT: "Mensaje enviado",
  DEADLINE_EXTENDED: "Plazo extendido",
  ADMIN_OVERRIDE: "Intervención admin",
};

const eventTypeOptions: Array<RequestEventType | ""> = [
  "",
  "REQUEST_CREATED",
  "PROVIDER_RESPONDED",
  "QUOTE_ACCEPTED",
  "COMPLETION_REQUESTED",
  "COMPLETION_CONFIRMED",
  "COMPLETION_TIMEOUT",
  "CANCELLED_BY_REQUESTER",
  "CANCELLED_BY_PROVIDER",
  "MODERATION_FLAG",
  "MODERATION_CLOSURE",
  "REOPENED",
  "MESSAGE_SENT",
  "DEADLINE_EXTENDED",
  "ADMIN_OVERRIDE",
];

export default function AdminThreadEventsPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const roles = new Set([user?.role, ...(user?.roleLabels ?? [])].filter(Boolean));
  const canReview = roles.has("ADMIN") || roles.has("ADMIN_REVIEWER") || roles.has("SUPER_ADMIN");

  const [filter, setFilter] = useState<RequestEventType | "">("");
  const [events, setEvents] = useState<RequestEvent[]>([]);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    if (!canReview || !id) return;
    setLoading(true);
    setError(null);
    try {
      const nextEvents = await adminApi.getThreadEvents(id, filter || undefined);
      setEvents(nextEvents);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [filter, canReview, id]);

  function toggleExpanded(eventId: string) {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(eventId)) {
        next.delete(eventId);
      } else {
        next.add(eventId);
      }
      return next;
    });
  }

  if (!canReview) {
    return (
      <div className="content-page">
        <EmptyState icon={<ShieldAlert />} title="No autorizado">
          Tu cuenta no tiene permisos para revisar eventos de threads.
        </EmptyState>
      </div>
    );
  }

  return (
    <div className="content-page">
      <PageHeader
        eyebrow="Administración"
        title={`Historial de eventos - Thread ${id?.slice(0, 8)}`}
        description="Timeline completo de eventos inmutables del thread para auditoría y debugging."
        actions={
          <>
            <button className="button secondary" onClick={() => navigate(-1)}>
              Volver
            </button>
            <label>
              Filtrar por tipo
              <select value={filter} onChange={event => setFilter(event.target.value as RequestEventType | "")}>
                {eventTypeOptions.map(value => (
                  <option value={value} key={value || "all"}>{value ? eventTypeLabels[value] : "Todos los tipos"}</option>
                ))}
              </select>
            </label>
          </>
        }
      />

      {error && <p className="field-error" role="alert">{error}</p>}

      {loading ? (
        <EmptyState title="Cargando eventos">Consultando historial desde la base de datos.</EmptyState>
      ) : events.length === 0 ? (
        <EmptyState icon={<Clock />} title="No hay eventos">
          {filter ? "No hay eventos del tipo seleccionado para este thread." : "Este thread no tiene eventos registrados."}
        </EmptyState>
      ) : (
        <section className="content-section">
          <div className="admin-events-timeline">
            {events.map((event, index) => {
              const isExpanded = expandedIds.has(event.id);
              const hasMetadata = event.metadataJson && Object.keys(event.metadataJson).length > 0;

              return (
                <article key={event.id} className="event-card">
                  <div className="event-header">
                    <div className="event-meta">
                      <span className="event-index">#{index + 1}</span>
                      <span className="event-type">{eventTypeLabels[event.eventType]}</span>
                      {event.completionCycleNo > 0 && (
                        <span className="event-cycle">Ciclo {event.completionCycleNo}</span>
                      )}
                    </div>
                    <time className="event-time">
                      {new Date(event.occurredAt).toLocaleString("es-NI", {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit",
                      })}
                    </time>
                  </div>

                  <div className="event-details">
                    <div className="event-actor">
                      <User size={16} />
                      {event.actor ? (
                        <span>
                          {event.actor.name || event.actor.email}
                          <small>{event.actor.email}</small>
                        </span>
                      ) : (
                        <span className="system-actor">Sistema</span>
                      )}
                    </div>

                    <div className="event-ids">
                      <small>
                        ID: <code>{event.id}</code>
                      </small>
                      <small>
                        Idempotency: <code>{event.idempotencyKey.slice(0, 16)}...</code>
                      </small>
                    </div>
                  </div>

                  {hasMetadata && (
                    <div className="event-metadata">
                      <button
                        className="metadata-toggle"
                        onClick={() => toggleExpanded(event.id)}
                        aria-expanded={isExpanded}
                      >
                        <span>Metadata JSON</span>
                        {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      </button>

                      {isExpanded && (
                        <pre className="metadata-content">
                          {JSON.stringify(event.metadataJson, null, 2)}
                        </pre>
                      )}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
