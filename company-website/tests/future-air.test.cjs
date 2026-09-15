const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const catalog = require('../landing-catalog');
const landing = require('../api/landing');
const sitemap = require('../api/sitemap');
const { renderLanding, safeUrl, productLink } = require('../api/_landing');
const { pageShell } = require('../api/_shared');

const originalFetch = global.fetch;
after(() => { global.fetch = originalFetch; });
const products = [
  { code:'WALL/12', name_th:'แอร์ติดผนัง A', kind:'ac', ac_type:'Wall type', sale_price:17000, brand:'A' },
  { code:'CAS4', name_th:'แอร์ฝังฝ้า B', kind:'ac', ac_type:'Cassette 4 way type', sale_price:28000 },
  { code:'CAS1', name_th:'แอร์ฝังฝ้า C', kind:'ac', ac_type:'ฝังฝ้า 1 ทิศ', sale_price:31000 },
  { code:'DUCT', name_th:'ต่อท่อลม D', kind:'ac', ac_type:'Duct Type', sale_price:33000 },
  { code:'INSTALL', name_th:'ติดตั้งแอร์', kind:'service', category:'sv-install', sale_price:3000 },
  { code:'CLEAN', name_th:'ล้างแอร์', kind:'service', category:'sv-clean', sale_price:650 },
  { code:'REPAIR', name_th:'ซ่อมแอร์', kind:'service', category:'sv-repair', sale_price:0 },
  { code:'MOVE', name_th:'ย้ายแอร์', kind:'service', category:'sv-move', sale_price:4000 },
];
const banners = [1,5,6].map(id => ({ image_url:'https://example.com/original-cover-' + id + '.png', caption:'ภาพปก ' + id }));

function response() {
  return { headers:{}, statusCode:0, body:'', setHeader(key,value){this.headers[key]=value;}, status(code){this.statusCode=code;return this;}, send(body){this.body=body;return this;} };
}
function mockData(failedTable) {
  const calls=[];
  global.fetch=async (url, options) => {
    calls.push({url:String(url),method:options?.method || 'GET'});
    const table = new URL(url).pathname.split('/').pop();
    if(table===failedTable) return {ok:false,status:503,text:async()=> 'unavailable'};
    const data={web_products:products,web_banners:banners,web_services:[],web_portfolio:[],web_articles:[]}[table] || [];
    return {ok:true,json:async()=>data};
  };
  return calls;
}

test('every public landing route is reachable and included in the sitemap definition', async () => {
  const config=require('../vercel.json');
  const calls=mockData();
  for(const page of catalog.pages){
    assert.ok(config.rewrites.some(rule=>rule.source==='/'+page.slug && rule.destination==='/api/landing?slug='+page.slug));
    const res=response();
    await landing({query:{slug:page.slug}},res);
    assert.equal(res.statusCode,200);
    assert.ok(res.body.includes('<h1>'+page.title));
    assert.ok(res.body.includes('rel="canonical" href="https://www.amcair.net/'+page.slug+'"'));
    assert.ok(res.body.includes('/future-air.css'));
    for(const banner of banners) assert.ok(res.body.includes(banner.image_url),'original cover missing');
  }
  assert.ok(calls.every(call=>call.method==='GET'));
  const res=response(); await sitemap({},res);
  for(const page of catalog.pages) assert.ok(res.body.includes('<loc>https://www.amcair.net/'+page.slug+'</loc>'));
});

test('wall, cassette, and service landings exclude unrelated categories', () => {
  const expected={
    'air-conditioners':['WALL/12','CAS4','CAS1','DUCT'],
    'air-conditioners/wall-mounted':['WALL/12'],
    'air-conditioners/cassette':['CAS4','CAS1'],
    'services/installation':['INSTALL'], 'services/cleaning':['CLEAN'],
    'services/repair':['REPAIR'], 'services/relocation':['MOVE'],
  };
  for(const page of catalog.pages) assert.deepEqual(products.filter(product=>catalog.matches(page,product)).map(product=>product.code),expected[page.slug]);
});

