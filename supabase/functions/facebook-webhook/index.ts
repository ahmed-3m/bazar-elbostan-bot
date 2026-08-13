import { sendTextMessage } from "./lib/graph.ts";
import { generateReply } from "./lib/llm.ts";
import {
  claimMid,
  getRecentHistory,
  getStoreContext,
  releaseMid,
  saveMessage,
  upsertCustomer,
} from "./lib/db.ts";
import { handleEvent, type MessagingEvent } from "./lib/handle_event.ts";

const deps = {
  claimMid,
  releaseMid,
  upsertCustomer,
  saveMessage,
  getRecentHistory,
  getStoreContext,
  generateReply,
  sendTextMessage,
};

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

interface WebhookEntry {
  messaging?: MessagingEvent[];
}

interface WebhookBody {
  object?: string;
  entry?: WebhookEntry[];
}

function keepAlive(task: Promise<unknown>) {
  const runtime = globalThis as typeof globalThis & {
    EdgeRuntime?: { waitUntil: (promise: Promise<unknown>) => void };
  };
  // Without waitUntil the isolate can die after the 200, aborting the GLM
  // fetch mid-flight and sending FALLBACK_REPLY.
  if (runtime.EdgeRuntime?.waitUntil) {
    runtime.EdgeRuntime.waitUntil(task);
    return;
  }
  task.catch((err) => console.error("handleEvent failed:", err));
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
    keepAlive(
      handleEvent(event, deps).catch((err) =>
        console.error("handleEvent failed:", err)
      ),
    );
  }

  return new Response("EVENT_RECEIVED", { status: 200 });
});
