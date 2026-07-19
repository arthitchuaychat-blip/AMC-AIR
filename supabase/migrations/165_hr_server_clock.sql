-- 165: เวลาเข้างานยึดนาฬิกาเซิร์ฟเวอร์ (รีวิว "กลาง" ข้อ 22)
--
-- สถานะเดิม (mig 145 ปิดช่องโหว่ใหญ่ไปแล้ว): work_date ถูกตรึงกับวันที่ของเซิร์ฟเวอร์ผ่าน RLS
-- และ trigger "ตีกลับ" ถ้าเวลาที่ส่งมาต่างจากเวลาจริงเกิน 10 นาที
--
-- ปัญหาที่เหลือ: การตีกลับทำให้พนักงานที่นาฬิกาเครื่องเพี้ยน (มือถือเก่า/ตั้งเวลาเอง/เพิ่งเปลี่ยนซิม)
-- "เช็คอินไม่ได้เลย" แล้วขึ้น error ดิบเป็นภาษาอังกฤษ พนักงานไม่รู้จะแก้ยังไง สุดท้ายกลายเป็นขาดงาน
-- ทั้งที่มาทำงานจริง แล้ว HR ต้องมานั่งแก้ย้อนหลังทีละคน
--
-- แก้: เปลี่ยนจาก "ตีกลับ" เป็น "ยึดเวลาเซิร์ฟเวอร์แทน"
-- พนักงานเช็คอินได้เสมอ · เวลาที่บันทึกถูกต้องเสมอ · เก็บเวลาที่เครื่องส่งมาไว้ดูด้วย
-- แล้วให้ HR เห็นธงว่าเครื่องไหนนาฬิกาเพี้ยน จะได้ตามไปแก้ที่ต้นเหตุ
--
-- ⚠️ ห้ามแตะ 2 อย่าง:
--   1. บรรทัด my_role() in ('admin','exec','hr') then return new — ถ้าตัดออก การที่ HR แก้เวลาย้อนหลัง
--      (adminSaveAttendance) จะโดนทับด้วย now() ทุกครั้ง ประวัติเข้างานทั้งเดือนพัง กู้ไม่ได้
--   2. ห้าม UPDATE ทับ check_in_at/check_out_at ของแถวเก่า — แถวเก่าผูกกับรอบเงินเดือนที่จ่ายไปแล้ว
--      คอลัมน์ใหม่จึงเป็น null สำหรับแถวเก่า และฝั่งแอปต้องทนกับ null (null = ไม่รู้ ไม่ใช่ "เพี้ยน 0")

alter table hr_attendance add column if not exists client_in_at  timestamptz;
alter table hr_attendance add column if not exists client_out_at timestamptz;
alter table hr_attendance add column if not exists skew_sec      integer;

comment on column hr_attendance.client_in_at is 'เวลาที่เครื่องพนักงานส่งมา (ไว้เทียบ) — เวลาที่ใช้คิดเงินคือ check_in_at ซึ่งเป็นเวลาเซิร์ฟเวอร์';
comment on column hr_attendance.skew_sec is 'นาฬิกาเครื่องต่างจากเวลาจริงกี่วินาที · null = แถวเก่าก่อน mig 165';

-- วันที่ทำงานตามเวลาไทยจากเซิร์ฟเวอร์ — ให้แอปถามก่อนบันทึก จะได้ตรงกับที่ RLS ตรึงไว้
create or replace function hr_today() returns date
  language sql stable security definer
  as $$ select (now() at time zone 'Asia/Bangkok')::date $$;
grant execute on function hr_today() to authenticated;

create or replace function hr_att_guard() returns trigger as $$
begin
  -- HR/ธุรการ/ผู้บริหาร แก้ย้อนหลังได้ตามเดิม (ห้ามตัดบรรทัดนี้ — ดูหมายเหตุหัวไฟล์)
  if my_role() in ('admin','exec','hr') then return new; end if;

  if tg_op = 'INSERT' then
    new.ot_ok := null;
    new.work_date := (now() at time zone 'Asia/Bangkok')::date;   -- ตรึงวันไว้กับเซิร์ฟเวอร์เสมอ
    if new.check_in_at is not null then
      new.client_in_at := new.check_in_at;
      new.skew_sec := round(extract(epoch from (new.check_in_at - now())))::int;
      new.check_in_at := now();      -- ยึดเวลาเซิร์ฟเวอร์ (เดิม raise exception แล้วเช็คอินไม่ได้เลย)
    end if;
    if new.check_out_at is not null then
      new.client_out_at := new.check_out_at;
      new.check_out_at := now();
    end if;
    return new;
  end if;

  -- UPDATE โดยพนักงานเอง — เวลาที่บันทึกแล้วยังห้ามเลื่อนเหมือนเดิม
  new.ot_ok := old.ot_ok;
  if old.check_in_at is not null and new.check_in_at is distinct from old.check_in_at then
    raise exception 'แก้เวลาเช็คอินไม่ได้ — แจ้งฝ่ายบุคคลแก้ให้';
  end if;
  if old.check_out_at is not null and new.check_out_at is distinct from old.check_out_at then
    raise exception 'แก้เวลาเช็คเอาท์ไม่ได้ — แจ้งฝ่ายบุคคลแก้ให้';
  end if;
  -- เพิ่งเช็คอิน/เช็คเอาท์ครั้งแรกในแถวเดิม → ยึดเวลาเซิร์ฟเวอร์เช่นกัน
  if old.check_in_at is null and new.check_in_at is not null then
    new.client_in_at := new.check_in_at;
    new.skew_sec := round(extract(epoch from (new.check_in_at - now())))::int;
    new.check_in_at := now();
  end if;
  if old.check_out_at is null and new.check_out_at is not null then
    new.client_out_at := new.check_out_at;
    new.check_out_at := now();
  end if;
  return new;
end $$ language plpgsql security definer;

drop trigger if exists hr_att_guard_t on hr_attendance;
create trigger hr_att_guard_t before insert or update on hr_attendance
  for each row execute function hr_att_guard();

-- ✅ ตรวจผล: ต้องได้วันที่ของวันนี้ (เวลาไทย)
-- select hr_today();
