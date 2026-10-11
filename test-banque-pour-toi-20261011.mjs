/* test-banque-pour-toi-20261011.mjs - LA BANK DIT CE QUE *TOI* TU PEUX EMPRUNTER ET PRETER, PAS CE QUE LE MARCHE A.
 * Phil (2026-10-11) : « les $ available c est pas bon, car peur de liquidite » puis « le montant doit s adapter au user et montrer deja
 *   combien il peut borrow et lend en fonction du wallet connecte ».
 * EXECUTE bcPourToi, bcBas2 et bcBanqueLireAvoirs (app.html, TB_APP = ancienne) ; capacite() et entierApi() de banque-morpho.js.
 * AFFIRME : (1) PARITE avec capacite() du serveur (la formule que le plan applique) sur la garantie du wallet ; (2) garantie deja posee
 *   comptee, dette retiree, jamais negatif ; (3) borne par la liquidite BRUTE du marche, et c est signale ; (4) une entree NON LUE rend
 *   null, jamais un zero ; (5) « jusqu a » arrondi BAS ; (6) un solde absent n est un zero que si le serveur dit l avoir lu ; (7) l API
 *   Morpho rend la liquidite en nombre OU en texte (sonde du 2026-10-11) : un nombre non sur est refuse ; (8) le cablage.
 * NE PROUVE PAS : le rendu navigateur (verifie a part), ni que l API Morpho et le noeud disent la meme chose (le plan relit la chaine).
 */
import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';
import { capacite, entierApi, MARGE_EMPRUNT_BPS } from './banque-morpho.js';
import { DEVISES_BASE } from './paires.js';
import { USDC_BASE } from './frais-creation.js';
const html = readFileSync(process.env.TB_APP || new URL('./app.html', import.meta.url), 'utf8');
const srv = readFileSync(new URL('./serveur-web.js', import.meta.url), 'utf8');
let n = 0;
const vu = (c, m) => { assert.ok(c, m); n += 1; };
const fonction = (entete) => { const i = html.indexOf(entete); assert.ok(i > 0, 'introuvable : ' + entete); const f = /\r?\n\}/.exec(html.slice(i)); return html.slice(i, i + f.index + f[0].length); };
const ligne = (debut) => { const l = html.split(/\r?\n/).find((x) => x.startsWith(debut)); assert.ok(l, 'introuvable : ' + debut); return l; };
const bcPourToi = new Function(fonction('function bcPourToi(mk, soldeGarantie, position, soldePret) {') + '\nreturn bcPourToi;')();
const bcBas2 = new Function(ligne('const bcBas2 = ') + '\nreturn bcBas2;')();
/* GOOGLc -> USDC (prod 2026-10-11) : oracle 352,63 USDC, LLTV 77 %, liquidite 566,2 USDC */
const mk = { id: '0xa3', garantie: { adr: '0xg', symbole: 'GOOGLc', decimales: 8 }, pret: { adr: '0xu', symbole: 'USDC', decimales: 6 },
  prixOracle: '3526329343300000000000000000000000000', lltv: '770000000000000000', margeBps: Number(MARGE_EMPRUNT_BPS), disponibleBrut: '566200000' };
