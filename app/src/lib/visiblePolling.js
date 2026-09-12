// Pause background refresh while hidden; coalesce overlapping refreshes; refresh on return.
export function visiblePolling(task, interval, doc = document, timers = globalThis) {
  let stopped = false, running = false;
  const run = async () => {
    if (stopped || running || doc.visibilityState === 'hidden') return;
    running = true;
    try { await task(); } catch (_) { /* callers expose their own error state */ }
    finally { running = false; }
  };
  const id = timers.setInterval(run, interval);
  doc.addEventListener('visibilitychange', run);
  run();
  return () => { stopped = true; timers.clearInterval(id); doc.removeEventListener('visibilitychange', run); };
}
