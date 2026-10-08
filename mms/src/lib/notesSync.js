import { supabase } from "./supabase";

export const IMG_BUCKET = "note-images";

// only photos that already live in storage go into the database row
const cleanImages = (imgs) =>
  (imgs || [])
    .filter((i) => i.path)
    .map((i) => ({ id: i.id, path: i.path, name: i.name || "" }));

const toRow = (userId, n) => ({
  user_id: userId,
  id: n.id,
  title: n.title || "",
  section: n.section || "General",
  color: n.color || "none",
  pinned: !!n.pinned,
  tags: n.tags || [],
  blocks: n.blocks || [],
  images: cleanImages(n.images),
  created_at: new Date(n.createdAt || Date.now()).toISOString(),
  updated_at: new Date(n.updatedAt || Date.now()).toISOString(),
});

const fromRow = (r) => ({
  id: r.id,
  title: r.title,
  section: r.section,
  color: r.color,
  pinned: r.pinned,
  tags: r.tags || [],
  blocks: r.blocks || [],
  images: r.images || [],
  createdAt: Date.parse(r.created_at),
  updatedAt: Date.parse(r.updated_at),
});

export async function pullNotes(userId) {
  const { data, error } = await supabase
    .from("notes")
    .select("*")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return (data || []).map(fromRow);
}

export async function pushNotes(userId, notes) {
  if (!notes.length) return;
  const { error } = await supabase
    .from("notes")
    .upsert(notes.map((n) => toRow(userId, n)), { onConflict: "user_id,id" });
  if (error) throw error;
}

export async function deleteNotes(userId, ids) {
  if (!ids.length) return;
  // remove each note's photos first (best effort), then the rows
  for (const id of ids) {
    try {
      const folder = `${userId}/${id}`;
      const { data: files } = await supabase.storage.from(IMG_BUCKET).list(folder);
      if (files && files.length) {
        await supabase.storage.from(IMG_BUCKET).remove(files.map((f) => `${folder}/${f.name}`));
      }
    } catch (e) {
      /* ignore: the row delete below still goes ahead */
    }
  }
  const { error } = await supabase.from("notes").delete().eq("user_id", userId).in("id", ids);
  if (error) throw error;
}

export async function pullSections(userId) {
  const { data, error } = await supabase
    .from("note_sections")
    .select("name,position")
    .eq("user_id", userId)
    .order("position", { ascending: true });
  if (error) throw error;
  return (data || []).map((r) => r.name);
}

export async function pushSections(userId, names) {
  if (!names.length) return;
  const rows = names.map((name, i) => ({ user_id: userId, name, position: i }));
  const { error } = await supabase
    .from("note_sections")
    .upsert(rows, { onConflict: "user_id,name" });
  if (error) throw error;
}

// ---------- photos ----------
// img.local is a data URL held on this device until it is uploaded
export async function uploadImage(userId, noteId, img) {
  const blob = await (await fetch(img.local)).blob();
  const path = `${userId}/${noteId}/${img.id}.jpg`;
  const { error } = await supabase.storage
    .from(IMG_BUCKET)
    .upload(path, blob, { contentType: "image/jpeg", upsert: true });
  if (error) throw error;
  return path;
}

export async function signedUrl(path, seconds = 3600) {
  const { data, error } = await supabase.storage.from(IMG_BUCKET).createSignedUrl(path, seconds);
  if (error) throw error;
  return data.signedUrl;
}

export async function removeImages(paths) {
  if (!paths.length) return;
  const { error } = await supabase.storage.from(IMG_BUCKET).remove(paths);
  if (error) throw error;
}