import { useCallback, useEffect, useRef } from "react";

export function useAutosave(value, onCommit, { delay = 700 } = {}) {
  const latest = useRef(value);
  const saved = useRef(value);
  const cb = useRef(onCommit);

  latest.current = value;
  cb.current = onCommit;

  const flush = useCallback(() => {
    if (latest.current !== saved.current) {
      saved.current = latest.current;
      cb.current(latest.current);
    }
  }, []);

  useEffect(() => {
    if (value === saved.current) return;
    const t = setTimeout(flush, delay);
    return () => clearTimeout(t);
  }, [value, delay, flush]);

  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden") flush();
    };

    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", flush);

    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, [flush]);

  return flush;
}
