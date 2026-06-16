// PWA install helpers — capture the Android "beforeinstallprompt" event so we can trigger the
// native install from our own button, and detect iOS / already-installed state.

let deferred = null;
let listeners = [];
const notify = () => listeners.forEach((f) => { try { f(); } catch (_) {} });

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); deferred = e; notify(); });
  window.addEventListener("appinstalled", () => { deferred = null; notify(); });
}

export const onInstallChange = (f) => { listeners.push(f); return () => { listeners = listeners.filter((x) => x !== f); }; };
export const canInstall = () => !!deferred;

export async function promptInstall() {
  if (!deferred) return false;
  deferred.prompt();
  const { outcome } = await deferred.userChoice;
  deferred = null; notify();
  return outcome === "accepted";
}

export const isStandalone = () =>
  typeof window !== "undefined" &&
  ((window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) || window.navigator.standalone === true);

export const isIOS = () =>
  typeof navigator !== "undefined" && /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream;
