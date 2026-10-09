import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { Camera, ImagePlus, Plus, X } from "lucide-react";
import { useAutosave } from "./useAutosave.js";
import BlockRow from "./BlockRow.jsx";
import CameraModal from "./CameraModal.jsx";
import NoteImage from "./NoteImage.jsx";
import { fileToJpeg, drawToJpeg } from "./images.js";
import {
  uid,
  newBlock,
  blockPlain,
  isEmptyNote,
  cloneNote,
  colorOf,
  COLORS,
  BLOCK_TOOLS,
  MD_SHORTCUTS,
  MAX_IMAGES,
  numberBlocks,
} from "./utils.js";

export default function NoteEditor({ note, sections, onCommit, onToast, onOpenImage }) {
  const [draft, setDraft] = useState(() => cloneNote(note));
  useAutosave(draft, onCommit);
  const [slash, setSlash] = useState(null); // { id, q, i }
  const refs = useRef({});
  const [activeId, setActiveId] = useState(draft.blocks[0] ? draft.blocks[0].id : null);
  const [focusReq, setFocusReq] = useState(null); // { id, end }
  const [tagInput, setTagInput] = useState("");

  const [photoMenu, setPhotoMenu] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const fileRef = useRef(null);
  const camRef = useRef(null);
  const photoWrapRef = useRef(null);

  useEffect(() => {
    if (!photoMenu) return;
    const onDown = (e) => {
      if (photoWrapRef.current && !photoWrapRef.current.contains(e.target)) setPhotoMenu(false);
    };
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
    if (!files.length) {
      onToast && onToast("Please choose an image file.");
      return;
    }
    const room = MAX_IMAGES - (draft.images || []).length;
    if (room <= 0) {
      onToast && onToast("Up to " + MAX_IMAGES + " photos per note.");
      return;
    }
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
    if ((draft.images || []).length >= MAX_IMAGES) {
      onToast && onToast("Up to " + MAX_IMAGES + " photos per note.");
      return;
    }
    if (fileRef.current) fileRef.current.click();
  };

  const openCamera = () => {
    setPhotoMenu(false);
    if ((draft.images || []).length >= MAX_IMAGES) {
      onToast && onToast("Up to " + MAX_IMAGES + " photos per note.");
      return;
    }
    if (window.isSecureContext && navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      setCameraOpen(true);
    } else if (camRef.current) {
      camRef.current.click();
    }
  };

  const onCaptured = (dataUrl) => {
    addImages([{ id: uid("img"), local: dataUrl, name: "capture-" + Date.now() + ".jpg" }]);
    setCameraOpen(false);
  };

  const removeImage = (id) =>
    setDraft((d) => ({ ...d, images: (d.images || []).filter((i) => i.id !== id) }));

  const registerRef = useCallback((id, el) => {
    if (el) refs.current[id] = el;
    else delete refs.current[id];
  }, []);

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

  const titleRef = useRef(null);
  useEffect(() => {
    if (isEmptyNote(note) && titleRef.current) titleRef.current.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note]);

  const setBlocks = (fn) => setDraft((d) => ({ ...d, blocks: fn(d.blocks) }));

  const changeText = (id, text) => {
    const m = /^\/(\w*)$/.exec(text);
    setSlash(m ? { id, q: m[1].toLowerCase(), i: 0 } : null);
    setBlocks((bs) =>
      bs.map((b) => {
        if (b.id !== id) return b;
        if (b.type === "text") {
          for (const [re, type] of MD_SHORTCUTS) {
            const hit = text.match(re);
            if (hit) return { ...b, type, text: text.slice(hit[0].length) };
          }
        }
        return { ...b, text };
      })
    );
  };

  const slashItems = useMemo(
    () => (slash ? BLOCK_TOOLS.filter((t) => t.label.toLowerCase().includes(slash.q)) : []),
    [slash]
  );

  const pickSlash = (tool) => {
    const id = slash && slash.id;
    setSlash(null);
    if (!id) return;
    if (tool.type === "divider") {
      const div = newBlock("divider");
      const after = newBlock("text");
      setBlocks((bs) => bs.flatMap((b) => (b.id === id ? [div, after] : [b])));
      setActiveId(after.id);
      setFocusReq({ id: after.id, end: false });
      return;
    }
    setBlocks((bs) => bs.map((b) => (b.id === id ? { ...b, type: tool.type, text: "", checked: false } : b)));
    setFocusReq({ id, end: true });
  };

  useEffect(() => {
    if (slash && slash.id !== activeId) setSlash(null);
  }, [slash, activeId]);

  const handleKeyDown = (e, id, index) => {
    const blocks = draft.blocks;
    const b = blocks[index];
    if (!b) return;
    const el = e.currentTarget;

    if (slash && slash.id === id && slashItems.length) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSlash((s) => ({ ...s, i: (s.i + 1) % slashItems.length }));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSlash((s) => ({ ...s, i: (s.i - 1 + slashItems.length) % slashItems.length }));
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        pickSlash(slashItems[slash.i]);
        return;
      }
      if (e.key === "Escape") {
        e.stopPropagation();
        setSlash(null);
        return;
      }
    }

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      const listy = b.type === "bullet" || b.type === "number" || b.type === "check";
      if (listy && !b.text.trim()) {
        setBlocks((bs) => bs.map((x) => (x.id === id ? { ...x, type: "text", checked: false } : x)));
        setFocusReq({ id, end: true });
        return;
      }

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
          setBlocks((bs) => bs.filter((x) => x.id !== id));
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
    const target = cur.type === type ? "text" : type;
    setBlocks((bs) => bs.map((b) => (b.id === cur.id ? { ...b, type: target, checked: target === "check" ? b.checked : false } : b)));
    setFocusReq({ id: cur.id, end: true });
  };

  const addTag = () => {
    const tag = tagInput.trim();
    if (!tag) return;
    setDraft((d) => ({ ...d, tags: [...(d.tags || []), tag] }));
    setTagInput("");
  };

  const removeTag = (tag) => {
    setDraft((d) => ({ ...d, tags: (d.tags || []).filter((t) => t !== tag) }));
  };

  const numbers = useMemo(() => numberBlocks(draft.blocks), [draft.blocks]);

  const blockList = draft.blocks.map((b, index) => (
    <BlockRow
      key={b.id}
      block={b}
      index={index}
      numberLabel={numbers[b.id]}
      registerRef={registerRef}
      onChange={changeText}
      onKeyDown={handleKeyDown}
      onFocus={setActiveId}
      onToggle={(id) =>
        setBlocks((bs) => bs.map((x) => (x.id === id ? { ...x, checked: !x.checked } : x)))
      }
      onRemoveDivider={(id) => setBlocks((bs) => bs.filter((x) => x.id !== id))}
      active={b.id === activeId}
    />
  ));

  return (
    <>
      <div className="np-scroll">
        <div className="np-doc">
          <input
            ref={titleRef}
            className="np-title-input"
            value={draft.title}
            onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
            placeholder="Untitled"
          />

          <div className="np-meta-row" style={{ marginBottom: 12 }}>
            <select
              className="np-select"
              aria-label="Section"
              value={draft.section}
              onChange={(e) => setDraft((d) => ({ ...d, section: e.target.value }))}
            >
              {(sections.includes(draft.section) ? sections : [...sections, draft.section]).map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>

            <div className="np-colors" aria-label="Note color">
              {COLORS.map((c) => (
                <button
                  key={c.k}
                  type="button"
                  className={`np-swatch${draft.color === c.k ? " sel" : ""}${c.k === "none" ? " none" : ""}`}
                  style={{ background: c.v }}
                  aria-label={c.l}
                  onClick={() => setDraft((d) => ({ ...d, color: c.k }))}
                />
              ))}
            </div>
          </div>

          <div className="np-tags">
            {(draft.tags || []).map((tag) => (
              <span key={tag} className="np-tag">
                #{tag}
                <button type="button" aria-label={"Remove tag " + tag} onClick={() => removeTag(tag)}>
                  ×
                </button>
              </span>
            ))}
            <input
              className="np-tag-input"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addTag();
                }
              }}
              placeholder="Tag"
              maxLength={24}
            />
          </div>

          <div className="np-toolbar">
            <div className="np-toolbar-scroll">
              {BLOCK_TOOLS.map((tool) => {
                const Icon = tool.Icon;
                const active = draft.blocks.some((b) => b.id === activeId && b.type === tool.type);
                return (
                  <button
                    key={tool.type}
                    type="button"
                    className={`np-tool${active ? " on" : ""}`}
                    onClick={() => applyTool(tool.type)}
                  >
                    <Icon size={14} />
                    <span className="np-tool-lbl">{tool.label}</span>
                  </button>
                );
              })}
            </div>

            <div className="np-photo-wrap" ref={photoWrapRef}>
              <button type="button" className="np-btn" onClick={() => setPhotoMenu((v) => !v)} aria-label="Add photo">
                <Camera size={16} />
                Photos
              </button>

              {photoMenu && (
                <div className="np-photo-menu">
                  <button type="button" onClick={openUpload}>
                    <ImagePlus size={16} />
                    <span>Upload from files</span>
                  </button>
                  <button type="button" onClick={openCamera}>
                    <Camera size={16} />
                    <span>Take a photo</span>
                  </button>
                </div>
              )}
            </div>
          </div>

          <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={onPickFiles} />
          <input ref={camRef} type="file" accept="image/*" capture="environment" hidden onChange={onPickFiles} />

          <div className="np-canvas" style={{ paddingTop: 8 }}>
            {draft.blocks.map((b, i) => (
              <React.Fragment key={b.id}>
                <BlockRow
                  block={b}
                  index={i}
                  numberLabel={numbers[b.id]}
                  registerRef={registerRef}
                  onChange={changeText}
                  onKeyDown={handleKeyDown}
                  onFocus={setActiveId}
                  onToggle={(id) =>
                    setBlocks((bs) => bs.map((x) => (x.id === id ? { ...x, checked: !x.checked } : x)))
                  }
                  onRemoveDivider={(id) => setBlocks((bs) => bs.filter((x) => x.id !== id))}
                  active={b.id === activeId}
                />
                {slash && slash.id === b.id && slashItems.length > 0 && (
                  <SlashMenu items={slashItems} index={slash.i} onPick={pickSlash} />
                )}
              </React.Fragment>
            ))}
            <button type="button" className="np-addline" onClick={() => setBlocks((bs) => [...bs, newBlock("text")])}>
              + Add a line
            </button>
          </div>

          {(draft.images || []).length > 0 && (
            <div className="np-photos">
              <div className="np-photos-head">
                <span>Photos</span>
                <span>{(draft.images || []).length}/{MAX_IMAGES}</span>
              </div>
              <div className="np-photos-grid">
                {(draft.images || []).map((img) => (
                  <div key={img.id} className="np-photo">
                    <NoteImage img={img} className="np-photo-img" alt={img.name || "Note photo"} onClick={() => onOpenImage && onOpenImage(img)} />
                    <button type="button" className="np-photo-x" aria-label="Remove photo" onClick={() => removeImage(img.id)}>
                      ×
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

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

          {photoBusy && <div className="np-toast show">Loading photo…</div>}
        </div>
      </div>
    </>
  );
}

function SlashMenu({ items, index, onPick }) {
  return (
    <div className="np-slash" role="listbox" aria-label="Insert block">
      {items.map((t, i) => (
        <button
          key={t.type}
          type="button"
          role="option"
          aria-selected={i === index}
          className={`np-slash-item${i === index ? " on" : ""}`}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onPick(t)}
        >
          <t.Icon size={16} /> {t.label}
        </button>
      ))}
    </div>
  );
}
