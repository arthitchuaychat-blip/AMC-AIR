import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import { uploadDocFile, sendLineImage, sendLineMessage } from "./api";
import { buildDocHtml, paginate, MM, SIDE_MM, TOP_MM, BOTTOM_MM, CONTENT_W_MM } from "./printDoc";

// Render the document through the SAME pipeline as printing (off-screen iframe + paginate), then
// capture each A4 page — so the file sent on LINE has the exact proportions/pagination as the print.
async function renderPages(printAreaHTML) {
  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  // give the iframe the A4 content width (px) so wrapping/heights match print exactly
  const wPx = Math.round(CONTENT_W_MM * MM);
  iframe.style.cssText = `position:fixed;left:-10000px;top:0;width:${wPx + 40}px;height:1600px;border:0;background:#fff;`;
  document.body.appendChild(iframe);
  try {
    const doc = iframe.contentDocument;
    doc.open(); doc.write(buildDocHtml(printAreaHTML)); doc.close();
    // wait for layout + fonts + images inside the iframe
    await new Promise((r) => setTimeout(r, 250));
    if (doc.fonts && doc.fonts.ready) { try { await doc.fonts.ready; } catch (_) {} }
    await Promise.all([...doc.querySelectorAll("img")].map((im) => im.complete ? null : new Promise((r) => { im.onload = im.onerror = r; })));
    const pgEls = paginate(doc) || [doc.querySelector(".doc")].filter(Boolean);
    const win = iframe.contentWindow;
    const pages = [];
    for (const el of pgEls) {
      const canvas = await html2canvas(el, { scale: 2, backgroundColor: "#ffffff", useCORS: true, logging: false, windowWidth: win.innerWidth, windowHeight: win.innerHeight });
      pages.push({ dataUrl: canvas.toDataURL("image/png"), width: canvas.width, height: canvas.height });
    }
    return pages;
  } finally {
    document.body.removeChild(iframe);
  }
}

function dataUrlToBlob(dataUrl) {
  const [, b64] = dataUrl.split(",");
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: "image/png" });
}

// one captured A4 page per PDF page, fit within the page margins, aspect preserved
function pagesToPdfBlob(pages) {
  const pdf = new jsPDF({ unit: "pt", format: "a4" });
  const PT = 72 / 25.4; // pt per mm
  const pageW = pdf.internal.pageSize.getWidth(), pageH = pdf.internal.pageSize.getHeight();
  const side = SIDE_MM * PT, top = TOP_MM * PT;
  const maxW = pageW - side * 2, maxH = pageH - top - BOTTOM_MM * PT;
  pages.forEach((p, i) => {
    if (i) pdf.addPage();
    let w = maxW, h = (p.height / p.width) * maxW;
    if (h > maxH) { h = maxH; w = (p.width / p.height) * maxH; }
    pdf.addImage(p.dataUrl, "PNG", (pageW - w) / 2, top, w, h);
  });
  return pdf.output("blob");
}

// capture `node` → คืนไฟล์แนบไว้ "พักก่อนส่ง" (ไม่ส่งทันที) ให้ตรวจแล้วค่อยกดส่ง
// image → คืน attachments (รูปทุกหน้า) · pdf → คืนลิงก์ PDF เป็นข้อความ (LINE ส่งไฟล์เนทีฟไม่ได้)
export async function captureDocToStage(node, mode, label) {
  const printArea = node.querySelector(".print-area") || node;
  const pages = await renderPages(printArea.outerHTML);
  if (!pages.length) throw new Error("สร้างเอกสารไม่สำเร็จ");
  if (mode === "image") {
    const attachments = [];
    for (let i = 0; i < pages.length; i++) {
      const url = await uploadDocFile(dataUrlToBlob(pages[i].dataUrl), "png", "image/png");
      attachments.push({ type: "image", url, name: `${label}${pages.length > 1 ? ` (${i + 1}/${pages.length})` : ""}` });
    }
    return { attachments, text: "" };
  }
  const url = await uploadDocFile(pagesToPdfBlob(pages), "pdf", "application/pdf");
  return { attachments: [], text: `📄 ${label}\n${url}` };
}

// capture `node` → คืน "ไฟล์แนบจริง" สำหรับอีเมล (PDF หรือ PNG) — [{name, url, mimeType}]
export async function captureDocForEmail(node, mode, label) {
  const printArea = node.querySelector(".print-area") || node;
  const pages = await renderPages(printArea.outerHTML);
  if (!pages.length) throw new Error("สร้างเอกสารไม่สำเร็จ");
  if (mode === "image") {
    const out = [];
    for (let i = 0; i < pages.length; i++) {
      const url = await uploadDocFile(dataUrlToBlob(pages[i].dataUrl), "png", "image/png");
      out.push({ name: `${label}${pages.length > 1 ? ` (${i + 1})` : ""}.png`, url, mimeType: "image/png" });
    }
    return out;
  }
  const url = await uploadDocFile(pagesToPdfBlob(pages), "pdf", "application/pdf");
  return [{ name: `${label}.pdf`, url, mimeType: "application/pdf" }];
}

// capture `node` (.print-area or its wrapper), then send to the customer on LINE — mode: "image" | "pdf"
export async function sendDocFromNode(node, lineUserId, mode, label) {
  const printArea = node.querySelector(".print-area") || node;
  const pages = await renderPages(printArea.outerHTML);
  if (!pages.length) throw new Error("สร้างเอกสารไม่สำเร็จ");
  if (mode === "image") {
    // a single PNG: if multi-page, send each page in order
    for (const p of pages) {
      const url = await uploadDocFile(dataUrlToBlob(p.dataUrl), "png", "image/png");
      await sendLineImage(lineUserId, url);
    }
  } else {
    const url = await uploadDocFile(pagesToPdfBlob(pages), "pdf", "application/pdf");
    await sendLineMessage(lineUserId, `📄 ${label}\n${url}`);
  }
}
