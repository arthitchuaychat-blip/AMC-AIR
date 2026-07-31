import React from "react";
import { ROLE_GUIDE, GUIDE_ORDER, DEPT_COLOR, DEPT_LABEL, PROCESS_FLOWS, COMPANY_TARGETS } from "../lib/handbook";
import { UIcon } from "../icons";

// คู่มือตำแหน่งงาน — ทุกตำแหน่งเปิดดูของตัวเองได้ + บันทึก/พิมพ์ PDF
export default function Handbook({ role, me }) {
  const myRole = me?.role || role;
  const [sel, setSel] = React.useState(ROLE_GUIDE[myRole] ? myRole : "exec");
  const g = ROLE_GUIDE[sel] || ROLE_GUIDE.exec;
  const c = DEPT_COLOR[g.dept] || "#0d9488";
  const secLab = { fontSize: 11, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--ink-3, #718890)", display: "flex", alignItems: "center", gap: 6, marginBottom: 7 };
  const dot = (col) => ({ width: 7, height: 7, borderRadius: 2, background: col, display: "inline-block" });

  const Block = ({ label, items, ordered, accent }) => (
    <div style={{ marginTop: 14 }}>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--ink-3, #718890)", display: "flex", alignItems: "center", gap: 6, marginBottom: 7 }}>
        <span style={{ width: 7, height: 7, borderRadius: 2, background: accent || c, display: "inline-block" }} />{label}
      </div>
      {ordered ? (
        <ol style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 7 }}>
          {items.map((t, i) => (
            <li key={i} style={{ position: "relative", paddingLeft: 28, fontSize: 14 }}>
              <span style={{ position: "absolute", left: 0, top: 0, width: 20, height: 20, borderRadius: 6, background: `color-mix(in srgb, ${accent || c} 16%, transparent)`, color: accent || c, fontSize: 11, fontWeight: 700, display: "grid", placeItems: "center" }}>{i + 1}</span>{t}
            </li>
          ))}
        </ol>
      ) : (
        <ul style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 4 }}>
          {items.map((t, i) => <li key={i} style={{ fontSize: 14 }}>{t}</li>)}
        </ul>
      )}
    </div>
  );

  return (
    <div className="adm">
      <div className="adm-head">
        <div>
          <h1 className="page-title">คู่มือตำแหน่งงาน <span className="page-title-en">Job Handbook</span></h1>
          <p className="page-sub">SOP: วัตถุประสงค์ · หน้าที่ · ขั้นตอนการทำงาน · กิจวัตร · กฎ · KPI ของแต่ละตำแหน่ง — เปิดดูของคุณ หรือเลือกดูตำแหน่งอื่นได้</p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="btn-ghost" onClick={() => printHandbook([sel])}>🖨️ บันทึก/พิมพ์ PDF (ตำแหน่งนี้)</button>
          <button className="btn-primary" onClick={() => printHandbook(GUIDE_ORDER)}>📚 พิมพ์ทั้งเล่ม</button>
        </div>
      </div>

      <div className="cat-filter">
        {GUIDE_ORDER.map((r) => {
          const rg = ROLE_GUIDE[r]; if (!rg) return null;
          const on = sel === r;
          return (
            <button key={r} className={"cat-chip" + (on ? " on" : "")} onClick={() => setSel(r)}
              style={on ? { background: DEPT_COLOR[rg.dept], color: "#fff", borderColor: DEPT_COLOR[rg.dept] } : {}}>
              {rg.icon} {rg.th}{r === myRole ? " ★" : ""}
            </button>
          );
        })}
      </div>

      <div style={{ marginTop: 4, marginBottom: 12, background: "var(--surface-2, #f3f7f8)", border: "1px solid var(--line, #e2e8f0)", borderRadius: 12, padding: "12px 14px" }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--ink-3, #718890)", marginBottom: 9 }}>🧭 เป้าบริษัท (North-Star) · ทุกตำแหน่งเล็งไปที่นี่</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: "8px 16px" }}>
          {COMPANY_TARGETS.map((ct, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 13, borderLeft: "3px solid #0d9488", paddingLeft: 9 }}>
              <span>{ct.m}</span><b style={{ whiteSpace: "nowrap", color: "#0a6f66" }}>{ct.t}</b>
            </div>
          ))}
        </div>
      </div>

      <div className="card" style={{ borderTop: `3px solid ${c}`, marginTop: 4 }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 14, flexWrap: "wrap" }}>
          <div style={{ width: 52, height: 52, borderRadius: 13, display: "grid", placeItems: "center", fontSize: 28, flex: "none", background: `color-mix(in srgb, ${c} 15%, transparent)` }}>{g.icon}</div>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span style={{ fontSize: 21, fontWeight: 800 }}>{g.th}</span>
              <span className="job-badge" style={{ background: `color-mix(in srgb, ${c} 14%, transparent)`, color: c }}>{DEPT_LABEL[g.dept]}</span>
              {sel === myRole && <span className="job-badge b-green">ตำแหน่งของคุณ</span>}
            </div>
            <div className="jo-dim" style={{ fontSize: 13, marginTop: 3 }}>{g.en} · {g.reports}</div>
          </div>
        </div>

        {/* วัตถุประสงค์ */}
        <div style={{ marginTop: 12, fontSize: 14, color: "var(--ink-2, #3f545a)", background: `color-mix(in srgb, ${c} 6%, transparent)`, borderLeft: `3px solid ${c}`, borderRadius: 8, padding: "9px 12px" }}>
          <b style={{ color: c }}>วัตถุประสงค์: </b>{g.purpose}
        </div>

        {/* KPI + เป้าหมาย */}
        <div style={{ marginTop: 16, background: `color-mix(in srgb, ${c} 7%, var(--surface, #fff))`, border: `1px solid color-mix(in srgb, ${c} 28%, var(--line, #e2e8f0))`, borderRadius: 12, padding: "4px 15px 10px" }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", color: c, margin: "10px 0 2px" }}>🎯 ตัวชี้วัด (KPI) &amp; เป้าหมาย</div>
          {g.kpis.map((k, i) => (
            <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "9px 0", borderTop: i ? `1px solid color-mix(in srgb, ${c} 18%, transparent)` : "none" }}>
              <span style={{ fontFamily: "var(--mono, monospace)", fontSize: 10.5, fontWeight: 700, color: c, border: `1px solid color-mix(in srgb, ${c} 40%, transparent)`, borderRadius: 5, padding: "1px 5px", flex: "none", marginTop: 2 }}>K{i + 1}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.8, fontWeight: 600 }}>{k.m}</div>
                <div style={{ fontSize: 11.5, color: "var(--ink-3, #718890)", marginTop: 2 }}>⏱ {k.f} · 📍 {k.src}{k.w ? ` · น้ำหนัก ${k.w}%` : ""}</div>
              </div>
              <span style={{ fontWeight: 800, fontSize: 13.5, color: c, background: `color-mix(in srgb, ${c} 12%, transparent)`, border: `1px solid color-mix(in srgb, ${c} 35%, transparent)`, borderRadius: 8, padding: "3px 9px", whiteSpace: "nowrap", flex: "none" }}>{k.t}</span>
            </div>
          ))}
        </div>

        <Block label="หน้าที่ความรับผิดชอบ" items={g.resp} />

        {/* ขั้นตอนการทำงาน (SOP) */}
        <div style={{ marginTop: 16 }}>
          <div style={secLab}><span style={dot(c)} />ขั้นตอนการทำงาน (SOP)</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {g.procedures.map((p, pi) => (
              <div key={pi} style={{ border: "1px solid var(--line, #e2e8f0)", borderRadius: 10, padding: "10px 12px" }}>
                <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 6, display: "flex", alignItems: "center", gap: 7 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: c, background: `color-mix(in srgb, ${c} 12%, transparent)`, borderRadius: 5, padding: "1px 7px", flex: "none" }}>{pi + 1}</span>{p.t}
                </div>
                <ol style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 5 }}>
                  {p.s.map((st, si) => (
                    <li key={si} style={{ position: "relative", paddingLeft: 26, fontSize: 13.6, color: "var(--ink-2, #3f545a)" }}>
                      <span style={{ position: "absolute", left: 0, top: 1, width: 18, height: 18, borderRadius: 6, background: `color-mix(in srgb, ${c} 14%, transparent)`, color: c, fontSize: 10.5, fontWeight: 700, display: "grid", placeItems: "center" }}>{si + 1}</span>{st}
                    </li>
                  ))}
                </ol>
              </div>
            ))}
          </div>
        </div>

        {/* กิจวัตร */}
        <div style={{ marginTop: 16 }}>
          <div style={secLab}><span style={dot(c)} />กิจวัตรการทำงาน</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 10 }}>
            {[["📅 รายวัน", g.routines.d], ["🗓️ รายสัปดาห์", g.routines.w], ["📆 รายเดือน", g.routines.m]].map(([lab, items], ri) => (
              <div key={ri} style={{ background: "var(--surface-2, #f3f7f8)", border: "1px solid var(--line, #e2e8f0)", borderRadius: 10, padding: "10px 12px" }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: c, marginBottom: 6 }}>{lab}</div>
                <ul style={{ margin: 0, paddingLeft: 16, display: "flex", flexDirection: "column", gap: 3 }}>
                  {items.map((t, i) => <li key={i} style={{ fontSize: 12.8 }}>{t}</li>)}
                </ul>
              </div>
            ))}
          </div>
        </div>

        <Block label="กฎ & ข้อควรระวัง" items={g.rules} accent="#d97706" />

        {/* เมนู/เอกสารที่ใช้ */}
        <div style={{ marginTop: 16 }}>
          <div style={secLab}><span style={dot(c)} />เมนู/เอกสารที่ใช้ในระบบ</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {g.menus.map((m, i) => <span key={i} style={{ fontSize: 12.5, background: `color-mix(in srgb, ${c} 10%, transparent)`, border: `1px solid color-mix(in srgb, ${c} 30%, var(--line, #e2e8f0))`, borderRadius: 999, padding: "3px 10px" }}>{m}</span>)}
          </div>
        </div>
      </div>

      <p className="jo-dim" style={{ fontSize: 12.5, marginTop: 12 }}>
        💡 กด “บันทึก/พิมพ์ PDF” แล้วเลือกปลายทางเป็น <b>Save as PDF</b> เพื่อได้ไฟล์ PDF · “พิมพ์ทั้งเล่ม” = คู่มือครบทุกตำแหน่ง + กระบวนการหลัก
      </p>
    </div>
  );
}

