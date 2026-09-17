// test-cerveau-identite.mjs — ce qui distingue le cerveau d un block d un autre.
// ================================================================================================
// ⛔ LE PIEGE, MESURE LE 2026-09-17 sur une remarque de Phil (« c est tout le meme block ») :
//    `vu.entree` ne porte QUE les faits (version, taille, delta, gm, messages, detenteurs, tick…).
//    Deux blocks DIFFERENTS nourris des MEMES chiffres rendent donc la MEME empreinte — et l ecran
//    l affichait seule, avec « replay it and you get the same beat ». C etait faux entre deux
//    blocks : meme entree, cablage different, battement different.
// ⇒ Ce test grave les deux faits : l entree se repete d un block a l autre (ce n est PAS un bug,
//   c est sa definition), et c est `vu.cablage` qui identifie le block. Si un jour quelqu un ajoute
//   l adresse dans `entree`, le premier cas casse et il faudra decider exprès.
import assert from 'node:assert/strict';
import { etatInitial, pas, connectome } from './cerveau.js';

const A = '0xb2000000000000000000006d9b5370dbbc048485';
const B = '0xb20000000000000000000084d0953bad205d563f';
const FAITS = { vie: 1, vieAvant: 1, gm: 0, messages: 0, detenteurs: 3, etatVie: 'LUE' };

const jouer = (adr, n = 40) => {
  let e = etatInitial(adr);
  const vus = [];
  for (let i = 0; i < n; i++) { const r = pas(e, FAITS); e = r.etat; vus.push(r.vu); }
  return vus;
};

let n = 0;
const ok = (nom, f) => { f(); n++; console.log('  ok', nom); };

const x = jouer(A), y = jouer(B);

ok('l empreinte des FAITS est la meme pour deux blocks aux memes chiffres (definition, pas bug)', () => {
  for (let i = 0; i < x.length; i++) assert.equal(x[i].entree, y[i].entree, 'tick ' + i);
});

ok('l empreinte du CABLAGE differe, et c est elle qui identifie le block', () => {
  assert.notEqual(x[0].cablage, y[0].cablage);
  assert.equal(x[0].cablage, connectome(A).empreinte);
  assert.equal(y[0].cablage, connectome(B).empreinte);
  /* le cablage ne bouge pas d un battement a l autre : c est une identite, pas une humeur */
  assert.equal(new Set(x.map((v) => v.cablage)).size, 1);
});

ok('le battement lui-meme differe : les cerveaux ne sont pas le meme block', () => {
  assert.notDeepEqual(x.map((v) => v.indices), y.map((v) => v.indices));
  assert.notDeepEqual(x.map((v) => v.spikes), y.map((v) => v.spikes));
});

ok('temoin negatif : le MEME block rejoue a l identique, cablage et battement', () => {
  const z = jouer(A);
  assert.deepEqual(z.map((v) => [v.cablage, v.entree, v.spikes, v.indices]),
    x.map((v) => [v.cablage, v.entree, v.spikes, v.indices]));
});

ok('un cablage absent ne se remplace pas par une valeur inventee', () => {
  /* `vu.cablage` vient du connectome, jamais d un defaut : sur une adresse illisible, connectome
   * refuse, donc il n y a pas de cerveau du tout — et surtout pas un cerveau « par defaut ». */
  assert.throws(() => etatInitial('pas-une-adresse'));
});

console.log('test-cerveau-identite:', n, 'cas, exit 0');
