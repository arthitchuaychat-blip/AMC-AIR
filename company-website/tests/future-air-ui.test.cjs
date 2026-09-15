const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const script = fs.readFileSync(path.join(__dirname,'../future-air.js'),'utf8');

function element(attributes={}) {
  return { attributes, hidden:false, textContent:'', handlers:{},
    getAttribute(key){return this.attributes[key] ?? null;},
    setAttribute(key,value){this.attributes[key]=value;},
    addEventListener(event,handler){this.handlers[event]=handler;},
    click(){this.handlers.click?.();},
  };
}
function fixture({search='',saved=null,noteValue='',landing=true}={}) {
  const link=element({href:'/?interest=แอร์พร้อมติดตั้ง#contact'});
  const note={value:noteValue};
  const slides=[element(),element(),element()];
  const previous=element(),next=element(),counter=element(),controls=element();
  const nodes={'.fa-banner-controls':controls,'[data-fa-count]':counter,'[data-fa-prev]':previous,'[data-fa-next]':next};
  const gallery={querySelectorAll:()=>slides,querySelector:selector=>nodes[selector]};
  const pause=element({'aria-pressed':'false'});
  const store=new Map(saved ? [['amc_attr',JSON.stringify(saved)]] : []);
  const document={
    body:{classList:{contains:()=>landing}}, referrer:'https://www.google.com/',
    querySelector:selector=>selector==='#leadForm textarea[name="note"]' ? note : null,
    querySelectorAll:selector=>selector==='a[data-campaign-link]' ? [link] : selector==='[data-fa-banners]' ? [gallery] : [],
    getElementById:id=>id==='hsPause' ? pause : null,
  };
  vm.runInNewContext(script,{document,location:{search,origin:'https://www.amcair.net'},URL,URLSearchParams,
    localStorage:{getItem:key=>store.get(key),setItem:(key,value)=>store.set(key,value)},
  });
  return {link,note,slides,previous,next,counter,pause,store};
}

test('all three original covers can be paged in both directions, including wraparound',()=>{
  const f=fixture();
  assert.deepEqual(f.slides.map(slide=>slide.hidden),[false,true,true]);
  f.next.click();assert.equal(f.counter.textContent,'2 / 3');assert.equal(f.slides[1].hidden,false);
  f.next.click();assert.equal(f.slides[2].hidden,false);
  f.next.click();assert.equal(f.slides[0].hidden,false);
  f.previous.click();assert.equal(f.counter.textContent,'3 / 3');assert.equal(f.slides[2].hidden,false);
});

test('campaign and selected service survive the link to the existing request form',()=>{
  const f=fixture({search:'?utm_source=google&utm_campaign=wall&gclid=abc&interest=ล้างแอร์'});
  const href=new URL(f.link.href,'https://www.amcair.net');
  assert.equal(href.searchParams.get('utm_source'),'google');
  assert.equal(href.searchParams.get('utm_campaign'),'wall');
  assert.equal(href.searchParams.get('gclid'),'abc');
  assert.equal(href.searchParams.get('interest'),'แอร์พร้อมติดตั้ง');
  assert.equal(href.hash,'#contact');
  assert.equal(f.note.value,'สนใจ: ล้างแอร์');
  const firstTouch=JSON.parse(f.store.get('amc_attr'));
  assert.equal(firstTouch.source,'google');assert.equal(firstTouch.campaign,'wall');
});

test('existing customer notes and first-touch attribution are not overwritten',()=>{
  const saved={source:'facebook',campaign:'previous'};
  const f=fixture({search:'?utm_source=google&interest=ซ่อมแอร์',saved,noteValue:'รายละเอียดที่ลูกค้ากรอกไว้'});
  assert.equal(f.note.value,'รายละเอียดที่ลูกค้ากรอกไว้');
  assert.deepEqual(JSON.parse(f.store.get('amc_attr')),saved);
});

test('pause button retains Thai source labels for the existing reversible language switch',()=>{
  const f=fixture({landing:false});
  f.pause.click();assert.equal(f.pause.getAttribute('aria-pressed'),'true');assert.equal(f.pause.textContent,'เล่นภาพต่อ');
  f.pause.click();assert.equal(f.pause.getAttribute('aria-pressed'),'false');assert.equal(f.pause.textContent,'พักภาพ');
  assert.equal(f.store.size,0);
});
