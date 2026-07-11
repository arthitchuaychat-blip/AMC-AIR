import React from "react";
import { custCode, fmtDocDate } from "../lib/format";
import { PERF_ROWS, PM_ROWS, CLEAN_ROWS, REPAIR_ROWS, WORK_TYPES, AC_TYPES, ACCEPT_GROUPS, ACCEPT_OVERALL } from "../lib/handover";

// Printed/PDF A4 sheet of a SAVED handover (filled in by the technician). Renders the header, the
// ticked work-types, every sub-form (perf measurement / PM checklist) with the recorded values, and
// both signatures. Multiple forms flow onto extra A4 pages via native print pagination.

const ckText = (v) => (v === "ok" ? "ปกติ Normal" : v === "bad" ? "ไม่ปกติ Abnormal" : "");
const Tick = ({ on }) => <i className={"ho-cb-box" + (on ? " on" : "")} />;

function MachineLine({ m = {} }) {
  const parts = [
    m.code && `รหัส/Code ${m.code}`, m.type, m.brand && `ยี่ห้อ/Brand ${m.brand}`, m.model && `รุ่น/Model ${m.model}`,
    m.btu && `${m.btu} BTU`, m.serial && `S/N ${m.serial}`,
    m.building && `อาคาร/Bldg. ${m.building}`, m.floor && `ชั้น/Fl. ${m.floor}`, m.room && `ห้อง/Rm. ${m.room}`,
  ].filter(Boolean);
  return <div className="ho-mline">{parts.length ? parts.join("  ·  ") : "— ไม่ระบุข้อมูลเครื่อง · Machine info not specified —"}</div>;
}

function PerfForm({ f, rowsDef = PERF_ROWS, lb = "ก่อน · Before", la = "หลัง · After" }) {
  return (
    <table className="ho-tbl">
      <thead>
        <tr><th className="n">ลำดับ<br />No.</th><th>รายละเอียด · Description</th><th className="rec" colSpan={2}>บันทึกผล · Result</th></tr>
        <tr className="ho-tbl-sub"><th /><th /><th>{lb}</th><th>{la}</th></tr>
      </thead>
      <tbody>
        {rowsDef.map(([label, kind], i) => {
          const v = (f.rows && f.rows[i]) || { b: "", a: "" };
          const cell = (side) => kind === "ck"
            ? <td className="ck">{v[side] ? <b className={v[side] === "bad" ? "ho-bad" : "ho-ok"}>{ckText(v[side])}</b> : ""}</td>
            : <td className="u">{v[side] ? `${v[side]} ${kind}` : ""}</td>;
          return <tr key={i}><td className="n">{i + 1}</td><td className="lbl">{label}</td>{cell("b")}{cell("a")}</tr>;
        })}
      </tbody>
    </table>
  );
}

// กริดรูปภาพในใบพิมพ์ — 4 รูป/แถว
function PhotoGrid({ title, urls }) {
  if (!urls || !urls.length) return null;
  return (
    <div style={{ marginTop: 6 }}>
      <div style={{ fontWeight: 700, fontSize: "0.92em", marginBottom: 3 }}>{title}</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "2%" }}>
        {urls.map((u, i) => <img key={i} src={u} alt="" style={{ width: "23.5%", aspectRatio: "4/3", objectFit: "cover", borderRadius: 6, border: "1px solid #d5dde8", marginBottom: 6, breakInside: "avoid" }} />)}
      </div>
    </div>
  );
}

function PmForm({ f }) {
  return (
    <table className="ho-tbl">
      <thead>
        <tr><th className="n">ลำดับ<br />No.</th><th>รายละเอียด · Description</th><th className="rec" colSpan={2}>บันทึกผล · Result</th></tr>
        <tr className="ho-tbl-sub"><th /><th /><th>ได้ทำ · Done</th><th>ไม่ได้ทำ · Not done</th></tr>
      </thead>
      <tbody>
        {PM_ROWS.map((label, i) => {
          const v = f.rows && f.rows[i];
          return <tr key={i}><td className="n">{i + 1}</td><td className="lbl">{label}</td>
            <td className="ck">{v === "done" ? <b className="ho-ok">✓</b> : ""}</td>
            <td className="ck">{v === "not" ? <b className="ho-bad">✕</b> : ""}</td></tr>;
        })}
      </tbody>
    </table>
  );
}

