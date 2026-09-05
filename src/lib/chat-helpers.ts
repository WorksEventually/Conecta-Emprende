// ============================================================
// Chat helpers — avatar gradients, date formatting, message grouping
// ============================================================

// Deterministic TradeArc avatar colors based on a name hash.
// Same name → same palette-approved combination.
const AVATAR_GRADIENTS: Array<{ from: string; to: string }> = [
  { from: "#1A3C6E", to: "#132D52" },
  { from: "#1A3C6E", to: "#1A3C6E" },
  { from: "#00D4FF", to: "#1A3C6E" },
  { from: "#1A3C6E", to: "#00BFEE" },
  { from: "#1B6E3A", to: "#1A3C6E" },
  { from: "#1A3C6E", to: "#00D4FF" },
  { from: "#B42318", to: "#1A3C6E" },
  { from: "#1A3C6E", to: "#1A3C6E" },
  { from: "#F9ECD9", to: "#1A3C6E" },
  { from: "#8A5A00", to: "#1A3C6E" },
];

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

export function getAvatarGradient(name: string): { from: string; to: string } {
  return AVATAR_GRADIENTS[hashString(name) % AVATAR_GRADIENTS.length];
}

export function getInitials(name: string): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// ============================================================
// Date formatting for day separators
// ============================================================

const MONTHS_ES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"
];

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** Returns "Hoy" / "Ayer" / "12 de junio de 2025" for a day-separator label. */
export function formatDayLabel(dateStr: string): string {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;

  const today = startOfDay(new Date());
  const that = startOfDay(d);
  const oneDay = 24 * 60 * 60 * 1000;

  if (that === today) return "Hoy";
  if (that === today - oneDay) return "Ayer";

  return `${d.getDate()} de ${MONTHS_ES[d.getMonth()]} de ${d.getFullYear()}`;
}

/** Returns a short time label like "10:30 AM" for an existing time string. */
export function shortTime(input: string): string {
  // If the input already looks like a time ("10:30 AM"), keep it as-is.
  if (/^\d{1,2}:\d{2}\s*[AP]M$/i.test(input.trim())) return input.trim();
  // If it's an ISO date, format it.
  const d = new Date(input);
  if (!isNaN(d.getTime())) {
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  return input;
}

// ============================================================
// Message grouping — Discord-style consecutive message grouping.
// Messages from the same author within 5 minutes belong to the same group.
// ============================================================

export interface GroupableMessage {
  id: string;
  author: string;
  text?: string;
  time: string;
  createdAt?: string | number | Date;
}

export interface MessageGroup<M extends GroupableMessage> {
  author: string;
  messages: M[];
}

const GROUP_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

function messageTimestamp(m: GroupableMessage): number {
  if (m.createdAt) {
    const d = new Date(m.createdAt);
    if (!isNaN(d.getTime())) return d.getTime();
  }
  // Fall back to parsing the time string ("10:30 AM") — but since we don't know
  // the date, assume consecutive calls are within the same conversation order.
  const d = new Date(m.time);
  if (!isNaN(d.getTime())) return d.getTime();
  return 0;
}

function dayKey(m: GroupableMessage): string {
  const ts = messageTimestamp(m);
  if (ts === 0) return "unknown";
  const d = new Date(ts);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

/**
 * Splits messages into day buckets, then into author groups within each day.
 * Each group is a sequence of consecutive messages from the same author
 * within GROUP_WINDOW_MS (5 minutes).
 */
export function groupMessagesByDay<M extends GroupableMessage>(
  messages: M[]
): Array<{ dayKey: string; dayLabel: string; groups: Array<MessageGroup<M>> }> {
  if (messages.length === 0) return [];

  const days: Array<{ dayKey: string; dayLabel: string; groups: Array<MessageGroup<M>> }> = [];
  let currentDay: { dayKey: string; dayLabel: string; groups: Array<MessageGroup<M>> } | null = null;
  let currentGroup: MessageGroup<M> | null = null;

  for (const msg of messages) {
    const dk = dayKey(msg);
    const dlabel = msg.time ? formatDayLabel(msg.time) : dk;
    const ts = messageTimestamp(msg);

    // New day?
    if (!currentDay || currentDay.dayKey !== dk) {
      currentDay = { dayKey: dk, dayLabel: dlabel, groups: [] };
      days.push(currentDay);
      currentGroup = null;
    }

    // New group? Different author, or same author but more than 5min apart.
    const shouldStartNewGroup =
      !currentGroup ||
      currentGroup.author !== msg.author ||
      (ts > 0 && messageTimestamp(currentGroup.messages[currentGroup.messages.length - 1]) > 0
        ? ts - messageTimestamp(currentGroup.messages[currentGroup.messages.length - 1]) > GROUP_WINDOW_MS
        : false);

    if (shouldStartNewGroup) {
      currentGroup = { author: msg.author, messages: [msg] };
      currentDay.groups.push(currentGroup);
    } else {
      currentGroup.messages.push(msg);
    }
  }

  return days;
}
