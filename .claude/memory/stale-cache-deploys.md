---
name: stale-cache-deploys
description: "AMC app — phantom \"broken\" bugs are usually a cached old bundle, not code; cache headers added"
metadata: 
  node_type: memory
  type: project
  originSessionId: 85b6d010-27bd-419a-ad75-1ac380626a9a
---

The AMC-AIR app (Vite SPA on Vercel, root dir = app/) had NO cache-control headers, so browsers cached `index.html` and kept loading an OLD hashed JS bundle after deploys. This made already-fixed features (catalog search, brand filter) look broken from the user's view — the deployed code was correct (verified by curling the live bundle for unique Thai strings + testing matchText in node), the browser was just stale.

**Why:** index.html referenced a fresh bundle hash, but the cached HTML pointed at the old hash.
**How to apply:** Before assuming a UI/filter bug is real, curl `https://amc-air.vercel.app/` → get `assets/index-*.js` → grep the bundle for a unique string from the latest commit. If present, the code is live and the user is on a stale cache (hard refresh / incognito). Fixed in [[vatsadu-os-app]] via app/vercel.json: index.html = `no-cache`, /assets/* = `immutable`. Search matching itself lives in lib/format.js (norm/eqi/matchText/matchPhone) and is Thai-safe.
