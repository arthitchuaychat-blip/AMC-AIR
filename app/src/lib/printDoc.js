// Cross-device document printing. We render the document into a clean popup window and print that
// (the in-page print trick prints blank on many mobile browsers).
//
// Repeating header: Chrome won't reliably repeat a <thead>, and position:fixed in print is
// unpredictable. So we paginate deterministically in JS: measure the running header and every body
// row, pack the rows into pages, and emit one self-contained .pg block per page — each with its own
// copy of the header at the top and a page break after it. The header's column strip and the body
// table share a <colgroup>, so columns line up.

export function openPrintWindow() {
  try { return window.open("", "_blank"); } catch (_) { return null; }
}

export const MM = 96 / 25.4;          // CSS px per mm at 96dpi
export const SIDE_MM = 12, TOP_MM = 12, BOTTOM_MM = 14;
export const CONTENT_W_MM = 210 - SIDE_MM * 2;   // ≈186mm

// Full standalone document HTML (head with the app's styles + the A4 print rules, then the body).
// Shared by the print popup AND the PDF/image capture used for LINE — so both look identical.
export function buildDocHtml(printAreaHTML) {
  const styles = Array.from(document.querySelectorAll('link[rel="stylesheet"], style'))
    .map((n) => n.outerHTML).join("\n");
  return `<!doctype html><html lang="th"><head><meta charset="utf-8">
<base href="${location.origin}/">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>เอกสาร AMC AIR</title>
${styles}
<style>
  /* margin:0 = ไม่ให้เบราว์เซอร์ใส่หัว/ท้ายกระดาษของมันเอง (วันเวลา · URL · ชื่อเรื่อง · เลขหน้า) — เราทำขอบ+เลขหน้าเอง */
  @page{ size:A4; margin:0 }
  html,body{ margin:0;padding:0;background:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact }
  @media screen { .print-area{ display:block !important } }
  @media print { body *{ visibility:visible !important } }
  .print-area{ position:static !important; width:auto !important; padding:0 }
  /* ก่อนแบ่งหน้า: .doc กว้างเท่าเนื้อหาจริง (เพื่อวัดความสูงแถวให้ตรงตอนพิมพ์) · หลังแบ่งหน้า JS ขยายเป็น 210mm */
  .doc{ display:block !important; position:static !important; min-height:0 !important; max-width:none !important;
        width:${CONTENT_W_MM}mm; margin:0 auto !important; padding:0 !important }
  .doc::before{ display:none }
  .doc-running{ width:100%; box-sizing:border-box; padding:0 0 4mm; background:#fff }
  .doc-colstrip,.doc-sheet{ width:100%; table-layout:fixed; border-collapse:separate; border-spacing:0 }
  .doc-colstrip{ margin-top:4px }
  /* long product codes wrap inside their column instead of spilling into the รายการ column */
  .doc-sheet>tbody>tr>td:nth-child(2){ overflow-wrap:anywhere; word-break:break-word }
  /* แต่ละหน้า = เต็ม A4 · ขอบกระดาษทำด้วย padding เอง · flex เพื่อดันเลขหน้า (และลายเซ็น) ไปล่างสุด */
  .pg{ width:210mm; min-height:296mm; box-sizing:border-box; margin:0 auto; background:#fff;
       padding:${TOP_MM}mm ${SIDE_MM}mm ${BOTTOM_MM}mm; display:flex; flex-direction:column;
       break-inside:avoid; page-break-inside:avoid }
  .pg-body{ flex:1 1 auto; display:flex; flex-direction:column; min-height:0 }
  .doc-signs{ margin-top:auto !important }         /* ลายเซ็น = ดันไปท้ายหน้าสุดท้าย (เหนือเลขหน้า) */
  .pg-foot{ flex:none; text-align:center; font-size:10.5px; color:#9aa3b2; padding-top:8px }
  .doc-sheet>tbody>tr,.doc-totals,.doc-terms-box,.doc-cust{ break-inside:avoid; page-break-inside:avoid }
</style></head><body>${printAreaHTML}</body></html>`;
}

