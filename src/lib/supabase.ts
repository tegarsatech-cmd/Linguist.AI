import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
// Supabase bisa memakai nama lama (anon key) atau baru (publishable key)
const supabaseAnonKey =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Supabase tidak terkonfigurasi: set VITE_SUPABASE_URL dan VITE_SUPABASE_ANON_KEY di .env atau dashboard Vercel."
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
