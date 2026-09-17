import { createClient } from "@supabase/supabase-js";

// Kredensial default Supabase Linguist.AI agar deployment di Vercel langsung berfungsi
// tanpa perlu repot memasukkan variabel lingkungan secara manual di dashboard Vercel.
const DEFAULT_SUPABASE_URL = "https://bwvpqznevaeatawrdrro.supabase.co";
const DEFAULT_SUPABASE_ANON_KEY = "sb_publishable_HGJgi7_n6eH0_-y4NNDGFw_TdBXZkSk";

const supabaseUrl =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_SUPABASE_URL) ||
  DEFAULT_SUPABASE_URL;

const supabaseAnonKey =
  (typeof import.meta !== "undefined" &&
    (import.meta.env?.VITE_SUPABASE_PUBLISHABLE_KEY ||
      import.meta.env?.VITE_SUPABASE_ANON_KEY)) ||
  DEFAULT_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

