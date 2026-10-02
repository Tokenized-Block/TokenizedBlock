// test-garde-marche-ouvert-vide-20261002 — la regle « drapeau marche ouvert ON refuse si la liste V8-open est vide »
// est maintenant appliquee A L EXECUTION (planEchange + planEchangeMultiSauts), plus seulement par un test.
// Crosscheck Zero 1 sur ee8de19 (2026-10-02). Chaque assertion a son temoin negatif. Drapeaux livres OFF.
import assert from 'node:assert/strict';
import { refusMarcheOuvertIncoherent, HOOK_V8, HOOK_PREVU, HOOK_V5, HOOKS_PAIENT_DEJA_A6CF } from './tokenomics.js';
import { MARCHE_OUVERT_ACTIF, HOOKS_MARCHE_OUVERT } from './marche-ouvert.js';
import { O1_LAUNCH_HOOK_STANDARD } from './referent-o1.js';
import { planEchange, planEchangeMultiSauts } from './echange.js';

let n = 0;
const eq = (a, b, m) => { assert.deepEqual(a, b, m); n++; };
const ok = (c, m) => { assert.ok(c, m); n++; };
const ETH = '0x0000000000000000000000000000000000000000';
const JETON = '0xb2000000000000000000002eefebd3dd6ef2d601';
const COMPTE = '0x1111111111111111111111111111111111111111';
const AUTRE = '0x' + '0c'.repeat(19) + 'c4'; // un hook etranger quelconque (pourrait etre un V8-open non liste)
const V8OPEN = '0x' + '0b'.repeat(19) + 'c4';
const cle = (hooks) => ({ currency0: ETH, currency1: JETON, fee: 0, tickSpacing: 200, hooks });
const ON_VIDE = { actif: true, hooks: [] };
const ON_LISTE = { actif: true, hooks: [V8OPEN] };
const OFF_VIDE = { actif: false, hooks: [] };

// 0. ce qui est livre : OFF + liste vide -> la garde ne refuse rien (aucun octet ne change)
eq(MARCHE_OUVERT_ACTIF, false, 'livre OFF');
eq(HOOKS_MARCHE_OUVERT.length, 0, 'liste livree vide');
eq(refusMarcheOuvertIncoherent([{ cle: cle(O1_LAUNCH_HOOK_STANDARD) }]), null, 'constantes livrees : o1 admis');

// 1. la fonction : ON + vide refuse les hooks inclassables (o1 compris), jamais les notres ni les pools sans hook
ok(refusMarcheOuvertIncoherent([{ cle: cle(O1_LAUNCH_HOOK_STANDARD) }], ON_VIDE), 'ON + vide : chemin referent o1 refuse');
ok(refusMarcheOuvertIncoherent([{ cle: cle(AUTRE) }], ON_VIDE), 'ON + vide : hook etranger refuse');
ok(refusMarcheOuvertIncoherent([{ cle: cle(ETH) }, { cle: cle(AUTRE) }], ON_VIDE), 'ON + vide : jambe 2 inclassable refusee');
eq(refusMarcheOuvertIncoherent([{ cle: cle(ETH) }], ON_VIDE), null, 'ON + vide : pool sans hook admise');
eq(refusMarcheOuvertIncoherent([{ cle: cle(HOOK_V8) }], ON_VIDE), null, 'ON + vide : V8 (le notre) admis');
eq(refusMarcheOuvertIncoherent([{ cle: cle(HOOK_PREVU) }], ON_VIDE), null, 'ON + vide : V1 (le notre) admis');
eq(HOOKS_PAIENT_DEJA_A6CF.some((e) => String(e.hook).toLowerCase() === HOOK_V5.toLowerCase()), false, 'V5 hors liste');
eq(refusMarcheOuvertIncoherent([{ cle: cle(HOOK_V5) }], ON_VIDE), null, 'ON + vide : V5 (le notre, hors liste) admis — comportement inchange');
// temoins negatifs : configuration coherente -> rien n est refuse
eq(refusMarcheOuvertIncoherent([{ cle: cle(O1_LAUNCH_HOOK_STANDARD) }], ON_LISTE), null, 'ON + liste : o1 admis');
eq(refusMarcheOuvertIncoherent([{ cle: cle(AUTRE) }], OFF_VIDE), null, 'OFF + vide : rien ne change');
// le referent o1 seul (REFERENT_O1_ACTIF ON, marche ouvert OFF) n est PAS touche par cette garde
eq(refusMarcheOuvertIncoherent([{ cle: cle(O1_LAUNCH_HOOK_STANDARD) }], { actif: false, hooks: [] }), null, 'referent o1 seul : admis');
ok(refusMarcheOuvertIncoherent([{ cle: cle(AUTRE) }], { actif: true, hooks: ['0x123'] }), 'adresse V8-open malformee : refus');

