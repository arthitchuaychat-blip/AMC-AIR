import React from "react";

// Full A4 print document shared by Quotation & BOQ:
// company letterhead → doc meta → customer block → {children: table+totals} → terms/bank → signatures.
export default function DocSlip({ company = {}, titleTh, titleEn, docNo, metaRows = [], customer = {}, projectTitle, terms, bank, paymentInfo, signLabels = [], children }) {
  const co = company || {};
  return (
    <div className="print-area">
      <div className="doc">
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
            <table className="doc-meta-tbl"><tbody>
              <tr><td>เลขที่</td><td><b>{docNo || "-"}</b></td></tr>
              {metaRows.map((m, i) => <tr key={i}><td>{m.label}</td><td><b>{m.value || "-"}</b></td></tr>)}
            </tbody></table>
          </div>
        </div>

        <div className="doc-cust">
          <div className="doc-cust-l">ลูกค้า</div>
          <div className="doc-cust-r">
            <div className="doc-cust-name">{customer.name || "-"}{customer.code ? `  (รหัส ${customer.code})` : ""}</div>
            {customer.address && <div className="doc-cust-line">{customer.address}</div>}
            <div className="doc-cust-line">
              {customer.taxId ? <>เลขประจำตัวผู้เสียภาษี {customer.taxId}</> : null}
              {customer.contactName || customer.contactPhone ? <>{customer.taxId ? " · " : ""}ผู้ติดต่อ {customer.contactName || ""}{customer.contactPhone ? ` ${customer.contactPhone}` : ""}</> : null}
            </div>
            {customer.mapUrl && <div className="doc-cust-line">📍 หมุดแผนที่: <a href={customer.mapUrl} target="_blank" rel="noreferrer">เปิดแผนที่ (Google Maps)</a></div>}
          </div>
        </div>

        {projectTitle && <div className="doc-project"><span>ชื่องาน</span> {projectTitle}</div>}

        {children}

        <div className="doc-foot">
          <div className="doc-terms">
            {paymentInfo && <div className="doc-terms-box"><div className="doc-terms-title">การชำระเงิน</div><div className="doc-terms-body">{paymentInfo}</div></div>}
            {terms && <div className="doc-terms-box"><div className="doc-terms-title">เงื่อนไข</div><div className="doc-terms-body">{terms}</div></div>}
            {bank && <div className="doc-terms-box"><div className="doc-terms-title">ชำระเงินผ่านบัญชี</div><div className="doc-terms-body">{bank}</div></div>}
          </div>
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
    </div>
  );
}
