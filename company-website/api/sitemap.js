// /sitemap.xml — แผนผังเว็บอัปเดตเองอัตโนมัติ (หน้าแรก + หน้าสินค้า + สินค้าทุกตัว + บทความทุกเรื่อง)
const { sbGet, esc, SITE } = require("./_shared");

module.exports = async (req, res) => {
  let products = [], articles = [];
  try { products = await sbGet("web_products?select=code&limit=1000"); } catch (e) {}
  try { articles = await sbGet("web_articles?active=eq.true&select=id,created_at&order=id&limit=1000"); } catch (e) {}

  const urls = [
    { loc: `${SITE}/`, priority: "1.0" },
    { loc: `${SITE}/products`, priority: "0.9" },
    ...products.map((p) => ({ loc: `${SITE}/p/${encodeURIComponent(p.code)}`, priority: "0.7" })),
    ...articles.map((a) => ({ loc: `${SITE}/a/${a.id}`, lastmod: (a.created_at || "").slice(0, 10), priority: "0.6" })),
  ];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${esc(u.loc)}</loc>${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ""}<priority>${u.priority}</priority></url>`).join("\n")}
</urlset>`;

  res.setHeader("Content-Type", "application/xml; charset=utf-8");
  res.setHeader("Cache-Control", "public, s-maxage=3600, stale-while-revalidate=86400");
  res.status(200).send(xml);
};
