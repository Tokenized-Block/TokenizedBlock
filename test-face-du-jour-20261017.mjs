/* test-face-du-jour-20261017.mjs - LA FACE DU JOUR VIENT D UN HASH DE BLOC, LE SCORE EST EXACT ET BORNE.
 * AFFIRME : (1) faceRevelee = apparenceDepuisAdresse des 20 premiers octets du hash ; un hash mal forme -> null (jamais une face inventee) ;
 *   (2) bandes de couleur : 6, bornes exactes (330..29 rouge, 30..89 jaune, …) ; ecart de teinte circulaire (350 vs 10 = 20) ;
 *   (3) une face contre elle-meme = 5/5, ecart 0 ; contre une autre : 0..5 et la liste des traits ; (4) aucune entree ne fait planter.
 * NE PROUVE PAS : le choix du bloc E sur Base (serveur, test-tirage-cablage) ni le rendu (navigateur). */
import { strict as assert } from 'node:assert';
import { faceRevelee, bandeTeinte, ecartTeinte, scoreFaces, BANDES, DELAI_REVELATION_S, premierBlocApres } from './face-du-jour.js';
import { apparenceDepuisAdresse } from './apparence.js';
import { keccak256Hex } from './keccak.js';
let n = 0;
const vu = (c, m) => { assert.ok(c, m); n += 1; };
const H = '0x' + 'ab'.repeat(32);
vu(JSON.stringify(faceRevelee(H)) === JSON.stringify(apparenceDepuisAdresse('0x' + 'ab'.repeat(20))), 'face revelee = apparence des 20 premiers octets du hash');
vu(faceRevelee('0x12') === null && faceRevelee(null) === null && faceRevelee('0x' + 'zz'.repeat(32)) === null, 'hash mal forme -> null');
vu(BANDES.length === 6 && bandeTeinte(0) === 'red' && bandeTeinte(29) === 'red' && bandeTeinte(30) === 'yellow' && bandeTeinte(330) === 'red' && bandeTeinte(329) === 'violet' && bandeTeinte(360) === 'red',
  '6 bandes, bornes exactes (330-29 rouge, 30-89 jaune, 270-329 violet)');
vu(ecartTeinte(350, 10) === 20 && ecartTeinte(0, 180) === 180 && ecartTeinte(90, 90) === 0, 'ecart de teinte circulaire');
const f = faceRevelee(H), g = faceRevelee('0x' + '01'.repeat(32));
const s = scoreFaces(f, f);
vu(s.score === 5 && s.sur === 5 && s.ecartTeinte === 0, 'une face contre elle-meme : 5/5');
const t = scoreFaces(f, g);
vu(t.score >= 0 && t.score <= 5 && t.score === Object.values(t.traits).filter(Boolean).length, 'score = nombre de traits vrais (' + t.score + ')');
vu(scoreFaces(null, g) === null && scoreFaces(f, null) === null, 'face absente -> null, jamais 0/5 invente');
vu(DELAI_REVELATION_S === 120, 'revelation : premier bloc >= cloture + 120 s');
/* distribution : sur 2 000 paires aleatoires-deterministes, la moyenne des traits trouves est faible mais non nulle */
/* ⛔ 1re version : des petits nombres remplis de zeros a GAUCHE -> les 20 premiers octets toujours nuls -> 2 000 paires IDENTIQUES,
 *   moyenne 5,000 : la mesure etait constante (attrapee par la borne ci-dessous). Les hashes sont maintenant keccak(i) : pleine entropie. */
let somme = 0;
for (let i = 0; i < 2000; i++) {
  const a = faceRevelee(keccak256Hex(new TextEncoder().encode('a' + i))), b = faceRevelee(keccak256Hex(new TextEncoder().encode('b' + i)));
  somme += scoreFaces(a, b).score;
}
const moy = somme / 2000;
vu(moy > 0.3 && moy < 0.8, 'moyenne mesuree des traits trouves entre deux faces au hasard : ' + moy.toFixed(3) + ' (attendu ~0,52 = 1/6+1/10+1/19+1/9+1/8)');
/* (5) le bloc E : le PREMIER bloc >= cible, sur une chaine a 2 s puis sur une chaine irreguliere */
const chaine = (tsDe, tete) => async (m, p) => {
  if (m === 'eth_blockNumber') return '0x' + tete.toString(16);
  const b = parseInt(p[0], 16); return { timestamp: '0x' + tsDe(b).toString(16), hash: '0x' + b.toString(16).padStart(64, '0') };
};
const deux = (b) => 1_800_000_000 + 2 * b;
const e1 = await premierBlocApres(chaine(deux, 100000), deux(60000) + 1);
vu(e1 && e1.bloc === 60001 && e1.ts === deux(60001) && e1.hash === '0x' + (60001).toString(16).padStart(64, '0'), 'Base 2 s : premier bloc >= cible (60001, pas 60000)');
const exact = await premierBlocApres(chaine(deux, 100000), deux(70000));
vu(exact && exact.bloc === 70000, 'cible pile sur un bloc : CE bloc');
const irr = (b) => 1_800_000_000 + (b < 50000 ? 2 * b : 100000 + 7 * (b - 50000));
const e2 = await premierBlocApres(chaine(irr, 100000), irr(61234) - 3);
vu(e2 && e2.bloc === 61234, 'blocs irreguliers (7 s) : exact (' + (e2 && e2.bloc) + ')');
vu(await premierBlocApres(chaine(deux, 100000), deux(100000) + 10) === null, 'cible dans le futur : null (pas encore de bloc E)');
console.log('ok face-du-jour - ' + n + ' assertions');
