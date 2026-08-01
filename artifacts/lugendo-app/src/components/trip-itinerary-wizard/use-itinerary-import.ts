import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useParseItineraryPdf,
  useCreateActivity,
  useCreateHotel,
} from "@workspace/api-client-react";
import type { Activity, Hotel, ParsedItinerary } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { getApiErrorMessage } from "@/lib/utils";
import { matchOrCreateActivityIds, matchOrCreateHotelId } from "@/lib/pdf-day-autofill";

// Shared between trip-wizard.tsx and traveler-trip-wizard.tsx — see task #142.
// Encapsulates the "upload a PDF/DOCX/XLSX and let AI extract the itinerary structure" flow,
// including auto-matching (or creating) catalog hotels/activities from the extracted days.

export interface ParsedItineraryApplyResult {
  parsedItinerary: ParsedItinerary;
  dayActivities: Record<number, number[]>;
  dayHotels: Record<number, string>;
  dayTransports: Record<number, string>;
}

export function useItineraryImport() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [isParsing, setIsParsing] = useState(false);

  const parsePdf = useParseItineraryPdf();
  const createActivity = useCreateActivity();
  const createHotel = useCreateHotel();

  const selectFile = (file: File | null) => setPdfFile(file);

  const clearFile = () => {
    setPdfFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const parse = (activities: Activity[], hotels: Hotel[]): Promise<ParsedItineraryApplyResult | null> => {
    if (!pdfFile) return Promise.resolve(null);
    setIsParsing(true);
    return new Promise(resolve => {
      const reader = new FileReader();
      reader.onload = async e => {
        const base64 = (e.target?.result as string).split(",")[1];
        try {
          const result = await parsePdf.mutateAsync({ data: { fileBase64: base64, fileName: pdfFile.name } });

          const dayTransports: Record<number, string> = {};
          for (const d of result.days) {
            if (d.transport) dayTransports[d.dayNumber] = d.transport;
          }

          const singleCountry = result.countries?.length === 1 ? result.countries[0] : undefined;
          const dayActivities: Record<number, number[]> = {};
          const dayHotels: Record<number, string> = {};
          for (const day of result.days) {
            const actIds = await matchOrCreateActivityIds(day, activities, args => createActivity.mutateAsync(args));
            if (actIds.length) dayActivities[day.dayNumber] = actIds;

            const hotelId = await matchOrCreateHotelId(day, hotels, args => createHotel.mutateAsync(args), singleCountry);
            if (hotelId) dayHotels[day.dayNumber] = hotelId;
          }
          if (Object.keys(dayActivities).length || Object.keys(dayHotels).length) {
            qc.invalidateQueries({ queryKey: ["/api/activities"] });
            qc.invalidateQueries({ queryKey: ["/api/hotels"] });
          }

          const actCount = Object.values(dayActivities).reduce((s, ids) => s + ids.length, 0);
          const hotelCount = Object.keys(dayHotels).length;
          const extras: string[] = [];
          if (actCount) extras.push(`${actCount} actividad${actCount !== 1 ? "es" : ""}`);
          if (hotelCount) extras.push(`${hotelCount} hotel${hotelCount !== 1 ? "es" : ""}`);

          toast({ title: `Itinerario extraído: ${result.numDays} días${extras.length ? ` · ${extras.join(" · ")}` : ""}` });
          resolve({ parsedItinerary: result, dayActivities, dayHotels, dayTransports });
        } catch (err) {
          console.error("Error parsing itinerary file", err);
          toast({ variant: "destructive", title: getApiErrorMessage(err, "No se pudo analizar el archivo. Intenta con un .txt o PDF de texto.") });
          resolve(null);
        } finally {
          setIsParsing(false);
        }
      };
      reader.readAsDataURL(pdfFile);
    });
  };

  return { fileInputRef, pdfFile, isParsing, selectFile, clearFile, parse };
}
