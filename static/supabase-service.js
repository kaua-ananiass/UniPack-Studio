import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const PROJECTS_TABLE = "projects";
const DEFAULT_CONFIG = {
  SUPABASE_URL: "",
  SUPABASE_PUBLISHABLE_KEY: "",
  SUPABASE_LIBRARY_TABLE: "led_library",
  SUPABASE_PROJECT_AUDIO_BUCKET: "project-audio",
};

const runtimeConfig = await loadSupabaseRuntimeConfig();
const SUPABASE_URL = runtimeConfig.SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = runtimeConfig.SUPABASE_PUBLISHABLE_KEY;
const SUPABASE_LIBRARY_TABLE = runtimeConfig.SUPABASE_LIBRARY_TABLE;
const SUPABASE_PROJECT_AUDIO_BUCKET = runtimeConfig.SUPABASE_PROJECT_AUDIO_BUCKET;

let supabaseClient = null;

async function loadSupabaseRuntimeConfig() {
  const merged = { ...DEFAULT_CONFIG };

  const apiConfig = await loadConfigFromApi();
  Object.assign(merged, normalizeSupabaseConfig(apiConfig));

  if (!merged.SUPABASE_URL || !merged.SUPABASE_PUBLISHABLE_KEY) {
    const fileConfig = await loadConfigFromModule("./supabase-config.js");
    Object.assign(merged, normalizeSupabaseConfig(fileConfig));
  }

  if (!merged.SUPABASE_URL || !merged.SUPABASE_PUBLISHABLE_KEY) {
    const exampleConfig = await loadConfigFromModule("./supabase-config.example.js");
    Object.assign(merged, normalizeSupabaseConfig(exampleConfig));
  }

  return merged;
}

async function loadConfigFromApi() {
  try {
    const response = await fetch("/api/runtime-config", { cache: "no-store" });
    if (!response.ok) return null;
    const contentType = String(response.headers.get("content-type") || "").toLowerCase();
    if (!contentType.includes("application/json")) return null;
    return await response.json();
  } catch (error) {
    return null;
  }
}

async function loadConfigFromModule(modulePath) {
  try {
    return await import(modulePath);
  } catch (error) {
    return null;
  }
}

function normalizeSupabaseConfig(config) {
  if (!config || typeof config !== "object") {
    return { ...DEFAULT_CONFIG };
  }
  return {
    SUPABASE_URL: String(config.SUPABASE_URL ?? config.supabaseUrl ?? "").trim(),
    SUPABASE_PUBLISHABLE_KEY: String(
      config.SUPABASE_PUBLISHABLE_KEY ?? config.supabasePublishableKey ?? ""
    ).trim(),
    SUPABASE_LIBRARY_TABLE:
      String(config.SUPABASE_LIBRARY_TABLE ?? config.supabaseLibraryTable ?? "led_library").trim() || "led_library",
    SUPABASE_PROJECT_AUDIO_BUCKET:
      String(config.SUPABASE_PROJECT_AUDIO_BUCKET ?? config.supabaseProjectAudioBucket ?? "project-audio").trim()
      || "project-audio",
  };
}

export function getProjectAudioBucketName() {
  return String(SUPABASE_PROJECT_AUDIO_BUCKET || "project-audio").trim() || "project-audio";
}

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
    throw new Error("Supabase nao configurado. Preencha static/supabase-config.js ou configure as variaveis do servidor.");
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

export async function getCurrentSession() {
  const supabase = getSupabaseClient();
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();
  if (error) throw error;
  return session || null;
}

export async function getCurrentUser() {
  const supabase = getSupabaseClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error) throw error;
  return user || null;
}

export function onAuthStateChange(callback) {
  const supabase = getSupabaseClient();
  return supabase.auth.onAuthStateChange(callback);
}

export async function signUpWithEmail(email, password, redirectTo) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: redirectTo ? { emailRedirectTo: redirectTo } : undefined,
  });
  if (error) throw error;
  return data;
}

