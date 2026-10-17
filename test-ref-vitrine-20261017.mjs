/* test-ref-vitrine-20261017.mjs - LA VITRINE D UN BLOCK : la ref ne vaut que pour SON block, la part n existe que sur un frais verifie.
 * AFFIRME (EXECUTE, pur) : (1) ?block=B&ref=B -> B ; ref != block, deux refs, adresse nulle, autre chaine -> null ; (2) premier contact
 *   30 jours, un second lien n ecrase pas, un stockage corrompu ne vaut rien ; (3) part createur = montant - floor(70 %), la somme
 *   TB + createur = le montant au wei pres, 0 -> 0 ; (4) ligne du registre : createur non lu -> CREATEUR_NON_LU sans du ; createur ==
 *   payeur -> AUTO_PARRAINAGE sans du ; sinon DU par devise ; (5) totaux ne comptent que les DU.
 * NE PROUVE PAS : la lecture du createur sur la chaine (serveur) ni le cablage app. */
import { strict as assert } from 'node:assert';
import { lireRefVitrine, lienVitrine, attribuer, refActive, partCreateur, ligneRegistre, totauxParCreateur, DUREE_MS } from './ref-vitrine.js';
let n = 0;
const vu = (c, m) => { assert.ok(c, m); n += 1; };
const B = '0xb2000000000000000000007afa7ed748b0874f27', A = '0xb200000000000000000000c2e324d24d7eecd1fb';
vu(lireRefVitrine(`?block=${B}&chain=8453&ref=${B}`, { chain: 8453 }) === B, 'ref == block de la page -> attribuee');
vu(lireRefVitrine(`?block=${B.toUpperCase().replace('0X', '0x')}&ref=${B}`) === B, 'casse ignoree');
vu(lireRefVitrine(`?block=${A}&ref=${B}`) === null, 'ref collee sur la vitrine d un AUTRE block -> refusee');
vu(lireRefVitrine(`?ref=${B}`) === null, 'ref sans block de page -> refusee');
vu(lireRefVitrine(`?block=${B}&ref=${B}&ref=${A}`) === null, 'deux refs -> ambigu, refuse');
vu(lireRefVitrine(`?block=0x${'0'.repeat(40)}&ref=0x${'0'.repeat(40)}`) === null, 'adresse nulle refusee');
vu(lireRefVitrine(`?block=${B}&chain=1&ref=${B}`, { chain: 8453 }) === null, 'autre chaine refusee');
vu(lienVitrine('https://tokenizedblock.space/', B, 8453) === `https://tokenizedblock.space/?block=${B}&chain=8453&ref=${B}`, 'lien de partage');
vu(lireRefVitrine(new URL(lienVitrine('https://x.y', B, 8453)).search, { chain: 8453 }) === B, 'le lien de partage se relit');
const t0 = 1_000_000;
const a1 = attribuer(null, B, t0);
vu(a1.ref === B && attribuer(a1, A, t0 + 1000).ref === B, 'premier contact garde, un second lien n ecrase pas');
vu(attribuer(a1, A, t0 + DUREE_MS).ref === A, 'apres 30 jours, le nouveau lien prend');
vu(refActive(a1, t0 + DUREE_MS - 1) === B && refActive(a1, t0 + DUREE_MS) === null, 'ref active 30 jours exactement');
vu(refActive({ ref: 'pas-une-adresse', depuis: t0 }, t0) === null && refActive({ ref: B, depuis: 'x' }, t0) === null && refActive(null, t0) === null, 'stockage corrompu -> rien');
vu(partCreateur('40000') === '12000' && partCreateur('9900') === '2970', 'part createur 30 % (40000 -> 12000, 9900 -> 2970)');
for (const m of ['1', '7', '13', '999', '123456789012345678901']) vu(BigInt(partCreateur(m)) + (BigInt(m) * 7000n) / 10000n === BigInt(m), 'TB floor + createur = montant au wei pres (' + m + ')');
vu(partCreateur('0') === '0', '0 -> 0');
const USDC = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913', PAYEUR = '0x' + '11'.repeat(20), CREA = '0x' + '22'.repeat(20);
const verif = { payeur: PAYEUR, recus: [{ devise: USDC, montant: '40000' }, { devise: A, montant: '9900' }] };
const du = ligneRegistre({ hash: '0xh', jour: '2026-10-17', ligne: 'swap_action', bloc: B, verif, createur: CREA });
vu(du.etat === 'DU' && du.du[USDC] === '12000' && du.du[A] === '2970' && du.frais[USDC] === '40000' && du.payeur === PAYEUR && du.createur === CREA, 'ligne DU par devise');
const auto = ligneRegistre({ hash: '0xh', jour: 'j', ligne: 'swap_action', bloc: B, verif, createur: PAYEUR.toUpperCase().replace('0X', '0x') });
vu(auto.etat === 'AUTO_PARRAINAGE' && Object.keys(auto.du).length === 0, 'createur == payeur -> AUTO_PARRAINAGE, rien du');
const nl = ligneRegistre({ hash: '0xh', jour: 'j', ligne: 'swap_action', bloc: B, verif, createur: null });
vu(nl.etat === 'CREATEUR_NON_LU' && Object.keys(nl.du).length === 0 && nl.createur === null, 'createur non lu -> rien du, dit');
const tot = totauxParCreateur([du, du, auto, nl]);
vu(Object.keys(tot).length === 1 && tot[CREA][USDC] === '24000' && tot[CREA][A] === '5940', 'totaux : DU seulement, sommes BigInt');
console.log('ok ref-vitrine - ' + n + ' assertions ; NE PROUVE PAS la lecture du createur on chain');
