import { useState } from "react";
import { Users, Check, ChevronsUpDown, X, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useListTripMembers, getListTripMembersQueryKey } from "@workspace/api-client-react";
import { cn } from "@/lib/utils";

// Recipient management for a traveler's own document/note (#153): a small popover picker plus
// removable chips, same visual pattern as the #151 activity participant picker. Shown only to
// the resource's creator; recipients instead see a "Salir" action via `isRecipient`.
interface ResourceSharePanelProps {
  tripId: number;
  isOwner: boolean;
  isRecipient: boolean;
  sharedWith: { id: number; name?: string | null }[];
  onAdd: (travelerIds: number[]) => void;
  onRemove: (travelerId: number) => void;
  isAdding?: boolean;
  isRemoving?: boolean;
  currentUserId?: number;
}

export function ResourceSharePanel({
  tripId, isOwner, isRecipient, sharedWith, onAdd, onRemove, isAdding, isRemoving, currentUserId,
}: ResourceSharePanelProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const membersQuery = useListTripMembers(tripId, {
    query: { queryKey: getListTripMembersQueryKey(tripId), enabled: pickerOpen },
  });
  const availableMembers = (membersQuery.data?.members ?? []).filter(
    m => !sharedWith.some(s => s.id === m.id),
  );

  if (!isOwner && isRecipient && currentUserId != null) {
    return (
      <button
        type="button"
        onClick={() => onRemove(currentUserId)}
        disabled={isRemoving}
        className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-destructive transition-colors disabled:opacity-50"
      >
        <LogOut className="w-3 h-3" />
        Salir
      </button>
    );
  }

  if (!isOwner) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {sharedWith.map(s => (
        <span
          key={s.id}
          className="inline-flex items-center gap-1 text-[11px] font-medium pl-2 pr-1 py-0.5 rounded-full"
          style={{ background: "#EAE6F5", color: "#3D2F6B" }}
        >
          {s.name ?? "Viajero"}
          <button
            type="button"
            onClick={() => onRemove(s.id)}
            disabled={isRemoving}
            className="rounded-full hover:bg-black/10 p-0.5"
          >
            <X className="w-2.5 h-2.5" />
          </button>
        </span>
      ))}
      <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            role="combobox"
            aria-expanded={pickerOpen}
            disabled={isAdding}
            className="h-6 gap-1 px-2 text-[11px] font-normal text-muted-foreground"
          >
            <Users className="w-3 h-3" />
            Compartir
            <ChevronsUpDown className="w-3 h-3 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[260px] p-0" align="start">
          <Command>
            <CommandList>
              <CommandEmpty>
                {membersQuery.isLoading ? "Cargando…" : "No hay más viajeros disponibles."}
              </CommandEmpty>
              {availableMembers.length > 1 && (
                <>
                  <CommandGroup>
                    <CommandItem
                      value="__share_with_all__"
                      onSelect={() => { onAdd(availableMembers.map(m => m.id)); setPickerOpen(false); }}
                      className="font-medium"
                    >
                      <Users className="mr-2 h-3.5 w-3.5" style={{ color: "var(--terra)" }} />
                      Compartir con todos ({availableMembers.length})
                    </CommandItem>
                  </CommandGroup>
                  <CommandSeparator />
                </>
              )}
              <CommandGroup>
                {availableMembers.map(m => (
                  <CommandItem
                    key={m.id}
                    value={m.name}
                    onSelect={() => { onAdd([m.id]); setPickerOpen(false); }}
                  >
                    <Check className={cn("mr-2 h-3.5 w-3.5 opacity-0")} />
                    {m.name}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}
