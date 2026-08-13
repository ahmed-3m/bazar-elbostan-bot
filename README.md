# بازار البستان — Facebook Messenger Customer Service Bot

An open-source AI customer service agent that replies automatically to real
customers on a Facebook Page's Messenger inbox. Built for **بازار البستان**
(Bazar Elbostan), but the code is store-agnostic — swap in your own store
info and it works for any Facebook Page.

## What it does

When a customer messages the Page — asking about prices, opening hours,
delivery areas, payment methods, or anything else about the store — the bot:

1. Receives the message instantly via a Meta Messenger webhook.
2. Looks up the customer's recent conversation history for context.
3. Generates a reply with an LLM, **grounded only in the store's real
   info** (products, prices, hours, delivery, policies) — it never invents
   a price, stock level, or policy it doesn't actually know.
4. If it can't answer confidently from that info, it says a team member
   will follow up instead of guessing.
5. Sends the reply back through the Messenger API and logs the exchange.

The goal is to handle the repetitive "how much is X" / "are you open
Sunday" / "do you deliver to Y" questions that make up most of a small
store's inbound Messenger traffic, so a human only needs to step in for the
rest.

## Architecture

- **Runtime:** Supabase Edge Functions (Deno) — a single `facebook-webhook`
  function handles Meta's webhook verification handshake and every
  incoming message event.
- **Database:** Supabase Postgres — `customers` (one row per Messenger
  user, keyed by their page-scoped ID), `messages` (full conversation log,
  used to give the LLM short-term memory), and `store_config` (single row
  holding the store's real info, kept out of source so it never has to be
  committed to this public repo).
- **LLM:** [Zhipu/GLM](https://open.bigmodel.cn) Coding Plan API (model
  configurable via env var, defaults to `glm-4.7-flash`).
- **Messaging:** Meta Graph API (`/me/messages`) for sending replies.

```text
supabase/
  functions/facebook-webhook/
    index.ts               # webhook verification (GET) + message events (POST)
    lib/graph.ts            # sendTextMessage() → Graph API
    lib/llm.ts               # generateReply() → GLM chat completion
    lib/store_context.ts     # generic public-safe fallback only — real content lives in store_config
    lib/db.ts                 # customer/message persistence + getStoreContext()
  migrations/                 # Postgres schema, incl. store_config (0003)
```

## Setup

1. **Create a Supabase project** and apply the migrations in
   `supabase/migrations/`.
2. **Create a Meta App** with the "Engage with customers on Messenger from
   Meta" use case, connect a Business Portfolio, and add your Facebook
   Page to it. Generate a **Page Access Token** from Messenger API
   Settings.
3. **Fill in your store's real info** by inserting/updating a row in the
   `store_config` table (see `supabase/migrations/0003_store_config.sql`) —
   products, prices, hours, delivery, payment methods, return policy,
   address, FAQs, e.g. via Supabase Studio or
   `UPDATE public.store_config SET content = '...' WHERE id = 'default'`.
   This is what grounds every reply; the bot only knows what's in that row.
   Never put real contact/business info in
   `lib/store_context.ts` — it's a public source file and only holds a
   generic fallback used when the row is missing.
4. **Set secrets:**
   ```bash
   supabase secrets set PAGE_ACCESS_TOKEN=... VERIFY_TOKEN=... glm_api_key=...
   ```
   (`SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` are auto-injected by the
   Edge Functions runtime.)
5. **Deploy the function — important:** must use `--no-verify-jwt`, since
   Meta calls this webhook with no Supabase auth header at all
   (verification is via `hub.verify_token` on the GET handshake, and
   there's no bearer token on POST events):
   ```bash
   supabase functions deploy facebook-webhook --no-verify-jwt
   ```
6. **Configure the webhook in Meta's Messenger API Settings** — paste the
   deployed function URL as the Callback URL, your `VERIFY_TOKEN` as the
   Verify Token, click "Verify and save", then subscribe to the `messages`
   field.
7. **Test in Dev Mode** — while the Meta app is unpublished, only Page
   admins/testers can message the Page and get bot replies. Submit the
   `pages_messaging` permission for App Review once it's working, to let
   the general public message the Page.

See [`SPEC.md`](SPEC.md) for the full build log and current status, and
[`TESTING.md`](TESTING.md) for the production testing checklist —
webhook correctness, conversation memory, multi-language handling,
failure/retry behavior, security, cost, and Meta App Review readiness.

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `PAGE_ACCESS_TOKEN` | yes | From Meta → Messenger API Settings |
| `VERIFY_TOKEN` | yes | Any random string; must match the Verify Token typed into Meta's webhook config |
| `glm_api_key` | yes | Zhipu/GLM Coding Plan key (`sk-sp-...`) for reply generation |
| `GLM_MODEL` | no | Defaults to `glm-4.7-flash` |

## Scope

Currently handles Messenger DMs only. Not in scope yet: public post/comment
replies, multi-language configuration beyond "reply in whatever language
the customer used", and human handoff/escalation flows.

## License

MIT — see [LICENSE](LICENSE).
