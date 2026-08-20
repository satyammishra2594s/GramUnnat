import OpenAI from "openai";

const openai = new OpenAI();

type ChatMessage = { role: "user" | "assistant"; content: string };

function requestedPage(text: string) {
  const value = text.toLowerCase();
  if (/(diagnos|crop disease|leaf photo|फसल.*रोग|निदान)/.test(value)) return "disease";
  if (/(add.*(cow|animal)|livestock|pashu|पशु|गाय|भैंस)/.test(value)) return "livestock";
  if (/(farm record|crop history|my records|खेत.*रिकॉर्ड|फसल.*इतिहास)/.test(value)) return "records";
  if (/(weather|forecast|rain|मौसम|बारिश)/.test(value)) return "weather";
  if (/(advice|advisory|crop care|सलाह)/.test(value)) return "advisory";
  return null;
}

async function liveWeather(location: { lat?: number; lon?: number; name?: string } | null | undefined) {
  if (!Number.isFinite(location?.lat) || !Number.isFinite(location?.lon)) return null;
  try {
    const url = new URL("https://api.open-meteo.com/v1/forecast");
    url.searchParams.set("latitude", String(location!.lat));
    url.searchParams.set("longitude", String(location!.lon));
    url.searchParams.set("current", "temperature_2m,relative_humidity_2m,precipitation,weather_code,wind_speed_10m");
    url.searchParams.set("daily", "precipitation_sum,temperature_2m_max,temperature_2m_min");
    url.searchParams.set("forecast_days", "3");
    url.searchParams.set("timezone", "auto");
    const response = await fetch(url);
    if (!response.ok) return null;
    return { name: location?.name, ...(await response.json()) };
  } catch {
    return null;
  }
}

async function agricultureNews(language: string) {
  try {
    const query = language === "hi" ? "भारत कृषि किसान" : "India agriculture farming";
    const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=${language === "hi" ? "hi" : "en-IN"}&gl=IN&ceid=IN:${language === "hi" ? "hi" : "en"}`;
    const xml = await fetch(url, { headers: { "User-Agent": "GramUnnat/1.0" } }).then((r) => r.ok ? r.text() : "");
    return [...xml.matchAll(/<item>[\s\S]*?<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>[\s\S]*?<pubDate>([\s\S]*?)<\/pubDate>/g)]
      .slice(0, 5)
      .map((match) => ({ title: match[1].replace(/<[^>]+>/g, "").replace(/&amp;/g, "&"), published: match[2] }));
  } catch {
    return [];
  }
}

export default async (request: Request) => {
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const body = await request.json().catch(() => null) as null | {
    messages?: ChatMessage[];
    language?: "en" | "hi";
    farmData?: unknown;
    diagnosis?: unknown;
    location?: { lat?: number; lon?: number; name?: string } | null;
    clientTime?: string;
  };
  const messages = (body?.messages || []).filter((message) => message && typeof message.content === "string").slice(-12);
  const latest = messages.at(-1)?.content || "";
  if (!latest || latest.length > 3000) return Response.json({ error: "Please enter a shorter question." }, { status: 400 });

  const wantsWeather = /(weather|forecast|rain|temperature|humidity|मौसम|बारिश|तापमान)/i.test(latest);
  const wantsNews = /(news|today.*farm|happening.*farm|agriculture today|समाचार|आज.*कृषि)/i.test(latest);
  const [weather, news] = await Promise.all([
    wantsWeather ? liveWeather(body?.location) : null,
    wantsNews ? agricultureNews(body?.language || "en") : [],
  ]);
  const liveContext = {
    verifiedAt: new Date().toISOString(),
    userDeviceTime: body?.clientTime || null,
    weather: weather || (wantsWeather ? "Live weather unavailable or location not provided." : null),
    agricultureNews: news.length ? news : (wantsNews ? "Live news could not be retrieved." : null),
  };
  const navigation = requestedPage(latest);
  const language = body?.language === "hi" ? "Hindi" : "English";
  const system = `You are Ayush, the optional side assistant inside GramUnnat. GramUnnat is the platform; never rename it Ayush.
Respond naturally in ${language}, but understand English, Hindi, and mixed Hindi-English. Be practical, concise, empathetic, and cautious. Ask follow-up questions when symptoms are ambiguous.
You can help with crops, pests, plant symptoms, irrigation, soil, livestock, animal health, farm records, weather, current agriculture news, dates/times, general questions, and using GramUnnat.
Never claim live information unless it appears in LIVE_CONTEXT. If retrieval failed, say so. Never invent user-specific farm data. If data is absent say you do not have that record yet.
For severe plant or animal symptoms, recommend local professional confirmation. Do not present image diagnosis as guaranteed. Avoid unsafe chemical or veterinary dosing.
Saved GramUnnat data: ${JSON.stringify(body?.farmData ?? {})}
Latest crop diagnosis context: ${JSON.stringify(body?.diagnosis ?? null)}
LIVE_CONTEXT: ${JSON.stringify(liveContext)}
If navigation is useful, mention that you are opening the relevant existing GramUnnat section. Do not create duplicate pages.`;

  try {
    const response = await openai.responses.create({
      model: "gpt-5.4-mini",
      instructions: system,
      input: messages.map((message) => ({ role: message.role, content: message.content })),
      max_output_tokens: 900,
    });
    return Response.json({ reply: response.output_text, navigate: navigation, live: { weather: Boolean(weather), news: Boolean(news.length) } }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Ayush service error", error instanceof Error ? error.message : "unknown");
    return Response.json({
      error: body?.language === "hi"
        ? "आयुष अभी लाइव AI सेवा से जुड़ नहीं पा रहा है। कृपया थोड़ी देर बाद फिर प्रयास करें।"
        : "Ayush cannot reach the live AI service right now. Please try again shortly.",
    }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
};

export const config = { path: "/api/chat" };
