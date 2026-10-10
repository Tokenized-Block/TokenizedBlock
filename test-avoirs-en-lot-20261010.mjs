/* test-avoirs-en-lot-20261010.mjs - LE WALLET LIT LES SOLDES DU REGISTRE EN LOT, ET UN SOLDE NON LU N EST JAMAIS UN ZERO.
 * Test prod de Grok (20261010-bank-all-paths, wallet 0x31e0) : l onglet Wallet cachait NVDAc (achete, verifie on-chain) - il ne
 *   lisait en direct qu ETH et USDC, le reste venait d un balayage des journaux que les noeuds refusent (« 17 chain windows »).
 * EXECUTE avoirs.js avec des noeuds simules qui imitent les reponses MESUREES le 2026-10-10 : base.org lit 5 d un lot et refuse le
 *   reste « 25/second request limit reached » ; publicnode lit tout ; drpc refuse le lot (HTTP 500). Puis le cablage : la route
 *   /api/avoirs (serveur) et majWallet (app.html) qui l appelle.
 * AFFIRME : >0 rendu avec ses decimales, 0 compte, non lu NOMME (jamais zero) ; le noeud suivant reprend SEULEMENT ce qui manque ;
 *   '0x' = non lu ; lots de 20 ; decimales lues une fois et seulement pour les detenus ; compte invalide refuse ; LU/PARTIEL/NON_LU.
 * NE PROUVE PAS : le rendu dans un vrai navigateur, ni les limites des noeuds au-dela du 2026-10-10.
 */
import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';
import { lireAvoirs, corpsLot, lireReponseLot, classeLot, TAILLE_LOT, SEL_DECIMALS } from './avoirs.js';
let n = 0;
const vu = (c, m) => { assert.ok(c, m); n += 1; };
const QUI = '0x' + '31'.repeat(20);
const J = Array.from({ length: 45 }, (_, i) => '0x' + (i + 1).toString(16).padStart(40, '0'));
const mot = (v) => '0x' + BigInt(v).toString(16).padStart(64, '0');
const SOLDE = (adr) => (adr === J[3] ? 1234n : adr === J[30] ? 7n : 0n);
const valeur = (c) => (c.params[0].data === SEL_DECIMALS ? mot(6) : mot(SOLDE(c.params[0].to)));
const NOEUDS = {
  baseorg: (corps) => corps.map((c) => (c.id <= 5 ? { jsonrpc: '2.0', id: c.id, result: valeur(c) } : { jsonrpc: '2.0', id: c.id, error: { code: -32016, message: '25/second request limit reached' } })),
  publicnode: (corps) => corps.map((c) => ({ jsonrpc: '2.0', id: c.id, result: valeur(c) })),
  drpc: () => { throw new Error('HTTP 500'); },
  vide: (corps) => corps.map((c) => ({ jsonrpc: '2.0', id: c.id, result: '0x' })),
};
const appels = [];
const envoyer = async (url, corps) => { appels.push({ url, n: corps.length, dec: corps[0].params[0].data === SEL_DECIMALS }); return NOEUDS[url](corps); };
/* les cas d arithmetique de lots tournent en UN passage, sans pause ; le 2e passage a son propre cas plus bas */
const unPassage = { passes: 1, attendre: async () => {} };
const soldesAppels = () => appels.filter((x) => !x.dec);
/* corps */
const c = corpsLot(QUI, [J[0], J[1]]);
vu(c.length === 2 && c[0].id === 1 && c[0].method === 'eth_call' && c[0].params[1] === 'latest' && c[0].params[0].data === '0x70a08231' + '0'.repeat(24) + QUI.slice(2), 'corps du lot faux : ' + c[0].params[0].data);
vu(corpsLot(null, [J[0]], 1, SEL_DECIMALS)[0].params[0].data === SEL_DECIMALS, 'decimals() porte un argument');
vu(TAILLE_LOT === 20, 'lots de 20 (base.org lit 20, pas 71)');
/* lecture des reponses : 0x et erreurs = non lus */
const l = lireReponseLot([{ id: 1, result: mot(5) }, { id: 2, result: '0x' }, { id: 3, error: { message: 'x' } }, null, { id: 4, result: 'zz' }]);
vu(l.size === 1 && l.get(1) === 5n, 'une reponse 0x / erreur / mal formee est prise pour un solde');
vu(lireReponseLot({ error: 'x' }).size === 0, 'une reponse non tableau est lue');
/* base.org seul : 5 lus par lot, le reste NOMME */
appels.length = 0;
const a1 = await lireAvoirs({ compte: QUI, jetons: J, noeuds: ['baseorg'], envoyer, ...unPassage });
vu(a1.etat === 'PARTIEL', 'base.org seul : etat ' + a1.etat);
vu(a1.nonLus.length === 30 && a1.zeros + a1.avoirs.length === 15, 'non lus mal comptes : ' + a1.nonLus.length + ' / ' + a1.zeros);
vu(a1.avoirs.length === 1 && a1.avoirs[0].adr === J[3] && a1.avoirs[0].solde === '1234' && a1.avoirs[0].decimales === 6, 'le solde lu > 0 n est pas rendu avec ses decimales : ' + JSON.stringify(a1.avoirs));
vu(!a1.avoirs.some((v) => v.adr === J[30]) && a1.nonLus.includes(J[30]), 'un solde NON lu est rendu comme lu, ou tu');
vu(soldesAppels().length === 3 && soldesAppels().every((x) => x.n <= 20), 'decoupe en lots de 20 fausse : ' + JSON.stringify(soldesAppels().map((x) => x.n)));
/* base.org puis publicnode : publicnode reprend SEULEMENT les manquants */
appels.length = 0;
const cache = new Map();
const a2 = await lireAvoirs({ compte: QUI, jetons: J, noeuds: ['baseorg', 'publicnode'], envoyer, decimalesConnues: cache, ...unPassage });
vu(a2.etat === 'LU' && a2.nonLus.length === 0, 'avec publicnode en repli : etat ' + a2.etat);
vu(a2.avoirs.map((v) => v.adr).join() === [J[3], J[30]].join() && a2.zeros === 43, 'avoirs faux apres repli');
/* lots 20/20/5 : base.org lit les ids 1..5 de chacun -> 15, 15 et 0 manquants ; le 3e lot complet n appelle pas publicnode */
const pn = soldesAppels().filter((x) => x.url === 'publicnode');
vu(pn.length === 2 && pn.every((x) => x.n === 15), 'le repli relit ce qui etait deja lu : ' + JSON.stringify(pn.map((x) => x.n)));
vu(appels.filter((x) => x.dec).length === 1 && cache.get(J[3]) === 6 && cache.get(J[30]) === 6, 'decimales des detenus non lues en un lot');
appels.length = 0;
await lireAvoirs({ compte: QUI, jetons: J, noeuds: ['publicnode'], envoyer, decimalesConnues: cache });
vu(appels.filter((x) => x.dec).length === 0, 'les decimales deja connues sont relues');
/* 2e passage (mesure locale : publicnode limite par nos balayages au demarrage, 14/76 non lus en un passage) : les SEULS manquants
 *   sont relus apres une pause ; temoin : en un passage, ils restent non lus */
