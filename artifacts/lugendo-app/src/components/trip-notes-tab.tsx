import { useState } from "react";
import { StickyNote, Plus, Pencil, Trash2, Check, X } from "lucide-react";
import {
  useListMyTripNotes, useCreateTripNote, useUpdateTripNote, useDeleteTripNote,
} from "@workspace/api-client-react";
import type { TripNote, TravelerTripDetail } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { NoteRichTextEditor } from "@/components/note-rich-text-editor";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" });
}

// contentEditable innerHTML for an "empty" note is often "<br>" or similar, not "" -- strip tags
// before checking for visible text so the save button doesn't stay enabled on a blank note.
function isHtmlEmpty(html: string): boolean {
  return !html.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim();
}

// ~20 visible lines at this font size/line-height, per the task's request to make the editing
// area much roomier than the previous 3-4 line textarea.
const EDITOR_MIN_HEIGHT = "min-h-[420px]";

interface TripNotesTabProps {
  tripId: number;
  trip: TravelerTripDetail;
}

export function TripNotesTab({ tripId, trip }: TripNotesTabProps) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: notes, isLoading } = useListMyTripNotes(tripId);
  const createNote = useCreateTripNote();
  const updateNote = useUpdateTripNote();
  const deleteNote = useDeleteTripNote();

  const [showForm, setShowForm] = useState(false);
  const [content, setContent] = useState("");
  const [dayNumber, setDayNumber] = useState<string>("none");
  const [endDayNumber, setEndDayNumber] = useState<string>("none");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editContent, setEditContent] = useState("");

  const invalidate = () => qc.invalidateQueries({ queryKey: [`/api/me/trips/${tripId}/notes`] });

  const days = trip.days ?? [];
  const startDayNum = dayNumber !== "none" ? parseInt(dayNumber, 10) : null;
  const endDayOptions = startDayNum != null ? days.filter(d => d.dayNumber >= startDayNum) : [];

  const resetForm = () => {
    setContent("");
    setDayNumber("none");
    setEndDayNumber("none");
    setShowForm(false);
  };

  const handleCreate = () => {
    if (isHtmlEmpty(content)) return;
    const dn = dayNumber !== "none" ? parseInt(dayNumber, 10) : undefined;
    const edn = dn != null && endDayNumber !== "none" ? parseInt(endDayNumber, 10) : undefined;
    createNote.mutate(
      { tripId, data: { content, dayNumber: dn, endDayNumber: edn } },
      {
        onSuccess: () => {
          invalidate();
          toast({ title: "Nota añadida" });
          resetForm();
        },
        onError: () => toast({ variant: "destructive", title: "Error al crear la nota" }),
      }
    );
  };

  const handleEdit = (note: TripNote) => {
    setEditingId(note.id);
    setEditContent(note.content);
  };

  const handleSaveEdit = (noteId: number) => {
    if (isHtmlEmpty(editContent)) return;
    updateNote.mutate(
      { tripId, noteId, data: { content: editContent } },
      {
        onSuccess: () => {
          invalidate();
          toast({ title: "Nota actualizada" });
          setEditingId(null);
        },
        onError: () => toast({ variant: "destructive", title: "Error al actualizar la nota" }),
      }
    );
  };

  const handleDelete = (noteId: number) => {
    if (!window.confirm("¿Eliminar esta nota?")) return;
    deleteNote.mutate(
      { tripId, noteId },
      {
        onSuccess: () => { invalidate(); toast({ title: "Nota eliminada" }); },
        onError: () => toast({ variant: "destructive", title: "Error al eliminar la nota" }),
      }
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-[13px] font-medium" style={{ color: "var(--noche)" }}>
          Mis notas del viaje
        </p>
        {!showForm && (
          <Button
            size="sm"
            onClick={() => setShowForm(true)}
            style={{ background: "var(--terra)", color: "#fff" }}
            className="h-8 gap-1.5 text-[12px]"
          >
            <Plus className="w-3.5 h-3.5" />
            Nueva nota
          </Button>
        )}
      </div>

      {showForm && (
        <div className="bg-card border border-border rounded-[14px] p-4 space-y-3">
          <p className="text-[12px] font-medium" style={{ color: "var(--noche)" }}>Nueva nota</p>
          <NoteRichTextEditor
            initialHtml=""
            onChange={setContent}
            className={EDITOR_MIN_HEIGHT}
            autoFocus
          />
          {days.length > 0 && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[12px] text-muted-foreground block mb-1.5">
                  Día (opcional)
                </label>
                <Select
                  value={dayNumber}
                  onValueChange={v => { setDayNumber(v); setEndDayNumber("none"); }}
                >
                  <SelectTrigger className="h-8 text-[12px]">
                    <SelectValue placeholder="Sin día específico" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sin día específico</SelectItem>
                    {days.map(d => (
                      <SelectItem key={d.dayNumber} value={String(d.dayNumber)}>
                        Día {d.dayNumber}
                        {d.cityTo ? ` — ${d.cityTo}` : d.cityFrom ? ` — ${d.cityFrom}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {startDayNum != null && (
                <div>
                  <label className="text-[12px] text-muted-foreground block mb-1.5">
                    Hasta el día (opcional)
                  </label>
                  <Select value={endDayNumber} onValueChange={setEndDayNumber}>
                    <SelectTrigger className="h-8 text-[12px]">
                      <SelectValue placeholder="Solo ese día" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Solo ese día</SelectItem>
                      {endDayOptions.map(d => (
                        <SelectItem key={d.dayNumber} value={String(d.dayNumber)}>
                          Día {d.dayNumber}
                          {d.cityTo ? ` — ${d.cityTo}` : d.cityFrom ? ` — ${d.cityFrom}` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          )}
          <div className="flex gap-2 justify-end">
            <Button
              variant="outline"
              size="sm"
              onClick={resetForm}
            >
              Cancelar
            </Button>
            <Button
              size="sm"
              onClick={handleCreate}
              disabled={isHtmlEmpty(content) || createNote.isPending}
              style={{ background: "var(--terra)", color: "#fff" }}
            >
              {createNote.isPending ? "Guardando…" : "Guardar nota"}
            </Button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-2">
          <div className="h-20 bg-card border border-border rounded-[14px] animate-pulse" />
          <div className="h-20 bg-card border border-border rounded-[14px] animate-pulse" />
        </div>
      ) : !notes || notes.length === 0 ? (
        <div
          className="border border-border rounded-[14px] p-8 text-center"
          style={{ background: "var(--arena)" }}
        >
          <StickyNote className="w-8 h-8 mx-auto mb-3" style={{ color: "var(--indigo)" }} />
          <p className="text-sm text-muted-foreground mb-4">
            Apunta ideas, listas de equipaje o cosas que no quieres olvidar
          </p>
          {!showForm && (
            <Button
              size="sm"
              onClick={() => setShowForm(true)}
              style={{ background: "var(--terra)", color: "#fff" }}
            >
              <Plus className="w-3.5 h-3.5 mr-1.5" />
              Nueva nota
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {(notes as TripNote[]).map(note => (
            <div key={note.id} className="p-4 rounded-[14px] border border-border bg-card space-y-2">
              {editingId === note.id ? (
                <>
                  <NoteRichTextEditor
                    initialHtml={editContent}
                    onChange={setEditContent}
                    className={EDITOR_MIN_HEIGHT}
                    autoFocus
                  />
                  <div className="flex gap-2 justify-end">
                    <button
                      onClick={() => setEditingId(null)}
                      className="p-1.5 rounded-[8px] text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleSaveEdit(note.id)}
                      disabled={isHtmlEmpty(editContent) || updateNote.isPending}
                      className="p-1.5 rounded-[8px] transition-colors"
                      style={{ color: "var(--terra)" }}
                    >
                      <Check className="w-4 h-4" />
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex items-start gap-2">
                    <div className="flex-1 min-w-0">
                      {note.dayNumber != null && (
                        <span
                          className="inline-block text-[11px] font-medium px-2 py-0.5 rounded-full mb-1.5"
                          style={{ background: "rgba(61,47,107,0.08)", color: "var(--indigo)" }}
                        >
                          {note.endDayNumber != null && note.endDayNumber !== note.dayNumber
                            ? `Días ${note.dayNumber}–${note.endDayNumber}`
                            : `Día ${note.dayNumber}`}
                        </span>
                      )}
                      {/* content is sanitized server-side (sanitizeNoteHtml, allowlisted tags only) before storage */}
                      <div
                        className="text-[13px] leading-relaxed [&_ul]:list-disc [&_ul]:pl-5 [&_strong]:font-semibold [&_b]:font-semibold"
                        style={{ color: "var(--noche)" }}
                        dangerouslySetInnerHTML={{ __html: note.content }}
                      />
                    </div>
                    <div className="flex items-center gap-1 shrink-0 mt-0.5">
                      <button
                        onClick={() => handleEdit(note)}
                        className="p-1.5 rounded-[8px] text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                        title="Editar nota"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDelete(note.id)}
                        disabled={deleteNote.isPending}
                        className="p-1.5 rounded-[8px] text-muted-foreground hover:text-destructive hover:bg-accent transition-colors"
                        title="Eliminar nota"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  <p className="text-[11px] text-muted-foreground">{fmtDate(note.createdAt)}</p>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
