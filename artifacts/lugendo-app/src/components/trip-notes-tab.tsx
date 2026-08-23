import { useState } from "react";
import { StickyNote, Plus, Pencil, Trash2, Check, X, Building2, Users } from "lucide-react";
import {
  useListMyTripNotes, useCreateTripNote, useUpdateTripNote, useDeleteTripNote,
  useAddTripNoteShares, useRemoveTripNoteShare, useListTripMembers, getListTripMembersQueryKey,
} from "@workspace/api-client-react";
import type { TripNote, TravelerTripDetail } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { NoteRichTextEditor } from "@/components/note-rich-text-editor";
import { ResourceSharePanel } from "@/components/resource-share-panel";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";

const AGENCY_ROLES = new Set(["admin", "manager", "agent", "advisor"]);

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
  const { user } = useAuth();
  const { data: notes, isLoading } = useListMyTripNotes(tripId);
  const createNote = useCreateTripNote();
  const updateNote = useUpdateTripNote();
  const deleteNote = useDeleteTripNote();
  const addShares = useAddTripNoteShares();
  const removeShare = useRemoveTripNoteShare();
  const membersQuery = useListTripMembers(tripId, {
    query: { queryKey: getListTripMembersQueryKey(tripId) },
  });

  const [showForm, setShowForm] = useState(false);
  const [content, setContent] = useState("");
  const [dayNumber, setDayNumber] = useState<string>("none");
  const [endDayNumber, setEndDayNumber] = useState<string>("none");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editContent, setEditContent] = useState("");
  const [showShareAllDialog, setShowShareAllDialog] = useState(false);
  const [isSharingAll, setIsSharingAll] = useState(false);

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

  const handleAddShares = (note: TripNote, travelerIds: number[], shareWithAll?: boolean) => {
    addShares.mutate(
      { tripId, noteId: note.id, data: { travelerIds, shareWithAll } },
      {
        onSuccess: invalidate,
        onError: () => toast({ variant: "destructive", title: "No se pudo compartir la nota" }),
      },
    );
  };

  const handleRemoveShare = (note: TripNote, travelerId: number) => {
    removeShare.mutate(
      { tripId, noteId: note.id, travelerId },
      {
        onSuccess: () => { invalidate(); toast({ title: "Nota actualizada" }); },
        onError: () => toast({ variant: "destructive", title: "No se pudo actualizar la compartición" }),
      },
    );
  };

  const allNotes = (notes as TripNote[] | undefined) ?? [];
  const isAgencyNote = (n: TripNote) => AGENCY_ROLES.has(n.uploaderRole ?? "traveler");
  const agencyNotes = allNotes.filter(isAgencyNote);
  const myNotes = allNotes.filter(n => !isAgencyNote(n));

  // "Compartir todas" (#155 follow-up): only fills gaps -- notes where the owner deliberately
  // left someone out are left untouched, matching the per-note picker's semantics.
  const otherMembers = (membersQuery.data?.members ?? []).filter(m => m.id !== user?.id);
  const ownNotes = allNotes.filter(n => n.userId === user?.id);
  const noteGaps = ownNotes
    .map(note => ({
      note,
      missing: otherMembers.filter(m => !(note.sharedWith ?? []).some(s => s.id === m.id)),
    }))
    .filter(g => g.missing.length > 0);
  const affectedTravelerCount = new Set(noteGaps.flatMap(g => g.missing.map(m => m.id))).size;
  const canShareAll = ownNotes.length > 0 && otherMembers.length > 0;

  const handleShareAll = async () => {
    setIsSharingAll(true);
    try {
      await Promise.all(noteGaps.map(g => addShares.mutateAsync({
        tripId, noteId: g.note.id, data: { travelerIds: g.missing.map(m => m.id), shareWithAll: true },
      })));
      invalidate();
      toast({ title: "Notas compartidas" });
      setShowShareAllDialog(false);
    } catch {
      toast({ variant: "destructive", title: "No se pudieron compartir todas las notas" });
    } finally {
      setIsSharingAll(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-[13px] font-medium" style={{ color: "var(--noche)" }}>
          Mis notas
        </p>
        <div className="flex items-center gap-2">
          {canShareAll && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowShareAllDialog(true)}
              className="h-8 gap-1.5 text-[12px]"
              style={{ borderColor: "var(--indigo)", color: "var(--indigo)" }}
            >
              <Users className="w-3.5 h-3.5" />
              Compartir todas
            </Button>
          )}
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
      </div>

      <Dialog open={showShareAllDialog} onOpenChange={setShowShareAllDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle style={{ color: "var(--noche)" }}>Compartir todas tus notas</DialogTitle>
          </DialogHeader>
          <p className="text-[13px] text-muted-foreground">
            {noteGaps.length === 0
              ? "Ya has compartido todas tus notas con todos los viajeros de este viaje."
              : `Vas a compartir ${noteGaps.length} nota${noteGaps.length === 1 ? "" : "s"} con ${affectedTravelerCount} viajero${affectedTravelerCount === 1 ? "" : "s"} que aún no ${affectedTravelerCount === 1 ? "tiene" : "tienen"} acceso a alguna de ellas. No se quitará a nadie de las notas ya compartidas.`}
          </p>
          <DialogFooter>
            {noteGaps.length === 0 ? (
              <Button size="sm" onClick={() => setShowShareAllDialog(false)}>Entendido</Button>
            ) : (
              <>
                <Button size="sm" variant="outline" onClick={() => setShowShareAllDialog(false)} disabled={isSharingAll}>
                  Cancelar
                </Button>
                <Button
                  size="sm"
                  onClick={handleShareAll}
                  disabled={isSharingAll}
                  style={{ background: "var(--terra)", color: "#fff" }}
                >
                  {isSharingAll ? "Compartiendo…" : "Compartir"}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
      ) : allNotes.length === 0 ? (
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
        <div className="space-y-4">
          {agencyNotes.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Building2 className="w-3.5 h-3.5 text-muted-foreground" />
                <p className="text-[12px] font-medium uppercase tracking-wider text-muted-foreground">
                  Notas de la agencia
                </p>
              </div>
              <div className="space-y-2">
                {agencyNotes.map(note => (
                  <NoteCard
                    key={note.id}
                    note={note}
                    editable={false}
                    currentUserId={user?.id}
                    tripId={tripId}
                    isEditing={false}
                    editContent={editContent}
                    onEditContentChange={setEditContent}
                    onStartEdit={() => handleEdit(note)}
                    onCancelEdit={() => setEditingId(null)}
                    onSaveEdit={() => handleSaveEdit(note.id)}
                    isSaving={updateNote.isPending}
                    onDelete={() => handleDelete(note.id)}
                    isDeleting={deleteNote.isPending}
                    onAddShares={(travelerIds, shareWithAll) => handleAddShares(note, travelerIds, shareWithAll)}
                    onRemoveShare={(travelerId) => handleRemoveShare(note, travelerId)}
                    isAddingShare={addShares.isPending}
                    isRemovingShare={removeShare.isPending}
                  />
                ))}
              </div>
            </div>
          )}

          {myNotes.length > 0 && (
            <div className="space-y-2">
              <p className="text-[12px] font-medium uppercase tracking-wider text-muted-foreground">
                Mis notas
              </p>
              <div className="space-y-2">
                {myNotes.map(note => (
                  <NoteCard
                    key={note.id}
                    note={note}
                    editable={note.userId === user?.id}
                    currentUserId={user?.id}
                    tripId={tripId}
                    isEditing={editingId === note.id}
                    editContent={editContent}
                    onEditContentChange={setEditContent}
                    onStartEdit={() => handleEdit(note)}
                    onCancelEdit={() => setEditingId(null)}
                    onSaveEdit={() => handleSaveEdit(note.id)}
                    isSaving={updateNote.isPending}
                    onDelete={() => handleDelete(note.id)}
                    isDeleting={deleteNote.isPending}
                    onAddShares={(travelerIds, shareWithAll) => handleAddShares(note, travelerIds, shareWithAll)}
                    onRemoveShare={(travelerId) => handleRemoveShare(note, travelerId)}
                    isAddingShare={addShares.isPending}
                    isRemovingShare={removeShare.isPending}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface NoteCardProps {
  note: TripNote;
  editable: boolean;
  currentUserId: number | undefined;
  tripId: number;
  isEditing: boolean;
  editContent: string;
  onEditContentChange: (html: string) => void;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSaveEdit: () => void;
  isSaving: boolean;
  onDelete: () => void;
  isDeleting: boolean;
  onAddShares: (travelerIds: number[], shareWithAll?: boolean) => void;
  onRemoveShare: (travelerId: number) => void;
  isAddingShare: boolean;
  isRemovingShare: boolean;
}

function NoteCard({
  note, editable, currentUserId, tripId, isEditing, editContent, onEditContentChange,
  onStartEdit, onCancelEdit, onSaveEdit, isSaving, onDelete, isDeleting,
  onAddShares, onRemoveShare, isAddingShare, isRemovingShare,
}: NoteCardProps) {
  const isOwn = note.userId === currentUserId;
  const isAgencyNote = AGENCY_ROLES.has(note.uploaderRole ?? "traveler");
  return (
    <div className="p-4 rounded-[14px] border border-border bg-card space-y-2">
      {isEditing ? (
        <>
          <NoteRichTextEditor
            initialHtml={editContent}
            onChange={onEditContentChange}
            className={EDITOR_MIN_HEIGHT}
            autoFocus
          />
          <div className="flex gap-2 justify-end">
            <button
              onClick={onCancelEdit}
              className="p-1.5 rounded-[8px] text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
            <button
              onClick={onSaveEdit}
              disabled={isHtmlEmpty(editContent) || isSaving}
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
              <div className="flex items-center gap-1.5 flex-wrap mb-1.5">
                {note.dayNumber != null && (
                  <span
                    className="inline-block text-[11px] font-medium px-2 py-0.5 rounded-full"
                    style={{ background: "rgba(61,47,107,0.08)", color: "var(--indigo)" }}
                  >
                    {note.endDayNumber != null && note.endDayNumber !== note.dayNumber
                      ? `Días ${note.dayNumber}–${note.endDayNumber}`
                      : `Día ${note.dayNumber}`}
                  </span>
                )}
                {!editable && !isOwn && (
                  <span
                    className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full uppercase tracking-wide"
                    style={{ background: "rgba(61,47,107,0.10)", color: "var(--indigo)" }}
                  >
                    {isAgencyNote ? "Agencia" : "Compartida"}
                  </span>
                )}
              </div>
              {/* content is sanitized server-side (sanitizeNoteHtml, allowlisted tags only) before storage */}
              <div
                className="text-[13px] leading-relaxed [&_ul]:list-disc [&_ul]:pl-5 [&_strong]:font-semibold [&_b]:font-semibold"
                style={{ color: "var(--noche)" }}
                dangerouslySetInnerHTML={{ __html: note.content }}
              />
            </div>
            {editable && (
              <div className="flex items-center gap-1 shrink-0 mt-0.5">
                <button
                  onClick={onStartEdit}
                  className="p-1.5 rounded-[8px] text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                  title="Editar nota"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={onDelete}
                  disabled={isDeleting}
                  className="p-1.5 rounded-[8px] text-muted-foreground hover:text-destructive hover:bg-accent transition-colors"
                  title="Eliminar nota"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] text-muted-foreground">{fmtDate(note.createdAt)}</p>
            {!isAgencyNote && (
              <ResourceSharePanel
                tripId={tripId}
                isOwner={isOwn}
                isRecipient={!isOwn}
                sharedWith={note.sharedWith ?? []}
                sharedWithAll={note.sharedWithAll}
                currentUserId={currentUserId}
                isAdding={isAddingShare}
                isRemoving={isRemovingShare}
                onAdd={onAddShares}
                onRemove={onRemoveShare}
              />
            )}
          </div>
        </>
      )}
    </div>
  );
}
