import { createClient } from "jsr:@supabase/supabase-js@2";

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
