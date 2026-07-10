-- 129_advance_payout.sql — จ่ายเงินเบิกล่วงหน้าให้พนักงานจริง: เลือกบัญชี + แนบสลิปโอน (เหมือนจ่ายช่างซัพ)
-- ไม่แตะสถานะเดิม (approved → หักเงินเดือนรอบถัดไป) — เพิ่มเฉพาะข้อมูล "โอนเงินออกแล้ว"
-- รันใน Supabase → SQL Editor (ครั้งเดียว · รันซ้ำได้)

alter table hr_advances add column if not exists paid_out_at timestamptz;   -- โอนให้พนักงานเมื่อไหร่
alter table hr_advances add column if not exists paid_from uuid;            -- จ่ายจากบัญชีไหน
alter table hr_advances add column if not exists pay_slip_url text;         -- สลิปโอนเงิน

-- ✅ ตรวจผล
select column_name from information_schema.columns
where table_name = 'hr_advances' and column_name in ('paid_out_at','paid_from','pay_slip_url');
