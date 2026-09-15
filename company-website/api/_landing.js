const { esc, SITE, TEL, LINE_URL } = require('./_shared');
const catalog = require('../landing-catalog');

// Only approved public page slugs can be rendered. No user HTML or arbitrary query filters.
function safeUrl(value) {
  if (!value || typeof value !== 'string') return '';
  try {
    const url = new URL(value, SITE + '/');
    return ['https:', 'http:'].includes(url.protocol) ? url.href : '';
  } catch { return ''; }
}

function scene() {
  return `<div class="fa-scene" role="img" aria-label="กราฟิกเครื่องปรับอากาศและการไหลของอากาศ"><div class="fa-grid"></div><div class="fa-orbit"></div><div class="fa-ac"><span></span></div><div class="fa-filter"></div><div class="fa-stream"></div><div class="fa-base"></div><span class="fa-art-label one">AIR CONDITIONING</span><span class="fa-art-label two">INSTALLATION</span><span class="fa-art-label three">AMC AIR</span></div>`;
}

function productLink(page) {
  const params = new URLSearchParams({ kind: page.kind });
  if (page.filterType) params.set('type', page.filterType);
  if (page.service) params.set('service', page.service);
  // Cassette landing includes one-way and four-way. The catalog can search both by name/type.
  if (page.type === 'cassette') { params.delete('type'); params.set('q', 'ฝังฝ้า'); }
  return '/?' + params.toString() + '#products';
}

function renderBanners(banners) {
  const valid = banners.filter(b => safeUrl(b.image_url));
  if (!valid.length) return '';
  return `<section class="fa-banners" data-fa-banners aria-label="ภาพปก AMC AIR">
    ${valid.map((banner, index) => {
      const image = `<img src="${esc(safeUrl(banner.image_url))}" alt="${esc(banner.caption || 'ภาพปก AMC AIR ' + (index + 1))}" loading="${index ? 'lazy' : 'eager'}"${index ? '' : ' fetchpriority="high"'}>`;
      return `<figure>${safeUrl(banner.link_url) ? `<a href="${esc(safeUrl(banner.link_url))}">${image}</a>` : image}${banner.caption ? `<figcaption>${esc(banner.caption)}</figcaption>` : ''}</figure>`;
    }).join('')}
    <div class="fa-banner-controls" hidden><button type="button" data-fa-prev aria-label="ภาพปกก่อนหน้า">← ก่อนหน้า</button><span data-fa-count aria-live="polite"></span><button type="button" data-fa-next aria-label="ภาพปกถัดไป">ถัดไป →</button></div>
  </section>`;
}

function renderProduct(product) {
  const name = product.name_th || product.name_en || product.code;
  const image = safeUrl(product.photo_url);
  const price = Number(product.sale_price);
  const amount = Number.isFinite(price) && price > 0
    ? `${price.toLocaleString('en-US', { maximumFractionDigits:2 })}<small>บาท</small>` : 'สอบถามราคา';
  return `<article class="fa-product"><a class="fa-product-img" href="/p/${encodeURIComponent(product.code)}">${image ? `<img src="${esc(image)}" alt="${esc(name)}" loading="lazy">` : '<span>ดูรายละเอียดสินค้า</span>'}</a><div class="fa-product-body"><small>${esc(product.brand || (product.kind === 'service' ? 'บริการ AMC AIR' : 'AMC AIR'))}${product.btu ? ' · ' + esc(product.btu) + ' BTU' : ''}</small><h3>${esc(name)}</h3><small>รหัส ${esc(product.code)}</small><div class="fa-price">${amount}</div><a class="btn btn-ghost" href="/p/${encodeURIComponent(product.code)}" data-campaign-link>ดูรายละเอียด / ขอราคา →</a></div></article>`;
}

function renderServiceDetails(page, services) {
  if (!page.service) return '';
  return services.filter(service => service.svc === page.service).map(service => `<section class="fa-service-description"><h3>${esc(service.title || page.label)}</h3>${service.subtitle ? `<p>${esc(service.subtitle)}</p>` : ''}${service.bullets ? `<ul>${String(service.bullets).split(/\n+/).map(text => text.trim()).filter(Boolean).map(text => `<li>${esc(text)}</li>`).join('')}</ul>` : ''}</section>`).join('');
}

