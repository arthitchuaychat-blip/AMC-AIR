# สูตร AppSheet ที่ต้องใช้ (เตรียมไว้ล่วงหน้า — ก๊อปวางเมื่อถึงขั้นตอน)

> ใช้ตอนตั้งค่าใน AppSheet (Data → Columns / Security) — ผมจะบอกว่าวางตรงไหนตอนพาทำ

## ตาราง Materials — เพิ่ม Virtual Columns

**CurrentStock** (Type: Number) — ยอดคงเหลือปัจจุบัน (คำนวณจากธุรกรรมจริง)
```
[Stock]
+ SUM(SELECT(Transactions[Qty], AND([MaterialCode] = [_THISROW].[Code], IN([Type], LIST("purchase","return")))))
- SUM(SELECT(Transactions[Qty], AND([MaterialCode] = [_THISROW].[Code], IN([Type], LIST("withdraw","damage")))))
```

**StockValue** (Type: Price/Number) — มูลค่าคงเหลือ
```
[CurrentStock] * [Cost]
```

**IsLow** (Type: Yes/No) — ต่ำกว่าขั้นต่ำหรือไม่
```
[CurrentStock] < [MinStock]
```

**NeedToOrder** (Type: Number) — จำนวนที่ต้องสั่งเพิ่ม
```
MAX(LIST(0, [MinStock] - [CurrentStock]))
```

## ตาราง Transactions

- ตั้ง **MaterialCode** เป็น Type = **Ref** → ตาราง Materials (อ้างด้วยคอลัมน์ Code)
- ตั้ง **Team** เป็น Type = **Ref** → ตาราง Teams
- ตั้ง **Type** เป็น Type = **Enum** ค่าที่เลือกได้: `withdraw, return, purchase, damage`
- ตั้ง **Date** ค่าเริ่มต้น (Initial value): `TODAY()`
- **Value** — ใส่ App formula ให้คิดเอง:
```
[Qty] * [MaterialCode].[Cost]
```
- **RecordedBy** — Initial value:
```
USEREMAIL()
```

## สิทธิ์ตามบทบาท (Security Filter)

**บทบาทผู้ใช้ปัจจุบัน** (ใช้ซ้ำได้หลายที่):
```
LOOKUP(USEREMAIL(), "Users", "Email", "Role")
```

**Security Filter ของตาราง Transactions** (ช่างเห็นเฉพาะทีมตัวเอง · ธุรการ/ผู้บริหารเห็นหมด):
```
OR(
  LOOKUP(USEREMAIL(), "Users", "Email", "Role") <> "tech",
  [Team] = LOOKUP(USEREMAIL(), "Users", "Email", "Team")
)
```

**ผู้บริหาร = อ่านอย่างเดียว** (ตั้งใน Table → Are updates allowed?):
```
IF(LOOKUP(USEREMAIL(), "Users", "Email", "Role") = "exec", "READ_ONLY", "ALL_CHANGES")
```

## รายการที่ต้องสั่งซื้อ (ทำเป็น Slice ของ Materials)
Row filter condition:
```
[CurrentStock] < [MinStock]
```
