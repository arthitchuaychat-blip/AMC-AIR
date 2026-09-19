/* Shared route definitions: public landing pages, homepage service links, and sitemap. */
(function (root, factory) {
  const catalog = factory();
  if (typeof module === 'object' && module.exports) module.exports = catalog;
  else root.AMCLandingCatalog = catalog;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const pages = [
    { slug:'air-conditioners', label:'แอร์พร้อมติดตั้ง', kicker:'AIR CONDITIONERS + INSTALLATION',
      title:'เลือกความเย็นที่พอดี', accent:'พร้อมงานติดตั้งที่ชัดเจน',
      description:'เลือกแอร์ให้เหมาะกับห้อง เปรียบเทียบรุ่นและราคาจากรายการสินค้าของ AMC AIR พร้อมให้ทีมงานประเมินขอบเขตงานติดตั้งก่อนตัดสินใจ',
      kind:'ac', scope:['ยี่ห้อ รุ่น และขนาดเครื่องที่ต้องการ','ตำแหน่งติดตั้ง ระยะท่อ และขอบเขตงานไฟ','ราคาเครื่อง วัสดุ ค่าแรง และรายการเพิ่มเติม','การทดสอบระบบ เอกสาร และเงื่อนไขรับประกัน'] },
    { slug:'air-conditioners/wall-mounted', label:'แอร์ติดผนัง', kicker:'WALL-MOUNTED AIR CONDITIONERS',
      title:'ความสบายสำหรับทุกวัน', accent:'เลือกแอร์ติดผนังให้เหมาะกับห้อง',
      description:'รวมแอร์ติดผนังจากรายการสินค้าของ AMC AIR เลือกยี่ห้อและขนาดตามพื้นที่ งบประมาณ และการใช้งาน พร้อมประเมินรายละเอียดติดตั้ง',
      kind:'ac', type:'wall', filterType:'ติดผนัง', scope:['ขนาดห้อง แสงแดด และลักษณะการใช้งาน','ตำแหน่งคอยล์เย็น คอยล์ร้อน และทางระบายน้ำ','ระยะท่อ วัสดุ ค่าแรง และงานเพิ่มเติม','รายละเอียดรุ่นและเงื่อนไขรับประกันก่อนสั่งซื้อ'] },
    { slug:'air-conditioners/cassette', label:'แอร์ฝังฝ้า', kicker:'CASSETTE AIR CONDITIONERS',
      title:'จัดความเย็นให้ลงตัว', accent:'กับพื้นที่และงานฝ้า',
      description:'เลือกแอร์ฝังฝ้าสำหรับร้านค้า สำนักงาน และพื้นที่ภายในอาคาร ตรวจขนาดเครื่อง ความสูงฝ้า และขอบเขตงานระบบกับทีมงานก่อนสรุปรายการ',
      kind:'ac', type:'cassette', filterType:'ฝังฝ้า 4 ทิศ', scope:['ประเภทเครื่องและทิศทางการกระจายลม','ระยะเหนือฝ้า ช่องเปิด และตำแหน่งเซอร์วิส','แนวท่อ น้ำทิ้ง และระบบไฟที่รองรับ','รายการติดตั้งและงานฝ้าที่ต้องตกลงเพิ่มเติม'] },
    { slug:'services/installation', label:'ติดตั้งแอร์', kicker:'AIR CONDITIONER INSTALLATION',
      title:'งานติดตั้งที่เป็นระบบ', accent:'เริ่มจากขอบเขตที่ตรวจสอบได้',
      description:'แจ้งประเภทเครื่องและข้อมูลพื้นที่ ให้ทีมงาน AMC AIR ประเมินตำแหน่ง วัสดุ และขอบเขตติดตั้ง พร้อมสรุปรายการก่อนนัดเข้าทำงาน',
      kind:'service', service:'ติดตั้ง', category:'sv-install', scope:['ประเภทเครื่อง ขนาด และตำแหน่งติดตั้ง','ระยะท่อและวัสดุที่รวมอยู่ในรายการ','ขอบเขตระบบไฟ น้ำทิ้ง และงานเพิ่มเติม','ทดสอบการทำงานและส่งมอบเอกสาร'] },
    { slug:'services/cleaning', label:'ล้างแอร์', kicker:'CLEANING + MAINTENANCE',
      title:'ดูแลความเย็นให้ต่อเนื่อง', accent:'ด้วยบริการล้างแอร์',
      description:'แจ้งประเภทแอร์ จำนวนเครื่อง และสถานที่ ให้ทีมงาน AMC AIR ตรวจรายละเอียดบริการล้างและบำรุงรักษา พร้อมนัดหมายให้เหมาะกับการใช้งาน',
      kind:'service', service:'ล้าง', category:'sv-clean', scope:['ประเภท ขนาด และจำนวนเครื่องที่ต้องการล้าง','ขอบเขตทำความสะอาดและการป้องกันพื้นที่','ตำแหน่งชุดภายนอกและข้อจำกัดการเข้าถึง','รายละเอียดราคาและวันนัดหมายก่อนเข้าบริการ'] },
    { slug:'services/repair', label:'ซ่อมแอร์', kicker:'DIAGNOSIS + REPAIR',
      title:'เริ่มจากหาสาเหตุ', accent:'แล้วค่อยตัดสินใจซ่อม',
      description:'แอร์ไม่เย็น น้ำหยด หรือมีเสียงผิดปกติ แจ้งอาการและรุ่นเครื่องให้ทีมงาน AMC AIR ประเมินแนวทางตรวจเช็ก พร้อมสรุปค่าใช้จ่ายก่อนซ่อม',
      kind:'service', service:'ซ่อม', category:'sv-repair', scope:['อาการ ยี่ห้อ รุ่น และประวัติการใช้งาน','เงื่อนไขค่าตรวจเช็กและการเข้าหน้างาน','สาเหตุ แนวทางแก้ไข และรายการอะไหล่','ราคาซ่อมและเงื่อนไขรับประกันที่ตกลงร่วมกัน'] },
    { slug:'services/relocation', label:'ย้ายแอร์', kicker:'RELOCATION + REINSTALLATION',
      title:'ย้ายเครื่องเดิม', accent:'ให้พร้อมใช้งานในจุดใหม่',
      description:'แจ้งจุดเดิมและจุดติดตั้งใหม่ ให้ทีมงาน AMC AIR ประเมินการถอด ขนย้าย วัสดุ และงานระบบ เพื่อสรุปราคาและขอบเขตก่อนดำเนินการ',
      kind:'service', service:'ย้าย', category:'sv-move', scope:['สภาพเครื่องเดิมและตำแหน่งที่ต้องถอด','ระยะทางขนย้ายและการเข้าถึงทั้งสองจุด','วัสดุเดิมที่ใช้ต่อได้และรายการที่ต้องเปลี่ยน','งานติดตั้งใหม่และการทดสอบก่อนส่งมอบ'] },
  ];
  function find(slug) { return pages.find(page => page.slug === slug) || null; }
  function servicePath(service) {
    const page = pages.find(page => page.service === service);
    return page ? '/' + page.slug : null;
  }
  function matches(page, product) {
    if (product.kind !== page.kind) return false;
    if (page.category) {
      if (product.category) return product.category === page.category;
      return String(product.name_th || product.name_en || '').includes(page.service);
    }
    const key = String(product.ac_type || '').toLowerCase().replace(/[\s\-_.&/()]+/g, '').replace(/type$/, '');
    if (page.type === 'wall') return key === 'wall' || key === 'ติดผนัง';
    if (page.type === 'cassette') return key.startsWith('cassette') || key.startsWith('ฝังฝ้า');
    return true;
  }
  function readFilters(search) {
    const params = new URLSearchParams(search);
    const kind = params.get('kind');
    if (!['ac','material','service'].includes(kind)) return null;
    const service = kind === 'service' && pages.some(page => page.service === params.get('service')) ? params.get('service') : '';
    return { kind, type:(params.get('type') || '').slice(0,80), service, query:(params.get('q') || '').slice(0,120) };
  }
  return { pages, find, servicePath, matches, readFilters };
});
