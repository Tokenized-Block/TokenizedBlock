/* test-rail-fiat-onglet-20261010.mjs - LE LIEN CARTE OUVRE COINBASE DANS UN NOUVEL ONGLET, JAMAIS A LA PLACE DE L APP.
 * Test prod de Grok (20261010-bank-all-paths, « Add USDC with a card ») : l onglet de l app est REMPLACE par Coinbase, et un onglet
 *   VIDE s ouvre en plus. /api/entonnoir du jour : onramp_session_ok=1, aucun repli -> la session etait bonne.
 * Cause : `window.open('', '_blank', 'noopener')` rend TOUJOURS null (spec HTML : noopener -> « return null ») ; le code prenait ce
 *   null pour un onglet bloque et redirigeait `window.location` - l onglet vide, lui, restait ouvert.
 * EXECUTE ouvrirRailFiat extraite d app.html (TB_APP = ancienne) avec un window.open CONFORME a la spec, fetch et DOM simules.
 * AFFIRME : session OK -> le NOUVEL onglet va sur pay.coinbase.com, l app reste ou elle est, l onglet n a pas d opener ; session en
 *   echec -> le nouvel onglet va sur le lien public ; popup vraiment bloquee (open -> null sans noopener) -> repli sur l onglet courant.
 * NE PROUVE PAS : le comportement d un vrai navigateur (popup blocker, Rabby), ni la page Coinbase elle-meme.
 */
import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';
const html = readFileSync(process.env.TB_APP || new URL('./app.html', import.meta.url), 'utf8');
const i0 = html.indexOf('async function ouvrirRailFiat(');
const fin = i0 > 0 ? /\r?\n\}/.exec(html.slice(i0)) : null;
assert.ok(i0 > 0 && fin, 'ouvrirRailFiat introuvable');
const src = html.slice(i0, i0 + fin.index + fin[0].length);
const URL_OK = 'https://pay.coinbase.com/buy/select-asset?sessionToken=t&defaultNetwork=base&defaultAsset=USDC';
const PUBLIC = 'https://www.coinbase.com/onramp';
async function cas({ reponse, bloque = false }) {
  const app = { href: 'https://tokenizedblock.space/app' };
  const ouverts = [];
  const window = {
    get location() { return app; },
    open(url, cible, options) {
      /* spec HTML (window open steps) : noopener ou noreferrer -> le contexte s ouvre, mais la fonction rend null */
      const o = { url, opener: 'app', location: null };
      if (bloque) return null;
      ouverts.push(o);
      return /\bnoopener\b|\bnoreferrer\b/.test(String(options || '')) ? null : o;
    },
  };
  const etapes = [];
  /* 2026-10-25 : ouvrirRailFiat note le solde d avant (repere du retour fiat) APRES avoir ouvert l onglet. La dependance est
   *   injectee ici comme les autres ; on enregistre QUAND elle est appelee (combien d onglets deja ouverts a ce moment). */
  const reperes = [];
  const noterSoldeAvantFiat = async (adr, actif) => { reperes.push({ adr, actif, ongletsDejaOuverts: ouverts.length }); };
  const fn = new Function('window', 'compte', '$', 'fetch', 'etape', 'AbortController', 'setTimeout', 'clearTimeout', 'noterSoldeAvantFiat', src + '\nreturn ouvrirRailFiat;')(
    window, '0x' + '31'.repeat(20), () => null,
    async () => (reponse === 'panne' ? Promise.reject(new Error('reseau')) : { json: async () => reponse }),
    (e) => etapes.push(e), AbortController, setTimeout, clearTimeout, noterSoldeAvantFiat);
  let empeche = false;
  await fn({ preventDefault() { empeche = true; } }, { href: PUBLIC }, 'USDC');
  return { app: app.href, ouverts, etapes, empeche, reperes };
}
let n = 0;
const vu = (c, m) => { assert.ok(c, m); n += 1; };
{
  const r = await cas({ reponse: { ok: true, url: URL_OK } });
  vu(r.empeche, 'le clic n est pas intercepte');
  vu(r.app === 'https://tokenizedblock.space/app', 'ROUGE->VERT : session OK -> l onglet de l APP est remplace par ' + r.app);
  vu(r.ouverts.length === 1 && String(r.ouverts[0].location) === URL_OK, 'session OK -> le nouvel onglet ne va pas sur pay.coinbase.com (vu ' + JSON.stringify(r.ouverts) + ')');
  vu(r.ouverts[0].opener === null, 'le nouvel onglet garde un lien vers l app (opener non coupe)');
  vu(r.etapes.includes('onramp_session_ok'), 'l etape onramp_session_ok n est plus comptee');
  /* 2026-10-25 : le repere du retour fiat est pris UNE fois, pour CE wallet et CET actif, et APRES l ouverture de l onglet
   *   (une lecture attendue avant `window.open` ferait bloquer l onglet comme popup). */
  vu(r.reperes.length === 1 && r.reperes[0].actif === 'USDC' && r.reperes[0].adr === '0x' + '31'.repeat(20) && r.reperes[0].ongletsDejaOuverts === 1,
    'le solde d avant n est pas note une fois, pour ce wallet et cet actif, apres l ouverture de l onglet : ' + JSON.stringify(r.reperes));
}
{
  const r = await cas({ reponse: { ok: false } });
  vu(r.app === 'https://tokenizedblock.space/app' && r.ouverts.length === 1 && String(r.ouverts[0].location) === PUBLIC, 'session refusee -> le nouvel onglet ne va pas sur le lien public');
  vu(r.etapes.includes('onramp_session_repli'), 'repli non compte');
}
{
  const r = await cas({ reponse: { ok: true, url: 'https://evil.example/' } });
  vu(r.ouverts.length === 1 && String(r.ouverts[0].location) === PUBLIC, 'une url hors pay.coinbase.com devient une destination');
}
{
  const r = await cas({ reponse: 'panne' });
  vu(r.app === 'https://tokenizedblock.space/app' && String(r.ouverts[0] && r.ouverts[0].location) === PUBLIC, 'panne reseau -> le nouvel onglet ne va pas sur le lien public');
}
{
  const r = await cas({ reponse: { ok: true, url: URL_OK }, bloque: true });
  vu(r.ouverts.length === 0 && r.app === URL_OK, 'popup vraiment bloquee -> pas de repli sur l onglet courant (vu ' + r.app + ')');
}
console.log('ok rail-fiat-onglet - ' + n + ' assertions : nouvel onglet, app intacte, opener coupe ; NE PROUVE PAS un vrai navigateur');