// ---------- พิมพ์เป็น PDF (เปิดหน้าต่างสะอาด แล้ว print → Save as PDF) ----------
function esc(s) { return String(s).replace(/[&<>]/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[m])); }

function roleSection(r) {
  const g = ROLE_GUIDE[r]; if (!g) return "";
  const c = DEPT_COLOR[g.dept] || "#0d9488";
  const ul = (items) => `<ul>${items.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>`;
  const kpi = `<div class="kpi"><div class="kpi-h">🎯 ตัวชี้วัด (KPI) &amp; เป้าหมาย</div>${g.kpis.map((k, i) => `<div class="kpi-i${i === 0 ? " first" : ""}"><span class="kt">K${i + 1}</span><span class="km">${esc(k.m)}<span class="kf">${esc(k.f)} · ${esc(k.src)}${k.w ? " · น้ำหนัก " + k.w + "%" : ""}</span></span><span class="ktg">${esc(k.t)}</span></div>`).join("")}</div>`;
  const procs = `<div class="lab">ขั้นตอนการทำงาน (SOP)</div>${g.procedures.map((p, pi) => `<div class="proc-box"><div class="pt">${pi + 1}. ${esc(p.t)}</div><ol>${p.s.map((st) => `<li>${esc(st)}</li>`).join("")}</ol></div>`).join("")}`;
  const rt = `<div class="lab">กิจวัตรการทำงาน</div><div class="rt-grid">${[["รายวัน", g.routines.d], ["รายสัปดาห์", g.routines.w], ["รายเดือน", g.routines.m]].map(([lab, items]) => `<div class="rt"><div class="rt-h">${lab}</div>${ul(items)}</div>`).join("")}</div>`;
  const menus = `<div class="lab">เมนู/เอกสารที่ใช้</div><div class="menus">${g.menus.map((m) => `<span class="mchip">${esc(m)}</span>`).join("")}</div>`;
  return `<section class="role" style="--c:${c}">
    <div class="rh"><span class="ic">${g.icon}</span><div><div class="th">${esc(g.th)}</div><div class="en">${esc(g.en)} · ${esc(DEPT_LABEL[g.dept])}</div><div class="rp">${esc(g.reports)}</div></div></div>
    <div class="purpose"><b>วัตถุประสงค์:</b> ${esc(g.purpose)}</div>
    ${kpi}
    <div class="lab">หน้าที่ความรับผิดชอบ</div>${ul(g.resp)}
    ${procs}
    ${rt}
    <div class="lab">กฎ &amp; ข้อควรระวัง</div>${ul(g.rules)}
    ${menus}
  </section>`;
}

