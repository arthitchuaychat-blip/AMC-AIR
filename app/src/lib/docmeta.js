// shared labels/status for the unified document+job history (customer detail & chat panel)
export const TYPE_LABEL = { quote: "ใบเสนอ", invoice: "ใบแจ้งหนี้", receipt: "ใบเสร็จ", job: "ใบงาน", po: "ใบสั่งซื้อ" };
export const DOC_FILTERS = [["all", "ทั้งหมด"], ["quote", "ใบเสนอราคา"], ["invoice", "ใบแจ้งหนี้"], ["receipt", "ใบเสร็จ"], ["job", "ใบงาน"]];
const DOC_STATUS = {
  quote: { draft: ["ร่าง", "b-grey"], sent: ["ส่งแล้ว", "b-blue"], approved: ["อนุมัติ", "b-green"], rejected: ["ปฏิเสธ", "b-red"], expired: ["หมดอายุ", "b-grey"] },
  invoice: { unpaid: ["ค้างชำระ", "b-amber"], paid: ["ชำระแล้ว", "b-green"], cancelled: ["ยกเลิก", "b-red"] },
  receipt: { pending: ["รอชำระ", "b-amber"], paid: ["ชำระแล้ว", "b-green"] },
  job: { pending: ["รอจ่ายงาน", "b-grey"], scheduled: ["นัดแล้ว", "b-blue"], in_progress: ["กำลังทำ", "b-amber"], done: ["เสร็จ", "b-green"], cancelled: ["ยกเลิก", "b-red"] },
};
export const stOf = (e) => (DOC_STATUS[e.type] || {})[e.status] || [e.status || "-", "b-grey"];
