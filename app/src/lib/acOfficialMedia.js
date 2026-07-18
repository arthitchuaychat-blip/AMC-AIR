// รูป/โบรชัวร์ "ทางการ" ของแอร์ที่ค้นไว้แล้ว (18 ก.ค. 2026) — ใช้กับปุ่มนำเข้าทั้งชุดในหน้า 🖼️ รูป & คุณสมบัติแอร์
//
// ที่มา = เว็บผู้ผลิตเท่านั้น (ห้ามใช้เว็บตัวแทน/ร้านค้า เพราะติดลายน้ำ-ชื่อร้าน)
// ระบบจะ "ดาวน์โหลดผ่านเซิร์ฟเวอร์ → เก็บเข้า storage ของเรา" ไม่ใช่ hotlink:
//   - เว็บ Central เสิร์ฟได้เฉพาะ http:// (ใบรับรองเสีย) → hotlink ตรงจะโดนบล็อก mixed content
//   - ลิงก์เว็บนอกมีวันตาย/บล็อก hotlink → เก็บไว้เองปลอดภัยกว่า
//
// match: ระบุ series (ทั้งรุ่นทุกขนาด) หรือ code (รายตัว สำหรับสินค้าที่ไม่มีซีรีส์)
// review: true = ไม่นำเข้าอัตโนมัติ ให้เจ้าของตัดสินใจเอง (เหตุผลอยู่ใน note)

