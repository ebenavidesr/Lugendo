import { useEffect, useRef } from "react";
import { Bold, Italic, List } from "lucide-react";
import { cn } from "@/lib/utils";

interface NoteRichTextEditorProps {
  initialHtml: string;
  onChange: (html: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  className?: string;
}

// Minimal contentEditable-based rich text editor (bold/italic/bullet list) -- no dependency
// pulled in, since nothing in the app uses a rich text library yet. The editor is uncontrolled
// after mount (React never re-renders its innerHTML) to avoid fighting contentEditable for
// cursor position; onChange reports the current innerHTML on every input/toolbar action, and the
// caller reads it on submit. The HTML is sanitized server-side (sanitizeNoteHtml) before storage,
// which is the trust boundary -- this component does not sanitize.
export function NoteRichTextEditor({
  initialHtml,
  onChange,
  placeholder = "Escribe tu nota aquí…",
  autoFocus,
  className,
}: NoteRichTextEditorProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (ref.current) ref.current.innerHTML = initialHtml;
    if (autoFocus) ref.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once on mount only, by design
  }, []);

  const exec = (command: string) => {
    ref.current?.focus();
    document.execCommand(command);
    onChange(ref.current?.innerHTML ?? "");
  };

  return (
    <div className="border border-input rounded-md overflow-hidden bg-background">
      <div className="flex items-center gap-1 border-b border-input bg-muted/30 px-2 py-1">
        <button
          type="button"
          onMouseDown={e => e.preventDefault()}
          onClick={() => exec("bold")}
          className="p-1.5 rounded hover:bg-accent transition-colors"
          title="Negrita"
          aria-label="Negrita"
        >
          <Bold className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onMouseDown={e => e.preventDefault()}
          onClick={() => exec("italic")}
          className="p-1.5 rounded hover:bg-accent transition-colors"
          title="Cursiva"
          aria-label="Cursiva"
        >
          <Italic className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onMouseDown={e => e.preventDefault()}
          onClick={() => exec("insertUnorderedList")}
          className="p-1.5 rounded hover:bg-accent transition-colors"
          title="Lista"
          aria-label="Lista"
        >
          <List className="w-3.5 h-3.5" />
        </button>
      </div>
      <div
        ref={ref}
        contentEditable
        onInput={() => onChange(ref.current?.innerHTML ?? "")}
        data-placeholder={placeholder}
        className={cn(
          "px-3 py-2 text-[13px] leading-relaxed outline-none overflow-y-auto",
          "empty:before:content-[attr(data-placeholder)] empty:before:text-muted-foreground",
          "[&_ul]:list-disc [&_ul]:pl-5 [&_strong]:font-semibold [&_b]:font-semibold",
          className,
        )}
        style={{ color: "var(--noche)" }}
      />
    </div>
  );
}
