interface HistoryItem {
  direction: "in" | "out";
  content: string;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

const DEFAULT_MODEL = "glm-4.7-flash";
const GLM_TIMEOUT_MS = 30_000;

export const FALLBACK_REPLY =
  "Sorry, I'm having trouble right now — someone from the team will follow up shortly.";

export function buildChatMessages(
  history: HistoryItem[],
  incomingMessage: string,
  storeContext: string,
): ChatMessage[] {
  const usable = history.filter((h) => h.content !== FALLBACK_REPLY);
  const last = usable[usable.length - 1];
  const alreadyIncluded =
    last?.direction === "in" && last.content === incomingMessage;

  return [
    {
      role: "system",
      content:
        `You are "كريم" (Karim), a salesperson at بازار البستان (Bazar Elbostan), a computer & laptop store in Cairo. ` +
        `If asked your name, you're Karim. You are not a coding assistant and never mention being a bot. ` +
        `Answer using ONLY the store info below. If you don't know the answer, say a team member will follow up ` +
        `— never invent prices, stock, or policies. Reply in the same language the customer used (most customers ` +
        `write in Egyptian Arabic — match their dialect and tone, don't switch to Modern Standard Arabic unless ` +
        `they do). Keep replies short and conversational, like a real Messenger chat, not a formal support ticket. ` +
        `The conversation history below is this same customer's past messages with you — if they're asking ` +
        `something you already answered earlier in it, give the same answer again (don't contradict yourself or ` +
        `act like it's the first time).\n\n${storeContext}`,
    },
    ...usable.map((h) => ({
      role: (h.direction === "in" ? "user" : "assistant") as "user" | "assistant",
      content: h.content,
    })),
    ...(alreadyIncluded ? [] : [{ role: "user" as const, content: incomingMessage }]),
  ];
}

export async function generateReply(
  history: HistoryItem[],
  incomingMessage: string,
  storeContext: string,
): Promise<string> {
  const apiKey = Deno.env.get("glm_api_key");
  if (!apiKey) {
    console.error("glm_api_key not set");
    return FALLBACK_REPLY;
  }
  const model = Deno.env.get("GLM_MODEL") ?? DEFAULT_MODEL;

  const messages = buildChatMessages(history, incomingMessage, storeContext);

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), GLM_TIMEOUT_MS);

    const res = await fetch(
      // Coding-Plan key (sk-sp-...) — bills against the subscription quota, but
      // ONLY works on the /api/coding/ path, not the standard PAYG path.
      "https://open.bigmodel.cn/api/coding/paas/v4/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages,
          // GLM-4.7 thinks by default; thinking on the Coding Plan endpoint is
          // slow enough that a parallel Meta redelivery wins the race and the
          // failed twin sends FALLBACK_REPLY a few seconds earlier.
          thinking: { type: "disabled" },
        }),
        signal: controller.signal,
      },
    );

    clearTimeout(timeoutId);

    if (!res.ok) {
      console.error("GLM call failed:", res.status, await res.text());
      return FALLBACK_REPLY;
    }

    const data = await res.json();
    const reply = data?.choices?.[0]?.message?.content;
    return typeof reply === "string" && reply.trim().length > 0
      ? reply.trim()
      : "Sorry, could you rephrase that?";
  } catch (error) {
    console.error("GLM request error:", error);
    return FALLBACK_REPLY;
  }
}
