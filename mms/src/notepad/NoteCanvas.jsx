import React from "react";
import { ChevronLeft, Pin, PinOff, Pencil, Check, Trash2, NotebookPen } from "lucide-react";
import NoteView from "./NoteView.jsx";
import NoteEditor from "./NoteEditor.jsx";

export default function NoteCanvas({
  note,
  editing,
  sections,
  onUp,
  onEdit,
  onDone,
  onPin,
  onDelete,
  onCommit,
  onToggleCheck,
  onToast,
  onOpenImage,
}) {
  if (!note) {
    return (
      <section className="np-pane np-pane--canvas">
        <div className="np-empty" style={{ margin: "auto" }}>
          <h3>Select a note</h3>
          <p>Or press N to start a new one.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="np-pane np-pane--canvas">
      <div className="np-bar">
        <button type="button" className="np-icon-btn" aria-label="Go back" onClick={onUp}>
          <ChevronLeft size={16} />
        </button>
        <div className="np-bar-spacer" />

        <button
          type="button"
          className="np-icon-btn"
          aria-pressed={note.pinned}
          aria-label={note.pinned ? "Unpin note" : "Pin note"}
          onClick={onPin}
        >
          {note.pinned ? <PinOff size={16} /> : <Pin size={16} />}
        </button>

        {editing ? (
          <button type="button" className="np-btn np-btn--primary" onClick={onDone}>
            <Check size={16} /> Done
          </button>
        ) : (
          <button type="button" className="np-btn" onClick={onEdit}>
            <Pencil size={16} /> Edit
          </button>
        )}

        <button type="button" className="np-icon-btn" aria-label="Delete note" onClick={onDelete}>
          <Trash2 size={16} />
        </button>

        <button type="button" className="np-icon-btn" aria-label="Create note" onClick={onCommit}>
          <NotebookPen size={16} />
        </button>
      </div>

      <div className="np-edit">
        {editing ? (
          <NoteEditor
            note={note}
            sections={sections}
            onToast={onToast}
            onDone={onDone}
            onDelete={onDelete}
            onOpenImage={onOpenImage}
          />
        ) : (
          <NoteView note={note} onToggleCheck={onToggleCheck} onOpenImage={onOpenImage} />
        )}
      </div>
    </section>
  );
}
