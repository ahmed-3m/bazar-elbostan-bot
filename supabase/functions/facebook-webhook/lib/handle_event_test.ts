import { assertEquals } from "jsr:@std/assert@1";
import { handleEvent, type EventDeps, type MessagingEvent } from "./handle_event.ts";

function event(mid: string, text: string): MessagingEvent {
  return { sender: { id: "psid-1" }, timestamp: 1, message: { mid, text } };
}

function makeDeps(claimed: Set<string>, sent: string[]): EventDeps {
  return {
    claimMid: (mid) => {
      if (claimed.has(mid)) return Promise.resolve(false);
      claimed.add(mid);
      return Promise.resolve(true);
    },
    releaseMid: (mid) => {
      claimed.delete(mid);
      return Promise.resolve();
    },
    upsertCustomer: () => Promise.resolve(),
    saveMessage: () => Promise.resolve(),
    getRecentHistory: () => Promise.resolve([]),
    getStoreContext: () => Promise.resolve("store"),
    generateReply: () => Promise.resolve("real reply"),
    sendTextMessage: (_psid, text) => {
      sent.push(text);
      return Promise.resolve();
    },
  };
}

Deno.test("same mid is processed once even if Meta delivers it twice", async () => {
  const claimed = new Set<string>();
  const sent: string[] = [];
  const deps = makeDeps(claimed, sent);
  const ev = event("m_same", "تست");

  await Promise.all([handleEvent(ev, deps), handleEvent(ev, deps)]);

  assertEquals(sent, ["real reply"]);
});

Deno.test("releases the mid when send fails so a later redelivery can retry", async () => {
  const claimed = new Set<string>();
  const sent: string[] = [];
  const deps = makeDeps(claimed, sent);
  deps.sendTextMessage = () => Promise.reject(new Error("graph down"));

  const ev = event("m_retry", "alo");
  let threw = false;
  try {
    await handleEvent(ev, deps);
  } catch {
    threw = true;
  }
  assertEquals(threw, true);
  assertEquals(claimed.has("m_retry"), false);

  const retryDeps = makeDeps(claimed, sent);
  await handleEvent(ev, retryDeps);
  assertEquals(sent, ["real reply"]);
});

Deno.test("echoes and empty messages never generate a reply", async () => {
  const sent: string[] = [];
  const deps = makeDeps(new Set(), sent);

  await handleEvent({ sender: { id: "x" }, message: { text: "hi", is_echo: true } }, deps);
  await handleEvent({ sender: { id: "x" }, message: {} }, deps);

  assertEquals(sent, []);
});
