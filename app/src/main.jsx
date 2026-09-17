import React from "react";
import ReactDOM from "react-dom/client";
import "./styles.css";
import "./design-system.css";
import "./sales-documents.css";
import App from "./App";
import { installGlobalErrorReporting } from "./lib/errorReport";

// URL ของบันเดิลหลักที่กำลังรันอยู่ (…/assets/index-XXXX.js) — ใช้เทียบว่ามี deploy ใหม่หรือยัง
try { window.__APP_ASSET__ = import.meta.url; } catch { /* ignore */ }

// stale chunk หลัง deploy: Vite ยิง event นี้เมื่อโหลดไฟล์ย่อย (dynamic import) ที่หายไปไม่ได้
// → รีโหลดอัตโนมัติ 1 ครั้ง (กัน loop ด้วย sessionStorage) ให้แท็บเก่าได้บันเดิลใหม่เอง
window.addEventListener("vite:preloadError", () => {
  try {
    const last = Number(sessionStorage.getItem("amc_chunk_reload") || 0);
    if (Date.now() - last > 15000) { sessionStorage.setItem("amc_chunk_reload", String(Date.now())); window.location.reload(); }
  } catch { window.location.reload(); }
});

// เก็บ error ที่ ErrorBoundary ไม่เห็น (event handler / promise ไม่ได้ await) ลง client_errors ของเราเอง — ดู lib/errorReport.js
installGlobalErrorReporting();

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