export const AC_OFFICIAL_MEDIA = [
  // ---------- Central Air (centralair.co.th) — 67 รุ่นที่ไม่มีรูปเลย ----------
  { brand: "Central", series: "Central ES", img: "http://www.centralair.co.th/product/product_image/02_CFH-ES_32.jpg", brochure: "http://www.centralair.co.th/product/Web_CATALOG/2.Floor%26ceiling/2025%20CFH-ES_CCS-32ES_Final.pdf" },
  { brand: "Central", series: "Ceiling IVSA", img: "http://www.centralair.co.th/product/product_image/019_CFH-32IVSA_01.jpg", brochure: "http://www.centralair.co.th/product/Web_CATALOG/2.Floor%26ceiling/2025%20IVSA%20%E0%B8%95%E0%B8%B1%E0%B9%89%E0%B8%87%E0%B9%81%E0%B8%82%E0%B8%A7%E0%B8%99%20Final.pdf" },
  { brand: "Central", series: "Cassette IVSA", img: "http://www.centralair.co.th/product/product_image/020_CFC-32IVSA_01.jpg", brochure: "http://www.centralair.co.th/product/Web_CATALOG/6.Cassette/2025%20IVSA%204%E0%B8%97%E0%B8%B4%E0%B8%A8%E0%B8%97%E0%B8%B2%E0%B8%87.pdf" },
  { brand: "Central", series: "Standing ME", img: "http://www.centralair.co.th/product/product_image/CFP_ME_Series.jpg", brochure: "http://www.centralair.co.th/product/Web_CATALOG/4.Floorstanding/2024%20ME%20Series_final.pdf" },
  { brand: "Central", series: "Central IVJS", img: "http://www.centralair.co.th/product/product_image/013_2024-IVJS-Series-01.jpg", brochure: "http://www.centralair.co.th/product/Web_CATALOG/1.Walltype/2024%20IVJS-1%20Final.pdf" },
  { brand: "Central", series: "Central IVM", img: "http://www.centralair.co.th/product/product_image/021_2024-IVM-Series-01.jpg", brochure: "http://www.centralair.co.th/product/Web_CATALOG/1.Walltype/2025%20IVM.pdf" },
  { brand: "Central", series: "Central JSFE", img: "http://www.centralair.co.th/product/product_image/014_2024-JSFE-Series-01.jpg", brochure: "http://www.centralair.co.th/product/Web_CATALOG/1.Walltype/2023_Walltype%20JSFE-1%20Series.pdf" },
  { brand: "Central", series: "Central MFE", img: "http://www.centralair.co.th/product/product_image/015_2024-MFE-Series-01.jpg", brochure: "http://www.centralair.co.th/product/Web_CATALOG/1.Walltype/2025%20MFE%20Final.pdf" },
  { brand: "Central", series: "Central IVGE", img: "http://www.centralair.co.th/product/product_image/012_2024-IVGE-Series-01.jpg", brochure: "http://www.centralair.co.th/product/Web_CATALOG/1.Walltype/2024%20IVGE%20Final.pdf" },
  { brand: "Central", series: "DA", img: "http://www.centralair.co.th/product/product_image/07_DA-Series__.jpg", brochure: "http://www.centralair.co.th/product/catalog/conceal/CFH-DA_R32%2C%20R410.pdf" },
  // รหัสนี้ ERP จัดอยู่กลุ่ม Ceiling IVSA แต่ตัวจริงคือซีรีส์ IVGX → ใช้รูป IVGX ให้ตรงเครื่อง
  { brand: "Central", code: "CFH-32IVGX60 / CCS-32IVGX60(A)-H", img: "http://www.centralair.co.th/product/product_image/02_CFH-32IVGX-01.jpg", note: "ซีรีส์ IVGX (ไม่ใช่ IVSA)" },

  // ---------- Haier (haier.com/th · CDN image.haier.com) — แทนรูปเว็บตัวแทน ----------
  { brand: "Haier", series: "Ceiling HCFU", img: "https://image.haier.com/th/commercial-air-conditioners/W020200820506229867448_480.jpg" },
  { brand: "Haier", series: "Cool Plus", img: "https://image.haier.com/th/commercial-air-conditioners/W020220424799128535511_480.jpg" },
  { brand: "Haier", series: "Flow HCSI", img: "https://image.haier.com/th/commercial-air-conditioners/W020220424850025887653_480.jpg" },
  { brand: "Haier", series: "Flow HCSU", img: "https://image.haier.com/th/commercial-air-conditioners/W020200820387916679135_480.jpg" },

  // ---------- Hisense ----------
  { brand: "Hisense", series: "Cassette Mark5", img: "https://www.hisensehvac.com/upload/images/20227/20227281621407575861.png", note: "hisensehvac.com (สาย HVAC ทางการ) — รูประดับประเภทเครื่อง 4 ทิศ" },
  { brand: "Hisense", series: "Floor", img: "https://www.hisensehvac.com/upload/images/20227/20227281620516003279.png", note: "hisensehvac.com — รูประดับประเภทเครื่อง ตั้ง/แขวน" },
  { brand: "Hisense", code: "AS-24TRLB2T", img: "https://hisense.co.th/img/products/gallery/MjQxMDQxNTQ/bcd99e76b721d011216cf9f6d2500475.jpg" },

  // ---------- Gree / AUX ----------
  { brand: "Gree", series: "PULAR I1", img: "https://www.greethailand.com/img/upload/pular%20i1_inverter-01.jpg" },
  { brand: "AUX", series: "AUX MA", img: "https://mws-data.auxair.com/upload/2025-01-13/1736759209210_b8c225a0-d18d-11ef-adb7-b572d61b301f.png" },
  { brand: "AUX", series: "AUX MF", img: "https://mws-data.auxair.com/upload/2025-01-13/1736759213008_bb05ad00-d18d-11ef-adb7-b572d61b301f.png", note: "auxair.com ไม่มีหน้า MF แยก — MF ใช้โครงเครื่อง DIMA เดียวกับ MA" },

  // ---------- Carrier (carrier.com/commercial/th · images.carriercms.com · carrierthailand.com) ----------
  { brand: "Carrier", series: "Standing 40QGF", img: "https://images.carriercms.com/image/upload/v1676469593/carrier/hvac-thailand/products/light-commercial/floor-standing/carrier-40QGV-fancoil.jpg", note: "รูปจากหน้า 40QGF-HP ของ Carrier เอง (ตู้ทรงเดียวกัน)" },
  { brand: "Carrier", series: "40QBU", img: "https://images.carriercms.com/image/upload/v1676469784/carrier/hvac-thailand/products/light-commercial/floor-standing/carrier-40QBY-fancoil.jpg" },
  { brand: "Carrier", series: "Cassette VLJ", img: "https://images.carriercms.com/image/upload/v1709207370/carrier/commercial-hvac-asia/products/split-type/40VLJ-40VLY-series/4W_40VLJ.jpg" },
  { brand: "Carrier", series: "Ceiling TGEV", img: "https://images.carriercms.com/image/upload/v1709218101/carrier/commercial-hvac-asia/products/split-type/42TGF-CP/UC_42TGF.jpg" },
  { brand: "Carrier", series: "Ceiling TGV", img: "https://images.carriercms.com/image/upload/v1709218101/carrier/commercial-hvac-asia/products/split-type/42TGF-CP/UC_42TGF.jpg" },
  { brand: "Carrier", series: "NSAA", img: "https://images.carriercms.com/image/upload/v1770323415/carrier/hvac-thailand/products/residential/TECH-S_Fix_Speed_Hi-wall.png" },
  { brand: "Carrier", series: "TGF", img: "https://images.carriercms.com/image/upload/v1702653997/carrier/commercial-hvac-asia/products/split-type/42TGF-BP/Standard-Duct-2.jpg" },
  { brand: "Carrier", series: "TSAA", img: "https://images.carriercms.com/image/upload/v1676470516/carrier/hvac-thailand/products/residential/carrier-42TSAA-fancoil.jpg" },
  { brand: "Carrier", series: "TVAB", img: "https://images.carriercms.com/image/upload/v1676470545/carrier/hvac-thailand/products/residential/carrier-42TVAB-fancoil.jpg" },
  { brand: "Carrier", series: "TVDB", img: "https://images.carriercms.com/image/upload/v1770323415/carrier/hvac-thailand/products/residential/Copper_Seal_Inverter_Hi-wall.png" },
  { brand: "Carrier", series: "TVEB", img: "https://images.carriercms.com/image/upload/v1770323415/carrier/hvac-thailand/products/residential/Copper_ION_Inverter_Hi-wall.png" },
  { brand: "Carrier", series: "Way TGF", img: "https://images.carriercms.com/image/upload/v1676054271/carrier/hvac-thailand/products/light-commercial/cassette/carrier-40BGV-fancoil.jpg" },
  { brand: "Carrier", series: "Way TGV", img: "https://images.carriercms.com/image/upload/v1676054271/carrier/hvac-thailand/products/light-commercial/cassette/carrier-40BGV-fancoil.jpg" },
  { brand: "Carrier", code: "FCU-42TGF0601CP", img: "https://images.carriercms.com/image/upload/v1709218101/carrier/commercial-hvac-asia/products/split-type/42TGF-CP/UC_42TGF.jpg" },
  // รูปตัดพื้นขาวสะอาดจากหน้า /apollo-iii/ ของ Carrier เอง (ไฟล์ชื่อ apollo2 เพราะ CMS ใช้ไฟล์เดิม — ตัวเครื่อง 42FGE ตรงรุ่น)
  // แทนรูปเดิมจาก ttair.co.th ที่มีลายน้ำ "TTAir Engineering" + เบอร์โทร/LINE ID ของร้านคู่แข่งคาดอยู่
  { brand: "Carrier", series: "Apollo lll", img: "https://carrierthailand.com/wp-content/uploads/2023/03/apollo2_ac.png" },

  // ---------- Amena / Eminent / Midea ----------
  { brand: "Amena", code: "WL30B-MNVJM/KC30B-RSVJM", img: "https://www.amena-air.com/assets/uploads/product_domestic/image_th/20250204081345_9BB8B4EC-46BF-49BE-9169-F08115CFC712.jpg" },
  { brand: "Amena", code: "WR18B-MNVJE/RC18B-RSVJE", img: "https://www.amena-air.com/assets/uploads/product_domestic/image_th/20250204075658_3A5B8C0B-9844-463E-B439-4FCD76A50362.jpg" },
  { brand: "Amena", code: "DCC36B-MNVTE/KC36B-RSVTE", img: "https://www.amena-air.com/assets/uploads/product_domestic/image_th/20241108044546_60DC850F-353B-4F0F-AB07-612322ED6EDF.jpg" },
  { brand: "Eminent", code: "AVE60FTU / UVE60F", img: "https://eminent.co.th/wp-content/uploads/2025/02/superkoom.jpg" },
  // midea.com มีแต่รูป "ตัวนอก" ของซีรีส์นี้ (ไม่มีรูปตู้ตัวใน MFA-96) — แต่ตรงรุ่น MOUC-96CDN1-R ในรหัสสินค้า
  // รูปสะอาด พื้นขาว ไม่มีลายน้ำ และดีกว่าปล่อยว่าง
  { brand: "Midea", code: "MFA-96CRDN1/MOUC-96CDN1-R", img: "https://web-res.midea.com/content/dam/midea-aem/mbt/hvac-goods/midea-products-category/vrfs/vrf-odu/large-splits-r410a-side-discharge-outdoor-unit-series/gallery1.jpg/jcr:content/renditions/cq5dam.web.5000.5000.jpeg", note: "รูปคอนเดนซิ่ง (ตัวนอก) MOUC-96 — เว็บ Midea ไม่มีรูปตู้ตัวใน" },
];

