import { useGetAgencyTravelerTags } from "@workspace/api-client-react";

// Back-office display of a traveler's individual tags (#155, decision 8): only visible with
// the traveler's explicit, separate consent. Renders nothing meaningful without it -- the
// backend already returns an empty array when consent is false, this just labels that state.
export function AgencyTravelerTagsBadge({ travelerId }: { travelerId: number }) {
  const { data, isLoading } = useGetAgencyTravelerTags(travelerId);

  if (isLoading) return <span className="text-[11px] text-muted-foreground">…</span>;
  if (!data || !data.consent) {
    return <span className="text-[11px] text-muted-foreground italic">Sin consentimiento</span>;
  }
  if (data.tags.length === 0) {
    return <span className="text-[11px] text-muted-foreground">Sin etiquetas</span>;
  }

  return (
    <div className="flex flex-wrap gap-1">
      {data.tags.map(t => (
        <span
          key={t.id}
          className="px-2 py-0.5 rounded-full text-[11px] font-medium"
          style={{ background: "#EDE9F7", color: "#3D2F6B" }}
          title={t.description}
        >
          {t.label}
        </span>
      ))}
    </div>
  );
}
