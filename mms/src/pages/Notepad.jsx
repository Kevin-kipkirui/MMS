import React, { useState, useEffect, useRef, useMemo, useCallback, useLayoutEffect } from "react";
import { supabase } from "../lib/supabase";
import { pullNotes, pushNotes, deleteNotes, pullSections, pushSections, uploadImage, removeImages, signedUrl } from "../lib/notesSync";

/**
 * <Notepad />
 * A OneNote-style notebook for strategies, rules, ideas and things to remember.
 * Sections -> notes -> block editor (text, headings, bullets, numbered, checklist, quote, callout, divider).
 * Same blue-glass / obsidian-gold theme system as <Session />.
 *
 * Storage: localStorage for now (key "td_notes", "td_note_sections").
 * Supabase later: pass `onSaveNote(note)` and `onDeleteNote(id)` props, or swap
 * the persist() / remove() helpers below for sync calls.
 */

// ---------- utilities ----------
function readLS(key, fallback) {
  if (typeof window === "undefined") return fallback;
  try {
    const v = window.localStorage.getItem(key);
    return v === null ? fallback : JSON.parse(v);
  } catch (e) {
    return fallback;
  }
}
function writeLS(key, value) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    /* ignore quota / privacy-mode errors */
  }
}
function useLocalStorageState(key, initialValue) {
  const [state, setState] = useState(() => readLS(key, initialValue));
  useEffect(() => {
    writeLS(key, state);
  }, [key, state]);
  return [state, setState];
}
const uid = (p = "n") => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

const DEFAULT_SECTIONS = ["Strategies", "Rules", "Psychology", "Ideas", "General"];

const COLORS = [
  { k: "none", v: "transparent", l: "None" },
  { k: "gold", v: "#e8c97a", l: "Gold" },
  { k: "teal", v: "#34e0a1", l: "Green" },
  { k: "rose", v: "#ff6b7d", l: "Red" },
  { k: "blue", v: "#6fa3ff", l: "Blue" },
  { k: "violet", v: "#b394ff", l: "Violet" },
];
const colorOf = (k) => (COLORS.find((c) => c.k === k) || COLORS[0]).v;

const newBlock = (type = "text", text = "") => ({ id: uid("b"), type, text, checked: false });

const BLOCK_TOOLS = [
  { type: "h", label: "Heading", icon: "H" },
  { type: "text", label: "Text", icon: "¶" },
  { type: "bullet", label: "Bullets", icon: "•" },
  { type: "number", label: "Numbered", icon: "1." },
  { type: "check", label: "Checklist", icon: "☑" },
  { type: "quote", label: "Quote", icon: "❝" },
  { type: "callout", label: "Callout", icon: "💡" },
  { type: "divider", label: "Divider", icon: "—" },
];

const PLACEHOLDER = {
  text: "Write something…",
  h: "Heading",
  bullet: "List item",
  number: "List item",
  check: "To-do",
  quote: "Quote",
  callout: "Key point to remember",
};

function blockPlain(b) {
  if (b.type === "divider") return "";
  return (b.text || "").trim();
}

function fmtDate(ts) {
  const d = new Date(ts);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return "Today " + d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  const y = new Date(now);
  y.setDate(now.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return "Yesterday";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: d.getFullYear() === now.getFullYear() ? undefined : "numeric" });
}

// ---------- photos ----------
const MAX_IMAGES = 6;

function drawToJpeg(source, sw, sh, maxDim = 1600, quality = 0.8) {
  const scale = Math.min(1, maxDim / Math.max(sw, sh));
  const w = Math.round(sw * scale);
  const h = Math.round(sh * scale);
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(source, 0, 0, w, h);
  return c.toDataURL("image/jpeg", quality);
}

