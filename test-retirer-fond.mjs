// test-retirer-fond.mjs — LE DETOURAGE DOIT MARCHER, ET DIRE QUAND IL NE MARCHE PAS.
//
// ⛔⛔ CE QUI SERAIT LE PIRE DEFAUT ICI, et ce que ce fichier existe pour empecher : un detourage
//     qui MANGE LE SUJET sans rien signaler. L image part dans le `contractURI` : elle est GRAVEE,
//     et personne ne peut plus la retirer. Un cube livre vide ne se repare pas.
//
// ⛔ CHAQUE CAS CONSTRUIT SES PIXELS A LA MAIN, pour que le resultat attendu soit calculable et pas
//    devine. Un test qui fabriquerait son entree depuis le module teste ne prouverait rien.
import assert from 'node:assert/strict';
import { fondEchantillonne, effacerFond, verdictFond } from './retirer-fond.js';

let n = 0;
const eq = (a, b, m) => { assert.equal(a, b, m); n++; };
const ok = (c, m) => { assert.ok(c, m); n++; };

/** Une image RGBA remplie d une couleur, avec un rectangle d une autre au centre. */
function image(l, h, fond, sujet, rect) {
  const p = new Uint8ClampedArray(l * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < l; x++) {
      const i = (y * l + x) * 4;
      const dedans = rect && x >= rect.x && x < rect.x + rect.l && y >= rect.y && y < rect.y + rect.h;
      const c = dedans ? sujet : fond;
      p[i] = c[0]; p[i + 1] = c[1]; p[i + 2] = c[2]; p[i + 3] = c[3] === undefined ? 255 : c[3];
    }
  }
  return p;
}

const BLANC = [255, 255, 255], NOIR = [10, 10, 10], ROUGE = [220, 40, 40];

/* ══ 1. LE CAS SIMPLE : sujet sur fond uni ══════════════════════════════════════════════════ */
{
  const l = 20, h = 20;
  const p = image(l, h, BLANC, NOIR, { x: 6, y: 6, l: 8, h: 8 });
  const fond = fondEchantillonne(p, l, h);
  ok(fond !== null, 'un fond uni est echantillonne');
  eq(fond.r, 255, 'et sa couleur est celle des coins');
  const r = effacerFond(p, l, h, fond);
  eq(r.effaces, l * h - 64, 'tout le fond est efface, et RIEN de plus (400 - 64 = 336)');
  /* ⛔ LE SUJET EST VERIFIE PIXEL PAR PIXEL, pas par un total : un total juste peut cacher un trou
   *    au milieu et un debordement sur le bord qui se compensent. */
  let sujetIntact = 0;
  for (let y = 6; y < 14; y++) {
    for (let x = 6; x < 14; x++) if (p[(y * l + x) * 4 + 3] === 255) sujetIntact++;
  }
  eq(sujetIntact, 64, 'le sujet est intact, les 64 pixels opaques');
  eq(verdictFond({ fond, ...r }).etat, 'RETIRE', 'le verdict dit RETIRE');
}

/* ══ 2. LE CAS QUI COMPTE VRAIMENT : du blanc A L INTERIEUR du sujet ════════════════════════
 * ⛔ C EST POUR CE CAS QUE LA DIFFUSION EXISTE. Un simple seuil global effacerait les yeux d un
 *    personnage, un reflet, une dent — tout ce qui est de la couleur du fond mais ENTOURE. La
 *    diffusion ne touche que ce qui est RELIE au bord. */
{
  const l = 20, h = 20;
  const p = image(l, h, BLANC, NOIR, { x: 4, y: 4, l: 12, h: 12 });
  /* un carre blanc de 2x2 au centre du sujet : un oeil */
  for (let y = 9; y < 11; y++) {
    for (let x = 9; x < 11; x++) {
      const i = (y * l + x) * 4;
      p[i] = 255; p[i + 1] = 255; p[i + 2] = 255;
    }
  }
  const fond = fondEchantillonne(p, l, h);
  effacerFond(p, l, h, fond);
  let oeilIntact = 0;
  for (let y = 9; y < 11; y++) {
    for (let x = 9; x < 11; x++) if (p[(y * l + x) * 4 + 3] === 255) oeilIntact++;
  }
  eq(oeilIntact, 4,
    "les 4 pixels BLANCS a l interieur du sujet survivent — un seuil global les aurait effaces, "
    + 'et le personnage aurait perdu ses yeux');
}

