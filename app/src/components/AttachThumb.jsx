import React from "react";
import { isImageUrl, fileExt } from "../lib/format";

// Try to load a broken/HEIC image: fetch as blob, convert if needed, return object URL
async function blobifyUrl(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error("fetch failed");
  let blob = await res.blob();
  if (blob.type === "image/heic" || blob.type === "image/heif" || /\.(heic|heif)$/i.test(url)) {
    const heic2any = (await import("heic2any")).default;
    const out = await heic2any({ blob, toType: "image/jpeg", quality: 0.85 });
    blob = Array.isArray(out) ? out[0] : out;
  }
  return URL.createObjectURL(blob);
}

// Render one attachment URL: image → thumbnail, other file (pdf/doc/…) → file chip.
// If the image fails to load (HEIC on non-Safari, broken URL, etc.) → convert and retry,
// then fall back to a download chip only if conversion also fails.
export default function AttachThumb({ url }) {
  const [src, setSrc] = React.useState(isImageUrl(url) ? url : null);
  const [state, setState] = React.useState("idle"); // idle | loading | failed

  async function handleError() {
    if (state === "loading" || state === "failed") return;
    setState("loading");
    try {
      const blobUrl = await blobifyUrl(url);
      setSrc(blobUrl);
      setState("idle");
    } catch {
      setState("failed");
    }
  }

  if (src && state !== "failed") {
    return (
      <a href={url} target="_blank" rel="noreferrer">
        <img src={src} alt="" onError={handleError} />
      </a>
    );
  }
  return (
    <a className="att-file" href={url} target="_blank" rel="noreferrer" title={fileExt(url) + " · เปิด/ดาวน์โหลด"}>
      <span className="att-file-ic">📄</span><span className="att-file-ext">{fileExt(url)}</span>
    </a>
  );
}
