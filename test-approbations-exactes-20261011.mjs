/* test-approbations-exactes-20261011.mjs - LES AUTORISATIONS D UN ECHANGE v4 / v3 SONT AU MONTANT EXACT, AVEC UNE EXPIRATION.
 * Decision de Phil (chat, 2026-10-11) : « montant exact partout ». Test reel de Grok (USDC -> IB022, v4) : USDC -> Permit2 ILLIMITE
 *   (MAX_UINT256) puis Permit2 -> routeur ILLIMITE sans expiration (MAX_UINT160, MAX_UINT48), sans un mot sur la carte.
 * EXECUTE etapesPermit2Exactes (approbations-exactes.js) et DECODE ce que le wallet signerait ; epingle le cablage : plus aucune
 *   autorisation MAX dans echange.js ni echange-v3.js.
 * NE PROUVE PAS : qu un echange passe avec ces montants exacts - ce sont les bancs fork qui le prouvent (rejoues avec ce changement).
 */
import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';
import { etapesPermit2Exactes, DUREE_PERMIT2_S } from './approbations-exactes.js';
import { selecteur } from './pool.js';
let n = 0;
const vu = (c, m) => { assert.ok(c, m); n += 1; };
const USDC = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913', P2 = '0x000000000022d473030f116ddee9f6b43ac78ba3', R = '0x6ff5693b99212da76ad316178a184ab56d299b43';
const m = 23042n, T = 1_791_700_000n;
const r = etapesPermit2Exactes({ jeton: USDC, permit2: P2, routeur: R, montant: m, maintenantSec: T, libelleJeton: 'USDC' });
vu(r.etat === 'OK' && r.etapes.length === 2, 'deux autorisations attendues : ' + JSON.stringify(r));
const mots = (data) => data.slice(10).match(/.{64}/g).map((w) => BigInt('0x' + w));
const [a, b] = r.etapes;
vu(a.to === USDC && a.data.startsWith('0x' + selecteur('approve(address,uint256)')), 'etape 1 : approve du jeton vers Permit2');
const wa = mots(a.data);
vu(wa[0] === BigInt(P2) && wa[1] === m, 'etape 1 : montant ILLIMITE ou faux : ' + wa[1]);
vu(b.to === P2 && b.data.startsWith('0x' + selecteur('approve(address,address,uint160,uint48)')), 'etape 2 : approve Permit2 vers le routeur');
const wb = mots(b.data);
vu(wb[0] === BigInt(USDC) && wb[1] === BigInt(R) && wb[2] === m && wb[3] === T + DUREE_PERMIT2_S && DUREE_PERMIT2_S === 3600n, 'etape 2 : montant / expiration faux : ' + wb.slice(2).join(','));
vu(/exactly/.test(a.nom) && /exactly/.test(b.nom) && /1 hour/.test(b.nom), 'les libelles ne disent pas « exactement » / la duree');
vu(etapesPermit2Exactes({ jeton: USDC, permit2: P2, routeur: R, montant: m, maintenantSec: T, okP2: true, okR: true }).etapes.length === 0, 'autorisations deja suffisantes : une etape demandee quand meme');
vu(etapesPermit2Exactes({ jeton: USDC, permit2: P2, routeur: R, montant: m, maintenantSec: T, okP2: true }).etapes.length === 1, 'seule l autorisation manquante doit etre demandee');
for (const [nom, mt] of [['zero', 0n], ['negatif', -1n], ['illimite', (1n << 256n) - 1n], ['au-dela de uint160', 1n << 160n], ['texte', 'abc']]) {
  vu(etapesPermit2Exactes({ jeton: USDC, permit2: P2, routeur: R, montant: mt, maintenantSec: T }).etat === 'REFUSE', 'montant ' + nom + ' accepte');
}
vu(etapesPermit2Exactes({ jeton: USDC, permit2: P2, routeur: R, montant: m, maintenantSec: 0 }).etat === 'REFUSE', 'sans instant, une expiration est inventee');
vu(etapesPermit2Exactes({ jeton: '0x8335', permit2: P2, routeur: R, montant: m, maintenantSec: T }).etat === 'REFUSE', 'adresse tronquee acceptee');
/* cablage */
for (const f of ['echange.js', 'echange-v3.js']) {
  const src = readFileSync(new URL('./' + f, import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  vu(!/encodeApprove\(PERMIT2, MAX_UINT256\)/.test(src) && !/MAX_UINT160, MAX_UINT48/.test(src), f + ' : une autorisation ILLIMITEE est encore construite');
  vu(/etapesPermit2Exactes\(/.test(src), f + ' : les autorisations ne passent pas par etapesPermit2Exactes');
}
console.log('ok approbations-exactes - ' + n + ' assertions ; NE PROUVE PAS l echange avec ces montants (bancs fork)');