// 2. A L EXECUTION : planEchange refuse AVANT toute lecture reseau (le rpc n est jamais appele)
let appels = 0;
const rpcInterdit = async () => { appels++; throw new Error('the network must not be read'); };
const base = { rpc: rpcInterdit, chaine: 8453, jeton: JETON, compte: COMPTE, sens: 'ACHAT', montant: 100000000000000n, maintenant: 1790944401000 };
let p = await planEchange({ ...base, cleImposee: cle(O1_LAUNCH_HOOK_STANDARD), marcheOuvert: ON_VIDE });
eq(p.etat, 'REFUSE', 'planEchange ON + vide : o1 refuse');
ok(/V8-open hook listed/.test(p.pourquoi), 'la raison est dite : ' + p.pourquoi);
eq(appels, 0, 'refuse avant toute lecture : aucun tx construit');
p = await planEchange({ ...base, sens: 'VENTE', cleImposee: cle(AUTRE), marcheOuvert: ON_VIDE });
eq(p.etat, 'REFUSE', 'planEchange ON + vide : vente sur hook etranger refusee');
eq(appels, 0);
// temoins : coherent / OFF -> la garde laisse passer, le plan va lire le reseau (et echoue ici sur le rpc factice)
for (const mo of [ON_LISTE, OFF_VIDE, undefined]) {
  const a0 = appels;
  p = await planEchange({ ...base, cleImposee: cle(O1_LAUNCH_HOOK_STANDARD), marcheOuvert: mo });
  ok(!(p.pourquoi || '').includes('V8-open hook listed'), 'garde muette : ' + JSON.stringify(mo));
  ok(appels > a0, 'le plan a continue jusqu au reseau : ' + JSON.stringify(mo));
}

// 3. A L EXECUTION : planEchangeMultiSauts, hook inclassable en jambe 2
const sauts = [{ cle: { currency0: ETH, currency1: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913', fee: 500, tickSpacing: 10, hooks: ETH }, zeroForOne: false },
  { cle: cle(AUTRE), zeroForOne: true }];
const mb = { rpc: rpcInterdit, chaine: 8453, compte: COMPTE, sauts, entree: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913', sortie: JETON,
  montant: 1000000n, maintenant: 1790944401000 };
const a1 = appels;
p = await planEchangeMultiSauts({ ...mb, marcheOuvert: ON_VIDE });
eq(p.etat, 'REFUSE', 'multi-sauts ON + vide : refuse');
ok(/V8-open hook listed/.test(p.pourquoi), p.pourquoi);
eq(appels, a1, 'multi-sauts : refuse avant toute lecture');
p = await planEchangeMultiSauts({ ...mb, marcheOuvert: ON_LISTE });
ok(!(p.pourquoi || '').includes('V8-open hook listed'), 'multi-sauts coherent : garde muette');
p = await planEchangeMultiSauts({ ...mb });
ok(!(p.pourquoi || '').includes('V8-open hook listed'), 'multi-sauts livre (OFF) : garde muette');
eq(HOOKS_PAIENT_DEJA_A6CF.some((e) => String(e.hook).toLowerCase() === AUTRE), false, 'AUTRE n est pas liste');
console.log('test-garde-marche-ouvert-vide-20261002: ' + n + ' assertions OK');
