import { useCallback, useState } from "react";
import type { K6Config, K6Status, K6Summary } from "@/types";

export function useK6() {
  const [status, setStatus] = useState<K6Status>("idle");
  const [summary, setSummary] = useState<K6Summary | null>(null);
  const [progress, setProgress] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async (config: K6Config) => {
    setStatus("running");
    setSummary(null);
    setProgress([]);
    setError(null);

    const unsubscribe = window.stressflow.onK6Progress((line) => {
      setProgress((previous) => [...previous.slice(-199), line]);
    });

    try {
      const result = await window.stressflow.k6Run(config);
      setSummary(result);
      setStatus("done");
      return result;
    } catch (cause) {
      const message =
        cause instanceof Error
          ? cause.message
          : "Falha ao executar a comparação com k6.";
      setError(message);
      setStatus("error");
      throw cause;
    } finally {
      unsubscribe();
    }
  }, []);

  return { status, summary, progress, error, run };
}
