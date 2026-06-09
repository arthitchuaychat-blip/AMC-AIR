import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const hasConfig = Boolean(url && anon && !url.includes("your-project-ref"));

// If config is missing we still export a client-like object guard so the app
// can render a friendly "set up .env" screen instead of crashing.
export const supabase = hasConfig ? createClient(url, anon) : null;
