// _shared.js — ตัวช่วยกลางของหน้า SSR (บทความ /a/:id · สินค้า /p/:code · sitemap)
// ขึ้นต้นด้วย _ = Vercel ไม่เปิดเป็น endpoint · คีย์ anon เป็นคีย์สาธารณะ (ตัวเดียวกับที่ฝังใน index.html)
const SB_URL = process.env.SUPABASE_URL || "https://tpyrlxhoyghawqvsphfj.supabase.co";
const SB_KEY = process.env.SUPABASE_ANON || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRweXJseGhveWdoYXdxdnNwaGZqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA5ODk3NzYsImV4cCI6MjA5NjU2NTc3Nn0.OnfQ4VipqPlEpg5PfBGXhx44oSpqY1ifW1AlnY52p0Q";

const SITE = "https://www.amcair.net";
const PHONE = "099-262-9090";
const TEL = "tel:0992629090";
const LINE_URL = "https://lin.ee/r42KRPY";

async function sbGet(path) {
  const r = await fetch(`${SB_URL}/rest/v1/${path}`, {
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
  });
  if (!r.ok) throw new Error(`supabase ${r.status}: ${await r.text()}`);
  return r.json();
}

const esc = (s) => String(s == null ? "" : s)
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const baht = (n) => "฿" + (Number(n) || 0).toLocaleString("en-US", { maximumFractionDigits: 0 });

const thDate = (iso) => {
  try { return new Date(iso).toLocaleDateString("th-TH", { year: "numeric", month: "long", day: "numeric" }); }
  catch { return ""; }
};

