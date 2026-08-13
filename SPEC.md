# Facebook Messenger Reply Bot — بازار البستان (Bazar Elbostan)

## Goal
An AI agent that replies automatically to customers who message the Facebook
Page **بازار البستان** on Messenger. Standalone project — separate business,
separate Supabase project, **not** part of the Sihem personal-mentor codebase
(that repo was only used as a reference pattern for the webhook shape).

## Decisions made so far (defaults chosen when not explicitly confirmed by the user — revisit if wrong)
- **Backend:** new, standalone Supabase project (Edge Functions + Postgres),
  isolated from Sihem's prod project. Free tier ($0/mo), org `ahmed-3m`
  (org id `feqvyxpvbnouqfqbjqjs`). **Created 2026-08-13** — project ref
  `hurfcblefuwhuluimqjj`, region `eu-west-1`, URL
  `https://hurfcblefuwhuluimqjj.supabase.co`. `0001_init.sql` and
  `0002_enable_rls.sql` (RLS enabled, no policies — tables are only ever
  touched via the service_role key, which bypasses RLS) applied.
- **Bot behavior:** AI-generated replies (LLM), grounded in a store
  knowledge-base string injected into the system prompt — not rule-based
  canned replies. Falls back to "someone will follow up" if the LLM can't
  answer rather than inventing prices/stock/policy.
- **LLM provider:** Zhipu/GLM Coding Plan API (`glm_api_key`, must be a
  Coding Plan key since the code calls the `/api/coding/` path), default
  model `glm-4.7-flash`, overridable via `GLM_MODEL` env var without a
  redeploy. **Changed from OpenRouter on 2026-08-13** — see git log.

## Meta / Facebook app state
- **App name:** "Bazar Elbostan", App ID `1797449671251704` (visible in the
  OAuth URL `facebook.com/dialog/oauth?client_id=1797449671251704`).
- **Use case:** "Engage with customers on Messenger from Meta" only (under
  the Business messaging filter) — correct, no other use cases needed.
- **Business Portfolio:** was **NOT** connected at app-creation time (user
  picked "I don't want to connect a business portfolio yet"). This is the
  suspected root cause of the blocker below.
- **Target Page:** بازار البستان. Two different IDs surfaced during setup —
  **this needs to be resolved/confirmed before going further**:
  - `1171763356016120` — the Page ID shown in the Facebook Login for
    Business "Choose the Pages you want Bazar Elbostan to access" picker
    (the only Page listed there, so presumably the one the user's FB
    account actually administers).
  - `61590660570774` — the ID from a `facebook.com/profile.php?id=...` URL
    the user pasted earlier as "the page" the bot should serve. Never
    confirmed whether this is the same entity as above or a different
    Page/personal profile. `profile.php` URLs are used for both Pages and
    personal profiles, so this may simply be a different representation —
    or a genuinely different Page. **Verify by opening the Page → About →
    Page transparency and comparing its ID against `1171763356016120`.**
