// 2026-10-26 : le testeur lit sur /api/marche de GOOGLc « on-chain key 838.8608 % » — le drapeau de frais dynamique v4
// 0x800000 (8 388 608) divise par 10 000 comme un frais statique. Ce banc garde le nom d une cle exacte.
// Borne : il prouve le libelle, pas la lecture du marche sur la chaine.
import assert from 'node:assert/strict';
import { nomCleExacte, cleEstUnMarche } from './marche.js';

let ok = 0, ko = 0;
const cas = (nom, f) => { try { f(); ok++; console.log('ok  ' + nom); } catch (e) { ko++; console.log('KO  ' + nom + ' : ' + e.message); } };

cas('le drapeau dynamique 0x800000 ne devient jamais un pourcentage', () => {
  const n = nomCleExacte({ fee: 0x800000, tickSpacing: 60 });
  assert.equal(n, 'on-chain key · dynamic fee');
  assert.doesNotMatch(n, /\d+(\.\d+)? %/);
});
cas('un frais statique garde son pourcentage (3000 -> 0.3 %, 100 -> 0.01 %)', () => {
  assert.equal(nomCleExacte({ fee: 3000, tickSpacing: 60 }), 'on-chain key 0.3 %');
  assert.equal(nomCleExacte({ fee: 100, tickSpacing: 1 }), 'on-chain key 0.01 %');
});
cas('TEMOIN : la cle dynamique reste un marche (la regle de cleEstUnMarche ne change pas)', () => {
  assert.equal(cleEstUnMarche({ fee: 0x800000, tickSpacing: 60 }), true);
  assert.equal(cleEstUnMarche({ fee: 200000, tickSpacing: 60 }), false);
});
console.log(ok + ' ok, ' + ko + ' KO');
process.exit(ko ? 1 : 0);
