import { useEffect, useLayoutEffect, useRef } from "react";
import { Check, Lightbulb } from "lucide-react";
import { PLACEHOLDER } from "./utils.js";

export default function BlockRow({ block, index, numberLabel, registerRef, onChange, onKeyDown, onFocus, onToggle, onRemoveDivider, active }) {
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
          {block.checked && <Check size={13} strokeWidth={3} />}
        </button>
      )}
      {block.type === "callout" && <Lightbulb size={18} className="np-callout-ico" />}
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
