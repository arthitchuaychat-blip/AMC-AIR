// ตัวรัน test ทั้งชุด — แทน chain `a && b && c ...` ใน package.json ที่ "หยุดที่ตัวแรกที่ตก"
//
// บทเรียน (memory: build-passes-page-dead, 2026-09-17): chain && ทำให้ suite หลังตัวที่ตกไม่เคยรัน
// v841 RSTATUS ตกตัวเดียว → undefined-vars + อีก ~20 suite ถูกบังมานาน "ผ่าน 55" ที่เห็นคือแค่ suite แรก
// ตัวนี้รัน "ทุก" suite เสมอ พิมพ์ ✓/✗ รายตัว + สรุปท้าย แล้วค่อย exit 1 ถ้ามีตัวไหนตก
// → เห็นภาพรวมจริงทุกครั้ง ไม่มี suite ไหนถูกบังอีก
import { spawnSync } from "node:child_process";

// ลำดับและ argument ตามที่เคยอยู่ใน package.json "test" (บาง suite ต้องการ path ของไฟล์ที่ตรวจ)
const SUITES = [
  ["test-auth-outage-resilience.mjs"],
  ["test-scoped-loads.mjs", "src/lib/api.js", "src/components/Dashboard.jsx"],
  ["test-job-visits.mjs", "src/lib/api.js"],
  ["test-customer-form.mjs"],
  ["test-status-badges.mjs"],
  ["test-undefined-vars.mjs"],
  ["test-promise-all-arity.mjs"],
  ["test-material-form.mjs"],
  ["test-dual-unit.mjs"],
  ["test-stock-source.mjs"],
  ["test-payslip-frozen.mjs"],
  ["test-doc-notes.mjs"],
  ["test-chat-search.mjs"],
  ["test-doc-notes-edit.mjs"],
  ["test-invoice-guard.mjs"],
  ["test-quote-wht.mjs"],
  ["test-boq-internal.mjs"],
  ["test-tax-buyvat.mjs"],
  ["test-recheck-regressions.mjs"],
  ["test-api-security.mjs"],
  ["test-payroll-recheck.mjs"],
  ["test-numbers-recheck.mjs"],
  ["test-web-ac-filters.mjs"],
  ["test-portfolio-album.mjs"],
  ["test-job-quote-pending.mjs"],
  ["test-item-replace-rls.mjs"],
  ["test-doc-address.mjs"],
  ["test-sales-receive.mjs"],
  ["test-weborder-link.mjs"],
  ["test-thumb-missing-mat.mjs"],
  ["test-flowaccount-send-once.mjs"],
  ["test-financing-guards.mjs"],
  ["test-money-views.mjs"],
  ["test-money-docs.mjs"],
  ["test-doc-idempotency.mjs"],
  ["test-select-narrow.mjs"],
];

const failed = [];
for (const [file, ...args] of SUITES) {
  const r = spawnSync(process.execPath, [file, ...args], { encoding: "utf8" });
  const out = (r.stdout || "") + (r.stderr || "");
  const summary = (out.split("\n").filter((l) => l.includes("สรุป:")).pop() || "").trim();
  if (r.status === 0) console.log(`✓ ${file}  ${summary}`);
  else {
    failed.push(file);
    const why = out.split("\n").filter((l) => /✗|Error|assert/.test(l)).slice(0, 2).join(" | ").trim().slice(0, 220);
    console.log(`✗ ${file}  ${summary}${why ? "\n      " + why : ""}`);
  }
}
console.log(`\n=== รวม: ผ่าน ${SUITES.length - failed.length} · ตก ${failed.length} จาก ${SUITES.length} suite ===`);
if (failed.length) { console.log("ตก: " + failed.join(", ")); process.exit(1); }
