// Compare only persisted business fields; updated_at must not force a write.
export function cashEntryNeedsUpdate(existing, desired, hasEntity = true) {
  return ["direction", "status", "entry_date", "note"].some((key) => existing[key] !== desired[key])
    || Number(existing.amount) !== Number(desired.amount)
    || (hasEntity && existing.entity !== (desired.entity || "company"));
}

// One in-flight sync per browser module. Calls during a pass request a fresh
// trailing pass, so documents saved after its reads are not lost. No time cache.
export function createCashSyncRunner(run) {
  let active = null;
  let requested = false;
  return function sync() {
    requested = true;
    if (!active) {
      active = Promise.resolve().then(async () => {
        const total = { added: 0, updated: 0, removed: 0 };
        try {
          do {
            requested = false;
            const result = await run();
            for (const key of Object.keys(total)) total[key] += result?.[key] || 0;
          } while (requested);
          return total;
        } finally {
          active = null;
        }
      });
    }
    return active;
  };
}
