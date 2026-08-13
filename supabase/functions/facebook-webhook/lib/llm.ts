import { STORE_CONTEXT } from "./store_context.ts";

interface HistoryItem {
  direction: "in" | "out";
  content: string;
}

const DEFAULT_MODEL = "google/gemini-2.0-flash-001";

export async function generateReply(
  history: HistoryItem[],
  incomingMessage: string,
): Promise<string> {
  const apiKey = Deno.env.get("OPENROUTER_API_KEY");
  if (!apiKey) {
    console.error("OPENROUTER_API_KEY not set");
    return "Sorry, I'm having trouble right now — someone from the team will follow up shortly.";
  }
  const model = Deno.env.get("OPENROUTER_MODEL") ?? DEFAULT_MODEL;

  const messages = [
    {
      role: "system",
      content:
        `You are a friendly customer-support assistant replying to Facebook Messenger messages for this store. ` +
        `Answer using ONLY the store info below. If you don't know the answer, say a team member will follow up ` +
        `— never invent prices, stock, or policies. Reply in the same language the customer used. Keep replies short ` +
        `and conversational, like a real Messenger chat.\n\n${STORE_CONTEXT}`,
    },
    ...history.map((h) => ({
      role: h.direction === "in" ? "user" as const : "assistant" as const,
      content: h.content,
    })),
    { role: "user" as const, content: incomingMessage },
  ];

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model, messages }),
  });

  if (!res.ok) {
    console.error("OpenRouter call failed:", res.status, await res.text());
    return "Sorry, I'm having trouble right now — someone from the team will follow up shortly.";
  }

  const data = await res.json();
  const reply = data?.choices?.[0]?.message?.content;
  return typeof reply === "string" && reply.trim().length > 0
    ? reply.trim()
    : "Sorry, could you rephrase that?";
}
