import { useRef } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface AgencyPhotoCarouselProps {
  photoUrls: string[];
  agencyName: string;
}

export function AgencyPhotoCarousel({ photoUrls, agencyName }: AgencyPhotoCarouselProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);

  if (photoUrls.length === 0) return null;

  const scroll = (dir: 1 | -1) => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * el.clientWidth * 0.9, behavior: "smooth" });
  };

  return (
    <div className="relative mb-6">
      <div
        ref={scrollerRef}
        className="flex gap-3 overflow-x-auto snap-x snap-mandatory scroll-smooth rounded-[16px] [&::-webkit-scrollbar]:hidden"
        style={{ scrollbarWidth: "none" }}
      >
        {photoUrls.map((url, i) => (
          <img
            key={url}
            src={url}
            alt={`${agencyName} — foto ${i + 1}`}
            className="h-56 sm:h-72 w-auto shrink-0 rounded-[16px] object-cover snap-start border border-border"
          />
        ))}
      </div>
      {photoUrls.length > 1 && (
        <>
          <button
            type="button"
            onClick={() => scroll(-1)}
            aria-label="Foto anterior"
            className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white/90 shadow flex items-center justify-center hover:bg-white transition-colors"
          >
            <ChevronLeft className="w-4 h-4" style={{ color: "#2D1F0E" }} />
          </button>
          <button
            type="button"
            onClick={() => scroll(1)}
            aria-label="Foto siguiente"
            className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white/90 shadow flex items-center justify-center hover:bg-white transition-colors"
          >
            <ChevronRight className="w-4 h-4" style={{ color: "#2D1F0E" }} />
          </button>
        </>
      )}
    </div>
  );
}
