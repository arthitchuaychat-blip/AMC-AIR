import React from "react";
import { custCode, fmtDocDate } from "../lib/format";
import { PERF_ROWS, PM_ROWS, WORK_TYPES, AC_TYPES } from "../lib/handover";

// Printed/PDF A4 sheet of a SAVED handover (filled in by the technician). Renders the header, the
// ticked work-types, every sub-form (perf measurement / PM checklist) with the recorded values, and
// both signatures. Multiple forms flow onto extra A4 pages via native print pagination.

const ckText = (v) => (v === "ok" ? "ปกติ" : v === "bad" ? "ไม่ปกติ" : "");
const Tick = ({ on }) => <i className={"ho-cb-box" + (on ? " on" : "")} />;

function MachineLine({ m = {} }) {
  const parts = [
    m.code && `รหัส ${m.code}`, m.type, m.brand && `ยี่ห้อ ${m.brand}`, m.model && `รุ่น ${m.model}`,
    m.btu && `${m.btu} BTU`, m.building && `อาคาร ${m.building}`, m.floor && `ชั้น ${m.floor}`, m.room && `ห้อง ${m.room}`,
  ].filter(Boolean);
  return <div className="ho-mline">{parts.length ? parts.join("  ·  ") : "— ไม่ระบุข้อมูลเครื่อง —"}</div>;
}

function PerfForm({ f }) {
  return (
    <table className="ho-tbl">
      <thead>
        <tr><th className="n">ลำดับ</th><th>รายละเอียด</th><th className="rec" colSpan={2}>บันทึกผล</th></tr>
        <tr className="ho-tbl-sub"><th /><th /><th>ก่อน</th><th>หลัง</th></tr>
      </thead>
      <tbody>
        {PERF_ROWS.map(([label, kind], i) => {
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

function PmForm({ f }) {
  return (
    <table className="ho-tbl">
      <thead>
        <tr><th className="n">ลำดับ</th><th>รายละเอียด</th><th className="rec" colSpan={2}>บันทึกผล</th></tr>
        <tr className="ho-tbl-sub"><th /><th /><th>ได้ทำ</th><th>ไม่ได้ทำ</th></tr>
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
            <div className="ho-orig">ต้นฉบับ สำหรับลูกค้า</div>
            <div className="ho-title">เอกสาร<br />ส่งมอบงาน</div>
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
            <div className="ho-f"><span className="ho-f-l">วันที่</span><span className="ho-f-v">{h.doc_date ? fmtDocDate(h.doc_date) : ""}</span></div>
            <div className="ho-f"><span className="ho-f-l">เอกสารอ้างอิง</span><span className="ho-f-v">{h.doc_ref || ""}</span></div>
          </div>
        </div>

        {/* ── customer + work types ── */}
        <div className="ho-body">
          <div className="ho-col">
            <section className="ho-sec">
              <div className="ho-sec-h">ผู้รับบริการ</div>
              <div className="ho-sec-b">
                {h.customer_id ? <div className="ho-f"><span className="ho-f-l">รหัสลูกค้า</span><span className="ho-f-v">{custCode(h.customer_id)}</span></div> : null}
                <div className="ho-f"><span className="ho-f-l">บริษัท / ชื่อ-สกุล</span><span className="ho-f-v">{h.customer_name || ""}</span></div>
                <div className="ho-f"><span className="ho-f-l">ผู้ติดต่อ</span><span className="ho-f-v">{h.contact_name || ""}</span></div>
                <div className="ho-f"><span className="ho-f-l">เบอร์โทร</span><span className="ho-f-v">{h.contact_phone || ""}</span></div>
                <div className="ho-f"><span className="ho-f-l">ที่อยู่</span><span className="ho-f-v">{h.address || ""}</span></div>
              </div>
            </section>
          </div>
          <div className="ho-col">
            <section className="ho-sec">
              <div className="ho-sec-h">ประเภทงาน</div>
              <div className="ho-sec-b ho-worktypes">
                {WORK_TYPES.map(([v, l]) => <label className="ho-cb" key={v}><Tick on={works.includes(v)} />{l}</label>)}
              </div>
            </section>
          </div>
        </div>

        {h.detail ? (
          <section className="ho-sec ho-sec-block">
            <div className="ho-sec-h">รายละเอียด / อาการเสีย / การสำรวจหน้างาน</div>
            <div className="ho-sec-b"><div className="ho-details">{h.detail}</div></div>
          </section>
        ) : null}

        {/* ── each sub-form ── */}
        {forms.map((f, i) => (
          <section className="ho-sec ho-sec-block ho-form-print" key={i}>
            <div className="ho-sec-h">{f.kind === "pm" ? "การดำเนินการงาน · งานล้าง / PM" : "การวัดประสิทธิภาพ"} · เครื่องที่ {i + 1}</div>
            <div className="ho-form-machine"><MachineLine m={f.machine} /></div>
            {f.kind === "pm" ? <PmForm f={f} /> : <PerfForm f={f} />}
            {f.note ? <div className="ho-form-note">หมายเหตุ: {f.note}</div> : null}
          </section>
        ))}

        {h.fix_note ? (
          <section className="ho-sec ho-sec-block">
            <div className="ho-sec-h">การแก้ไข / หมายเหตุอื่น ๆ</div>
            <div className="ho-sec-b"><div className="ho-details">{h.fix_note}</div></div>
          </section>
        ) : null}

        {/* ── signatures ── */}
        <div className="ho-signs">
          <div className="ho-sign">
            {h.cust_sign_url ? <img className="ho-sign-img" src={h.cust_sign_url} alt="" /> : <div className="ho-sign-blank" />}
            <div className="ho-sign-lbl">ผู้รับบริการ{h.cust_name ? ` · ${h.cust_name}` : ""}</div>
          </div>
          <div className="ho-sign">
            {h.tech_sign_url ? <img className="ho-sign-img" src={h.tech_sign_url} alt="" /> : <div className="ho-sign-blank" />}
            <div className="ho-sign-lbl">ช่างผู้ให้บริการ{h.tech_name ? ` · ${h.tech_name}` : ""}</div>
          </div>
        </div>
        <div className="ho-ack">ผู้รับบริการได้รับทราบ และยอมรับการดำเนินการดังกล่าวตามเอกสารข้างต้น</div>
      </div>
    </div>
  );
}
