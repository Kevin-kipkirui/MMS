import { useEffect, useRef, useState } from "react";
import { drawToJpeg } from "./images.js";

export default function CameraModal({ onCapture, onClose, onFallback }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [facing, setFacing] = useState("environment");
  const [ready, setReady] = useState(false);
  const [err, setErr] = useState("");
  const [flash, setFlash] = useState(false);

  const stop = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  };

  useEffect(() => {
    let cancelled = false;
    setReady(false);
    setErr("");
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setErr("unsupported");
      return;
    }
    (async () => {
      try {
        stop();
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: facing }, width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: false,
        });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        const v = videoRef.current;
        if (v) {
          v.srcObject = stream;
          await v.play();
          if (!cancelled) setReady(true);
        }
      } catch (e) {
        if (!cancelled) setErr(e && e.name === "NotAllowedError" ? "denied" : "failed");
      }
    })();
    return () => { cancelled = true; stop(); };
  }, [facing]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  const snap = () => {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return;
    setFlash(true);
    setTimeout(() => setFlash(false), 180);
    onCapture(drawToJpeg(v, v.videoWidth, v.videoHeight));
  };

  const errText =
    err === "denied" ? "Camera access is blocked. Allow it in your browser's site settings, or use the option below."
    : err === "unsupported" ? "This browser can't open the camera here (it needs a secure https page)."
    : "Couldn't start the camera.";

  return (
    <div className="np-cam" onClick={onClose}>
      <div className="np-cam-stage" onClick={(e) => e.stopPropagation()}>
        <video ref={videoRef} playsInline muted autoPlay className={`np-cam-video${facing === "user" ? " mirror" : ""}`} />
        {!ready && !err && (
          <div className="np-cam-msg">
            <p>Starting camera…</p>
          </div>
        )}
        {err && (
          <div className="np-cam-msg">
            <p>{errText}</p>
            <button type="button" className="np-cam-side" onClick={onFallback}>Use device camera / files</button>
          </div>
        )}
        <div className={`np-cam-flash${flash ? " on" : ""}`} />
      </div>

      <div className="np-cam-bar" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="np-cam-side" onClick={onClose}>Cancel</button>
        <button type="button" className="np-cam-shutter" onClick={snap} disabled={!ready} aria-label="Capture photo">
          <span />
        </button>
        <button type="button" className="np-cam-side" onClick={() => setFacing((f) => (f === "environment" ? "user" : "environment"))} disabled={!ready}>
          Flip
        </button>
      </div>
    </div>
  );
}
