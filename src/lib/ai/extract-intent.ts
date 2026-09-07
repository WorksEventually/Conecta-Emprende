import { GoogleGenAI } from "@google/genai";
import { normalizeCategory, normalizeCity, legacyCityDisplayName } from "./category-mapping";
import { classifyGeminiError } from "./classify-error";

let ai: GoogleGenAI | null = null;

function getAi() {
  if (!ai) {
    if (!process.env.GEMINI_API_KEY) {
      console.warn("GEMINI_API_KEY is not set. AI functions will fallback.");
      return null;
    }
    ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  }
  return ai;
}

const INTENT_CACHE_TTL_MS = 60_000;
const INTENT_CACHE_MAX = 100;

interface CacheEntry {
  intent: SearchIntent;
  expiresAt: number;
}

const intentCache = new Map<string, CacheEntry>();

function cacheKey(query: string): string {
  return query.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function cacheGet(query: string): SearchIntent | null {
  const key = cacheKey(query);
  const entry = intentCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    intentCache.delete(key);
    return null;
  }
  return entry.intent;
}

function cacheSet(query: string, intent: SearchIntent): void {
  if (intentCache.size >= INTENT_CACHE_MAX) {
    const firstKey = intentCache.keys().next().value;
    if (firstKey) intentCache.delete(firstKey);
  }
  intentCache.set(cacheKey(query), { intent, expiresAt: Date.now() + INTENT_CACHE_TTL_MS });
}

const SYSTEM_PROMPT_INTENT = `Eres un extractor de intenciones para una plataforma de proveedores de servicios en Nicaragua.
Plataforma: TradeArc — conecta proveedores locales con clientes en todo el país.
Contexto local: Moneda: córdoba nicaragüense (símbolo C$, código NIO). Ejemplo: "5000" sin moneda = 5000 C$ NIO.

Ciudades válidas de Nicaragua (devuelve EXACTAMENTE el nombre listed, sin abreviaciones):
Managua, León, Granada, Masaya, Estelí, Matagalpa, Bluefields, Juigalpa, Nagarote, San Juan de Oriente.
Si el usuario menciona una ciudad que no está en esta lista, devuelve null en city y agrega el término a keywords.

Categorías válidas (devuelve EXACTAMENTE el nombre listed):
Diseño Gráfico, Plomería, Carpintería, Electricidad, Desarrollo Web, Marketing Digital, Limpieza, Contabilidad, Abogado, Fotografía, Catering, Jardinería, Mecánica, Bordado y serigrafía, Empaques ecológicos, Café y alimentos, Servicios tecnológicos, Insumos agrícolas, Muebles y carpintería.
Si la categoría no está en la lista, devuelve null en category y agrega el término a keywords.

Recibirás una consulta en español y devuelves SOLO JSON válido con este esquema:
{
  "category": string | null,
  "city": string | null,
  "maxPriceNIO": number | null,
  "urgency": "alta" | "media" | "baja" | null,
  "keywords": string[]
}
Reglas:
- maxPriceNIO: si el usuario dice "5000" o "hasta 5000" sin moneda, asume córdobas (NIO).
- urgency: "alta" si menciona urgencia/emergencia/ya/hoy; "media" si dice esta semana/pronto; null si no indica nada.
- keywords: 0-5 términos descriptivos relevantes (sin stopwords: en, de, para, por, con, y, o, el, la, un, una, mi, mis, necesito, busco, quiero).
- category y city: null si el usuario no especifica ninguna, NO uses un string vacío.

Ejemplos:
Query: "urgente plomería hasta 5000" → {"category": "Plomería", "city": null, "maxPriceNIO": 5000, "urgency": "alta", "keywords": []}
Query: "fotos boda León" → {"category": "Fotografía", "city": "León", "maxPriceNIO": null, "urgency": null, "keywords": ["boda"]}
Query: "marketing para mi restaurante" → {"category": "Marketing Digital", "city": null, "maxPriceNIO": null, "urgency": null, "keywords": ["restaurante"]}

No incluyas texto fuera del JSON. Devuelve formato JSON limpio sin bloques de código.`;

export interface SearchIntent {
  category: string | null;
  city: string | null;
  maxPriceNIO: number | null;
  urgency: "alta" | "media" | "baja" | null;
  keywords: string[];
  confidence: "alta" | "media" | "baja";
}

const KNOWN_CITIES = [
  "Managua", "León", "Granada", "Masaya", "Estelí", "Matagalpa",
  "Bluefields", "Juigalpa", "Nagarote", "San Juan de Oriente"
];

const KNOWN_CATEGORIES = [
  "Diseño Gráfico", "Diseño", "Plomería", "Carpintería", "Electricidad",
  "Desarrollo Web", "Marketing", "Limpieza", "Contabilidad", "Abogado",
  "Fotografía", "Catering", "Jardinería", "Mecánica", "Bordado y serigrafía",
  "Empaques ecológicos", "Café y alimentos", "Servicios tecnológicos",
  "Insumos agrícolas", "Muebles y carpintería",
];

