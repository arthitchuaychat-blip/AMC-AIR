import { toPng } from "html-to-image";
import { jsPDF } from "jspdf";
import { uploadDocFile, sendLineImage, sendLineMessage } from "./api";

// Capture the currently-rendered .print-area (DocSlip) into a PNG.
// .print-area is display:none on screen, so temporarily render it visible off-screen for the capture.
async function capture() {
  const area = document.querySelector(".print-area");
  if (!area) throw new Error("ไม่พบเอกสาร (ยังไม่ได้เรนเดอร์)");
  const node = area.querySelector(".doc") || area;
  const prev = area.getAttribute("style") || "";
  area.setAttribute("style", "display:block;position:fixed;left:-10000px;top:0;width:780px;background:#fff;z-index:-1");
  try {
    if (document.fonts && document.fonts.ready) { try { await document.fonts.ready; } catch { /* ignore */ } }
    const dataUrl = await toPng(node, { pixelRatio: 2, backgroundColor: "#ffffff", cacheBust: true });
    const img = new Image(); img.src = dataUrl; await img.decode().catch(() => {});
    return { dataUrl, width: img.naturalWidth || 780, height: img.naturalHeight || 1100 };
  } finally { area.setAttribute("style", prev); }
}

function dataUrlToBlob(dataUrl) {
  const [, b64] = dataUrl.split(",");
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: "image/png" });
}

function toPdfBlob({ dataUrl, width, height }) {
  const pdf = new jsPDF({ unit: "pt", format: "a4" });
  const pw = pdf.internal.pageSize.getWidth(), ph = pdf.internal.pageSize.getHeight();
  let w = pw, h = (height / width) * pw;
  if (h > ph) { h = ph; w = (width / height) * ph; }
  pdf.addImage(dataUrl, "PNG", (pw - w) / 2, 0, w, h);
  return pdf.output("blob");
}

// mode: "image" → LINE image message · "pdf" → upload PDF + send a link message
export async function sendDocToLine(lineUserId, mode, label) {
  const cap = await capture();
  if (mode === "image") {
    const url = await uploadDocFile(dataUrlToBlob(cap.dataUrl), "png", "image/png");
    await sendLineImage(lineUserId, url);
  } else {
    const url = await uploadDocFile(toPdfBlob(cap), "pdf", "application/pdf");
    await sendLineMessage(lineUserId, `📄 ${label}\n${url}`);
  }
}
