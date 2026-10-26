// test-previous-life-20261026 — game59 2: "Previous life" (vieAvant) is fed from the page's REAL previous read, where one exists.
//   It was "not read" for UNIT and AAPLc: the profile reads a block's market once, and the server-index fallback (AAPLc, an
//   Aerodrome market our chain reader does not read) always cut vieAvant to null — rightly so when the previous read was in
//   another unit (ETH on chain vs dollars at the index).
//   A. the fallback: the previous SERVER-INDEX life of the same field (fdvUsd, else liquiditeUsd), kept when a new index row
//      replaces the old one (rememberServerLife), becomes vieAvant. Another field, or no previous row: null, as before.
//   B. app.html: every index row put into marcheParAdr first remembers the row it replaces.
//   C. the profile re-reads its block's market every 45 s (read-only: the same vieDuBlock read, and GET /api/trending only);
//      a new read in the SAME currency moves the old one to profileLifeBefore; battreProfil feeds it as vieAvant when the map
//      has none. Run for real with stubs: same currency -> fed; other currency or a failed read -> unchanged.
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const DIR = new URL('./', import.meta.url);
const app = readFileSync(new URL('app.html', DIR), 'utf8').replace(/\r\n/g, '\n');
let count = 0; const ok = (c, m) => { assert.ok(c, m); count++; };
const fnOf = (name) => { const i = app.indexOf('function ' + name + '('); ok(i > 0, name + ' found'); return app.slice(i, i + app.slice(i).search(/\n\}/) + 2); };
const ADR = '0x' + 'ab'.repeat(20);

