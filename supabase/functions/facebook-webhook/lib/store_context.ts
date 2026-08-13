// Fallback only — real store info (products, prices, hours, contact
// details, address, etc.) lives in the private `store_config` table, not
// in source code, so it never has to be committed to this public repo.
// See lib/db.ts's getStoreContext() and supabase/migrations/0003_store_config.sql.
export const DEFAULT_STORE_CONTEXT = `
Store name: بازار البستان (Bazar Elbostan)

Store info has not been configured yet. If asked anything, say a team
member will follow up rather than guessing.
`.trim();
