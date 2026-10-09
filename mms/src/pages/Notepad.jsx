import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import "../notepad/notepad.css";
import { supabase } from "../lib/supabase";
import { pullNotes, pushNotes, deleteNotes, pullSections, pushSections, uploadImage, removeImages } from "../lib/notesSync";
import { useIdbState } from "../notepad/useIdbState";
import useLocalStorageState from "../notepad/useLocalStorageState";
import { useNav } from "../notepad/useNav";
import Sidebar from "../notepad/Sidebar";
import PageList from "../notepad/PageList";
import NoteCanvas from "../notepad/NoteCanvas";
import NoteImage from "../notepad/NoteImage";
import {
  readLS,
  uid,
  DEFAULT_SECTIONS,
  COLORS,
  colorOf,
  newBlock,
  blockPlain,
  fmtDate,
  PLACEHOLDER,
  MAX_IMAGES,
  BLOCK_TOOLS,
  sig,
  swapImages,
  isEmptyNote,
} from "../notepad/utils";

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
          <div className="np-toolbar-scroll">
            {BLOCK_TOOLS.map((t) => {
              const Icon = t.Icon;
              return (
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
                  <span className="np-tool-ico"><Icon size={16} strokeWidth={2} /></span>
                  <span className="np-tool-lbl">{t.label}</span>
                </button>
              );
            })}
          </div>

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
            <div className="np-photos">
              <div className="np-photos-head"><span>Photos</span><span>{images.length}/{MAX_IMAGES}</span></div>
              <div className="np-photos-grid">
                {images.map((im) => (
                  <div className="np-photo" key={im.id}>
                    <NoteImage img={im} className="np-photo-img" onClick={() => onOpenImage && onOpenImage(im)} />
                    <button type="button" className="np-photo-x" aria-label="Remove photo" onClick={() => removeImage(im.id)}>&times;</button>
                  </div>
                ))}
                {photoBusy && <div className="np-photo np-img-ph" />}
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

