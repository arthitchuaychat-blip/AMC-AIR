/* ============================================================
   app-data.js  —  Mock data + helpers for the Materials app
   Exposes window.APP = { categories, teams, materials, txns, fmt, helpers }
   ============================================================ */
(function () {
  "use strict";

  /* ---------- seeded RNG (mulberry32) ---------- */
  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const rnd = rng(20240609);
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
  const between = (a, b) => a + Math.floor(rnd() * (b - a + 1));

  /* ---------- categories ---------- */
  const categories = [
    { id: "pipe",   th: "ท่อทองแดง",      en: "Copper Pipe",  color: "#2563eb", icon: "pipe" },
    { id: "fit",    th: "ข้อต่อ/ฟิตติ้ง", en: "Fittings",     color: "#7c3aed", icon: "elbow" },
    { id: "ref",    th: "น้ำยาแอร์",       en: "Refrigerant",  color: "#0891b2", icon: "tank" },
    { id: "ins",    th: "ฉนวน",           en: "Insulation",   color: "#d97706", icon: "foam" },
    { id: "wire",   th: "สายไฟ",          en: "Wire / Cable", color: "#ea580c", icon: "wire" },
    { id: "elec",   th: "อุปกรณ์ไฟฟ้า",   color2: 1, en: "Electrical", color: "#16a34a", icon: "breaker" },
  ];
  const catById = Object.fromEntries(categories.map((c) => [c.id, c]));

  /* ---------- teams ---------- */
  const teams = [
    { id: "ARM",  name: "Team ARM",  color: "#2563eb", lead: "อาร์ม",  van: "1กข-1881" },
    { id: "KENG", name: "Team KENG", color: "#f97316", lead: "เก่ง",   van: "2คฆ-2042" },
    { id: "BOM",  name: "Team BOM",  color: "#16a34a", lead: "บอม",    van: "3งจ-3370" },
    { id: "PAT",  name: "Team PAT",  color: "#9333ea", lead: "แพท",    van: "4ฉช-4519" },
  ];
  const teamById = Object.fromEntries(teams.map((t) => [t.id, t]));

  /* ---------- materials catalog ---------- */
  // [code, th, en, cat, unit, cost, minStock, stock, icon?]
  const RAW = [
    ["COPP2", "ท่อทองแดงแบบม้วน 1/4\" (6.35mm)", "Copper Coil 1/4\"", "pipe", "เมตร", 62.0, 120, 86, "pipe"],
    ["COPP3", "ท่อทองแดงแบบม้วน 3/8\" (9.52mm)", "Copper Coil 3/8\"", "pipe", "เมตร", 95.33, 100, 142, "pipe"],
    ["COPP4", "ท่อทองแดงแบบม้วน 1/2\" (12.7mm)", "Copper Coil 1/2\"", "pipe", "เมตร", 126.0, 80, 41, "pipe"],
    ["COPM4", "ท่อทองแดง Type M 1/2\"", "Copper Pipe M 1/2\"", "pipe", "เมตร", 86.33, 60, 70, "pipe"],
    ["COPM6", "ท่อทองแดง Type M 3/4\"", "Copper Pipe M 3/4\"", "pipe", "เมตร", 164.5, 40, 18, "pipe"],
    ["COP14", "ข้อต่อตรงทองแดง 1/4\"", "Straight Coupling 1/4\"", "fit", "ชิ้น", 10.0, 80, 210, "couple"],
    ["COP12", "ข้อต่อตรงทองแดง 1/2\"", "Straight Coupling 1/2\"", "fit", "ชิ้น", 12.0, 60, 54, "couple"],
    ["C4514", "ข้องอ 45° 1/4\"", "Elbow 45° 1/4\"", "fit", "ชิ้น", 18.0, 60, 96, "elbow"],
    ["C9014", "ข้องอ 90° 1/4\"", "Elbow 90° 1/4\"", "fit", "ชิ้น", 15.0, 60, 33, "elbow"],
    ["C9012", "ข้องอ 90° 1/2\"", "Elbow 90° 1/2\"", "fit", "ชิ้น", 17.0, 50, 61, "elbow"],
    ["R32", "น้ำยาแอร์ R32 (10kg)", "Refrigerant R32", "ref", "ถัง", 3500.0, 5, 3, "tank"],
    ["R410", "น้ำยาแอร์ R410A (11.3kg)", "Refrigerant R410A", "ref", "ถัง", 4200.0, 4, 6, "tank"],
    ["INS14", "ฉนวนยาง 1/4\"", "Rubber Insulation 1/4\"", "ins", "เมตร", 22.0, 150, 88, "foam"],
    ["INS12", "ฉนวนยาง 1/2\"", "Rubber Insulation 1/2\"", "ins", "เมตร", 28.0, 120, 165, "foam"],
    ["THW25", "สายไฟ THW 2.5", "Wire THW 2.5", "wire", "เมตร", 18.0, 250, 130, "wire"],
    ["THW40", "สายไฟ THW 4.0", "Wire THW 4.0", "wire", "เมตร", 28.0, 200, 240, "wire"],
    ["VCT3", "สายไฟ VCT 3×2.5", "Cable VCT 3×2.5", "wire", "เมตร", 45.0, 120, 58, "wire"],
    ["BRK20", "เบรกเกอร์ 20A", "Breaker 20A", "elec", "ตัว", 185.0, 12, 9, "breaker"],
    ["CAP35", "คาปาซิเตอร์ 35µF", "Capacitor 35µF", "elec", "ตัว", 120.0, 15, 22, "cap"],
    ["BKT", "แท่นรองแอร์", "AC Bracket", "elec", "ชุด", 250.0, 20, 14, "bracket"],
    ["TAPE", "เทปพันท่อ PVC", "PVC Tape", "ins", "ม้วน", 15.0, 60, 47, "tape"],
    ["DRAIN", "ท่อน้ำทิ้ง PVC", "Drain Pipe PVC", "pipe", "เมตร", 12.0, 120, 95, "drain"],
    ["GAS", "แก๊สเชื่อม", "Brazing Gas", "elec", "กระป๋อง", 320.0, 8, 5, "gas"],
    ["SILVER", "ลวดเชื่อมเงิน 5%", "Silver Brazing Rod", "elec", "เส้น", 95.0, 30, 41, "rod"],
  ];
  const materials = RAW.map((r, i) => ({
    id: r[0], code: r[0], th: r[1], en: r[2], cat: r[3], catName: catById[r[3]].th,
    color: catById[r[3]].color, unit: r[4], cost: r[5], minStock: r[6], stock: r[7],
    icon: r[8] || catById[r[3]].icon, idx: i,
  }));
  const matById = Object.fromEntries(materials.map((m) => [m.id, m]));

  /* ---------- date helpers ---------- */
  const TODAY = new Date(2026, 5, 9); // 9 Jun 2026 (months 0-indexed)
  const dayMs = 86400000;
  function dstr(d) { return d.toISOString().slice(0, 10); }
  const TODAY_STR = dstr(TODAY);

  /* ---------- generate transactions ----------
     types: withdraw | return | damage | purchase
     record: { date, ts, team, jobNo, mat, qty, value, type, reason? }            */
  const txns = [];
  const DAMAGE_REASONS = ["ชำรุด", "หาย", "หมดอายุ", "ใช้ผิดงาน"];
  const damageCounter = {};
  let jobSeq = {};

  const DAYS = 545; // ~18 months of history
  for (let d = DAYS - 1; d >= 0; d--) {
    const date = new Date(TODAY.getTime() - d * dayMs);
    const dow = date.getDay();
    if (dow === 0) continue; // closed Sundays
    const ds = dstr(date);
    const ymd = ds.replace(/-/g, "").slice(2); // yymmdd

    // each team runs 1–3 jobs/day
    teams.forEach((team) => {
      const jobs = between(1, 3);
      for (let j = 0; j < jobs; j++) {
        jobSeq[ds] = (jobSeq[ds] || 0) + 1;
        const jobNo = "JB-" + ymd + "-" + String(jobSeq[ds]).padStart(2, "0");
        const nItems = between(2, 5);
        const used = new Set();
        for (let k = 0; k < nItems; k++) {
          const m = pick(materials);
          if (used.has(m.id)) continue;
          used.add(m.id);
          const qty = m.cost > 1000 ? between(1, 2) : (m.unit === "เมตร" ? between(4, 40) : between(2, 24));
          txns.push({ date: ds, team: team.id, jobNo, mat: m.id, qty, value: +(qty * m.cost).toFixed(2), type: "withdraw" });
          // return a portion (left over)
          if (rnd() < 0.6) {
            const ret = Math.floor(qty * (rnd() * 0.35));
            if (ret > 0) txns.push({ date: ds, team: team.id, jobNo, mat: m.id, qty: ret, value: +(ret * m.cost).toFixed(2), type: "return" });
          }
          // occasional damage
          if (rnd() < 0.08) {
            const dq = between(1, Math.max(1, Math.floor(qty * 0.2)));
            txns.push({ date: ds, team: team.id, jobNo, mat: m.id, qty: dq, value: +(dq * m.cost).toFixed(2), type: "damage", reason: pick(DAMAGE_REASONS) });
          }
        }
      }
    });

    // morning purchasing (restock) — a few SKUs per day
    const nBuy = between(2, 6);
    const bought = new Set();
    for (let b = 0; b < nBuy; b++) {
      const m = pick(materials);
      if (bought.has(m.id)) continue;
      bought.add(m.id);
      const qty = m.unit === "เมตร" ? between(50, 300) : (m.cost > 1000 ? between(2, 6) : between(20, 120));
      txns.push({ date: ds, team: null, jobNo: "PO-" + ymd + "-" + String(b + 1).padStart(2, "0"), mat: m.id, qty, value: +(qty * m.cost).toFixed(2), type: "purchase" });
    }
  }

  /* ---------- aggregation helpers ---------- */
  function startOf(period, ref) {
    const r = ref || TODAY;
    if (period === "day") return new Date(r.getFullYear(), r.getMonth(), r.getDate());
    if (period === "month") return new Date(r.getFullYear(), r.getMonth(), 1);
    if (period === "year") return new Date(r.getFullYear(), 0, 1);
    return new Date(2000, 0, 1); // all
  }
  function inPeriod(rec, period, ref) {
    if (period === "all") return true;
    const s = startOf(period, ref);
    const t = new Date(rec.date + "T00:00:00");
    if (period === "day") return rec.date === dstr(ref || TODAY);
    return t >= s;
  }
  function filter(opts) {
    const { period = "all", ref = TODAY, type, team } = opts || {};
    return txns.filter((r) =>
      (!type || r.type === type) &&
      (team === undefined || r.team === team) &&
      inPeriod(r, period, ref)
    );
  }
  function sum(recs, key) { return recs.reduce((a, r) => a + (r[key] || 0), 0); }

  // totals by team for a given type+period -> { ARM:{value,qty}, ... , _total:{} }
  function byTeam(type, period, ref) {
    const out = { _total: { value: 0, qty: 0, count: 0 } };
    teams.forEach((t) => (out[t.id] = { value: 0, qty: 0, count: 0 }));
    filter({ type, period, ref }).forEach((r) => {
      if (!r.team) return;
      out[r.team].value += r.value; out[r.team].qty += r.qty; out[r.team].count++;
      out._total.value += r.value; out._total.qty += r.qty; out._total.count++;
    });
    return out;
  }

  // time series for a type over last N buckets of a granularity
  function series(type, gran, n) {
    const out = [];
    for (let i = n - 1; i >= 0; i--) {
      let label, from, to;
      const r = new Date(TODAY);
      if (gran === "day") {
        const d = new Date(TODAY.getTime() - i * dayMs);
        from = dstr(d); to = from;
        label = d.toLocaleDateString("th-TH", { day: "numeric", month: "short" });
      } else if (gran === "month") {
        const d = new Date(r.getFullYear(), r.getMonth() - i, 1);
        const e = new Date(r.getFullYear(), r.getMonth() - i + 1, 0);
        from = dstr(d); to = dstr(e);
        label = d.toLocaleDateString("th-TH", { month: "short", year: "2-digit" });
      } else {
        const y = r.getFullYear() - i;
        from = y + "-01-01"; to = y + "-12-31";
        label = String(y + 543).slice(2); // พ.ศ. 2 digit
      }
      const v = txns.filter((x) => x.type === type && x.date >= from && x.date <= to);
      out.push({ label, value: sum(v, "value"), qty: sum(v, "qty") });
    }
    return out;
  }

  // purchase suggestion: stock below min
  function purchaseSuggestions() {
    return materials
      .filter((m) => m.stock < m.minStock)
      .map((m) => ({ ...m, need: m.minStock - m.stock, orderValue: +((m.minStock - m.stock) * m.cost).toFixed(2) }))
      .sort((a, b) => (a.stock / a.minStock) - (b.stock / b.minStock));
  }

  /* ---------- today's live queues (for admin/technician) ---------- */
  function todays(type) {
    return txns.filter((r) => r.date === TODAY_STR && r.type === type);
  }

  /* ---------- formatting ---------- */
  const fmtBaht = (n) => "฿" + Math.round(n).toLocaleString("en-US");
  const fmtBaht2 = (n) => "฿" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtNum = (n) => Math.round(n).toLocaleString("en-US");
  const fmtCompact = (n) => {
    if (n >= 1e6) return "฿" + (n / 1e6).toFixed(2) + "M";
    if (n >= 1e3) return "฿" + (n / 1e3).toFixed(1) + "K";
    return "฿" + Math.round(n);
  };
  function thDate(d) {
    return (d || TODAY).toLocaleDateString("th-TH", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  }

  window.APP = {
    categories, catById, teams, teamById, materials, matById, txns,
    TODAY, TODAY_STR,
    helpers: { filter, sum, byTeam, series, purchaseSuggestions, todays, startOf, dstr },
    fmt: { fmtBaht, fmtBaht2, fmtNum, fmtCompact, thDate },
  };
})();
