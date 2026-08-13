import { assertEquals } from "jsr:@std/assert@1";
import { buildChatMessages, generateReply } from "./llm.ts";

Deno.test("does not send the inbound text twice when history already has it", () => {
  const messages = buildChatMessages(
    [{ direction: "in", content: "تست" }],
    "تست",
    "Store name: بازار البستان",
  );

  const userTurns = messages.filter((m) => m.role === "user");
  assertEquals(userTurns.length, 1);
  assertEquals(userTurns[0].content, "تست");
});

Deno.test("drops the English fallback so it cannot poison the next turn", () => {
  const messages = buildChatMessages(
    [
      { direction: "in", content: "تست" },
      {
        direction: "out",
        content:
          "Sorry, I'm having trouble right now — someone from the team will follow up shortly.",
      },
      { direction: "in", content: "alo" },
    ],
    "alo",
    "Store name: بازار البستان",
  );

  const contents = messages.map((m) => m.content);
  assertEquals(
    contents.some((c) => c.includes("having trouble right now")),
    false,
  );
  const userTurns = messages.filter((m) => m.role === "user");
  assertEquals(userTurns.map((m) => m.content), ["تست", "alo"]);
});

Deno.test("still includes the inbound text when history is empty", () => {
  const messages = buildChatMessages([], "alo", "store");
  assertEquals(
    messages.filter((m) => m.role === "user").map((m) => m.content),
    ["alo"],
  );
});

Deno.test("disables GLM thinking so the reply is a single fast completion", async () => {
  Deno.env.set("glm_api_key", "test-key");
  const originalFetch = globalThis.fetch;
  let body: { thinking?: { type: string } } | undefined;
  globalThis.fetch = ((_input, init) => {
    const raw = (init as { body?: string } | undefined)?.body;
    body = JSON.parse(String(raw)) as { thinking?: { type: string } };
    return Promise.resolve(
      new Response(
        JSON.stringify({ choices: [{ message: { content: "أهلاً" } }] }),
        { status: 200 },
      ),
    );
  }) as typeof fetch;

  try {
    const reply = await generateReply([], "alo", "store");
    assertEquals(reply, "أهلاً");
    assertEquals(body?.thinking, { type: "disabled" });
  } finally {
    globalThis.fetch = originalFetch;
    Deno.env.delete("glm_api_key");
  }
});
