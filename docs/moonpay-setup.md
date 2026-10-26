# MoonPay setup (second fiat rail)

What this does: in the Buy panel, "Pay by card or bank" stays on Coinbase wherever Coinbase lists a payment method for
the visitor's country. Where Coinbase lists none and MoonPay serves the country (read live from MoonPay's public
`/v3/countries` and `/v3/currencies`), the button opens MoonPay instead. MoonPay sends USDC (`usdc_base`) or ETH
(`eth_base`) on Base to the connected wallet, then redirects back to the same block. On the 2026-10-26 read that meant
NG, MX, KR, ZA and TR, but the list comes from MoonPay at runtime and is not written in the code.

**The feature is fully hidden until both keys are set.** With no keys, `/api/moonpay/*` answers `pret:false`, never calls
MoonPay, and the page keeps the Coinbase behaviour from before.

## 1. Create the partner account (owner only)

1. Sign up at https://dashboard.moonpay.com as a business and complete MoonPay's business verification (KYB).
2. Ask for the **on-ramp (buy) widget** with **USDC on Base (`usdc_base`)** and **ETH on Base (`eth_base`)** enabled.
   Ask them to confirm these countries are allowed for your account: NG, MX, KR, ZA, TR.
3. Ask whether you need a **domain allow-list** entry and whether **`redirectURL` must be allow-listed**. If so, add
   `https://tokenizedblock.space` (the server always redirects to `https://tokenizedblock.space/?block=...&actif=...&via=moonpay`).
4. Nothing else is needed: no webhooks, no Platform API capabilities. The app uses the widget with a signed URL only.
   (Platform API endpoints such as `POST /platform/v1/sessions` are not used. A capability that is not enabled answers 404.)

## 2. Keys and Railway variables

From the dashboard's Developers page, copy both keys into Railway (service variables), never into the repo:

| Railway variable | Value | Used for |
|---|---|---|
| `MOONPAY_PUBLISHABLE_KEY` | `pk_live_...` (or `pk_test_...`) | `apiKey` in the widget URL (public by design) |
| `MOONPAY_SECRET_KEY` | `sk_live_...` (or `sk_test_...`) | server-side HMAC-SHA256 signature of the widget URL only |

Rules the server enforces: both keys must be set, they must look like `pk_test_`/`pk_live_` and `sk_test_`/`sk_live_`,
and they must be in the same mode. Otherwise the rail stays hidden and `/api/moonpay/pays` says which variable is wrong.
The secret is never returned, logged, or placed in a URL.

## 3. Test, then live

- **Test keys keep the rail hidden on purpose.** MoonPay's sandbox has no Base assets (sandbox-testing page: Sepolia only),
  and `/v3/currencies` reports `supportsTestMode:false` for `usdc_base` and `eth_base`. With `pk_test_`/`sk_test_` the
  server reads that and answers `servi:false`. To check that your test keys and the signature are accepted, check
  `GET /api/moonpay/pays?pays=NG&actif=USDC`: it should say `pret:true` and give the reason
  "usdc_base is not available in MoonPay test mode".
- **Live:** set the `pk_live_`/`sk_live_` pair, redeploy, then:
  1. `GET https://tokenizedblock.space/api/moonpay/pays?pays=NG&actif=USDC` should return `ok:true, pret:true, servi:true`.
  2. `GET .../api/moonpay/pays?pays=US&actif=USDC` also returns `servi:true`, but the page keeps US on Coinbase as long as Coinbase lists a method there.
  3. In the app, open a block priced in USDC, connect a wallet, set Country to `NG`. The button should read
     "Pay by card or bank with MoonPay — get USDC" and show MoonPay's published fees. Click it. A MoonPay tab opens with
     the wallet address pre-filled (the docs say the customer is then not asked for one). If MoonPay shows a signature error, the secret does not match the publishable key.
  4. Make a small real purchase. MoonPay should redirect to `/?block=...&actif=USDC&via=moonpay&transactionId=...`, the panel
     should say "Back from MoonPay", and it should prefill only what the balance read shows has arrived.

## What is proven and what is not

- Proven (bench `test-moonpay-rail-20261026.mjs`): the signature matches MoonPay's published vector, the URL is built and
  signed on the server, each input is validated, countries are routed from the catalogue, the rail is hidden without keys,
  and six mutants die (wrong secret, omitted signature, signing without the `?`, missing key guard, ignored country exclusion,
  client forcing an unserved country).
- **Not proven:** no MoonPay key existed when this was written, so no live widget was ever opened. Which local payment
  methods really work in NG, KR or TR is not known. KR has no KRW in MoonPay's fiat list.

## Sources (read 2026-10-26)

- URL signing, with test vector: https://dev.moonpay.com/widget/on-ramp/customization/url-signing.md
- Widget parameters (`currencyCode`, `walletAddress`, `redirectURL`): https://dev.moonpay.com/widget/on-ramp/customization/parameters.md
- Sandbox (no Base): https://dev.moonpay.com/widget/sandbox-testing.md
- Public catalogue: https://api.moonpay.com/v3/countries , https://api.moonpay.com/v3/currencies
- Fees ("up to" 4.5% card/Apple Pay/Google Pay with a $3.99 minimum, 1% bank transfer): https://support.moonpay.com/customers/docs/moonpay-fees
