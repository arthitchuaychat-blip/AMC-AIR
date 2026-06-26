import React from "react";
import { isImageUrl, fileExt } from "../lib/format";

// Render one attachment URL: image → thumbnail, other file (pdf/doc/…) → file chip.
// If the image fails to load (HEIC on non-Safari, broken URL, etc.) → fall back to a download chip.
export default function AttachThumb({ url }) {
  const [broken, setBroken] = React.useState(false);
  if (!broken && isImageUrl(url)) {
    return (
      <a href={url} target="_blank" rel="noreferrer">
        <img src={url} alt="" onError={() => setBroken(true)} />
      </a>
    );
  }
  return (
    <a className="att-file" href={url} target="_blank" rel="noreferrer" title={fileExt(url) + " · เปิด/ดาวน์โหลด"}>
      <span className="att-file-ic">📄</span><span className="att-file-ext">{fileExt(url)}</span>
    </a>
  );
}
