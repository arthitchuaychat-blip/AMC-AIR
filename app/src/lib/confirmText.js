// สร้างข้อความ "คอนเฟิมออเดอร์" สำหรับส่งให้ลูกค้าทาง LINE — ใช้ร่วมกันทั้งหน้าใบงานและกล่องแชต
import { fmtBaht } from "./format";
import { scheduleLabel } from "./schedule";

const fmtDate = (d) => d ? new Date(d).toLocaleDateString("th-TH", { day: "2-digit", month: "2-digit", year: "numeric" }) : "-";

// jo = job order object จาก listJobOrders() (มี confirmItems, quoteGrand, scheduled_at, slot, customerName ฯลฯ)
export function buildOrderConfirm(jo) {
  const lines = [
    `วันที่สั่งซื้อ : ${fmtDate(jo.created_at)}`,
    `วันเวลานัดหมายบริการ : ${jo.scheduled_at ? scheduleLabel(jo) : "-"}`,
    `เลขที่ใบเสนอราคา : ${jo.quote_no || "-"}`,
    "--",
    `ชื่อลูกค้า : ${jo.customerName || "-"}`,
    `ชื่อผู้ติดต่อ : ${jo.contact_name || "-"}`,
    `เบอร์โทรผู้ติดต่อ : ${jo.contact_phone || "-"}`,
    `ที่อยู่ในการให้บริการ : ${jo.address || "-"}`,
    `หมุดโลเคชั่น : ${jo.map_url || "-"}`,
    "--",
    "รายการสินค้าและบริการ :",
    (jo.quote_no
      ? ((jo.confirmItems && jo.confirmItems.length) ? jo.confirmItems.map((it, i) => `${i + 1}. ${it.name} × ${it.qty} ${it.unit || ""}`).join("\n") : "-")
      : (jo.details || "-")),
    `ยอดชำระเงิน : ${fmtBaht(jo.quoteGrand || 0)}`,
  ];
  return lines.join("\n");
}
