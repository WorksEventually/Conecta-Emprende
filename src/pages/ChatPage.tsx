import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import {
  AlertTriangle, ArrowLeft, BadgeCheck, Check, CheckCheck, ChevronDown,
  Circle, FileText, Flag, HandCoins, Info, MessageCircle, Search, Send, ShieldCheck,
  UserRound, X,
} from "lucide-react";
import { useAuthStore } from "../stores/auth-store";
import { useQuotesStore } from "../stores/quotes-store";
import { useProvidersStore } from "../stores/providers-store";
import { RequestStatusBadge } from "../components/mvp/Ui";

const quickReplies = {
  provider: [
    "Gracias por escribir. ¿Podés compartir cantidad y fecha deseada?",
    "Tengo disponibilidad esta semana.",
    "Puedo enviarte una cotización con precio y entrega.",
  ],
  requester: [
    "Quisiera una cotización detallada.",
    "Te comparto cantidad, medidas y fecha de entrega.",
    "¿Qué información necesitás para cotizar?",
  ],
};

export default function ChatPage() {
  const { requestId } = useParams();
  const { user } = useAuthStore();
  const {
    threads,
    currentThread,
    fetchMyThreads,
    clearThreads,
    getThread,
    addMessage,
    updateThread,
    isLoading,
  } = useQuotesStore();
  const { currentProvider, getProvider } = useProvidersStore();

  const [reply, setReply] = useState("");
  const [search, setSearch] = useState("");
  const [quoteOpen, setQuoteOpen] = useState(false);
  const [price, setPrice] = useState(currentThread?.quotedPriceLabel || "");
  const [delivery, setDelivery] = useState(currentThread?.quotedDeliveryTime || "");
  const [externalOpen, setExternalOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportText, setReportText] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  const thread = currentThread;
  const provider = currentProvider?.provider;
  const providerIdForUser = user?.providers?.[0]?.id || user?.providerProfileId;
  const isRequester = !!user && thread?.senderId === user.id;
  const isProviderParticipant = !!providerIdForUser && thread?.providerId === providerIdForUser;
  const actor: "provider" | "requester" = isProviderParticipant ? "provider" : "requester";

  useEffect(() => {
    if (!user) {
      clearThreads();
      return;
    }
    fetchMyThreads();
  }, [user?.id, fetchMyThreads, clearThreads]);

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
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [thread?.messages.length]);

  const conversations = threads
    .filter(item => {
      if (!search) return true;
      const providerName = item.providerDisplayName || "";
      return `${item.subject} ${providerName}`.toLowerCase().includes(search.toLowerCase());
    })
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!reply.trim() || !requestId) return;
    try {
      await addMessage(requestId, reply.trim());
      setReply("");
      // addMessage ya refresca el thread internamente; sin getThread
      // extra para evitar doble fetch y el parpadeo de carga.
    } catch (e) {
      console.error("Send message error:", e);
    }
  };

  const handleSubmitQuote = async (event: FormEvent) => {
    event.preventDefault();
    if (!price.trim() || !delivery.trim() || !requestId) return;
    try {
      await updateThread(requestId, {
        quotedPriceLabel: price.trim(),
        quotedDeliveryTime: delivery.trim(),
      });

      await addMessage(
        requestId,
        `📋 Cotización enviada:\n💰 Precio: ${price.trim()}\n📅 Tiempo de entrega: ${delivery.trim()}`
      );

      setQuoteOpen(false);
      await getThread(requestId);
    } catch (e) {
      console.error("Send quote error:", e);
    }
  };

  const handleAcceptQuotation = async () => {
    if (!requestId || !thread?.quotedPriceLabel) return;
    try {
      await fetch(`/api/quotes/${requestId}/accept-quotation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          price: thread.quotedPriceLabel,
          delivery: thread.quotedDeliveryTime,
        }),
      });

      await addMessage(
        requestId,
        `✅ El cliente aceptó la cotización: ${thread.quotedPriceLabel}`
      );

      await getThread(requestId);
    } catch (e) {
      console.error("Accept quotation error:", e);
    }
  };

  const handleConfirm = async (as: "requester" | "provider") => {
    if (!requestId) return;
    try {
      const role = as === "requester" ? "REQUESTER" : "PROVIDER";
      await fetch(`/api/quotes/${requestId}/complete`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      await getThread(requestId);
    } catch (e) {
      console.error("Confirm error:", e);
    }
  };

  const handleClose = async () => {
    if (!requestId || !user) return;
    try {
      const newStatus = isProviderParticipant ? "CLOSED_PROVIDER" : "CLOSED_REQUESTER";
      await updateThread(requestId, { status: newStatus });
      await getThread(requestId);
    } catch (e) {
      console.error("Close error:", e);
    }
  };

  if (!requestId) {
    return (
      <div className="content-page">
        <h1>Conversación no encontrada</h1>
        <Link className="button primary" to="/requests">Volver a solicitudes</Link>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="content-page">
        <div className="skeleton-list">
          <div className="skeleton-item skeleton-rect" style={{ height: 64, borderRadius: 12 }} />
          <div className="skeleton-item skeleton-rect" style={{ height: 200 }} />
          <div className="skeleton-item skeleton-rect" style={{ height: 80 }} />
        </div>
      </div>
    );
  }

  if (!thread) {
    return (
      <div className="content-page">
        <h1>Conversación no encontrada</h1>
        <Link className="button primary" to="/requests">Volver a solicitudes</Link>
      </div>
    );
  }

  const lastMessage = thread.messages.at(-1);
  const providerName = thread.providerDisplayName || "Proveedor";
  const clientName = thread.clientName || "Cliente";

  return (
    <div className="chat-page">
      <aside className="chat-conversations">
        <div className="chat-sidebar-head">
          <Link to="/requests" className="back-link">
            <ArrowLeft /> Solicitudes
          </Link>
          <h1>Conversaciones</h1>
          <p>Acuerdos vinculados a solicitudes</p>
        </div>
        <label className="chat-search">
          <Search />
          <input
            value={search}
            onChange={event => setSearch(event.target.value)}
            placeholder="Buscar conversación"
            maxLength={120}
          />
        </label>
        <nav className="conversation-list">
          {conversations.map(item => {
            const itemLastMsg = item.messages.at(-1);
            return (
              <Link
                key={item.id}
                to={`/requests/${item.id}/chat`}
                className={item.id === requestId ? "active" : ""}
              >
                <span className="conversation-avatar">
                  {(item.providerDisplayName || "PR").slice(0, 2).toUpperCase()}
                </span>
                <span className="conversation-copy">
                  <strong className="conversation-name" title={item.providerDisplayName || "Proveedor"}>{item.providerDisplayName || "Proveedor"}</strong>
                  <b className="conversation-subject" title={item.subject}>{item.subject}</b>
                  <small className="conversation-preview" title={itemLastMsg?.text || "Sin mensajes"}>{itemLastMsg?.text || "Sin mensajes"}</small>
                </span>
                <span className="conversation-meta">
                  <time>{item.dateLabel || new Date(item.createdAt).toLocaleDateString("es-NI", { day: "numeric", month: "short" })}</time>
                </span>
              </Link>
            );
          })}
        </nav>
      </aside>

      <main className="chat-thread">
        <header className="chat-thread-header">
          <div>
            <span className="conversation-avatar large">
              {providerName.slice(0, 2).toUpperCase()}
            </span>
            <span className="chat-header-copy">
              <strong className="chat-header-name" title={providerName}>{providerName}</strong>
              <small className="chat-header-subject" title={thread.subject}>
                {thread.subject}
                {thread.catalogItemId ? " · Producto" : ""}
              </small>
            </span>
          </div>
          <div className="chat-header-actions">
            <RequestStatusBadge status={thread.status as any} />
            <span className="chat-role-pill">
              Escribís como {actor === "provider" ? "proveedor" : "cliente"}
            </span>
            <button
              className="icon-button"
              onClick={() => setReportOpen(true)}
              aria-label="Reportar conversación"
            >
              <Flag />
            </button>
          </div>
        </header>

        <details className="chat-mobile-summary">
          <summary>Resumen de la solicitud <ChevronDown /></summary>
          <RequestSummaryUI
            thread={thread}
            providerName={providerName}
            canAccept={actor === "requester" && (!thread.acceptedQuotation || thread.acceptedQuotation.price !== thread.quotedPriceLabel)}
            onAcceptQuote={handleAcceptQuotation}
          />
        </details>

        <section className="retention-banner">
          <ShieldCheck />
          <div>
            <strong>Conversación protegida</strong>
            <p>
              Mantener el acuerdo acá permite dar seguimiento, confirmar el trabajo y desbloquear una reseña verificada.
            </p>
          </div>
        </section>

        <section className="message-stream" aria-live="polite">
          {thread.messages.map((message, idx) => (
            <article className="message-block-wrap" key={message.id || idx}>
              <MessageBlock
                message={message}
                providerName={providerName}
                requesterName={clientName}
              />
              {message.text.includes("📋 Cotización enviada") &&
                actor === "requester" &&
                (!thread.acceptedQuotation || 
                 thread.acceptedQuotation.price !== thread.quotedPriceLabel) && (
                  <button
                    className="button-inline small"
                    onClick={handleAcceptQuotation}
                    title="Registrar que estás de acuerdo con este precio"
                  >
                    👍 De acuerdo
                  </button>
                )}
            </article>
          ))}
          {thread.workflow_phase === "COMPLETION_PENDING" && thread.completionDeadline && (
            <section className="completion-banner warning">
              <Info size={20} />
              <div>
                <strong>Esperando confirmación de la otra parte</strong>
                <p>Plazo límite: {new Date(thread.completionDeadline).toLocaleString("es-NI", { dateStyle: "medium", timeStyle: "short" })}</p>
              </div>
            </section>
          )}

          {thread.workflow_phase === "CLOSED" && thread.closure_outcome && (
            <section className="completion-banner info">
              <CheckCheck size={20} />
              <div>
                <strong>Trabajo cerrado</strong>
                <p>{getClosureOutcomeMessage(thread.closure_outcome)}</p>
              </div>
            </section>
          )}

          <div ref={bottomRef} />
        </section>

        {(thread.workflow_phase === "OPEN" || thread.workflow_phase === "COMPLETION_PENDING") && (
          <footer className="chat-composer">
            <div className="quick-replies">
              {quickReplies[actor].map(text => (
                <button key={text} onClick={() => setReply(text)}>
                  {text}
                </button>
              ))}
            </div>
            <div className="chat-quick-actions">
              {actor === "provider" && (
                <button onClick={() => setQuoteOpen(!quoteOpen)}>
                  <HandCoins /> Enviar precio estimado
                </button>
              )}
              <button
                onClick={() => addMessage(requestId, actor === "provider" ? "¿Podés compartir cantidad, medidas y fecha deseada?" : "Te comparto los detalles necesarios para preparar la cotización.")}
              >
                <FileText /> {actor === "provider" ? "Pedir más detalles" : "Enviar detalles"}
              </button>
              <button onClick={() => handleConfirm(actor === "provider" ? "provider" : "requester")}>
                <CheckCheck /> Confirmar trabajo
              </button>
              <button onClick={() => setExternalOpen(true)}>
                <AlertTriangle /> Contacto externo
              </button>
            </div>

            {quoteOpen && (
              <form className="quote-composer" onSubmit={handleSubmitQuote}>
                <div>
                  <strong>Enviar cotización en la conversación</strong>
                  <small>El precio y entrega quedarán vinculados a la solicitud.</small>
                </div>
                <input
                  required
                  value={price}
                  onChange={event => setPrice(event.target.value)}
                  placeholder="Ej. C$1,200"
                  maxLength={80}
                />
                <input
                  required
                  value={delivery}
                  onChange={event => setDelivery(event.target.value)}
                  placeholder="Ej. 5 días"
                  maxLength={80}
                />
                <button className="button primary">
                  <Send /> Enviar cotización
                </button>
              </form>
            )}

            <form className="message-composer" onSubmit={handleSubmit}>
              <textarea
                value={reply}
                onChange={event => setReply(event.target.value)}
                placeholder="Escribí un mensaje con los detalles del acuerdo…"
                rows={2}
                maxLength={2000}
              />
              <button className="button primary" disabled={!reply.trim()} aria-label="Enviar mensaje">
                <Send /> Enviar
              </button>
            </form>
          </footer>
        )}
      </main>

      <aside className="chat-context">
        <RequestSummaryUI
          thread={thread}
          providerName={providerName}
          canAccept={actor === "requester" && (!thread.acceptedQuotation || thread.acceptedQuotation.price !== thread.quotedPriceLabel)}
          onAcceptQuote={handleAcceptQuotation}
        />
        <section className="chat-context-section">
          <h2>Próxima acción</h2>
          {thread.workflow_phase === "OPEN" && (
            <p>
              {thread.quotedPriceLabel
                ? "Definan los detalles finales y confirmen cuando el trabajo termine."
                : "Definan precio, alcance y fecha de entrega."}
            </p>
          )}
          {thread.workflow_phase === "COMPLETION_PENDING" && (
            <p>
              Confirmación pendiente. La otra parte tiene hasta{" "}
              {thread.completionDeadline
                ? new Date(thread.completionDeadline).toLocaleDateString("es-NI", {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit"
                  })
                : "72 horas"}{" "}
              para confirmar.
            </p>
          )}
          {thread.workflow_phase === "CLOSED" && thread.closure_outcome === "BILATERAL" && (
            <p className="success-note">
              <BadgeCheck /> Reseña verificada desbloqueada.
            </p>
          )}
          {thread.workflow_phase === "CLOSED" && thread.closure_outcome !== "BILATERAL" && (
            <p>Trabajo cerrado: {getClosureOutcomeMessage(thread.closure_outcome)}</p>
          )}
        </section>
        <section className="chat-context-section">
          <h2>Confirmación bilateral</h2>
          <div className="confirmation-row">
            <span className={thread.confirmedByRequesterAt ? "done" : ""}>
              {thread.confirmedByRequesterAt ? <Check /> : <Circle />} Cliente
            </span>
            <span className={thread.confirmedByProviderAt ? "done" : ""}>
              {thread.confirmedByProviderAt ? <Check /> : <Circle />} Proveedor
            </span>
          </div>
          {(thread.workflow_phase === "OPEN" || thread.workflow_phase === "COMPLETION_PENDING") && (
            <>
              <button
                className="button secondary full"
                disabled={!!thread.confirmedByRequesterAt}
                onClick={() => handleConfirm("requester")}
              >
                Confirmar como cliente
              </button>
              <button
                className="button secondary full"
                disabled={!!thread.confirmedByProviderAt}
                onClick={() => handleConfirm("provider")}
              >
                Confirmar como proveedor
              </button>
              <button className="text-button danger" onClick={handleClose}>
                Cerrar solicitud
              </button>
            </>
          )}
        </section>
      </aside>

      {externalOpen && (
        <div className="dialog-backdrop">
          <section className="dialog">
            <div className="dialog-head">
              <div>
                <span className="eyebrow">Protegé tu historial</span>
                <h2>¿Salir de la conversación?</h2>
              </div>
              <button onClick={() => setExternalOpen(false)}><X /></button>
            </div>
            <p>
              Podés continuar fuera de la app, pero esa conversación no contará para solicitudes completadas, reputación ni reseñas verificadas.
            </p>
            <button className="button primary" onClick={() => setExternalOpen(false)}>
              Seguir en la app
            </button>
            <button className="button secondary" disabled>
              Contacto externo no disponible para el MVP
            </button>
          </section>
        </div>
      )}

      {reportOpen && (
        <div className="dialog-backdrop">
          <form
            className="dialog"
            onSubmit={event => {
              event.preventDefault();
              setReportOpen(false);
              setReportText("");
            }}
          >
            <div className="dialog-head">
              <div>
                <span className="eyebrow">Revisión humana</span>
                <h2>Reportar conversación</h2>
              </div>
              <button type="button" onClick={() => setReportOpen(false)}><X /></button>
            </div>
            <textarea
              required
              minLength={10}
              maxLength={1000}
              value={reportText}
              onChange={event => setReportText(event.target.value)}
              placeholder="Explicá qué ocurrió"
            />
            <button className="button primary">
              <Flag /> Enviar reporte
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

function MessageBlock({
  message,
  providerName,
  requesterName,
}: {
  message: { id?: string; authorRole?: string; author?: string; body?: string; text?: string; time?: string; createdAt?: string };
  providerName: string;
  requesterName: string;
}) {
  const role = message.authorRole || message.author || "client";
  const text = message.body || message.text || "";
  const time = message.time || (message.createdAt ? new Date(message.createdAt).toLocaleTimeString("es-NI", { hour: "2-digit", minute: "2-digit" }) : "");

  if (role === "system") {
    return (
      <article className="system-message type-quote">
        <Info />
        <div>
          <strong>Información</strong>
          <p>{text}</p>
        </div>
      </article>
    );
  }

  return (
    <article className={`chat-message ${role === "provider" ? "provider" : "client"}`}>
      <div className="message-author">
        <strong className="message-author-name" title={role === "provider" ? providerName : requesterName}>
          {role === "provider" ? providerName : requesterName}
        </strong>
        <time>{time}</time>
      </div>
      <p className="message-text">{text}</p>
    </article>
  );
}

function getClosureOutcomeMessage(outcome: string): string {
  const messages: Record<string, string> = {
    BILATERAL: "Ambas partes confirmaron el trabajo completado.",
    REQUESTER_CONFIRMED_PROVIDER_NO_RESPONSE: "El cliente confirmó pero el proveedor no respondió dentro de 72 horas.",
    PROVIDER_CLAIMED_REQUESTER_NO_RESPONSE: "El proveedor confirmó pero el cliente no respondió dentro de 72 horas.",
    CANCELLED_BY_REQUESTER: "Cancelado por el cliente.",
    CANCELLED_BY_PROVIDER: "Cancelado por el proveedor.",
    CANCELLED_BY_PROVIDER_AFTER_ENGAGEMENT: "El proveedor canceló después de interactuar. Podés dejar una reseña calificada.",
    MODERATION_CLOSURE: "Cerrado por moderación.",
  };
  return messages[outcome] || "Cerrado.";
}

function RequestSummaryUI({
  thread,
  providerName,
  onAcceptQuote,
  canAccept,
}: {
  thread: { id?: string; subject?: string; body?: string; quotedPriceLabel?: string | null; quotedDeliveryTime?: string | null; status?: string; createdAt?: string };
  providerName: string;
  onAcceptQuote?: () => void;
  canAccept?: boolean;
}) {
  const clientMsg = thread.body;
  return (
    <section className="chat-context-section request-summary">
      <span className="eyebrow">Solicitud vinculada</span>
      <h2 className="request-summary-title" title={thread.subject}>{thread.subject}</h2>
      <p>{clientMsg || "Sin descripción"}</p>
      <dl>
        <div>
          <dt>Proveedor</dt>
          <dd className="text-truncate" title={providerName}>{providerName}</dd>
        </div>
        <div>
          <dt>Estado</dt>
          <dd><RequestStatusBadge status={(thread.status as any) || "OPEN"} /></dd>
        </div>
        {thread.quotedPriceLabel && (
          <div>
            <dt>Cotización</dt>
            <dd>{thread.quotedPriceLabel}</dd>
          </div>
        )}
        {thread.quotedDeliveryTime && (
          <div>
            <dt>Entrega</dt>
            <dd>{thread.quotedDeliveryTime}</dd>
          </div>
        )}
      </dl>
      {canAccept && onAcceptQuote && (
        <button className="button secondary small full" onClick={onAcceptQuote}>
          👍 De acuerdo con este precio
        </button>
      )}
      <Link className="text-link" to={`/requests/${thread.id}`}>Ver detalle completo</Link>
    </section>
  );
}
