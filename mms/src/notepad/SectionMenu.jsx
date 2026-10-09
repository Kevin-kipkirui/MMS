import { useCallback, useEffect, useRef, useState } from "react";

export default function SectionMenu({ value, options, counts, total, showAll, onChange, onCreate, variant = "filter", label = "Section" }) {
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
        <span className="nm">{text}</span>
        <span className="ct">{n}</span>
        <span className="ck">{sel ? "✓" : ""}</span>
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
        <span className="np-dd-ico">▣</span>
        <span className="np-dd-text">
          <span className="np-dd-label">{label}</span>
          <span className="np-dd-value">{current}</span>
        </span>
        <span className="np-dd-count">{count}</span>
        <span className="np-dd-chev">▾</span>
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
