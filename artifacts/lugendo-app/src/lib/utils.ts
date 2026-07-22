import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { ApiError } from "@workspace/api-client-react"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Backend routes respond with `{ error: string }` bodies that describe the
// actual failure (e.g. "no text layer in PDF", "AI extraction failed").
// Prefer that over a generic fallback so users see why something failed.
export function getApiErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError && err.data && typeof err.data === "object" && "error" in err.data) {
    const message = (err.data as { error?: unknown }).error;
    if (typeof message === "string" && message.trim()) return message;
  }
  return fallback;
}
