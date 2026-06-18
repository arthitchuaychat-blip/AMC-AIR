// Burmese (မြန်မာ) strings for the parts of AMC used with Burmese subcontractor crews:
// app menu, the labor payout slip, chat quick replies, and a per-job brief for technicians.
// Numbers / names / addresses stay as-is; only labels are translated.
// NOTE: machine-assisted translations — have a Burmese speaker proofread before heavy use.

// nav key → Burmese label (keys match NAV in App.jsx)
export const NAV_MY = {
  myjobs: "ကျွန်ုပ်၏ အလုပ်များ",
  dashboard: "ဒက်ရှ်ဘုတ်",
  customers: "ဖောက်သည်များ",
  chat: "LINE စကားပြော",
  teamchat: "အဖွဲ့ စကားပြော",
  attendance: "အလုပ်တက်/ခွင့်",
  hr: "ဝန်ထမ်းရေးရာ (HR)",
  subcontract: "ကန်ထရိုက် အဖွဲ့",
  catalog: "ကုန်ပစ္စည်း စာရင်း",
  boq: "ပစ္စည်းစာရင်း (BOQ)",
  quote: "စျေးနှုန်း ကမ်းလှမ်းချက်",
  invoice: "ငွေတောင်းခံလွှာ",
  receipt: "ပြေစာ/အခွန်ပြေစာ",
  profit: "အမြတ်/အလုပ်",
  joborders: "အလုပ်အမှာစာ",
  schedule: "အလုပ် ပြက္ခဒိန်",
  movements: "ပစ္စည်း ထုတ်/ပြန်",
  jobs: "အလုပ်သုံး ပစ္စည်း",
  po: "ဝယ်ယူ မှာကြားလွှာ",
  settings: "ဆက်တင်များ",
};

// payout slip labels (Thai is shown alongside in the UI)
export const SLIP_MY = {
  title: "ကန်ထရိုက်တာ လုပ်အားခ ပေးချေလွှာ",
  team: "အဖွဲ့",
  jobNo: "အလုပ်အမှာစာ",
  customer: "ဖောက်သည်",
  labor: "လုပ်အားခ",
  total: "လုပ်အားခ စုစုပေါင်း",
  wht: "အခွန် ဖြတ်တောက်",
  net: "ပေးချေရန် (သားသန့်)",
  status: "အခြေအနေ",
  paid: "ပေးပြီး",
  unpaid: "ပေးချေရန် ကျန်",
};

// ready-made Burmese chat phrases (chips in the chat composer)
export const QR_MY = [
  { title: "ทักทาย", text: "မင်္ဂလာပါ။ ဝန်ဆောင်မှု အသုံးပြုတဲ့အတွက် ကျေးဇူးတင်ပါတယ်။" },
  { title: "วันนี้เข้างาน", text: "ဒီနေ့ ကျွန်တော်တို့ အဖွဲ့ လာရောက်ဝန်ဆောင်မှု ပေးပါမယ်ခင်ဗျာ။" },
  { title: "ถามเวลาสะดวก", text: "ဘယ်အချိန် အဆင်ပြေပါသလဲ ခင်ဗျာ။" },
  { title: "กำลังไป", text: "လမ်းမှာ ရှိနေပါပြီ။ မကြာခင် ရောက်ပါမယ်။" },
  { title: "ขอเวลาสักครู่", text: "ကျေးဇူးပြု၍ ခဏလေး စောင့်ပေးပါ။" },
  { title: "งานเสร็จแล้ว", text: "အလုပ် ပြီးဆုံးပါပြီ။ စစ်ဆေးပေးပါ ခင်ဗျာ။" },
  { title: "ขอบคุณ", text: "ကျေးဇူးတင်ပါတယ်။ နောက်ထပ် လိုအပ်တာရှိရင် ပြောပါ ခင်ဗျာ။" },
];

const JOB_TYPE_MY = { install: "တပ်ဆင်ခြင်း", repair: "ပြုပြင်ခြင်း", service: "ပြုပြင်ထိန်းသိမ်းခြင်း", survey: "ကြိုတင်စစ်ဆေးခြင်း", maintenance: "ထိန်းသိမ်းခြင်း" };

// a job brief in Burmese for the technician (data stays as entered; labels in Burmese)
export function buildJobBriefMy(jo, scheduleText) {
  const L = [];
  L.push(`📋 အလုပ်အမှာစာ ${jo.job_no}`);
  if (jo.title) L.push(`အလုပ်: ${jo.title}`);
  if (jo.job_type) L.push(`အမျိုးအစား: ${JOB_TYPE_MY[jo.job_type] || jo.job_type}`);
  if (jo.customerName) L.push(`ဖောက်သည်: ${jo.customerName}`);
  if (jo.contact_name || jo.contact_phone) L.push(`ဆက်သွယ်ရန်: ${[jo.contact_name, jo.contact_phone].filter(Boolean).join(" · ")}`);
  if (jo.address) L.push(`လိပ်စာ: ${jo.address}`);
  if (jo.map_url) L.push(`မြေပုံ: ${jo.map_url}`);
  if (scheduleText) L.push(`ချိန်းဆိုချက်: ${scheduleText}`);
  if (jo.details) L.push(`အသေးစိတ်: ${jo.details}`);
  L.push("—\nအလုပ်ပြီးရင် ဓာတ်ပုံရိုက်ပြီး အဖွဲ့ကို ပြန်ပို့ပေးပါ။");
  return L.join("\n");
}
