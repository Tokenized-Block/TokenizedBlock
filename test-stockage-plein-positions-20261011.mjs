/* test-stockage-plein-positions-20261011.mjs - UN localStorage PLEIN NE FAIT NI DIRE « listed below » NI PERDRE LA POSITION.
 * Prod (2026-10-11, 20261011-liquidity-position-receipt, navigateur du wallet 0x31e0) : setItem -> QuotaExceededError ;
 *   tb-rpc-immuable-v1 = 1 401 959 caracteres (plafond 1,5 M dans app.html) ; tblock.positions.8453.0x31e0... = null, et la carte
 *   disait « Liquidity added - your position is listed below. » avec une liste vide.
 * EXECUTE les fonctions extraites d app.html sur un faux stockage a quota :
 *   ecrireCacheRpc (budget ~300 k, plus vieux evinces, reessai une fois plus petit sur quota), garderPosition (libere le cache rpc et
 *   reessaie ; sinon garde l id EN MEMOIRE pour la visite et le DIT), texteAjoutPosition (jamais « listed below » sans id gardé).
 * NE PROUVE PAS : le rendu navigateur reel. */
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
let n = 0;
const vu = (c, m) => { assert.ok(c, m); n += 1; };
const src = readFileSync(new URL('./app.html', import.meta.url), 'utf8');
const extraire = (nom) => {
  const d = src.indexOf('function ' + nom + '(');
  vu(d > 0, 'ROUGE->VERT : app.html n a pas ' + nom);
  const m = /\r?\n\}/.exec(src.slice(d));
  return src.slice(d, d + m.index + m[0].length);
};
class Stockage {
  constructor(quota) { this.q = quota; this.m = new Map(); }
  taille() { let t = 0; for (const [k, v] of this.m) t += k.length + v.length; return t; }
  getItem(k) { return this.m.has(k) ? this.m.get(k) : null; }
  setItem(k, v) { const av = this.m.get(k); const t = this.taille() - (av ? k.length + av.length : 0) + k.length + String(v).length;
    if (t > this.q) { const e = new Error('QuotaExceededError'); e.name = 'QuotaExceededError'; throw e; } this.m.set(k, String(v)); }
  removeItem(k) { this.m.delete(k); }
}
const code = ['ecrireCacheRpc', 'garderPositionDans', 'texteAjoutPosition'].map(extraire).join('\n');
const { ecrireCacheRpc, garderPositionDans, texteAjoutPosition } = new Function(code + '\nreturn { ecrireCacheRpc, garderPositionDans, texteAjoutPosition };')();
/* (1) le cache rpc tient son budget et evince les plus vieux */
const entrees = Array.from({ length: 2000 }, (_, i) => ['r:8453:0x' + String(i).padStart(64, '0'), { blockNumber: '0x1', pad: 'x'.repeat(600) }]);
const s1 = new Stockage(5_000_000);
vu(ecrireCacheRpc(s1, 'tb-rpc-immuable-v1', entrees, 300_000) === true, 'le cache rpc ne s ecrit pas');
const ecrit = s1.getItem('tb-rpc-immuable-v1');
vu(ecrit.length <= 300_000, 'budget depasse : ' + ecrit.length);
vu(ecrit.includes(entrees[1999][0]) && !ecrit.includes(entrees[0][0]), 'ce sont les plus RECENTES qui doivent rester');
/* (1b) quota : on reessaie une fois, plus petit, sans lever */
const s2 = new Stockage(200_000);
vu(ecrireCacheRpc(s2, 'tb-rpc-immuable-v1', entrees, 300_000) === true && s2.getItem('tb-rpc-immuable-v1').length <= 150_000, 'sur quota le cache ne se reduit pas');
/* (2) la position : stockage PLEIN de cache rpc -> le cache est libere, la position est gardee */
const cle = 'tblock.positions.8453.0x31e0';
const s3 = new Stockage(1_450_000); s3.setItem('tb-rpc-immuable-v1', 'y'.repeat(1_401_959)); s3.setItem('tb-createurs-v1', 'z'.repeat(47_000));
const mem = [];
const r3 = garderPositionDans(s3, cle, mem, '123456', '0xB200', 'tb-rpc-immuable-v1');
vu(r3 === 'STOCKEE' && JSON.parse(s3.getItem(cle))[0].id === '123456', 'ROUGE (prod) : la position n est pas gardee quand le cache rpc remplit le stockage : ' + r3 + ' / ' + s3.getItem(cle));
/* (2b) toujours plein (sans cache a liberer) : gardee en MEMOIRE, et dit */
const s4 = new Stockage(10); const mem4 = [];
const r4 = garderPositionDans(s4, cle, mem4, '777', '0xB200', 'tb-rpc-immuable-v1');
vu(r4 === 'MEMOIRE' && mem4.length === 1 && mem4[0].id === '777' && mem4[0].jeton === '0xb200', 'la position est perdue quand le stockage refuse : ' + r4);
/* (3) le texte de la carte */
vu(/listed below/.test(texteAjoutPosition({ stockees: 1, memoire: 0, ids: ['1'] })), 'stockee : listed below attendu');
const t5 = texteAjoutPosition({ stockees: 0, memoire: 1, ids: ['777'] });
vu(!/listed below\./.test(t5) && /#777/.test(t5) && /on chain/.test(t5), 'memoire seule : ne doit pas dire listed below : ' + t5);
vu(!/listed below\./.test(texteAjoutPosition({ stockees: 0, memoire: 0, ids: [] })), 'rien garde : listed below dit');
/* les sites */
vu(/ecrireCacheRpc\(localStorage, RPC_STOCKAGE, \[\.\.\.rpcImmuable\.entries\(\)\], RPC_STOCKAGE_MAX\)/.test(src), 'rpcStocker n utilise pas ecrireCacheRpc');
vu(/texteAjoutPosition\(\{ stockees, memoire, ids: idsGardes \}\)/.test(src), 'la carte n utilise pas texteAjoutPosition');
console.log('OK test-stockage-plein-positions-20261011 : ' + n + ' assertions');