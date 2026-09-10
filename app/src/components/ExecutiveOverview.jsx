import React from "react";
import { can } from "../lib/permissions";
import { fmtBaht, fmtNum, inRange } from "../lib/format";
import { cashAccounts, cashAccountTotal } from "../lib/reportMetrics";
import { UIcon } from "../icons";
import ReportChart from "./ReportChart";

function Metric({ label, value, sub, hero, onClick, children }) {
  return <section className={"stat-card dash-stat executive-metric" + (hero ? " dash-stat--hero" : "")}>
    <div className="stat-label">{label}</div><div className="stat-val">{value}</div><div className="stat-sub">{sub}</div>{children}
    {onClick && <button type="button" className="executive-link" onClick={onClick}>ดูรายละเอียด <UIcon name="chevR" size={14} /></button>}
  </section>;
}

export default function ExecutiveOverview({ role, ov, quotes, stats, act, accounts, accountError, actionError, stockError, stockLoading, low, from, to, periodLabel, airRows, stockReady, onDocs, onGo, onTab, onAir, onRetry }) {
  const [entity, setEntity] = React.useState("all");
  const today = new Date().toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" });
  const selectedAccounts = cashAccounts(accounts, entity);
  const buckets = React.useMemo(() => {
    const by = {};
    (quotes || []).filter((q) => q.status === "approved" && inRange(q.approved_at || q.issue_date, from, to)).forEach((q) => {
      const key = (q.approved_at || q.issue_date || "").slice(0, 7); if (!key) return;
      const b = by[key] || (by[key] = { key, label: new Date(key + "-01T00:00:00").toLocaleDateString("th-TH", { month: "short", year: "2-digit" }), sale: 0 });
      b.sale += Number(q.afterDisc) || 0;
    });
    return Object.values(by).sort((a, b) => a.key.localeCompare(b.key));
  }, [quotes, from, to]);
  const airSorted = [...(Array.isArray(airRows) ? airRows : [])].sort((a, b) => b.qty - a.qty);
  const airCount = airSorted.reduce((sum, r) => sum + r.qty, 0);
  const financial = can(role, "cashflow");
  const errors = [accountError && "ยอดบัญชี", actionError && "งานค้าง", stockError && "คลังสินค้า"].filter(Boolean);
  const actions = [
    can(role, "receivables") && { icon: "clipboard", title: "ติดตามรับเงิน", value: act ? `${fmtNum(act.unpaidCount)} ใบ` : "…", sub: act ? `เกินกำหนด ${fmtNum(act.overdueCount)} ใบ · ณ ${today}` : "กำลังตรวจรายการ", go: () => onGo?.("receivables"), urgent: act?.overdueCount > 0 },
    can(role, "expenses") && { icon: "withdraw", title: "เบิกจ่ายรออนุมัติ", value: act ? `${fmtNum(act.pendingExpenseCount)} คำขอ` : "…", sub: act ? fmtBaht(act.pendingExpenseSum) : "กำลังตรวจรายการ", go: () => onGo?.("expenses") },
    can(role, "po") && { icon: "purchase", title: "สั่งซื้อรอรับของ", value: act ? `${fmtNum(act.poOpenCount)} ใบ` : "…", sub: "เปิดรายการและตรวจวันรับของ", go: () => onGo?.("po") },
    can(role, "catalog") && { icon: "box", title: "ของต่ำกว่าขั้นต่ำ", value: stockReady ? `${fmtNum(low.length)} รายการ` : "…", sub: "ตรวจสต๊อกปัจจุบันและเตรียมจัดซื้อ", go: () => onTab("inv"), urgent: stockReady && low.length > 0 },
  ].filter(Boolean);
  return <div className="executive-overview">
    {errors.length > 0 && <div className="report-warning" role="alert">โหลดข้อมูลไม่ครบ: {errors.join(" · ")} <button className="btn-ghost sm" onClick={onRetry}>ลองใหม่</button></div>}
    <div className="executive-kpis">
      <Metric hero label="ยอดขายอนุมัติ · ก่อน VAT" value={ov ? fmtBaht(stats.sale) : "…"} sub={`${periodLabel} · ${ov ? fmtNum(stats.count) : "…"} ใบ${stockReady && ov ? ` · แอร์ ${fmtNum(airCount)} เครื่อง/ชุดตามรายการ` : ""}`} onClick={() => onDocs("q_all")} />
      {financial && <Metric label="เงินสดและธนาคาร" value={accounts ? fmtBaht(cashAccountTotal(accounts, entity)) : accountError ? "โหลดไม่สำเร็จ" : "…"} sub={`ณ ${today} · ${selectedAccounts.length} บัญชี · ไม่รวมค้างรับ`} onClick={() => onGo?.("expenses")}>
        <label className="executive-account-filter">เฉพาะยอดบัญชี<select className="inp" aria-label="กิจการเฉพาะยอดเงินสดและธนาคาร" value={entity} onChange={(e) => setEntity(e.target.value)}><option value="all">ทุกกิจการ</option><option value="company">บริษัท</option><option value="personal">บุคคล</option></select></label>
      </Metric>}
      {can(role, "receivables") && <Metric label="เงินค้างรับตามใบแจ้งหนี้" value={act ? fmtBaht(act.receivable) : actionError ? "โหลดไม่สำเร็จ" : "…"} sub={`ยอดปัจจุบันทั้งระบบ · เกินกำหนด ${act ? fmtNum(act.overdueCount) : "…"} ใบ`} onClick={() => onGo?.("receivables")} />}
      {can(role, "profit") && <Metric label="กำไรประมาณการ BOQ" value={ov ? stats.covered ? fmtBaht(stats.est) : "ต้นทุนยังไม่ครบ" : "…"} sub={`${periodLabel} · มีต้นทุน ${stats.covered || 0}/${stats.count} ใบ · เฉพาะใบที่มีต้นทุน`} onClick={() => onDocs("est")} />}
    </div>
    <section className="card executive-actions"><div className="sec-head"><div><div className="sec-title">ต้องจัดการ</div><div className="sec-sub">สถานะปัจจุบันทั้งระบบ · ไม่ขึ้นกับช่วงวันที่หรือพนักงานที่เลือก</div></div></div>
      <div className="executive-action-grid">{actions.map((a) => <button type="button" key={a.title} className={"executive-action" + (a.urgent ? " urgent" : "")} onClick={a.go}><span className="executive-action-title"><UIcon name={a.icon} size={18} />{a.title}</span><strong>{a.value}</strong><span>{a.sub}</span><span className="executive-link">เปิดรายการ →</span></button>)}</div>
    </section>
    <div className="executive-panels">
      <section className="card"><div className="sec-head"><div><div className="sec-title">แนวโน้มยอดขาย</div><div className="sec-sub">{periodLabel} · ตามวันอนุมัติ · ยอดก่อน VAT · งวดที่ยังไม่ครบแสดงถึงวันที่เลือก</div></div><button className="btn-ghost sm" onClick={() => onTab("trend")}>รายงานเพิ่มเติม</button></div>
        {ov ? <ReportChart buckets={buckets} series={[{ k: "sale", name: "ยอดขายอนุมัติ", c: "var(--primary)" }]} label="ยอดขายอนุมัติในช่วงที่เลือก" /> : <div className="empty">กำลังโหลดข้อมูลยอดขาย…</div>}
      </section>
      <section className="card"><div className="sec-head"><div><div className="sec-title">แอร์ขายดีตามจำนวน</div><div className="sec-sub">{periodLabel} · จากรายการชนิดแอร์ในใบเสนออนุมัติ</div></div></div>
        {!ov || stockLoading ? <div className="empty sm">กำลังโหลดรายการ…</div> : stockError ? <div className="empty sm">โหลดข้อมูลสินค้าไม่ครบ</div> : airSorted.length ? <><div className="executive-models">{airSorted.slice(0, 5).map((r) => <button className="executive-model" type="button" key={r.code || r.name} onClick={onAir}><span>{r.name}<small>{r.code || "ไม่ระบุรหัสสินค้า"}</small></span><b>{fmtNum(r.qty)} <small>{r.unit || "เครื่อง/ชุด"}</small></b></button>)}</div><button className="executive-link" onClick={onAir}>ดูทุกรุ่นและส่งออก →</button></> : <div className="empty sm">ไม่มีรายการแอร์ในช่วงนี้</div>}
        {financial && <div className="executive-cash-link"><UIcon name="trend" size={20} /><div><b>วางแผนเงินรับ–จ่ายล่วงหน้า</b><div className="sec-sub">ดูวันเงินต่ำสุดและรายการคาดการณ์ในกระแสเงินสด</div><button className="executive-link" onClick={() => onGo?.("cashflow")}>เปิดกระแสเงินสด →</button></div></div>}
      </section>
    </div>
  </div>;
}