// ---------- main component ----------
export default function Notepad({ onBack, onSaveNote, onDeleteNote } = {}) {
  const [theme, setTheme] = useLocalStorageState("td_theme", "dark");
  const [notes, setNotes, notesReady] = useIdbState("td_notes", [], "td_notes");
  const notesRef = useRef(notes);
  notesRef.current = notes;
  const { nav, go, navRef } = useNav();
  const [sections, setSections] = useLocalStorageState("td_note_sections", DEFAULT_SECTIONS);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useLocalStorageState("td_notes_sort", "updated"); // updated | created | title
  const [lightbox, setLightbox] = useState(null);
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);
  const searchRef = useRef(null);
  const filter = nav.section || "All";

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
    if (hydrated || !notesReady) return;
    let cancelled = false;
    (async () => {
      try {
        setSyncState("syncing");
        const [remoteNotes, remoteSections] = await Promise.all([pullNotes(userId), pullSections(userId)]);
        if (cancelled) return;

        const deleted = new Set(readLS("td_notes_deleted", []));
        const byId = {};
        remoteNotes.forEach((n) => { if (!deleted.has(n.id)) byId[n.id] = n; });
        notesRef.current.forEach((n) => {
          if (deleted.has(n.id)) return;
          const r = byId[n.id];
          if (!r || (n.updatedAt || 0) > (r.updatedAt || 0)) byId[n.id] = n;
        });
        const merged = Object.values(byId).sort((a, b) => b.updatedAt - a.updatedAt);

        // remember what the server already has, so only real changes get pushed
        const map = {};
        remoteNotes.forEach((r) => {
          const m = byId[r.id];
          if (m && sig(m) === sig(r)) map[r.id] = sig(r);
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
  }, [userId, hydrated, retryTick, notesReady]);

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
    const changed = notes.filter((n) => !isEmptyNote(n) && pushedNotes.current[n.id] !== sig(n));
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
            pushedNotes.current[p.note.id] = sig(p.note);
            swaps[p.note.id] = p.note;
          } else {
            allOk = false;
          }
        });

        if (Object.keys(swaps).length) {
          setNotes((ns) =>
            ns.map((x) => (swaps[x.id] ? { ...x, images: swapImages(x.images || [], swaps[x.id].images || []) } : x))
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

  const showToast = (msg, action, ms) => {
    setToast({ msg, action });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), ms || (action ? 6000 : 2600));
  };
  useEffect(() => () => clearTimeout(toastTimer.current), []);

  const addSectionByName = (raw) => {
    const name = (raw || "").trim().slice(0, 24);
    if (!name) return null;
    const existing = allSections.find((s) => s.toLowerCase() === name.toLowerCase());
    if (existing) return existing;
    setSections((s) => [...s, name]);
    return name;
  };

  const upsert = (list, n) => (list.some((x) => x.id === n.id) ? list.map((x) => (x.id === n.id ? n : x)) : [n, ...list]);

  const commitNote = useCallback((note) => {
    const next = { ...note, updatedAt: Date.now() };
    const prev = notesRef.current.find((x) => x.id === next.id);
    if (prev) {
      const keep = new Set((next.images || []).map((i) => i.id));
      const gone = (prev.images || []).filter((i) => i.path && !keep.has(i.id)).map((i) => i.path);
      if (gone.length) setPendingImgDeletes((p) => [...p, ...gone.filter((x) => !p.includes(x))]);
    }
    notesRef.current = upsert(notesRef.current, next);
    setNotes((ns) => upsert(ns, next));
    if (typeof onSaveNote === "function") {
      try { onSaveNote(next); } catch (e) { /* ignore */ }
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const commitDraft = (d) => {
    const cur = notesRef.current.find((n) => n.id === d.id);
    const images = (d.images || []).map((i) => {
      const c = cur && (cur.images || []).find((x) => x.id === i.id);
      return c && c.path ? { id: c.id, path: c.path, name: c.name } : i;
    });
    commitNote({ ...d, images, pinned: cur ? cur.pinned : d.pinned });
  };

  const togglePin = (id) => {
    const n = notesRef.current.find((x) => x.id === id);
    if (n) commitNote({ ...n, pinned: !n.pinned });
  };

  const toggleCheck = (noteId, blockId) => {
    const n = notesRef.current.find((x) => x.id === noteId);
    if (n) commitNote({ ...n, blocks: n.blocks.map((b) => (b.id === blockId ? { ...b, checked: !b.checked } : b)) });
  };

  const openNew = () => {
    const n = {
      id: uid("note"),
      title: "",
      section: filter !== "All" ? filter : sections[0] || "General",
      color: "none",
      pinned: false,
      tags: [],
      blocks: [newBlock("text")],
      images: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    commitNote(n);
    go({ noteId: n.id, editing: true, section: nav.section || "All" });
  };

  const openNote = (id) => go({ noteId: id, editing: false }, { replace: !!navRef.current.noteId });

  const discardNote = (id) => {
    notesRef.current = notesRef.current.filter((n) => n.id !== id);
    setNotes((ns) => ns.filter((n) => n.id !== id));
    if (pushedNotes.current[id]) {
      setPendingDeletes((p) => (p.includes(id) ? p : [...p, id]));
      delete pushedNotes.current[id];
    }
  };

  const deleteNote = (id) => {
    const note = notesRef.current.find((n) => n.id === id);
    if (!note) return;
    let undone = false;
    discardNote(id);
    if (typeof onDeleteNote === "function") {
      try { onDeleteNote(id); } catch (e) { /* ignore */ }
    }
    go({ noteId: null, editing: false }, { replace: true });
    showToast("Note deleted", {
      label: "Undo",
      run: () => {
        undone = true;
        setPendingDeletes((p) => p.filter((x) => x !== id));
        notesRef.current = [note, ...notesRef.current];
        setNotes((ns) => [note, ...ns]);
      },
    });
    setTimeout(() => {
      if (undone) return;
      const paths = (note.images || []).filter((i) => i.path).map((i) => i.path);
      if (paths.length) setPendingImgDeletes((p) => [...p, ...paths.filter((x) => !p.includes(x))]);
    }, 6500);
  };

  const prevNav = useRef({ id: null, editing: false });
  useEffect(() => {
    const p = prevNav.current;
    prevNav.current = { id: nav.noteId, editing: nav.editing };
    const left = p.id && (p.id !== nav.noteId || (p.editing && !nav.editing));
    if (!left) return;
    const n = notesRef.current.find((x) => x.id === p.id);
    if (n && isEmptyNote(n)) {
      discardNote(p.id);
      if (nav.noteId === p.id) go({ noteId: null, editing: false }, { replace: true });
    }
  }, [nav.noteId, nav.editing]); // eslint-disable-line react-hooks/exhaustive-deps

  const renameSection = (from, to) => {
    const name = (to || "").trim().slice(0, 24);
    if (!name || name === from) return;
    if (allSections.some((s) => s !== from && s.toLowerCase() === name.toLowerCase())) { showToast("That section already exists."); return; }
    setSections((s) => s.map((x) => (x === from ? name : x)));
    setNotes((ns) => ns.map((n) => (n.section === from ? { ...n, section: name, updatedAt: Date.now() } : n)));
    if (nav.section === from) go({ section: name }, { replace: true });
  };

  const deleteSection = (name) => {
    if (!window.confirm(`Delete "${name}"? Its notes move to General.`)) return;
    setSections((s) => { const out = s.filter((x) => x !== name); return out.includes("General") ? out : [...out, "General"]; });
    setNotes((ns) => ns.map((n) => (n.section === name ? { ...n, section: "General", updatedAt: Date.now() } : n)));
    if (nav.section === name) go({ section: "All" }, { replace: true });
  };

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") {
        if (lightbox) setLightbox(null);
        else if (navRef.current.editing) go({ editing: false }, { replace: true });
        return;
      }
      const t = e.target;
      if ((t.closest && t.closest("input,textarea,select")) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "n") { e.preventDefault(); openNew(); }
      else if (e.key === "/") { e.preventDefault(); searchRef.current && searchRef.current.focus(); }
      else if (e.key === "e" && navRef.current.noteId) { e.preventDefault(); go({ editing: true }); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const sectionCounts = useMemo(() => {
    const m = {};
    notes.forEach((n) => { m[n.section] = (m[n.section] || 0) + 1; });
    return m;
  }, [notes]);

  const allSections = useMemo(() => {
    const extra = Object.keys(sectionCounts).filter((s) => !sections.includes(s));
    return [...sections, ...extra];
  }, [sections, sectionCounts]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = notes.filter((n) => filter === "All" || n.section === filter);
    if (q) list = list.filter((n) => (n.title + " " + n.tags.join(" ") + " " + n.blocks.map(blockPlain).join(" ")).toLowerCase().includes(q));
    const cmp = sort === "title" ? (a, b) => (a.title || "").localeCompare(b.title || "")
      : sort === "created" ? (a, b) => b.createdAt - a.createdAt
      : (a, b) => b.updatedAt - a.updatedAt;
    return list.slice().sort(cmp);
  }, [notes, filter, query, sort]);

  const current = notes.find((n) => n.id === nav.noteId) || null;
  const level = current ? "note" : nav.section ? "list" : "sections";

  return (
    <div className="np-root" data-theme={theme}>
      <div className="np-app" data-level={level}>
        <Sidebar
          sections={allSections}
          counts={sectionCounts}
          total={notes.length}
          active={filter}
          onSelect={(v) => go({ section: v, noteId: null, editing: false }, { replace: navRef.current.section != null })}
          onAddSection={(n) => { const s = addSectionByName(n); if (s) go({ section: s, noteId: null, editing: false }); }}
          onRenameSection={renameSection}
          onDeleteSection={deleteSection}
          onNew={openNew}
          theme={theme}
          onToggleTheme={() => setTheme(theme === "light" ? "dark" : "light")}
          onExit={() => (typeof onBack === "function" ? onBack() : (window.location.hash = ""))}
          syncLabel={syncLabel}
        />

        <PageList
          title={filter === "All" ? "All notes" : filter}
          notes={visible}
          hasAny={notes.length > 0}
          activeId={nav.noteId}
          query={query}
          setQuery={setQuery}
          searchRef={searchRef}
          sort={sort}
          setSort={setSort}
          onOpen={openNote}
          onNew={openNew}
          onUp={() => go({ section: null, noteId: null, editing: false }, { replace: true })}
        />

        <NoteCanvas
          note={current}
          editing={!!nav.editing}
          sections={(allSections.includes(filter) ? allSections : [...allSections, filter])}
          onUp={() => go({ noteId: null, editing: false }, { replace: true })}
          onEdit={() => go({ editing: true })}
          onDone={() => go({ editing: false }, { replace: true })}
          onPin={() => current && togglePin(current.id)}
          onDelete={() => current && deleteNote(current.id)}
          onCommit={commitDraft}
          onToggleCheck={toggleCheck}
          onToast={showToast}
          onOpenImage={setLightbox}
        />
      </div>

      {lightbox && (
        <div className="np-lightbox" onClick={() => setLightbox(null)}>
          <button type="button" className="np-lightbox-close" aria-label="Close photo" onClick={() => setLightbox(null)}>×</button>
          <NoteImage img={lightbox} className="np-lightbox-img" />
        </div>
      )}

      <div className={`np-toast${toast ? " show" : ""}`} role="status" aria-live="polite">
        {toast && toast.msg}
        {toast && toast.action && (
          <button type="button" onClick={() => { toast.action.run(); setToast(null); }}>{toast.action.label}</button>
        )}
      </div>
    </div>
  );
}
