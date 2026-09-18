-- เบิกจ่าย: ใบรวมจ่าย (แม่) ↔ ใบเบิกเดิม (ลูก) — v852
-- เดิม: รวมจ่ายหลายใบ = ปิดใบเดิมเป็น "ไม่อนุมัติ" (ไม่เก็บความสัมพันธ์) → ผู้เบิกเห็นใบตัวเองถูกปฏิเสธ ไม่รู้สถานะจ่าย/ไม่เห็นสลิป
-- ใหม่: ใบเดิม = สถานะ 'merged' + merged_into ชี้ใบรวม · สถานะ/สลิปตามใบรวม · ใบรวมถูกไม่อนุมัติ → ใบลูกคืนสถานะเดิม
-- รันซ้ำได้ (idempotent) · ยังไม่รัน = แอป fallback ไปพฤติกรรมเดิม

alter table expense_requests add column if not exists merged_into uuid references expense_requests(id) on delete set null;
alter table expense_requests add column if not exists merged_prev_status text;      -- สถานะก่อนถูกรวม (pending/approved) ไว้คืนตอนแยกออก/ใบรวมถูกไม่อนุมัติ
alter table expense_requests add column if not exists merged_po_nos text[];          -- PO ที่ใบลูกเคยผูก (ไว้ผูกกลับตอนคืนสถานะ)
create index if not exists expense_requests_merged_into_idx on expense_requests(merged_into) where merged_into is not null;

alter table expense_requests drop constraint if exists expense_requests_status_check;
alter table expense_requests add constraint expense_requests_status_check
  check (status in ('pending','approved','rejected','paid','merged'));

-- ผู้เบิกอ่านใบรวมของคนอื่นไม่ได้ (RLS) → ฟังก์ชันนี้คืน "สถานะ + สลิป" ของใบรวมเฉพาะที่ใบของตัวเองถูกรวมอยู่
create or replace function my_merged_parents()
returns table (child_id uuid, parent_id uuid, status text, title text, amount numeric, paid_amount numeric,
               paid_at timestamptz, last_paid_at date, expected_pay_date date, payment_proof text[])
language sql stable security definer set search_path = public as $$
  select c.id, p.id, p.status, p.title, p.amount, p.paid_amount, p.paid_at, p.last_paid_at::date, p.expected_pay_date::date, p.payment_proof
  from expense_requests c join expense_requests p on p.id = c.merged_into
  where c.requester = auth.uid() and c.status = 'merged'
$$;
revoke all on function my_merged_parents() from public;
grant execute on function my_merged_parents() to authenticated;

-- ย้ายข้อมูลเก่า: ใบที่เคยถูกยุบรวม (rejected + หมายเหตุ "ยุบรวม…") → merged + ชี้ใบรวมที่ยังมีชีวิต
-- จับคู่จากเลข PO ในชื่อใบ (จ่ายเจ้าหนี้หลายใบ) หรือชื่อใบเบิก (รวมเบิกทั่วไป) ที่ปรากฏในหมายเหตุของใบรวม
-- ซ้อมแล้ว 18 ก.ย. 2026: จับคู่ได้ 165/166 · ใบที่จับคู่ไม่ได้คงเป็น "ไม่อนุมัติ" ตามเดิม
with kids as (
  select id, title, created_at, substring(title from 'PO-[0-9]+-[0-9]+') as po_no,
         (decide_note like 'ยุบรวมเข้าใบขอจ่ายรวม%') as is_exp
  from expense_requests
  where status = 'rejected' and decide_note like 'ยุบรวม%' and merged_into is null
), pick as (
  select k.id, k.po_no, k.is_exp,
    (select p.id from expense_requests p
      where p.id <> k.id and p.status in ('pending','approved','paid') and p.created_at >= k.created_at
        and ( (not k.is_exp and k.po_no is not null and p.note like 'รวมใบสั่งซื้อ:%' and position(k.po_no || ' (' in p.note) > 0)
           or (k.is_exp and p.note like 'รวมใบเบิก:%' and coalesce(k.title,'') <> '' and position(k.title || ' (' in p.note) > 0) )
      order by p.created_at asc limit 1) as parent_id
  from kids k
)
update expense_requests e
set status = 'merged',
    merged_into = pick.parent_id,
    merged_prev_status = case when e.approver is not null then 'approved' else 'pending' end,
    merged_po_nos = case when pick.po_no is not null and not pick.is_exp then array[pick.po_no] else null end,
    decide_note = null
from pick
where pick.id = e.id and pick.parent_id is not null;
