/* test-banque-taux-lus-20261025.mjs - LES TAUX DE LA BANK : CE QUI EST AFFICHE EST CE QUI A ETE LU, ET UN « 0.00 % » DIT POURQUOI.
 * Rapport de Phil (2026-10-25) : sur la liste Borrow/Lend, METAc / AMZNc / TSLAc / MSFTc « Earns a year 0.00 % » - un bug d affichage ?
 * MESURE DU 2026-10-25 (lecture seule) : API blue-api.morpho.org (la source de l app) ET la chaine (Morpho Blue market(id) +
 *   AdaptiveCurveIrm.borrowRateView, bloc 53066571, base-rpc.publicnode.com). Les 9 marches listes : fee = 0 partout ; supplyApy de l API
 *   == borrowApy x utilisation x (1 - fee) ; l app affiche les chiffres de l API sans erreur d unite. Les « 0.00 % » sont REELS :
 *   utilisation 0.53 % (METAc), 0.53 % (AMZNc), 0.71 % (MSFTc), 0.00003 % (TSLAc : 993 unites = 0,000993 USDC empruntes) ->
 *   gain de 0.0032 %, 0.0032 %, 0.0044 %, 0.0000002 % par an, que toFixed(2) ARRONDISSAIT a « 0.00 % ».
 * LE DEFAUT : un gain lu, positif et minuscule s ecrivait « 0.00 % » (on lit « rien »), sans dire pourquoi ; et une chaine vide
 *   (Number('') = 0) se serait ecrite « 0.00 % » au lieu de « non lu ».
 * AFFIRME (EXECUTE bcPct et bcBanqueGainDit d app.html, TB_APP = autre copie) : les 9 lignes enregistrees s affichent comme le voit
 *   Phil pour les couts et les gains >= 0,01 % ; un gain lu > 0 et < 0,005 % s ecrit « < 0.01 % » ; 0 lu s ecrit « 0.00 % » ; non lu
 *   (null, undefined, '', texte) s ecrit « not read », jamais un chiffre ; la phrase de la carte dit « personne n emprunte » a
 *   utilisation 0, « presque rien, seulement X % emprunte » sous 1 %, rien au-dela ni sur une utilisation non lue ; la carte la pose.
 * NE PROUVE PAS : le rendu navigateur ; que l API reste juste demain (l app ne relit pas les taux sur la chaine - mesure faite a la main
 *   ce jour, ecart chaine/API sur les marches peu utilises = taux moyen depuis lastUpdate vs taux instantane, pas une erreur).
 */
import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';
const html = readFileSync(process.env.TB_APP || new URL('./app.html', import.meta.url), 'utf8');
let n = 0;
const vu = (c, m) => { assert.ok(c, m); n += 1; };
const fonction = (entete) => {
  const i = html.indexOf(entete); assert.ok(i > 0, 'introuvable : ' + entete);
  const f = /\r?\n\}/.exec(html.slice(i)); return html.slice(i, i + f.index + f[0].length);
};
const instruction = (debut, fin) => { const i = html.indexOf(debut); assert.ok(i > 0, 'introuvable : ' + debut); const j = html.indexOf(fin, i); assert.ok(j > i, 'fin introuvable : ' + fin); return html.slice(i, j); };
const bcPct = new Function(instruction('const bcPct = ', '/* insecable') + '\nreturn bcPct;')();
const bcBanqueGainDit = new Function('bcPct', fonction('function bcBanqueGainDit(mk) {') + '\nreturn bcBanqueGainDit;')(bcPct);
const sans = (s) => String(s).replace(/\s/g, ' ');

