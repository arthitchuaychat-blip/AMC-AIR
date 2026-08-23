import React from "react";
import { listAccEntities, listAccChart, listJournal, postJournal, voidJournal } from "../lib/api";
import { confirmDialog } from "./ConfirmDialog";
import { fmtBaht } from "../lib/format";

const pad = (n) => String(n).padStart(2, "0");
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const thDate = (s) => new Date(s + "T00:00:00").toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit" });
const CAT_LABEL = { asset: "สินทรัพย์", liability: "หนี้สิน", equity: "ส่วนของเจ้าของ", revenue: "รายได้", expense: "ต้นทุน/ค่าใช้จ่าย" };
const CAT_ORDER = ["asset", "liability", "equity", "revenue", "expense"];
const SCOPE_TAG = { company: "🏢 บริษัท", personal: "👤 บุคคล" };
const REFT = { manual: "ลงเอง", opening: "ยอดยกมา", quotation: "ใบเสนอราคา", invoice: "ใบแจ้งหนี้", receipt: "ใบเสร็จ", po: "ใบสั่งซื้อ", expense: "เบิกจ่าย", payroll: "เงินเดือน" };

export default function Accounting() {
  const [tab, setTab] = React.useState("tb");            // coa | journal | tb
  const [entity, setEntity] = React.useState("all");     // all | company | personal
  const [entities, setEntities] = React.useState([]);
  const [chart, setChart] = React.useState([]);
  const [journal, setJournal] = React.useState([]);
  const [from, setFrom] = React.useState(`${new Date().getFullYear()}-01-01`);
  const [to, setTo] = React.useState(ymd(new Date()));
  const [loading, setLoading] = React.useState(true);
  const [entry, setEntry] = React.useState(null);        // manual-entry modal state | null
  const [toast, setToast] = React.useState(null);
  const flash = (m, bad) => { setToast({ m, bad }); setTimeout(() => setToast(null), 2800); };

  const chartMap = React.useMemo(() => { const m = {}; chart.forEach((a) => { m[a.code] = a; }); return m; }, [chart]);

  React.useEffect(() => {
    Promise.all([listAccEntities().catch(() => []), listAccChart().catch(() => [])])
      .then(([e, c]) => { setEntities(e); setChart(c); });
  }, []);

  const loadJournal = React.useCallback(() => {
    setLoading(true);
    listJournal({ entity, from, to }).then((j) => setJournal(j)).catch((e) => flash(e.message || "โหลดไม่สำเร็จ", true)).finally(() => setLoading(false));
  }, [entity, from, to]);
  React.useEffect(() => { loadJournal(); }, [loadJournal]);

  // ── งบทดลอง: รวมเดบิต/เครดิตต่อบัญชีจากรายการในช่วง ──
  const trial = React.useMemo(() => {
    const acc = {};
    journal.forEach((j) => (j.lines || []).forEach((l) => {
      const a = (acc[l.account_code] ||= { code: l.account_code, d: 0, c: 0 });
      a.d += Number(l.debit) || 0; a.c += Number(l.credit) || 0;
    }));
    const rows = Object.values(acc).map((a) => {
      const net = a.d - a.c, meta = chartMap[a.code] || {};
      return { code: a.code, name: meta.name || a.code, category: meta.category, sort: meta.sort || 9999,
        debit: net >= 0 ? net : 0, credit: net < 0 ? -net : 0 };
    }).filter((r) => r.debit > 0.005 || r.credit > 0.005).sort((a, b) => a.sort - b.sort);
    const totD = rows.reduce((s, r) => s + r.debit, 0), totC = rows.reduce((s, r) => s + r.credit, 0);
    return { rows, totD, totC, balanced: Math.abs(totD - totC) < 0.01 };
  }, [journal, chartMap]);

  const jSum = (j, k) => (j.lines || []).reduce((s, l) => s + (Number(l[k]) || 0), 0);

  async function doVoid(j) {
    const ok = await confirmDialog({ title: "ยกเลิกรายการบัญชี?", message: `รายการวันที่ ${thDate(j.jdate)} (${fmtBaht(jSum(j, "debit"))}) — จะถูกยกเลิก (เก็บประวัติไว้ ไม่ลบจริง)`, confirmText: "ยกเลิกรายการ", danger: true });
    if (!ok) return;
    try { await voidJournal(j.id); flash("ยกเลิกแล้ว"); loadJournal(); } catch (e) { flash(e.message || "ไม่สำเร็จ", true); }
  }

  const entName = (code) => entities.find((e) => e.code === code)?.name || (code === "company" ? "บริษัท" : "บุคคล");

  return (
    <div className="adm">
      <div className="adm-head">
        <div>
          <h1 className="page-title">บัญชี <span className="page-title-en">Accounting</span></h1>
          <p className="page-sub">ระบบบัญชีคู่ · สมุดรายวัน · งบทดลอง — แยกกิจการ บริษัท (VAT) / บุคคล</p>
        </div>
      </div>

      {/* ── สลับกิจการ ── */}
      <div className="acc-entbar">
        {[["all", "รวม 2 กิจการ"], ["company", "🏢 บริษัท"], ["personal", "👤 บุคคล"]].map(([k, lb]) => (
          <button key={k} className={"acc-ent" + (entity === k ? " on" : "")} onClick={() => setEntity(k)}>{lb}</button>
        ))}
        <div className="acc-note">📖 ระบบบัญชีอ่านข้อมูลอย่างเดียว ไม่กระทบโปรแกรมขาย</div>
      </div>

      {/* ── แท็บ ── */}
      <div className="view-seg acc-tabs">
        {[["tb", "งบทดลอง"], ["journal", "สมุดรายวัน"], ["coa", "ผังบัญชี"]].map(([k, lb]) => (
          <button key={k} className={"seg-btn" + (tab === k ? " on" : "")} onClick={() => setTab(k)}>{lb}</button>
        ))}
      </div>

      {/* ── ช่วงวันที่ (งบทดลอง/สมุดรายวัน) ── */}
      {tab !== "coa" && (
        <div className="acc-daterow">
          <label>ตั้งแต่ <input type="date" className="inp" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
          <label>ถึง <input type="date" className="inp" value={to} onChange={(e) => setTo(e.target.value)} /></label>
          {tab === "journal" && <button className="btn" onClick={() => setEntry(newEntry(entity))}>＋ ลงรายการเอง</button>}
        </div>
      )}

      {toast && <div className={"toast" + (toast.bad ? " bad" : "")}>{toast.m}</div>}

      {/* ═══ งบทดลอง ═══ */}
      {tab === "tb" && (
        <div className="acc-card">
          {loading ? <div className="empty">กำลังโหลด…</div> : trial.rows.length === 0 ? (
            <div className="empty">ยังไม่มีรายการบัญชีในช่วงนี้ — ลงรายการที่แท็บ “สมุดรายวัน”</div>
          ) : (
            <table className="acc-table">
              <thead><tr><th>รหัส</th><th>ชื่อบัญชี</th><th className="r">เดบิต</th><th className="r">เครดิต</th></tr></thead>
              <tbody>
                {trial.rows.map((r) => (
                  <tr key={r.code}>
                    <td className="mono">{r.code}</td><td>{r.name}</td>
                    <td className="r mono">{r.debit ? fmtBaht(r.debit) : ""}</td>
                    <td className="r mono">{r.credit ? fmtBaht(r.credit) : ""}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className={trial.balanced ? "ok" : "bad"}>
                  <td colSpan={2}>รวม {trial.balanced ? "✓ เดบิต = เครดิต" : "⚠ ไม่สมดุล!"}</td>
                  <td className="r mono">{fmtBaht(trial.totD)}</td>
                  <td className="r mono">{fmtBaht(trial.totC)}</td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      )}

      {/* ═══ สมุดรายวัน ═══ */}
      {tab === "journal" && (
        <div className="acc-card">
          {loading ? <div className="empty">กำลังโหลด…</div> : journal.length === 0 ? (
            <div className="empty">ยังไม่มีรายการ — กด “＋ ลงรายการเอง” เพื่อเริ่ม</div>
          ) : journal.map((j) => (
            <div key={j.id} className="acc-je">
              <div className="acc-je-head">
                <span className="acc-je-date">{thDate(j.jdate)}</span>
                <span className="acc-je-ent">{j.entity === "company" ? "🏢" : "👤"} {entName(j.entity)}</span>
                <span className="acc-je-ref">{REFT[j.ref_type] || j.ref_type}{j.ref_no ? ` · ${j.ref_no}` : ""}</span>
                {j.source === "manual" && <span className="acc-je-tag">ลงเอง</span>}
                <span className="acc-je-memo">{j.memo || ""}</span>
                <button className="acc-je-void" title="ยกเลิกรายการ" onClick={() => doVoid(j)}>✕</button>
              </div>
              <table className="acc-jelines">
                <tbody>
                  {(j.lines || []).slice().sort((a, b) => (a.line_no || 0) - (b.line_no || 0)).map((l) => (
                    <tr key={l.id}>
                      <td className="mono acc-jl-code">{l.account_code}</td>
                      <td>{chartMap[l.account_code]?.name || ""}{l.memo ? <span className="acc-jl-memo"> · {l.memo}</span> : null}</td>
                      <td className="r mono">{Number(l.debit) ? fmtBaht(l.debit) : ""}</td>
                      <td className="r mono">{Number(l.credit) ? fmtBaht(l.credit) : ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}

      {/* ═══ ผังบัญชี ═══ */}
      {tab === "coa" && (
        <div className="acc-card">
          {CAT_ORDER.map((cat) => {
            const rows = chart.filter((a) => a.category === cat);
            if (!rows.length) return null;
            return (
              <div key={cat} className="acc-coa-group">
                <div className="acc-coa-cat">{CAT_LABEL[cat]}</div>
                <table className="acc-table">
                  <tbody>
                    {rows.map((a) => (
                      <tr key={a.code}>
                        <td className="mono acc-jl-code">{a.code}</td>
                        <td>{a.name}</td>
                        <td className="acc-coa-scope">{a.entity_scope !== "shared" ? SCOPE_TAG[a.entity_scope] : ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })}
        </div>
      )}

      {entry && <EntryModal entry={entry} setEntry={setEntry} chart={chart} onSaved={() => { setEntry(null); flash("ลงบัญชีแล้ว"); loadJournal(); }} onError={(m) => flash(m, true)} />}
    </div>
  );
}

function newEntry(entity) {
  return { entity: entity === "all" ? "company" : entity, jdate: ymd(new Date()), ref_no: "", memo: "", lines: [blankLine(), blankLine()] };
}
const blankLine = () => ({ account_code: "", debit: "", credit: "" });

function EntryModal({ entry, setEntry, chart, onSaved, onError }) {
  const [saving, setSaving] = React.useState(false);
  const upd = (patch) => setEntry({ ...entry, ...patch });
  const updLine = (i, patch) => { const lines = entry.lines.map((l, k) => k === i ? { ...l, ...patch } : l); upd({ lines }); };
  const addLine = () => upd({ lines: [...entry.lines, blankLine()] });
  const rmLine = (i) => upd({ lines: entry.lines.filter((_, k) => k !== i) });
  const sumD = entry.lines.reduce((s, l) => s + (Number(l.debit) || 0), 0);
  const sumC = entry.lines.reduce((s, l) => s + (Number(l.credit) || 0), 0);
  const balanced = Math.abs(sumD - sumC) < 0.01 && sumD > 0;
  const grouped = CAT_ORDER.map((cat) => [CAT_LABEL[cat], chart.filter((a) => a.category === cat && (a.entity_scope === "shared" || a.entity_scope === entry.entity))]);

  async function save() {
    setSaving(true);
    try { await postJournal({ ...entry, source: "manual", ref_type: "manual" }); onSaved(); }
    catch (e) { onError(e.message || "บันทึกไม่สำเร็จ"); } finally { setSaving(false); }
  }

  return (
    <div className="modal-overlay" onClick={() => setEntry(null)}>
      <div className="modal acc-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-title">ลงรายการสมุดรายวัน <button className="modal-x" onClick={() => setEntry(null)}>✕</button></div>
        <div className="acc-modal-top">
          <label>กิจการ
            <select className="inp" value={entry.entity} onChange={(e) => upd({ entity: e.target.value })}>
              <option value="company">🏢 บริษัท (VAT)</option>
              <option value="personal">👤 บุคคล (ไม่ VAT)</option>
            </select>
          </label>
          <label>วันที่ <input type="date" className="inp" value={entry.jdate} onChange={(e) => upd({ jdate: e.target.value })} /></label>
          <label>อ้างอิง <input className="inp" placeholder="เลขที่/หมายเหตุ" value={entry.ref_no} onChange={(e) => upd({ ref_no: e.target.value })} /></label>
        </div>
        <label className="acc-modal-memo">รายละเอียด <input className="inp" placeholder="คำอธิบายรายการ" value={entry.memo} onChange={(e) => upd({ memo: e.target.value })} /></label>

        <table className="acc-entry-lines">
          <thead><tr><th>บัญชี</th><th className="r">เดบิต</th><th className="r">เครดิต</th><th></th></tr></thead>
          <tbody>
            {entry.lines.map((l, i) => (
              <tr key={i}>
                <td>
                  <select className="inp" value={l.account_code} onChange={(e) => updLine(i, { account_code: e.target.value })}>
                    <option value="">— เลือกบัญชี —</option>
                    {grouped.map(([lab, accs]) => accs.length ? (
                      <optgroup key={lab} label={lab}>{accs.map((a) => <option key={a.code} value={a.code}>{a.code} · {a.name}</option>)}</optgroup>
                    ) : null)}
                  </select>
                </td>
                <td><input className="inp r" inputMode="decimal" value={l.debit} onChange={(e) => updLine(i, { debit: e.target.value, credit: "" })} /></td>
                <td><input className="inp r" inputMode="decimal" value={l.credit} onChange={(e) => updLine(i, { credit: e.target.value, debit: "" })} /></td>
                <td>{entry.lines.length > 2 && <button className="acc-rm" onClick={() => rmLine(i)}>✕</button>}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className={balanced ? "ok" : "bad"}>
              <td><button className="btn-ghost sm" onClick={addLine}>＋ เพิ่มบรรทัด</button></td>
              <td className="r mono">{fmtBaht(sumD)}</td>
              <td className="r mono">{fmtBaht(sumC)}</td>
              <td>{balanced ? "✓" : "≠"}</td>
            </tr>
          </tfoot>
        </table>
        <div className="acc-modal-foot">
          <span className="acc-bal-hint">{balanced ? "สมดุล พร้อมบันทึก" : sumD || sumC ? "เดบิตต้องเท่ากับเครดิต" : "กรอกจำนวนเงิน"}</span>
          <button className="btn" disabled={!balanced || saving} onClick={save}>{saving ? "กำลังบันทึก…" : "บันทึกลงบัญชี"}</button>
        </div>
      </div>
    </div>
  );
}