const zero = { garantieBrute: '0', detteBrute: '0' };
/* (1) parite avec capacite() du serveur */
for (const g of [1n, 10n ** 6n, 10n ** 7n, 10n ** 8n, 3n * 10n ** 8n + 12345n]) {
  const r = bcPourToi({ ...mk, disponibleBrut: null }, g, zero, null);
  const s = capacite({ garantie: g, prix: BigInt(mk.prixOracle), lltv: BigInt(mk.lltv) }).plafond;
  vu(r.emprunt === s && r.borneParMarche === false, 'PARITE rompue pour ' + g + ' unites : client ' + r.emprunt + ' / serveur ' + s);
}
/* 1 GOOGLc : 352,63 x 77 % x 70 % = 190,07 USDC - les « ~190 USDC » mesures par Grok en prod */
const un = bcPourToi(mk, 10n ** 8n, zero, 12_400_000n);
vu(un.emprunt === 190_069_151n && bcBas2(un.emprunt, 6) === '190.06', '1 GOOGLc : ' + un.emprunt + ' / ' + (un.emprunt === null ? '' : bcBas2(un.emprunt, 6)));
vu(un.pret === 12_400_000n && un.garantie === 10n ** 8n && un.liquiditeLue === true, 'preter = l USDC du wallet ; garantie comptee');
/* (2) garantie deja posee + dette */
const pose = bcPourToi(mk, 10n ** 8n, { garantieBrute: String(10n ** 8n), detteBrute: '100000000' }, null);
vu(pose.emprunt === capacite({ garantie: 2n * 10n ** 8n, prix: BigInt(mk.prixOracle), lltv: BigInt(mk.lltv) }).plafond - 100_000_000n, 'garantie posee / dette mal comptees : ' + pose.emprunt);
vu(bcPourToi(mk, 0n, { garantieBrute: String(10n ** 8n), detteBrute: '999000000' }, null).emprunt === 0n, 'dette au-dela du plafond : negatif ou invente');
/* (3) borne par le marche */
const gros = bcPourToi(mk, 10n ** 9n, zero, null);
vu(gros.emprunt === 566_200_000n && gros.borneParMarche === true, '10 GOOGLc : la liquidite du marche ne borne pas (' + gros.emprunt + ')');
vu(bcPourToi({ ...mk, disponibleBrut: '0' }, 10n ** 8n, zero, null).emprunt === 0n, 'marche vide : on promet quand meme');
const sansLiq = bcPourToi({ ...mk, disponibleBrut: null }, 10n ** 9n, zero, null);
vu(sansLiq.liquiditeLue === false && sansLiq.borneParMarche === false, 'liquidite non lue : signalee comme lue');
/* (4) non lu = null */
vu(bcPourToi(mk, null, zero, null).emprunt === null, 'solde non lu -> un montant invente');
vu(bcPourToi(mk, 10n ** 8n, null, null).emprunt === null, 'positions non lues (dette inconnue) -> un montant invente');
vu(bcPourToi({ ...mk, prixOracle: null }, 10n ** 8n, zero, null).emprunt === null && bcPourToi({ ...mk, prixOracle: '3.5e+36' }, 10n ** 8n, zero, null).emprunt === null, 'prix non lu (ou flottant) -> un montant invente');
vu(bcPourToi(mk, 10n ** 8n, zero, null).pret === null && bcPourToi(mk, 10n ** 8n, zero, 0n).pret === 0n, 'USDC non lu pris pour zero (ou l inverse)');
/* (5) arrondi bas */
vu(bcBas2(152_301_234n, 6) === '152.30' && bcBas2(1_999n, 6) === '0.00' && bcBas2(1_234_567_890n, 6) === '1,234.56' && bcBas2(10n ** 18n, 18) === '1.00' && bcBas2(7n, 0) === '7.00',
  'bcBas2 : ' + [bcBas2(152_301_234n, 6), bcBas2(1_999n, 6), bcBas2(1_234_567_890n, 6)].join(' | '));
/* (6) un solde absent n est un zero que si le serveur dit l avoir lu */
const lireAvoirs = (rep) => new Function('fetch', 'AbortSignal', fonction('async function bcBanqueLireAvoirs(c) {') + '\nreturn bcBanqueLireAvoirs;')(
  async () => ({ json: async () => rep }), { timeout: () => undefined });