// โบรชัวร์เพิ่มเติม (ซีรีส์ที่มีรูปอยู่แล้ว แต่ยังไม่มีโบรชัวร์)
export const AC_OFFICIAL_BROCHURES = [
  { brand: "Amena", series: "AMENA WL", url: "https://www.amena-air.com/assets/uploads/product_domestic/catalog/20260206092148_C44B4464-7E3E-4DB2-A68D-FE121EE6C9EA.pdf" },
  { brand: "Amena", series: "AMENA WR", url: "https://www.amena-air.com/assets/uploads/product_domestic/catalog/20260206110417_8410E36F-7FA8-4AFD-A945-A0CF7221EBAA.pdf" },
  { brand: "Amena", series: "Type DCC", url: "https://www.amena-air.com/assets/uploads/product_domestic/catalog/20260206091632_2E85113B-D649-4E09-A962-757BDC1C2BAA.pdf" },
  { brand: "Eminent", series: "SUPER KOOM", url: "https://eminent.co.th/wp-content/uploads/2025/02/7.-Celling-type-Super-Koom-Inverter-2025.pdf" },
  { brand: "Midea", series: "Midea Celest", url: "https://www.midea.com/content/dam/midea-aem/my/air-conditioners/residential-air-conditioners/wall-mounted-inverter/celest-series/Celest.pdf", note: "รหัส MSCE ในเล่มตรงกับรุ่นในร้าน" },
  { brand: "Midea", series: "Midea Numen", url: "https://www.midea.com/content/dam/midea-aem/my/air-conditioners/residential-air-conditioners/wall-mounted-inverter/numen-series/Numen-Catalouge.pdf", note: "รหัส MSNE ตรงเป๊ะ" },
  { brand: "Midea", series: "MTIU", url: "https://www.midea.com/content/dam/midea-aem/my/catalogue/vol-17-2023/vol-17/LCAC-Catalogue-Feb-22-Final-.pdf", note: "LCAC Catalogue — มี MTIU-12/18HWFNX ตรงเป๊ะ" },
  { brand: "Midea", series: "MFA", url: "https://www.midea.com/content/dam/midea-aem/my/catalogue/vol-17-2023/vol-17/CAC-Catalogue-2022.pdf", note: "CAC Catalogue — ครอบครัว MFA large split" },
  { brand: "Samsung", series: "360 CST", url: "https://images.samsung.com/is/content/samsung/p5/in/business/360-cassette-ac/1.pdf" },
  // กลุ่มที่ตรงประเภทแต่โค้ดในเล่มเป็นตลาดอื่น — ให้เจ้าของเลือกเอง
  { brand: "Midea", series: "Ceiling LCAC", url: "https://www.midea.com/content/dam/midea-aem/my/catalogue/vol-17-2023/vol-17/LCAC-Catalogue-Feb-22-Final-.pdf", review: true, note: "เล่มมาเลเซีย โค้ด MUE ไม่ตรงไทย" },
  { brand: "Midea", series: "MTI", url: "https://www.midea.com/content/dam/midea-aem/my/catalogue/vol-17-2023/vol-17/LCAC-Catalogue-Feb-22-Final-.pdf", review: true, note: "เล่มมาเลเซีย โค้ดไม่ตรงไทย" },
  { brand: "Midea", series: "MFGA", url: "https://www.midea.com/content/dam/midea-aem/my/catalogue/vol-17-2023/vol-17/LCAC-Catalogue-Feb-22-Final-.pdf", review: true, note: "เล่มมาเลเซีย โค้ดไม่ตรงไทย" },
  { brand: "Samsung", series: "Cassette WindFree", url: "https://images.samsung.com/is/content/samsung/assets/uk/business/climate/for-installer/SEACE_CAC_Catalogue_2021_dr03db_lr.pdf", review: true, tooBig: true, note: "แคตตาล็อกยุโรป 2021 โค้ดไม่ใช่ -TS ไทย · ไฟล์ 35MB เกินเพดานตัวดึงไฟล์ 15MB (ต้องโหลดเองแล้วอัปโหลด)" },
  { brand: "Samsung", series: "AC", url: "https://images.samsung.com/is/content/samsung/assets/uk/business/climate/for-installer/SEACE_CAC_Catalogue_2021_dr03db_lr.pdf", review: true, tooBig: true, note: "เล่มเดียวกับ WindFree · 35MB เกินเพดาน 15MB" },
  { brand: "LG", series: "VICTORY IKR", url: "https://www.lg.com/content/dam/channel/wcms/th/pdf/2024/catalog/september/Aw_NW_Catalogue_Issue_2(Preview).pdf", review: true, tooBig: true, note: "แคตตาล็อกไทย 2024 (PDF เป็นภาพ) · 43MB เกินเพดาน 15MB" },
];
