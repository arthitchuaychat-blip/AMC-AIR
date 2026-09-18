// v854 — แชตลูกค้า "รอตอบ": ห้องที่ลูกค้าพูดเป็นคนสุดท้ายต้องมองเห็นได้ แม้มีคนเปิดอ่านไปแล้ว (unread ถูกล้างตอนเปิดห้อง)
// วัดจริง 18 ก.ย. 2026: 7 วันล่าสุด ข้อความสุดท้ายเป็นของลูกค้า 37 ห้อง — ทั้ง 37 ห้อง unread = 0 (ไม่มีสัญญาณใด ๆ บนจอ)
import fs from "node:fs";
import assert from "node:assert/strict";
import { waitInfo, quickMatch, byWaitingLongest, WAIT_STYLE } from "./src/lib/chatWaiting.js";

const norm = (s) => s.replace(/\r\n/g, "\n");
const UI = norm(fs.readFileSync("src/components/Chat.jsx", "utf8"));
const API = norm(fs.readFileSync("src/lib/api.js", "utf8"));
const MIG = norm(fs.readFileSync("../supabase/migrations/20260918190000_chat_waiting.sql", "utf8"));
let pass = 0, fail = 0;
const check = (name, fn) => { try { fn(); console.log("  ✓ " + name); pass++; } catch (e) { console.log("  ✗ " + name + "\n      " + (e.message || e)); fail++; } };

console.log("\nlib/chatWaiting — ตรรกะจริง:");
const NOW = new Date("2026-09-18T12:00:00Z").getTime();
const ago = (min) => new Date(NOW - min * 60000).toISOString();
check("ป้ายเวลา: นาที → ชั่วโมง → วัน และระดับความด่วน new/warm/hot (1 ชม. / 4 ชม.)", () => {
  assert.deepEqual(waitInfo({ waiting_since: ago(25) }, NOW), { min: 25, t: "25 น.", lvl: "new" });
  assert.deepEqual(waitInfo({ waiting_since: ago(60) }, NOW), { min: 60, t: "1 ชม.", lvl: "warm" });
  assert.deepEqual(waitInfo({ waiting_since: ago(239) }, NOW).lvl, "warm");
  assert.deepEqual(waitInfo({ waiting_since: ago(240) }, NOW), { min: 240, t: "4 ชม.", lvl: "hot" });
  assert.equal(waitInfo({ waiting_since: ago(3 * 1440 + 30) }, NOW).t, "3 วัน");
  for (const l of ["new", "warm", "hot"]) assert.ok(WAIT_STYLE[l]?.background);
});
check("ไม่รอ/ข้อมูลเพี้ยน → null (ไม่มีป้าย) · นาฬิกาเครื่องเพี้ยนไปข้างหน้าไม่ติดลบ", () => {
  for (const c of [null, {}, { waiting_since: null }, { waiting_since: "" }, { waiting_since: "ไม่ใช่วันที่" }]) assert.equal(waitInfo(c, NOW), null);
  assert.equal(waitInfo({ waiting_since: new Date(NOW + 5 * 60000).toISOString() }, NOW).min, 0);
});
const C = [
  { id: "a", unread: 2, waiting_since: ago(10), assigned_to: "me", pinned: false },
  { id: "b", unread: 0, waiting_since: ago(500), assigned_to: "x", pinned: true },    // เปิดอ่านแล้วแต่ยังไม่ตอบ — เคสที่เคยหลุด
  { id: "c", unread: 0, waiting_since: null, assigned_to: "me", pinned: false },
];
check("ตัวกรองด่วน: 'รอตอบ' จับห้องที่ unread=0 ได้ (หัวใจของฟีเจอร์) · ยังไม่อ่าน/ของฉัน/ปักหมุด ถูกต้อง", () => {
  const ids = (f, me) => C.filter((c) => quickMatch(c, f, me)).map((c) => c.id).join("");
  assert.equal(ids("waiting", "me"), "ab"); assert.equal(ids("unread", "me"), "a"); assert.equal(ids("mine", "me"), "ac");
  assert.equal(ids("pinned", "me"), "b"); assert.equal(ids("all", "me"), "abc");
  assert.equal(ids("mine", null), "", "ยังไม่รู้ว่าฉันคือใคร ต้องไม่จับห้องที่ยังไม่มอบหมาย");
});
check("โหมดรอตอบเรียงคนที่รอนานสุดขึ้นก่อน", () => {
  assert.equal(C.filter((c) => c.waiting_since).sort(byWaitingLongest).map((c) => c.id).join(""), "ba");
});

