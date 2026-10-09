import { useEffect, useState } from "react";
import { readLS, writeLS } from "./utils.js";

export default function useLocalStorageState(key, initialValue) {
  const [state, setState] = useState(() => readLS(key, initialValue));

  useEffect(() => {
    writeLS(key, state);
  }, [key, state]);

  return [state, setState];
}
