import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import {
  Send, Clock, CheckCircle, ChevronLeft, Paperclip, MoreVertical, Search,
  Smile, Reply, MoreHorizontal, Check, CheckCheck, ArrowDown, X, MessageSquare,
  Sparkles,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { EmptyState } from "../components/mvp/Ui";
import {
  getAvatarGradient, getInitials, formatDayLabel, shortTime,
  groupMessagesByDay, type GroupableMessage,
} from "../lib/chat-helpers";
import "./QuotesPage.css";

// ============================================================
// Types
// ============================================================

interface ChatMessage extends GroupableMessage {
  id: string;
  author: string;
  text: string;
  time: string;
  reactions?: Record<string, string[]>; // emoji -> array of reactor names
  replyTo?: { id: string; author: string; text: string } | null;
  read?: boolean;
  edited?: boolean;
}

interface Thread {
  id: string;
  providerId: string;
  subject: string;
  clientName: string;
  clientAvatar: string;
  status: string;
  workflow_phase?: string;
  closure_outcome?: string | null;
  completionDeadline?: string | null;
  date: string;
  messages: ChatMessage[];
  unread?: number;
}

// ============================================================
// Constants
// ============================================================

const QUICK_REACTION_EMOJIS = ["👍", "❤️", "😂", "🙏", "👏"];

const QUICK_REPLY_SUGGESTIONS = [
  "¡Hola! Gracias por tu mensaje. ¿Podrías darme más detalles?",
  "Claro, podemos coordinar. ¿Te parece bien una propuesta inicial esta semana?",
  "Te envío una cotización con los detalles en breve.",
];

// ============================================================
// Component
// ============================================================

export default function QuotesPage() {
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [reply, setReply] = useState("");
  const [search, setSearch] = useState("");
  const [isDesktop, setIsDesktop] = useState(
    typeof window !== "undefined" ? window.innerWidth >= 768 : true
  );
  const queryClient = useQueryClient();

  // New chat UX state
  const [replyingTo, setReplyingTo] = useState<ChatMessage | null>(null);
  const [typingClientId, setTypingClientId] = useState<string | null>(null);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [openReactionFor, setOpenReactionFor] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ----------------------------------------------------------
  // Track viewport size so the threads sidebar visibility reacts to resize.
  // ----------------------------------------------------------
  useEffect(() => {
    const onResize = () => setIsDesktop(window.innerWidth >= 768);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // ----------------------------------------------------------
  // Fetch all threads for this provider.
  // The server returns messages in chronological order.
  // We attach `createdAt` (Date.now() - index*60000) client-side so the
  // grouping logic can work even when the server only returns "10:00 AM" strings.
  // ----------------------------------------------------------
  const { data: threads = [], isLoading } = useQuery<Thread[]>({
    queryKey: ['quotes'],
    queryFn: async () => {
      const res = await fetch('/api/quotes');
      const json = await res.json();
      const raw: Thread[] = json.data || [];
      // Decorate messages with createdAt for grouping + a synthetic reaction store.
      return raw.map(t => ({
        ...t,
        messages: t.messages.map((m, i) => ({
          ...m,
          createdAt: new Date(Date.now() - (t.messages.length - i) * 60_000).toISOString(),
          reactions: (m as any).reactions || {},
          replyTo: (m as any).replyTo || null,
          read: m.author === 'provider' ? true : (i < t.messages.length - 1),
          edited: false,
        })),
      }));
    },
  });

  const activeThread = threads.find((t) => t.id === activeThreadId) || null;

  // Auto-select first thread on desktop
  useEffect(() => {
    if (threads.length > 0 && !activeThreadId && isDesktop) {
      setActiveThreadId(threads[0].id);
    }
  }, [threads, activeThreadId, isDesktop]);

  // ----------------------------------------------------------
  // Send message mutation — optimistically appends to the active thread,
  // then simulates a "typing" indicator from the client before the
  // provider's reply would (in a real app) arrive.
  // ----------------------------------------------------------
  const sendMutation = useMutation({
    mutationFn: async ({ threadId, text, replyTo }: { threadId: string; text: string; replyTo?: ChatMessage["replyTo"] }) => {
      const res = await fetch(`/api/quotes/${threadId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          author: 'provider',
          text,
          replyTo,
        }),
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quotes'] });
    },
  });

  const closeMutation = useMutation({
    mutationFn: async (threadId: string) => {
      const res = await fetch(`/api/quotes/${threadId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'CLOSED' }),
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quotes'] });
    },
  });

  const completeMutation = useMutation({
    mutationFn: async (threadId: string) => {
      const res = await fetch(`/api/quotes/${threadId}/complete`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: 'PROVIDER' }),
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quotes'] });
    },
  });

  // ----------------------------------------------------------
  // Local message-state mutations (reactions, edited, read).
  // We update the React Query cache directly so the UI updates instantly
  // without round-tripping to the server (the memory-db backend doesn't
  // support these fields yet — this is a forward-compatible UX layer).
  // ----------------------------------------------------------
  const patchMessage = useCallback((threadId: string, msgId: string, patch: Partial<ChatMessage>) => {
    queryClient.setQueryData<Thread[]>(['quotes'], (old) => {
      if (!old) return old;
      return old.map(t => {
        if (t.id !== threadId) return t;
        return {
          ...t,
          messages: t.messages.map(m => (m.id === msgId ? { ...m, ...patch } : m)),
        };
      });
    });
  }, [queryClient]);

  const toggleReaction = useCallback((threadId: string, msgId: string, emoji: string) => {
    queryClient.setQueryData<Thread[]>(['quotes'], (old) => {
      if (!old) return old;
      return old.map(t => {
        if (t.id !== threadId) return t;
        return {
          ...t,
          messages: t.messages.map(m => {
            if (m.id !== msgId) return m;
            const reactions = { ...(m.reactions || {}) };
            const reactors = reactions[emoji] || [];
            const me = "Tú";
            if (reactors.includes(me)) {
              const next = reactors.filter(r => r !== me);
              if (next.length === 0) delete reactions[emoji];
              else reactions[emoji] = next;
            } else {
              reactions[emoji] = [...reactors, me];
            }
            return { ...m, reactions };
          }),
        };
      });
    });
  }, [queryClient]);

  // ----------------------------------------------------------
  // Auto-scroll to bottom when active thread changes or new messages arrive.
  // But only if the user is already near the bottom (don't yank them up
  // while they're reading older messages).
  // ----------------------------------------------------------
  const scrollToBottom = useCallback((behavior: 'smooth' | 'auto' = 'smooth') => {
    messagesEndRef.current?.scrollIntoView({ behavior, block: 'end' });
  }, []);

  const isNearBottom = useCallback(() => {
    const el = messagesContainerRef.current;
    if (!el) return true;
    const threshold = 100;
    return el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
  }, []);

  const handleScroll = useCallback(() => {
    const el = messagesContainerRef.current;
    if (!el) return;
    const nearBottom = isNearBottom();
    setShowScrollToBottom(!nearBottom);
    if (nearBottom) setUnreadCount(0);
  }, [isNearBottom]);

  useEffect(() => {
    if (activeThread) {
      // Slight delay so the messages container has its new content before scrolling.
      const t = setTimeout(() => scrollToBottom('auto'), 50);
      return () => clearTimeout(t);
    }
  }, [activeThreadId, activeThread?.messages.length, scrollToBottom]);

  // ----------------------------------------------------------
  // Send message handler — also clears the reply preview.
  // ----------------------------------------------------------
  const handleSend = useCallback(() => {
    if (!activeThread || !reply.trim() || activeThread.status === 'CLOSED') return;

    const replyToPayload = replyingTo
      ? { id: replyingTo.id, author: replyingTo.author, text: replyingTo.text }
      : null;

    sendMutation.mutate({ threadId: activeThread.id, text: reply, replyTo: replyToPayload });
    setReply("");
    setReplyingTo(null);

    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }

    // Simulate the client starting to type a follow-up (creates the typing
    // indicator effect — in a real app this would come from a websocket).
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    typingTimerRef.current = setTimeout(() => {
      setTypingClientId(activeThread.id);
      // Auto-clear the typing indicator after 2.5s
      setTimeout(() => setTypingClientId(null), 2500);
    }, 1200);
  }, [activeThread, reply, replyingTo, sendMutation]);

  const handleQuickReply = useCallback((text: string) => {
    if (!activeThread || activeThread.status === 'CLOSED') return;
    setReply(text);
    textareaRef.current?.focus();
  }, [activeThread]);

  // Close reaction popover on outside click
  useEffect(() => {
    if (!openReactionFor) return;
    const handler = () => setOpenReactionFor(null);
    window.addEventListener('click', handler);
    return () => window.removeEventListener('click', handler);
  }, [openReactionFor]);

  // ----------------------------------------------------------
  // Filtered threads (search by client name or subject)
  // ----------------------------------------------------------
  const filteredThreads = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return threads;
    return threads.filter(t =>
      t.clientName.toLowerCase().includes(q) ||
      t.subject.toLowerCase().includes(q)
    );
  }, [threads, search]);

  // ----------------------------------------------------------
  // Group messages by day + author (Discord-style)
  // ----------------------------------------------------------
  const groupedMessages = useMemo(() => {
    if (!activeThread) return [];
    return groupMessagesByDay<ChatMessage>(activeThread.messages);
  }, [activeThread]);

  if (isLoading) {
    return (
      <div className="chat-loading-state">
        <span>Cargando sala de chat...</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col md:flex-row h-full w-full bg-slate-50 overflow-hidden relative">
      {/* ============================================================ */}
      {/* Threads List Sidebar                                          */}
      {/* ============================================================ */}
      <AnimatePresence initial={false}>
        {(!activeThread || isDesktop) && (
          <motion.div
            initial={{ x: -300, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -300, opacity: 0 }}
            transition={{ type: "spring", bounce: 0, duration: 0.4 }}
            className="w-full md:w-[350px] lg:w-[400px] h-full bg-white border-r border-slate-200 flex flex-col shrink-0 z-20 absolute md:static"
          >
            <div className="p-5 border-b border-slate-100 flex-shrink-0">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight">Cotizaciones</h2>
                <span className="text-xs font-bold text-slate-500 bg-slate-100 px-2.5 py-1 rounded-full">
                  {threads.length} {threads.length === 1 ? "conversación" : "conversaciones"}
                </span>
              </div>
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Buscar mensajes..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 pl-10 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto w-full">
              {filteredThreads.length === 0 ? (
                <div className="chat-empty-state">
                  <div className="chat-empty-icon">
                    <Search />
                  </div>
                  <p className="chat-empty-title">Sin resultados</p>
                  <p className="chat-empty-text">Probá con otro término de búsqueda</p>
                </div>
              ) : (
                filteredThreads.map((thread) => (
                  <button
                    key={thread.id}
                    onClick={() => {
                      setActiveThreadId(thread.id);
                      setUnreadCount(0);
                    }}
                    className={`thread-item w-full text-left p-5 transition-all outline-none border-l-4 ${
                      activeThread?.id === thread.id
                        ? 'bg-blue-50/60 border-blue-600'
                        : 'border-transparent hover:bg-slate-50 focus-visible:bg-slate-50'
                    } ${thread.unread ? 'unread' : ''}`}
                  >
                    <div className="flex justify-between items-start mb-1.5">
                      <div className="flex items-center gap-3">
                        <div
                          className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold shrink-0 text-white"
                          style={{
                            background: `linear-gradient(135deg, ${getAvatarGradient(thread.clientName).from} 0%, ${getAvatarGradient(thread.clientName).to} 100%)`,
                          }}
                        >
                          {getInitials(thread.clientName)}
                        </div>
                        <div>
                          <div className="font-bold text-slate-900 text-[15px]">{thread.clientName}</div>
                          <div className="text-xs font-semibold text-slate-500">{thread.date}</div>
                        </div>
                      </div>
                    </div>
                    <div className="pl-13">
                      <div className="text-sm font-semibold text-slate-700 truncate mb-1.5">{thread.subject}</div>
                      <div className="text-xs text-slate-500 truncate max-w-full">
                        {thread.messages[thread.messages.length - 1]?.text}
                      </div>
                      <div className="mt-3">
                        {thread.status === 'OPEN'
                          ? <span className="inline-flex items-center gap-1 text-[11px] font-bold text-orange-700 bg-orange-100/80 px-2.5 py-1 rounded-full"><Clock className="w-3 h-3"/> Activo</span>
                          : <span className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-600 bg-slate-100 px-2.5 py-1 rounded-full"><CheckCircle className="w-3 h-3"/> Cerrado</span>
                        }
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ============================================================ */}
      {/* Main Chat Area                                                */}
      {/* ============================================================ */}
      <div className={`flex-1 flex flex-col bg-[#F8FAFC] h-full ${!activeThread ? 'hidden md:flex' : 'flex'} relative z-10 w-full`}>
        {activeThread ? (
          <>
            {/* Chat Header */}
            <header className="px-6 py-4 bg-white/90 backdrop-blur-md border-b border-slate-200 flex justify-between items-center shrink-0 sticky top-0 z-20 shadow-sm">
              <div className="flex items-center gap-4 min-w-0">
                <button
                  onClick={() => setActiveThreadId(null)}
                  className="md:hidden w-10 h-10 flex items-center justify-center rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors shrink-0"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-white shrink-0"
                    style={{
                      background: `linear-gradient(135deg, ${getAvatarGradient(activeThread.clientName).from} 0%, ${getAvatarGradient(activeThread.clientName).to} 100%)`,
                    }}
                  >
                    {getInitials(activeThread.clientName)}
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-bold text-lg text-slate-900 leading-tight truncate">
                      {activeThread.clientName}
                    </h3>
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <span className={`conn-status ${activeThread.status === 'OPEN' ? 'online' : 'offline'}`}>
                        <span className="conn-status-dot"></span>
                        {activeThread.status === 'OPEN' ? 'En línea' : 'Desconectado'}
                      </span>
                      <span className="text-slate-300">·</span>
                      <span className="text-slate-500 truncate">{activeThread.subject}</span>
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {(activeThread.workflow_phase === 'OPEN' || activeThread.workflow_phase === 'COMPLETION_PENDING') && (
                  <button
                    onClick={() => completeMutation.mutate(activeThread.id)}
                    disabled={completeMutation.isPending}
                    className="text-sm font-bold text-white px-4 py-2 rounded-full bg-[var(--brand)] hover:opacity-90 transition-colors disabled:opacity-50"
                  >
                    {completeMutation.isPending ? "Confirmando..." : "Confirmar trabajo completado"}
                  </button>
                )}
                <button className="w-10 h-10 rounded-full flex items-center justify-center text-slate-400 hover:bg-slate-100 transition-colors">
                  <MoreVertical className="w-5 h-5" />
                </button>
              </div>
            </header>

            {/* Chat Messages */}
            <div
              ref={messagesContainerRef}
              onScroll={handleScroll}
              className="flex-1 overflow-y-auto px-6 py-6 space-y-1 relative scroll-smooth"
            >
              {groupedMessages.map((day) => (
                <div key={day.dayKey}>
                  {/* Day separator */}
                  <div className="day-separator">
                    <span className="day-separator-pill">{day.dayLabel}</span>
                  </div>

                  {/* Message groups */}
                  <div className="space-y-3">
                    {day.groups.map((group, gi) => {
                      const isMe = group.author === 'provider';
                      const authorName = isMe ? 'Tú' : activeThread.clientName;
                      const gradient = getAvatarGradient(authorName);

                      return (
                        <div
                          key={`${day.dayKey}-${gi}`}
                          className={`msg-group msg-enter ${isMe ? 'from-me' : ''}`}
                        >
                          {/* Avatar (placeholder for grouped messages) */}
                          <div
                            className={`msg-group-avatar ${gi > 0 && day.groups[gi - 1].author === group.author ? 'placeholder' : ''}`}
                            style={{
                              background: `linear-gradient(135deg, ${gradient.from} 0%, ${gradient.to} 100%)`,
                            }}
                          >
                            {getInitials(authorName)}
                          </div>

                          <div className="msg-stack">
                            {group.messages.map((msg, mi) => {
                              const isFirstInGroup = mi === 0;
                              const isLastInGroup = mi === group.messages.length - 1;
                              const reactions: Record<string, string[]> = msg.reactions || {};
                              const reactionEntries = Object.entries(reactions);

                              return (
                                <div
                                  key={msg.id}
                                  className="msg-bubble-wrapper"
                                >
                                  {/* Hover toolbar (react / reply / more) */}
                                  {activeThread.status === 'OPEN' && (
                                    <div className="msg-toolbar">
                                      <button
                                        className="msg-toolbar-btn"
                                        title="Reaccionar"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setOpenReactionFor(openReactionFor === msg.id ? null : msg.id);
                                        }}
                                      >
                                        <Smile />
                                      </button>
                                      <button
                                        className="msg-toolbar-btn"
                                        title="Responder"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setReplyingTo(msg);
                                        }}
                                      >
                                        <Reply />
                                      </button>
                                      <button
                                        className="msg-toolbar-btn"
                                        title="Más"
                                        onClick={(e) => e.stopPropagation()}
                                      >
                                        <MoreHorizontal />
                                      </button>

                                      {/* Reaction popover */}
                                      <div
                                        className={`reaction-popover ${openReactionFor === msg.id ? 'open' : ''}`}
                                        onClick={(e) => e.stopPropagation()}
                                      >
                                        {QUICK_REACTION_EMOJIS.map(emoji => (
                                          <button
                                            key={emoji}
                                            title={emoji}
                                            onClick={() => {
                                              toggleReaction(activeThread.id, msg.id, emoji);
                                              setOpenReactionFor(null);
                                            }}
                                          >
                                            {emoji}
                                          </button>
                                        ))}
                                      </div>
                                    </div>
                                  )}

                                  {/* Header (author + time) — only on first message of group */}
                                  {isFirstInGroup && (
                                    <div className="msg-header">
                                      <span className="msg-author">{authorName}</span>
                                      <span className="msg-time">{shortTime(msg.time)}</span>
                                    </div>
                                  )}

                                  {/* Bubble */}
                                  <div
                                    className={`msg-bubble ${isMe ? 'from-me' : 'from-them'} ${!isFirstInGroup ? 'grouped' : ''}`}
                                  >
                                    {/* Reply quote (if this message is replying to another) */}
                                    {msg.replyTo && (
                                      <div
                                        className="reply-quote"
                                        onClick={() => {
                                          // Scroll to the quoted message if it exists in this thread
                                          const target = activeThread.messages.find(m => m.id === msg.replyTo!.id);
                                          if (target) {
                                            const el = document.getElementById(`msg-${target.id}`);
                                            el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                            el?.classList.add('ring-2', 'ring-blue-400');
                                            setTimeout(() => el?.classList.remove('ring-2', 'ring-blue-400'), 1500);
                                          }
                                        }}
                                      >
                                        <div className="reply-quote-content">
                                          <div className="reply-quote-author">
                                            {msg.replyTo.author === 'provider' ? 'Tú' : activeThread.clientName}
                                          </div>
                                          <div className="reply-quote-text">{msg.replyTo.text}</div>
                                        </div>
                                      </div>
                                    )}

                                    {msg.text}
                                  </div>

                                  {/* Reactions row (Slack-style pills below bubble) */}
                                  {reactionEntries.length > 0 && (
                                    <div className="reactions-row">
                                      {reactionEntries.map(([emoji, reactors]) => {
                                        const mine = reactors.includes("Tú");
                                        return (
                                          <button
                                            key={emoji}
                                            className={`reaction-pill ${mine ? 'mine' : ''}`}
                                            onClick={() => toggleReaction(activeThread.id, msg.id, emoji)}
                                            title={reactors.join(", ")}
                                          >
                                            <span className="reaction-emoji">{emoji}</span>
                                            <span>{reactors.length}</span>
                                          </button>
                                        );
                                      })}
                                    </div>
                                  )}

                                  {/* Footer (read receipt / edited label) — only on last message of group */}
                                  {isLastInGroup && isMe && (
                                    <div className="msg-footer">
                                      {msg.edited && <span className="msg-edited">editado</span>}
                                      <span className={`msg-read-receipt ${msg.read ? 'read' : 'delivered'}`}>
                                        {msg.read ? <CheckCheck /> : <Check />}
                                      </span>
                                      <span>{msg.read ? 'Leído' : 'Entregado'}</span>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}

              {/* Typing indicator (WhatsApp-style) */}
              <AnimatePresence>
                {typingClientId === activeThread.id && (
                  <motion.div
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 6 }}
                    className="msg-group"
                  >
                    <div
                      className="msg-group-avatar"
                      style={{
                        background: `linear-gradient(135deg, ${getAvatarGradient(activeThread.clientName).from} 0%, ${getAvatarGradient(activeThread.clientName).to} 100%)`,
                      }}
                    >
                      {getInitials(activeThread.clientName)}
                    </div>
                    <div>
                      <div className="typing-indicator">
                        <span className="typing-dot"></span>
                        <span className="typing-dot"></span>
                        <span className="typing-dot"></span>
                      </div>
                      <div className="typing-label">{activeThread.clientName} está escribiendo…</div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <div ref={messagesEndRef} />

              {/* Quick reply suggestions — shown when the conversation just opened
                  (only the initial client message exists) and chat is still open */}
              {activeThread.status === 'OPEN' && activeThread.messages.length <= 1 && (
                <div className="quick-replies mt-6">
                  {QUICK_REPLY_SUGGESTIONS.map((s, i) => (
                    <button
                      key={i}
                      className="quick-reply-chip"
                      onClick={() => handleQuickReply(s)}
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      {s.length > 40 ? s.slice(0, 40) + "…" : s}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Scroll-to-bottom floating button */}
            <button
              className={`scroll-to-bottom-btn ${showScrollToBottom ? 'visible' : ''}`}
              onClick={() => {
                scrollToBottom('smooth');
                setUnreadCount(0);
              }}
              aria-label="Ir al último mensaje"
              title="Ir al último mensaje"
            >
              <ArrowDown />
              {unreadCount > 0 && <span className="unread-dot">{unreadCount > 9 ? '9+' : unreadCount}</span>}
            </button>

            {/* Reply preview bar (above input) — Telegram-style */}
            {replyingTo && (
              <div className="reply-preview-bar">
                <div className="reply-quote">
                  <div className="reply-quote-content">
                    <div className="reply-quote-author">
                      {replyingTo.author === 'provider' ? 'Tú' : activeThread.clientName}
                    </div>
                    <div className="reply-quote-text">{replyingTo.text}</div>
                  </div>
                </div>
                <button
                  className="reply-cancel-btn"
                  onClick={() => setReplyingTo(null)}
                  aria-label="Cancelar respuesta"
                >
                  <X />
                </button>
              </div>
            )}

            {activeThread.workflow_phase === 'COMPLETION_PENDING' && activeThread.completionDeadline && (
              <div className="px-4 md:px-6 pt-4 pb-2 bg-white">
                <div className="flex items-start gap-2 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                  <Clock className="w-4 h-4 mt-0.5 shrink-0" />
                  <div>
                    <strong>Esperando confirmación del cliente</strong>
                    <p className="mt-0.5">Plazo límite: {new Date(activeThread.completionDeadline).toLocaleString("es-NI", { dateStyle: "medium", timeStyle: "short" })}</p>
                  </div>
                </div>
              </div>
            )}

            {activeThread.workflow_phase === 'CLOSED' && activeThread.closure_outcome && (
              <div className="px-4 md:px-6 pt-4 pb-2 bg-white">
                <div className="flex items-start gap-2 text-sm text-slate-700 bg-slate-100 border border-slate-200 rounded-xl px-4 py-3">
                  <CheckCircle className="w-4 h-4 mt-0.5 shrink-0" />
                  <div>
                    <strong>Trabajo cerrado</strong>
                    <p className="mt-0.5">{getClosureOutcomeMessage(activeThread.closure_outcome)}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Chat Input */}
            <div className={`p-4 md:p-6 bg-white border-t border-slate-200 shrink-0 ${replyingTo ? 'pt-0' : ''}`}>
              <div className="flex items-end gap-3 max-w-4xl mx-auto">
                <button
                  className="w-12 h-12 flex items-center justify-center rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors shrink-0"
                  title="Adjuntar archivo"
                >
                  <Paperclip className="w-5 h-5" />
                </button>
                <div className="flex-1 relative">
                  <textarea
                    ref={textareaRef}
                    value={reply}
                    onChange={(e) => setReply(e.target.value)}
                    disabled={activeThread.workflow_phase === 'CLOSED'}
                    placeholder={
                      activeThread.workflow_phase === 'CLOSED'
                        ? "Esta cotización ha sido cerrada."
                        : "Escribe tu respuesta comercial..."
                    }
                    className="chat-textarea w-full bg-slate-50 border border-slate-200 rounded-2xl pl-5 pr-14 py-3.5 text-[15px] focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 disabled:opacity-60 disabled:bg-slate-100 font-medium shadow-sm transition-all"
                    rows={1}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSend();
                      }
                    }}
                  />
                  <button
                    onClick={handleSend}
                    disabled={activeThread.status === 'CLOSED' || !reply.trim() || sendMutation.isPending}
                    className="absolute right-2 bottom-2 w-10 h-10 bg-[var(--brand)] text-white rounded-full flex items-center justify-center hover:bg-[var(--brand-dark)] disabled:opacity-40 transition-all shadow-md"
                    aria-label="Enviar"
                  >
                    <Send className="w-4 h-4 ml-0.5" />
                  </button>
                </div>
              </div>
              <div className="mt-2 max-w-4xl mx-auto px-2 flex items-center justify-between">
                <span className="text-[11px] font-semibold text-slate-400">
                  <kbd className="px-1.5 py-0.5 bg-slate-100 border border-slate-200 rounded text-[10px]">Enter</kbd> enviar ·{" "}
                  <kbd className="px-1.5 py-0.5 bg-slate-100 border border-slate-200 rounded text-[10px]">Shift+Enter</kbd> nueva línea
                </span>
                {reply.length > 0 && (
                  <span className="text-[11px] font-semibold text-slate-400">
                    {reply.length} caracteres
                  </span>
                )}
              </div>
            </div>
          </>
        ) : (
          // Empty state — when no thread is selected
          <div className="chat-empty-state">
            <div className="chat-empty-icon">
              <MessageSquare />
            </div>
            <h3 className="chat-empty-title">Tus Cotizaciones</h3>
            <p className="chat-empty-text">
              Selecciona una conversación del panel izquierdo para ver los mensajes
              y responder a tus clientes.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function getClosureOutcomeMessage(outcome: string): string {
  const messages: Record<string, string> = {
    BILATERAL: "Ambas partes confirmaron el trabajo completado.",
    REQUESTER_CONFIRMED_PROVIDER_NO_RESPONSE: "El cliente confirmó pero el proveedor no respondió dentro de 72 horas.",
    PROVIDER_CLAIMED_REQUESTER_NO_RESPONSE: "El proveedor confirmó pero el cliente no respondió dentro de 72 horas.",
    CANCELLED_BY_REQUESTER: "Cancelado por el cliente.",
    CANCELLED_BY_PROVIDER: "Cancelado por el proveedor.",
    MODERATION_CLOSURE: "Cerrado por moderación.",
  };
  return messages[outcome] || "Cerrado.";
}
