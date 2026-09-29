import React, { useEffect, useState } from "react";
import Login from "./pages/Login";
import Session from "./pages/Session";
import Summit from "./pages/Summit";

const AUTH_KEY = "mms_session_unlocked";

function App() {
  const [view, setView] = useState("session");
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
        const unlocked = window.sessionStorage.getItem(AUTH_KEY) === "true";
        setIsUnlocked(unlocked);
        if (!unlocked) {
          setView("session");
          window.location.hash = "#session";
        }
      } catch {
        setIsUnlocked(false);
        setView("session");
        window.location.hash = "#session";
      }
    };

    const syncView = () => {
      const hash = (window.location.hash || "").replace(/^#/, "").replace(/^\//, "").toLowerCase();
      if (hash === "summit" && isUnlocked) {
        setView("summit");
      } else if (hash === "session" || !hash) {
        setView("session");
      }
    };

    syncAuth();
    syncView();
    window.addEventListener("storage", syncAuth);
    window.addEventListener("hashchange", syncView);
    return () => {
      window.removeEventListener("storage", syncAuth);
      window.removeEventListener("hashchange", syncView);
    };
  }, [isUnlocked]);

  const openSummit = () => {
    if (!isUnlocked) return;
    setView("summit");
    if (typeof window !== "undefined") window.location.hash = "#summit";
  };

  const backToSession = () => {
    setView("session");
    if (typeof window !== "undefined") window.location.hash = "#session";
  };

  if (!isUnlocked) {
    return <Login onSuccess={() => setIsUnlocked(true)} storageKey={AUTH_KEY} />;
  }

  if (view === "summit") {
    return <Summit onBack={backToSession} />;
  }

  return <Session onOpenSummit={openSummit} />;
}

export default App;
