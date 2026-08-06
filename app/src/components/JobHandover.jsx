import React from "react";
import { custCode, fmtDocDate } from "../lib/format";
import { PERF_ROWS, PM_ROWS, CLEAN_ROWS, REPAIR_ROWS, WORK_TYPES, AC_TYPES, ACCEPT_GROUPS, ACCEPT_OVERALL,
  INST_SECTIONS, INST_MEAS, WASH_SECTIONS, WASH_MEAS, FIX_SYMPTOMS, FIX_DIAG, FIX_REPAIR, FIX_MEAS, FIX_RESULTS, PMC_ACTS, PMC_REF, FORM_KINDS } from "../lib/handover";

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

// ── ใบพิมพ์ชุดใหม่: เช็คลิสต์ตามหมวด (รายการ | เกณฑ์ | ผ่าน | ไม่ผ่าน) ──
function PrintChecks({ sections, values, passLabel = "ผ่าน · Pass", failLabel = "ไม่ผ่าน · Fail" }) {
  return sections.map(([title, rows], si) => (
    <React.Fragment key={si}>
      <div style={{ fontWeight: 700, fontSize: "0.92em", margin: "5px 0 2px" }}>{title}</div>
      <table className="ho-tbl">
        <thead><tr><th className="n">#</th><th>รายการตรวจสอบ · Checklist item</th><th style={{ width: "22%" }}>เกณฑ์ · Standard</th><th style={{ width: 52 }}>{passLabel}</th><th style={{ width: 52 }}>{failLabel}</th></tr></thead>
        <tbody>
          {rows.map(([label, std], ri) => { const v = (values?.[si] || [])[ri]; return (
            <tr key={ri}><td className="n">{ri + 1}</td><td className="lbl">{label}</td>
              <td className="lbl" style={{ fontSize: "0.85em", color: "#64748b" }}>{std}</td>
              <td className="ck">{v === "pass" ? <b className="ho-ok">✓</b> : ""}</td>
              <td className="ck">{v === "fail" ? <b className="ho-bad">✕</b> : ""}</td></tr>
          ); })}
        </tbody>
      </table>
    </React.Fragment>
  ));
}
// ── ใบพิมพ์: ตารางค่าที่วัด (เดี่ยว หรือ ก่อน/หลัง) ──
function PrintMeas({ title, rows, values, beforeAfter, lb = "ก่อน · Before", la = "หลัง · After" }) {
  return (
    <>
      <div style={{ fontWeight: 700, fontSize: "0.92em", margin: "5px 0 2px" }}>{title}</div>
      <table className="ho-tbl">
        <thead><tr><th>ค่าที่วัด · Measurement</th><th style={{ width: 44 }}>หน่วย · Unit</th><th style={{ width: "24%" }}>ค่ามาตรฐาน · Standard</th>
          {beforeAfter ? <><th style={{ width: 70 }}>{lb}</th><th style={{ width: 70 }}>{la}</th></> : <th style={{ width: 100 }}>ค่าที่วัดได้ · Measured</th>}</tr></thead>
        <tbody>
          {rows.map(([label, unit, std], ri) => { const v = values?.[ri]; return (
            <tr key={ri}><td className="lbl">{label}</td><td className="lbl" style={{ textAlign: "center" }}>{unit}</td>
              <td className="lbl" style={{ fontSize: "0.85em", color: "#64748b" }}>{std}</td>
              {beforeAfter ? <><td className="u">{(v || {}).b || ""}</td><td className="u">{(v || {}).a || ""}</td></> : <td className="u">{v || ""}</td>}</tr>
          ); })}
        </tbody>
      </table>
    </>
  );
}
const InfoLine = ({ pairs }) => {
  const parts = pairs.filter(([, v]) => v).map(([l, v]) => `${l} ${v}`);
  return parts.length ? <div className="ho-mline">{parts.join("  ·  ")}</div> : null;
};

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
            {h.ho_no && <div className="ho-f"><span className="ho-f-l">เลขที่เอกสาร · No.</span><span className="ho-f-v">{h.ho_no}</span></div>}
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
          const meta = FORM_KINDS.find((k) => k.kind === f.kind);
          const title = f.kind === "accept" ? `ส่งมอบงานติดตั้ง · Installation Handover (ตรวจรับรวม ${f.machines?.length || 0} เครื่อง / ${f.machines?.length || 0} units)`
            : f.kind === "pmc" ? `${meta.label} (${f.machines?.length || 0} เครื่อง / units)`
            : ["inst", "wash", "fix"].includes(f.kind) ? `${meta.label} — เครื่องที่ ${i + 1} (Unit ${i + 1})`
            : f.kind === "clean" ? `ส่งมอบงานล้าง · Cleaning Handover — เครื่องที่ ${i + 1} (Unit ${i + 1})`
            : f.kind === "repair" ? `ส่งมอบงานซ่อม · Repair Handover — เครื่องที่ ${i + 1} (Unit ${i + 1})`
            : `${f.kind === "pm" ? "การดำเนินการงาน · งานล้าง / PM · Cleaning / PM" : "การวัดประสิทธิภาพ · Performance Test"} — เครื่องที่ ${i + 1} (Unit ${i + 1})`;
          return (
            <section className="ho-sec ho-sec-block ho-form-print" key={i}>
              <div className="ho-sec-h">{title}</div>
              {f.kind !== "accept" && f.kind !== "pmc" && <div className="ho-form-machine"><MachineLine m={f.machine} /></div>}
              {f.kind === "inst" ? <>
                <InfoLine pairs={[["ประเภทงาน · Job:", f.work_kind], ["น้ำยา · Refrig.:", f.refrigerant], ["S/N คอยล์ร้อน · Outdoor:", f.serial_out], ["ขนาดท่อ · Pipe:", f.pipe_size], ["ความยาวท่อ · Length:", f.pipe_len && `${f.pipe_len} ม./m`]]} />
                <PrintChecks sections={INST_SECTIONS} values={f.checks} />
                <PrintMeas title="ค่าที่วัดและบันทึก · Measurements" rows={INST_MEAS} values={f.meas} />
                <InfoLine pairs={[["รับประกันงานติดตั้ง · Install warranty:", f.warranty_install], ["รับประกันคอมเพรสเซอร์ · Compressor warranty:", f.warranty_comp]]} />
                <PhotoGrid title="รูปงานติดตั้ง/ส่งมอบ · Photos" urls={f.photos} />
              </> : f.kind === "wash" ? <>
                <InfoLine pairs={[["ประเภทงาน · Job:", f.work_kind], ["น้ำยา · Refrig.:", f.refrigerant], ["อายุการใช้งาน · Age:", f.age]]} />
                <PrintChecks sections={WASH_SECTIONS} values={f.checks} />
                <PrintMeas title="ค่าที่วัด ก่อน–หลังล้าง · Measurements before–after cleaning" rows={WASH_MEAS} values={f.meas} beforeAfter lb="ก่อนล้าง · Before" la="หลังล้าง · After" />
                {f.next_date ? <div className="ho-form-note">นัดล้างครั้งถัดไป · Next cleaning: {fmtDocDate(f.next_date)}</div> : null}
                <PhotoGrid title="รูปก่อนล้าง · Before cleaning" urls={f.photosBefore} />
                <PhotoGrid title="รูปหลังล้าง · After cleaning" urls={f.photosAfter} />
              </> : f.kind === "fix" ? <>
                <InfoLine pairs={[["น้ำยา · Refrig.:", f.refrigerant], ["งานในประกัน · Warranty job:", f.in_warranty === "yes" ? "ใช่ · Yes" : f.in_warranty === "no" ? "ไม่ใช่ · No" : ""]]} />
                <InfoLine pairs={[["อาการ · Symptoms:", [FIX_SYMPTOMS.filter((_, si) => (f.symptoms || [])[si]).join(", "), f.symptom_other].filter(Boolean).join(", ")]]} />
                {f.symptom_detail ? <div className="ho-form-note">รายละเอียดอาการ · Details: {f.symptom_detail}</div> : null}
                <PrintChecks sections={[["การวิเคราะห์และตรวจวินิจฉัย (Diagnosis)", FIX_DIAG]]} values={[f.diag || []]} />
                {f.rootcause ? <div className="ho-form-note">สาเหตุของปัญหา (Root cause): {f.rootcause}</div> : null}
                <PrintChecks sections={[["การซ่อม · Repair work", FIX_REPAIR]]} values={[f.rep || []]} />
                {(f.parts || []).some((p) => p.name) && (
                  <>
                    <div style={{ fontWeight: 700, fontSize: "0.92em", margin: "5px 0 2px" }}>รายการอะไหล่ / วัสดุที่ใช้ · Parts / materials used</div>
                    {/* ราคาโชว์บนใบลูกค้าเฉพาะเมื่อช่างติ๊ก show_price — ปกติซ่อน (ราคาจริงคิดที่ใบแจ้งหนี้) */}
                    <table className="ho-tbl">
                      <thead><tr><th className="n">#</th><th>รายการ · Item</th><th style={{ width: 60 }}>จำนวน · Qty</th>
                        {f.show_price && <><th style={{ width: 80 }}>ราคา/หน่วย · Price</th><th style={{ width: 80 }}>รวม · Total</th></>}</tr></thead>
                      <tbody>
                        {(f.parts || []).filter((p) => p.name).map((p, pi) => (
                          <tr key={pi}><td className="n">{pi + 1}</td><td className="lbl">{p.name}</td><td className="u">{p.qty || ""}</td>
                            {f.show_price && <><td className="u">{p.price ? Number(p.price).toLocaleString("en-US") : ""}</td>
                            <td className="u">{((Number(p.qty) || 0) * (Number(p.price) || 0)).toLocaleString("en-US")}</td></>}</tr>
                        ))}
                        {f.show_price && <tr><td colSpan={4} style={{ textAlign: "right", fontWeight: 700, padding: "2px 8px" }}>รวมค่าอะไหล่/วัสดุ · Parts total (฿)</td>
                          <td className="u" style={{ fontWeight: 700 }}>{(f.parts || []).reduce((a, p) => a + (Number(p.qty) || 0) * (Number(p.price) || 0), 0).toLocaleString("en-US")}</td></tr>}
                      </tbody>
                    </table>
                  </>
                )}
                <PrintMeas title="ค่าที่วัดหลังซ่อม · Post-repair measurements" rows={FIX_MEAS} values={f.meas} />
                <InfoLine pairs={[["ผลการซ่อม · Result:", (FIX_RESULTS.find(([v]) => v === f.result) || [])[1]], ["รับประกันงานซ่อม · Warranty:", f.warranty], ["นัดติดตามผล · Follow-up:", f.follow]]} />
                {f.advice ? <div className="ho-form-note">คำแนะนำ · Advice: {f.advice}</div> : null}
                <PhotoGrid title="รูปก่อนซ่อม · Before repair" urls={f.photosBefore} />
                <PhotoGrid title="รูปหลังซ่อม · After repair" urls={f.photosAfter} />
              </> : f.kind === "pmc" ? <>
                <InfoLine pairs={[["เลขที่สัญญา · Contract:", f.contract_no], ["รอบครั้งที่ · Visit:", f.round && `${f.round}${f.round_of ? " / " + f.round_of : ""}`], ["ความถี่ · Frequency:", f.freq], ["เวลาเข้า–ออก · Time:", f.time_in_out]]} />
                <div style={{ fontWeight: 700, fontSize: "0.92em", margin: "5px 0 2px" }}>ทะเบียนเครื่องและค่าที่วัด · Unit registry & readings</div>
                <table className="ho-tbl">
                  <thead><tr><th className="n">#</th><th>จุดติดตั้ง · Location</th><th>รหัส · Code</th><th>ยี่ห้อ · Brand</th><th>BTU</th><th style={{ width: 56 }}>ลมออก (°C)</th><th style={{ width: 48 }}>ΔT (°C)</th><th style={{ width: 48 }}>Amp</th><th>สภาพ · Condition</th></tr></thead>
                  <tbody>
                    {(f.machines || []).map((m, mi) => (
                      <tr key={mi}><td className="n">{mi + 1}</td><td className="lbl">{m.point || "-"}</td><td className="lbl">{m.code || "-"}</td>
                        <td className="lbl">{m.brand || "-"}</td><td className="lbl">{m.btu || "-"}</td>
                        <td className="u">{m.out || ""}</td><td className="u">{m.dt || ""}</td><td className="u">{m.amp || ""}</td><td className="lbl">{m.note || ""}</td></tr>
                    ))}
                  </tbody>
                </table>
                <div style={{ fontSize: "0.85em", color: "#64748b", margin: "2px 0" }}>{PMC_REF}</div>
                <PrintChecks sections={[["รายการบำรุงรักษาที่ดำเนินการ (ทุกเครื่อง) · Maintenance performed", PMC_ACTS]]} values={[f.acts || []]} failLabel="แก้ไข · Fixed" />
                {f.issues ? <div className="ho-form-note">ปัญหาที่พบ / ข้อเสนอ · Issues / recommendations: {f.issues}</div> : null}
                <InfoLine pairs={[["สรุปผลรอบนี้ · Summary:", f.summary === "ok" ? "ทุกเครื่องปกติ · All units normal" : f.summary === "fix" ? "มีเครื่องต้องแก้ไข · Some units need repair" : ""], ["นัดรอบถัดไป · Next visit:", f.next_date && fmtDocDate(f.next_date)], ["เสนอราคางานเพิ่ม · Extra-work quote:", f.extra_quote === "yes" ? "มี · Yes" : f.extra_quote === "no" ? "ไม่มี · No" : ""]]} />
                <PhotoGrid title="รูปประกอบ · Photos" urls={f.photos} />
              </> : f.kind === "accept" ? <>
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
