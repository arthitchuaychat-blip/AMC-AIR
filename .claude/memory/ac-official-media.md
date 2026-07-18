---
name: ac-official-media
description: รูป/โบรชัวร์แอร์ทางการ — manifest lib/acOfficialMedia.js + ปุ่มนำเข้าทั้งชุดใน AcMediaManager; รุ่นที่ยังหารูปทางการไม่ได้
metadata: 
  node_type: memory
  type: project
  originSessionId: b8d73488-693d-46d1-b5f3-7849cf1f6166
---

AC product photos + brochures from manufacturer sites (v455, 2026-07-18). Audit endpoint `?acimg=1` on line-webhook reports per-series photo/brochure gaps + photo host domains (dealer hosts = watermark suspects). **Caveat: its `codesNoPhoto` caps at 12 per series** — Central ES had 26 missing but listed 12, so always fix photos SERIES-level, never from that code list.

**Manifest** `app/src/lib/acOfficialMedia.js`: `AC_OFFICIAL_MEDIA` (match by `series` = all sizes, or `code` = one model) + `AC_OFFICIAL_BROCHURES`. `review:true` = don't auto-import, owner decides. All 66 URLs live-verified 2026-07-18.

**Two import paths** — both store files in OUR bucket, never hotlink (centralair.co.th is http-only → mixed-content block; external links rot):
1. UI: AcMediaManager "📥 นำเข้าทั้งชุด" / per-group "📥 ใช้รูปที่ค้นไว้" → `fetchExternalFile` → `/api/fetch-file` (office roles, 15MB cap) → `uploadMaterialPhoto`/`uploadBrochureFile` → `setMaterialsPhoto`/`saveAcSeries`.
2. **Server-side (ใช้จริงรอบแรก)**: `?acmedia=import&go=1&from=<n>` on line-webhook — service role, downloads + uploads + patches DB itself, **time-sliced** (returns `next` cursor; ~8-20 jobs per 40s call, 5 calls for 60 jobs) and **idempotent** via the `official-` filename prefix. Use this when the owner shouldn't have to click through the UI.

**RAN 2026-07-18: 60/60 jobs OK, zero failures.** Result: 0 AC models without a photo (was 74), all dealer-watermarked photos replaced (ttair/dasintergroup/bbairtrading now ~0-4 leftovers), 277 photos on our own storage, brochure gaps 43 → 24 series.

**Audit result 2026-07-18** (855 AC models / 122 series): ~700 already on manufacturer CDNs (daikin.co.th, mitsubishi-kyw, images.carriercms, images.samsung, lg.com, tcl.com, web-res.midea, image.haier). Fixed: 74 models with no photo (Central 67) + ~110 on dealer hosts (dasintergroup=Haier/Hisense/Gree, ttair=Carrier Apollo III, bbairtrading=Hisense KD, makewebeasy=Star aire).

**รับประกันรายซีรีส์ (mig 152, v455+, 18 ก.ค. 2026)** — แทนข้อความรวมระดับยี่ห้อจาก mig 140 ที่กว้างเกินใช้งาน. Manifest `app/src/lib/acWarranty.js` (match: `series` · `code` · `series`+`codeLike`/`codeNotLike` สำหรับซีรีส์ที่ปนอินเวอร์เตอร์/ฟิกซ์สปีด เช่น Haier HSU=CQRC) → apply ด้วย `?acwarranty=apply&go=1`. **RAN: 122 รายการ → 863 รุ่น เหลือ 1 รุ่นที่ยังไม่มีข้อมูล (Carrier ตู้ตั้ง 40QGF)**.
**บทเรียนใหญ่: ตัวเลขรับประกันของผู้ผลิตไทยมักอยู่ใน "รูปภาพ" ไม่ใช่ข้อความ HTML** — รอบแรกที่ค้นด้วย text อย่างเดียวตัดทิ้งผิดไป 10 ซีรีส์ (Carrier Copper SEAL/ION, Haier HSU, Daikin FHA/FCF/FHFC/FCFC, Mitsubishi SE, AUX MA) พอสั่งให้ **ดาวน์โหลดรูป/โบรชัวร์แล้วเปิดดูด้วย Read (ตาเห็นภาพ)** ก็เจอครบเกือบหมด. เทคนิค: Daikin = flipbook `.../book/jpg_l/NNNN.jpg` · Mitsubishi = ตาราง JPEG ฝังใน PDF (DCTDecode) · Carrier = โบรชัวร์มี text layer สกัดด้วย pdfjs ได้เร็วกว่า.
กับดักที่เจอ: หน้า AUX สากล (รหัส 24CAR3DI) คนละตลาดกับ ASW-DIMA ไทย · Daikin Premium (FHA/FCF) ระบุเฉพาะคอยล์ร้อน CAZ ส่วน Standard (FHFC/FCFC) ระบุคอยล์เย็น+ร้อน — ต่างกันจริง ห้ามเหมารวม.

**ยังหารูปทางการไม่ได้ (ต้องตามต่อ)**: Haier "Way HCS1" (2 รุ่น HCS1I-18/25ASR32F — haier.com/th ไม่มีหน้า 1-way cassette) · Hisense "Hisense KD" (4 รุ่น AS-xxTRKD2T — รุ่นปี 2026 ยังไม่ขึ้น hisense.co.th) — รูปเดิมจากตัวแทนคงไว้ก่อน. **Star aire ผ่าน**: image.makewebeasy.net = CDN ที่ staraire.com (เว็บทางการ) ใช้เอง ไม่ต้องเปลี่ยน. **โบรชัวร์ยังขาด 17**: Midea 7 (pdp ไทยไม่ปล่อย PDF), TCL 8 (tcl.com/th ไม่มี PDF เลย), Carrier 2 (carrier.co.th ล่ม). Samsung/LG catalogues found but 35–43MB > the 15MB fetch cap → must download manually then upload.
