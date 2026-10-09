import { useCallback, useEffect, useRef, useState } from "react";

const INITIAL = { section: null, noteId: null, editing: false };
const read = () => (typeof window !== "undefined" && window.history.state && window.history.state.np) || INITIAL;

// section: null = section list (mobile) | "All" | "<name>"
export function useNav() {
  const [nav, setNav] = useState(read);
  const navRef = useRef(nav);

  useEffect(() => {
    const onPop = () => {
      const n = read();
      navRef.current = n;
      setNav(n);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const go = useCallback((patch, { replace = false } = {}) => {
    const n = { ...navRef.current, ...patch };
    navRef.current = n;
    setNav(n);
    window.history[replace ? "replaceState" : "pushState"]({ ...window.history.state, np: n }, "");
  }, []);

  return { nav, go, navRef };
}