function fileToJpeg(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("read"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("decode"));
      img.onload = () => resolve(drawToJpeg(img, img.width, img.height));
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

// signed links are cached so cards don't re-request them on every render
const urlCache = new Map();

function useImageSrc(img) {
  const [src, setSrc] = useState(() => {
    if (img.local) return img.local;
    const hit = img.path ? urlCache.get(img.path) : null;
    return hit && hit.exp > Date.now() ? hit.url : "";
  });
  useEffect(() => {
    if (img.local) { setSrc(img.local); return; }
    if (!img.path) return;
    const hit = urlCache.get(img.path);
    if (hit && hit.exp > Date.now()) { setSrc(hit.url); return; }
    let live = true;
    signedUrl(img.path)
      .then((url) => {
        if (!live || !url) return;
        urlCache.set(img.path, { url, exp: Date.now() + 50 * 60 * 1000 });
        setSrc(url);
      })
      .catch(() => {});
    return () => { live = false; };
  }, [img.local, img.path]);
  return src;
}

function NoteImage({ img, className, alt, onClick }) {
  const src = useImageSrc(img);
  if (!src) return <div className={`np-img-ph ${className || ""}`} aria-busy="true" />;
  return (
    <img
      className={className}
      src={src}
      alt={alt || img.name || "Note photo"}
      onClick={onClick}
      loading="lazy"
      draggable={false}
    />
  );
}

// ---------- section dropdown ----------
function SectionMenu({ value, options, counts, total, showAll, onChange, onCreate, variant = "filter", label = "Section" }) {
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const wrapRef = useRef(null);
  const listRef = useRef(null);

  const close = useCallback(() => {
    setOpen(false);
    setAdding(false);
    setName("");
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) close(); };
    const onKey = (e) => { if (e.key === "Escape") { e.stopPropagation(); close(); } };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [open, close]);

  useEffect(() => {
    if (!open || !listRef.current) return;
    const el = listRef.current.querySelector('[aria-selected="true"]') || listRef.current.querySelector('[role="option"]');
    if (el) el.focus();
  }, [open]);

  const onListKey = (e) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    const items = Array.from(listRef.current.querySelectorAll('[role="option"]'));
    const i = items.indexOf(document.activeElement);
    if (i === -1) return;
    e.preventDefault();
    const n = e.key === "ArrowDown" ? Math.min(items.length - 1, i + 1) : Math.max(0, i - 1);
    items[n].focus();
  };

  const pick = (v) => { onChange(v); close(); };
  const submit = () => {
    const n = name.trim();
    if (n) onCreate(n);
    close();
  };

  const isAll = showAll && value === "All";
  const current = isAll ? "All notes" : value;
  const count = isAll ? total : counts[value] || 0;

  const Opt = ({ v, text, n }) => {
    const sel = value === v;
    return (
      <button type="button" role="option" aria-selected={sel} className={`np-dd-opt${sel ? " sel" : ""}`} onClick={() => pick(v)}>
        {text}
        {n}
        {sel ? "✓" : ""}
      </button>
    );
  };

  return (
    <div className={`np-dd np-dd-${variant}${open ? " open" : ""}`} ref={wrapRef}>
      <button
        type="button"
        className="np-dd-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => (open ? close() : setOpen(true))}
      >
        {label}
        {current}
        {count}
      </button>
      {open && (
        <div className="np-dd-menu" role="listbox" aria-label={label} ref={listRef} onKeyDown={onListKey}>
          {showAll && (
            <>
              <Opt v="All" text="All notes" n={total} />
              <div className="np-dd-sep" />
            </>
          )}
          {options.map((s) => (
            <Opt key={s} v={s} text={s} n={counts[s] || 0} />
          ))}
          <div className="np-dd-sep" />
          {adding ? (
            <input
              className="np-dd-input"
              autoFocus
              placeholder="Section name, then Enter"
              value={name}
              maxLength={24}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
            />
          ) : (
            <button type="button" className="np-dd-new" onClick={() => setAdding(true)}>
              + New section
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ---------- in-app camera ----------
function CameraModal({ onCapture, onClose, onFallback }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [facing, setFacing] = useState("environment");
  const [ready, setReady] = useState(false);
  const [err, setErr] = useState("");
  const [flash, setFlash] = useState(false);

  const stop = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  };

  useEffect(() => {
    let cancelled = false;
    setReady(false);
    setErr("");
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setErr("unsupported");
      return;
    }
    (async () => {
      try {
        stop();
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: facing }, width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: false,
        });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        const v = videoRef.current;
        if (v) {
          v.srcObject = stream;
          await v.play();
          if (!cancelled) setReady(true);
        }
      } catch (e) {
        if (!cancelled) setErr(e && e.name === "NotAllowedError" ? "denied" : "failed");
      }
    })();
    return () => { cancelled = true; stop(); };
  }, [facing]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  const snap = () => {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return;
    setFlash(true);
    setTimeout(() => setFlash(false), 180);
    onCapture(drawToJpeg(v, v.videoWidth, v.videoHeight));
  };

  const errText =
    err === "denied" ? "Camera access is blocked. Allow it in your browser's site settings, or use the option below."
    : err === "unsupported" ? "This browser can't open the camera here (it needs a secure https page)."
    : "Couldn't start the camera.";

  return (
    <div className="np-cam-backdrop" onClick={onClose}>
      <div className="np-cam" onClick={(e) => e.stopPropagation()}>
        <video ref={videoRef} playsInline muted autoPlay className={`np-cam-video${facing === "user" ? " mirror" : ""}`} />
        {!ready && !err && <div className="np-cam-status">Starting camera…</div>}
        {err && (
          <div className="np-cam-error">
            <div>{errText}</div>
            <button type="button" className="np-cam-side" onClick={onFallback}>Use device camera / files</button>
          </div>
        )}
        <div className={`np-cam-flash${flash ? " on" : ""}`} />
        <div className="np-cam-actions">
          <button type="button" className="np-cam-side" onClick={onClose}>Cancel</button>
          <button type="button" className="np-cam-capture" onClick={snap} disabled={!ready}>Capture</button>
          <button type="button" className="np-cam-side" onClick={() => setFacing((f) => (f === "environment" ? "user" : "environment"))} disabled={!ready}>
            Flip
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------- block row ----------
function BlockRow({ block, index, numberLabel, registerRef, onChange, onKeyDown, onFocus, onToggle, onRemoveDivider, active }) {
  const taRef = useRef(null);

  useLayoutEffect(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = el.scrollHeight + "px";
  }, [block.text, block.type]);

  useEffect(() => {
    registerRef(block.id, taRef.current);
    return () => registerRef(block.id, null);
  }, [block.id, block.type, registerRef]);

  if (block.type === "divider") {
    return (
      <div className={`np-block np-divider${active ? " active" : ""}`} onClick={() => onFocus(block.id)}>
        <hr />
        <button type="button" className="np-divider-x" aria-label="Remove divider" onClick={() => onRemoveDivider(block.id)}>
          &times;
        </button>
      </div>
    );
  }

  return (
    <div className={`np-block np-${block.type}${block.checked ? " checked" : ""}${active ? " active" : ""}`}>
      {block.type === "bullet" && <span className="np-mark">•</span>}
      {block.type === "number" && <span className="np-mark np-num">{numberLabel}.</span>}
      {block.type === "check" && (
        <button
          type="button"
          className={`np-box${block.checked ? " on" : ""}`}
          role="checkbox"
          aria-checked={block.checked}
          onClick={() => onToggle(block.id)}
        >
          {block.checked ? "✓" : ""}
        </button>
      )}
      {block.type === "callout" && <span className="np-callout-ico">💡</span>}
      <textarea
        ref={taRef}
        rows={1}
        value={block.text}
        placeholder={PLACEHOLDER[block.type]}
        onChange={(e) => onChange(block.id, e.target.value)}
        onKeyDown={(e) => onKeyDown(e, block.id, index)}
        onFocus={() => onFocus(block.id)}
        spellCheck
      />
    </div>
  );
}

// ---------- editor ----------
function NoteEditor({ draft, setDraft, sections, counts, isNew, onSave, onCancel, onDelete, dirty, onCreateSection, onToast, onOpenImage }) {
  const refs = useRef({});
  const [activeId, setActiveId] = useState(draft.blocks[0] ? draft.blocks[0].id : null);
  const [focusReq, setFocusReq] = useState(null); // { id, end }
  const [tagInput, setTagInput] = useState("");

  // ---------- photos ----------
  const images = draft.images || [];
  const [photoMenu, setPhotoMenu] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const fileRef = useRef(null);
  const camRef = useRef(null);
  const photoWrapRef = useRef(null);

  useEffect(() => {
    if (!photoMenu) return;
    const onDown = (e) => { if (photoWrapRef.current && !photoWrapRef.current.contains(e.target)) setPhotoMenu(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
    };
  }, [photoMenu]);

  const addImages = (list) => {
    if (!list.length) return;
    setDraft((d) => ({ ...d, images: [...(d.images || []), ...list].slice(0, MAX_IMAGES) }));
  };

  const handleFiles = async (files) => {
    files = files.filter((f) => f.type && f.type.startsWith("image/"));
    if (!files.length) { onToast && onToast("Please choose an image file."); return; }
    const room = MAX_IMAGES - images.length;
    if (room <= 0) { onToast && onToast("Up to " + MAX_IMAGES + " photos per note."); return; }
    setPhotoBusy(true);
    const out = [];
    for (const f of files.slice(0, room)) {
      try {
        out.push({ id: uid("img"), local: await fileToJpeg(f), name: f.name || "photo.jpg" });
      } catch (e) {
        onToast && onToast("Couldn't read one of those images.");
      }
    }
    addImages(out);
    setPhotoBusy(false);
    if (files.length > room) onToast && onToast("Only " + MAX_IMAGES + " photos fit in one note.");
  };

  const onPickFiles = (e) => {
    const list = Array.from(e.target.files || []);
    e.target.value = "";
    handleFiles(list);
  };

  const openUpload = () => {
    setPhotoMenu(false);
    if (images.length >= MAX_IMAGES) { onToast && onToast("Up to " + MAX_IMAGES + " photos per note."); return; }
    if (fileRef.current) fileRef.current.click();
  };

  const openCamera = () => {
    setPhotoMenu(false);
    if (images.length >= MAX_IMAGES) { onToast && onToast("Up to " + MAX_IMAGES + " photos per note."); return; }
    if (window.isSecureContext && navigator.mediaDevices && navigator.mediaDevices.getUserMedia) setCameraOpen(true);
    else if (camRef.current) camRef.current.click();
  };

  const onCaptured = (dataUrl) => {
    addImages([{ id: uid("img"), local: dataUrl, name: "capture-" + Date.now() + ".jpg" }]);
    setCameraOpen(false);
  };

  const removeImage = (id) => setDraft((d) => ({ ...d, images: (d.images || []).filter((i) => i.id !== id) }));

  const registerRef = useCallback((id, el) => {
    if (el) refs.current[id] = el;
    else delete refs.current[id];
  }, []);

  // focus requested block after render
  useEffect(() => {
    if (!focusReq) return;
    const el = refs.current[focusReq.id];
    if (el) {
      el.focus();
      const pos = focusReq.end ? el.value.length : 0;
      try { el.setSelectionRange(pos, pos); } catch (e) { /* ignore */ }
    }
    setFocusReq(null);
  }, [focusReq, draft.blocks]);

  // first open: focus the title for new notes
  const titleRef = useRef(null);
  useEffect(() => {
    if (isNew && titleRef.current) titleRef.current.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setBlocks = (fn) => setDraft((d) => ({ ...d, blocks: fn(d.blocks) }));

  const changeText = (id, text) =>
    setBlocks((bs) => bs.map((b) => (b.id === id ? { ...b, text } : b)));

  const toggleCheck = (id) =>
    setBlocks((bs) => bs.map((b) => (b.id === id ? { ...b, checked: !b.checked } : b)));

  const removeBlock = (id) =>
    setBlocks((bs) => {
      const next = bs.filter((b) => b.id !== id);
      return next.length ? next : [newBlock("text")];
    });

  const handleKeyDown = (e, id, index) => {
    const blocks = draft.blocks;
    const b = blocks[index];
    if (!b) return;
    const el = e.currentTarget;

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      const listy = b.type === "bullet" || b.type === "number" || b.type === "check";
      if (listy && !b.text.trim()) {
        // empty list item -> exit the list
        setBlocks((bs) => bs.map((x) => (x.id === id ? { ...x, type: "text", checked: false } : x)));
        setFocusReq({ id, end: true });
        return;
      }
      // split text at the caret
      const caret = el.selectionStart;
      const before = b.text.slice(0, caret);
      const after = b.text.slice(caret);
      const nextType = listy ? b.type : "text";
      const nb = newBlock(nextType, after);
      setBlocks((bs) => {
        const out = [];
        bs.forEach((x) => {
          if (x.id === id) {
            out.push({ ...x, text: before });
            out.push(nb);
          } else out.push(x);
        });
        return out;
      });
      setFocusReq({ id: nb.id, end: false });
      return;
    }

    if (e.key === "Backspace" && el.selectionStart === 0 && el.selectionEnd === 0) {
      if (b.type !== "text") {
        e.preventDefault();
        setBlocks((bs) => bs.map((x) => (x.id === id ? { ...x, type: "text", checked: false } : x)));
        return;
      }
      if (index > 0) {
        e.preventDefault();
        const prev = blocks[index - 1];
        if (prev.type === "divider") {
          removeBlock(prev.id);
          return;
        }
        const joined = prev.text + b.text;
        const prevLen = prev.text.length;
        setBlocks((bs) =>
          bs
            .filter((x) => x.id !== id)
            .map((x) => (x.id === prev.id ? { ...x, text: joined } : x))
        );
        setFocusReq({ id: prev.id, end: true });
        // place caret at the join point
        setTimeout(() => {
          const pel = refs.current[prev.id];
          if (pel) try { pel.setSelectionRange(prevLen, prevLen); } catch (er) { /* ignore */ }
        }, 0);
      }
      return;
    }

    if (e.key === "ArrowUp" && el.selectionStart === 0 && index > 0) {
      const prev = blocks[index - 1];
      if (prev.type !== "divider") {
        e.preventDefault();
        setFocusReq({ id: prev.id, end: true });
      }
    }
    if (e.key === "ArrowDown" && el.selectionEnd === el.value.length && index < blocks.length - 1) {
      const nxt = blocks[index + 1];
      if (nxt.type !== "divider") {
        e.preventDefault();
        setFocusReq({ id: nxt.id, end: false });
      }
    }
  };

  const applyTool = (type) => {
    const blocks = draft.blocks;
    const idx = Math.max(0, blocks.findIndex((b) => b.id === activeId));
    const cur = blocks[idx];
    if (type === "divider") {
      const div = newBlock("divider");
      const after = newBlock("text");
      setBlocks((bs) => {
        const out = bs.slice();
        // if current block is an empty text block, replace it with the divider
        if (cur && cur.type === "text" && !cur.text.trim()) out.splice(idx, 1, div, after);
        else out.splice(idx + 1, 0, div, after);
        return out;
      });
      setActiveId(after.id);
      setFocusReq({ id: after.id, end: false });
      return;
    }
    if (!cur || cur.type === "divider") {
      const nb = newBlock(type);
      setBlocks((bs) => {
        const out = bs.slice();
        out.splice(idx + 1, 0, nb);
        return out;
      });
      setActiveId(nb.id);
      setFocusReq({ id: nb.id, end: false });
      return;
    }
    // toggle back to text if the same type is tapped again
    const target = cur.type === type ? "text" : type;
    setBlocks((bs) => bs.map((b) => (b.id === cur.id ? { ...b, type: target, checked: target === "check" ? b.checked : false } : b)));
    setFocusReq({ id: cur.id, end: true });
  };

  const addBlockAtEnd = () => {
    const last = draft.blocks[draft.blocks.length - 1];
    if (last && last.type === "text" && !last.text.trim()) {
      setFocusReq({ id: last.id, end: true });
      return;
    }
    const nb = newBlock("text");
    setBlocks((bs) => [...bs, nb]);
    setFocusReq({ id: nb.id, end: false });
  };

  // numbering for consecutive numbered blocks
  const numbers = useMemo(() => {
    const out = {};
    let n = 0;
    draft.blocks.forEach((b) => {
      if (b.type === "number") {
        n += 1;
        out[b.id] = n;
      } else n = 0;
    });
    return out;
  }, [draft.blocks]);

  const activeType = (draft.blocks.find((b) => b.id === activeId) || {}).type;

  const addTag = () => {
    const t = tagInput.trim().replace(/^#/, "").slice(0, 20);
    if (!t) return;
    setDraft((d) => (d.tags.includes(t) ? d : { ...d, tags: [...d.tags, t] }));
    setTagInput("");
  };
  const removeTag = (t) => setDraft((d) => ({ ...d, tags: d.tags.filter((x) => x !== t) }));

  const words = useMemo(() => {
    const text = draft.blocks.map(blockPlain).join(" ") + " " + draft.title;
    return text.trim() ? text.trim().split(/\s+/).length : 0;
  }, [draft.blocks, draft.title]);

  return (
    <div className="np-backdrop" onClick={onCancel}>
      <div className="np-sheet" role="dialog" aria-modal="true" aria-label="Note editor" onClick={(e) => e.stopPropagation()}>
        {/* top bar */}
        <div className="np-sheet-top">
          <button type="button" className="np-ghost" onClick={onCancel}>
            ‹ Back
          </button>
          <div className="np-sheet-meta">{words} {words === 1 ? "word" : "words"}{dirty ? " · unsaved" : ""}</div>
          <button type="button" className="np-primary np-save" onClick={onSave}>
            Save
          </button>
        </div>

        {/* title + section */}
        <div className="np-sheet-head" style={{ borderLeftColor: colorOf(draft.color) }}>
          <input
            ref={titleRef}
            className="np-title-input"
            placeholder="Note title"
            value={draft.title}
            maxLength={120}
            onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                const first = draft.blocks[0];
                if (first) setFocusReq({ id: first.id, end: true });
              }
            }}
          />
          <div className="np-meta-row">
            <SectionMenu
              variant="field"
              label="Section"
              value={draft.section}
              options={sections}
              counts={counts || {}}
              onChange={(v) => setDraft((d) => ({ ...d, section: v }))}
              onCreate={(n) => {
                const s = onCreateSection ? onCreateSection(n) : null;
                if (s) setDraft((d) => ({ ...d, section: s }));
              }}
            />
            <div className="np-colors" role="radiogroup" aria-label="Label colour">
              {COLORS.map((c) => (
                <button
                  key={c.k}
                  type="button"
                  role="radio"
                  aria-checked={draft.color === c.k}
                  aria-label={c.l}
                  title={c.l}
                  className={`np-swatch${draft.color === c.k ? " sel" : ""}${c.k === "none" ? " none" : ""}`}
                  style={{ background: c.k === "none" ? "transparent" : c.v }}
                  onClick={() => setDraft((d) => ({ ...d, color: c.k }))}
                />
              ))}
            </div>
            <button
              type="button"
              className={`np-pin${draft.pinned ? " on" : ""}`}
              onClick={() => setDraft((d) => ({ ...d, pinned: !d.pinned }))}
              aria-pressed={draft.pinned}
            >
              {draft.pinned ? "★ Pinned" : "☆ Pin"}
            </button>
          </div>
          <div className="np-tags">
            {draft.tags.map((t) => (
              <span className="np-tag" key={t}>
                #{t}
                <button type="button" aria-label={"Remove tag " + t} onClick={() => removeTag(t)}>&times;</button>
              </span>
            ))}
            <input
              className="np-tag-input"
              placeholder="+ tag"
              value={tagInput}
              maxLength={20}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === ",") {
                  e.preventDefault();
                  addTag();
                }
              }}
              onBlur={addTag}
            />
          </div>
        </div>

        {/* formatting toolbar */}

        <div className="np-toolbar" role="toolbar" aria-label="Formatting">
          {BLOCK_TOOLS.map((t) => (
            <button
              key={t.type}
              type="button"
              className={`np-tool${activeType === t.type ? " on" : ""}`}
              title={t.label}
              aria-label={t.label}
              aria-pressed={activeType === t.type}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => applyTool(t.type)}
            >
              {t.icon}
              {t.label}
            </button>
          ))}

          <div className="np-photo-wrap" ref={photoWrapRef}>
            <button
              type="button"
              className={`np-tool np-photo-btn${photoMenu || images.length ? " on" : ""}`}
              aria-haspopup="menu"
              aria-expanded={photoMenu}
              title="Add a photo"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setPhotoMenu((o) => !o)}
            >
              <span className="np-tool-ico">📷</span>
              <span className="np-tool-lbl">{images.length ? "Photos · " + images.length : "Photo"}</span>
            </button>
            {photoMenu && (
              <div className="np-photo-menu" role="menu">
                <button type="button" role="menuitem" onClick={openCamera}>
                  📷 Take a photo
                  <small>Use your camera</small>
                </button>
                <button type="button" role="menuitem" onClick={openUpload}>
                  🖼️ Upload from files
                  <small>Choose one or more images</small>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* blocks */}
        <div className="np-canvas" onClick={(e) => { if (e.target === e.currentTarget) addBlockAtEnd(); }}>
          {(images.length > 0 || photoBusy) && (
            <div className="np-photo-grid">
              <div className="np-photo-head">
                <span>Photos</span>
                <small>{images.length}/{MAX_IMAGES}</small>
              </div>
              <div className="np-photo-list">
                {images.map((im) => (
                  <div key={im.id} className="np-photo-item">
                    <NoteImage img={im} className="np-photo-img" onClick={() => onOpenImage && onOpenImage(im)} />
                    <button type="button" className="np-photo-x" aria-label="Remove photo" onClick={() => removeImage(im.id)}>
                      ×
                    </button>
                  </div>
                ))}
                {photoBusy && <div className="np-photo-busy">Adding…</div>}
              </div>
            </div>
          )}
          {draft.blocks.map((b, i) => (
            <BlockRow
              key={b.id}
              block={b}
              index={i}
              numberLabel={numbers[b.id]}
              registerRef={registerRef}
              onChange={changeText}
              onKeyDown={handleKeyDown}
              onFocus={setActiveId}
              onToggle={toggleCheck}
              onRemoveDivider={removeBlock}
              active={b.id === activeId}
            />
          ))}
          <button type="button" className="np-addline" onClick={addBlockAtEnd}>
            + Add a line
          </button>
        </div>

        {!isNew && (
          <div className="np-sheet-foot">
            <button type="button" className="np-danger" onClick={onDelete}>
              Delete note
            </button>
            <span className="np-foot-date">Edited {fmtDate(draft.updatedAt || Date.now())}</span>
          </div>
        )}

        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={onPickFiles}
        />
        <input
          ref={camRef}
          type="file"
          accept="image/*"
          capture="environment"
          hidden
          onChange={onPickFiles}
        />

        {cameraOpen && (
          <CameraModal
            onCapture={onCaptured}
            onClose={() => setCameraOpen(false)}
            onFallback={() => {
              setCameraOpen(false);
              if (camRef.current) camRef.current.click();
            }}
          />
        )}
      </div>
    </div>
  );
}

