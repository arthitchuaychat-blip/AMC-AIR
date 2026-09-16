import fs from "node:fs";

const app = fs.readFileSync(new URL("./src/App.jsx", import.meta.url), "utf8");
const bell = fs.readFileSync(new URL("./src/components/NotificationBell.jsx", import.meta.url), "utf8");

function check(ok, message) { if (!ok) throw new Error(message); }

check(app.includes("const AUTH_WAIT_MS = 8000"), "Auth startup must have a bounded wait");
check(app.includes("withDeadline(supabase.auth.getSession())"), "getSession must use the deadline");
check(app.includes("if (!alive || inFlight) return"), "profile refreshes must be single-flight");
check(app.includes("ระบบยืนยันตัวตนตอบช้าหรือขัดข้องชั่วคราว"), "Auth outage must have a recoverable UI");
check(!bell.includes("setInterval(refresh, 30000)"), "notification bell must not poll every 30 seconds");
check(bell.includes("visiblePolling(refresh, 120000)"), "notification fallback must pause while hidden");

console.log("auth outage resilience checks passed");
