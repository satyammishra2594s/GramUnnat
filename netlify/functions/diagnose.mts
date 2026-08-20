import OpenAI from "openai";

const openai = new OpenAI();

const diagnosisShape = {
  crop: "Likely crop or Unknown",
  disease: "Most likely condition or Inconclusive",
  confidence: 0,
  likelyCause: "Short explanation",
  visibleSymptoms: ["symptom"],
  careSteps: ["safe action"],
  prevention: ["prevention action"],
  monitoring: ["what to watch"],
  urgency: "low | medium | high",
  disclaimer: "This is an AI-assisted possible match, not a guaranteed diagnosis.",
};

function parseJson(text: string) {
  const cleaned = text.replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
  return JSON.parse(cleaned);
}

export default async (request: Request) => {
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const body = await request.json().catch(() => null) as null | {
    image?: string;
    crop?: string;
    location?: string;
    duration?: string;
    language?: "en" | "hi";
  };
  if (!body?.image || !/^data:image\/(jpeg|png|webp);base64,/i.test(body.image) || body.image.length > 5_200_000) {
    return Response.json({ error: "Please provide a JPG, PNG, or WebP image under 4 MB." }, { status: 400 });
  }

  const language = body.language === "hi" ? "Hindi" : "English";
  const prompt = `You are a cautious agricultural plant-pathology image triage assistant for Indian farmers.
Analyze only what is visible. Never invent certainty. Distinguish disease from nutrient deficiency, pest damage, water stress, sun scorch, and a healthy plant where possible.
Context: crop=${body.crop || "not supplied"}; location=${body.location || "not supplied"}; symptom duration=${body.duration || "not supplied"}.
Return ONLY valid JSON matching this example shape: ${JSON.stringify(diagnosisShape)}
Write all explanatory strings in ${language}. confidence must be an integer from 0 to 100 and should reflect image quality and ambiguity. If the image is not a plant or is too unclear, disease must be "Inconclusive", confidence below 35, and care must request a clearer photo. Avoid pesticide dosage unless the diagnosis is highly distinctive; recommend checking the product label and local expert guidance.`;

  try {
    const response = await openai.responses.create({
      model: "gpt-4.1-mini",
      input: [{
        role: "user",
        content: [
          { type: "input_text", text: prompt },
          { type: "input_image", image_url: body.image, detail: "high" },
        ],
      }],
      max_output_tokens: 1200,
    });
    const result = parseJson(response.output_text);
    result.confidence = Math.max(0, Math.min(100, Math.round(Number(result.confidence) || 0)));
    return Response.json({ result, source: "server-vision-model" }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Diagnosis service error", error instanceof Error ? error.message : "unknown");
    return Response.json({
      error: "The live plant-disease service is temporarily unavailable. No simulated diagnosis was generated.",
    }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
};

export const config = { path: "/api/diagnose" };
