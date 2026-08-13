import { createClient } from "jsr:@supabase/supabase-js@2";
import { DEFAULT_STORE_CONTEXT } from "./store_context.ts";

export function getServiceClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

export async function upsertCustomer(
  psid: string,
  firstName?: string,
  lastName?: string,
) {
  const supabase = getServiceClient();
  await supabase.from("customers").upsert({
    psid,
    first_name: firstName ?? null,
    last_name: lastName ?? null,
    last_message_at: new Date().toISOString(),
  }, { onConflict: "psid" });
}

export async function saveMessage(
  psid: string,
  direction: "in" | "out",
  content: string,
) {
  const supabase = getServiceClient();
  await supabase.from("messages").insert({ psid, direction, content });
}

export async function getRecentHistory(psid: string, limit = 30) {
  const supabase = getServiceClient();
  const { data } = await supabase
    .from("messages")
    .select("direction, content, created_at")
    .eq("psid", psid)
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data ?? []).reverse();
}

export async function claimMid(mid: string): Promise<boolean> {
  const supabase = getServiceClient();
  const { error } = await supabase.from("processed_messages").insert({ mid });
  if (error?.code === "23505") return false;
  if (error && /duplicate key/i.test(error.message ?? "")) return false;
  if (error) throw error;
  return true;
}

export async function releaseMid(mid: string): Promise<void> {
  const supabase = getServiceClient();
  const { error } = await supabase.from("processed_messages").delete().eq(
    "mid",
    mid,
  );
  if (error) {
    console.error(`releaseMid failed for mid=${mid}:`, error);
  }
}

export async function getStoreContext(): Promise<string> {
  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("store_config")
    .select("content")
    .eq("id", "default")
    .maybeSingle();

  if (error || !data?.content) {
    if (error) console.error("getStoreContext failed:", error);
    return DEFAULT_STORE_CONTEXT;
  }
  return data.content;
}
