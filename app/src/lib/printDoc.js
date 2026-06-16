// Cross-device document printing. We render the document into a clean popup window and print that
// (the in-page print trick prints blank on many mobile browsers).
//
// The document is one <table> with the letterhead in <thead>; the browser repeats <thead> at the
// top of every printed page (native pagination). border-collapse:separate is required for Chrome to
// repeat it.

export function openPrintWindow() {
  try { return window.open("", "_blank"); } catch (_) { return null; }
}

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
  /* margin:0 removes the browser's auto header/footer band (date · about:blank · url · page no.);
     our own page margins are applied INSIDE so they repeat on every page. */
  @page{ size:A4; margin:0 }
  html,body{ margin:0;padding:0;background:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact }
  /* undo the app's print hacks so the document (and its repeated header) is fully visible */
  @media screen { .print-area{ display:block !important } }
  @media print { body *{ visibility:visible !important } }
  .print-area{ position:static !important; width:auto !important; padding:0 14mm }   /* left/right page margin (every page) */
  /* The table's <thead> repeats on every page ONLY if no ancestor is flex/relative/has a forced height.
     So .doc must be a plain static block here (NOT flex / relative / min-height) — otherwise Chrome
     prints the letterhead on page 1 only. Signatures therefore flow after the terms (not pinned). */
  .doc{ display:block !important; position:static !important; min-height:0 !important; max-width:none !important; margin:0 !important; padding:0 0 14mm !important }
  .doc::before{ display:none }
  .doc-sheet{ border-collapse:separate !important; border-spacing:0; width:100% }
  .doc-sheet thead{ display:table-header-group !important }
  .ds-head-cell{ padding-top:13mm }   /* top page margin — repeats with the header on every page */
  .doc-signs{ margin-top:28px }
  .doc-sheet>tbody>tr:not(.ds-full),.doc-totals,.doc-terms-box,.doc-cust,.doc-signs{ break-inside:avoid; page-break-inside:avoid }
</style></head><body>${src.outerHTML}</body></html>`;

  win.document.open();
  win.document.write(doc);
  win.document.close();

  let done = false;
  const fire = () => { if (done) return; done = true; try { win.focus(); win.print(); } catch (_) {} };
  try { win.onload = () => setTimeout(fire, 350); } catch (_) {}
  setTimeout(fire, 1400); // fallback if onload never fires
}
