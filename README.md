# eBay Lister

A browser-based tool for batch-creating Pokémon card listings on eBay. Built for GitHub Pages — no server required.

## How it works

You fill in a form, add listings to a queue, then click "List All" to push everything to eBay at once. A Cloudflare Worker handles all API communication behind the scenes (eBay blocks direct browser calls due to CORS).

---

## One-time setup (do this first)

### 1. Create an eBay Developer account
Go to **developer.ebay.com** and sign up. Approval takes about 1 business day.

Once approved:
- Go to **My Account → Application Keys**
- Create a **Production** application
- Copy your **Client ID** and **Client Secret**
- Click **User Tokens** next to your app → set the **Accept URL** to:
  ```
  https://llama923.github.io/ebay-lister/
  ```
- Copy the **RuName** shown on that page

### 2. Deploy the Cloudflare Worker
- Log in at **workers.cloudflare.com**
- Create a new Worker, paste the contents of `worker.js`, and deploy
- In the Worker settings → **Variables**, add two secret environment variables:
  ```
  EBAY_CLIENT_ID     = (your eBay Client ID)
  EBAY_CLIENT_SECRET = (your eBay Client Secret)
  ```
- Copy the Worker's URL (e.g. `https://your-worker.workers.dev`)

### 3. Deploy this app to GitHub Pages
- Create a new repo: `ebay-lister` under your GitHub account
- Push all files (everything except `worker.js`) to the repo
- Enable GitHub Pages: Settings → Pages → Source: main branch / root
- App is live at: `https://llama923.github.io/ebay-lister/`

### 4. Complete in-app setup (5 steps in Settings)
Open the app and go to **Settings**:

| Step | What to do |
|------|-----------|
| 1 | Enter your Cloudflare Worker URL |
| 2 | Enter your eBay Client ID and RuName |
| 3 | Click "Connect eBay Account" — logs you in via eBay |
| 4 | Enter your shipping origin address (ZIP code is critical for shipping rate calculations) |
| 5 | Click "Run First-Time Setup" — creates your eBay business policies automatically |

You only do this once. After setup, the app stays connected.

---

## Daily use

1. Select **Single Card** or **Card Lot**
2. Enter title, price, condition
3. For lots: enter the card count
4. Upload photos — drag to reorder them (first photo = main eBay image)
5. Description auto-fills; edit if needed
6. Check the shipping badge (auto-calculated from your rules)
7. Click **Add to Queue**
8. Repeat for all cards you want to list
9. Click **List X Items on eBay** — they all go live

---

## Shipping rules (hardcoded)

| Scenario | Service | Package |
|----------|---------|---------|
| Single card, price < $20 | eBay Standard Envelope | 4×8×1", 2 oz |
| Single card, price ≥ $20 | USPS Ground Advantage | 6×11×1", 3 oz |
| Lot, fewer than 20 cards | USPS Ground Advantage | 6×11×1", 3 oz |
| Lot, 20+ cards, price ≤ $200 | USPS Ground Advantage | 6×11×1", 3 oz |
| Lot, 20+ cards, price > $200 | USPS Ground Advantage | 7×11×5", 5 oz |

Buyer always pays shipping. No returns accepted.

---

## Technical notes

- **eBay Standard Envelope rate** is hardcoded at $1.03 (current 2 oz rate). If USPS changes rates, update the `shippingCost` value in `ebay.js` → `setupEbayPolicies()`.
- **USPS Ground Advantage** service code in the eBay API is `USPSParcel` — eBay kept the old internal name when they renamed the service.
- **OAuth tokens** last ~2 hours; the app refreshes them automatically. Refresh tokens last ~18 months.
- **Category IDs** default to `183454` (Pokémon TCG singles). You can change these in Settings → Advanced if needed.
- The **Client Secret** is never stored in the browser — it lives only in your Cloudflare Worker environment variables.
