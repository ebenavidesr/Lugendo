import { useState, useRef, useCallback } from "react";
import { useDescribeDestination } from "@workspace/api-client-react";
import type { DestinationDescribeInputType } from "@workspace/api-client-react";

interface UseAutoDescriptionResult {
  isLoading: boolean;
  trigger: (query: string, currentDesc: string, onSuccess: (desc: string) => void) => void;
}

export function useAutoDescription(type: DestinationDescribeInputType): UseAutoDescriptionResult {
  const [isLoading, setIsLoading] = useState(false);
  const triggeredRef = useRef<Set<string>>(new Set());
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestIdRef = useRef(0);
  const { mutateAsync: describe } = useDescribeDestination();

  const trigger = useCallback((query: string, currentDesc: string, onSuccess: (desc: string) => void) => {
    const trimmed = query.trim();
    if (!trimmed || currentDesc || triggeredRef.current.has(trimmed)) return;

    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(() => {
      if (triggeredRef.current.has(trimmed)) return;
      triggeredRef.current.add(trimmed);

      const reqId = ++requestIdRef.current;
      setIsLoading(true);

      describe({ data: { query: trimmed, type } })
        .then(result => {
          if (reqId === requestIdRef.current) onSuccess(result.description);
        })
        .catch(() => triggeredRef.current.delete(trimmed))
        .finally(() => {
          if (reqId === requestIdRef.current) setIsLoading(false);
        });
    }, 600);
  }, [type, describe]);

  return { isLoading, trigger };
}
