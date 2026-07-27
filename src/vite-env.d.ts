/// <reference types="vite/client" />

/**
 * The Supabase pair is optional by design. With neither set the game runs
 * exactly as before and the daily board falls back to a device-local list, so a
 * fresh clone with no `.env` is still a working game.
 */
interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  /** The publishable (anon) key. Never the service-role key — this ships to the browser. */
  readonly VITE_SUPABASE_ANON_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
