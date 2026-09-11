export const DEFAULT_SUB_RATES = Object.freeze({ labor:45, material:10, inclusive:65, cleaning:70, daily:2000, mode:'labor' });
export function validateSubRates(input) {
  const cfg={...DEFAULT_SUB_RATES,...input};
  for(const key of ['labor','material','inclusive','cleaning','daily']) {
    if(cfg[key] === '' || cfg[key] == null || !Number.isFinite(Number(cfg[key])) || Number(cfg[key])<0 || (key!=='daily' && Number(cfg[key])>100)) throw new Error('กรอกอัตราให้ถูกต้อง: '+key);
    cfg[key]=Number(cfg[key]);
  }
  if(!['labor','inclusive','daily'].includes(cfg.mode)) throw new Error('ประเภทการจ้างไม่ถูกต้อง');
  return cfg;
}
const r2=n=>Math.round(n*100)/100;
export function calculateSubLines(items, groups, config, mode, days=1, discount=0) {
 const cfg=validateSubRates(config);
 if(!['labor','inclusive','daily'].includes(mode)) throw new Error('เลือกประเภทการจ้าง');
 if(mode==='daily') {
   if(!Number.isFinite(Number(days)) || Number(days)<=0) throw new Error('จำนวนวันต้องมากกว่า 0');
   return [{name:`ค่าแรงรายวัน ${days} วัน / ทีม`,qty:Number(days),unit:'วัน/ทีม',price:cfg.daily,sale:0,labor:r2(Number(days)*cfg.daily),manual:true,contract_mode:mode,rate_snapshot:cfg}];
 }
 const sales=(items||[]).map(it=>r2(Math.max(0,(Number(it.qty)||0)*(Number(it.price_show ?? it.unit_price)||0)-(Number(it.discount)||0))));
 const subtotal=sales.reduce((a,b)=>a+b,0);
 const reduction=Number(discount)||0;
 if(reduction<0 || reduction>subtotal) throw new Error('ส่วนลดท้ายใบไม่ถูกต้อง');
 return (items||[]).map((it,i)=>{
   const group=groups[i];
   if(!['air','material','service','cleaning'].includes(group)) throw new Error('ระบุประเภททุกรายการก่อนคำนวณ');
   const rate=group==='air'?0:mode==='inclusive'?cfg.inclusive:group==='material'?cfg.material:group==='cleaning'?cfg.cleaning:cfg.labor;
   const base=subtotal?sales[i]*(1-reduction/subtotal):0;
   return {code:it.item_code||null,name:it.name,qty:Number(it.qty)||0,unit:it.unit||'',price:Number(it.price_show ?? it.unit_price)||0,disc:Number(it.discount)||0,sale:sales[i],labor:r2(base*rate/100),labor_group:group,contract_mode:mode,applied_rate:rate,rate_snapshot:cfg};
 });
}
