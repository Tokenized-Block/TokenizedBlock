/* test-rolls-jeu-20261017.mjs - LE GUESS DE L APP = LE GUESS DU CONTRAT, ET LES LECTURES VISENT LES BONNES FONCTIONS.
 * AFFIRME : (1) pour 64 hashes echantillonnes par keccak (pas des hashes constants), guessDepuisApparence(faceRevelee(h)) ==
 *   traitsDepuisHash(h) (blockrolls-plan.js, lui-meme epingle au contrat par test-blockrolls-parite) ; (2) les selecteurs de lecture
 *   (pot, ROLL_PRICE, PASS_PRICE, passes, payoutFor) sont ceux de l ABI COMPILEE (contracts/out/BlockRolls.sol/BlockRolls.json) ;
 *   (3) decodage : '0x' (pas de contrat) -> null ; pass (2 mots) ; passActif suit rollWithPass (rollsLeft > 0 ET maintenant < expiresAt) ;
 *   (4) contratServi refuse ce qui n est pas une adresse ; usdc() formate 6 decimales.
 * NE PROUVE PAS : un roll reel (contrat non deploye). */
import { strict as assert } from 'node:assert';
import { readFileSync, existsSync } from 'node:fs';
import { keccak256 } from './keccak.js';
import { faceRevelee } from './face-du-jour.js';
import { traitsDepuisHash } from './blockrolls-plan.js';
import { guessDepuisApparence, appelPot, appelPrixRoll, appelPrixPass, appelPass, appelGain, lireUint, lirePass, passActif, usdc, contratServi } from './rolls-jeu.js';
let n = 0;
const vu = (c, m) => { assert.ok(c, m); n += 1; };
const hex = (u8) => [...u8].map((b) => b.toString(16).padStart(2, '0')).join('');
/* (1) */
let egaux = 0;
for (let i = 0; i < 64; i++) {
  const h = '0x' + hex(keccak256(new TextEncoder().encode('rolls-jeu ' + i)));
  const g = guessDepuisApparence(faceRevelee(h)), t = traitsDepuisHash(h);
  if (g && JSON.stringify(g) === JSON.stringify(t)) egaux++;
}
vu(egaux === 64, 'guess de l app == traits du contrat sur 64 hashes (' + egaux + ')');
vu(guessDepuisApparence(null) === null && guessDepuisApparence({ teinte: 10, orbite: 'nope', facette: '', matiere: '', ornement: '' }) === null, 'trait inconnu -> null');
/* (2) */
const abiF = new URL('./contracts/out/BlockRolls.sol/BlockRolls.json', import.meta.url);
vu(existsSync(abiF), 'ABI compilee presente (forge build)');
const ids = JSON.parse(readFileSync(abiF, 'utf8')).methodIdentifiers;
vu(appelPot() === '0x' + ids['pot()'] && appelPrixRoll() === '0x' + ids['ROLL_PRICE()'] && appelPrixPass() === '0x' + ids['PASS_PRICE()'], 'pot / ROLL_PRICE / PASS_PRICE = ABI');
const W = '0x' + 'ab'.repeat(20);
vu(appelPass(W) === '0x' + ids['passes(address)'] + W.slice(2).padStart(64, '0') && appelPass('nope') === null, 'passes(address) = ABI, adresse invalide refusee');
vu(appelGain(5).slice(0, 10) === '0x' + ids['payoutFor(uint8)'] && appelGain(5).endsWith('5') && appelGain(5).length === 74, 'payoutFor(uint8) = ABI');
/* (3) */
vu(lireUint('0x') === null && lireUint('0x' + '0'.repeat(63) + 'a') === 10n, 'uint : 0x -> null, mot -> valeur');
const p = lirePass('0x' + (3).toString(16).padStart(64, '0') + (2000).toString(16).padStart(64, '0'));
vu(p && p.rollsLeft === 3 && p.expiresAt === 2000 && lirePass('0x') === null, 'pass decode');
vu(passActif(p, 1999) && !passActif(p, 2000) && !passActif({ rollsLeft: 0, expiresAt: 9e9 }, 1) && !passActif(null), 'passActif = regle de rollWithPass');
/* (4) */
vu(contratServi('0x' + 'AB'.repeat(20)) === '0x' + 'ab'.repeat(20) && contratServi('') === null && contratServi('0x12') === null, 'contratServi');
vu(usdc(500000n) === '0.50' && usdc(27625000n) === '27.62' && usdc(null) === '—', 'usdc()');
console.log('ok rolls-jeu - ' + n + ' assertions ; NE PROUVE PAS un roll reel');
