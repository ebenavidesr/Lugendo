import { useState, useRef, useCallback } from "react";
import { Loader2, Pencil } from "lucide-react";

interface InlineFieldProps {
  value: string;
  onSave: (value: string) => Promise<void>;
  type?: "text" | "textarea" | "date" | "number";
  placeholder?: string;
  emptyPlaceholder?: string;
  className?: string;
  displayClassName?: string;
  inputClassName?: string;
  rows?: number;
  disabled?: boolean;
}

export function InlineField({
  value,
  onSave,
  type = "text",
  placeholder,
  emptyPlaceholder = "—",
  className = "",
  displayClassName = "",
  inputClassName = "",
  rows = 3,
  disabled = false,
}: InlineFieldProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const startEdit = () => {
    if (disabled) return;
    setDraft(value);
    setEditing(true);
    setTimeout(() => {
      inputRef.current?.focus();
      textareaRef.current?.focus();
    }, 0);
  };

  const cancel = () => {
    setEditing(false);
    setDraft(value);
  };

  const save = useCallback(async () => {
    const trimmed = draft.trim !== undefined ? draft.trim() : draft;
    if (trimmed === value) { setEditing(false); return; }
    setSaving(true);
    try {
      await onSave(trimmed);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }, [draft, value, onSave]);

  if (editing) {
    const baseInputClass = `border border-[#3D2F6B] rounded-[6px] px-2 py-1 text-[13px] outline-none focus:ring-2 focus:ring-[#3D2F6B]/30 w-full bg-white ${inputClassName}`;

    if (type === "textarea") {
      return (
        <div className={`relative ${className}`}>
          <textarea
            ref={textareaRef}
            value={draft}
            rows={rows}
            placeholder={placeholder}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => { if (e.key === "Escape") cancel(); }}
            onBlur={save}
            disabled={saving}
            className={baseInputClass}
            autoFocus
          />
          {saving && (
            <Loader2 className="absolute right-2 top-2 w-3.5 h-3.5 animate-spin text-muted-foreground" />
          )}
        </div>
      );
    }

    return (
      <div className={`relative flex items-center ${className}`}>
        <input
          ref={inputRef}
          type={type}
          value={draft}
          placeholder={placeholder}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => {
            if (e.key === "Escape") cancel();
            if (e.key === "Enter") { e.preventDefault(); void save(); }
          }}
          onBlur={save}
          disabled={saving}
          className={baseInputClass}
          autoFocus
        />
        {saving && (
          <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground shrink-0 ml-2" />
        )}
      </div>
    );
  }

  return (
    <button
      onClick={startEdit}
      disabled={disabled}
      className={`group inline-flex items-center gap-1 text-left cursor-pointer rounded-[4px] hover:bg-black/5 px-1 -mx-1 py-0.5 -my-0.5 transition-colors disabled:cursor-default ${className}`}
    >
      <span className={`${displayClassName} ${!value ? "text-muted-foreground italic" : ""}`}>
        {value || emptyPlaceholder}
      </span>
      {!disabled && (
        <Pencil className="w-3 h-3 opacity-0 group-hover:opacity-35 transition-opacity text-muted-foreground shrink-0" />
      )}
    </button>
  );
}