console.log("\nChat.jsx:");
check("รายชื่อ: กรองด้วย quickMatch + เรียงรอนานสุดในโหมดรอตอบ + ป้าย ⏳ บนแถว (เดินเองทุกนาทีผ่าน nowTick)", () => {
  assert.ok(UI.includes("&& quickMatch(c, quickF, myId)"));
  assert.ok(UI.includes('if (quickF === "waiting") return byWaitingLongest(a, b);'));
  assert.ok(UI.includes("const w = waitInfo(c, nowTick); return w ?"));
  assert.ok(UI.includes("setInterval(() => setNowTick(Date.now()), 60000)") && UI.includes("isFb, nowTick]);"));
});
check("ชิปตัวกรองด่วนพร้อมตัวเลข · ชิป/ป้ายรอตอบซ่อนเองถ้า DB ยังไม่รัน migration · ตัวเลขนับเฉพาะแท็บที่เปิด (ลูกค้า/ซัพ/FB)", () => {
  assert.ok(UI.includes('...(hasWaitCol ? [["waiting", "⏳ รอตอบ"]] : [])'));
  assert.ok(UI.includes("tabContacts.some((c) => c.waiting_since !== undefined)"));
  assert.ok(UI.includes('isSup ? c.kind === "supplier" : (c.kind || "customer") !== "supplier")), [contacts, isFb, isSup]);'));
  assert.ok(UI.includes("[channel, q, stageF, ownerF, quickF]);"), "เปลี่ยนชิปต้องรีเซ็ตจำนวนห้องที่วาด");
});
check("หัวห้อง: ป้ายรอตอบ + ปุ่ม '✓ ไม่ต้องตอบ' (เฉพาะคนมีสิทธิ์ส่ง) → ล้างใน DB แล้ว patch จอทันที", () => {
  assert.ok(UI.includes("const w = waitInfo(selContact, nowTick); return w ? ("));
  assert.ok(UI.includes("{canSend && <button type=\"button\" className=\"btn-ghost sm\" title=\"ลูกค้าพิมพ์ปิดท้าย"));
  assert.ok(UI.includes("await (isFb ? clearFbWaiting(c.line_user_id) : clearLineWaiting(c.line_user_id)); patchLocal(c.line_user_id, { waiting_since: null });"));
});

console.log("\napi.js + migration:");
check("clearLineWaiting/clearFbWaiting ล้างเฉพาะ waiting_since (ไม่แตะ unread/last_direction) + ข้อความบอกให้รัน migration ถ้ายังไม่มีคอลัมน์", () => {
  assert.ok(API.includes('from("line_contacts").update({ waiting_since: null }).eq("line_user_id", uid)'));
  assert.ok(API.includes('from("fb_contacts").update({ waiting_since: null }).eq("psid", psid)'));
  assert.ok(API.includes("ต้องรัน migration chat_waiting (20260918190000)"));
});
check("trigger: ขาเข้า = เริ่มรอจากข้อความแรกของชุด (coalesce คงค่าเดิม) · ขาออก (รวมบอท) = ล้าง · เขียนเฉพาะเมื่อค่าเปลี่ยน (ไม่ยิง realtime ทุกข้อความ)", () => {
  assert.ok(MIG.includes("waiting_since = coalesce(waiting_since, new.created_at, now())"));
  assert.ok(MIG.includes("set last_direction = 'out', waiting_since = null"));
  assert.ok(MIG.includes("(last_direction is distinct from 'in' or waiting_since is null)") && MIG.includes("(last_direction is distinct from 'out' or waiting_since is not null)"));
  assert.ok(MIG.includes("after insert on line_messages") && MIG.includes("after insert on fb_messages"));
  assert.ok((MIG.match(/security definer set search_path = public/g) || []).length === 2);
});
check("ย้อนหลัง: นับรอเฉพาะห้องที่ข้อความล่าสุด ≤ 14 วัน · เวลาเริ่มรอ = ขาเข้าแรกหลังขาออกล่าสุด · ทำทั้ง LINE และ FB · รันซ้ำได้", () => {
  assert.equal((MIG.match(/interval '14 days'/g) || []).length, 2);
  assert.equal((MIG.match(/and m\.created_at > coalesce\(\(select max\(o\.created_at\)/g) || []).length, 2);
  assert.ok(MIG.includes("add column if not exists waiting_since timestamptz") && MIG.includes("drop trigger if exists line_messages_waiting"));
});

console.log(`\nสรุป: ผ่าน ${pass} · ตก ${fail}`);
if (fail) process.exit(1);