/* A: the real slice, run */
{
  const d = app.indexOf('function vieServeurPourCerveau('), f = app.indexOf('function echangesDe(h)', d);
  ok(d > 0 && f > d, 'A: the entreesCerveau slice is found');
  const slice = app.slice(d, f);
  ok(/function rememberServerLife\(/.test(slice), 'A: rememberServerLife lives with entreesCerveau');
  const make = (marche) => new Function('marcheParAdr', 'echangesDe', 'roleDe', 'rpcTete', slice + '\nreturn { entreesCerveau, rememberServerLife: typeof rememberServerLife === "function" ? rememberServerLife : null };')(marche, () => ({}), () => null, { n: 52_000_000 });
  const row = (fdv, liq) => ({ adr: ADR, prixUsd: 160.5, fdvUsd: fdv, liquiditeUsd: liq, dex: 'aerodrome' });
  {
    const m = new Map([[ADR, row(10_000_000, 2_000_000)]]); const S = make(m);
    S.rememberServerLife(ADR); m.set(ADR, row(11_000_000, 2_100_000));
    const e = S.entreesCerveau(null, null, null, 'NON_LUE', null, { adr: ADR });
    ok(e.vie === 11_000_000 && e.vieAvant === 10_000_000, 'A: the previous index read of the same field is the previous life (' + e.vie + ' / ' + e.vieAvant + ')');
  }
  {
    const m = new Map([[ADR, row(null, 2_000_000)]]); const S = make(m);
    S.rememberServerLife(ADR); m.set(ADR, row(11_000_000, 2_100_000));
    ok(S.entreesCerveau(null, null, null, 'NON_LUE', null, { adr: ADR }).vieAvant === null, 'A: another field (liquidity then FDV) -> null');
  }
  {
    const m = new Map([[ADR, row(11_000_000, 2_100_000)]]); const S = make(m);
    ok(S.entreesCerveau(null, 3000, null, 'NON_LUE', null, { adr: ADR }).vieAvant === null, 'A: no previous index row -> null (no ETH -> $ change invented)');
    const chain = S.entreesCerveau(3000, 2900, null, 'LUE', null, { adr: ADR });
    ok(chain.vie === 3000 && chain.vieAvant === 2900, 'A: a chain read passes through unchanged');
  }
}
/* B */
{
  const lines = app.split('\n');
  const sets = lines.map((l, i) => [l, i]).filter(([l]) => /marcheParAdr\.set\(String\(l\.adr\)\.toLowerCase\(\), avecPoolAction\(l\)\)/.test(l));
  ok(sets.length >= 2, 'B: the index row sites are found (' + sets.length + ')');
  for (const [l, i] of sets) ok(/rememberServerLife\(/.test(l) || /rememberServerLife\(/.test(lines[i - 1]), 'B: line ' + (i + 1) + ' remembers the row it replaces');
}
/* C */
{
  ok(app.includes('async function refreshProfileLife('), 'C: refreshProfileLife is async');
  const src = 'async ' + fnOf('refreshProfileLife');
  ok(/const PROFILE_LIFE_REFRESH_MS = 45000;/.test(app), 'C: every 45 s');
  ok(!/method:/.test(src) && !/eth_send|sendTransaction|localStorage\.setItem/.test(src), 'C: read-only');
  ok(/void refreshProfileLife\(\);/.test(fnOf('battreProfil')), 'C: the profile beat triggers it');
  ok(/profileLifeBefore && profileLifeBefore\.adr === String\(profilCerveau\.adr\)\.toLowerCase\(\) \? profileLifeBefore\.v : null/.test(fnOf('battreProfil')), 'C: battreProfil feeds it as vieAvant');
  ok(/profileLifeBefore = null;/.test(fnOf('lireProfil')), 'C: a new profile starts without one');
  const build = (deps) => new Function('deps', 'let vieProfil = deps.vieProfil, deviseProfil = deps.deviseProfil, etatVieProfil = deps.etatVieProfil, profileLifeBefore = null;'
    + 'const profileLifeRefresh = { at: 0, busy: false }; const PROFILE_LIFE_REFRESH_MS = 45000;'
    + 'const { profilCerveau, vieDuBlock, rpc, RESEAUX, CHAINE, clesReellesDe, enrichirMarcheSiDecouvert, fetch, marcheParAdr, rememberServerLife, avecPoolAction, $, habitants, appliquerVie } = deps;'
    + src + '\nreturn { run: refreshProfileLife, get: () => ({ vieProfil, profileLifeBefore }) };')(deps);
  const deps = (v) => ({ vieProfil: 10, deviseProfil: 'ETH', etatVieProfil: 'LUE', profilCerveau: { adr: ADR }, rpc: null, RESEAUX: { 8453: { stateView: '0x' } }, CHAINE: 8453,
    habitants: [], appliquerVie: () => { throw new Error('appliquerVie without a tile'); }, vieDuBlock: async () => v, clesReellesDe: async () => [], enrichirMarcheSiDecouvert: async (a, x) => x, marcheParAdr: new Map(), rememberServerLife: () => {}, avecPoolAction: (l) => l,
    fetch: async () => ({ json: async () => ({ ok: true, lignes: [] }) }), $: () => ({ dataset: { block: ADR } }) });
  { const R = build(deps({ etat: 'LUE', vie: 10.5, devise: 'ETH' })); await R.run(); const g = R.get();
    ok(g.vieProfil === 10.5 && g.profileLifeBefore && g.profileLifeBefore.v === 10 && g.profileLifeBefore.adr === ADR, 'C: same currency -> the old read becomes the previous life'); }
  { const R = build(deps({ etat: 'LUE', vie: 0.004, devise: 'USDC' })); await R.run(); const g = R.get();
    ok(g.vieProfil === 10 && g.profileLifeBefore === null, 'C: another currency -> nothing fed'); }
  { const R = build(deps({ etat: 'NON_LUE' })); await R.run(); const g = R.get();
    ok(g.vieProfil === 10 && g.profileLifeBefore === null, 'C: a failed read -> nothing fed'); }
  { // D. an index row it already has is refreshed from GET /api/trending, the old one remembered first, the pairs repainted
    const d = deps({ etat: 'NON_LUE' }); const seen = []; let painted = 0;
    d.marcheParAdr = new Map([[ADR, { adr: ADR, prixUsd: 1, fdvUsd: 100 }]]);
    d.rememberServerLife = (a) => seen.push(['remember', String(a).toLowerCase(), d.marcheParAdr.get(ADR).fdvUsd]);
    d.fetch = async (url, o) => { seen.push(['fetch', url, o && o.method]); return { json: async () => ({ ok: true, lignes: [{ adr: ADR, prixUsd: 1, fdvUsd: 120 }] }) }; };
    d.peindrePaires = () => { painted++; };
    const R = new Function('deps', 'let vieProfil = deps.vieProfil, deviseProfil = deps.deviseProfil, etatVieProfil = deps.etatVieProfil, profileLifeBefore = null;'
      + 'const profileLifeRefresh = { at: 0, busy: false }; const PROFILE_LIFE_REFRESH_MS = 45000;'
      + 'const { profilCerveau, vieDuBlock, rpc, RESEAUX, CHAINE, clesReellesDe, enrichirMarcheSiDecouvert, fetch, marcheParAdr, rememberServerLife, avecPoolAction, $, peindrePaires, habitants, appliquerVie } = deps;'
      + src + '\nreturn { run: refreshProfileLife };')(d);
    await R.run();
    ok(seen.length === 2 && seen[0][0] === 'fetch' && seen[0][1] === '/api/trending' && seen[0][2] === undefined, 'D: one GET /api/trending');
    ok(seen[1][0] === 'remember' && seen[1][1] === ADR && seen[1][2] === 100, 'D: the old row is remembered before it is replaced');
    ok(d.marcheParAdr.get(ADR).fdvUsd === 120 && painted === 1, 'D: the new row is stored and the pairs repainted'); }
  { // E. measured on AAPLc (on the map): the map stepped its brain first, with the map tile's vieAvant — so the profile's new
    //    read goes to its map tile too, through the map's one function (appliquerVie), same currency only
    const run = async (tileDevise) => {
      const d = deps({ etat: 'LUE', vie: 10.5, devise: 'ETH' }); const applied = [];
      d.habitants = [{ adr: ADR.toUpperCase().replace('0X', '0x'), vie: 9, devise: tileDevise }];
      d.appliquerVie = (h, r) => { applied.push(r.vie); h.vieAvant = h.vie; h.vie = r.vie; };
      const R = new Function('deps', 'let vieProfil = deps.vieProfil, deviseProfil = deps.deviseProfil, etatVieProfil = deps.etatVieProfil, profileLifeBefore = null;'
        + 'const profileLifeRefresh = { at: 0, busy: false }; const PROFILE_LIFE_REFRESH_MS = 45000;'
        + 'const { profilCerveau, vieDuBlock, rpc, RESEAUX, CHAINE, clesReellesDe, enrichirMarcheSiDecouvert, fetch, marcheParAdr, rememberServerLife, avecPoolAction, $, habitants, appliquerVie } = deps;'
        + src + '\nreturn { run: refreshProfileLife };')(d);
      await R.run(); return { tile: d.habitants[0], applied };
    };
    const same = await run('ETH');
    ok(same.applied.join() === '10.5' && same.tile.vieAvant === 9 && same.tile.vie === 10.5, 'E: same currency -> its map tile gets the read (vieAvant 9, vie 10.5)');
    const other = await run('USDC');
    ok(other.applied.length === 0 && other.tile.vie === 9 && other.tile.vieAvant === undefined, 'E: another currency on the tile -> untouched');
  }
}
console.log('test-previous-life-20261026: ' + count + ' assertions, OK');