/* Lignes ENREGISTREES le 2026-10-25 (API Morpho, champs utilisés par l app) - copiees de la reponse, pas retapees de memoire. */
const LUS = [
  { sym: 'SPCXc', id: '0xce983b9ee6344e16ebbcc66812f23caafc63ae83fcc14fa29b66c7e69e9cecf6', utilisation: 0.9106424339628437, apyEmprunt: 0.053939588880468035, apyPret: 0.049003557605461476, voit: ['5.39 %', '4.90 %'] },
  { sym: 'AMZNc', id: '0xcca091ada0a486dd74743ab5f1b1b972adefaad357e2634fd7362a0d798dcd42', utilisation: 0.005319401288974748, apyEmprunt: 0.006087543180618592, apyPret: 0.00003228442890695868, voit: ['0.61 %', '< 0.01 %'] },
  { sym: 'TSLAc', id: '0xc819df1685193012fc1d189e4ae22f6658442805f121303aebb04c81bd6d55d5', utilisation: 2.83714196222e-7, apyEmprunt: 0.0059937351926590285, apyPret: 1.6714080013968023e-9, voit: ['0.60 %', '< 0.01 %'] },
  { sym: 'NVDAc', id: '0xb4b42dd66cef25614b94510a910d54b2c148e7621d22b4271566724beda63d13', utilisation: 0.1387800129258413, apyEmprunt: 0.012540397200427083, apyPret: 0.0017310309687639188, voit: ['1.25 %', '0.17 %'] },
  { sym: 'AAPLc', id: '0xae1a30486234bf7e7ac166c7c03d9bc5f2cd8a39be2c48e73c665ac7148c3c28', utilisation: 0.892430464136873, apyEmprunt: 0.05667762208635392, apyPret: 0.05042977963738153, voit: ['5.67 %', '5.04 %'] },
  { sym: 'GOOGLc', id: '0xa3913d896b7e9c0e0a84f1be27d376cf2065616101cb7c44674af8a154e684cc', utilisation: 0.8891008334573578, apyEmprunt: 0.055110160486144893, apyPret: 0.048851727955562904, voit: ['5.51 %', '4.89 %'] },
  { sym: 'MSFTc', id: '0x4f9329a87a70e722cdab07b3647ef705671b25079d4f3bae559be5cfe12a7318', utilisation: 0.007143195338649508, apyEmprunt: 0.006133304784181721, apyPret: 0.000043678534631417836, voit: ['0.61 %', '< 0.01 %'] },
  { sym: 'METAc', id: '0x44b343b5087c0bd34207cb5c199f12030777bf6b8c0a128438246f1212f37ca5', utilisation: 0.005304301853702145, apyEmprunt: 0.0059713144836821795, apyPret: 0.0000315799552442887, voit: ['0.60 %', '< 0.01 %'] },
  { sym: 'GOOGLc', id: '0x0cc78b1f4993015116e90626a18a1ba0e1ca73d0b75781b231d02fa5536e62a5', utilisation: 1.69576715501e-7, apyEmprunt: 0.005994641608569026, apyPret: 1.009152000509194e-9, voit: ['0.60 %', '< 0.01 %'] },
];
for (const m of LUS) {
  /* la formule de Morpho (fee = 0 lu sur la chaine pour les 9) : le gain enregistre EST cout x utilisation, a l arrondi de l API pres */
  vu(Math.abs(m.apyPret - m.apyEmprunt * m.utilisation) <= 1e-9 + 0.01 * m.apyPret, m.sym + ' : gain != cout x utilisation');
  vu(sans(bcPct(m.apyEmprunt)) === m.voit[0], m.sym + ' cout affiche ' + bcPct(m.apyEmprunt) + ' au lieu de ' + m.voit[0]);
  vu(sans(bcPct(m.apyPret)) === m.voit[1], m.sym + ' gain affiche ' + bcPct(m.apyPret) + ' au lieu de ' + m.voit[1]);
  vu(sans(bcPct(m.apyPret)) !== '0.00 %', m.sym + ' : un gain LU et positif s ecrit « 0.00 % »');
}
/* zero lu = 0.00 % ; non lu = « not read », jamais un chiffre */
vu(sans(bcPct(0)) === '0.00 %', 'zero lu mal ecrit : ' + bcPct(0));
for (const x of [null, undefined, '', '  ', 'abc', NaN, Infinity]) vu(bcPct(x) === 'not read', 'non lu ecrit ' + JSON.stringify(bcPct(x)) + ' pour ' + String(x));

/* la phrase de la carte */
const dit = (u, apyPret = 0) => bcBanqueGainDit({ utilisation: u, apyPret, pret: { symbole: 'USDC' } });
vu(/no one borrows on this market yet/.test(dit(0)) && /0\.00/.test(dit(0)), 'utilisation 0 : ' + dit(0));
const meta = LUS.find((m) => m.sym === 'METAc');
const dMeta = sans(bcBanqueGainDit({ ...meta, pret: { symbole: 'USDC' } }));
vu(/almost nothing/.test(dMeta) && /only 0\.53 % of the lent USDC is borrowed/.test(dMeta), 'METAc : ' + dMeta);
const dTsla = sans(bcBanqueGainDit({ ...LUS[2], pret: { symbole: 'USDC' } }));
vu(/only < 0\.01 % of the lent USDC is borrowed/.test(dTsla), 'TSLAc : ' + dTsla);
for (const m of LUS.filter((x) => x.utilisation >= 0.01)) vu(bcBanqueGainDit({ ...m, pret: { symbole: 'USDC' } }) === '', m.sym + ' : phrase sur un marche utilise');
for (const u of [null, undefined, '', 'abc']) vu(dit(u) === '', 'utilisation non lue -> une phrase : ' + dit(u));
vu(!/\d/.test(dit(null)), 'utilisation non lue : un chiffre invente');

/* la carte pose la phrase, et seulement si elle existe */
const charger = fonction('async function bcBanqueCharger(');
vu(/bcBanqueGainDit\(mk\)/.test(charger), 'la carte ne pose pas la phrase du gain');
console.log('test-banque-taux-lus : ' + n + '/' + n + ' verts');
