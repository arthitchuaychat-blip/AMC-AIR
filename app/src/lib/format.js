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
