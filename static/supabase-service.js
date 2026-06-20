import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  SUPABASE_LIBRARY_TABLE,
  SUPABASE_PUBLISHABLE_KEY,
  SUPABASE_URL,
} from "./supabase-config.js";

let supabaseClient = null;

export function hasSupabaseConfig() {
  const url = String(SUPABASE_URL || "").trim();
  const key = String(SUPABASE_PUBLISHABLE_KEY || "").trim();
  if (!url || !key) return false;
  if (url.includes("SEU-PROJETO")) return false;
  if (key.includes("SUA_PUBLISHABLE_KEY")) return false;
  return true;
}

export function getSupabaseClient() {
  if (!hasSupabaseConfig()) {
    throw new Error("Supabase nao configurado. Preencha static/supabase-config.js.");
  }
  if (!supabaseClient) {
    supabaseClient = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
      },
    });
  }
  return supabaseClient;
}

export async function signInAnonymouslyIfNeeded() {
  const supabase = getSupabaseClient();
  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;
  if (session) return session;

  const { data, error } = await supabase.auth.signInAnonymously();
  if (error) throw error;
  return data.session || null;
}

export async function fetchPublicAnimations() {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from(SUPABASE_LIBRARY_TABLE)
    .select("*")
    .eq("is_public", true)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function publishAnimation(entry, userMeta = {}) {
  const supabase = getSupabaseClient();
  await signInAnonymouslyIfNeeded();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError) throw userError;
  if (!user) {
    throw new Error("Nao foi possivel identificar o usuario do Supabase.");
  }

  const payload = {
    name: entry.name,
    preset_name: entry.presetName || "custom",
    preview_color: entry.previewColor || "#55D6C2",
    preset_speed: Number(entry.presetSpeed || 90),
    loop: Number(entry.loop || 1),
    suffix: entry.suffix || "",
    origin_x: Number(entry.originX || 1),
    origin_y: Number(entry.originY || 1),
    preview_rate_percent: Number(entry.previewRatePercent || 100),
    events: Array.isArray(entry.events) ? entry.events : [],
    author_id: user.id,
    author_name: String(userMeta.authorName || user.user_metadata?.name || "Usuario"),
    is_public: true,
  };

  const { data, error } = await supabase
    .from(SUPABASE_LIBRARY_TABLE)
    .insert(payload)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deletePublishedAnimation(entryId) {
  const supabase = getSupabaseClient();
  await signInAnonymouslyIfNeeded();
  const { error } = await supabase.from(SUPABASE_LIBRARY_TABLE).delete().eq("id", entryId);
  if (error) throw error;
}
