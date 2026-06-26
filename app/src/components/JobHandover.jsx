import React from "react";
import { custCode, fmtDocDate } from "../lib/format";

// A4 service-handover sheet (ใบส่งมอบงาน) printed/PDF'd from a job order.
// Header + customer + work-type are pre-filled from the job; the measurement table and PM
// checklist print blank for the technician to fill in by hand on-site.

// การวัดประสิทธิภาพ — [label, kind] · kind: "ck" = ปกติ/ไม่ปกติ, or a unit string written by hand
const PERF = [
  ["มอเตอร์พัดลมคอยล์เย็น (FCU)", "ck"],
  ["สัญญาณไฟหน้าเครื่องคอยล์เย็น", "ck"],
  ["มอเตอร์บานสวิง บน-ล่าง", "ck"],
  ["มอเตอร์บานสวิง ซ้าย-ขวา", "ck"],
  ["แรงลมหน้าคอยล์เย็น (FCU)", "Km/h"],
  ["อุณหภูมิลมส่งคอยล์เย็น (FCU)", "°C"],
  ["อุณหภูมิลมกลับคอยล์เย็น (FCU)", "°C"],
  ["มอเตอร์พัดลมคอยล์ร้อน (CDU)", "ck"],
  ["อุณหภูมิลมส่งคอยล์ร้อน (CDU)", "°C"],
  ["อุณหภูมิลมกลับคอยล์ร้อน (CDU)", "°C"],
  ["กระแสไฟฟ้า", "A"],
  ["แรงดันไฟฟ้า", "V"],
  ["แรงดันน้ำยาด้านดูด", "PSI"],
  ["การทำงานของคอมเพรสเซอร์", "ck"],
];

// การดำเนินการงาน งานล้าง/PM — ได้ทำ/ไม่ได้ทำ
const PM = [
  "ถอดอุปกรณ์แยกชิ้นส่วน (FCU) ล้างทำความสะอาด",
  "ถอดแผ่นกรองอากาศ FILTER ล้างทำความสะอาด",
  "ถอด BLOWER ล้างทำความสะอาด",
  "อัดฉีดท่อน้ำทิ้งไล่เมือกตะกรัน",
  "ล้างทำความสะอาดฟินคอยล์เย็น (EVAP COIL INDOOR UNIT)",
  "ล้างทำความสะอาดฟินคอยล์ร้อน (CONDENSER COIL OUTDOOR UNIT)",
  "เช็ครั่วเซอร์วิสวาล์ว",
  "วัดแรงดันน้ำยา (สารทำความเย็น)",
  "ตรวจสอบมอเตอร์พัดลมคอยล์เย็น",
  "ตรวจสอบมอเตอร์พัดลมคอยล์ร้อน",
  "ตรวจสอบแรงดันไฟ และ กระแสไฟ",
  "ตรวจสอบวงจรควบคุมอุณหภูมิ รีโมท และสวิตช์เบรกเกอร์เปิดปิด",
  "ตรวจสอบการทำงานของคอมเพรสเซอร์",
  "ตรวจสอบประสิทธิภาพโดยรวมเครื่องปรับอากาศ",
  "เช็คความแน่น นอต สกรู",
];

// job_type → which ประเภทงาน box is ticked
const workTicks = (t) => ({
  install: t === "install",
  maintenance: t === "maintenance",
  move: false,
  repair: t === "repair",
  surveyInstall: t === "survey",
  surveyRepair: false,
  other: t === "other",
});

const Box = ({ on }) => <i className={"ho-cb-box" + (on ? " on" : "")} />;
const Radio = () => <span className="ho-radio" />;

// a labelled write-in field: label then a dotted underline holding the (optional) pre-filled value
function F({ label, value, grow }) {
  return (
    <div className={"ho-f" + (grow ? " grow" : "")}>
      <span className="ho-f-l">{label}</span>
      <span className="ho-f-v">{value || ""}</span>
    </div>
  );
}

