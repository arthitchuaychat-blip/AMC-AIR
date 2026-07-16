// /p/:code — หน้ารายละเอียดสินค้า (render จากเซิร์ฟเวอร์ + Product schema → Google โชว์ราคาได้)
const { sbGet, esc, baht, pageShell, notFound, SITE, PHONE, TEL, LINE_URL } = require("./_shared");

const KIND_TH = { ac: "เครื่องปรับอากาศ", material: "อะไหล่/วัสดุ", service: "บริการ" };
const SVC_TH = { "sv-install": "ติดตั้ง", "sv-clean": "ล้าง", "sv-move": "ย้าย", "sv-repair": "ซ่อม", "sv-remove": "รื้อถอน", "sv-other": "อื่นๆ" };
const TYPE_TH = { "Wall type": "ติดผนัง", "Ceiling type": "แขวนใต้ฝ้า", "Cassette 4 way type": "ฝังฝ้า 4 ทิศ", "Cassette 1 way type": "ฝังฝ้า 1 ทิศ", "Duct Type": "ต่อท่อลม", "Floor Standing": "ตู้ตั้ง" };

module.exports = async (req, res) => {
  const code = String(req.query.code || "").trim();
  if (!code) return notFound(res, "สินค้า");
  try {
    const rows = await sbGet(`web_products?code=eq.${encodeURIComponent(code)}&select=*`);
    const p = rows && rows[0];
    if (!p) return notFound(res, "สินค้า");

    const name = p.name_th || p.name_en || p.code;
    const canonical = `${SITE}/p/${encodeURIComponent(p.code)}`;
    const desc = [KIND_TH[p.kind], p.brand, p.btu ? `${Number(p.btu).toLocaleString("en-US")} BTU` : "", TYPE_TH[p.ac_type] || ""]
      .filter(Boolean).join(" · ") || `${name} จาก AMC AIR`;

    // ข้อมูลระดับรุ่น: ขนาดอื่นในรุ่นเดียวกัน + คุณสมบัติ/โบรชัวร์ (ac_series — mig 106; ไม่มีก็ข้าม)
    let siblings = [], sinfo = null;
    if (p.kind === "ac" && p.series) {
      try { siblings = await sbGet(`web_products?kind=eq.ac&brand=eq.${encodeURIComponent(p.brand || "")}&series=eq.${encodeURIComponent(p.series)}&select=code,btu&order=btu`); } catch (e) {}
      try { const r = await sbGet(`ac_series?brand=eq.${encodeURIComponent(p.brand || "")}&name=eq.${encodeURIComponent(p.series)}&select=*`); sinfo = r && r[0]; } catch (e) {}
    }

    // สินค้าใกล้เคียง: หมวดเดียวกัน (แอร์ = ยี่ห้อเดียวกันก่อน ถ้ามี)
    let rel = [];
    try {
      if (p.kind === "ac" && p.brand) rel = await sbGet(`web_products?kind=eq.ac&brand=eq.${encodeURIComponent(p.brand)}&code=neq.${encodeURIComponent(p.code)}&select=code,name_th,name_en,photo_url,sale_price&limit=3`);
      if (rel.length < 3) {
        const more = await sbGet(`web_products?kind=eq.${p.kind}&code=neq.${encodeURIComponent(p.code)}&select=code,name_th,name_en,photo_url,sale_price&limit=6`);
        for (const m of more) if (rel.length < 3 && !rel.find((x) => x.code === m.code)) rel.push(m);
      }
    } catch (e) { /* ไม่มีสินค้าใกล้เคียงก็ข้าม */ }

    // คุณสมบัติ: ใช้ของ "รุ่น" ก่อน (ใช้ร่วมทุกขนาด) ถ้าไม่มีค่อยใช้ของตัวสินค้า
    const feats = String((sinfo && sinfo.features) || p.features || "").split(/\n+/).map((f) => f.trim()).filter(Boolean)
      .map((f) => `<div>${esc(f)}</div>`).join("");
    const relHtml = rel.map((r) => `<a class="rel-card" href="/p/${encodeURIComponent(r.code)}">
      ${r.photo_url ? `<img src="${esc(r.photo_url)}" alt="${esc(r.name_th || r.code)}" loading="lazy">` : ""}
      <div class="t">${esc(r.name_th || r.name_en || r.code)}</div>
      ${r.sale_price ? `<div class="pr">${baht(r.sale_price)}</div>` : ""}</a>`).join("");

    const jsonld = {
      "@context": "https://schema.org", "@type": "Product",
      name, sku: p.code, description: p.description || desc,
      image: p.photo_url || undefined,
      brand: p.brand ? { "@type": "Brand", name: p.brand } : undefined,
      offers: p.sale_price ? {
        "@type": "Offer", price: Number(p.sale_price), priceCurrency: "THB",
        availability: "https://schema.org/InStock", url: canonical,
        seller: { "@type": "Organization", name: "AMC AIR" },
      } : undefined,
    };

    const nfmt = (n) => Number(n).toLocaleString("en-US");
    // บริการมีช่วง BTU (btu_min–btu_max) · แอร์เป็นค่าเดี่ยว
    const btuChip = p.btu_min != null && p.btu_max != null && Number(p.btu_min) !== Number(p.btu_max)
      ? `${nfmt(p.btu_min)}–${nfmt(p.btu_max)} BTU`
      : (p.btu || p.btu_min) ? `${nfmt(p.btu || p.btu_min)} BTU` : "";
    const chips = [
      p.kind === "service" && SVC_TH[p.category] ? `<span>🛠️ ${SVC_TH[p.category]}</span>` : "",
      p.brand ? `<span>🏷️ ${esc(p.brand)}</span>` : "",
      btuChip ? `<span>❄️ ${btuChip}</span>` : "",
      TYPE_TH[p.ac_type] ? `<span>📐 ${TYPE_TH[p.ac_type]}</span>` : "",
      p.unit ? `<span>หน่วย: ${esc(p.unit)}</span>` : "",
    ].filter(Boolean).join("");

    const content = `
      <div class="crumb"><a href="/">หน้าแรก</a> › <a href="/products">สินค้า</a> › ${esc(KIND_TH[p.kind] || "")}</div>
      <div class="pgrid">
        <div class="pimg">${p.photo_url ? `<img src="${esc(p.photo_url)}" alt="${esc(name)}">` : `<span class="noimg">❄️</span>`}</div>
        <div>
          <h1 style="font-size:clamp(21px,3vw,28px)">${esc(name)}</h1>
          <div class="chips">${chips}</div>
          <div class="price">${p.sale_price ? baht(p.sale_price) : "สอบถามราคา"} ${p.sale_price ? `<small>/ ${esc(p.unit || "หน่วย")}</small>` : ""}</div>
          ${p.sale_price ? (() => {
            // ราคาชำระด้วยบัตรเครดิต: รูดเต็ม +4% · ผ่อน 10 เดือน +14% (ปัดขึ้นเป็นบาทเต็ม)
            const full = Math.ceil(Number(p.sale_price) * 1.04), inst = Math.ceil(Number(p.sale_price) * 1.14);
            return `<div class="paytable">
              <div class="prow cash"><span>💵 เงินสด / โอน</span><b>${baht(p.sale_price)}</b></div>
              <div class="prow"><span>💳 บัตรเครดิต รูดเต็ม</span><b>${baht(full)}</b></div>
              <div class="prow"><span>💳 ผ่อนบัตร 10 เดือน</span><span><b>${baht(inst)}</b> <small>≈ ${baht(Math.ceil(inst / 10))}/เดือน</small></span></div>
            </div>`;
          })() : ""}
          ${p.power_cost_year ? `<div class="pcost">⚡ ค่าไฟประมาณ ${baht(p.power_cost_year)}/ปี</div>` : ""}
          ${(() => {
            // ตารางสเปครายขนาด (mig 106) — โชว์เฉพาะช่องที่มีข้อมูล
            const rows = [["รุ่น/ซีรีส์", p.series], ["รหัสรุ่น", p.code], ["ขนาด", p.btu ? nfmt(p.btu) + " BTU" : ""], ["กำลังไฟ", p.voltage],
              ["ชนิดน้ำยา", p.refrigerant], ["ค่า SEER", p.seer], ["ขนาดท่อน้ำยา", p.pipe_size], ["ฉลากประหยัดไฟ", p.energy_label]].filter(([, v]) => v);
            return rows.length > 2 ? `<div class="spectable">${rows.map(([l, v]) => `<div class="srow"><span>${l}</span><b>${esc(String(v))}</b></div>`).join("")}</div>` : "";
          })()}
          ${p.warranty ? `<div class="pwarr">🛡️ <b>การรับประกัน:</b> ${esc(p.warranty)}</div>` : ""}
          ${siblings.length > 1 ? `<div style="font-size:13.5px;font-weight:800;margin-top:6px">ขนาดอื่นในรุ่น ${esc(p.series)}:</div>
          <div class="sizes">${siblings.map((s) => `<a class="${s.code === p.code ? "on" : ""}" href="/p/${encodeURIComponent(s.code)}">${nfmt(s.btu)} BTU</a>`).join("")}</div>` : ""}
          ${feats ? `<div class="feats">${feats}</div>` : ""}
          ${p.description ? `<p style="font-size:14.5px;color:var(--ink-2)">${esc(p.description).replace(/\n/g, "<br>")}</p>` : ""}
          <div class="btnrow" style="justify-content:flex-start;margin-top:16px">
            <a class="btn btn-primary" href="/?add=${encodeURIComponent(p.code)}">🛒 ใส่ตะกร้า / สั่งซื้อ</a>
            <a class="btn btn-line" href="${LINE_URL}" target="_blank" rel="noreferrer">สอบถามผ่าน LINE</a>
            <a class="btn btn-ghost" href="${TEL}">โทร ${PHONE}</a>
            ${sinfo && sinfo.brochure_url ? `<a class="btn btn-ghost" href="${esc(sinfo.brochure_url)}" target="_blank" rel="noreferrer">📄 โบรชัวร์</a>` : ""}
          </div>
          <div class="note">* ราคาเป็นการประมาณการ ทีมงานจะติดต่อยืนยันราคาจริง ค่าติดตั้ง และนัดหมายก่อนเสมอ · ${esc(KIND_TH[p.kind] === "เครื่องปรับอากาศ" ? "แถมสำรวจหน้างานฟรีในพื้นที่บริการ" : "ออกใบกำกับภาษีได้")}</div>
        </div>
      </div>
      ${relHtml ? `<div class="rel"><h2>สินค้าใกล้เคียง</h2><div class="rel-grid">${relHtml}</div></div>` : ""}`;

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "public, s-maxage=600, stale-while-revalidate=86400");
    res.status(200).send(pageShell({ title: `${name} · AMC AIR`, desc: p.description || desc, canonical, ogImage: p.photo_url, jsonld, content }));
  } catch (e) {
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.status(500).send("โหลดสินค้าไม่สำเร็จ ลองใหม่ภายหลัง");
  }
};
