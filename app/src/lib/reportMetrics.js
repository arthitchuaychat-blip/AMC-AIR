// Pure reporting helpers. Unknown cost stays unknown; zero is a valid recorded cost.
export function knownBoqCost(quote, costs) {
  const raw = quote.boq_no ? costs[quote.boq_no] : null;
  return raw == null || raw === "" || !Number.isFinite(Number(raw)) ? null : Number(raw);
}

export function estimateSummary(quotes, costs) {
  let sale = 0, matchedSale = 0, cost = 0, covered = 0;
  for (const q of quotes) {
    const amount = Number(q.afterDisc) || 0;
    sale += amount;
    const value = knownBoqCost(q, costs);
    if (value != null) { covered++; matchedSale += amount; cost += value; }
  }
  return { sale, matchedSale, cost, covered, count: quotes.length, missing: quotes.length - covered,
    profit: covered ? matchedSale - cost : null,
    margin: covered && matchedSale > 0 ? (matchedSale - cost) / matchedSale * 100 : null };
}

// Preserve accounts without entity metadata in "all"; never guess their legal entity.
// Closed accounts with a balance remain visible until reconciled.
export function cashAccounts(accounts, entity = "all") {
  return (accounts || []).filter((a) => ["bank", "cash"].includes(a.kind) &&
    (entity === "all" || a.entity === entity) && (a.active !== false || Number(a.balance) !== 0));
}
export function cashAccountTotal(accounts, entity = "all") {
  return cashAccounts(accounts, entity).reduce((sum, a) => sum + (Number(a.balance) || 0), 0);
}

export function signedDomain(values) {
  const finite = values.filter((v) => v != null && Number.isFinite(Number(v))).map(Number);
  const min = Math.min(0, ...finite), max = Math.max(0, ...finite);
  if (min === max) return { min: 0, max: 1 };
  const pad = (max - min) * .12;
  return { min: min < 0 ? min - pad : 0, max: max > 0 ? max + pad : 0 };
}