const A = '0x' + 'a'.repeat(40), B = '0x' + 'b'.repeat(40), C = '0x' + 'c'.repeat(40);
const lu = await lireAvoirs({ ok: true, etat: 'LU', avoirs: [{ adr: A, solde: '5' }] })('0x1');
vu(lu.solde(A) === 5n && lu.solde(B) === 0n, 'etat LU : absent doit valoir 0');
const partiel = await lireAvoirs({ ok: true, etat: 'PARTIEL', avoirs: [{ adr: A, solde: '5' }], nonLusAdr: [C] })('0x1');
vu(partiel.solde(B) === 0n && partiel.solde(C) === null, 'etat PARTIEL : un jeton NON LU pris pour zero (ou un lu pour inconnu)');
const ancien = await lireAvoirs({ ok: true, etat: 'PARTIEL', avoirs: [], nonLus: 3 })('0x1');
vu(ancien.solde(B) === null, 'PARTIEL sans la liste des non lus : un zero invente');
vu(await lireAvoirs({ ok: false, etat: 'NON_LU', avoirs: [] })('0x1') === null, 'echec de lecture : des soldes inventes');
vu(/nonLusAdr: r\.nonLus\.map\(/.test(srv), 'le serveur ne dit plus QUELS jetons il n a pas lus');
vu(DEVISES_BASE.some((d) => String(d.adr).toLowerCase() === USDC_BASE.toLowerCase() && d.type !== 'NATIF' && d.chaines.includes(8453)), 'USDC n est plus lu par /api/avoirs : « You can lend » serait toujours non lu');
/* (7) l API Morpho : nombre OU texte */
vu(entierApi(472733430570) === '472733430570' && entierApi('95013234040111628265') === '95013234040111628265', 'entierApi rejette une forme que l API rend (sonde 2026-10-11)');
vu(entierApi(2 ** 60) === null && entierApi(1.5) === null && entierApi(-1) === null && entierApi('1e3') === null && entierApi(null) === null, 'entierApi accepte un nombre dont la precision est perdue');
/* (8) le cablage */
const charger = fonction('async function bcBanqueCharger(force = false) {');
vu(/'data-pourtoi': mk\.id/.test(charger) && /void bcBanquePourToi\(\);/.test(charger), 'les cartes de marche ne portent pas la ligne « pour toi »');
vu(/bcBanqueIndices\(\);\s*bcBanqueEstimer\(\);/.test(fonction('function bcBanqueChoisir(mk, sens) {')), 'les champs ne disent pas ce que ce wallet peut mettre');
/* 2026-10-11 (contre-test de Grok) : la relecture apres operation passe par bcApresOperation, qui relit AUSSI la carte du Wallet */
vu((html.match(/bcApresOperation\(\); \/\* la Bank, ses positions ET la carte du Wallet se relisent/g) || []).length === 2, 'apres une operation, « ce que tu peux » ne se relit pas (simple ET panier)');
vu(/This market cannot lend that much right now/.test(fonction('function bcBanqueEstimer() {')), 'la limite du marche n est plus dite au moment ou elle compte');
/* mesure navigateur du 2026-10-11 : 110 unites brutes (second marche GOOGLc) s affichaient « ≈ 0.00 USDC » + « Limited by… » */
const peindre = fonction('function bcPeindrePourToi(el, mk, r) {');
vu(/rien \? 'Nothing now'/.test(peindre) && /r\.emprunt < 10n \*\* BigInt\(Math\.max\(0, Number\(pr\.decimales\) - 2\)\)/.test(peindre), 'sous un cent, « ≈ 0.00 » revient comme un montant');
/* 2026-10-11 (« je comprends pas » -> deux choix) : le montant de CE wallet vit DANS chaque choix de la carte du Wallet */
vu(/toiE\.textContent = parAction\.size \? 'You: up to ≈ '/.test(fonction('async function tbBanquePeindre() {')) && /toiP\.textContent = soldeU === null/.test(fonction('async function tbBanquePeindre() {')),
  'la carte du Wallet ne dit pas ce que ce wallet peut emprunter / preter');
console.log('ok banque-pour-toi - ' + n + ' assertions ; NE PROUVE PAS le rendu ni l accord API Morpho / noeud (le plan relit la chaine)');
