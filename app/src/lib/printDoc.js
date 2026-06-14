// Cross-device document printing (desktop + mobile).
// The in-page "hide everything + absolute .print-area" trick prints blank on many mobile browsers,
// so instead we render the document into a clean popup window and print that.
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
${styles}
<style>
  @page{ size:A4; margin:14mm 12mm }
  html,body{ margin:0;padding:0;background:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact }
  .print-area{ display:block !important;position:static !important;width:auto !important;padding:0 }
  .doc-sheet thead{ display:table-header-group }
  .doc::before{ display:none }
  .doc-table tr,.doc-totals,.doc-terms-box,.doc-signs,.doc-cust{ break-inside:avoid;page-break-inside:avoid }
</style></head><body>${src.outerHTML}</body></html>`;

  win.document.open();
  win.document.write(doc);
  win.document.close();

  let done = false;
  const fire = () => { if (done) return; done = true; try { win.focus(); win.print(); } catch (_) {} };
  try { win.onload = () => setTimeout(fire, 350); } catch (_) {}
  setTimeout(fire, 1400); // fallback if onload never fires
}
