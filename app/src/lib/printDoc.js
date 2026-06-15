// Cross-device document printing (desktop + mobile).
// The in-page "hide everything + absolute .print-area" trick prints blank on many mobile browsers,
// so instead we render the document into a clean popup window and print that.
//
// Pagination + page numbers use Paged.js: it lays the document out into real A4 pages and renders
// our own footer page number ("1 / 2"), so we can drop the browser's auto header/footer (the
// date · about:blank · url band) entirely while keeping a page number. If Paged.js can't load,
// we fall back to a plain native print.
//
// Usage (popup must be opened from the click gesture to dodge popup blockers):
//   onClick={() => { winRef.current = openPrintWindow(); setPrintX(row); }}
//   useEffect(..., () => setTimeout(() => { writeAndPrint(winRef.current); ... }, 100))

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
  /* page number rendered by us in the footer margin; browser auto header/footer can be left off */
  @page{ size:A4; margin:14mm 12mm 15mm; @bottom-right{ content:counter(page) " / " counter(pages); font-size:10px; color:#9aa5b3; } }
  html,body{ margin:0;padding:0;background:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact }
  .print-area{ display:block !important;position:static !important;width:auto !important;padding:0 }
  .doc-sheet thead{ display:table-header-group }
  .doc::before{ display:none }
  .doc-table tr,.doc-totals,.doc-terms-box,.doc-signs,.doc-cust{ break-inside:avoid;page-break-inside:avoid }
</style>
<script>
  window.__printed = false;
  function __fire(){ if (window.__printed) return; window.__printed = true; try { window.focus(); window.print(); } catch(e){} }
  // Paged.js paginates, renders the footer page number, then we print.
  window.PagedConfig = { auto: true, after: function(){ setTimeout(__fire, 80); } };
</script>
<script src="https://cdn.jsdelivr.net/npm/pagedjs/dist/paged.polyfill.js"></script>
</head><body>${src.outerHTML}</body></html>`;

  win.document.open();
  win.document.write(doc);
  win.document.close();

  // fallback: if Paged.js never finishes (e.g. CDN blocked/offline), print natively after a moment
  setTimeout(() => { try { if (!win.__printed) { win.__printed = true; win.focus(); win.print(); } } catch (_) {} }, 4000);
}
