// /a/:id — หน้าบทความเต็ม (render จากเซิร์ฟเวอร์ → Google/LINE เห็นเนื้อหาเลย)
const { sbGet, esc, thDate, pageShell, notFound, SITE, PHONE, TEL, LINE_URL } = require("./_shared");

module.exports = async (req, res) => {
  const id = String(req.query.id || "").replace(/[^0-9]/g, "");
  if (!id) return notFound(res, "บทความ");
  try {
    // select=* ทั้งคู่ — ถ้าคอลัมน์ body ยังไม่ถูกเพิ่ม (migration 101) หน้าเว็บยังทำงานได้ (ใช้ลิงก์นอกแทน)
    const [rows, others] = await Promise.all([
      sbGet(`web_articles?id=eq.${id}&active=eq.true&select=*`),
      sbGet(`web_articles?id=neq.${id}&active=eq.true&select=*&order=sort,id&limit=6`),
    ]);
    const a = rows && rows[0];
    if (!a) return notFound(res, "บทความ");

    const canonical = `${SITE}/a/${a.id}`;
    const desc = a.excerpt || String(a.body || "").slice(0, 150) || a.title;
    // เนื้อหา: ข้อความล้วน เว้นบรรทัดว่าง = ขึ้นย่อหน้าใหม่
    const paras = String(a.body || "").split(/\n{2,}/).map((p) => p.trim()).filter(Boolean)
      .map((p) => `<p>${esc(p).replace(/\n/g, "<br>")}</p>`).join("");

    const rel = (others || []).map((o) => {
      const href = o.body ? `/a/${o.id}` : o.link_url;
      if (!href) return "";
      const ext = o.body ? "" : ' target="_blank" rel="noreferrer"';
      return `<a class="rel-card" href="${esc(href)}"${ext}>${o.image_url ? `<img src="${esc(o.image_url)}" alt="${esc(o.title)}" loading="lazy">` : ""}<div class="t">${esc(o.title)}</div></a>`;
    }).filter(Boolean).join("");

    const jsonld = {
      "@context": "https://schema.org", "@type": "Article",
      headline: a.title, description: desc, datePublished: a.created_at,
      image: a.image_url || undefined, mainEntityOfPage: canonical,
      author: { "@type": "Organization", name: "AMC AIR" },
      publisher: { "@type": "Organization", name: "AMC AIR", url: SITE },
    };

    const content = `
      <div class="crumb"><a href="/">หน้าแรก</a> › <a href="/#articles">บทความ</a></div>
      <h1>${esc(a.title)}</h1>
      <div class="meta">📅 ${thDate(a.created_at)} · โดยทีมงาน AMC AIR</div>
      ${a.image_url ? `<div class="cover"><img src="${esc(a.image_url)}" alt="${esc(a.title)}"></div>` : ""}
      ${a.excerpt ? `<div class="lead">${esc(a.excerpt)}</div>` : ""}
      <div class="body">${paras || (a.link_url ? `<p><a class="btn btn-primary" href="${esc(a.link_url)}" target="_blank" rel="noreferrer">อ่านบทความฉบับเต็ม →</a></p>` : "")}</div>
      <div class="cta"><b>มีคำถามเรื่องแอร์? ปรึกษาทีมช่างเราได้เลย</b>
        <div class="btnrow">
          <a class="btn btn-line" href="${LINE_URL}" target="_blank" rel="noreferrer">แชต LINE</a>
          <a class="btn btn-primary" href="${TEL}">โทร ${PHONE}</a>
          <a class="btn btn-ghost" href="/products">ดูสินค้า/บริการ</a>
        </div></div>
      ${rel ? `<div class="rel"><h2>บทความอื่น ๆ</h2><div class="rel-grid">${rel}</div></div>` : ""}`;

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "public, s-maxage=600, stale-while-revalidate=86400");
    res.status(200).send(pageShell({ title: `${a.title} · AMC AIR`, desc, canonical, ogImage: a.image_url, jsonld, content }));
  } catch (e) {
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.status(500).send("โหลดบทความไม่สำเร็จ ลองใหม่ภายหลัง");
  }
};
