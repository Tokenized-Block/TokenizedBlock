/* test-pass-skin-20261017.mjs - UN SKIN ACHETE = 7 JOURS DE TICKETS, PROUVE DANS LE RECU, ET RIEN D AUTRE.
 * AFFIRME : (1) passSkinVerifie exige les DEUX : un mint ERC-721 du contrat de skins vers le payeur ET >= le prix en USDC du payeur vers le
 *   wallet de frais ; un mint vers un autre, un mint d un autre contrat, un paiement trop court, un Transfer ERC-20 (3 topics) du contrat de
 *   skins : refuses ; payeur = sender d EntryPoint v0.8 ; (2) joursPass : 7 jours UTC consecutifs depuis le jour d achat ;
 *   (3) ticketsJour = volume >= 10 $ UNION pass couvrant le jour, sans doublon ; entreesPeriode compte les pass ;
 *   (4) cablage : /api/paye credite le pass AVANT la sortie sur frais (verifierFrais exige un swap), externes seulement, un hash une fois.
 * NE PROUVE PAS : un achat reel (aucun a ce jour) ni le rendu. */
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { passSkinVerifie, TOPIC_TRANSFER } from './volume-tirage.js';
import { joursPass, ticketsJour, entreesPeriode, crediter, JOURS_PASS_SKIN } from './tirage-saison.js';
let n = 0;
const vu = (c, m) => { assert.ok(c, m); n += 1; };
const A = (h) => '0x' + h.repeat(20), P = (a) => '0x' + a.slice(2).padStart(64, '0'), W = (v) => '0x' + BigInt(v).toString(16).padStart(64, '0');
const SK = A('5c'), USDC = A('5d'), FEE = A('fe'), J = A('b0'), H = '0x' + '77'.repeat(32);
const mint = (de, vers, contrat = SK) => ({ address: contrat, topics: [TOPIC_TRANSFER, P(de), P(vers), W(7)], data: '0x' });
const paie = (de, vers, m) => ({ address: USDC, topics: [TOPIC_TRANSFER, P(de), P(vers)], data: W(m) });
const v = (logs, from = J) => passSkinVerifie({ tx: { hash: H, from }, recu: { status: '0x1', transactionHash: H, logs }, skins: SK, usdc: USDC, wallet: FEE, prix: 1_000_000n });
vu(v([mint(A('00'), J), paie(J, FEE, 1_000_000n)]).ok, 'mint au payeur + 1 USDC au wallet de frais : pass');
vu(!v([mint(A('00'), A('99')), paie(J, FEE, 1_000_000n)]).ok, 'mint a un AUTRE : refuse');
vu(!v([mint(A('00'), J, A('66')), paie(J, FEE, 1_000_000n)]).ok, 'mint d un autre contrat : refuse');
vu(!v([mint(A('00'), J), paie(J, FEE, 999_999n)]).ok, 'paiement trop court : refuse');
vu(!v([{ address: SK, topics: [TOPIC_TRANSFER, P(A('00')), P(J)], data: W(1) }, paie(J, FEE, 1_000_000n)]).ok, 'Transfer ERC-20 (3 topics) du contrat de skins : pas un mint, refuse');
vu(!v([paie(J, FEE, 1_000_000n)]).ok && !v([mint(A('00'), J)]).ok, 'mint seul ou paiement seul : refuse');
const EP8 = '0x4337084d9e255ff0702461cf8895ce9e3b5ff108', UO = '0x49628fd1471006c1482da88028e9ce4dbb080b815c9b0344d39e5a8e6ec1419f', S = A('5e');
const v8 = v([{ address: EP8, topics: [UO, '0x' + '0'.repeat(64), P(S), '0x' + '0'.repeat(64)], data: '0x' }, mint(A('00'), S), paie(S, FEE, 1_000_000n)], A('43'));
vu(v8.ok && v8.payeur === S, 'smart wallet v0.8 : le pass va au sender, pas au bundler');
/* (2) */
const jp = joursPass(Date.UTC(2026, 9, 17, 23, 0));
vu(JOURS_PASS_SKIN === 1 && jp.length === 1 && jp[0] === 'J2026-10-17', 'pass : le jour d achat seulement (Phil 19:40 : « skin 1 day »)');
vu(joursPass(Date.UTC(2026, 9, 17, 23, 0), 7).length === 7 && joursPass(Date.UTC(2026, 9, 17, 23, 0), 7)[6] === 'J2026-10-23', 'joursPass(n) reste exact pour n jours');
/* (3) : un pass de 2 jours (17 et 18) pour exercer l union et la fin de pass */
let e = crediter({}, { saison: 'J2026-10-18', payeur: A('a1'), hash: '0x' + '01'.repeat(32), usd: 12 });
const passes = { [J]: ['J2026-10-17', 'J2026-10-18'] };
const t18 = ticketsJour(e, 'J2026-10-18', passes);
vu(t18.length === 2 && t18.includes(J) && t18.includes(A('a1')), 'jour 18 : volume (a1) + pass (J)');
vu(ticketsJour(e, 'J2026-10-19', passes).length === 0, 'jour 19 : le pass est fini');
vu(ticketsJour(crediter(e, { saison: 'J2026-10-18', payeur: J, hash: '0x' + '02'.repeat(32), usd: 50 }), 'J2026-10-18', passes).filter((x) => x === J).length === 1, 'volume ET pass le meme jour : UN ticket');
vu(entreesPeriode(e, ['J2026-10-17', 'J2026-10-18'], 10, passes).length === 3, 'entrees : pass 17 + pass 18 + volume 18');
/* (4) */
const srv = readFileSync(new URL('./serveur-web.js', import.meta.url), 'utf8');
const paye = srv.slice(srv.indexOf("if (chemin === '/api/paye'"), srv.indexOf("if (chemin === '/api/registre-createurs')"));
vu(paye.indexOf("ligne === 'skin_mint'") > 0 && paye.indexOf("ligne === 'skin_mint'") < paye.indexOf('if (!v.ok) {') && /!internes\.has\(ps\.payeur\)/.test(paye) && /revenu\.passVus/.test(paye),
  'cablage : avant la sortie sur frais, externes seulement, un hash une fois');
console.log('ok pass-skin - ' + n + ' assertions');
