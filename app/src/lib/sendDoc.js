import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import { uploadDocFile, sendLineImage, sendLineMessage } from "./api";

// Capture a DOM node (an A4-sized DocSlip wrapper) to a PNG via html2canvas.
async function captureNode(node) {
  if (document.fonts && document.fonts.ready) { try { await document.fonts.ready; } catch { /* ignore */ } }
  const canvas = await html2canvas(node, { scale: 2, backgroundColor: "#ffffff", useCORS: true, logging: false, windowWidth: node.scrollWidth, windowHeight: node.scrollHeight });
  return { dataUrl: canvas.toDataURL("image/png"), width: canvas.width, height: canvas.height };
}

function dataUrlToBlob(dataUrl) {
  const [, b64] = dataUrl.split(",");
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: "image/png" });
}

// tile a tall image across A4 pages
function toPdfBlob({ dataUrl, width, height }) {
  const pdf = new jsPDF({ unit: "pt", format: "a4" });
  const pw = pdf.internal.pageSize.getWidth(), ph = pdf.internal.pageSize.getHeight();
  const imgH = (height / width) * pw;
  let heightLeft = imgH, position = 0;
  pdf.addImage(dataUrl, "PNG", 0, position, pw, imgH);
  heightLeft -= ph;
  while (heightLeft > 0.5) { position -= ph; pdf.addPage(); pdf.addImage(dataUrl, "PNG", 0, position, pw, imgH); heightLeft -= ph; }
  return pdf.output("blob");
}

// capture `node`, then send to the customer on LINE — mode: "image" | "pdf"
export async function sendDocFromNode(node, lineUserId, mode, label) {
  const cap = await captureNode(node);
  if (mode === "image") {
    const url = await uploadDocFile(dataUrlToBlob(cap.dataUrl), "png", "image/png");
    await sendLineImage(lineUserId, url);
  } else {
    const url = await uploadDocFile(toPdfBlob(cap), "pdf", "application/pdf");
    await sendLineMessage(lineUserId, `📄 ${label}\n${url}`);
  }
}
