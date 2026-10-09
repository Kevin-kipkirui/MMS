import { useEffect, useState } from "react";
import { get, set } from "idb-keyval";
import { readLS } from "./utils.js";

export function useIdbState(key, initial, legacyLSKey) {
  const [state, setState] = useState(initial);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let live = true;
    (async () => {
      let v;
      try { v = await get(key); } catch (e) {
        /* fall through */
      }
      if (v === undefined && legacyLSKey) v = readLS(legacyLSKey, undefined);
      if (live) {
        if (v !== undefined) setState(v);
        setReady(true);
      }
    })();
    return () => { live = false; };
  }, [key, legacyLSKey]);

  useEffect(() => {
    if (!ready) return;
    set(key, state)
      .then(() => {
        if (legacyLSKey) {
          try { localStorage.removeItem(legacyLSKey); } catch (e) { /* ignore */ }
        }
      })
      .catch(() => {});
  }, [key, state, ready, legacyLSKey]);

  return [state, setState, ready];
}