// ตรวจรับงานรวม (หลายเครื่อง) — ตารางเครื่อง + เมทริกซ์ ✓/✕ รายเครื่อง + ความเรียบร้อยรวม + สรุปผล
function AcceptForm({ f }) {
  const machines = f.machines || [];
  const n = machines.length;
  const passCnt = machines.filter((_, mi) => (f.rows || []).every((r) => r[mi] === "pass")).length;
  const failCnt = machines.filter((_, mi) => (f.rows || []).some((r) => r[mi] === "fail")).length;
  let gi = 0;
  return (
    <>
      <table className="ho-tbl" style={{ marginBottom: 6 }}>
        <thead><tr><th className="n">#</th><th>จุดติดตั้ง · Location</th><th>รหัส · Code</th><th>ประเภท · Type</th><th>ยี่ห้อ / รุ่น · Brand / Model</th><th>BTU</th><th>Serial</th></tr></thead>
        <tbody>
          {machines.map((m, mi) => (
            <tr key={mi}><td className="n">{mi + 1}</td><td className="lbl">{m.point || "-"}</td>
              <td className="lbl">{m.code || "-"}</td><td className="lbl">{m.type || "-"}</td>
              <td className="lbl">{[m.brand, m.model].filter(Boolean).join(" ") || "-"}</td>
              <td className="lbl">{m.btu || "-"}</td><td className="lbl">{m.serial || "-"}</td></tr>
          ))}
        </tbody>
      </table>
      <table className="ho-tbl">
        <thead><tr><th>รายการตรวจ · Inspection item</th>{machines.map((_, mi) => <th key={mi} style={{ width: 34, textAlign: "center" }}>{mi + 1}</th>)}</tr></thead>
        <tbody>
          {ACCEPT_GROUPS.map(([gname, rows]) => (
            <React.Fragment key={gname}>
              <tr><td colSpan={n + 1} style={{ background: "#eef4fb", fontWeight: 700, fontSize: "0.92em", padding: "2px 8px" }}>{gname}</td></tr>
              {rows.map((label) => { const ri = gi++; const note = (f.itemNotes || [])[ri]; return (
                <React.Fragment key={ri}>
                  <tr><td className="lbl">{label}</td>
                    {machines.map((_, mi) => { const v = f.rows?.[ri]?.[mi]; return (
                      <td key={mi} className="ck">{v === "pass" ? <b className="ho-ok">✓</b> : v === "fail" ? <b className="ho-bad">✕</b> : ""}</td>
                    ); })}
                  </tr>
                  {note ? <tr><td colSpan={n + 1} style={{ fontSize: "0.9em", color: "#b91c1c", padding: "0 8px 4px" }}>↳ {note}</td></tr> : null}
                </React.Fragment>
              ); })}
            </React.Fragment>
          ))}
          <tr><td colSpan={n + 1} style={{ background: "#eef4fb", fontWeight: 700, fontSize: "0.92em", padding: "2px 8px" }}>ความเรียบร้อยรวมทั้งงาน · Overall completion</td></tr>
          {ACCEPT_OVERALL.map((label, oi) => (
            <tr key={oi}><td className="lbl">{label}</td>
              <td className="ck" colSpan={n}>{(f.overall || [])[oi] ? <b className="ho-ok">✓ เรียบร้อย Done</b> : ""}</td></tr>
          ))}
        </tbody>
      </table>
      <div style={{ marginTop: 5, fontWeight: 700, fontSize: "0.95em", color: failCnt ? "#b91c1c" : "#0a6b3d" }}>
        ผลการตรวจรับ · Result: ผ่านครบ {passCnt}/{n} เครื่อง (Passed {passCnt}/{n} units){failCnt ? ` · มีข้อติดตามแก้ไข ${failCnt} เครื่อง (ตามหมายเหตุ · see notes)` : " — รับมอบงานเรียบร้อย · Work accepted"}
      </div>
    </>
  );
}

