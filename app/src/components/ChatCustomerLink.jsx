import React from "react";
import { UIcon } from "../icons";

// roles allowed to jump from a document to the customer's chat thread
const CHAT_LINK_ROLES = ["sales", "admin", "exec"];

// "แชตลูกค้า" button shown on each document (BOQ / quote / invoice / receipt / job order).
// Opens the chat inbox focused on the contact linked to this customer.
// Visible only for พนักงานขาย (sales) / ธุรการ (admin) / ผู้บริหาร (exec), and only when
// the document has a customer + a handler is wired in.
export default function ChatCustomerLink({ role, customerId, onGoChat }) {
  if (!onGoChat || !customerId || !CHAT_LINK_ROLES.includes(role)) return null;
  return (
    <button
      className="btn-ghost sm"
      title="เปิดแชตของลูกค้ารายนี้"
      onClick={(e) => { e.stopPropagation(); onGoChat(customerId); }}
    >
      <UIcon name="chat" size={14} /> แชตลูกค้า
    </button>
  );
}
