import { Heading, Type, List, ListOrdered, ListChecks, Quote, Lightbulb, Minus } from "lucide-react";

export function readLS(key, fallback) {
  if (typeof window === "undefined") return fallback;
  try {
    const v = window.localStorage.getItem(key);
    return v === null ? fallback : JSON.parse(v);
  } catch (e) {
    return fallback;
  }
}

export function writeLS(key, value) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    /* ignore quota / privacy-mode errors */
  }
}

export const uid = (p = "n") => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

export const DEFAULT_SECTIONS = ["Strategies", "Rules", "Psychology", "Ideas", "General"];

export const COLORS = [
  { k: "none", v: "transparent", l: "None" },
  { k: "gold", v: "#e8c97a", l: "Gold" },
  { k: "teal", v: "#34e0a1", l: "Green" },
  { k: "rose", v: "#ff6b7d", l: "Red" },
  { k: "blue", v: "#6fa3ff", l: "Blue" },
  { k: "violet", v: "#b394ff", l: "Violet" },
];

export const colorOf = (k) => (COLORS.find((c) => c.k === k) || COLORS[0]).v;

export const newBlock = (type = "text", text = "") => ({ id: uid("b"), type, text, checked: false });

export const PLACEHOLDER = {
  text: "Write something…",
  h: "Heading",
  bullet: "List item",
  number: "List item",
  check: "To-do",
  quote: "Quote",
  callout: "Key point to remember",
};

export function blockPlain(b) {
  if (!b || b.type === "divider") return "";
  return (b.text || "").trim();
}

export function fmtDate(ts) {
  const d = new Date(ts);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return "Today " + d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  const y = new Date(now);
  y.setDate(now.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return "Yesterday";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: d.getFullYear() === now.getFullYear() ? undefined : "numeric" });
}

export const MAX_IMAGES = 6;

export const BLOCK_TOOLS = [
  { type: "h", label: "Heading", Icon: Heading },
  { type: "text", label: "Text", Icon: Type },
  { type: "bullet", label: "Bullets", Icon: List },
  { type: "number", label: "Numbered", Icon: ListOrdered },
  { type: "check", label: "Checklist", Icon: ListChecks },
  { type: "quote", label: "Quote", Icon: Quote },
  { type: "callout", label: "Callout", Icon: Lightbulb },
  { type: "divider", label: "Divider", Icon: Minus },
];

export const MD_SHORTCUTS = [
  [/^(- |\* )/, "bullet"],
  [/^1\. /, "number"],
  [/^\[\] /, "check"],
  [/^# /, "h"],
  [/^> /, "quote"],
  [/^! /, "callout"],
];

export function numberBlocks(blocks) {
  const out = {};
  let n = 0;
  blocks.forEach((b) => {
    if (b.type === "number") { n += 1; out[b.id] = n; } else n = 0;
  });
  return out;
}

export const isEmptyNote = (n) =>
  !(n.title || "").trim() &&
  !(n.images || []).length &&
  n.blocks.every((b) => b.type !== "divider" && !blockPlain(b));

export function fmtFull(ts) {
  return new Date(ts).toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export const sig = (n) => n.updatedAt + "|" + (n.images || []).map((i) => (i.path ? "p" : "l")).join("");

export const swapImages = (cur, uploaded) =>
  cur.map((i) => {
    const u = uploaded.find((x) => x.id === i.id && x.path);
    return u ? { id: u.id, path: u.path, name: u.name } : i;
  });

export const cloneNote = (n) => ({
  ...n,
  tags: n.tags.slice(),
  blocks: n.blocks.map((b) => ({ ...b })),
  images: (n.images || []).map((i) => ({ ...i })),
});
