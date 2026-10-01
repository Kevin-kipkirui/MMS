import React, { useEffect, useState } from "react";
import Login from "./pages/Login";
import Session from "./pages/Session";
import Summit from "./pages/Summit";
import Performance from "./pages/Perfomance";
import { supabase } from "./lib/supabase";

function App() {
  const [view, setView] = useState("session");
  const [authUser, setAuthUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const isUnlocked = !!authUser;

  // Supabase owns the session now
  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setAuthUser(data.session ? data.session.user : null);
      setAuthReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuthUser(session ? session.user : null);
      setAuthReady(true);
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  // Keep the view in step with the URL hash, and reset it on logout
  useEffect(() => {
    if (typeof window === "undefined" || !authReady) return;

    if (!isUnlocked) {
      setView("session");
      if (window.location.hash !== "#session") window.location.hash = "#session";
      return;
    }

    const syncView = () => {
      const hash = (window.location.hash || "").replace(/^#/, "").replace(/^\//, "").toLowerCase();
      if (hash === "summit") setView("summit");
      else if (hash === "performance") setView("performance");
      else if (hash === "session" || !hash) setView("session");
    };

    syncView();
    window.addEventListener("hashchange", syncView);
    return () => window.removeEventListener("hashchange", syncView);
  }, [isUnlocked, authReady]);

  const openSummit = () => {
    if (!isUnlocked) return;
    setView("summit");
    if (typeof window !== "undefined") window.location.hash = "#summit";
  };

  const openPerformance = () => {
    if (!isUnlocked) return;
    setView("performance");
    if (typeof window !== "undefined") window.location.hash = "#performance";
  };

  const backToSession = () => {
    setView("session");
    if (typeof window !== "undefined") window.location.hash = "#session";
  };

  if (!authReady) {
    return <div style={{ position: "fixed", inset: 0, background: "#070b12" }} aria-busy="true" />;
  }

  if (!isUnlocked) {
    return <Login onSuccess={() => setAuthUser({})} />;
  }

  if (view === "summit") {
    return <Summit onBack={backToSession} />;
  }

  if (view === "performance") {
    return <Performance onBack={backToSession} />;
  }

  return <Session onOpenSummit={openSummit} onOpenPerformance={openPerformance} />;
}

export default App;