test('catalog links carry the selected category into existing search filters', () => {
  for(const page of catalog.pages){
    const url=new URL(productLink(page),'https://www.amcair.net');
    const filters=catalog.readFilters(url.search);
    assert.equal(url.hash,'#products');
    assert.equal(filters.kind,page.kind);
    if(page.service) assert.equal(filters.service,page.service);
    if(page.type==='wall') assert.equal(filters.type,'ติดผนัง');
    if(page.type==='cassette') assert.equal(filters.query,'ฝังฝ้า');
  }
  assert.equal(catalog.readFilters('?kind=staff'),null);
  assert.equal(catalog.readFilters('?kind=service&service=unknown').service,'');
});

test('real prices and slash-containing product codes are preserved', () => {
  const result=renderLanding(catalog.find('air-conditioners/wall-mounted'),{products});
  assert.ok(result.content.includes('17,000'));
  assert.ok(result.content.includes('/p/WALL%2F12'));
  assert.ok(!result.content.includes('28,000'));
  assert.ok(!result.content.includes('13,900'));
});

test('unknown routes return 404 before making any data requests', async () => {
  const calls=mockData();
  for(const slug of ['unknown','../_shared',['air-conditioners']]){
    const res=response();await landing({query:{slug}},res);assert.equal(res.statusCode,404);
  }
  assert.equal(calls.length,0);
});

test('temporary product failure keeps covers and contact options and is not cached', async () => {
  mockData('web_products'); const res=response();
  await landing({query:{slug:'air-conditioners'}},res);
  assert.equal(res.statusCode,200);
  assert.equal(res.headers['Cache-Control'],'no-store');
  assert.ok(res.body.includes('โหลดรายการไม่สำเร็จ'));
  assert.ok(res.body.includes('original-cover-1.png'));
  assert.ok(res.body.includes('interest='));
  assert.ok(!res.body.includes('17,000'));
});

test('an unpublished service has no invented offer or placeholder price', () => {
  const result=renderLanding(catalog.find('services/cleaning'),{products:[]});
  assert.ok(result.content.includes('ประเมินราคาและขอบเขต'));
  assert.ok(!result.content.includes('fa-price">'));
});

test('back-office text is escaped and unsafe image or banner links are rejected', () => {
  const result=renderLanding(catalog.find('air-conditioners'),{
    products:[{...products[0],name_th:'<script>alert(1)</script>'}],
    banners:[{image_url:'javascript:alert(1)'},{image_url:'/cover.png',caption:'<img onerror=alert(1)>',link_url:'javascript:alert(1)'}],
  });
  assert.ok(!result.content.includes('<script>alert'));
  assert.ok(!result.content.includes('javascript:'));
  assert.ok(result.content.includes('&lt;script&gt;'));
  assert.equal(safeUrl('data:text/html,test'),'');
  const shell=pageShell({...result,jsonld:{name:'</script><script>alert(1)</script>'}});
  assert.ok(!shell.includes('</script><script>alert(1)'));
});

test('all form, catalog, and gallery anchors remain present in the redesigned homepage', () => {
  const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
  for(const id of ['heroSlider','hsTrack','hsPrev','hsNext','hsDots','heroSearch','hsBrand','hsType','hsBtu','hsGo','svcRow','portGrid','galMask','leadForm','prodGrid','orderForm','cartBtn','drawer','langBtn']){
    assert.equal(html.split('id="'+id+'"').length-1,1,id+' must stay unique');
  }
  assert.ok(html.includes('from("web_banners").select("*").eq("active", true).order("sort").order("id")'));
  assert.ok(html.includes('onsubmit="return submitLead(event)"'));
  assert.ok(html.includes('onsubmit="return submitOrder(event)"'));
  for(const service of ['ติดตั้ง','ล้าง','ซ่อม','ย้าย']) assert.ok(html.includes('href="'+catalog.servicePath(service)+'"'));
});
