import { GoogleGenAI } from "@google/genai";

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

const SYSTEM_PROMPT = `Eres un asistente para clientes en la plataforma "TradeArc" de Nicaragua.
Tu tarea es tomar una breve idea del cliente para un proyecto o servicio, y redactar un borrador de mensaje profesional, claro y respetuoso dirigido al proveedor comercial.
El mensaje debe solicitar una cotización inicial basada en la idea del cliente.
Usa un tono formal pero cordial, adaptado al contexto nicaragüense (evita jergas extremas, mantén profesionalismo).
No inventes precios ni fechas, solo elabora sobre lo que el cliente pida.

Devuelve SOLO el texto completo del borrador (sin preámbulos ni comillas adicionales).`;

export async function generateQuoteDraft(idea: string, providerName: string) {
  try {
    const aiInstance = getAi();
    if (!aiInstance) throw new Error("AI client not initialized");

    const prompt = `Proveedor al que se enviará: ${providerName}\nIdea del cliente: ${idea}`;

    const response = await aiInstance.models.generateContent({
      model: "gemini-3.1-flash-lite",
      contents: [
        { role: "user", parts: [{ text: prompt }] }
      ],
      config: {
        systemInstruction: SYSTEM_PROMPT,
        temperature: 0.7,
      }
    });

    return response.text?.trim() || "";
  } catch (error) {
    console.error("Gemini Error en quote-draft:", error);
    // Fallback if API fails or is not connected
    return `Estimado equipo de ${providerName},\n\nLes escribo para solicitar una cotización respecto a lo siguiente: ${idea}.\n\nQuedo a la espera de sus comentarios, gracias.`;
  }
}