function normalize(s: string) {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function computeConfidence(intent: Pick<SearchIntent, "category" | "city" | "maxPriceNIO" | "urgency">): "alta" | "media" | "baja" {
  let count = 0;
  if (intent.category) count++;
  if (intent.city) count++;
  if (intent.maxPriceNIO != null) count++;
  if (intent.urgency) count++;
  if (count >= 3) return "alta";
  if (count >= 2) return "media";
  return "baja";
}

function basicExtractIntent(query: string): SearchIntent {
  const normalized = normalize(query);

  const rawCity = KNOWN_CITIES.find(c => normalized.includes(normalize(c))) || null;
  const cityEnum = rawCity ? normalizeCity(rawCity) : undefined;
  const city = cityEnum ? legacyCityDisplayName(cityEnum) : (rawCity ?? null);

  const rawCat = KNOWN_CATEGORIES.find(c => normalized.includes(normalize(c))) || null;
  const category = rawCat ? normalizeCategory(rawCat) ?? rawCat : null;

  const stopWords = new Set([
    "en", "de", "para", "por", "con", "y", "o", "el", "la", "los", "las",
    "un", "una", "unos", "unas", "mi", "mis", "necesito", "busco", "quiero",
    "que", "se", "me", "le", "lo", "te", "nos", "es", "está", "son", "están",
  ]);
  const matchedTokens = new Set([
    ...(rawCity ? [normalize(rawCity)] : []),
    ...(rawCat ? normalize(rawCat).split(" ") : []),
  ]);
  const keywords = normalized
    .split(/[^\p{L}\p{N}]+/u)
    .filter(w => w.length > 2 && !stopWords.has(w) && ![...matchedTokens].some(t => t === w));

  const maxPriceNIO = /hasta\s*(\d+)/.test(query)
    ? parseInt(/hasta\s*(\d+)/.exec(query)![1], 10)
    : /menos\s*de\s*(\d+)/.test(query)
      ? parseInt(/menos\s*de\s*(\d+)/.exec(query)![1], 10)
      : null;

  const urgency = /(?:urgente|emergencia|ya|hoy|lo antes)/.test(normalized) ? "alta"
    : /(?:esta semana|pronto|rápido)/.test(normalized) ? "media"
      : null;

  return { category, city, maxPriceNIO, urgency, keywords, confidence: computeConfidence({ category, city, maxPriceNIO, urgency }) };
}

export async function extractIntent(query: string): Promise<SearchIntent> {
  const cached = cacheGet(query);
  if (cached) {
    console.debug("ai/intent-cache-hit", query);
    return cached;
  }

  try {
    const aiInstance = getAi();
    if (!aiInstance) throw new Error("AI client not initialized");

    const response = await aiInstance.models.generateContent({
      model: "gemini-3.1-flash-lite",
      contents: [
        { role: "user", parts: [{ text: "Query: " + query }] }
      ],
      config: {
        systemInstruction: SYSTEM_PROMPT_INTENT,
        temperature: 0.1,
      }
    });

    const text = response.text;
    const cleanJson = text?.replace(/```json/g, "").replace(/```/g, "").trim() || "{}";
    const parsed = JSON.parse(cleanJson);

    const normalizedCityEnum = normalizeCity(parsed.city ?? "");
    const normalizedCategory = normalizeCategory(parsed.category ?? null);

    const intent: SearchIntent = {
      category: normalizedCategory,
      city: normalizedCityEnum ? legacyCityDisplayName(normalizedCityEnum) : (parsed.city ?? null),
      maxPriceNIO: typeof parsed.maxPriceNIO === "number" ? parsed.maxPriceNIO : null,
      urgency: ["alta", "media", "baja"].includes(parsed.urgency) ? parsed.urgency : null,
      keywords: Array.isArray(parsed.keywords) ? parsed.keywords.filter(Boolean) : [],
      confidence: "baja" as const,
    };
    intent.confidence = computeConfidence(intent);

    cacheSet(query, intent);
    return intent;
  } catch (error) {
    const c = classifyGeminiError(error);
    if (c.kind === "aborted") {
      console.warn("[extract-intent] Abortado (timeout/interrupción)");
    } else if (c.kind === "rate_limit") {
      console.warn("[extract-intent] Rate limit (429) de Gemini, usando fallback", { retryAfterMs: c.retryAfterMs });
    } else if (c.kind === "unavailable") {
      console.info("[extract-intent] Gemini no disponible (503/5xx), degradando silenciosamente");
    } else {
      console.error("[extract-intent] Error inesperado de Gemini, usando fallback", error);
    }
    return basicExtractIntent(query);
  }
}
