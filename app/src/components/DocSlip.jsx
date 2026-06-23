import React from "react";

// Full A4 print document shared by BOQ / Quotation / Invoice / Receipt.
//
// Repeating header on every page: Chrome does NOT reliably repeat a <thead> when the table sits in
// a styled container, so instead the letterhead + customer + project + column headers live in a
// .doc-running block that printDoc.js turns into position:fixed (it then prints at the top of EVERY
// page). The line items are a separate .doc-sheet table; printDoc.js reserves a top page-margin equal
// to the measured header height so the body never overlaps the fixed header.
//
// The running header's column strip and the body table share the SAME <colgroup>, so their columns
// line up exactly.
//   children = the item <tr> rows (each with 6 <td>s)
//   totals   = the totals block (rendered as a full-width row after the items)

// shared column widths — content area is A4 minus side margins (≈186mm); รายการ (col 3) takes the rest
const COL_W = ["8mm", "30mm", null, "15mm", "23mm", "27mm"];
const ColGroup = () => (
  <colgroup>{COL_W.map((w, i) => <col key={i} style={w ? { width: w } : undefined} />)}</colgroup>
);

// the issuing officer's signature is opt-in per device: set + toggled on the Attendance page,
// remembered in localStorage so every printed DocSlip picks it up automatically when enabled.
function officerSign() {
  try {
    if (typeof localStorage === "undefined" || localStorage.getItem("amc_sign_on") !== "1") return null;
    const url = localStorage.getItem("amc_sign_url");
    return url ? { url, name: localStorage.getItem("amc_sign_name") || "" } : null;
  } catch { return null; }
}

export default function DocSlip({ company = {}, titleTh, titleEn, docNo, metaRows = [], customer = {}, projectTitle, termsPayment, termsFreebies, termsWarranty, bank, paymentInfo, signLabels = [], children, totals }) {
  const co = company || {};
  const sign = officerSign();
  return (
    <div className="print-area">
      <div className="doc">
        {/* repeating header (printDoc.js makes this position:fixed on every page) */}
        <div className="doc-running">
          <div className="doc-head">
            <div className="doc-co">
              <img src={co.logo_url || "/logo.png"} alt="" className="doc-logo" onError={(e) => { e.currentTarget.style.display = "none"; }} />
              <div>
                <div className="doc-co-name">{co.name || "บริษัทของคุณ จำกัด"}{co.branch ? ` (${co.branch})` : ""}</div>
                {co.address && <div className="doc-co-line">{co.address}</div>}
                <div className="doc-co-line">
                  {co.tax_id ? <>เลขประจำตัวผู้เสียภาษี {co.tax_id}</> : null}
                  {co.phone ? <>{co.tax_id ? " · " : ""}โทร {co.phone}</> : null}
                </div>
                {(co.email || co.website) && <div className="doc-co-line">{[co.email, co.website].filter(Boolean).join(" · ")}</div>}
              </div>
            </div>
            <div className="doc-meta">
              <div className="doc-title">{titleTh}</div>
              {titleEn && <div className="doc-title-en">{titleEn}</div>}
            </div>
          </div>

          <div className="doc-band">
            <div className="doc-cust">
              <div className="doc-cust-l">ลูกค้า</div>
              <div className="doc-cust-r">
                <div className="doc-cust-name">{customer.name || "-"}{customer.code ? `  (รหัส ${customer.code})` : ""}</div>
                {customer.address && <div className="doc-cust-line">{customer.address}</div>}
                <div className="doc-cust-line">
                  {customer.taxId ? <>เลขประจำตัวผู้เสียภาษี {customer.taxId}</> : null}
                  {customer.contactName || customer.contactPhone ? <>{customer.taxId ? " · " : ""}ผู้ติดต่อ {customer.contactName || ""}{customer.contactPhone ? ` ${customer.contactPhone}` : ""}</> : null}
                </div>
              </div>
            </div>
            <div className="doc-bandmeta">
              <table className="doc-meta-tbl"><tbody>
                <tr><td>เลขที่</td><td><b>{docNo || "-"}</b></td></tr>
                {metaRows.map((m, i) => <tr key={i}><td>{m.label}</td><td><b>{m.value || "-"}</b></td></tr>)}
              </tbody></table>
            </div>
          </div>

          {projectTitle && <div className="doc-project"><span>ชื่องาน</span> {projectTitle}</div>}

          {/* column-header strip — shares the colgroup with the body so columns align */}
          <table className="doc-colstrip"><ColGroup /><tbody>
            <tr className="doc-colhead">
              <th>#</th><th>รหัส</th><th>รายการ</th><th className="r">จำนวน</th><th className="r">หน่วยละ</th><th className="r">จำนวนเงิน</th>
            </tr>
          </tbody></table>
        </div>

        {/* body: line items + totals + terms */}
        <table className="doc-sheet"><ColGroup /><tbody>
          {children}
          {totals && <tr className="ds-full ds-totals"><td colSpan={6}>{totals}</td></tr>}
          <tr className="ds-full"><td colSpan={6}>
            <div className="doc-terms">
              {paymentInfo && <div className="doc-terms-box"><div className="doc-terms-title">การชำระเงิน</div><div className="doc-terms-body">{paymentInfo}</div></div>}
              {termsPayment && <div className="doc-terms-box"><div className="doc-terms-title">เงื่อนไขการชำระเงิน</div><div className="doc-terms-body">{termsPayment}</div></div>}
              {termsFreebies && <div className="doc-terms-box"><div className="doc-terms-title">ชุดวัสดุแถมมาตรฐาน</div><div className="doc-terms-body">{termsFreebies}</div></div>}
              {termsWarranty && <div className="doc-terms-box"><div className="doc-terms-title">การรับประกัน</div><div className="doc-terms-body">{termsWarranty}</div></div>}
              {bank && <div className="doc-terms-box"><div className="doc-terms-title">ชำระเงินผ่านบัญชี</div><div className="doc-terms-body">{bank}</div></div>}
            </div>
          </td></tr>
        </tbody></table>

        <div className="doc-signs">
          {(signLabels.length ? signLabels : ["ผู้เสนอราคา", "ผู้อนุมัติ / ลูกค้า"]).map((s, i) => (
            <div className="doc-sign" key={i}>
              {i === 0 && sign && <img className="doc-sign-img" src={sign.url} alt="" />}
              <div className="doc-sign-line" />
              <div className="doc-sign-label">{s}{i === 0 && sign && sign.name ? ` · ${sign.name}` : ""}</div>
              <div className="doc-sign-date">วันที่ ......./......./.......</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
