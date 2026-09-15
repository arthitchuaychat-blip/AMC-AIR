# Future Air website update

Base: `main` at `1bae039c7187e25af9a601c2d1c670e0d4801bff`.

The approved third design uses Kanit headings, Anuphan body text, white / cobalt / ice-blue surfaces, and a CSS air-conditioner illustration. The original cover images remain above the new hero, displayed in full without cropping or text overlays. Homepage slides can be paused; reduced-motion and hidden-tab preferences stop automatic advancement.

The existing company configuration, banner records, service text, portfolio albums, client logos, reviews, articles, phone / LINE links, cart, request forms, and Thai / English homepage support remain connected to their existing sources. No database migration, staff permission change, or internal app change is included.

## Public landing paths

| Path | Purpose |
| --- | --- |
| `/air-conditioners` | Air conditioners and installation |
| `/air-conditioners/wall-mounted` | Wall-mounted air conditioners |
| `/air-conditioners/cassette` | One-way and four-way cassette air conditioners |
| `/services/installation` | Installation |
| `/services/cleaning` | Cleaning and maintenance |
| `/services/repair` | Diagnosis and repair |
| `/services/relocation` | Relocation and reinstallation |

These pages render content and metadata on the server, are included in the sitemap, and read only published public website data. Each page displays up to six relevant catalog items. Prices come from the existing published catalog. Services without published prices offer a quote request, without a fabricated offer. Product details and ordering continue through the existing product / cart flow.

Quote links prefill the existing request form with the selected topic. Existing first-touch attribution and campaign parameters are retained. This update never automatically submits a form or creates an order.

## Verification

Run: `node --test company-website/tests/*.test.cjs` from the repository root.

- 13 tests pass: category isolation, all seven routes, canonical URLs, sitemap, original covers, image pagination, pause control, campaign / quote context, existing notes, unknown-route 404, data failure, public text escaping, product codes containing `/`, and original form / gallery / catalog hooks.
- All modified browser scripts and server modules parse. CSS and configuration JSON parse; `git diff --check` passes.
- Source comparison confirms 28 existing commerce / content / routing functions and the entire `AMC_CONFIG` block are unchanged.
- Read-only checks against the existing public data returned all three active cover images. The air-conditioner page rendered six real catalog entries; the cleaning page displayed the request path without an invented price. Both returned HTTP 200 with successful data reads. No form submission or database write was performed.
- The two server renders produced about 27 KB and 23 KB of HTML. Workspace network timing is not a production performance benchmark.

## Preview acceptance before production

Automated checks above are Node / unit / source checks, not browser layout approval. Local browser navigation was blocked by the environment's security policy; no alternate browser path was used. Review the deployment preview on desktop and mobile for cover visibility, navigation, font loading, card wrapping, product filtering, Thai / English switching, and the cart / request form before merging.

The implementation branch contains only `company-website/` changes. This keeps internal staff work separate from the website release. Rollback is a revert of this website commit; original data and cover assets do not need restoration.
