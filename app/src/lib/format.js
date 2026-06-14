// Formatting helpers (ported from the prototype)
export const fmtBaht = (n) => "฿" + Math.round(n || 0).toLocaleString("en-US");
export const fmtBaht2 = (n) =>
  "฿" + (n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const fmtNum = (n) => Math.round(n || 0).toLocaleString("en-US");
export const fmtCompact = (n) => {
  n = n || 0;
  if (n >= 1e6) return "฿" + (n / 1e6).toFixed(2) + "M";
  if (n >= 1e3) return "฿" + (n / 1e3).toFixed(1) + "K";
  return "฿" + Math.round(n);
};

export const UNITS = ["เมตร", "ชิ้น", "ตัว", "ชุด", "ถัง", "ม้วน", "เส้น", "กระป๋อง"];

// auto customer code derived from the DB id (sequential, unique, no extra column)
export const custCode = (id) => (id ? "C" + String(id).padStart(6, "0") : "");

// round to 2 decimals (money) — avoids accumulating rounding leftovers
export const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

// attachments — tell images apart from other files (pdf/doc/…) by URL extension
export const isImageUrl = (u) => /\.(jpe?g|png|gif|webp|heic|heif|bmp|svg|avif)(\?|#|$)/i.test(u || "");
export const fileExt = (u) => ((String(u || "").split(/[?#]/)[0].split(".").pop()) || "ไฟล์").toUpperCase().slice(0, 5);
// accept attribute for attach inputs: photos (camera/gallery) + common documents
export const ATTACH_ACCEPT = "image/*,application/pdf,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt";

// is a date (YYYY-MM-DD or ISO) within [from, to] (inclusive)? empty from/to = open end
export const inRange = (dateStr, from, to) => {
  if (!from && !to) return true;
  if (!dateStr) return false;
  const d = String(dateStr).slice(0, 10);
  return (!from || d >= from) && (!to || d <= to);
};
