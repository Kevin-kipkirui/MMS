import { useEffect, useState } from "react";
import { signedUrl } from "../lib/notesSync";

export const urlCache = new Map();

export function useImageSrc(img) {
  const [src, setSrc] = useState(() => {
    if (img.local) return img.local;
    const hit = img.path ? urlCache.get(img.path) : null;
    return hit && hit.exp > Date.now() ? hit.url : "";
  });

  useEffect(() => {
    if (img.local) { setSrc(img.local); return; }
    if (!img.path) return;
    const hit = urlCache.get(img.path);
    if (hit && hit.exp > Date.now()) { setSrc(hit.url); return; }

    let live = true;
    signedUrl(img.path)
      .then((url) => {
        if (!live || !url) return;
        urlCache.set(img.path, { url, exp: Date.now() + 50 * 60 * 1000 });
        setSrc(url);
      })
      .catch(() => {});

    return () => { live = false; };
  }, [img.local, img.path]);

  return src;
}

export default function NoteImage({ img, className, alt, onClick }) {
  const src = useImageSrc(img);
  if (!src) return <div className={`np-img-ph ${className || ""}`} aria-busy="true" />;
  return (
    <img
      className={className}
      src={src}
      alt={alt || img.name || "Note photo"}
      onClick={onClick}
      loading="lazy"
      draggable={false}
    />
  );
}