- **Blocker hit:** completed the Facebook Login for Business OAuth flow
  (saw "Ahmed Mohammed has been connected to Bazar Elbostan" confirmation,
  and the Page picker correctly showed بازار البستان / `1171763356016120`
  selected), but **Messenger API Settings → section 2 ("Generate access
  tokens") still shows "No FB pages yet"** even after a page refresh.
  Never got a Page Access Token as a result.
- **Decision:** rather than keep debugging the half-connected state, redo
  the Meta app setup **from scratch**, this time connecting a real Business
  Portfolio at creation time (Business Settings → Accounts → Pages should
  show بازار البستان as a registered asset, and Business Settings →
  Accounts → Apps should show the app with access to it — this app-level
  asset assignment is suspected to be the missing piece that the ad-hoc
  consumer OAuth popup alone doesn't create).

## What's already built locally (this directory)
```
supabase/
  config.toml                              # from `supabase init`
  migrations/0001_init.sql                 # customers + messages tables
  migrations/0002_enable_rls.sql           # RLS on customers/messages, no policies
  migrations/0003_store_config.sql         # store_config table (schema only, see below)
  functions/facebook-webhook/
    index.ts                               # GET verify (hub.challenge) + POST event loop
    lib/graph.ts                           # sendTextMessage() → Graph API v21.0 POST /me/messages
    lib/llm.ts                             # generateReply(history, text, storeContext) → GLM chat completion
    lib/store_context.ts                   # DEFAULT_STORE_CONTEXT fallback only — see note below
    lib/db.ts                              # Supabase client + upsertCustomer/saveMessage/getRecentHistory/getStoreContext
```
This has now had one review pass (2026-08-13, see git log) — not yet a full
security/correctness audit.

## Real store info lives in the database, NOT in the repo
`lib/store_context.ts` only exports a generic `DEFAULT_STORE_CONTEXT`
fallback — safe to have public since this repo is a public GitHub repo.
The store's real info (products, prices, hours, phone/WhatsApp, email,
physical address, etc.) is a single row in the `store_config` table on the
live Supabase project (ref `hurfcblefuwhuluimqjj`), inserted directly via
SQL — it was never committed to git. `getStoreContext()` in `lib/db.ts`
reads that row at request time and falls back to the generic default if
the row is missing or the query fails.

**To update the real store info:** run an `UPDATE public.store_config SET
content = '...' WHERE id = 'default'` against the live project (Supabase
Studio or the MCP `execute_sql` tool) — do not put real contact info back
into `lib/store_context.ts`, it's a public file.

Still incomplete in that row (marked TODO in the content itself): exact
prices/brands/models in stock, delivery areas/cost, payment methods
accepted, return/exchange/warranty policy, common FAQs.

## Remaining setup steps (in order)
1. **Resolve the Page ID discrepancy** above — confirm which Page is the
   real target.
2. **Redo the Meta app setup with a Business Portfolio connected**, and get
   `Messenger API Settings → section 2` to actually show the Page (not "No
   FB pages yet") and generate a **Page Access Token**.
3. ~~Create the Supabase project~~ — **done 2026-08-13**, ref
   `hurfcblefuwhuluimqjj`, see above.
4. ~~Apply `supabase/migrations/0001_init.sql`~~ — **done**, plus
   `0002_enable_rls.sql`.
5. **Set secrets:** `PAGE_ACCESS_TOKEN` (from step 2), `VERIFY_TOKEN`
   (any random string, needs to match what's typed into Meta's Webhooks
   Callback config), `glm_api_key` (Coding Plan key). `SUPABASE_URL` /
   `SUPABASE_SERVICE_ROLE_KEY` are auto-injected by the Edge Functions
   runtime — no need to set those manually.
6. **Deploy `facebook-webhook` with `--no-verify-jwt`** — Meta calls this
   endpoint with no Supabase auth header at all (verification is via the
   `hub.verify_token` query param on GET, and there's no bearer token on
   POST events), so a plain deploy would 401 before the function code ever
   runs. This mirrors the same gotcha documented for Sihem's
   `telegram-webhook` / `pwa-api` in that repo's CLAUDE.md.
7. **Paste the resulting Callback URL + Verify Token into Meta's Messenger
   API Settings → section 1 ("Configure webhooks")**, click "Verify and
   save", then subscribe to the `messages` field.
8. **Fill in real store info** in `lib/store_context.ts` and redeploy.
9. **Test in Dev Mode** — while the app is unpublished, only Page
   admins/testers (App roles → Roles) can message the Page and get bot
   replies.
10. **App Review for `pages_messaging`** once it works, to allow the public
    to message the Page — requires a verified Business Portfolio (should
    already be in place from step 2), a screencast, and a written
    justification.

## Explicitly out of scope for now
- Public post / comment replies (this is Messenger DMs only).
- Multi-language handling beyond "the LLM replies in whatever language the
  customer used" (no separate language-detection/config layer).
- Human handoff / escalation flow.
