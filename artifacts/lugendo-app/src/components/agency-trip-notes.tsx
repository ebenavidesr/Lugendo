import { useState } from "react";
import { StickyNote, Plus, Pencil, Trash2, Check, X } from "lucide-react";
import {
  useListTripNotesAdmin, useCreateTripNoteAdmin, useUpdateTripNoteAdmin, useDeleteTripNoteAdmin,
} from "@workspace/api-client-react";
import type { TripNote } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
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

const EDITOR_MIN_HEIGHT = "min-h-[300px]";

interface AgencyTripNotesProps {
  tripId: number;
  days?: { dayNumber: number; cityFrom?: string | null; cityTo?: string | null }[];
  readOnly?: boolean;
}

// Mirror of trip-notes-tab.tsx's traveler notes, for the back office (#153). Agency notes are a
// new concept: previously trip_notes only had traveler-authored rows, with no agency-side UI.
export function AgencyTripNotes({ tripId, days = [], readOnly = false }: AgencyTripNotesProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const qc = useQueryClient();

  const { data: notes, isLoading } = useListTripNotesAdmin(tripId);
  const createNote = useCreateTripNoteAdmin();
  const updateNote = useUpdateTripNoteAdmin();
  const deleteNote = useDeleteTripNoteAdmin();

  const [showForm, setShowForm] = useState(false);
  const [content, setContent] = useState("");
  const [dayNumber, setDayNumber] = useState<string>("none");
  const [endDayNumber, setEndDayNumber] = useState<string>("none");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editContent, setEditContent] = useState("");

  const invalidate = () => qc.invalidateQueries({ queryKey: [`/api/trips/${tripId}/notes`] });

  const startDayNum = dayNumber !== "none" ? parseInt(dayNumber, 10) : null;
  const endDayOptions = startDayNum != null ? days.filter(d => d.dayNumber >= startDayNum) : [];

  const canManageNote = (note: TripNote) => {
    if (readOnly) return false;
    if (user?.role === "admin" || user?.role === "manager") return true;
    if (user?.role === "agent") return note.userId === user.id;
    return false;
  };

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
        onSuccess: () => { invalidate(); toast({ title: "Nota añadida" }); resetForm(); },
        onError: () => toast({ variant: "destructive", title: "Error al crear la nota" }),
      },
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
        onSuccess: () => { invalidate(); toast({ title: "Nota actualizada" }); setEditingId(null); },
        onError: () => toast({ variant: "destructive", title: "Error al actualizar la nota" }),
      },
    );
  };

  const handleDelete = (noteId: number) => {
    if (!window.confirm("¿Eliminar esta nota?")) return;
    deleteNote.mutate(
      { tripId, noteId },
      {
        onSuccess: () => { invalidate(); toast({ title: "Nota eliminada" }); },
        onError: () => toast({ variant: "destructive", title: "Error al eliminar la nota" }),
      },
    );
  };

  return (
    <div className="bg-card border border-border rounded-[14px] shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
        <span className="text-[13px] font-medium" style={{ color: "#2D1F0E" }}>
          Notas ({notes?.length ?? 0})
        </span>
        {!readOnly && !showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[8px] text-[12px] font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ background: "#C4793A", color: "#FAF2EB" }}
          >
            <Plus className="w-3.5 h-3.5" />
            Nueva nota
          </button>
        )}
      </div>

      {showForm && (
        <div className="p-4 space-y-3 border-b border-border">
          <NoteRichTextEditor initialHtml="" onChange={setContent} className={EDITOR_MIN_HEIGHT} autoFocus />
          {days.length > 0 && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[12px] text-muted-foreground block mb-1.5">Día (opcional)</label>
                <Select value={dayNumber} onValueChange={v => { setDayNumber(v); setEndDayNumber("none"); }}>
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
                  <label className="text-[12px] text-muted-foreground block mb-1.5">Hasta el día (opcional)</label>
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
            <Button variant="outline" size="sm" onClick={resetForm}>Cancelar</Button>
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
        <div className="px-5 py-4 space-y-2">
          <div className="h-14 bg-muted rounded-[10px] animate-pulse" />
          <div className="h-14 bg-muted rounded-[10px] animate-pulse" />
        </div>
      ) : !notes || notes.length === 0 ? (
        <div className="px-5 py-8 text-center">
          <StickyNote className="w-7 h-7 mx-auto mb-2 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            {readOnly ? "No hay notas de la agencia" : "Añade avisos o recordatorios visibles para todo el grupo"}
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {notes.map((note: TripNote) => (
            <li key={note.id} className="px-5 py-3">
              {editingId === note.id ? (
                <div className="space-y-2">
                  <NoteRichTextEditor initialHtml={editContent} onChange={setEditContent} className={EDITOR_MIN_HEIGHT} autoFocus />
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
                </div>
              ) : (
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
                    <p className="text-[11px] text-muted-foreground mt-1">{fmtDate(note.createdAt)}</p>
                  </div>
                  {canManageNote(note) && (
                    <div className="flex items-center gap-1 shrink-0">
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
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