// โครงหน้าเว็บย่อย — โทน/ฟอนต์เดียวกับหน้าแรก
function pageShell({ title, desc, canonical, ogImage, jsonld, content }) {
  return `<!DOCTYPE html>
<html lang="th">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<!-- Google Tag Manager -->
<script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','GTM-KNT3RKJB');</script>
<!-- End Google Tag Manager -->
<!-- Google tag (gtag.js) -->
<script async src="https://www.googletagmanager.com/gtag/js?id=G-D33ZBKXFH9"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());

  gtag('config', 'G-D33ZBKXFH9');
</script>
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}" />
<link rel="canonical" href="${esc(canonical)}" />
<meta property="og:type" content="article" />
<meta property="og:site_name" content="AMC AIR" />
<meta property="og:title" content="${esc(title)}" />
<meta property="og:description" content="${esc(desc)}" />
<meta property="og:url" content="${esc(canonical)}" />
${ogImage ? `<meta property="og:image" content="${esc(ogImage)}" />` : ""}
<meta name="twitter:card" content="summary_large_image" />
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Crect width='24' height='24' rx='5' fill='%230ea5e9'/%3E%3Cg fill='none' stroke='white' stroke-width='1.5' stroke-linecap='round'%3E%3Crect x='4' y='6' width='16' height='8' rx='1.5'/%3E%3Cpath d='M7 14v2M11 14v3M15 14v2'/%3E%3C/g%3E%3C/svg%3E" />
${jsonld ? `<script type="application/ld+json">${JSON.stringify(jsonld)}</script>` : ""}
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Thai:wght@400;500;600;700&family=Noto+Sans+Thai:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
<style>
:root{--primary:#0ea5e9;--primary-dark:#0369a1;--bg-soft:#f1f6fb;--ink:#0f1729;--ink-2:#475569;--ink-3:#94a3b8;--line:#e4e9f0;
--shadow-sm:0 2px 10px rgba(15,23,41,.06);--shadow:0 12px 36px rgba(15,23,41,.10)}
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'IBM Plex Sans Thai','Noto Sans Thai',system-ui,sans-serif;color:var(--ink);background:#fff;line-height:1.75;-webkit-font-smoothing:antialiased}
a{color:inherit;text-decoration:none}
img{max-width:100%;display:block}
.wrap{width:100%;max-width:860px;margin:0 auto;padding:0 22px}
header{position:sticky;top:0;z-index:50;background:rgba(255,255,255,.92);backdrop-filter:blur(12px);box-shadow:var(--shadow-sm)}
header .bar{display:flex;align-items:center;justify-content:space-between;height:64px}
.logo{display:flex;align-items:center;gap:10px;font-weight:800;font-size:18px}
.logo .mark{width:38px;height:38px;border-radius:11px;background:linear-gradient(135deg,var(--primary),var(--primary-dark));display:flex;align-items:center;justify-content:center;color:#fff}
.logo .mark svg{width:22px;height:22px}
.logo b span{color:var(--primary)}
nav{display:flex;gap:4px;font-weight:600;font-size:14px;color:var(--ink-2)}
nav a{padding:8px 12px;border-radius:9px}
nav a:hover{color:var(--primary);background:var(--bg-soft)}
@media(max-width:640px){nav .hide-m{display:none}}
main{padding:34px 0 60px}
.crumb{font-size:13px;color:var(--ink-3);margin-bottom:18px}
.crumb a{color:var(--primary);font-weight:600}
h1{font-size:clamp(24px,4vw,36px);font-weight:800;line-height:1.25;letter-spacing:-.01em;margin-bottom:10px}
.meta{font-size:13.5px;color:var(--ink-3);margin-bottom:22px}
.cover{border-radius:16px;overflow:hidden;border:1px solid var(--line);box-shadow:var(--shadow-sm);margin-bottom:26px}
.lead{font-size:16.5px;color:var(--ink-2);font-weight:600;margin-bottom:18px}
.body p{margin-bottom:16px;font-size:15.5px;color:#1e293b}
.cta{margin-top:34px;background:var(--bg-soft);border:1px solid var(--line);border-radius:16px;padding:22px;text-align:center}
.cta b{font-size:17px;display:block;margin-bottom:12px}
.btnrow{display:flex;gap:10px;justify-content:center;flex-wrap:wrap}
.btn{display:inline-flex;align-items:center;gap:8px;font-weight:700;font-size:14.5px;padding:12px 22px;border-radius:12px;transition:.15s}
.btn-primary{background:var(--primary);color:#fff}.btn-primary:hover{background:var(--primary-dark)}
.btn-line{background:#06c755;color:#fff}.btn-line:hover{filter:brightness(.94)}
.btn-ghost{background:#fff;color:var(--ink);border:1.5px solid var(--line)}.btn-ghost:hover{border-color:var(--primary);color:var(--primary)}
.rel{margin-top:44px}
.rel h2{font-size:19px;font-weight:800;margin-bottom:14px}
.rel-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}
@media(max-width:640px){.rel-grid{grid-template-columns:1fr 1fr}}
.rel-card{border:1px solid var(--line);border-radius:13px;overflow:hidden;background:#fff;box-shadow:var(--shadow-sm);transition:.15s;font-size:13.5px;font-weight:700}
.rel-card:hover{box-shadow:var(--shadow);transform:translateY(-2px)}
.rel-card img{aspect-ratio:16/10;object-fit:cover;width:100%}
.rel-card .t{padding:10px 12px}
.rel-card .pr{color:var(--primary);font-weight:800;padding:0 12px 10px;font-size:14px}
/* product layout */
.pgrid{display:grid;grid-template-columns:1fr 1fr;gap:30px;align-items:start}
@media(max-width:700px){.pgrid{grid-template-columns:1fr}}
.pimg{border:1px solid var(--line);border-radius:16px;overflow:hidden;background:var(--bg-soft);aspect-ratio:1/1;display:flex;align-items:center;justify-content:center}
.pimg img{width:100%;height:100%;object-fit:cover}
.pimg .noimg{font-size:60px}
.chips{display:flex;gap:8px;flex-wrap:wrap;margin:10px 0 14px}
.chips span{font-size:12.5px;font-weight:700;background:var(--bg-soft);border:1px solid var(--line);border-radius:99px;padding:5px 12px;color:var(--ink-2)}
.price{font-size:30px;font-weight:800;margin:6px 0 2px}
.price small{font-size:13px;color:var(--ink-3);font-weight:600}
.pcost{color:#0a7d2c;font-weight:700;font-size:14px;margin-bottom:12px}
.feats{margin:14px 0;display:flex;flex-direction:column;gap:6px}
.feats div{font-size:14px;color:var(--ink-2);display:flex;gap:8px}
.feats div::before{content:"✓";color:var(--primary);font-weight:800}
.note{font-size:12.5px;color:var(--ink-3);margin-top:10px}
.paytable{margin:12px 0 4px;border:1px solid var(--line);border-radius:13px;overflow:hidden}
.paytable .prow{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:10px 14px;font-size:14px;border-bottom:1px solid var(--line)}
.paytable .prow:last-child{border-bottom:none}
.paytable .prow span{color:var(--ink-2);font-weight:600}
.paytable .prow b{font-size:15.5px}
.paytable .prow small{color:var(--ink-3);font-weight:600}
.paytable .prow.cash{background:var(--bg-soft)}
.paytable .prow.cash b{color:var(--primary-dark)}
.spectable{margin:12px 0 4px;border:1px solid var(--line);border-radius:13px;overflow:hidden;font-size:14px}
.spectable .srow{display:flex;justify-content:space-between;gap:12px;padding:8px 14px;border-bottom:1px solid var(--line)}
.spectable .srow:last-child{border-bottom:none}
.spectable .srow span{color:var(--ink-2);font-weight:600}
.sizes{display:flex;gap:6px;flex-wrap:wrap;margin:8px 0 4px}
.sizes a{font-size:13px;font-weight:700;padding:7px 14px;border-radius:99px;border:1.5px solid var(--line)}
.sizes a:hover{border-color:var(--primary)}
.sizes a.on{background:var(--primary);color:#fff;border-color:var(--primary)}
footer{background:#0b1220;color:#94a3b8;padding:26px 0;font-size:13px;text-align:center}
footer a{color:#cbd5e1;font-weight:700}
.fab{position:fixed;right:16px;bottom:16px;z-index:80;display:flex;flex-direction:column;gap:10px}
.fab a{width:52px;height:52px;border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 8px 22px rgba(0,0,0,.25)}
.fab svg{width:25px;height:25px;color:#fff}
.fab .call{background:var(--primary)}.fab .line{background:#06c755}
</style>
</head>
<body>
<!-- Google Tag Manager (noscript) -->
<noscript><iframe src="https://www.googletagmanager.com/ns.html?id=GTM-KNT3RKJB"
height="0" width="0" style="display:none;visibility:hidden"></iframe></noscript>
<!-- End Google Tag Manager (noscript) -->
<header><div class="wrap bar">
  <a href="/" class="logo"><span class="mark"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8h18M3 12h18M3 16h12"/><circle cx="19" cy="16" r="2"/></svg></span><b>AMC<span> AIR</span></b></a>
  <nav>
    <a href="/#services" class="hide-m">บริการ</a>
    <a href="/products">สินค้า</a>
    <a href="/#portfolio" class="hide-m">ผลงาน</a>
    <a href="/#articles" class="hide-m">บทความ</a>
    <a href="/#contact">ติดต่อ</a>
  </nav>
</div></header>
<main><div class="wrap">
${content}
</div></main>
<footer><div class="wrap">© AMC AIR · จำหน่าย–ติดตั้ง–ล้าง–ซ่อมแอร์ครบวงจร · โทร <a href="${TEL}">${PHONE}</a></div></footer>
<div class="fab">
  <a class="line" href="${LINE_URL}" target="_blank" rel="noreferrer" aria-label="แชต LINE"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.5 2 2 5.7 2 10.2c0 4 3.6 7.4 8.5 8 .3.07.8.22.9.5.1.26.07.66.03.92l-.14.86c-.04.26-.2 1 .9.55s5.9-3.5 8.05-6C21.4 13.5 22 11.9 22 10.2 22 5.7 17.5 2 12 2z"/></svg></a>
  <a class="call" href="${TEL}" aria-label="โทร"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3-8.6A2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z"/></svg></a>
</div>
</body>
</html>`;
}

function notFound(res, what) {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.status(404).send(pageShell({
    title: `ไม่พบ${what} · AMC AIR`, desc: "ไม่พบหน้าที่ต้องการ", canonical: SITE + "/",
    content: `<h1>ไม่พบ${what}</h1><p class="lead">หน้านี้อาจถูกลบหรือย้ายแล้ว</p>
      <div class="btnrow" style="justify-content:flex-start;margin-top:18px">
        <a class="btn btn-primary" href="/">← กลับหน้าแรก</a>
        <a class="btn btn-ghost" href="/products">ดูสินค้าทั้งหมด</a>
      </div>`,
  }));
}

module.exports = { sbGet, esc, baht, thDate, pageShell, notFound, SITE, PHONE, TEL, LINE_URL };
