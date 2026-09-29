import { supabase } from "./supabase";

const now = () => new Date().toISOString();

// Load everything needed when the app opens
export async function pullAll(userId, date) {
  const [s, d, h] = await Promise.all([
    supabase.from("user_settings").select("data").eq("user_id", userId).maybeSingle(),
    supabase.from("days").select("data").eq("user_id", userId).eq("date", date).maybeSingle(),
    supabase.from("history").select("entry").eq("user_id", userId).order("date", { ascending: true }),
  ]);
  if (s.error) throw s.error;
  if (d.error) throw d.error;
  if (h.error) throw h.error;
  return {
    settings: s.data ? s.data.data : null,
    day: d.data ? d.data.data : null,
    history: (h.data || []).map((r) => r.entry),
  };
}

export async function pushSettings(userId, data) {
  const { error } = await supabase
    .from("user_settings")
    .upsert({ user_id: userId, data, updated_at: now() });
  if (error) throw error;
}

export async function pushDay(userId, date, data) {
  const { error } = await supabase
    .from("days")
    .upsert({ user_id: userId, date, data, updated_at: now() }, { onConflict: "user_id,date" });
  if (error) throw error;
}

export async function pushHistory(userId, entries) {
  if (!entries.length) return;
  const rows = entries.map((e) => ({ user_id: userId, date: e.date, entry: e, updated_at: now() }));
  const { error } = await supabase.from("history").upsert(rows, { onConflict: "user_id,date" });
  if (error) throw error;
}