export function writeAndPrint(win, selector = ".print-area") {
  const src = document.querySelector(selector);
  if (!src) { if (win) win.close(); return; }
  if (!win) { window.print(); return; } // popup blocked → fall back to in-page print (desktop)

  win.document.open();
  win.document.write(buildDocHtml(src.outerHTML));
  win.document.close();

  let done = false;
  const fire = () => {
    if (done) return; done = true;
    const go = () => {
      try { paginate(win.document); } catch (_) { /* leave the single-table layout as-is */ }
      try { win.focus(); win.print(); } catch (_) {}
    };
    // รอฟอนต์ไทยโหลดก่อนวัดความสูงแถว — วัดตอนฟอนต์ยังไม่มา ความสูงเพี้ยน แถวท้ายหน้าล้น margin (เพดานรอ 800ms กันค้าง)
    try { Promise.race([win.document.fonts && win.document.fonts.ready, new Promise((r) => setTimeout(r, 800))]).then(go, go); }
    catch (_) { go(); }
  };
  try { win.onload = () => setTimeout(fire, 450); } catch (_) {}
  setTimeout(fire, 1600); // fallback if onload never fires
}

// Split the one long body table into per-page .pg blocks, each led by a copy of the running header.
// Returns the array of .pg elements (used by the PDF capture). Operates on the given document.
export function paginate(d) {
  const docEl = d.querySelector(".doc");
  const headerEl = d.querySelector(".doc-running");
  const bodyTable = d.querySelector(".doc-sheet");
  if (!docEl || !headerEl || !bodyTable) return;

  const colgroup = bodyTable.querySelector("colgroup");
  const colgroupHTML = colgroup ? colgroup.outerHTML : "";
  const tbody = bodyTable.querySelector("tbody");
  const rows = Array.from(tbody ? tbody.children : []);
  const signsEl = d.querySelector(".doc-signs");
  if (!rows.length) return;

  const pageH = 297 * MM;
  const usable = pageH - (TOP_MM + BOTTOM_MM) * MM;     // printable height per page
  const headerH = headerEl.offsetHeight;
  const footerH = 26;                                    // เผื่อที่ให้เลขหน้า
  const budget = Math.max(120, usable - headerH - footerH - 6);   // px available for rows on each page
  const heights = rows.map((r) => r.offsetHeight);

  // greedy pack — a row that alone exceeds the budget still gets its own page
  const pages = [];
  let cur = [], curH = 0;
  for (let i = 0; i < rows.length; i++) {
    if (cur.length && curH + heights[i] > budget) { pages.push(cur); cur = []; curH = 0; }
    cur.push(i); curH += heights[i];
  }
  if (cur.length) pages.push(cur);

  // กันที่ให้ช่องลายเซ็นบนหน้าสุดท้าย — ถ้าเนื้อที่ไม่พอ ย้ายแถวท้ายไปหน้าใหม่ (ไม่ให้ลายเซ็นหลุดไปโดดหน้าเดียว)
  if (signsEl && pages.length) {
    const signH = signsEl.offsetHeight + 24;
    let last = pages[pages.length - 1];
    let lastH = last.reduce((a, i) => a + heights[i], 0);
    if (lastH + signH > budget && last.length) {
      const fresh = [];
      while (last.length && lastH + signH > budget) { const mv = last.pop(); lastH -= heights[mv]; fresh.unshift(mv); }
      if (!last.length) pages.pop();
      pages.push(fresh);
    }
  }

  const headerHTML = headerEl.outerHTML;
  const signsHTML = signsEl ? signsEl.outerHTML : "";
  const lastIdx = pages.length - 1;
  const total = pages.length;
  const html = pages.map((idxs, p) => {
    const body = idxs.map((i) => rows[i].outerHTML).join("");
    return `<div class="pg">`
      + `<div class="pg-body">`
      + headerHTML
      + `<table class="doc-sheet">${colgroupHTML}<tbody>${body}</tbody></table>`
      + (p === lastIdx ? signsHTML : "")
      + `</div>`
      + `<div class="pg-foot">หน้า ${p + 1} / ${total}</div>`
      + `</div>`;
  }).join("");

  docEl.innerHTML = html;
  docEl.style.width = "210mm"; docEl.style.margin = "0 auto";   // ขยายเต็มหน้าให้ .pg (210mm) พอดี
  return Array.from(docEl.querySelectorAll(".pg"));
}
