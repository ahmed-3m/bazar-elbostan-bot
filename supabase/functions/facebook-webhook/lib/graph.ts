const GRAPH_API_VERSION = "v21.0";

export async function sendTextMessage(psid: string, text: string) {
  const pageAccessToken = Deno.env.get("PAGE_ACCESS_TOKEN")!;
  const url =
    `https://graph.facebook.com/${GRAPH_API_VERSION}/me/messages?access_token=${pageAccessToken}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      recipient: { id: psid },
      message: { text },
      messaging_type: "RESPONSE",
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Graph API send failed (${res.status}): ${body}`);
  }
}
