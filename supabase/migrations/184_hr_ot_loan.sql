-- 184_hr_ot_loan.sql — ใบขอ OT (อนุมัติก่อนคิดเงิน) + เงินยืม (ผ่อนอัตโนมัติจนครบ) + ช่องหักค่าน้ำ/ค่าไฟ
-- รันใน Supabase → SQL Editor (ครั้งเดียว)

-- (1) ใบขอ OT — พนักงาน/หัวหน้าทีมขอ · HR อนุมัติ · คิดเงินเฉพาะที่อนุมัติ
create table if not exists hr_ot (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  ot_date    date not null,
  time_from  text,                    -- "HH:MM"
  time_to    text,
  hours      numeric not null default 0,   -- ชั่วโมงที่คำนวณ (บล็อก ½ ชม.)
  reason     text,
  status     text not null default 'pending' check (status in ('pending','approved','rejected','paid')),
  period     text,                    -- pay month 'YYYY-MM' ที่นำไปคิด (ตั้งตอนทำจ่าย)
  decided_by uuid, decided_at timestamptz, decide_note text,
  created_by uuid, created_at timestamptz not null default now()
);
create index if not exists hr_ot_user_idx on hr_ot(user_id);
create index if not exists hr_ot_status_idx on hr_ot(status);
alter table hr_ot enable row level security;
-- self: อ่านของตัวเอง + ยื่นได้เฉพาะ pending + ลบใบที่ยัง pending · ผู้จัดการ (admin/exec/hr) = เต็ม (self อนุมัติเองไม่ได้)
drop policy if exists hr_ot_sel on hr_ot;
create policy hr_ot_sel on hr_ot for select to authenticated using (user_id = auth.uid() or my_role() in ('admin','exec','hr'));
drop policy if exists hr_ot_ins on hr_ot;
create policy hr_ot_ins on hr_ot for insert to authenticated with check ((user_id = auth.uid() and status = 'pending') or my_role() in ('admin','exec','hr'));
drop policy if exists hr_ot_upd on hr_ot;
create policy hr_ot_upd on hr_ot for update to authenticated using (my_role() in ('admin','exec','hr')) with check (my_role() in ('admin','exec','hr'));
drop policy if exists hr_ot_del on hr_ot;
create policy hr_ot_del on hr_ot for delete to authenticated using ((user_id = auth.uid() and status = 'pending') or my_role() in ('admin','exec','hr'));

-- (2) เงินยืม — HR เปิดยืม · ผ่อนอัตโนมัติทุกเดือนจนครบ
create table if not exists hr_loans (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  principal   numeric not null default 0,    -- ยอดยืมรวม
  installment numeric not null default 0,    -- หักต่อเดือน
  balance     numeric not null default 0,    -- คงเหลือ
  status      text not null default 'active' check (status in ('active','closed')),
  note        text,
  created_by  uuid, created_at timestamptz not null default now()
);
create index if not exists hr_loans_user_idx on hr_loans(user_id);
alter table hr_loans enable row level security;
drop policy if exists hr_loans_sel on hr_loans;
create policy hr_loans_sel on hr_loans for select to authenticated using (user_id = auth.uid() or my_role() in ('admin','exec','hr','finance'));
drop policy if exists hr_loans_wr on hr_loans;
create policy hr_loans_wr on hr_loans for all to authenticated using (my_role() in ('admin','exec','hr')) with check (my_role() in ('admin','exec','hr'));

-- บันทึกการหักเงินยืมต่องวด (unique loan+period = กันหักซ้ำ + เป็นประวัติ)
create table if not exists hr_loan_payments (
  id         bigint generated always as identity primary key,
  loan_id    bigint not null references hr_loans(id) on delete cascade,
  period     text not null,
  amount     numeric not null default 0,
  created_at timestamptz not null default now(),
  unique (loan_id, period)
);
alter table hr_loan_payments enable row level security;
drop policy if exists hr_loanpay_all on hr_loan_payments;
create policy hr_loanpay_all on hr_loan_payments for all to authenticated using (my_role() in ('admin','exec','hr','finance')) with check (my_role() in ('admin','exec','hr'));

-- (3) payslips: ช่องหักเพิ่ม เงินยืม/ค่าน้ำ/ค่าไฟ
alter table payslips add column if not exists d_loan     numeric not null default 0;
alter table payslips add column if not exists d_water    numeric not null default 0;
alter table payslips add column if not exists d_electric numeric not null default 0;

-- ✅ ตรวจผล
select 'hr_ot + hr_loans + payslip cols ready' as status;
