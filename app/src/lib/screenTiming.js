import React from 'react';
const samples = [];
let pending;
export function beginScreenTiming(menu) { pending = { menu, at: performance.now() }; }
export function speedSamples() { return samples.map(x => ({ ...x })); }
export function clearSpeedSamples() { samples.length = 0; pending = null; }
// Readiness comes from the screen's actual loading/error state, not a fixed timeout.
// A mount without a matching navigation is labelled separately: it excludes lazy module download.
export function useScreenTiming(menu, busy, error) {
  const started = React.useRef(null);
  if (!started.current) {
    const navigation = pending?.menu === menu && performance.now() - pending.at < 60000;
    started.current = { at: navigation ? pending.at : performance.now(), source: navigation ? 'navigation' : 'mount' };
    if (navigation) pending = null;
  }
  React.useEffect(() => {
    if (busy || !started.current || started.current.done) return;
    let second;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => {
        if (!started.current) return;
        samples.push({ menu, source: started.current.source, milliseconds: Math.round(performance.now() - started.current.at), outcome: error ? 'error' : 'ready' });
        if (samples.length > 100) samples.shift();
        started.current = { ...started.current, done: true };
      });
    });
    return () => { cancelAnimationFrame(first); if (second) cancelAnimationFrame(second); };
  }, [busy, error, menu]);
}
