import React from "react";

// AMC AIR custom 3D artwork. One local atlas; no runtime third-party requests.
const ICONS = {"dashboard": [0, 0], "users": [1, 0], "document": [2, 0], "clipboard": [3, 0], "receipt": [4, 0], "wallet": [0, 1], "wrench": [1, 1], "box": [2, 1], "settings": [3, 1], "calendar": [4, 1], "chat": [0, 2], "mail": [1, 2], "book": [2, 2], "target": [3, 2], "phone": [4, 2], "star": [0, 3], "ticket": [1, 3], "purchase": [2, 3], "globe": [3, 3], "megaphone": [4, 3], "trend": [0, 4], "building": [1, 4], "repeat": [2, 4], "withdraw": [3, 4], "catalog": [4, 4]};

const MENU_ICONS = {"myjobs": [1, 1, 1], "dashboard": [0, 0, 1], "kpi": [3, 2, 1], "customers": [1, 0, 1], "pipeline": [0, 0, 2], "followup": [4, 2, 1], "saleshub": [1, 0, 2], "reviews": [0, 3, 1], "promo": [1, 3, 1], "weborders": [2, 3, 1], "website": [3, 3, 1], "marketing": [4, 3, 1], "chat": [0, 2, 1], "email": [1, 2, 1], "teamchat": [2, 0, 2], "tasks": [3, 0, 1], "attendance": [4, 1, 1], "handbook": [2, 2, 1], "hr": [3, 0, 2], "subcontract": [4, 0, 2], "catalog": [2, 1, 1], "boq": [0, 1, 2], "quote": [2, 0, 1], "invoice": [1, 1, 2], "receipt": [4, 0, 1], "adjnote": [2, 1, 2], "billing": [3, 1, 2], "receivables": [0, 4, 1], "recvcenter": [0, 1, 1], "payables": [4, 1, 2], "tax": [0, 2, 2], "profit": [1, 2, 2], "cashflow": [2, 2, 2], "loans": [1, 4, 1], "recurring": [2, 4, 1], "paycenter": [3, 2, 2], "assets": [4, 2, 2], "accounting": [0, 3, 2], "expenses": [3, 4, 1], "joborders": [1, 3, 2], "handover": [4, 4, 1], "schedule": [2, 3, 2], "movements": [3, 3, 2], "stockcount": [4, 3, 2], "jobs": [0, 4, 2], "suppliers": [1, 4, 2], "prep": [2, 4, 2], "po": [3, 4, 2], "tools": [4, 4, 2], "settings": [3, 1, 1]};

export default function FloatingIcon({ name, menuId, size = 34, className = "" }) {
  const [x, y, sheet = 1] = (menuId && MENU_ICONS[menuId]) || ICONS[name] || ICONS.document;
  return <span aria-hidden="true" className={"floating-icon " + (sheet === 2 ? "floating-icon--menu-v2 " : "") + className} style={{ "--float-size": `${size}px`, "--float-x": x, "--float-y": y }} />;
}
