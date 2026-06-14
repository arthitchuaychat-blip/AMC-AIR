import React from "react";
import { isImageUrl, fileExt } from "../lib/format";

// Render one attachment URL: image → thumbnail, other file (pdf/doc/…) → file chip.
// Both open in a new tab. Use inside the existing .myjob-photo / .tl-photos containers.
export default function AttachThumb({ url }) {
  if (isImageUrl(url)) {
    return <a href={url} target="_blank" rel="noreferrer"><img src={url} alt="" /></a>;
  }
  return (
    <a className="att-file" href={url} target="_blank" rel="noreferrer" title={fileExt(url) + " · เปิด/ดาวน์โหลด"}>
      <span className="att-file-ic">📄</span><span className="att-file-ext">{fileExt(url)}</span>
    </a>
  );
}