/* ══ 3. PAS DE FOND UNI : on REFUSE, on ne devine pas ══════════════════════════════════════ */
{
  const l = 10, h = 10;
  const p = new Uint8ClampedArray(l * h * 4);
  /* quatre coins de quatre couleurs franchement differentes */
  const poser = (x, y, c) => { const i = (y * l + x) * 4; p[i] = c[0]; p[i + 1] = c[1]; p[i + 2] = c[2]; p[i + 3] = 255; };
  poser(0, 0, [255, 0, 0]); poser(l - 1, 0, [0, 255, 0]);
  poser(0, h - 1, [0, 0, 255]); poser(l - 1, h - 1, [255, 255, 0]);
  eq(fondEchantillonne(p, l, h), null,
    'quatre coins qui ne s accordent pas ⇒ AUCUNE couleur de fond affirmee');
  eq(verdictFond({ fond: null, effaces: 0, total: l * h }).etat, 'PAS_DE_FOND_UNI',
    "et le verdict le dit, au lieu de livrer une image trouee");
}

/* ══ 4. DEJA TRANSPARENT : l image de Phil passe sans etre abimee ═══════════════════════════
 * ⛔ C EST LE CAS QU IL A DEMANDE DE RENDRE FACILE (« une image avec le fond deja retire »). Il
 *    doit traverser sans qu on touche a un pixel. */
{
  const l = 12, h = 12;
  const p = image(l, h, [0, 0, 0, 0], ROUGE, { x: 4, y: 4, l: 4, h: 4 });
  const fond = fondEchantillonne(p, l, h);
  const r = effacerFond(p, l, h, fond);
  eq(r.effaces, 0, 'un fond deja transparent : zero pixel touche');
  eq(verdictFond({ fond, ...r }).etat, 'DEJA_TRANSPARENT', 'et le verdict le dit sans crier a l erreur');
  let sujetIntact = 0;
  for (let y = 4; y < 8; y++) {
    for (let x = 4; x < 8; x++) if (p[(y * l + x) * 4 + 3] === 255) sujetIntact++;
  }
  eq(sujetIntact, 16, 'le sujet est intact');
}

/* ══ 5. LA GARDE QUI EVITE DE LIVRER UN CUBE VIDE ══════════════════════════════════════════
 * ⛔ Une image ENTIEREMENT de la couleur du fond se ferait effacer a 100 %. Sans cette garde,
 *    l utilisateur graverait — definitivement — une image vide, et l app aurait dit « ok ». */
{
  const l = 10, h = 10;
  const p = image(l, h, BLANC, BLANC, null);
  const fond = fondEchantillonne(p, l, h);
  const r = effacerFond(p, l, h, fond);
  eq(r.effaces, 100, 'une image toute unie est effacee en entier');
  const v = verdictFond({ fond, ...r });
  eq(v.etat, 'TROP_EFFACE', "et ce n est PAS un succes — le verdict refuse");
  ok(/100 % of the image was removed/.test(v.pourquoi), 'le refus dit combien a disparu');
  ok(/lower tolerance|plainer background/.test(v.pourquoi), 'et ce que l utilisateur peut faire');
}

/* ══ 6. FAIL-CLOSED sur une entree illisible ════════════════════════════════════════════════ */
for (const mauvais of [{ fond: {}, effaces: 0, total: 0 }, { fond: {}, effaces: null, total: 10 },
  { fond: {}, effaces: 1.5, total: 10 }]) {
  eq(verdictFond(mauvais).etat, 'NON_MESURE',
    'une entree qu on ne sait pas lire rend NON_MESURE, jamais RETIRE : ' + JSON.stringify(mauvais));
}
eq(effacerFond(null, 10, 10, { r: 0, v: 0, b: 0 }).effaces, 0, 'aucun pixel ⇒ rien d efface, pas une exception');
eq(fondEchantillonne(new Uint8ClampedArray(4), 1, 1), null, 'une image de 1x1 n a pas quatre coins');

/* ══ 7. LE TEMOIN — sans lui, un module qui n effacerait rien passerait aussi ═══════════════ */
{
  const l = 16, h = 16;
  const p = image(l, h, BLANC, ROUGE, { x: 5, y: 5, l: 6, h: 6 });
  const avant = [...p].filter((_, i) => i % 4 === 3 && p[i] === 255).length;
  const r = effacerFond(p, l, h, fondEchantillonne(p, l, h));
  ok(r.effaces > 0, 'temoin : le module efface vraiment quelque chose');
  ok(r.effaces < avant, "temoin : et il n efface pas tout — il reste un sujet");
  ok(r.part > 0.5 && r.part < 0.9,
    'temoin : la part effacee est plausible pour un sujet de 36 pixels sur 256 — ' + r.part.toFixed(3));
}

console.log('test-retirer-fond : ' + n + ' assertions, OK');