export default function JobHandover({ handover = {}, company = {} }) {
  const co = company || {};
  const h = handover || {};
  const works = h.work_types || [];
  const forms = h.forms || [];

  return (
    <div className="print-area">
      <div className="ho">
        {/* ── letterhead ── */}
        <div className="ho-head">
          <div className="ho-titlebox">
            <div className="ho-orig">ต้นฉบับ สำหรับลูกค้า · Original</div>
            <div className="ho-title">เอกสาร<br />ส่งมอบงาน</div>
            <div style={{ fontSize: "0.72em", fontWeight: 700, letterSpacing: ".06em", marginTop: 2 }}>JOB HANDOVER</div>
          </div>
          <div className="ho-co">
            <img src={co.logo_url || "/logo.png"} alt="" className="ho-logo" onError={(e) => { e.currentTarget.style.display = "none"; }} />
            <div className="ho-co-info">
              <div className="ho-co-name">{co.name || "บริษัทของคุณ จำกัด"}{co.branch ? ` (${co.branch})` : ""}</div>
              {co.address && <div className="ho-co-line">{co.address}</div>}
              {co.phone && <div className="ho-co-line">โทร {co.phone}</div>}
              {co.tax_id && <div className="ho-co-line">เลขประจำตัวผู้เสียภาษี {co.tax_id}</div>}
            </div>
          </div>
          <div className="ho-meta">
            <div className="ho-f"><span className="ho-f-l">เลขที่งาน JOB NO</span><span className="ho-f-v">{h.job_no || ""}</span></div>
            <div className="ho-f"><span className="ho-f-l">วันที่ · Date</span><span className="ho-f-v">{h.doc_date ? fmtDocDate(h.doc_date) : ""}</span></div>
            <div className="ho-f"><span className="ho-f-l">เอกสารอ้างอิง · Ref.</span><span className="ho-f-v">{h.doc_ref || ""}</span></div>
          </div>
        </div>

        {/* ── customer + work types ── */}
        <div className="ho-body">
          <div className="ho-col">
            <section className="ho-sec">
              <div className="ho-sec-h">ผู้รับบริการ · Customer</div>
              <div className="ho-sec-b">
                {h.customer_id ? <div className="ho-f"><span className="ho-f-l">รหัสลูกค้า · Code</span><span className="ho-f-v">{custCode(h.customer_id)}</span></div> : null}
                <div className="ho-f"><span className="ho-f-l">บริษัท / ชื่อ-สกุล · Name</span><span className="ho-f-v">{h.customer_name || ""}</span></div>
                <div className="ho-f"><span className="ho-f-l">ผู้ติดต่อ · Contact</span><span className="ho-f-v">{h.contact_name || ""}</span></div>
                <div className="ho-f"><span className="ho-f-l">เบอร์โทร · Phone</span><span className="ho-f-v">{h.contact_phone || ""}</span></div>
                <div className="ho-f"><span className="ho-f-l">ที่อยู่ · Address</span><span className="ho-f-v">{h.address || ""}</span></div>
              </div>
            </section>
          </div>
          <div className="ho-col">
            <section className="ho-sec">
              <div className="ho-sec-h">ประเภทงาน · Work Type</div>
              <div className="ho-sec-b ho-worktypes">
                {WORK_TYPES.map(([v, l]) => <label className="ho-cb" key={v}><Tick on={works.includes(v)} />{l}</label>)}
              </div>
            </section>
          </div>
        </div>

        {h.detail ? (
          <section className="ho-sec ho-sec-block">
            <div className="ho-sec-h">รายละเอียด / อาการเสีย / การสำรวจหน้างาน · Details / Symptoms</div>
            <div className="ho-sec-b"><div className="ho-details">{h.detail}</div></div>
          </section>
        ) : null}

        {/* ── each sub-form ── */}
        {forms.map((f, i) => {
          const title = f.kind === "accept" ? `ส่งมอบงานติดตั้ง · Installation Handover (ตรวจรับรวม ${f.machines?.length || 0} เครื่อง / ${f.machines?.length || 0} units)`
            : f.kind === "clean" ? `ส่งมอบงานล้าง · Cleaning Handover — เครื่องที่ ${i + 1} (Unit ${i + 1})`
            : f.kind === "repair" ? `ส่งมอบงานซ่อม · Repair Handover — เครื่องที่ ${i + 1} (Unit ${i + 1})`
            : `${f.kind === "pm" ? "การดำเนินการงาน · งานล้าง / PM · Cleaning / PM" : "การวัดประสิทธิภาพ · Performance Test"} — เครื่องที่ ${i + 1} (Unit ${i + 1})`;
          return (
            <section className="ho-sec ho-sec-block ho-form-print" key={i}>
              <div className="ho-sec-h">{title}</div>
              {f.kind !== "accept" && <div className="ho-form-machine"><MachineLine m={f.machine} /></div>}
              {f.kind === "accept" ? <>
                <AcceptForm f={f} />
                <PhotoGrid title={`รูปส่งมอบงาน · Handover photos (${(f.photos || []).length})`} urls={f.photos} />
              </> : f.kind === "clean" ? <>
                <div style={{ fontWeight: 700, fontSize: "0.92em", margin: "2px 0" }}>สิ่งที่ดำเนินการ (ล้าง / PM) · Work performed</div>
                <PmForm f={{ rows: f.acts || [] }} />
                <div style={{ fontWeight: 700, fontSize: "0.92em", margin: "6px 0 2px" }}>วัดผล ก่อนล้าง / หลังล้าง · Measurements before / after cleaning</div>
                <PerfForm f={f} rowsDef={CLEAN_ROWS} lb="ก่อนล้าง · Before" la="หลังล้าง · After" />
                <PhotoGrid title="รูปก่อนล้าง · Before cleaning" urls={f.photosBefore} />
                <PhotoGrid title="รูปหลังล้าง · After cleaning" urls={f.photosAfter} />
              </> : f.kind === "repair" ? <>
                <PerfForm f={f} rowsDef={REPAIR_ROWS} lb="ก่อนซ่อม · Before" la="หลังซ่อม · After" />
                {f.fix ? <div className="ho-form-note">สิ่งที่ตรวจพบ / ซ่อม / อะไหล่ที่เปลี่ยน · Findings / repairs / parts: {f.fix}</div> : null}
                <PhotoGrid title="รูปก่อนซ่อม · Before repair" urls={f.photosBefore} />
                <PhotoGrid title="รูปหลังซ่อม · After repair" urls={f.photosAfter} />
              </> : f.kind === "pm" ? <PmForm f={f} /> : <PerfForm f={f} />}
              {f.note ? <div className="ho-form-note">หมายเหตุ · Note: {f.note}</div> : null}
            </section>
          );
        })}

        {h.fix_note ? (
          <section className="ho-sec ho-sec-block">
            <div className="ho-sec-h">การแก้ไข / หมายเหตุอื่น ๆ · Remarks</div>
            <div className="ho-sec-b"><div className="ho-details">{h.fix_note}</div></div>
          </section>
        ) : null}

        {/* ── signatures ── */}
        <div className="ho-signs">
          <div className="ho-sign">
            {h.cust_sign_url ? <img className="ho-sign-img" src={h.cust_sign_url} alt="" /> : <div className="ho-sign-blank" />}
            <div className="ho-sign-lbl">{forms.some((f) => f.kind === "accept") ? "ผู้ตรวจสอบ/ผู้รับมอบงาน · Inspector / Receiver" : "ผู้รับบริการ · Customer"}{h.cust_name ? ` · ${h.cust_name}` : ""}</div>
          </div>
          <div className="ho-sign">
            {h.tech_sign_url ? <img className="ho-sign-img" src={h.tech_sign_url} alt="" /> : <div className="ho-sign-blank" />}
            <div className="ho-sign-lbl">ช่างผู้ให้บริการ · Service technician{h.tech_name ? ` · ${h.tech_name}` : ""}</div>
          </div>
        </div>
        <div className="ho-ack">ผู้รับบริการได้รับทราบ และยอมรับการดำเนินการดังกล่าวตามเอกสารข้างต้น · The customer acknowledges and accepts the work described above.</div>
      </div>
    </div>
  );
}
