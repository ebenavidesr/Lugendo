import { Router, type IRouter } from "express";
import { requireRoles } from "../middlewares/auth";
import { openai } from "@workspace/integrations-openai-ai-server";

const router: IRouter = Router();

const typePrompts: Record<string, string> = {
  destination: `Busca información actualizada sobre el destino turístico "{query}" y escribe una descripción atractiva y rica en detalles para una agencia de viajes.
Incluye información sobre su cultura, gastronomía, principales atracciones, clima o mejor época para visitar, y lo que hace único este lugar.
Escribe en español, en 2-4 párrafos (150-250 palabras). Solo devuelve el texto, sin títulos ni formateo adicional.`,
  hotel: `Busca información actualizada sobre el hotel "{query}" y escribe una descripción atractiva para un catálogo de agencia de viajes.
Incluye información real sobre el tipo de alojamiento, su ubicación, ambiente, instalaciones destacadas y a quién va dirigido.
Escribe en español, en 2-3 párrafos (120-200 palabras). Solo devuelve el texto, sin títulos ni formateo adicional.`,
  activity: `Busca información actualizada sobre la actividad o lugar turístico "{query}" y escribe una descripción atractiva para un catálogo de agencia de viajes.
Incluye qué se hace, qué se aprende o experimenta, a quién va dirigida y por qué es memorable.
Escribe en español, en 2-3 párrafos (100-180 palabras). Solo devuelve el texto, sin títulos ni formateo adicional.`,
};

router.post("/destinations/describe", requireRoles("admin", "manager", "agent"), async (req, res): Promise<void> => {
  const { query, type } = req.body as { query: string; type: "destination" | "hotel" | "activity" };
  if (!query || !type) {
    res.status(400).json({ error: "query and type are required" });
    return;
  }

  const template = typePrompts[type] ?? typePrompts.destination;
  const prompt = template.replace("{query}", query);

  try {
    const response = await openai.responses.create({
      model: "gpt-4o-mini",
      tools: [{ type: "web_search_preview" }],
      input: prompt,
    });
    const description = response.output_text.trim();
    res.json({ description });
  } catch {
    const completion = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 400,
      temperature: 0.75,
    });
    const description = completion.choices[0]?.message?.content?.trim() ?? "";
    res.json({ description });
  }
});

export default router;
