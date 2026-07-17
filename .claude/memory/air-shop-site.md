---
name: air-shop-site
description: "standalone e-commerce site \"แอร์บ้านราคาถูก\" — single-file HTML at air-shop/index.html"
metadata: 
  node_type: memory
  type: project
  originSessionId: d96d8e77-42d5-4b17-8a25-867d2ab045b6
---

Standalone air-conditioner e-commerce site (shop name **"แอร์ถูกกว่าห้าง"**, domain target แอร์ถูกกว่าห้าง.com) at `air-shop/index.html` — single-file HTML (no build, double-click to open), separate from the back-office [[vatsadu-os-app]] and the [[company-website]].

Sections: products (filter by BTU + brand), install/cleaning rate cards, service areas, reviews, LINE-checkout cart (localStorage).

Product catalog + prices + install/cleaning rates were scraped (via WebFetch + parallel Agents) from reference site `xn--12cbgl0fog0eff9e4a1eceb4jsf6fna5d.com` (แอร์บ้านราคาถูก.com, LINE @diamond.air). Full catalog: ~341 wall-mounted (ติดผนัง) models across 21 brands (Mitsubishi, Mitsubishi Heavy, Daikin, Carrier, Haier, TCL, Midea, Hisense, AUX, Gree, Samsung, Panasonic, Sharp, LG, Eminent, Saijo Denki, Tasaki, Mavell, Central Air, Casper, Frio). Data is compact `window._RAW` = [brand, model, btu, inverter(1/0), price]; `window.PRODUCTS` is generated from it (auto-tags cheapest-per-brand "ถูกสุด"). Brand filter is a dropdown; BTU filter uses range buckets via `btuMatch()`. Install fee auto-computed by BTU via `window.installFee()`. Rates in `window.INSTALL_TABLE` / `window.CLEAN_RATES`.

LG (4 models) prices show as IMAGES on the source so couldn't be scraped — entered with `price:null`, which renders "สอบถามราคา" + a LINE button instead of add-to-cart. Fill real LG prices in `_RAW` later. Only wall-mounted scraped; ceiling-hung/cassette categories exist on source but skipped (not typical for a home shop).

**Note:** contact info in `window.CFG` (phone/LINE) is still placeholder — NOT the reference site's; user must fill their own.

Deploy: committed + pushed to GitHub repo `arthitchuaychat-blip/AMC-AIR` (main). Has its own `air-shop/vercel.json` (mirrors company-website). Deploy as a SEPARATE Vercel project with Root Directory = `air-shop` (same pattern as [[company-website]]). No CLI installed locally (no vercel/netlify/gh) — user creates the Vercel project + connects domain via dashboard.

Contact info is now REAL (committed): phone 061-961-5423, LINE @amcstore (https://lin.ee/UvogV9s).

Domain facts (verified via Google DoH): the SCRAPED source site is **แอร์บ้านขายส่งราคาถูก.com** (xn--12cbgl0fog0eff9e4a1eceb4jsf6fna5d.com, Diamond Air / @diamond.air) — note the "ขายส่ง". The user's desired domain **แอร์บ้านราคาถูก.com** = xn--12cf8cke7cc0f3bcb9fre9evb.com is a DIFFERENT domain and is **already REGISTERED + parked on GoDaddy** (NS ns25/26.domaincontrol.com, A 3.33.130.190 / 15.197.148.33 = GoDaddy parking). It has no live site so registrar search may look "available," but it's taken. .net also taken (LnwShop store). User CHOSE **แอร์ถูกกว่าห้าง.com** (xn--12cas1d4c1a2ak4cb5eueseqa0b.com) instead — verified AVAILABLE via DoH (NXDOMAIN) — and renamed the shop to match. Site meta (canonical/og:url) already point to it. Other verified-available alts: amcairshop.com, amcairstore.com, amcstore.co, amcairthai.com. Next: user registers the domain + connects it in the Vercel project.

**Namecheap WHOIS-verification gotcha (cost us a debug round):** a newly registered domain whose registrant email isn't verified gets its nameservers hijacked by Namecheap to `failed-whois-verification.namecheap.com` / `verify-contact-details.namecheap.com`, which silently overrides ALL your DNS records (domain resolves to Namecheap parking IP 198.54.117.x instead of your A record). The site looks "broken" but DNS/Vercel config is fine. Diagnose with an NS lookup, not just A. Fix = click the verify link in the registrant's email; Namecheap restores nameservers within 24-48h. Live domain: แอร์ถูกกว่าห้าง.com, Vercel project `amc-air-6os6` (amc-air-6os6.vercel.app), apex A record → 76.76.21.21.

Gotcha (fixed): top-level `let` state (`_btu`, `_brand`, `cart`) must be declared ABOVE the INIT IIFE that calls `renderProds()`/`renderCart()`, else TDZ throws and silently breaks rendering/cart.
