---
name: suppliers-system
description: "ข้อมูลผู้ขาย (Suppliers/Vendors) CRM — mirror of the customers module; module 'suppliers', mig 092"
metadata: 
  node_type: memory
  type: project
  originSessionId: b8d73488-693d-46d1-b5f3-7849cf1f6166
---

Suppliers module (ข้อมูลผู้ขาย, v248, 2026-07-03 — needs migration `092_suppliers.sql`). Built as a mirror of the customers CRM per user request "เพิ่มเมนูข้อมูลผู้ขาย ... มีรายละเอียดเหมือนลูกค้าเลย". See [[vatsadu-os-app]] / [[permissions-system]].

- **Tables** (`092_suppliers.sql`): `suppliers` (id bigint identity, type company|person, name, address, tax_id, email, vat bool, note, created_by) + `supplier_contacts` (supplier_id, name/phone/role) + `supplier_sites` (supplier_id, site_name/address/map_url/contact_name/phone) — same shape as customers/customer_contacts/customer_sites. RLS: read = any authenticated; **write = admin/exec/finance/stock** (`my_role()` — purchasing roles, differs from customers which is admin/sales/exec/finance).
- **api.js**: `listSuppliers` / `saveSupplier(sup,contacts,sites)` / `deleteSupplier(id)` — copied from the customer fns (same delete-then-insert child rows pattern). No bulk import / no doc-history (customers has those; suppliers omits them — POs don't link to a supplier record yet).
- **Suppliers.jsx** (`role` prop only): trimmed copy of Customers.jsx — grid/list toggle, search (name/tax/phone), VAT filter, add/edit form (type, name, tax_id, vat, email, address, contacts[], sites[], note), detail modal. Sites relabelled "สาขา / ที่ตั้ง / คลัง" (vs ลูกค้า's "ไซต์งาน"). Code prefix **V** via `suppCode(id)` = "V"+6-digit (customers use custCode "C"+6). Reuses all `.crm-*`/`.cat-*`/`.cd-*` CSS — no new styles.
- **Registration**: permissions.js MODULES `{id:"suppliers",label:"ผู้ขาย (Suppliers)",editable:true}` (after subcontract, before po) + DEFAULT_PERMS suppliers = E for admin/exec/finance/stock, N for the rest. App.jsx: import Suppliers, NAV `suppliers` (icon building), NAV_GROUPS "inventory" ids include "suppliers" (before po), route `{view==="suppliers" && <Suppliers role={role}/>}`.
- Possible follow-ups the user may want: bulk import (like customers), link POs to a supplier record + show PO history in the detail (currently PO supplier is free-text), supplier code on PO.
