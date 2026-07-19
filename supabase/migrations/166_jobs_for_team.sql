-- 166: ใบงานสำหรับจอช่าง — ไม่มีข้อมูลราคาติดไปด้วย (รีวิว "กลาง" ข้อ 15) · ส่วนที่ 1/2
--
-- ปัญหา: listJobOrders() อ่าน 8 ตารางเต็ม รวม quotation_items แบบ select *
-- = ราคาต่อหน่วยและส่วนลดของ "ทุกบรรทัดของทุกลูกค้า" ถูกดาวน์โหลดลงมือถือช่างทุกครั้งที่เปิดหน้างาน
-- แล้วค่อยกรองทีมในเบราว์เซอร์ · ช่างเห็นราคาขายทั้งร้านได้ถ้าเปิดดูข้อมูลที่โหลดมา
-- (หลังอุดเพดาน 1000 แถวไปแล้ว อาการ "หนักขึ้น" เพราะเดิมโดนตัดที่ 1000 ตอนนี้ไล่จนหมดตาราง)
--
-- ⚠️ ไฟล์นี้เป็นส่วนที่ 1 — "เพิ่มของใหม่" อย่างเดียว ไม่แตะสิทธิ์เดิม รันได้ทันทีอย่างปลอดภัย
--    ส่วนที่ 2 (mig 167) คือการปิดสิทธิ์อ่านตารางราคาของช่าง ซึ่ง "ต้อง deploy แอปก่อน" แล้วค่อยรัน
--    รันสลับลำดับ = จอช่างพังทันที เพราะแอปเก่ายังอ่าน quotations ตรง ๆ อยู่
--
-- คืนค่าเป็น json ก้อนเดียว (ไม่ใช่หลายแถว) — ตั้งใจ เพราะผลลัพธ์แบบแถวจะโดนเพดาน 1000 แถวของ PostgREST
-- แล้วงานของช่างจะหายเงียบเมื่อสะสมเกินพัน

create or replace function jobs_for_team(p_team text default null)
returns json language sql stable security definer set search_path = public as $$
  with scope as (
    -- ช่างธรรมดาถูกบังคับให้เห็นเฉพาะทีมตัวเองเสมอ ไม่ว่าฝั่งแอปจะส่งอะไรมา (ห้ามเชื่อพารามิเตอร์จาก client)
    select case when my_role() = 'tech' then my_team() else p_team end as team
  ),
  j as (
    select jo.*
    from job_orders jo, scope s
    where my_role() in ('tech','lead_tech','admin','exec','finance','sales','hr','stock')
      and (
        s.team is null
        -- ⚠️ ต้องเทียบ 2 ชั้นเหมือนที่หน้าจอทำ: มีรอบนัด → ดูทีมของรอบ · ไม่มีรอบ → ดูทีมบนหัวใบ
        --    ถ้าเทียบแค่ assigned_team งานที่มอบผ่านรอบนัด (แบบใหม่) จะหายจากมือช่างทั้งหมด
        or (exists (select 1 from job_visits v where v.job_no = jo.job_no)
              and exists (select 1 from job_visits v where v.job_no = jo.job_no and v.assigned_team = s.team))
        or (not exists (select 1 from job_visits v where v.job_no = jo.job_no)
              and jo.assigned_team = s.team)
      )
  )
  select coalesce(json_agg(row_to_json(x) order by x.created_at desc), '[]'::json) from (
    select j.*,
      c.name  as customer_name,
      c.address as customer_address,
      cs.site_name, cs.address as site_address, cs.map_url as site_map_url,
      cs.contact_name as site_contact_name, cs.phone as site_phone,
      (select json_build_object('name', cc.name, 'phone', cc.phone)
         from customer_contacts cc where cc.customer_id = j.customer_id order by cc.id limit 1) as main_contact,
      q.boq_no,
      (select t.name from teams t where t.id = j.assigned_team) as team_name,
      (select coalesce(json_agg(json_build_object('name', qi.name, 'qty', qi.qty, 'unit', qi.unit) order by qi.id), '[]'::json)
         from quotation_items qi
        where qi.quote_no = j.quote_no and qi.kind in ('ac','service')) as confirm_items,
      (select coalesce(json_agg(json_build_object(
                'id', v.id, 'job_no', v.job_no, 'visit_date', v.visit_date, 'end_date', v.end_date,
                'slot', v.slot, 'scheduled_at', v.scheduled_at, 'status', v.status,
                'assigned_team', v.assigned_team, 'note', v.note,
                'teamName', (select t.name from teams t where t.id = v.assigned_team)
              ) order by v.visit_date, v.id), '[]'::json)
         from job_visits v where v.job_no = j.job_no) as visits
    from j
    left join customers      c  on c.id  = j.customer_id
    left join customer_sites cs on cs.id = j.site_id
    -- เอาเฉพาะ boq_no ห้าม select ราคา/ส่วนลดจาก quotations เข้ามาในผลลัพธ์นี้เด็ดขาด
    left join quotations     q  on q.quote_no = j.quote_no
  ) x;
$$;

grant execute on function jobs_for_team(text) to authenticated;

-- ✅ ตรวจผล: ต้องได้ json array (ทดสอบด้วยบัญชีช่างจะเห็นเฉพาะทีมตัวเอง)
-- select json_array_length(jobs_for_team(null));
--
-- 🔒 ตรวจว่าไม่มีราคาหลุด: ผลลัพธ์ต้องไม่มีคำว่า unit_price / discount เลย
-- select (jobs_for_team(null)::text ~ '(unit_price|discount)') as มีราคาหลุด;   -- ต้องได้ false
