// สร้างข้อความ "คอนเฟิมออเดอร์" สำหรับส่งให้ลูกค้าทาง LINE — ใช้ร่วมกันทั้งหน้าใบงานและกล่องแชต
import { fmtBaht } from "./format";
import { scheduleLabel } from "./schedule";

const fmtDate = (d) => d ? new Date(d).toLocaleDateString("th-TH", { day: "2-digit", month: "2-digit", year: "numeric" }) : "-";

// jo = job order object จาก listJobOrders() (มี confirmItems, quoteGrand, scheduled_at, slot, customerName ฯลฯ)
export function buildOrderConfirm(jo) {
  // หน้างาน = ข้อมูลไซต์จริงเท่านั้น (ไม่ดึงที่อยู่หลักมาแทน) — ถ้าไม่มี ก็เว้นว่าง/ไม่แสดง
  const siteLines = [];
  if (jo.siteName) siteLines.push(`สถานที่ให้บริการ (หน้างาน) : ${jo.siteName}`);
  if (jo.siteAddress) siteLines.push(`ที่อยู่หน้างาน : ${jo.siteAddress}`);
  if (jo.siteContactName || jo.siteContactPhone) siteLines.push(`ผู้ติดต่อหน้างาน : ${jo.siteContactName || ""}${jo.siteContactPhone ? ` (${jo.siteContactPhone})` : ""}`);
  if (jo.siteAddress && jo.map_url) siteLines.push(`หมุดโลเคชั่น : ${jo.map_url}`);

  const lines = [
    `วันที่สั่งซื้อ : ${fmtDate(jo.created_at)}`,
    `วันเวลานัดหมายบริการ : ${jo.scheduled_at ? scheduleLabel(jo) : "-"}`,
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
