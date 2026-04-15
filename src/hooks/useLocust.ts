import { useCallback, useState } from "react";
import type { LocustConfig, LocustStatus, LocustSummary } from "@/types";

export function useLocust() {
  const [status, setStatus] = useState<LocustStatus>("idle");
  const [summary, setSummary] = useState<LocustSummary | null>(null);
  const [progress, setProgress] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async (config: LocustConfig) => {
    setStatus("running");
    setSummary(null);
    setProgress([]);
    setError(null);

    const unsubscribe = window.stressflow.onLocustProgress((line) => {
      setProgress((previous) => [...previous.slice(-199), line]);
    });

    try {
      const result = await window.stressflow.locustRun(config);
      setSummary(result);
      setStatus("done");
      return result;
    } catch (cause) {
      const message =
        cause instanceof Error
          ? cause.message
          : "Falha ao executar a comparação com Locust.";
      setError(message);
      setStatus("error");
      throw cause;
    } finally {
      unsubscribe();
    }
  }, []);

  return { status, summary, progress, error, run };
}
