-- 086_stock_count.sql — ระบบนับสต๊อก: เทียบยอดระบบ vs นับได้จริง → ปรับยอด + เก็บประวัติตรวจย้อนหลัง
-- รันใน Supabase → SQL Editor (ครั้งเดียว)

-- (1) เพิ่มชนิดรายการเคลื่อนไหว adjust_in / adjust_out (ปรับยอดจากการนับสต๊อก) เข้า check constraint
do $$ declare cn text;
begin
  for cn in select conname from pg_constraint
            where conrelid = 'public.transactions'::regclass and contype = 'c'
              and pg_get_constraintdef(oid) ilike '%type%in%' loop
    execute format('alter table transactions drop constraint %I', cn);
  end loop;
  alter table transactions add constraint transactions_type_check
    check (type in ('withdraw','return','purchase','damage','adjust_in','adjust_out'));
end $$;

-- (2) สร้าง view material_stock ใหม่ ให้รวมการปรับยอด (adjust_in บวก · adjust_out ลบ)
drop view if exists material_stock cascade;
create view material_stock as
select
  m.*,
  m.init_stock
    + coalesce(sum(case when t.type in ('purchase','return','adjust_in') then t.qty else 0 end), 0)
    - coalesce(sum(case when t.type = 'withdraw' then t.qty else 0 end), 0)
    - coalesce(sum(case when t.type = 'damage' and t.job_no is null then t.qty else 0 end), 0)
    - coalesce(sum(case when t.type = 'adjust_out' then t.qty else 0 end), 0) as current_stock
from materials m
left join transactions t on t.material_code = m.code
group by m.code;
alter view material_stock set (security_invoker = on);

-- (3) รอบการนับ (header) + รายการที่นับ (lines, เก็บ snapshot ยอดระบบ/นับได้/ส่วนต่าง ไว้ตรวจย้อนหลัง)
create table if not exists stock_counts (
  id          bigint generated always as identity primary key,
  count_no    text unique not null,
  note        text,
  status      text not null default 'draft' check (status in ('draft','applied')),
  counted_by  uuid references auth.users(id),
  applied_by  uuid references auth.users(id),
  applied_at  timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create table if not exists stock_count_items (
  id            bigint generated always as identity primary key,
  count_id      bigint not null references stock_counts(id) on delete cascade,
  material_code text not null references materials(code),
  system_qty    numeric,   -- ยอดในระบบ ณ ตอนกดอัพเดท (snapshot)
  counted_qty   numeric,   -- นับได้จริง (null = ยังไม่นับ)
  diff          numeric,   -- counted - system (คำนวณตอน apply)
  unit_cost     numeric not null default 0,
  unique (count_id, material_code)
);
create index if not exists idx_sci_count on stock_count_items(count_id);

alter table stock_counts enable row level security;
alter table stock_count_items enable row level security;
-- อ่าน: ธุรการ/ผู้บริหาร/บัญชี/ธุรการวัสดุ · เขียน+ปรับยอด: ธุรการ/ผู้บริหาร/ธุรการวัสดุ
create policy sc_read  on stock_counts for select to authenticated using (my_role() in ('admin','exec','finance','stock'));
create policy sc_write on stock_counts for all    to authenticated using (my_role() in ('admin','exec','stock')) with check (my_role() in ('admin','exec','stock'));
create policy sci_read  on stock_count_items for select to authenticated using (my_role() in ('admin','exec','finance','stock'));
create policy sci_write on stock_count_items for all    to authenticated using (my_role() in ('admin','exec','stock')) with check (my_role() in ('admin','exec','stock'));
