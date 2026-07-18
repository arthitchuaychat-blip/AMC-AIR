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

**Import path** (AcMediaManager "📥 นำเข้าทั้งชุด" + per-group "📥 ใช้รูปที่ค้นไว้"): `fetchExternalFile` → `/api/fetch-file` (server-side, office roles only, 15MB cap, accepts http://) → `uploadMaterialPhoto`/`uploadBrochureFile` → our Supabase storage → `setMaterialsPhoto`/`saveAcSeries`. **Never hotlink**: centralair.co.th serves http only (broken cert → mixed-content block) and external links rot.

**Audit result 2026-07-18** (855 AC models / 122 series): ~700 already on manufacturer CDNs (daikin.co.th, mitsubishi-kyw, images.carriercms, images.samsung, lg.com, tcl.com, web-res.midea, image.haier). Fixed: 74 models with no photo (Central 67) + ~110 on dealer hosts (dasintergroup=Haier/Hisense/Gree, ttair=Carrier Apollo III, bbairtrading=Hisense KD, makewebeasy=Star aire).

**ยังหารูปทางการไม่ได้ (ต้องตามต่อ)**: Haier "Way HCS1" (2 รุ่น HCS1I-18/25ASR32F — haier.com/th ไม่มีหน้า 1-way cassette) · Hisense "Hisense KD" (4 รุ่น AS-xxTRKD2T — รุ่นปี 2026 ยังไม่ขึ้น hisense.co.th) — รูปเดิมจากตัวแทนคงไว้ก่อน. **Star aire ผ่าน**: image.makewebeasy.net = CDN ที่ staraire.com (เว็บทางการ) ใช้เอง ไม่ต้องเปลี่ยน. **โบรชัวร์ยังขาด 17**: Midea 7 (pdp ไทยไม่ปล่อย PDF), TCL 8 (tcl.com/th ไม่มี PDF เลย), Carrier 2 (carrier.co.th ล่ม). Samsung/LG catalogues found but 35–43MB > the 15MB fetch cap → must download manually then upload.
