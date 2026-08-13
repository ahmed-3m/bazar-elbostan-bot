export interface MessagingEvent {
  sender: { id: string };
  timestamp?: number;
  message?: { mid?: string; text?: string; is_echo?: boolean };
}

export interface HistoryItem {
  direction: "in" | "out";
  content: string;
}

export interface EventDeps {
  claimMid: (mid: string) => Promise<boolean>;
  releaseMid: (mid: string) => Promise<void>;
  upsertCustomer: (psid: string) => Promise<void>;
  saveMessage: (
    psid: string,
    direction: "in" | "out",
    content: string,
  ) => Promise<void>;
  getRecentHistory: (psid: string) => Promise<HistoryItem[]>;
  getStoreContext: () => Promise<string>;
  generateReply: (
    history: HistoryItem[],
    text: string,
    storeContext: string,
  ) => Promise<string>;
  sendTextMessage: (psid: string, text: string) => Promise<void>;
}

export function eventId(event: MessagingEvent, text: string): string {
  return event.message?.mid ??
    `${event.sender.id}:${event.timestamp ?? ""}:${text}`;
}

export async function handleEvent(event: MessagingEvent, deps: EventDeps) {
  const psid = event.sender.id;
  const text = event.message?.text;
  if (!text || event.message?.is_echo) return;

  const mid = eventId(event, text);
  const claimed = await deps.claimMid(mid);
  if (!claimed) return;

  let messageSent = false;
  try {
    await deps.upsertCustomer(psid);
    await deps.saveMessage(psid, "in", text);

    const [history, storeContext] = await Promise.all([
      deps.getRecentHistory(psid),
      deps.getStoreContext(),
    ]);
    const reply = await deps.generateReply(history, text, storeContext);

    // Logged before the send so delivery status is visible when it fails — e.g.
    // a synthetic PSID used for local testing, or a real customer the app can't
    // message yet while it's in development mode.
    console.log(`sending reply (length=${reply.length})`);

    await deps.sendTextMessage(psid, reply);
    messageSent = true;
    await deps.saveMessage(psid, "out", reply);
  } catch (err) {
    // Only release the mid if we failed before sending — otherwise retrying the
    // webhook would cause a duplicate message to be sent.
    if (!messageSent) {
      await deps.releaseMid(mid);
    }
    throw err;
  }
}
