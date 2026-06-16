// Cross-device document printing. We render the document into a clean popup window and print that
// (the in-page print trick prints blank on many mobile browsers).
//
// Repeating header: Chrome would not reliably repeat a <thead>, so the letterhead lives in a
// .doc-running block that we make position:fixed — Chrome prints fixed elements at the top of EVERY
// page. We measure that header's height and reserve an equal @page top-margin so the body table
// (which flows in the page content area) never slides under the header. The running header's column
// strip and the body table share a <colgroup>, so their columns line up.

export function openPrintWindow() {
  try { return window.open("", "_blank"); } catch (_) { return null; }
}

const SIDE = "12mm";   // left/right page margin
const BOTTOM = "16mm"; // bottom page margin

export function writeAndPrint(win, selector = ".print-area") {
  const src = document.querySelector(selector);
  if (!src) { if (win) win.close(); return; }
  if (!win) { window.print(); return; } // popup blocked → fall back to in-page print (desktop)

  const styles = Array.from(document.querySelectorAll('link[rel="stylesheet"], style'))
    .map((n) => n.outerHTML).join("\n");
  const doc = `<!doctype html><html lang="th"><head><meta charset="utf-8">
<base href="${location.origin}/">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>เอกสาร AMC AIR</title>
${styles}
<style>
  /* margin:0 removes the browser's auto header/footer band; JS injects the real top margin once it
     has measured the running header (see fire() below). */
  @page{ size:A4; margin:0 }
  html,body{ margin:0;padding:0;background:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact }
  /* undo the app's in-page print hacks so the document is fully visible in the popup */
  @media screen { .print-area{ display:block !important } }
  @media print { body *{ visibility:visible !important } }
  .print-area{ position:static !important; width:auto !important; padding:0 }
  /* .doc fixed to A4 width so the on-screen header measurement matches print text wrapping */
  .doc{ display:block !important; position:static !important; min-height:0 !important; max-width:none !important;
        width:210mm; box-sizing:border-box; margin:0 auto !important; padding:0 !important }
  .doc::before{ display:none }
  /* running header — block on screen (so we can measure it), fixed on every page in print.
     It is full page width with its own side padding; the body table gets its side margins from @page,
     so both line up at the same x. */
  .doc-running{ width:210mm; box-sizing:border-box; padding:13mm ${SIDE} 5mm; background:#fff; margin:0 auto }
  @media print {
    .doc{ width:auto; margin:0 !important }
    .doc-running{ position:fixed; top:0; left:0; right:0; width:auto; margin:0; z-index:10 }
  }
  .doc-colstrip,.doc-sheet{ width:100%; table-layout:fixed; border-collapse:separate; border-spacing:0 }
  .doc-colstrip{ margin-top:4px }
  .doc-signs{ margin-top:28px }
  .doc-sheet>tbody>tr:not(.ds-full),.doc-totals,.doc-terms-box,.doc-cust,.doc-signs{ break-inside:avoid; page-break-inside:avoid }
</style></head><body>${src.outerHTML}</body></html>`;

  win.document.open();
  win.document.write(doc);
  win.document.close();

  let done = false;
  const fire = () => {
    if (done) return; done = true;
    try {
      // measure the running header (block layout, 210mm wide = print width) and reserve that much
      // top margin on every page so the fixed header never overlaps the body.
      const hd = win.document.querySelector(".doc-running");
      const top = (hd ? hd.offsetHeight : 200) + 8; // px + small buffer
      const st = win.document.createElement("style");
      st.textContent = `@page{ size:A4; margin:${top}px ${SIDE} ${BOTTOM} ${SIDE} }`;
      win.document.head.appendChild(st);
    } catch (_) {}
    try { win.focus(); win.print(); } catch (_) {}
  };
  try { win.onload = () => setTimeout(fire, 400); } catch (_) {}
  setTimeout(fire, 1500); // fallback if onload never fires
}
