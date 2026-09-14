> **2026-09-14:** Live product is `https://tokenized-block.up.railway.app/`. `tokenized-block.github.io` is retired.

# Mini app — what is done, and the one thing that is not

## Done

| piece | where |
|---|---|
| manifest | `/.well-known/farcaster.json` |
| embed meta tags | `fc:miniapp` and `fc:frame` in `index.html` |
| icon, 1024×1024 PNG | `icon.png` |
| splash, 200×200 PNG | `splash.png` |
| embed image, 1200×800 (3:2) | `embed.png` |

The three images were rasterised from the vector logo in a browser canvas and checked by their
**PNG signature and IHDR dimensions** — not by "the file is not empty".

## ⛔ NOT done: `accountAssociation`

The manifest deliberately **omits** `accountAssociation`. It is a signature proving that a
Farcaster account owns this domain, and it can only be produced by the account's custody key —
which this repository does not contain and must never contain.

⚠️ **An unsigned association is not an association.** Shipping empty strings there would produce a
manifest that parses and then fails verification, with an error pointing at the wrong place. It is
absent, and that is honest.

**Generate it** in the Farcaster developer tools, then paste the resulting object at the top of
`.well-known/farcaster.json`:

```json
{
  "accountAssociation": { "header": "…", "payload": "…", "signature": "…" },
  "miniapp": { … }
}
```

## ⛔ The domain must be settled FIRST

The account association signs a **domain**. Every URL in the manifest and in the meta tags is
absolute, and points at `tokenized-block.github.io`.

If the app moves — to an organisation, or to a custom domain — **all of them change, and the
association becomes invalid**. Signing before the move means signing twice.

⇒ decide the final domain, move, then sign. Not the other way round.

**2026-09-07 overnight:** public brand is **Tokenized-Block.app**, but DNS for that name is
**not live** yet (no A/AAAA). Keep absolute URLs on `tokenized-block.github.io` until DNS works —
do **not** flip `homeUrl` to a dead domain. **Never invent `accountAssociation`.**

## Checking it

Once the domain is final and the association is signed, the manifest must be reachable at
`https://<domain>/.well-known/farcaster.json`. GitHub Pages serves dot-directories only because
this repository carries a `.nojekyll` file — without it, Jekyll would silently drop
`.well-known/`, and the manifest would 404 while every other file worked.
