import React from "react";

// Full A4 print document shared by BOQ / Quotation / Invoice / Receipt.
// The whole sheet is ONE <table>: the letterhead + customer + project + column headers live in
// <thead>, which the browser repeats at the top of EVERY printed page. Line items are real <tr>s
// in <tbody> so the table breaks across pages naturally (standard multi-page invoice technique).
//   children = the item <tr> rows (each with 6 <td>s)
//   totals   = the totals block (rendered as a full-width row after the items)
export default function DocSlip({ company = {}, titleTh, titleEn, docNo, metaRows = [], customer = {}, projectTitle, termsPayment, termsFreebies, termsWarranty, bank, paymentInfo, signLabels = [], children, totals }) {
  const co = company || {};
  return (
    <div className="print-area">
      <div className="doc">
        <table className="doc-sheet">
          <thead>
            <tr><td className="ds-head-cell" colSpan={6}>
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
            </td></tr>
            <tr className="doc-colhead">
              <th>#</th><th>รหัส</th><th>รายการ</th><th className="r">จำนวน</th><th className="r">หน่วยละ</th><th className="r">จำนวนเงิน</th>
            </tr>
          </thead>
          <tbody>
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
          </tbody>
        </table>
        {/* signatures sit OUTSIDE the table so they can be pushed to the bottom of the page */}
        <div className="doc-signs">
          {(signLabels.length ? signLabels : ["ผู้เสนอราคา", "ผู้อนุมัติ / ลูกค้า"]).map((s, i) => (
            <div className="doc-sign" key={i}>
              <div className="doc-sign-line" />
              <div className="doc-sign-label">{s}</div>
              <div className="doc-sign-date">วันที่ ......./......./.......</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