export default function JobHandover({ job = {}, company = {} }) {
  const co = company || {};
  const w = workTicks(job.job_type);
  // schedule date: first visit's date, else the job's scheduled_at
  const schedAt = (job.visits && job.visits.length && job.visits[0].scheduled_at) || job.scheduled_at;
  const dateStr = schedAt ? fmtDocDate(schedAt) : "";
  const phone = job.contact_phone || "";

  return (
    <div className="print-area">
      <div className="ho">
        {/* ── letterhead ───────────────────────────────────────────── */}
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
            <F label="เลขที่งาน JOB NO" value={job.job_no} />
            <F label="วันที่" value={dateStr} />
            <F label="เอกสารอ้างอิง" value={job.quote_no} />
          </div>
        </div>

        {/* ── two-column body ──────────────────────────────────────── */}
        <div className="ho-body">
          {/* LEFT */}
          <div className="ho-col">
            <section className="ho-sec">
              <div className="ho-sec-h">ผู้รับบริการ</div>
              <div className="ho-sec-b">
                <F label="รหัสลูกค้า" value={job.customer_id ? custCode(job.customer_id) : ""} />
                <F label="บริษัท / ชื่อ-สกุล" value={job.customerName} />
                <F label="ผู้ติดต่อ" value={job.contact_name} />
                <F label="เบอร์โทร" value={phone} />
                <F label="ที่อยู่" value={job.address} />
                <div className="ho-blank-line" />
              </div>
            </section>

            <section className="ho-sec">
              <div className="ho-sec-h">สินค้า / บริการ</div>
              <div className="ho-sec-b ho-svc">
                <div className="ho-svc-col">
                  <div className="ho-svc-cap">ประเภทงาน</div>
                  <label className="ho-cb"><Box on={w.install} />ติดตั้ง</label>
                  <label className="ho-cb"><Box on={w.maintenance} />ล้าง</label>
                  <label className="ho-cb"><Box on={w.move} />ย้าย</label>
                  <label className="ho-cb"><Box on={w.repair} />ซ่อม</label>
                  <label className="ho-cb"><Box on={w.surveyInstall} />สำรวจงานติดตั้ง</label>
                  <label className="ho-cb"><Box on={w.surveyRepair} />สำรวจงานซ่อม</label>
                  <label className="ho-cb"><Box on={w.other} />อื่น ๆ</label>
                </div>
                <div className="ho-svc-col">
                  <div className="ho-svc-cap">ประเภทเครื่องปรับอากาศ</div>
                  <label className="ho-cb"><Box />ติดผนัง</label>
                  <label className="ho-cb"><Box />แขวน</label>
                  <label className="ho-cb"><Box />ฝังฝ้า</label>
                  <label className="ho-cb"><Box />เปลือย</label>
                  <F label="รหัสประจำเครื่อง" />
                  <F label="อาคาร" />
                  <F label="ชั้น" />
                  <F label="ห้อง" />
                  <F label="ยี่ห้อ" />
                  <F label="รุ่น" />
                  <F label="ขนาด (BTU)" />
                </div>
              </div>
            </section>

            <section className="ho-sec">
              <div className="ho-sec-h">รายละเอียดสินค้า / บริการ / อาการเสีย / การสำรวจหน้างาน</div>
              <div className="ho-sec-b">
                {job.details ? <div className="ho-details">{job.details}</div> : null}
                <div className="ho-blank-line" /><div className="ho-blank-line" />
                <div className="ho-blank-line" /><div className="ho-blank-line" />
              </div>
            </section>

            <section className="ho-sec">
              <div className="ho-sec-h">การแก้ไข / หมายเหตุอื่น ๆ</div>
              <div className="ho-sec-b">
                <div className="ho-blank-line" /><div className="ho-blank-line" /><div className="ho-blank-line" />
              </div>
            </section>
          </div>

          {/* RIGHT */}
          <div className="ho-col">
            <section className="ho-sec">
              <div className="ho-sec-h">การวัดประสิทธิภาพ</div>
              <table className="ho-tbl">
                <thead>
                  <tr><th className="n">ลำดับ</th><th>รายละเอียด</th><th className="rec" colSpan={2}>บันทึกผล</th></tr>
                  <tr className="ho-tbl-sub"><th /><th /><th>ก่อน</th><th>หลัง</th></tr>
                </thead>
                <tbody>
                  {PERF.map(([label, kind], i) => (
                    <tr key={i}>
                      <td className="n">{i + 1}</td>
                      <td className="lbl">{label}</td>
                      {kind === "ck"
                        ? <><td className="ck"><Radio />ปกติ <Radio />ไม่ปกติ</td><td className="ck"><Radio />ปกติ <Radio />ไม่ปกติ</td></>
                        : <><td className="u">{kind}</td><td className="u">{kind}</td></>}
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="ho-note-line"><span>หมายเหตุ</span></div>
            </section>

            <section className="ho-sec">
              <div className="ho-sec-h">การดำเนินการงาน · งานล้าง / PM</div>
              <table className="ho-tbl">
                <thead>
                  <tr><th className="n">ลำดับ</th><th>รายละเอียด</th><th className="rec" colSpan={2}>บันทึกผล</th></tr>
                  <tr className="ho-tbl-sub"><th /><th /><th>ได้ทำ</th><th>ไม่ได้ทำ</th></tr>
                </thead>
                <tbody>
                  {PM.map((label, i) => (
                    <tr key={i}>
                      <td className="n">{i + 1}</td>
                      <td className="lbl">{label}</td>
                      <td className="ck"><Radio /></td>
                      <td className="ck"><Radio /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          </div>
        </div>

        {/* ── signatures ───────────────────────────────────────────── */}
        <div className="ho-signs">
          <div className="ho-sign">
            <div className="ho-sign-line" />
            <div className="ho-sign-lbl">ลงชื่อ ......................................... ผู้รับบริการ</div>
            <div className="ho-sign-paren">( ......................................... )</div>
          </div>
          <div className="ho-sign">
            <div className="ho-sign-line" />
            <div className="ho-sign-lbl">ลงชื่อ ......................................... ช่างผู้ให้บริการ</div>
            <div className="ho-sign-paren">( ......................................... )</div>
          </div>
        </div>
        <div className="ho-ack">ผู้รับบริการได้รับทราบ และยอมรับการดำเนินการดังกล่าวตามเอกสารข้างต้น</div>
      </div>
    </div>
  );
}
