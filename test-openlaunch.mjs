// test-openlaunch.mjs — le resume du pont OpenLaunch, sur une VRAIE reponse de l API (2026-09-16, 12 premieres lignes).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resumerLancementsOL, destinationFrais, lienOL, dollarsCourts, OL_MAX } from './openlaunch.js';

const vrai = JSON.parse(readFileSync(new URL('./fixture-openlaunch-2026-09-16.json', import.meta.url), 'utf8'));
let n = 0;
const ok = (f) => { f(); n++; };

ok(() => {
  const r = resumerLancementsOL(vrai);
  /* ⛔ LA FIXTURE PORTE 12 LIGNES ET LE PLAFOND EST PASSE A 24 (Phil, 2026-09-17 : « ajoute en plus ») :
   * comparer la longueur au plafond ne prouvait plus rien. On attend le minimum des deux, et on verifie
   * A PART que le plafond coupe vraiment, avec une entree plus longue que lui. */
  assert.equal(r.lignes.length, Math.min(OL_MAX, vrai.launches.length));
  assert.equal(r.lignes.length, 12);
  const trop = { launches: Array.from({ length: OL_MAX + 7 }, (_, i) => ({ ...vrai.launches[i % vrai.launches.length] })) };
  assert.equal(resumerLancementsOL(trop).lignes.length, OL_MAX);
  assert.equal(r.ecartees, 0);
  assert.equal(r.lignes[0].symbole, 'BASEFLY');
  /* BASEFLY : un seul destinataire, dEaD -> frais brules */
  assert.deepEqual(r.lignes[0].frais, { genre: 'BRULES', n: 0 });
  /* SOLV : trois destinataires vivants */
  assert.deepEqual(r.lignes[1].frais, { genre: 'DESTINATAIRES', n: 3 });
  assert.equal(r.lignes[0].lpFeePct, 3);
  assert.equal(r.lignes[2].lpFeePct, 1);
  assert.equal(r.lignes[0].lien, 'https://openlaunch.lol/t/base/' + r.lignes[0].token);
});

ok(() => {
  /* ZERO : moitie dEaD, moitie un wallet -> 1 destinataire (le dEaD ne compte pas) */
  const zero = vrai.launches.find((x) => x.symbol === 'ZERO');
  assert.deepEqual(destinationFrais(zero.recipients), { genre: 'DESTINATAIRES', n: 1 });
  assert.deepEqual(destinationFrais([]), { genre: 'BRULES', n: 0 });
  assert.deepEqual(destinationFrais(null), { genre: 'BRULES', n: 0 });
});

ok(() => {
  /* temoin negatif : donnees hostiles ecartees ou neutralisees */
  const base = vrai.launches[0];
  const r = resumerLancementsOL({ launches: [
    { ...base, token: 'javascript:alert(1)' },
    { ...base, chain_id: 1 },
    { ...base, lp_fee: 99999 },
    { ...base, symbol: '<img src=x onerror=1>', volume_usd: 'NaN', holders: -3 },
  ] });
  assert.equal(r.ecartees, 3);
  assert.equal(r.lignes.length, 1);
  assert.ok(!/[<>]/.test(r.lignes[0].symbole));
  assert.equal(r.lignes[0].volumeUsd, null);
  assert.equal(r.lignes[0].detenteurs, null);
  assert.equal(lienOL('0x12'), null);
  assert.deepEqual(resumerLancementsOL(null), { lignes: [], ecartees: 0, ethUsd: null });
});

ok(() => {
  assert.equal(dollarsCourts(149867.47), '$149.9k');
  assert.equal(dollarsCourts(6200954687), '$6.2B');
  assert.equal(dollarsCourts(9.93), '$10');
  assert.equal(dollarsCourts(null), '—');
});

console.log('test-openlaunch : ' + n + ' blocs verts');