// ---------- note card ----------
function NoteCard({ note, onOpen, onPin, onToggleCheck }) {
  const imgs = note.images || [];
  const preview = useMemo(() => {
    const out = [];
    let n = 0;
    for (const b of note.blocks) {
      if (b.type === "divider") continue;
      if (!blockPlain(b)) {
        if (b.type === "number") n = 0;
        continue;
      }
      if (b.type === "number") n += 1;
      else n = 0;
      out.push({ ...b, n });
      if (out.length >= 5) break;
    }
    return out;
  }, [note.blocks]);

  const checks = note.blocks.filter((b) => b.type === "check");
  const done = checks.filter((b) => b.checked).length;

  return (
    <article className="np-card np-glass" style={{ "--card-c": colorOf(note.color) }}>
      <div className="np-card-bar" />
      <button type="button" className="np-card-body" onClick={() => onOpen(note.id)}>
        {imgs.length > 0 && (
          <div className="np-card-cover">
            <NoteImage img={imgs[0]} className="np-card-cover-img" />
            {imgs.length > 1 && <span className="np-card-cover-n">+{imgs.length - 1}</span>}
          </div>
        )}
        <div className="np-card-top">
          <span className="np-card-section">{note.section}</span>
          <span className="np-card-date">{fmtDate(note.updatedAt)}</span>
        </div>
        <h3 className="np-card-title">{note.title || "Untitled"}</h3>
        <div className="np-card-prev">
          {preview.length === 0 && <div className="np-prev-empty">Empty note</div>}
          {preview.map((b) => {
            if (b.type === "check")
              return (
                <div key={b.id} className={`np-prev-line chk${b.checked ? " done" : ""}`}>
                  <span
                    className={`np-prev-box${b.checked ? " on" : ""}`}
                    role="checkbox"
                    aria-checked={b.checked}
                    tabIndex={0}
                    onClick={(e) => { e.stopPropagation(); onToggleCheck(note.id, b.id); }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        e.stopPropagation();
                        onToggleCheck(note.id, b.id);
                      }
                    }}
                  >
                    {b.checked ? "✓" : ""}
                  </span>
                  <span>{b.text}</span>
                </div>
              );
            if (b.type === "bullet")
              return <div key={b.id} className="np-prev-line"><span className="np-prev-dot">•</span><span>{b.text}</span></div>;
            if (b.type === "number")
              return <div key={b.id} className="np-prev-line"><span className="np-prev-dot">{b.n}.</span><span>{b.text}</span></div>;
            return (
              <div key={b.id} className={`np-prev-line np-prev-${b.type}`}>
                <span>{b.text}</span>
              </div>
            );
          })}
        </div>
        <div className="np-card-foot">
          {checks.length > 0 && (
            <span className="np-card-chip">☑ {done}/{checks.length}</span>
          )}
          {note.tags.slice(0, 3).map((t) => (
            <span className="np-card-chip" key={t}>#{t}</span>
          ))}
        </div>
      </button>
      <button
        type="button"
        className={`np-card-pin${note.pinned ? " on" : ""}`}
        aria-label={note.pinned ? "Unpin note" : "Pin note"}
        aria-pressed={note.pinned}
        onClick={() => onPin(note.id)}
      >
        {note.pinned ? "★" : "☆"}
      </button>
    </article>
  );
}

