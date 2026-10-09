export function drawToJpeg(source, sw, sh, maxDim = 1600, quality = 0.8) {
  const scale = Math.min(1, maxDim / Math.max(sw, sh));
  const w = Math.round(sw * scale);
  const h = Math.round(sh * scale);
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(source, 0, 0, w, h);
  return c.toDataURL("image/jpeg", quality);
}

export function fileToJpeg(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("read"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("decode"));
      img.onload = () => resolve(drawToJpeg(img, img.width, img.height));
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}