function renderLanding(page, { products = [], banners = [], services = [], portfolio = [], productsFailed = false } = {}) {
  const quote = '/?interest=' + encodeURIComponent(page.label) + '#contact';
  const matches = products.filter(product => catalog.matches(page, product));
  const first = matches.slice(0,6);
  const photos = portfolio.map(item => ({
    image: (Array.isArray(item.images) && item.images.find(safeUrl)) || item.image_url,
    title: item.title || 'ผลงาน AMC AIR',
  })).filter(item => safeUrl(item.image)).slice(0,3);
  const faq = [
    ['ต้องเตรียมข้อมูลอะไรเพื่อขอราคา?', 'แจ้งประเภทเครื่อง ขนาดหรือรุ่น จำนวนเครื่อง และพื้นที่หน้างาน พร้อมอาการหรือรายละเอียดที่ต้องการ เพื่อให้ทีมงานประเมินรายการได้ตรงกับการใช้งาน'],
    ['ราคาที่เห็นรวมอะไรบ้าง?', 'รายละเอียดขึ้นกับสินค้าและบริการแต่ละรายการ ให้ตรวจราคาเครื่อง วัสดุ ค่าแรง และงานเพิ่มเติมในใบเสนอราคาก่อนยืนยัน ทีมงานจะช่วยสรุปขอบเขตให้ชัดเจน'],
    ['เงื่อนไขรับประกันเป็นอย่างไร?', 'การรับประกันตัวเครื่องขึ้นกับยี่ห้อและรุ่น ส่วนงานบริการมีเงื่อนไขแยกต่างหาก ให้ทีมงานระบุรายละเอียดในเอกสารก่อนตกลง'],
    ['ขอใบเสนอราคาในนามบริษัทได้ไหม?', 'แจ้งชื่อบริษัท ที่อยู่ เลขประจำตัวผู้เสียภาษี และสาขาให้ทีมงานตรวจสอบ เพื่อจัดเตรียมใบเสนอราคาและเอกสารตามรายการที่ยืนยัน'],
  ];
  const content = `<div class="crumb"><a href="/" data-campaign-link>หน้าแรก</a> / ${esc(page.label)}</div>
    ${renderBanners(banners)}
    <section class="fa-landing-hero"><div><span class="eyebrow">${esc(page.kicker)}</span><h1>${esc(page.title)}<br><span>${esc(page.accent)}</span></h1><p>${esc(page.description)}</p><div class="btnrow"><a class="btn btn-primary" href="${quote}" data-campaign-link>ขอคำแนะนำและราคา ↗</a><a class="btn btn-ghost" href="#fa-catalog">ดูรายการที่เกี่ยวข้อง →</a></div></div>${scene()}</section>
    ${renderServiceDetails(page, services)}
    <section class="fa-section" id="fa-catalog"><span class="eyebrow">${page.kind === 'ac' ? 'FIND YOUR AIR CONDITIONER' : 'SERVICE DETAILS'}</span><h2>${page.kind === 'ac' ? 'เลือกรุ่นที่เหมาะกับคุณ' : 'รายการบริการที่เกี่ยวข้อง'}</h2><p class="fa-intro">${page.kind === 'ac' ? 'เลือกจากสินค้าและราคาที่เผยแพร่ของ AMC AIR แล้วให้ทีมงานช่วยประเมินรายละเอียดก่อนสั่งซื้อ' : 'ตรวจรายการที่เผยแพร่ และให้ทีมงานประเมินขอบเขตตามสภาพหน้างาน'}</p>
      ${first.length ? `<div class="fa-product-grid">${first.map(renderProduct).join('')}</div><p class="fa-price-note">ราคาแต่ละรายการอาจมีขอบเขตติดตั้งและวัสดุแตกต่างกัน ตรวจรายละเอียดและยืนยันราคากับทีมงานก่อนสั่งซื้อ</p>` : `<div class="fa-notice">${productsFailed ? 'ขณะนี้โหลดรายการไม่สำเร็จ กรุณาลองใหม่ หรือติดต่อทีมงานเพื่อขอรายละเอียด' : 'ติดต่อทีมงานเพื่อประเมินราคาและขอบเขตตามข้อมูลหน้างานของคุณ'}<br><a class="btn btn-ghost" href="${quote}" data-campaign-link style="margin-top:14px">ขอรายละเอียด ${esc(page.label)} →</a></div>`}
      ${first.length ? `<div class="fa-related"><a href="${esc(productLink(page))}" data-campaign-link>ดู${esc(page.label)}ทั้งหมด →</a></div>` : ''}
    </section>
    <section class="fa-scope"><div><span class="eyebrow">CLEAR SCOPE. BETTER DECISIONS.</span><h2>รายละเอียดชัดเจน<br>ก่อนเริ่มงาน</h2><p>ตกลงรายการและค่าใช้จ่ายร่วมกัน เพื่อให้ขอบเขตบริการตรงกับความต้องการและสภาพพื้นที่จริง</p></div><ul>${page.scope.map(item => `<li>${esc(item)}</li>`).join('')}</ul></section>
    ${photos.length ? `<section class="fa-section"><span class="eyebrow">REAL WORK. REAL ATTENTION.</span><h2>ภาพจากงานของ AMC AIR</h2><p class="fa-intro">ตัวอย่างผลงานจากอัลบั้มของเรา</p><div class="fa-work-grid">${photos.map(photo => `<figure><a href="/#portfolio" data-campaign-link><img src="${esc(safeUrl(photo.image))}" alt="${esc(photo.title)}" loading="lazy"></a><figcaption>${esc(photo.title)}</figcaption></figure>`).join('')}</div><div class="fa-related"><a href="/#portfolio" data-campaign-link>ดูอัลบั้มผลงานทั้งหมด →</a></div></section>` : ''}
    <section class="fa-section"><div class="fa-process"><h2>เริ่มคุยง่าย ดูแลต่อจนจบงาน</h2><ol class="fa-steps"><li><span>01</span><h3>แจ้งความต้องการ</h3><p>บอกประเภทเครื่อง จำนวน และข้อมูลพื้นที่</p></li><li><span>02</span><h3>ประเมินรายละเอียด</h3><p>ตรวจขอบเขต ข้อจำกัด และรายการที่ต้องใช้</p></li><li><span>03</span><h3>ยืนยันรายการ</h3><p>ตกลงราคาและเงื่อนไข ก่อนนัดเข้าทำงาน</p></li><li><span>04</span><h3>ทำงานและส่งมอบ</h3><p>ตรวจการทำงานและส่งมอบเอกสารตามรายการ</p></li></ol></div></section>
    <section class="fa-section fa-faq"><div><span class="eyebrow">BEFORE YOU DECIDE</span><h2>คำถามก่อนตัดสินใจ</h2></div><div>${faq.map(([q,a],i) => `<details${i ? '' : ' open'}><summary>${q}</summary><p>${a}</p></details>`).join('')}</div></section>
    <section class="fa-quote"><div><span class="eyebrow">LET'S PLAN YOUR COMFORT</span><h2>เริ่มจากความต้องการของคุณ</h2><p>สนใจ${esc(page.label)} แจ้งรายละเอียดเพื่อให้ทีมงานช่วยประเมิน</p></div><div class="btnrow"><a class="btn btn-primary" href="${quote}" data-campaign-link>กรอกรายละเอียดขอราคา ↗</a><a class="btn btn-line" href="${LINE_URL}" target="_blank" rel="noreferrer">คุยผ่าน LINE</a><a class="btn btn-ghost" href="${TEL}">โทรหาเรา</a></div></section>
    <nav class="fa-related" aria-label="สินค้าและบริการอื่น">${catalog.pages.filter(item => item.slug !== page.slug).map(item => `<a href="/${item.slug}" data-campaign-link>${esc(item.label)} →</a>`).join('')}</nav>`;
  const canonical = SITE + '/' + page.slug;
  return {
    title: page.label + ' · AMC AIR', desc:page.description, canonical, ogType:'website', pageClass:'fa-landing',
    ogImage:safeUrl(banners[0]?.image_url) || SITE + '/portfolio/p1.jpg', content,
    jsonld:{ '@context':'https://schema.org', '@graph':[
      { '@type':'WebPage', name:page.label + ' · AMC AIR', url:canonical, description:page.description },
      { '@type':'BreadcrumbList', itemListElement:[
        { '@type':'ListItem', position:1, name:'AMC AIR', item:SITE + '/' },
        { '@type':'ListItem', position:2, name:page.label, item:canonical },
      ] },
    ] },
  };
}

module.exports = { renderLanding, renderBanners, safeUrl, productLink };
