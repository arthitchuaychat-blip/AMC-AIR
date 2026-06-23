// The logged-in user's signature (set by HR, synced into localStorage by App.jsx).
export function mySignature() {
  try { const url = localStorage.getItem("amc_sign_url"); return url ? { url, name: localStorage.getItem("amc_sign_name") || "" } : null; }
  catch { return null; }
}
// default state of the per-document signature toggle = the user's global preference
export function defaultSignOn() {
  try { return localStorage.getItem("amc_sign_on") === "1"; } catch { return false; }
}
