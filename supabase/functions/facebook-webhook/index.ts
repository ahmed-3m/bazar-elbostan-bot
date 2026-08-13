import { sendTextMessage } from "./lib/graph.ts";
import { generateReply } from "./lib/llm.ts";
import { getRecentHistory, saveMessage, upsertCustomer } from "./lib/db.ts";

// Meta's webhook verification handshake — GET /facebook-webhook with
// hub.mode=subscribe. Echo hub.challenge back only if hub.verify_token
// matches, otherwise Meta refuses to save the webhook config.
function handleVerification(url: URL): Response {
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  if (mode === "subscribe" && token === Deno.env.get("VERIFY_TOKEN")) {
    return new Response(challenge ?? "", { status: 200 });
  }
  return new Response("Forbidden", { status: 403 });
}

interface MessagingEvent {
  sender: { id: string };
  message?: { text?: string; is_echo?: boolean };
}

interface WebhookEntry {
  messaging?: MessagingEvent[];
}

interface WebhookBody {
  object?: string;
  entry?: WebhookEntry[];
}

async function handleEvent(event: MessagingEvent) {
  const psid = event.sender.id;
  const text = event.message?.text;

  // Echoes are messages the Page itself sent (e.g. sent from Business Suite
  // by a human) bounced back through the webhook — never reply to those.
  if (!text || event.message?.is_echo) return;

  await upsertCustomer(psid);
  await saveMessage(psid, "in", text);

  const history = await getRecentHistory(psid);
  const reply = await generateReply(history, text);

  await sendTextMessage(psid, reply);
  await saveMessage(psid, "out", reply);
}

Deno.serve(async (req) => {
  const url = new URL(req.url);

  if (req.method === "GET") {
    return handleVerification(url);
  }

  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const body: WebhookBody = await req.json();

  if (body.object !== "page") {
    return new Response("Not Found", { status: 404 });
  }

  // Respond 200 immediately, then process — Meta retries aggressively on
  // slow/failed responses, which would otherwise send duplicate replies.
  const events = (body.entry ?? []).flatMap((e) => e.messaging ?? []);
  for (const event of events) {
    handleEvent(event).catch((err) =>
      console.error("handleEvent failed:", err)
    );
  }

  return new Response("EVENT_RECEIVED", { status: 200 });
});
