// test-surprise-sous-plafond-20261016.mjs - 2026-10-16, Create live : « Surprise me » a tire une face dont les metadonnees
// gravees depassent le plafond (« Engraved metadata is too big »). Mesure sur 20 000 tirages (logo.js reel, nom 32 + symbole 8) :
// 1 572 au-dessus de 24 000 octets, pire cas 67 542. Ce test : sur 3 000 graines, le tirage contraint reste SOUS le plafond ;
// le tirage libre (temoin) le depasse ; app.html utilise le tirage contraint et le MEME plafond que uriCreation.
import { readFileSync } from 'node:fs';
import { tirerSousPlafond, PLAFOND_URI_OCTETS } from './face-hasard.js';
import { logoSvg, paramsLogoDepuisApparence } from './logo.js';
import { ORBITES_CREATE as O, FACETTES_CREATE as F, MATIERES_CREATE as M, ORNEMENTS_CREATE as N } from './face.js';
let n = 0, ko = 0;
const ok = (c, m) => { n++; if (c) console.log('ok  ' + m); else { ko++; console.log('KO  ' + m); } };
const C = [['teinte', 0, 360], ['accent', 0, 360], ['saturation', 20, 100], ['division', 1, 8], ['eclats', 0, 12], ['ecart', 0, 8]];
const L = [['orbite', O], ['facette', F], ['matiere', M], ['ornement', N]];
const prng = (graine) => { let x = graine >>> 0 || 1; return () => { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; }; };
const tirerAvec = (rnd) => () => { const a = {}; for (const [k, lo, hi] of C) a[k] = lo + Math.floor(rnd() * (hi - lo + 1)); for (const [k, v] of L) a[k] = v[Math.floor(rnd() * v.length)]; return a; };
const taille = (a) => {
  const meta = { name: 'W'.repeat(32), symbol: 'WWWWWWWW', supply: '1000000000000000000000000000', sealed: true, face: a, flyBrain: true,
    role: 'xxxxxxxxxx', image: logoSvg(paramsLogoDepuisApparence(a, 'WWWWWWWW')),
    pair: { address: '0x' + '0'.repeat(40), symbol: 'USDC', kind: 'STABLE', verified: true } };
  return Buffer.byteLength('data:application/json,' + encodeURIComponent(JSON.stringify(meta)));
};
ok(PLAFOND_URI_OCTETS === 24000, 'plafond = 24 000 octets (celui de uriCreation)');
let libresTrop = 0, contraintsTrop = 0, nuls = 0, pire = 0;
for (let g = 1; g <= 3000; g++) {
  if (taille(tirerAvec(prng(g * 7919))()) > PLAFOND_URI_OCTETS) libresTrop++;
  const r = tirerSousPlafond({ tirer: tirerAvec(prng(g)), mesure: taille, plafond: PLAFOND_URI_OCTETS });
  if (!r) { nuls++; continue; }
  const t = taille(r.apparence); if (t > pire) pire = t;
  if (t > PLAFOND_URI_OCTETS || r.taille !== t) contraintsTrop++;
}
ok(libresTrop > 0, 'temoin : le tirage libre depasse le plafond (' + libresTrop + '/3000)');
ok(contraintsTrop === 0, 'tirage contraint : 0/3000 au-dessus du plafond (pire ' + pire + ' octets)');
ok(nuls === 0, 'tirage contraint : une face trouvee pour chaque graine (' + nuls + ' echecs)');
ok(tirerSousPlafond({ tirer: () => ({}), mesure: () => null, plafond: 10, essais: 5 }) === null, 'mesure illisible partout -> null, jamais une face non mesuree');
const html = readFileSync(new URL('./app.html', import.meta.url), 'utf8');
const i0 = html.indexOf('function hasardApparence()');
const corps = i0 >= 0 ? html.slice(i0, html.indexOf('function uriCreation()', i0)) : '';
ok(/tirerSousPlafond\(/.test(corps), 'hasardApparence passe par tirerSousPlafond');
const u0 = html.indexOf('function uriCreation()');
const uc = u0 >= 0 ? html.slice(u0, u0 + 8000) : '';
ok(/length > PLAFOND_URI_OCTETS/.test(uc) && !/length > 24000/.test(uc), 'uriCreation compare au meme PLAFOND_URI_OCTETS');
console.log(ko ? 'FAIL surprise-sous-plafond ' + ko + '/' + n + ' KO' : 'ALL PASS surprise-sous-plafond ' + n + ' assertions');
process.exit(ko ? 1 : 0);
