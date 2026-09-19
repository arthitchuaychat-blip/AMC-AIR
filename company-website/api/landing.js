const { sbGet, pageShell, notFound } = require('./_shared');
const catalog = require('../landing-catalog');
const { renderLanding } = require('./_landing');

module.exports = async (req, res) => {
  const slug = typeof req.query?.slug === 'string' ? req.query.slug : '';
  const page = catalog.find(slug);
  if (!page) return notFound(res, 'หน้า');
  const results = await Promise.allSettled([
    sbGet('web_products?select=code,name_th,name_en,kind,category,ac_type,brand,btu,sale_price,photo_url&kind=eq.' + page.kind + '&order=code&limit=1000'),
    sbGet('web_banners?active=eq.true&select=image_url,caption,link_url&order=sort,id'),
    sbGet('web_services?active=eq.true&select=title,subtitle,bullets,svc&order=sort,id'),
    sbGet('web_portfolio?active=eq.true&select=title,image_url,images&order=sort,id&limit=3'),
  ]);
  const value = index => results[index].status === 'fulfilled' && Array.isArray(results[index].value) ? results[index].value : [];
  const options = renderLanding(page, {
    products:value(0), banners:value(1), services:value(2), portfolio:value(3),
    productsFailed:results[0].status === 'rejected',
  });
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  // Failed reads remain retryable; don't cache a temporary empty catalog.
  res.setHeader('Cache-Control', results.some(result => result.status === 'rejected')
    ? 'no-store' : 'public, s-maxage=60, stale-while-revalidate=300');
  res.status(200).send(pageShell(options));
};
