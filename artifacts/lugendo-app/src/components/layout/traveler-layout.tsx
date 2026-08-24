import { ReactNode } from "react";
import { TravelerHeader } from "@/components/layout/traveler-header";

export function TravelerLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background text-foreground font-sans flex flex-col">
      <TravelerHeader />

      <main className="flex-1 w-full max-w-3xl mx-auto px-4 py-8 font-sans">
        {children}
      </main>

      <footer className="py-8 text-center text-sm font-sans" style={{ color: "#9C7A58" }}>
        Powered by Lugendo
      </footer>
    </div>
  );
}
