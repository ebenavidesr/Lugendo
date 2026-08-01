import { Upload, FileText, X, Check } from "lucide-react";
import type { ParsedItinerary } from "@workspace/api-client-react";

// Shared between trip-wizard.tsx and traveler-trip-wizard.tsx — see task #142.

export type NewItineraryMode = "scratch" | "pdf";

export function ItineraryModePicker({ mode, onChange }: { mode: NewItineraryMode | null; onChange: (mode: NewItineraryMode) => void }) {
  return (
    <div className="grid grid-cols-2 gap-3 mb-4">
      {(["scratch", "pdf"] as const).map(m => (
        <button
          key={m}
          onClick={() => onChange(m)}
          className="p-4 rounded-[12px] border-2 text-left transition-all"
          style={{ borderColor: mode === m ? "#C4793A" : "#E5D4BF", background: mode === m ? "#FAEEE4" : "white" }}
        >
          <div className="text-[13px] font-medium mb-0.5" style={{ color: "#2D1F0E" }}>
            {m === "scratch" ? "Desde cero" : "Subir archivo"}
          </div>
          <div className="text-[11px] text-muted-foreground">
            {m === "scratch" ? "Rellena los campos manualmente" : "PDF, Word, Excel o texto — la IA extrae la estructura"}
          </div>
        </button>
      ))}
    </div>
  );
}

export function ItineraryUploadPanel({
  fileInputRef,
  pdfFile,
  isParsing,
  parsedItinerary,
  onFileChange,
  onClearFile,
  onParse,
}: {
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  pdfFile: File | null;
  isParsing: boolean;
  parsedItinerary: ParsedItinerary | null;
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onClearFile: () => void;
  onParse: () => void;
}) {
  return (
    <div className="space-y-3 pt-2 border-t border-border">
      <input ref={fileInputRef} type="file" accept=".pdf,.txt,.doc,.docx,.md,.xlsx" className="hidden" onChange={onFileChange} />
      {!pdfFile ? (
        <button
          onClick={() => fileInputRef.current?.click()}
          className="w-full p-8 rounded-[12px] border-2 border-dashed text-center transition-all hover:bg-[#FAF2EB]"
          style={{ borderColor: "#E5D4BF" }}
        >
          <Upload className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
          <div className="text-[13px] font-medium mb-0.5" style={{ color: "#2D1F0E" }}>Haz clic para subir un archivo</div>
          <div className="text-[11px] text-muted-foreground">PDF, Word, Excel o texto — máx. 10 MB</div>
        </button>
      ) : (
        <div className="p-4 rounded-[12px] border border-border flex items-center gap-3" style={{ background: "#FAF2EB" }}>
          <div className="w-9 h-9 rounded-[8px] flex items-center justify-center flex-shrink-0" style={{ background: "#FDECEA" }}>
            <FileText className="w-4 h-4" style={{ color: "#C0392B" }} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[13px] font-medium truncate" style={{ color: "#2D1F0E" }}>{pdfFile.name}</div>
            <div className="text-[11px] text-muted-foreground">{(pdfFile.size / 1024).toFixed(0)} KB</div>
          </div>
          <button onClick={onClearFile}>
            <X className="w-4 h-4 text-muted-foreground hover:text-foreground" />
          </button>
        </div>
      )}

      {pdfFile && !parsedItinerary && (
        <button
          onClick={onParse}
          disabled={isParsing}
          className="w-full py-2.5 rounded-[8px] text-[13px] font-medium transition-colors"
          style={{ background: "#C4793A", color: "#FAF2EB", opacity: isParsing ? 0.7 : 1 }}
        >
          {isParsing ? "Analizando con IA…" : "Analizar con IA"}
        </button>
      )}

      {parsedItinerary && (
        <div className="p-4 rounded-[12px] border border-border" style={{ background: "#E4F3EC" }}>
          <div className="flex items-center gap-2 mb-2">
            <Check className="w-4 h-4" style={{ color: "#2E7D5A" }} />
            <span className="text-[13px] font-medium" style={{ color: "#2E7D5A" }}>Estructura extraída</span>
          </div>
          <div className="text-[12px]" style={{ color: "#2D1F0E" }}>
            <strong>{parsedItinerary.name}</strong> · {parsedItinerary.numDays} días
            {parsedItinerary.countries?.length ? ` · ${parsedItinerary.countries.join(", ")}` : ""}
          </div>
          <div className="text-[11px] text-muted-foreground mt-1">
            {parsedItinerary.days.length} días procesados
          </div>
        </div>
      )}
    </div>
  );
}