let essais = 0, pauses = 0;
NOEUDS.lent = (corps) => (essais++ === 0 ? corps.map((x) => ({ jsonrpc: '2.0', id: x.id, error: { message: 'rate limit' } })) : NOEUDS.publicnode(corps));
appels.length = 0;
const a5 = await lireAvoirs({ compte: QUI, jetons: J.slice(0, 10), noeuds: ['lent'], envoyer, attendre: async (ms) => { pauses += 1; vu(ms >= 1000, 'pause trop courte : ' + ms); } });
vu(a5.etat === 'LU' && a5.avoirs.length === 1 && pauses >= 1, '2e passage absent : etat ' + a5.etat + ', pauses ' + pauses);
essais = 0;
const a6 = await lireAvoirs({ compte: QUI, jetons: J.slice(0, 10), noeuds: ['lent'], envoyer, ...unPassage });
vu(a6.etat === 'NON_LU' && a6.nonLus.length === 10, 'temoin un passage : etat ' + a6.etat);
/* noeud en panne puis noeud qui rend 0x : tout NON lu, jamais zero (deux passages) */
const a3 = await lireAvoirs({ compte: QUI, jetons: J.slice(0, 3), noeuds: ['drpc', 'vide'], envoyer, attendre: async () => {} });
vu(a3.etat === 'NON_LU' && a3.nonLus.length === 3 && a3.zeros === 0 && a3.avoirs.length === 0, 'panne + 0x : pris pour des zeros');
/* compte invalide, doublons et adresses invalides */
vu((await lireAvoirs({ compte: '0x31', jetons: J, noeuds: ['publicnode'], envoyer, ...unPassage })).etat === 'NON_LU', 'compte invalide accepte');
const a4 = await lireAvoirs({ compte: QUI, jetons: [J[3], J[3].toUpperCase().replace('0X', '0x'), 'pas une adresse'], noeuds: ['publicnode'], envoyer, ...unPassage });
vu(a4.avoirs.length === 1 && a4.zeros === 0 && a4.nonLus.length === 0, 'doublon ou adresse invalide lue');
/* classe d un envoi groupe (compteur /sante.envois) */
vu(classeLot(200, [{ id: 1, result: mot(1) }]) === 'ok', 'lot entier -> ok');
vu(classeLot(200, [{ id: 1, result: mot(1) }, { id: 2, error: { message: '25/second request limit reached' } }]) === 'limite', 'lot limite -> limite');
vu(classeLot(500, [{ id: 1, error: { message: 'Batch of more than 3 requests are not allowed on free plan' } }]) === 'erreur', 'refus drpc -> erreur');
/* cablage */
const srv = readFileSync(new URL('./serveur-web.js', import.meta.url), 'utf8');
vu(/chemin === '\/api\/avoirs'/.test(srv) && /lireAvoirs\(/.test(srv), 'la route /api/avoirs n appelle pas lireAvoirs');
vu(/compterEnvoi\(url, classeLot\(/.test(srv), 'les envois groupes ne sont pas comptes dans /sante.envois');
const html = readFileSync(process.env.TB_APP || new URL('./app.html', import.meta.url), 'utf8');
const k = html.indexOf('async function majWallet(');
const corpsW = html.slice(k, html.indexOf('function peindreActifs(', k));
vu(corpsW.includes('/api/avoirs?compte='), 'majWallet ne lit pas les avoirs du registre');
vu(/nonLus/.test(corpsW), 'majWallet tait les actifs non lus');
console.log('ok avoirs-en-lot - ' + n + ' assertions ; NE PROUVE PAS le rendu navigateur');
