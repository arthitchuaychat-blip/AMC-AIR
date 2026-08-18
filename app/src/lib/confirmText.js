// สร้างข้อความ "คอนเฟิมออเดอร์" สำหรับส่งให้ลูกค้าทาง LINE — ใช้ร่วมกันทั้งหน้าใบงานและกล่องแชต
import { fmtBaht } from "./format";
import { scheduleLabel } from "./schedule";

const fmtDate = (d) => d ? new Date(d).toLocaleDateString("th-TH", { day: "2-digit", month: "2-digit", year: "numeric" }) : "-";

// jo = job order object จาก listJobOrders() (มี confirmItems, quoteGrand, scheduled_at, slot, customerName ฯลฯ)
// visit (ไม่บังคับ) = รอบเข้างานที่ต้องการคอนเฟิม (job_visits) → ใช้วันเวลาของรอบนั้นแทนรอบแรก
export function buildOrderConfirm(jo, visit) {
  // เลือกวันเวลานัดจากรอบที่ระบุ (ถ้ามี) มิฉะนั้นใช้รอบหลัก (scheduled_at บนใบงาน)
  const sched = visit && visit.scheduled_at ? { scheduled_at: visit.scheduled_at, end_date: visit.end_date, slot: visit.slot } : (jo.scheduled_at ? jo : null);
  // หน้างาน = ข้อมูลไซต์เท่าที่มี (ไซต์ที่ผูกไว้ หรือที่กรอกในใบงานเอง) — แต่ไม่ดึงที่อยู่หลักมาแทน
  const svcAddr = jo.siteAddress || (jo.address && jo.address !== jo.customerAddr ? jo.address : "");
  const svcCName = jo.siteContactName || (jo.contact_name && jo.contact_name !== jo.mainContactName ? jo.contact_name : "");
  const svcCPhone = jo.siteContactPhone || (jo.contact_phone && jo.contact_phone !== jo.mainContactPhone ? jo.contact_phone : "");
  const siteLines = [];
  if (jo.siteName) siteLines.push(`สถานที่ให้บริการ (หน้างาน) : ${jo.siteName}`);
  if (svcAddr) siteLines.push(`ที่อยู่หน้างาน : ${svcAddr}`);
  if (svcCName || svcCPhone) siteLines.push(`ผู้ติดต่อหน้างาน : ${svcCName || ""}${svcCPhone ? ` (${svcCPhone})` : ""}`);
  if (svcAddr && jo.map_url) siteLines.push(`หมุดโลเคชั่น : ${jo.map_url}`);

  const lines = [
    `วันที่สั่งซื้อ : ${fmtDate(jo.created_at)}`,
    `วันเวลานัดหมายบริการ : ${sched ? scheduleLabel(sched) : "-"}`,
    `เลขที่ใบเสนอราคา : ${jo.quote_no || "-"}`,
    "--",
    `ชื่อลูกค้า : ${jo.customerName || "-"}`,
    `ที่อยู่หลัก : ${jo.customerAddr || "-"}`,
    `เบอร์โทรหลัก : ${jo.mainContactPhone || "-"}`,
    ...(siteLines.length ? ["--", ...siteLines] : []),
    "--",
    "รายการสินค้าและบริการ :",
    (jo.quote_no
      ? ((jo.confirmItems && jo.confirmItems.length) ? jo.confirmItems.map((it, i) => `${i + 1}. ${it.name} × ${it.qty} ${it.unit || ""}`).join("\n") : "-")
      : (jo.details || "-")),
    `ยอดชำระเงิน : ${fmtBaht(jo.quoteGrand || 0)}`,
  ];
  return lines.join("\n");
}
