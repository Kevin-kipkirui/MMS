import { useMemo } from "react";
import NoteImage from "./NoteImage.jsx";
import { blockPlain, colorOf, fmtDate } from "./utils.js";

export default function NoteCard({ note, onOpen, onPin, onToggleCheck }) {
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
