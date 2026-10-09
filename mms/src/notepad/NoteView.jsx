import React, { useMemo } from "react";
import { Check, Lightbulb } from "lucide-react";
import NoteImage from "./NoteImage.jsx";
import { numberBlocks, fmtFull, colorOf } from "./utils.js";

const URL_RE = /(https?:\/\/[^\s<>"']+)/g;

const Linkify = ({ text = "" }) =>
  text.split(URL_RE).map((part, index) => {
    if (index % 2 === 1) {
      return (
        <a key={index} href={part} target="_blank" rel="noreferrer noopener">
          {part}
        </a>
      );
    }
    return <React.Fragment key={index}>{part}</React.Fragment>;
  });

function ViewBlock({ b, n, onToggle }) {
  switch (b.type) {
    case "divider":
      return <hr className="nv-hr" />;
    case "h":
      return <div className="nv nv-h">{b.text || "Heading"}</div>;
    case "bullet":
      return (
        <div className="nv-li">
          <div className="nv-mark">•</div>
          <div className="nv"><Linkify text={b.text} /></div>
        </div>
      );
    case "number":
      return (
        <div className="nv-li">
          <div className="nv-mark">{n}.</div>
          <div className="nv"><Linkify text={b.text} /></div>
        </div>
      );
    case "check":
      return (
        <div className="nv-li">
          <button
            type="button"
            role="checkbox"
            aria-checked={b.checked}
            className={`nv-box${b.checked ? " on" : ""}`}
            onClick={() => onToggle(b.id)}
          >
            {b.checked && <Check size={12} />}
          </button>
          <div className={`nv${b.checked ? " nv-done" : ""}`}>
            <Linkify text={b.text || "To-do"} />
          </div>
        </div>
      );
    case "quote":
      return (
        <blockquote className="nv-quote">
          <Linkify text={b.text} />
        </blockquote>
      );
    case "callout":
      return (
        <div className="nv-callout">
          <Lightbulb size={16} />
          <div>
            <Linkify text={b.text || "Key point"} />
          </div>
        </div>
      );
    default:
      return b.text.trim() ? (
        <div className="nv">
          <Linkify text={b.text} />
        </div>
      ) : null;
  }
}

export default function NoteView({ note, onToggleCheck, onOpenImage }) {
  const numbers = useMemo(() => numberBlocks(note.blocks || []), [note.blocks]);
  const imgs = note.images || [];

  return (
    <div className="np-doc">
      <h1 className="np-doc-title">{note.title || "Untitled"}</h1>

      <div className="np-doc-meta">
        {note.color !== "none" && <span className="np-dot" style={{ background: colorOf(note.color) }} />}
        <span>{note.section}</span>
        <span>Edited {fmtFull(note.updatedAt)}</span>
      </div>

      {note.tags && note.tags.length > 0 && (
        <div className="np-doc-meta" style={{ marginTop: -8, marginBottom: 18 }}>
          {note.tags.map((t) => (
            <span key={t} className="np-chip">#{t}</span>
          ))}
        </div>
      )}

      {imgs.length > 0 && (
        <div className="nv-photos">
          {imgs.map((im) => (
            <NoteImage key={im.id} img={im} className="nv-photo" onClick={() => onOpenImage(im)} />
          ))}
        </div>
      )}

      <div className="np-doc-body">
        {(note.blocks || []).map((b) => (
          <ViewBlock key={b.id} b={b} n={numbers[b.id]} onToggle={(id) => onToggleCheck(note.id, id)} />
        ))}
      </div>
    </div>
  );
}
