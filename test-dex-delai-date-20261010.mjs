/* test-dex-delai-date-20261010.mjs - LE CADRE DEXSCREENER NE RESTE PAS BLOQUE, ET LA DATE SE LIT (QA Grok Super, prod 20261010-rail-hook-dex).
 * EXECUTE dateMesureLisible et montrerEmbedDex EXTRAITS d app.html (TB_APP = ancienne) avec un DOM et une horloge de laboratoire.
 * AFFIRME : 'measured 2026-10-10T20:43:00.000Z' -> 'measured 10 Oct, HH:MM' (heure locale) ; un texte sans ISO inchange ; une iframe
 * qui n a pas CHARGE apres le delai -> 'Chart unavailable right now — Open DexScreener ↗' (lien = la paire) ; une iframe chargee reste.
 * NE PROUVE PAS : le cas 'charge puis bloque sur Loading pair...' (cross-origin, indetectable) ; le rendu navigateur.
 */
import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';
const html = readFileSync(process.env.TB_APP || new URL('./app.html', import.meta.url), 'utf8');
const extraire = (sig) => {
  const debut = html.indexOf(sig); assert.ok(debut > 0, 'introuvable : ' + sig);
  let prof = 0, fin = -1, dans = null, rx = false;
  for (let i = html.indexOf(') {', debut) + 2; i < html.length; i++) {
    const c = html[i], p = html[i - 1];
    if (dans) { if (c === dans && p !== '\\') dans = null; continue; }
    if (c === '"' || c === "'" || c === '`') { dans = c; continue; }
    if (c === '{') prof++; else if (c === '}') { prof--; if (!prof) { fin = i + 1; break; } }
  }
  return html.slice(debut, fin);
};
const dl = new Function(extraire('function dateMesureLisible(') + '; return dateMesureLisible;')();
const iso = '2026-10-10T20:43:00.000Z', d = new Date(iso);
const attendu = 'measured ' + d.getDate() + ' Oct, ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
assert.equal(dl('measured ' + iso), attendu);
assert.equal(dl('unread \u00b7 ' + iso).includes('T20:43'), false, 'ISO brut restant');
assert.equal(dl('no date here'), 'no date here');
assert.equal(dl(null), '');
/* DOM de laboratoire */
const el = () => { const e = { hidden: false, style: {}, attrs: {}, enfants: [], ecouteurs: {}, textContent: '',
  getAttribute: (k) => e.attrs[k] ?? null, removeAttribute: (k) => { delete e.attrs[k]; }, append: (x) => e.enfants.push(x),
  addEventListener: (n, f) => { e.ecouteurs[n] = f; } };
  Object.defineProperty(e, 'src', { set: (v) => { e.attrs.src = v; }, get: () => e.attrs.src }); return e; };
const minuteurs = [];
async function scenario(charge) {
  const dom = { '#pPnlDexFrame': el(), '#pPnlDexPanne': el(), '#pPnlDexPanneTxt': el(), '#pPnlDexEmbed': el() };
  dom['#pPnlDexPanne'].hidden = true;
  minuteurs.length = 0;
  const env = { dexEmbedCourant: null };
  const src = extraire('async function montrerEmbedDex(');
  const pre = (html.match(/const DEX_DELAI_CHARGE_MS = \d+;/) || ['const DEX_DELAI_CHARGE_MS = 15000;'])[0];
  const f = new Function('$', 'fetch', 'setTimeout', 'document', 'env',
    pre + '\nlet dexEmbedCourant = null;\n' + src.replace(/dexEmbedCourant/g, 'env.dexEmbedCourant') + '; return montrerEmbedDex;')(
    (q) => dom[q], async () => ({ json: async () => ({ ok: true, etat: 'OK', status: 200 }) }), (fn, ms) => minuteurs.push([fn, ms]),
    { createElement: () => el() }, env);
  const base = 'https://dexscreener.com/base/0x' + 'ab'.repeat(20);
  await f({ base, src: base + '?embed=1' });
  if (charge && dom['#pPnlDexFrame'].ecouteurs.load) dom['#pPnlDexFrame'].ecouteurs.load();
  for (const [fn] of minuteurs) fn();
  return { dom, base };
}
const bloque = await scenario(false);
assert.equal(bloque.dom['#pPnlDexPanne'].hidden, false, 'iframe jamais chargee : la carte n apparait pas');
assert.equal(bloque.dom['#pPnlDexFrame'].hidden, true);
assert.equal(bloque.dom['#pPnlDexPanneTxt'].textContent, 'Chart unavailable right now \u2014 ');
const lien = bloque.dom['#pPnlDexPanneTxt'].enfants[0];
assert.ok(lien && lien.textContent === 'Open DexScreener \u2197' && lien.href === bloque.base, 'lien DexScreener absent');
const ok = await scenario(true);
assert.equal(ok.dom['#pPnlDexPanne'].hidden, true, 'une iframe chargee a ete remplacee');
assert.equal(ok.dom['#pPnlDexFrame'].hidden, false);
console.log('ok dex-delai-date - date lisible, carte apres delai sans chargement ; NE PROUVE PAS le blocage interne cross-origin');