// ---------- main component ----------
export default function Notepad({ onBack, onSaveNote, onDeleteNote } = {}) {
  const [theme, setTheme] = useLocalStorageState("td_theme", "dark");
  const [notes, setNotes] = useLocalStorageState("td_notes", []);
  const [sections, setSections] = useLocalStorageState("td_note_sections", DEFAULT_SECTIONS);
  const [activeSection, setActiveSection] = useState("All");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useLocalStorageState("td_notes_sort", "updated"); // updated | created | title
  const [draft, setDraft] = useState(null); // note being edited
  const [draftBase, setDraftBase] = useState("");
  const [isNew, setIsNew] = useState(false);
  const [lightbox, setLightbox] = useState(null);
  const [toast, setToast] = useState("");
  const fontLinkAdded = useRef(false);
  const toastTimer = useRef(null);

  // ================= SUPABASE SYNC =================
  const [userId, setUserId] = useState(null);
  const [hydrated, setHydrated] = useState(false);
  const [syncState, setSyncState] = useState("idle"); // idle | syncing | synced | offline
  const [retryTick, setRetryTick] = useState(0);
  const [pendingDeletes, setPendingDeletes] = useLocalStorageState("td_notes_deleted", []);
  const [pendingImgDeletes, setPendingImgDeletes] = useLocalStorageState("td_notes_img_deleted", []);
  const pushedNotes = useRef({});
  const pushedSections = useRef("");

  // who is signed in
  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (active) setUserId(data.session ? data.session.user.id : null);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setUserId(session ? session.user.id : null);
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  // retry when the connection comes back
  useEffect(() => {
    const onOnline = () => setRetryTick((t) => t + 1);
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, []);

  // 1) On sign-in: pull from Supabase and merge with this device (newest edit wins)
  useEffect(() => {
    if (!userId) {
      if (hydrated) setHydrated(false);
      pushedNotes.current = {};
      return;
    }
    if (hydrated) return;
    let cancelled = false;
    (async () => {
      try {
        setSyncState("syncing");
        const [remoteNotes, remoteSections] = await Promise.all([pullNotes(userId), pullSections(userId)]);
        if (cancelled) return;

        const deleted = new Set(readLS("td_notes_deleted", []));
        const byId = {};
        remoteNotes.forEach((n) => { if (!deleted.has(n.id)) byId[n.id] = n; });
        readLS("td_notes", []).forEach((n) => {
          if (deleted.has(n.id)) return;
          const r = byId[n.id];
          if (!r || (n.updatedAt || 0) > (r.updatedAt || 0)) byId[n.id] = n;
        });
        const merged = Object.values(byId).sort((a, b) => b.updatedAt - a.updatedAt);

        // remember what the server already has, so only real changes get pushed
        const map = {};
        remoteNotes.forEach((r) => {
          const m = byId[r.id];
          if (m && JSON.stringify(m) === JSON.stringify(r)) map[r.id] = JSON.stringify(r);
        });
        pushedNotes.current = map;
        setNotes(merged);

        const secs = [...remoteSections];
        readLS("td_note_sections", DEFAULT_SECTIONS).forEach((s) => { if (!secs.includes(s)) secs.push(s); });
        pushedSections.current = JSON.stringify(remoteSections);
        setSections(secs);

        setHydrated(true);
        setSyncState("synced");
      } catch (e) {
        if (!cancelled) setSyncState("offline");
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, hydrated, retryTick]);

  // uploads photos still held on this device, returns the note carrying storage paths
  const prepareNote = async (n) => {
    let ok = true;
    const images = [];
    for (const im of n.images || []) {
      if (im.path) {
        images.push({ id: im.id, path: im.path, name: im.name || "" });
        continue;
      }
      try {
        const path = await uploadImage(userId, n.id, im);
        images.push({ id: im.id, path, name: im.name || "" });
      } catch (e) {
        ok = false;
        images.push(im);
      }
    }
    return { note: { ...n, images }, ok };
  };

  // 2) Push only the notes that changed (uploads photos first)
  useEffect(() => {
    if (!userId || !hydrated) return;
    const changed = notes.filter((n) => pushedNotes.current[n.id] !== JSON.stringify(n));
    if (!changed.length) return;
    const t = setTimeout(async () => {
      setSyncState("syncing");
      try {
        const prepared = [];
        for (const n of changed) prepared.push(await prepareNote(n));
        await pushNotes(userId, prepared.map((p) => p.note));

        let allOk = true;
        const swaps = {};
        prepared.forEach((p) => {
          if (p.ok) {
            pushedNotes.current[p.note.id] = JSON.stringify(p.note);
            swaps[p.note.id] = p.note;
          } else {
            allOk = false;
          }
        });

        if (Object.keys(swaps).length) {
          setNotes((ns) =>
            ns.map((x) => {
              const s = swaps[x.id];
              return s && x.updatedAt === s.updatedAt ? { ...x, images: s.images } : x;
            })
          );
        }
        setSyncState(allOk ? "synced" : "offline");
      } catch (e) {
        setSyncState("offline");
      }
    }, 600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, hydrated, retryTick, notes]);

  // 3) Push sections when they change
  useEffect(() => {
    if (!userId || !hydrated) return;
    const snap = JSON.stringify(sections);
    if (snap === pushedSections.current) return;
    const t = setTimeout(() => {
      pushSections(userId, sections)
        .then(() => { pushedSections.current = snap; })
        .catch(() => setSyncState("offline"));
    }, 600);
    return () => clearTimeout(t);
  }, [userId, hydrated, retryTick, sections]);

  // 4) Flush deletions (kept in localStorage so they survive being offline)
  useEffect(() => {
    if (!userId || !hydrated || pendingDeletes.length === 0) return;
    const ids = pendingDeletes.slice();
    deleteNotes(userId, ids)
      .then(() => setPendingDeletes((p) => p.filter((x) => !ids.includes(x))))
      .catch(() => setSyncState("offline"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, hydrated, retryTick, pendingDeletes]);

  // 5) Remove photos that were taken out of a note
  useEffect(() => {
    if (!userId || !hydrated || pendingImgDeletes.length === 0) return;
    const paths = pendingImgDeletes.slice();
    removeImages(paths)
      .then(() => setPendingImgDeletes((p) => p.filter((x) => !paths.includes(x))))
      .catch(() => setSyncState("offline"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, hydrated, retryTick, pendingImgDeletes]);

  const syncLabel =
    !userId ? "Not signed in · saved on this device"
      : syncState === "synced" ? "Synced to your account"
      : syncState === "syncing" ? "Syncing…"
      : syncState === "offline" ? "Offline · will sync when you reconnect"
      : "Connecting…";
  // ================================================

  // keep theme in sync with the Session page
  useEffect(() => {
    const sync = () => {
      const t = readLS("td_theme", "dark");
      if (t === "light" || t === "dark") setTheme(t);
    };
    window.addEventListener("focus", sync);
    window.addEventListener("storage", sync);
    document.addEventListener("visibilitychange", sync);
    return () => {
      window.removeEventListener("focus", sync);
      window.removeEventListener("storage", sync);
      document.removeEventListener("visibilitychange", sync);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // font
  useEffect(() => {
    if (fontLinkAdded.current || typeof document === "undefined") return;
    fontLinkAdded.current = true;
    if (!document.getElementById("ts-font-link")) {
      const link = document.createElement("link");
      link.id = "ts-font-link";
      link.rel = "stylesheet";
      link.href = "https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap";
      document.head.appendChild(link);
    }
  }, []);

  const showToast = (msg) => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 2600);
  };
  useEffect(() => () => clearTimeout(toastTimer.current), []);

  // ---------- persistence hooks (Supabase goes here later) ----------
  const persist = (note) => {
    if (typeof onSaveNote === "function") {
      try { onSaveNote(note); } catch (e) { /* ignore */ }
    }
  };
  const remove = (id) => {
    if (typeof onDeleteNote === "function") {
      try { onDeleteNote(id); } catch (e) { /* ignore */ }
    }
  };

  // ---------- editor open / close ----------
  const snapshot = (d) => JSON.stringify({ t: d.title, s: d.section, c: d.color, p: d.pinned, g: d.tags, i: (d.images || []).map((x) => x.id), b: d.blocks.map((b) => [b.type, b.text, b.checked]) });
  const dirty = !!draft && snapshot(draft) !== draftBase;

  const openNew = () => {
    const d = {
      id: uid("note"),
      title: "",
      section: activeSection !== "All" ? activeSection : sections[0] || "General",
      color: "none",
      pinned: false,
      tags: [],
      blocks: [newBlock("text")],
      images: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    setDraft(d);
    setDraftBase(snapshot(d));
    setIsNew(true);
  };

  const openNote = (id) => {
    const n = notes.find((x) => x.id === id);
    if (!n) return;
    const d = { ...n, tags: n.tags.slice(), blocks: n.blocks.map((b) => ({ ...b })), images: (n.images || []).map((i) => ({ ...i })) };
    setDraft(d);
    setDraftBase(snapshot(d));
    setIsNew(false);
  };

  const closeEditor = () => {
    if (dirty && !window.confirm("Discard your unsaved changes?")) return;
    setDraft(null);
  };

  const saveDraft = () => {
    if (!draft) return;
    const hasContent = draft.title.trim() || draft.blocks.some((b) => blockPlain(b) || b.type === "divider");
    if (!hasContent) {
      showToast("Add a title or some content first.");
      return;
    }
    // trim trailing empty text blocks
    let blocks = draft.blocks.slice();
    while (blocks.length > 1 && blocks[blocks.length - 1].type === "text" && !blocks[blocks.length - 1].text.trim()) blocks.pop();
    const note = { ...draft, title: draft.title.trim(), blocks, updatedAt: Date.now() };
    // photos removed from an existing note get deleted from storage on the next sync
    const orig = notes.find((x) => x.id === note.id);
    if (orig) {
      const keep = new Set((note.images || []).map((i) => i.id));
      const gone = (orig.images || []).filter((i) => i.path && !keep.has(i.id)).map((i) => i.path);
      if (gone.length) setPendingImgDeletes((p) => [...p, ...gone.filter((x) => !p.includes(x))]);
    }
    setNotes((ns) => {
      const idx = ns.findIndex((x) => x.id === note.id);
      if (idx > -1) {
        const next = ns.slice();
        next[idx] = note;
        return next;
      }
      return [note, ...ns];
    });
    persist(note);
    if (!sections.includes(note.section)) setSections((s) => [...s, note.section]);
    setDraft(null);
    showToast(isNew ? "Note saved." : "Changes saved.");
  };

  const deleteDraft = () => {
    if (!draft) return;
    if (!window.confirm("Delete this note? This can't be undone.")) return;
    const delId = draft.id;
    setNotes((ns) => ns.filter((x) => x.id !== delId));
    setPendingDeletes((p) => (p.includes(delId) ? p : [...p, delId]));
    delete pushedNotes.current[delId];
    remove(delId);
    setDraft(null);
    showToast("Note deleted.");
  };

  // Esc: closes the photo viewer first, then the editor
  useEffect(() => {
    if (!draft && !lightbox) return;
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      if (lightbox) setLightbox(null);
      else closeEditor();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, dirty, lightbox]);

  // lock page scroll while the editor is open
  useEffect(() => {
    if (typeof document === "undefined") return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = draft ? "hidden" : prev;
    return () => { document.body.style.overflow = prev; };
  }, [draft]);

  // ---------- quick actions from cards ----------
  const togglePin = (id) => {
    setNotes((ns) => {
      const next = ns.map((n) => (n.id === id ? { ...n, pinned: !n.pinned } : n));
      const changed = next.find((n) => n.id === id);
      if (changed) persist(changed);
      return next;
    });
  };
  const toggleCardCheck = (noteId, blockId) => {
    setNotes((ns) => {
      const next = ns.map((n) =>
        n.id === noteId
          ? { ...n, updatedAt: Date.now(), blocks: n.blocks.map((b) => (b.id === blockId ? { ...b, checked: !b.checked } : b)) }
          : n
      );
      const changed = next.find((n) => n.id === noteId);
      if (changed) persist(changed);
      return next;
    });
  };

  // ---------- sections ----------
  const addSectionByName = (raw) => {
    const name = (raw || "").trim().slice(0, 24);
    if (!name) return null;
    const existing = allSections.find((s) => s.toLowerCase() === name.toLowerCase());
    if (existing) return existing;
    setSections((s) => [...s, name]);
    return name;
  };

  const sectionCounts = useMemo(() => {
    const m = {};
    notes.forEach((n) => { m[n.section] = (m[n.section] || 0) + 1; });
    return m;
  }, [notes]);

  const allSections = useMemo(() => {
    const extra = Object.keys(sectionCounts).filter((s) => !sections.includes(s));
    return [...sections, ...extra];
  }, [sections, sectionCounts]);

  // ---------- filtering ----------
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = notes.filter((n) => activeSection === "All" || n.section === activeSection);
    if (q) {
      list = list.filter((n) => {
        const hay = (n.title + " " + n.tags.join(" ") + " " + n.blocks.map(blockPlain).join(" ")).toLowerCase();
        return hay.includes(q);
      });
    }
    const cmp =
      sort === "title" ? (a, b) => (a.title || "").localeCompare(b.title || "")
      : sort === "created" ? (a, b) => b.createdAt - a.createdAt
      : (a, b) => b.updatedAt - a.updatedAt;
    return list.slice().sort(cmp);
  }, [notes, activeSection, query, sort]);

  const pinned = visible.filter((n) => n.pinned);
  const others = visible.filter((n) => !n.pinned);

  const renderCard = (n) => (
    <NoteCard key={n.id} note={n} onOpen={openNote} onPin={togglePin} onToggleCheck={toggleCardCheck} />
  );

  const goBack = () => {
    if (typeof onBack === "function") onBack();
    else if (typeof window !== "undefined") window.location.hash = "";
  };

  return (
    <div className="np-root" data-theme={theme}>
      <style>{CSS}</style>

      <div className="np-wrap">
        {/* header */}
        <header className="np-top">
          <div className="np-brand">
            <h1>Notepad</h1>
            <div className="np-brand-sub">Your strategies, rules and thinking. Everything worth remembering.</div>
            <div className="np-brand-btns">
              <button type="button" className="np-pill" onClick={goBack}>‹ Session</button>
              <button type="button" className="np-pill" onClick={() => setTheme(theme === "light" ? "dark" : "light")}>
                {theme === "light" ? "Switch to dark" : "Switch to light"}
              </button>
              <span className="np-sync">{syncLabel}</span>
            </div>
          </div>
        </header>

        <div className="np-layout">
          {/* notes list */}
          <main className="np-main">
            <div className="np-toolrow">
              <SectionMenu
                variant="filter"
                label="Section"
                showAll
                value={activeSection}
                options={allSections}
                counts={sectionCounts}
                total={notes.length}
                onChange={setActiveSection}
                onCreate={(n) => {
                  const s = addSectionByName(n);
                  if (s) setActiveSection(s);
                }}
              />
              <div className="np-search np-glass">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" />
                </svg>
                <input
                  type="search"
                  placeholder="Search notes, tags, content…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  aria-label="Search notes"
                />
                {query && (
                  <button type="button" className="np-clear" aria-label="Clear search" onClick={() => setQuery("")}>&times;</button>
                )}
              </div>
              <select className="np-sort" value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort notes">
                <option value="updated">Recently edited</option>
                <option value="created">Newest first</option>
                <option value="title">A – Z</option>
              </select>
            </div>

            <h2 className="np-h2">
              Saved notes
              <span className="np-sub">
                {activeSection === "All" ? "all sections" : activeSection} · {visible.length} {visible.length === 1 ? "note" : "notes"}
              </span>
            </h2>

            {notes.length === 0 ? (
              <div className="np-empty np-glass">
                <div className="np-empty-ico">📓</div>
                <div className="np-empty-t">Your notebook is empty</div>
                <div className="np-empty-s">
                  Tap the + button to write your first note. Capture a strategy, a rule you keep breaking, or an idea before it slips away.
                </div>
                <button type="button" className="np-primary" onClick={openNew}>Create a note</button>
              </div>
            ) : visible.length === 0 ? (
              <div className="np-empty np-glass">
                <div className="np-empty-ico">🔍</div>
                <div className="np-empty-t">Nothing found</div>
                <div className="np-empty-s">
                  {query ? "No notes match your search here." : "This section has no notes yet."}
                </div>
              </div>
            ) : (
              <>
                {pinned.length > 0 && (
                  <>
                    <div className="np-group">★ Pinned</div>
                    <div className="np-grid">{pinned.map(renderCard)}</div>
                  </>
                )}
                {others.length > 0 && (
                  <>
                    {pinned.length > 0 && <div className="np-group">Notes</div>}
                    <div className="np-grid">{others.map(renderCard)}</div>
                  </>
                )}
              </>
            )}
          </main>
        </div>
      </div>

      {/* floating add button */}
      {!draft && (
        <button type="button" className="np-fab" onClick={openNew} aria-label="New note">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </button>
      )}

      {draft && (
        <NoteEditor
          draft={draft}
          setDraft={setDraft}
          sections={allSections.includes(draft.section) ? allSections : [...allSections, draft.section]}
          counts={sectionCounts}
          isNew={isNew}
          dirty={dirty}
          onSave={saveDraft}
          onCancel={closeEditor}
          onDelete={deleteDraft}
          onCreateSection={addSectionByName}
          onToast={showToast}
          onOpenImage={setLightbox}
        />
      )}

      {lightbox && (
        <div className="np-lightbox" onClick={() => setLightbox(null)}>
          <button type="button" className="np-lightbox-close" aria-label="Close photo" onClick={() => setLightbox(null)}>
            ×
          </button>
          <NoteImage img={lightbox} className="np-lightbox-img" />
        </div>
      )}

      <div className={`np-toast${toast ? " show" : ""}`} role="status" aria-live="polite">{toast}</div>
    </div>
  );
}

// ---------- scoped styles ----------
const CSS = `
.np-root{
/* ===== DARK: obsidian navy / champagne gold ===== */
--bg-grad:linear-gradient(180deg,#0c1124 0%,#080b17 42%,#04060d 100%);
--surface:linear-gradient(180deg,rgba(255,255,255,.06) 0%,rgba(255,255,255,0) 42%),linear-gradient(160deg,rgba(26,34,58,.86),rgba(11,15,29,.94));
--surface-2:rgba(255,255,255,.055);
--border:rgba(190,205,255,.10);
--text:#f5f7fc; --muted:#8b94ad;
--amber:#e8c97a; --amber-dim:rgba(232,201,122,.16);
--accent-text:#f1d98f;
--teal:#34e0a1; --teal-dim:rgba(52,224,161,.14);
--rose:#ff6b7d; --rose-dim:rgba(255,107,125,.15);
--warn:#f2b45c; --warn-dim:rgba(242,180,92,.17);
--on-accent:#1b1407;
--focus-ring:#e8c97a;
--orb-1:rgba(232,201,122,.13); --orb-2:rgba(64,104,255,.20); --orb-3:rgba(150,170,255,.07);
--btn:linear-gradient(180deg,#f6e0a2,#c99f48);
--modal-bg:#0d1326;
--blur:blur(18px) saturate(130%);
--shadow-card:0 1px 0 rgba(255,255,255,.08) inset,0 22px 46px -22px rgba(0,0,0,.95);
--shadow-card-hover:0 1px 0 rgba(255,255,255,.11) inset,0 26px 50px -18px rgba(0,0,0,1);
--glow-amber:rgba(232,201,122,.30); --glow-rose:rgba(255,107,125,.38);
--sheet-bg:linear-gradient(180deg,#10172e 0%,#0a0f20 100%);
--r-card:26px; --r-input:14px; --r-pill:999px;

padding-top:env(safe-area-inset-top,0px); padding-bottom:env(safe-area-inset-bottom,0px);
box-sizing:border-box; min-height:100vh; position:relative;
background:var(--bg-grad); background-attachment:fixed;
color:var(--text); font-family:'Plus Jakarta Sans','Inter',system-ui,sans-serif;
-webkit-font-smoothing:antialiased;
}
.np-root[data-theme="light"]{
/* ===== LIGHT: blue glass ===== */
--bg-grad:linear-gradient(180deg,#d6e2f7 0%,#bfd0ee 50%,#a9bee4 100%);
--surface:linear-gradient(160deg,rgba(255,255,255,.80),rgba(224,235,252,.58));
--surface-2:rgba(255,255,255,.62);
--border:rgba(30,60,120,.13);
--text:#10214a; --muted:#5d7099;
--amber:#e9a92a; --amber-dim:rgba(233,169,42,.28);
--accent-text:#1f4a94;
--teal:#0b8f50; --teal-dim:rgba(15,157,88,.14);
--rose:#d63c33; --rose-dim:rgba(214,60,51,.12);
--warn:#c67a12; --warn-dim:rgba(198,122,18,.16);
--on-accent:#2b1d00;
--focus-ring:#2f6fc4;
--orb-1:rgba(255,255,255,.9); --orb-2:rgba(90,140,230,.42); --orb-3:rgba(255,255,255,.55);
--btn:linear-gradient(180deg,#f8ce62,#e8a825);
--modal-bg:#eef4ff;
--shadow-card:0 1px 0 rgba(255,255,255,.95) inset,0 18px 38px -20px rgba(38,72,150,.4);
--shadow-card-hover:0 1px 0 rgba(255,255,255,1) inset,0 22px 42px -18px rgba(38,72,150,.48);
--glow-amber:rgba(233,169,42,.42); --glow-rose:rgba(214,60,51,.28);
--sheet-bg:linear-gradient(180deg,#f4f8ff 0%,#e3ecfb 100%);
}
.np-root::before{
  content:""; position:fixed; inset:0; pointer-events:none; z-index:0;
  background:
    radial-gradient(620px 420px at 90% 4%,var(--orb-1),transparent 70%),
    radial-gradient(780px 540px at 2% 98%,var(--orb-2),transparent 70%),
    radial-gradient(420px 320px at 8% 22%,var(--orb-3),transparent 70%);
}
.np-root:not([data-theme="light"])::after{
  content:""; position:fixed; left:0; right:0; top:0; height:360px; pointer-events:none; z-index:0;
  background-image:
    radial-gradient(520px 200px at 50% -40px,rgba(232,201,122,.14),transparent 70%),
    linear-gradient(rgba(190,205,255,.028) 1px,transparent 1px),
    linear-gradient(90deg,rgba(190,205,255,.028) 1px,transparent 1px);
  background-size:100% 100%,34px 34px,34px 34px;
  -webkit-mask-image:linear-gradient(180deg,#000 0%,transparent 100%);
  mask-image:linear-gradient(180deg,#000 0%,transparent 100%);
}
.np-root *{box-sizing:border-box;}
.np-root ::selection{background:var(--amber);color:var(--on-accent);}
.np-root button{font-family:inherit;}
.np-root input,.np-root textarea,.np-root select{font-family:inherit;}
.np-root :focus-visible{outline:2px solid var(--focus-ring);outline-offset:2px;}
.np-root{overflow-x:clip;max-width:100vw;}

.np-glass{
  background:var(--surface);
  -webkit-backdrop-filter:var(--blur); backdrop-filter:var(--blur);
  border:1px solid var(--border);
  box-shadow:var(--shadow-card);
}

.np-wrap{position:relative;z-index:1;max-width:560px;margin:0 auto;padding:26px 18px 130px;}
@media (min-width:900px){.np-wrap{max-width:1040px;padding:34px 28px 130px;}}

/* ---------- header ---------- */
.np-top{margin-bottom:18px;}
.np-brand h1{font-weight:800;font-size:clamp(28px,6vw,36px);margin:0 0 6px;letter-spacing:-.03em;line-height:1.05;}
.np-root:not([data-theme="light"]) .np-brand h1{
  font-weight:700;letter-spacing:-.035em;
  background:linear-gradient(180deg,#ffffff 20%,#c3cce6 100%);
  -webkit-background-clip:text;background-clip:text;color:transparent;-webkit-text-fill-color:transparent;
}
.np-brand-sub{font-size:13px;color:var(--muted);margin-bottom:12px;line-height:1.45;max-width:520px;}
.np-brand-btns{display:flex;flex-wrap:wrap;gap:8px;}
.np-pill{background:var(--surface-2);border:1px solid var(--border);color:var(--muted);border-radius:var(--r-pill);padding:6px 13px;font-size:11.5px;font-weight:600;cursor:pointer;-webkit-backdrop-filter:var(--blur);backdrop-filter:var(--blur);transition:all .18s ease;}
.np-pill:hover{border-color:var(--amber);color:var(--text);}
.np-sync{display:inline-flex;align-items:center;font-size:11.5px;font-weight:600;color:var(--muted);padding:0 4px;}

/* ---------- layout ---------- */
.np-layout{display:block;}

/* ---------- section dropdown ---------- */
@keyframes np-dd-in{from{opacity:0;transform:translateY(-6px) scale(.98);}to{opacity:1;transform:none;}}
.np-dd{position:relative;min-width:0;}
.np-dd-trigger{width:100%;display:flex;align-items:center;gap:12px;text-align:left;cursor:pointer;color:var(--text);background:var(--surface);-webkit-backdrop-filter:var(--blur);backdrop-filter:var(--blur);border:1px solid var(--border);border-radius:18px;padding:9px 14px 9px 10px;box-shadow:var(--shadow-card);transition:border-color .18s ease,box-shadow .18s ease;}
.np-dd-trigger:hover,.np-dd.open .np-dd-trigger{border-color:var(--amber);}
.np-dd.open .np-dd-trigger{box-shadow:0 0 0 3px var(--amber-dim),var(--shadow-card);}
.np-dd-ico{flex-shrink:0;width:34px;height:34px;border-radius:12px;display:flex;align-items:center;justify-content:center;background:var(--btn);color:var(--on-accent);}
.np-dd-text{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px;}
.np-dd-label{font-size:9.5px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:var(--muted);}
.np-dd-value{font-size:14.5px;font-weight:800;letter-spacing:-.01em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.np-dd-count{flex-shrink:0;font-size:11px;font-weight:800;color:var(--muted);background:var(--surface-2);border:1px solid var(--border);border-radius:var(--r-pill);padding:3px 9px;font-variant-numeric:tabular-nums;}
.np-dd-chev{flex-shrink:0;color:var(--muted);transition:transform .2s ease;}
.np-dd.open .np-dd-chev{transform:rotate(180deg);}
.np-dd-menu{position:absolute;z-index:40;left:0;right:0;top:calc(100% + 8px);min-width:230px;max-height:320px;overflow-y:auto;padding:8px;border-radius:20px;background:var(--sheet-bg);border:1px solid var(--border);box-shadow:0 1px 0 rgba(255,255,255,.08) inset,0 28px 54px -18px rgba(0,0,0,.75);animation:np-dd-in .16s ease;}
.np-dd-opt{width:100%;display:flex;align-items:center;gap:10px;background:none;border:none;color:var(--text);padding:10px 12px;border-radius:13px;font-size:13.5px;font-weight:600;cursor:pointer;text-align:left;}
.np-dd-opt:hover,.np-dd-opt:focus-visible{background:var(--surface-2);outline:none;}
.np-dd-opt.sel{background:var(--amber-dim);font-weight:800;}
.np-dd-opt .nm{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.np-dd-opt .ct{font-size:11px;font-weight:700;color:var(--muted);font-variant-numeric:tabular-nums;}
.np-dd-opt .ck{width:14px;text-align:center;color:var(--accent-text);font-weight:800;font-size:13px;}
.np-dd-sep{height:1px;background:var(--border);margin:6px 4px;}
.np-dd-new{width:100%;text-align:left;background:none;border:none;color:var(--accent-text);padding:10px 12px;border-radius:13px;font-size:13px;font-weight:800;cursor:pointer;}
.np-dd-new:hover{background:var(--surface-2);}
.np-dd-input{width:100%;background:var(--surface-2);border:1px solid var(--amber);border-radius:13px;color:var(--text);padding:10px 12px;font-size:13px;outline:none;}

/* compact variant used inside the editor */
.np-dd-field{display:inline-block;}
.np-dd-field .np-dd-trigger{width:auto;padding:6px 10px 6px 8px;gap:9px;border-radius:14px;box-shadow:none;background:var(--surface-2);}
.np-dd-field .np-dd-ico{width:26px;height:26px;border-radius:9px;}
.np-dd-field .np-dd-label{display:none;}
.np-dd-field .np-dd-value{font-size:13px;max-width:130px;}
.np-dd-field .np-dd-menu{right:auto;width:250px;}

.np-toolbar{display:flex;align-items:center;gap:8px;padding:10px 16px;border-top:1px solid var(--border);border-bottom:1px solid var(--border);background:var(--surface-2);}
.np-toolbar-scroll{flex:1;min-width:0;display:flex;gap:6px;overflow-x:auto;scrollbar-width:none;}
.np-toolbar-scroll::-webkit-scrollbar{display:none;}
.np-photo-wrap{position:relative;flex-shrink:0;padding-left:8px;border-left:1px solid var(--border);}
.np-photo-menu{position:absolute;right:0;top:calc(100% + 12px);z-index:30;min-width:250px;padding:8px;border-radius:18px;background:var(--sheet-bg);border:1px solid var(--border);box-shadow:0 28px 54px -18px rgba(0,0,0,.75);animation:np-dd-in .16s ease;}
.np-photo-menu button{display:flex;flex-direction:column;align-items:flex-start;gap:2px;width:100%;text-align:left;background:none;border:none;color:var(--text);padding:11px 12px;border-radius:13px;font-size:13.5px;font-weight:700;cursor:pointer;}
.np-photo-menu button:hover{background:var(--surface-2);}
.np-photo-menu small{font-size:11.5px;color:var(--muted);font-weight:500;}

.np-toolrow{display:flex;flex-wrap:wrap;gap:10px;margin-bottom:6px;}
.np-dd-filter{flex:1 1 100%;}
@media (min-width:760px){.np-dd-filter{flex:0 0 260px;}}

/* ---------- note cards ---------- */
.np-grid{display:grid;grid-template-columns:1fr;gap:12px;}
@media (min-width:640px){.np-grid{grid-template-columns:1fr 1fr;}}
@media (min-width:1100px){.np-grid{grid-template-columns:repeat(3,1fr);}}
@media (min-width:900px) and (max-width:1099px){.np-grid{grid-template-columns:1fr 1fr;}}
.np-card{position:relative;border-radius:22px;overflow:hidden;transition:transform .2s ease,box-shadow .2s ease,border-color .2s ease;}
.np-card:hover{transform:translateY(-2px);box-shadow:var(--shadow-card-hover);border-color:var(--amber);}
.np-card-bar{position:absolute;left:0;top:0;bottom:0;width:4px;background:var(--card-c);}
.np-card-body{display:block;width:100%;text-align:left;background:none;border:none;color:inherit;cursor:pointer;padding:16px 46px 14px 20px;min-height:132px;}
.np-card-top{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:8px;}
.np-card-section{font-size:10.5px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--accent-text);}
.np-card-date{font-size:11px;color:var(--muted);font-variant-numeric:tabular-nums;}
.np-card-title{font-size:16.5px;font-weight:800;letter-spacing:-.02em;margin:0 0 8px;line-height:1.25;overflow-wrap:anywhere;}
.np-card-prev{display:flex;flex-direction:column;gap:4px;}
.np-prev-line{display:flex;gap:8px;font-size:12.8px;line-height:1.4;color:var(--muted);overflow-wrap:anywhere;}
.np-prev-line>span:last-child{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;}
.np-prev-dot{flex-shrink:0;min-width:12px;color:var(--accent-text);font-weight:700;}
.np-prev-box{flex-shrink:0;width:15px;height:15px;margin-top:1px;border-radius:5px;border:1.5px solid var(--border);display:inline-flex;align-items:center;justify-content:center;font-size:10px;font-weight:800;color:transparent;cursor:pointer;background:var(--surface-2);}
.np-prev-box.on{background:var(--btn);border-color:transparent;color:var(--on-accent);}
.np-prev-line.done>span:last-child{text-decoration:line-through;opacity:.6;}
.np-prev-h{color:var(--text);font-weight:700;}
.np-prev-quote{font-style:italic;}
.np-prev-callout{color:var(--text);}
.np-prev-empty{font-size:12.5px;color:var(--muted);font-style:italic;}
.np-card-foot{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px;}
.np-card-foot:empty{display:none;}
.np-card-chip{font-size:11px;font-weight:700;color:var(--muted);background:var(--surface-2);border:1px solid var(--border);border-radius:var(--r-pill);padding:3px 9px;}
.np-card-pin{position:absolute;top:10px;right:10px;width:30px;height:30px;border-radius:50%;border:none;background:none;color:var(--muted);font-size:17px;cursor:pointer;line-height:1;transition:all .15s ease;}
.np-card-pin:hover{color:var(--amber);background:var(--surface-2);}
.np-card-pin.on{color:var(--amber);}

/* ---------- empty ---------- */
.np-empty{border-radius:var(--r-card);padding:34px 24px;text-align:center;}
.np-empty-ico{font-size:40px;margin-bottom:10px;}
.np-empty-t{font-size:17px;font-weight:800;letter-spacing:-.02em;margin-bottom:6px;}
.np-empty-s{font-size:13px;color:var(--muted);line-height:1.5;max-width:340px;margin:0 auto 18px;}
.np-empty .np-primary{margin:0 auto;}

/* ---------- buttons ---------- */
.np-primary{border:none;background:var(--btn);color:var(--on-accent);font-weight:800;border-radius:14px;padding:11px 20px;font-size:13.5px;cursor:pointer;box-shadow:0 10px 20px -10px var(--glow-amber);transition:transform .15s ease;}
.np-primary:active{transform:scale(.97);}
.np-ghost{border:1px solid var(--border);background:var(--surface-2);color:var(--text);font-weight:700;border-radius:14px;padding:10px 16px;font-size:13px;cursor:pointer;}
.np-ghost:hover{border-color:var(--amber);}
.np-danger{border:1px solid var(--rose);background:var(--rose-dim);color:var(--rose);font-weight:700;border-radius:14px;padding:9px 16px;font-size:12.5px;cursor:pointer;}
.np-danger:hover{filter:brightness(1.1);}

/* ---------- floating add button ---------- */
.np-fab{position:fixed;right:max(20px,calc(50% - 540px));bottom:calc(26px + env(safe-area-inset-bottom,0px));z-index:50;width:62px;height:62px;border-radius:50%;border:1px solid rgba(255,255,255,.35);background:var(--btn);color:var(--on-accent);display:flex;align-items:center;justify-content:center;cursor:pointer;box-shadow:0 1px 0 rgba(255,255,255,.4) inset,0 18px 34px -10px var(--glow-amber),0 8px 20px -6px rgba(0,0,0,.5);transition:transform .18s ease,box-shadow .18s ease;animation:np-fab-in .35s cubic-bezier(.2,1.2,.4,1);}
@media (max-width:1100px){.np-fab{right:20px;}}
.np-fab:hover{transform:scale(1.07) rotate(90deg);}
.np-fab:active{transform:scale(.94);}
@keyframes np-fab-in{from{transform:scale(.4);opacity:0;}to{transform:scale(1);opacity:1;}}

/* ---------- editor sheet ---------- */
.np-backdrop{position:fixed;inset:0;z-index:100;background:rgba(3,10,30,.62);-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);display:flex;align-items:flex-end;justify-content:center;animation:np-fade .2s ease;}
@media (min-width:760px){.np-backdrop{align-items:center;padding:28px;}}
@keyframes np-fade{from{opacity:0;}to{opacity:1;}}
.np-sheet{width:100%;max-width:760px;height:96vh;height:96dvh;display:flex;flex-direction:column;background:var(--sheet-bg);color:var(--text);border:1px solid var(--border);border-radius:28px 28px 0 0;box-shadow:0 -10px 50px rgba(0,0,0,.45);animation:np-up .26s ease;overflow:hidden;}
@media (min-width:760px){.np-sheet{height:88vh;max-height:860px;border-radius:28px;}}
@keyframes np-up{from{transform:translateY(26px);opacity:0;}to{transform:translateY(0);opacity:1;}}
.np-sheet-top{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:14px 16px 10px;}
.np-sheet-meta{font-size:11.5px;color:var(--muted);font-weight:600;font-variant-numeric:tabular-nums;}
.np-save{padding:10px 24px;}
.np-sheet-head{padding:8px 20px 12px;margin:0 16px;border-left:4px solid transparent;border-radius:4px;}
.np-title-input{width:100%;background:none;border:none;outline:none;color:var(--text);font-size:clamp(24px,5vw,30px);font-weight:800;letter-spacing:-.03em;padding:4px 0 10px;}
.np-title-input::placeholder{color:var(--muted);opacity:.7;}
.np-meta-row{display:flex;flex-wrap:wrap;align-items:center;gap:10px 14px;}
.np-select-wrap{display:inline-flex;align-items:center;gap:8px;font-size:11.5px;font-weight:700;color:var(--muted);}
.np-select-wrap select{background:var(--surface-2);border:1px solid var(--border);border-radius:12px;color:var(--text);padding:7px 10px;font-size:12.5px;font-weight:600;cursor:pointer;max-width:150px;}
.np-colors{display:inline-flex;gap:7px;align-items:center;}
.np-swatch{width:20px;height:20px;border-radius:50%;border:1.5px solid var(--border);cursor:pointer;padding:0;transition:transform .15s ease;}
.np-swatch.none{background-image:linear-gradient(135deg,transparent 45%,var(--muted) 46%,var(--muted) 54%,transparent 55%);}
.np-swatch:hover{transform:scale(1.15);}
.np-swatch.sel{box-shadow:0 0 0 2px var(--sheet-bg),0 0 0 4px var(--text);}
.np-pin{margin-left:auto;background:var(--surface-2);border:1px solid var(--border);color:var(--muted);border-radius:var(--r-pill);padding:6px 13px;font-size:12px;font-weight:700;cursor:pointer;}
.np-pin.on{border-color:var(--amber);color:var(--amber);background:var(--amber-dim);}
.np-tags{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-top:12px;}
.np-tag{display:inline-flex;align-items:center;gap:5px;font-size:11.5px;font-weight:700;color:var(--accent-text);background:var(--amber-dim);border-radius:var(--r-pill);padding:4px 6px 4px 10px;}
.np-tag button{background:none;border:none;color:inherit;opacity:.7;cursor:pointer;font-size:14px;line-height:1;padding:0 2px;}
.np-tag button:hover{opacity:1;}
.np-tag-input{width:84px;background:none;border:1px dashed var(--border);border-radius:var(--r-pill);color:var(--text);padding:4px 10px;font-size:11.5px;outline:none;}
.np-tag-input:focus{border-color:var(--amber);}

/* formatting toolbar */
.np-toolbar{display:flex;align-items:center;gap:8px;padding:10px 16px;border-top:1px solid var(--border);border-bottom:1px solid var(--border);background:var(--surface-2);}
.np-toolbar-scroll{flex:1;min-width:0;display:flex;gap:6px;overflow-x:auto;scrollbar-width:none;}
.np-toolbar-scroll::-webkit-scrollbar{display:none;}
.np-photo-wrap{position:relative;flex-shrink:0;padding-left:8px;border-left:1px solid var(--border);}
.np-photo-menu{position:absolute;right:0;top:calc(100% + 12px);z-index:30;min-width:250px;padding:8px;border-radius:18px;background:var(--sheet-bg);border:1px solid var(--border);box-shadow:0 28px 54px -18px rgba(0,0,0,.75);animation:np-dd-in .16s ease;}
.np-photo-menu button{display:flex;flex-direction:column;align-items:flex-start;gap:2px;width:100%;text-align:left;background:none;border:none;color:var(--text);padding:11px 12px;border-radius:13px;font-size:13.5px;font-weight:700;cursor:pointer;}
.np-photo-menu button:hover{background:var(--surface-2);}
.np-photo-menu small{font-size:11.5px;color:var(--muted);font-weight:500;}
.np-tool{flex-shrink:0;display:inline-flex;align-items:center;gap:7px;border:1px solid transparent;background:none;color:var(--muted);border-radius:12px;padding:7px 11px;font-size:12px;font-weight:700;cursor:pointer;transition:all .15s ease;white-space:nowrap;}
.np-tool:hover{color:var(--text);background:var(--surface-2);}
.np-tool.on{background:var(--btn);color:var(--on-accent);box-shadow:0 6px 14px -8px var(--glow-amber);}
.np-tool-ico{font-size:14px;font-weight:800;min-width:16px;text-align:center;}
@media (max-width:640px){.np-tool-lbl{display:none;}.np-tool{padding:8px 12px;}}

/* canvas / blocks */
.np-canvas{flex:1;overflow-y:auto;padding:18px 22px 40px;-webkit-overflow-scrolling:touch;}
.np-block{display:flex;align-items:flex-start;gap:10px;margin-bottom:2px;border-radius:10px;padding:2px 6px;margin-left:-6px;margin-right:-6px;}
.np-block textarea{flex:1;min-width:0;width:100%;resize:none;overflow:hidden;background:none;border:none;outline:none;color:var(--text);font-size:15px;line-height:1.6;padding:3px 0;display:block;}
.np-block textarea::placeholder{color:var(--muted);opacity:.55;}
.np-block.active{background:var(--surface-2);}
.np-mark{flex-shrink:0;min-width:18px;text-align:center;padding-top:3px;font-size:15px;line-height:1.6;color:var(--accent-text);font-weight:800;}
.np-num{min-width:22px;text-align:right;font-variant-numeric:tabular-nums;}
.np-box{flex-shrink:0;width:20px;height:20px;margin-top:6px;border-radius:7px;border:1.5px solid var(--muted);background:var(--surface-2);cursor:pointer;display:flex;align-items:center;justify-content:center;color:transparent;font-size:12px;font-weight:800;padding:0;transition:all .15s ease;}
.np-box:hover{border-color:var(--amber);}
.np-box.on{background:var(--btn);border-color:transparent;color:var(--on-accent);}
.np-check.checked textarea{text-decoration:line-through;color:var(--muted);}
.np-h textarea{font-size:21px;font-weight:800;letter-spacing:-.02em;line-height:1.3;padding-top:8px;}
.np-quote{border-left:3px solid var(--amber);border-radius:4px 10px 10px 4px;padding-left:12px;margin-left:0;}
.np-quote textarea{font-style:italic;color:var(--muted);}
.np-callout{background:var(--amber-dim);border:1px solid var(--border);border-radius:14px;padding:10px 14px;margin:6px 0;}
.np-callout.active{background:var(--amber-dim);}
.np-callout-ico{flex-shrink:0;font-size:17px;line-height:1.6;}
.np-callout textarea{font-weight:600;}
.np-divider{position:relative;padding:10px 6px;align-items:center;}
.np-divider hr{flex:1;border:none;border-top:1.5px solid var(--border);margin:0;}
.np-divider-x{background:none;border:none;color:var(--muted);cursor:pointer;font-size:16px;line-height:1;opacity:0;transition:opacity .15s ease;}
.np-divider:hover .np-divider-x,.np-divider.active .np-divider-x{opacity:1;}
.np-addline{margin-top:12px;background:none;border:1px dashed var(--border);color:var(--muted);border-radius:12px;padding:8px 14px;font-size:12px;font-weight:600;cursor:pointer;}
.np-addline:hover{border-color:var(--amber);color:var(--text);}

.np-sheet-foot{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 18px calc(12px + env(safe-area-inset-bottom,0px));border-top:1px solid var(--border);}
.np-foot-date{font-size:11.5px;color:var(--muted);}

/* ---------- toast ---------- */
.np-toast{position:fixed;left:50%;bottom:calc(100px + env(safe-area-inset-bottom,0px));transform:translate(-50%,14px);z-index:140;background:var(--sheet-bg);border:1px solid var(--border);color:var(--text);padding:11px 20px;border-radius:var(--r-pill);font-size:13px;font-weight:700;box-shadow:0 14px 30px -10px rgba(0,0,0,.55);opacity:0;pointer-events:none;transition:opacity .2s ease,transform .2s ease;}
.np-toast.show{opacity:1;transform:translate(-50%,0);}

@media (prefers-reduced-motion:reduce){
  .np-fab,.np-backdrop,.np-sheet{animation:none;}
  .np-card,.np-fab{transition:none;}
}


/* ---------- photos ---------- */
.np-img-ph{background:linear-gradient(90deg,var(--surface-2),var(--amber-dim),var(--surface-2));background-size:200% 100%;animation:np-shimmer 1.4s linear infinite;}
@keyframes np-shimmer{from{background-position:200% 0;}to{background-position:-200% 0;}}
.np-photos{margin-top:18px;padding-top:14px;border-top:1px solid var(--border);}
.np-photos-head{display:flex;justify-content:space-between;font-size:10.5px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:var(--muted);margin-bottom:10px;}
.np-photos-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:10px;}
.np-photo{position:relative;aspect-ratio:1;border-radius:16px;overflow:hidden;border:1px solid var(--border);background:var(--surface-2);}
.np-photo-img{width:100%;height:100%;object-fit:cover;display:block;cursor:zoom-in;border-radius:0;}
.np-photo-x{position:absolute;top:6px;right:6px;width:26px;height:26px;border-radius:50%;border:none;background:rgba(0,0,0,.62);color:#fff;font-size:16px;line-height:1;cursor:pointer;}
.np-photo-x:hover{background:var(--rose);}

.np-card-cover{position:relative;margin:0 0 12px;border-radius:14px;overflow:hidden;aspect-ratio:16/9;background:var(--surface-2);}
.np-card-cover-img{width:100%;height:100%;object-fit:cover;display:block;border-radius:0;}
.np-card-cover-n{position:absolute;right:8px;bottom:8px;font-size:11px;font-weight:800;color:#fff;background:rgba(0,0,0,.6);border-radius:var(--r-pill);padding:3px 9px;}

/* camera */
.np-cam{position:fixed;inset:0;z-index:160;background:#000;display:flex;flex-direction:column;}
.np-cam-stage{position:relative;flex:1;min-height:0;overflow:hidden;display:flex;align-items:center;justify-content:center;}
.np-cam-video{width:100%;height:100%;object-fit:cover;background:#000;}
.np-cam-video.mirror{transform:scaleX(-1);}
.np-cam-msg{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;padding:28px;text-align:center;color:#e9edf8;font-size:14px;line-height:1.5;}
.np-cam-msg p{margin:0;max-width:320px;}
.np-cam-flash{position:absolute;inset:0;background:#fff;opacity:0;pointer-events:none;transition:opacity .18s ease;}
.np-cam-flash.on{opacity:.85;transition:none;}
.np-cam-bar{display:flex;align-items:center;justify-content:space-between;padding:18px 26px calc(22px + env(safe-area-inset-bottom,0px));background:#05070e;}
.np-cam-side{min-width:76px;background:none;border:none;color:#e9edf8;font-size:14px;font-weight:700;cursor:pointer;padding:10px 4px;}
.np-cam-side:disabled{opacity:.35;}
.np-cam-shutter{width:76px;height:76px;border-radius:50%;border:4px solid #fff;background:none;padding:5px;cursor:pointer;}
.np-cam-shutter span{display:block;width:100%;height:100%;border-radius:50%;background:#fff;transition:transform .12s ease;}
.np-cam-shutter:active span{transform:scale(.88);}
.np-cam-shutter:disabled{opacity:.35;}

/* photo viewer */
.np-lightbox{position:fixed;inset:0;z-index:170;background:rgba(2,6,18,.9);display:flex;align-items:center;justify-content:center;padding:20px;animation:np-fade .2s ease;}
.np-lightbox-img{max-width:100%;max-height:88vh;border-radius:18px;box-shadow:0 30px 80px rgba(0,0,0,.6);}
.np-lightbox-x,.np-lightbox-close{position:absolute;top:calc(16px + env(safe-area-inset-top,0px));right:18px;width:40px;height:40px;border-radius:50%;border:1px solid rgba(255,255,255,.3);background:rgba(255,255,255,.12);color:#fff;font-size:22px;line-height:1;cursor:pointer;}
`;