function companySection() {
  return `<section class="company"><div class="ch">🧭 เป้าบริษัท (North-Star)</div>${COMPANY_TARGETS.map((ct) => `<div class="ci"><span>${esc(ct.m)}</span><b>${esc(ct.t)}</b></div>`).join("")}</section>`;
}

function processSection() {
  return `<section class="proc"><h2>กระบวนการทำงานหลัก</h2>${PROCESS_FLOWS.map((f) =>
    `<div class="flow"><div class="ft">${f.icon} ${esc(f.title)}</div><div class="fw">${esc(f.who)}</div><div class="fs">${f.steps.map((s, i) => `<span class="sc">${i + 1}. ${esc(s)}</span>`).join('<span class="ar">→</span>')}</div></div>`
  ).join("")}</section>`;
}

function printHandbook(roles) {
  const many = roles.length > 1;
  const body = companySection() + roles.map(roleSection).join("") + (many ? processSection() : "");
  const html = `<!doctype html><html lang="th"><head><meta charset="utf-8"><title>คู่มือตำแหน่งงาน AMC AIR</title>
  <style>
    @page{size:A4;margin:14mm}
    *{box-sizing:border-box}
    body{font-family:"Sukhumvit Set","Noto Sans Thai","Sarabun",Tahoma,sans-serif;color:#12252b;line-height:1.5;margin:0}
    .cover{border-bottom:2px solid #0d9488;padding-bottom:10px;margin-bottom:16px}
    .cover .eb{font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#0a6f66;font-weight:700}
    .cover h1{font-size:24px;margin:4px 0 2px}
    .cover .sub{font-size:12.5px;color:#5b6b70}
    .role{border:1px solid #dbe3e6;border-top:3px solid var(--c);border-radius:10px;padding:14px 16px;margin-bottom:14px;break-inside:avoid}
    .rh{display:flex;gap:12px;align-items:flex-start;margin-bottom:10px}
    .rh .ic{font-size:26px}
    .rh .th{font-size:18px;font-weight:800}
    .rh .en{font-size:11.5px;color:#0a6f66;font-weight:600}
    .rh .rp{font-size:11.5px;color:#71858b;margin-top:2px}
    .kpi{background:color-mix(in srgb,var(--c) 8%,#fff);border:1px solid color-mix(in srgb,var(--c) 30%,#dbe3e6);border-radius:9px;padding:10px 12px;margin-bottom:10px}
    .kpi-h{font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--c);margin-bottom:6px}
    .kpi-i{display:flex;gap:8px;align-items:flex-start;font-size:12.5px;padding:5px 0;border-top:1px solid color-mix(in srgb,var(--c) 15%,transparent)}
    .kpi-i.first{border-top:none}
    .kpi-i .kt{font-family:ui-monospace,Consolas,monospace;font-size:9.5px;font-weight:700;color:var(--c);border:1px solid color-mix(in srgb,var(--c) 40%,#dbe3e6);border-radius:4px;padding:1px 5px;flex:none;margin-top:1px}
    .kpi-i .km{flex:1}
    .kpi-i .kf{display:block;font-size:10px;color:#8a9a9f;margin-top:1px}
    .kpi-i .ktg{font-weight:800;color:var(--c);white-space:nowrap;flex:none}
    .company{border:1px solid #0d9488;background:#f0faf8;border-radius:10px;padding:12px 14px;margin-bottom:16px;break-inside:avoid}
    .company .ch{font-size:12px;font-weight:800;color:#0a6f66;text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px}
    .company .ci{display:flex;justify-content:space-between;gap:12px;font-size:12.5px;padding:3px 0;border-bottom:1px dashed #cfe3df}
    .company .ci b{color:#0a6f66;white-space:nowrap}
    .lab{font-size:10.5px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#71858b;margin:11px 0 3px}
    .lab::before{content:"";display:inline-block;width:6px;height:6px;border-radius:2px;background:var(--c);margin-right:6px;vertical-align:middle}
    ul,ol{margin:0;padding-left:20px}
    li{font-size:13px;margin:2px 0}
    .purpose{font-size:12.5px;color:#3f545a;background:color-mix(in srgb,var(--c) 6%,#fff);border-left:3px solid var(--c);border-radius:6px;padding:7px 10px;margin-bottom:10px}
    .proc-box{border:1px solid #e2e8f0;border-radius:8px;padding:8px 10px;margin:5px 0;break-inside:avoid}
    .proc-box .pt{font-weight:700;font-size:12.8px;margin-bottom:3px}
    .rt-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin:4px 0 6px}
    .rt{background:#f3f7f8;border:1px solid #e2e8f0;border-radius:8px;padding:7px 9px}
    .rt .rt-h{font-size:11px;font-weight:700;color:var(--c);margin-bottom:3px}
    .rt ul{padding-left:15px}
    .rt li{font-size:11px}
    .menus{display:flex;flex-wrap:wrap;gap:5px}
    .mchip{font-size:11px;background:color-mix(in srgb,var(--c) 10%,#fff);border:1px solid color-mix(in srgb,var(--c) 30%,#dbe3e6);border-radius:999px;padding:2px 8px}
    .proc{break-inside:avoid}
    .proc h2{font-size:16px;border-bottom:1px solid #dbe3e6;padding-bottom:6px}
    .flow{border:1px solid #dbe3e6;border-radius:9px;padding:10px 12px;margin-bottom:10px;break-inside:avoid}
    .flow .ft{font-weight:800;font-size:13.5px}
    .flow .fw{font-size:11.5px;color:#71858b;margin-bottom:7px}
    .fs{display:flex;flex-wrap:wrap;align-items:center;gap:5px}
    .sc{background:#f3f7f8;border:1px solid #dbe3e6;border-left:3px solid #0d9488;border-radius:6px;padding:4px 8px;font-size:12px;font-weight:600}
    .ar{color:#71858b}
    .foot{margin-top:8px;font-size:10.5px;color:#9aa;text-align:center}
  </style></head><body>
  <div class="cover"><div class="eb">AMC AIR · ระบบบริหารจัดการองค์กร</div><h1>คู่มือตำแหน่งงาน${many ? "" : " · " + esc(ROLE_GUIDE[roles[0]].th)}</h1>
  <div class="sub">SOP: วัตถุประสงค์ · หน้าที่ · ขั้นตอนการทำงาน · กิจวัตร · กฎ · ตัวชี้วัด (KPI)</div></div>
  ${body}
  <div class="foot">AMC AIR — คู่มือตำแหน่งงาน · จัดทำจากระบบบริหารจัดการองค์กร</div>
  </body></html>`;

  const w = window.open("", "_blank");
  if (!w) { alert("เบราว์เซอร์บล็อกหน้าต่างพิมพ์ — โปรดอนุญาต pop-up แล้วลองใหม่"); return; }
  w.document.open(); w.document.write(html); w.document.close();
  w.onload = () => { w.focus(); w.print(); };
  // เผื่อ onload ไม่ยิง (บาง browser) — สั่งพิมพ์หลังหน่วงเล็กน้อย
  setTimeout(() => { try { w.focus(); w.print(); } catch (e) {} }, 600);
}
