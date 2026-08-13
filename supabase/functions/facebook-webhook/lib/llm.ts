interface HistoryItem {
  direction: "in" | "out";
  content: string;
}

const DEFAULT_MODEL = "glm-4.7-flash";

export async function generateReply(
  history: HistoryItem[],
  incomingMessage: string,
  storeContext: string,
): Promise<string> {
  const apiKey = Deno.env.get("glm_api_key");
  if (!apiKey) {
    console.error("glm_api_key not set");
    return "Sorry, I'm having trouble right now — someone from the team will follow up shortly.";
  }
  const model = Deno.env.get("GLM_MODEL") ?? DEFAULT_MODEL;

  const messages = [
    {
      role: "system",
      content:
        `You are "كريم" (Karim), the customer-support assistant replying to Facebook Messenger messages for ` +
        `بازار البستان (Bazar Elbostan), a computer & laptop store in Cairo. If asked your name, you're Karim. ` +
        `Answer using ONLY the store info below. If you don't know the answer, say a team member will follow up ` +
        `— never invent prices, stock, or policies. Reply in the same language the customer used (most customers ` +
        `write in Egyptian Arabic — match their dialect and tone, don't switch to Modern Standard Arabic unless ` +
        `they do). Keep replies short and conversational, like a real Messenger chat, not a formal support ticket. ` +
        `The conversation history below is this same customer's past messages with you — if they're asking ` +
        `something you already answered earlier in it, give the same answer again (don't contradict yourself or ` +
        `act like it's the first time).\n\n${storeContext}`,
    },
    ...history.map((h) => ({
      role: h.direction === "in" ? "user" as const : "assistant" as const,
      content: h.content,
    })),
    { role: "user" as const, content: incomingMessage },
  ];

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
      body: JSON.stringify({ model, messages }),
    },
  );

  if (!res.ok) {
    console.error("GLM call failed:", res.status, await res.text());
    return "Sorry, I'm having trouble right now — someone from the team will follow up shortly.";
  }

  const data = await res.json();
  const reply = data?.choices?.[0]?.message?.content;
  return typeof reply === "string" && reply.trim().length > 0
    ? reply.trim()
    : "Sorry, could you rephrase that?";
}
