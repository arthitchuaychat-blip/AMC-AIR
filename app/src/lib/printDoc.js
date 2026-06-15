// Cross-device document printing. We render the document into a clean popup window and print that
// (the in-page print trick prints blank on many mobile browsers).
//
// Paged.js lays the document into real A4 pages: the letterhead repeats on every page, the footer
// shows our own page number ("1 / 2"), and the signature block is pinned to the bottom of the page —
// so we can leave the browser's auto header/footer (date · about:blank · url) turned off.
// If Paged.js can't load, we fall back to plain native print (header still repeats via <thead>).

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
  /* our own page number in the footer margin → browser auto header/footer can be left off */
  @page{ size:A4; margin:13mm 11mm 15mm; @bottom-right{ content:counter(page) " / " counter(pages); font-size:9.5px; color:#9aa5b3; } }
  html,body{ margin:0;padding:0;background:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact }
  /* IMPORTANT: undo the app's print rules (they hide everything except .print-area, which would hide
     the pages Paged.js generates outside it → blank pages + missing repeated header). */
  @media screen { .print-area{ display:block !important } }
  @media print { body *{ visibility:visible !important } }
  .print-area{ position:static !important; width:auto !important; padding:0 }
  .doc::before{ display:none }
  .doc-table tr,.doc-totals,.doc-terms-box,.doc-cust,.doc-signs{ break-inside:avoid; page-break-inside:avoid }
</style>
<script>
  window.__printed = false;
  function __fire(){ if (window.__printed) return; window.__printed = true; try { window.focus(); window.print(); } catch(e){} }
  window.PagedConfig = { auto: true, after: function(){ setTimeout(__fire, 100); } };
</script>
<script src="https://cdn.jsdelivr.net/npm/pagedjs/dist/paged.polyfill.js"></script>
</head><body>${src.outerHTML}</body></html>`;

  win.document.open();
  win.document.write(doc);
  win.document.close();

  // fallback: if Paged.js never finishes (CDN blocked/offline), print natively after a moment
  setTimeout(() => { try { if (!win.__printed) { win.__printed = true; win.focus(); win.print(); } } catch (_) {} }, 4500);
}
