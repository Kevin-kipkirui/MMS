import React, { useEffect, useState } from "react";
import Login from "./pages/Login";
import Session from "./pages/Session";

const AUTH_KEY = "mms_session_unlocked";

function App() {
  const [isUnlocked, setIsUnlocked] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      return window.sessionStorage.getItem(AUTH_KEY) === "true";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    if (typeof window === "undefined") return;

    const syncAuth = () => {
      try {
        setIsUnlocked(window.sessionStorage.getItem(AUTH_KEY) === "true");
      } catch {
        setIsUnlocked(false);
      }
    };

    syncAuth();
    window.addEventListener("storage", syncAuth);
    return () => window.removeEventListener("storage", syncAuth);
  }, []);

  if (!isUnlocked) {
    return <Login onSuccess={() => setIsUnlocked(true)} storageKey={AUTH_KEY} />;
  }

  return <Session />;
}

export default App;