export async function signInWithEmail(email, password) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (error) throw error;
  return data;
}

export async function signOutCurrentUser() {
  const supabase = getSupabaseClient();
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

async function requireAuthenticatedUser() {
  const user = await getCurrentUser();
  if (!user) {
    throw new Error("Entre com email e senha para publicar ou gerenciar suas animacoes.");
  }
  return user;
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

export async function publishAnimation(entry) {
  const supabase = getSupabaseClient();
  await requireAuthenticatedUser();

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
  await requireAuthenticatedUser();
  const { error } = await supabase.from(SUPABASE_LIBRARY_TABLE).delete().eq("id", entryId);
  if (error) throw error;
}

export async function fetchOwnProjects() {
  const supabase = getSupabaseClient();
  const user = await requireAuthenticatedUser();
  const { data, error } = await supabase
    .from(PROJECTS_TABLE)
    .select("*")
    .eq("owner_id", user.id)
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function createCloudProjectRecord(name, projectData) {
  const supabase = getSupabaseClient();
  const user = await requireAuthenticatedUser();
  const payload = {
    owner_id: user.id,
    name: String(name || "Novo UniPack"),
    project_data: projectData,
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await supabase.from(PROJECTS_TABLE).insert(payload).select().single();
  if (error) throw error;
  return data;
}

export async function updateCloudProjectRecord(projectId, name, projectData) {
  const supabase = getSupabaseClient();
  await requireAuthenticatedUser();
  const payload = {
    name: String(name || "Novo UniPack"),
    project_data: projectData,
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await supabase
    .from(PROJECTS_TABLE)
    .update(payload)
    .eq("id", projectId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteCloudProjectRecord(projectId) {
  const supabase = getSupabaseClient();
  await requireAuthenticatedUser();
  const { error } = await supabase.from(PROJECTS_TABLE).delete().eq("id", projectId);
  if (error) throw error;
}

export async function uploadProjectAudioClip(projectId, relativePath, bytes, contentType = "audio/wav") {
  const supabase = getSupabaseClient();
  const user = await requireAuthenticatedUser();
  const safeProjectId = String(projectId || "").trim();
  const safeRelativePath = sanitizeStorageRelativePath(relativePath);
  if (!safeProjectId) {
    throw new Error("Projeto online invalido para enviar o audio.");
  }
  if (!safeRelativePath) {
    throw new Error("Nome do audio invalido para enviar ao projeto online.");
  }

  const bucket = getProjectAudioBucketName();
  const storagePath = `${user.id}/${safeProjectId}/${safeRelativePath}`;
  const { error } = await supabase.storage.from(bucket).upload(storagePath, bytes, {
    contentType,
    upsert: false,
  });
  if (error) throw error;
  return {
    bucket,
    storagePath,
    relativePath: safeRelativePath,
  };
}

export async function removeProjectAudioClip(storagePath) {
  const supabase = getSupabaseClient();
  await requireAuthenticatedUser();
  const normalizedPath = String(storagePath || "").trim();
  if (!normalizedPath) return;
  const { error } = await supabase.storage.from(getProjectAudioBucketName()).remove([normalizedPath]);
  if (error) throw error;
}

export async function createProjectAudioSignedUrl(storagePath, expiresInSeconds = 3600) {
  const supabase = getSupabaseClient();
  await requireAuthenticatedUser();
  const normalizedPath = String(storagePath || "").trim();
  if (!normalizedPath) {
    throw new Error("Audio do projeto online nao encontrado.");
  }
  const { data, error } = await supabase.storage
    .from(getProjectAudioBucketName())
    .createSignedUrl(normalizedPath, expiresInSeconds);
  if (error) throw error;
  return data?.signedUrl || "";
}

function sanitizeStorageRelativePath(value) {
  return String(value || "")
    .replace(/\\/g, "/")
    .split("/")
    .filter((part) => part && part !== "." && part !== "..")
    .map((part) => part.replace(/[^a-z0-9_\-\.]+/gi, "_"))
    .join("/");
}
