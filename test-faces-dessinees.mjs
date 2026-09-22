// test-faces-dessinees.mjs — TOUTE FACE OFFERTE AU MENU DOIT AVOIR UN DESSIN.
//
// ⛔⛔ LE DEFAUT QUE CE FICHIER EXISTE POUR EMPECHER. `logo.js` finit son choix de motif par un
//     repli : si la facette demandee n est pas dans la table des traces, il dessine LA LETTRE du
//     symbole. Ce repli est bon — il garde lisible une face gravee par une version plus ancienne —
//     mais il rend une facette manquante INVISIBLE : le menu la propose, l utilisateur la choisit,
//     et il obtient une lettre. Aucune erreur, aucun log, juste un choix qui ne fait rien.
//
// ⛔ C EST EXACTEMENT LE MOTIF « retour neutre qui avale l echec », et il fallait l attraper ici
//    parce que le repli est VOULU : on ne peut pas le supprimer, donc on le borne.
//
// ⛔ CE QUE CE FICHIER NE PEUT PAS FAIRE : juger si un dessin est beau, ni s il se lit a 40 px. Il
//    verifie qu il EXISTE, qu il produit du SVG, et qu il ne ressemble pas au repli.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FACETTES_CREATE, ORBITES_CREATE, MATIERES_CREATE, ORNEMENTS_CREATE, LISTES, combinaisonsCreate }
  from './face.js';
import { ORBITES, FACETTES, MATIERES, ORNEMENTS } from './apparence.js';
import { MOTIFS_NOTO } from './motifs-noto.js';

let n = 0;
const eq = (a, b, m) => { assert.equal(a, b, m); n++; };
const ok = (c, m) => { assert.ok(c, m); n++; };

/* ══ 1. LES LISTES GELEES RESTENT UN PREFIXE EXACT ══════════════════════════════════════════
 * ⛔ C EST LA REGLE LA PLUS FRAGILE DU MODULE : la longueur des listes d apparence.js sert de
 *    modulo pour deriver la face de tout block qui n en a pas grave une. Inserer une valeur au
 *    milieu — ou meme en changer une — donnerait une autre tete a des blocks DEJA NES. */
/* ⛔⛔ LES VALEURS GELEES SONT RECOPIEES ICI, EN DUR, ET C EST LE CORRECTIF D UNE GARDE QUI NE
 *     GARDAIT RIEN. Premiere version : elle comparait `FACETTES_CREATE[i]` a `FACETTES[i]`. Or
 *     `FACETTES_CREATE = [...FACETTES, …]` — changer FACETTES change LES DEUX COTES, et la
 *     comparaison s annule. Preuve par mutation : renommer `anneau` en `ANNEAU` dans apparence.js
 *     n a PAS ete detecte. Une garde incapable d echouer sur ce qu elle protege est un decor.
 * ⛔ Une liste figee ici est un SNAPSHOT : si quelqu un modifie apparence.js volontairement, ce test
 *    echoue et l oblige a venir lire pourquoi c est interdit. C est exactement l effet voulu. */
const GELEES = {
  ORBITES: ['sillage', 'couronne', 'essaim', 'chute', 'coins', 'spirale', 'colonne', 'ailes', 'ronde', 'diagonale'],
  FACETTES: ['lettre', 'anneau', 'barres', 'disque', 'croix', 'losange', 'triangle', 'points', 'chevrons',
    'cible', 'etoile', 'eclair', 'hexagone', 'coche', 'cle', 'vague', 'grille', 'fleche', 'vide'],
  MATIERES: ['verre', 'plein', 'fil', 'neon', 'papier', 'encre', 'chrome', 'braise', 'givre'],
  ORNEMENTS: ['aucun', 'points', 'equerres', 'griffes', 'arcs', 'croix', 'chevrons', 'etoiles'],
};
for (const [nom, base, etendue] of [['ORBITES', ORBITES, ORBITES_CREATE],
  ['FACETTES', FACETTES, FACETTES_CREATE], ['MATIERES', MATIERES, MATIERES_CREATE],
  ['ORNEMENTS', ORNEMENTS, ORNEMENTS_CREATE]]) {
  const fige = GELEES[nom];
  eq(base.length, fige.length,
    nom + ' : la liste GELEE a change de longueur — la face de tout block qui n en a pas grave une '
    + 'est derivee par modulo sur cette longueur. La changer donne une autre tete a des blocks '
    + 'DEJA NES.');
  for (let i = 0; i < fige.length; i++) {
    eq(base[i], fige[i], nom + '[' + i + '] de la liste GELEE vaut toujours « ' + fige[i] + ' »');
    eq(etendue[i], fige[i], nom + '[' + i + '] est toujours en tete de la liste etendue');
  }
  ok(etendue.length >= base.length, nom + ' : la liste etendue ne retire rien');
  eq(new Set(etendue).size, etendue.length, nom + ' : aucune valeur en double');
}

/* ══ 2. CHAQUE FACETTE OFFERTE A UN TRACE ═══════════════════════════════════════════════════ */
const src = readFileSync(new URL('./logo.js', import.meta.url), 'utf8');
/* ⛔ On lit la table des motifs telle qu elle est ecrite : `nom: \`<svg…\``. Un nom absent de cette
 *    table tombera dans le repli « lettre » — c est precisement ce qu on cherche.
 * ⛔⛔ PREMIERE VERSION : elle exigeait six espaces en debut de ligne, et a donc accuse `anneau`
 *     d etre sans dessin alors qu il EST trace — il partage simplement sa ligne avec l ouverture
 *     `const d = {`. Une garde qui accuse du code sain finit desactivee : le motif est resserre sur
 *     la FORME de l entree, pas sur sa position dans la ligne. */
const traces = new Set([...src.matchAll(/(?:^|[{\s])([a-z]+):\s*`</gm)].map((m) => m[1]));
ok(traces.size > 20, traces.size + ' motif(s) trouve(s) dans logo.js — pas une table vide');

/* ⛔⛔ IL Y A DEUX SOURCES DE DESSINS DEPUIS LE 2026-09-22, et la garde doit connaitre les deux.
 *     Quand les 29 silhouettes Noto ont ete cablees, ce test a signale 29 facettes « sans dessin » :
 *     il ne lisait que la table en ligne de logo.js. Ce n etait PAS un faux positif — sa
 *     connaissance etait incomplete, et il a eu raison de crier. On l etend, on ne l assouplit pas.
 * ⛔ ET ON VERIFIE QUE LE SECOND JEU EST BIEN BRANCHE : un motif present dans `motifs-noto.js` mais
 *    que `logo.js` n irait jamais chercher retomberait quand meme sur la lettre. */
ok(/MOTIFS_NOTO\[o\.facette\]/.test(src),
  'logo.js va bien chercher les silhouettes Noto quand sa table en ligne ne connait pas le nom');
ok(/split\('__F__'\)\.join\(f\)/.test(src),
  "le marqueur `__F__` est remplace par la couleur d accent — sinon le dessin sortirait sans couleur");
/* ⛔ L ORDRE COMPTE ET IL EST VERIFIE : nos traces a nous doivent gagner. Si un nom existait des
 *    deux cotes et que Noto passait devant, la tete de blocks DEJA GRAVES changerait. */
const posInline = src.indexOf('}[o.facette]');
const posNoto = src.indexOf('MOTIFS_NOTO[o.facette]');
ok(posInline > 0 && posNoto > posInline,
  'la table en ligne est consultee AVANT les silhouettes importees — nos traces gagnent toujours');

const sansTrace = FACETTES_CREATE.filter((f) => f !== 'lettre' && f !== 'vide'
  && !traces.has(f) && !(f in MOTIFS_NOTO));
ok(sansTrace.length === 0,
  sansTrace.length + ' facette(s) offerte(s) au menu SANS dessin : ' + sansTrace.join(', ')
  + '\n      Elles retomberaient sur la lettre du symbole, sans erreur ni log.');

/* ⛔ ET LES DEUX CAS SPECIAUX SONT VOULUS, DONC NOMMES : `lettre` EST le repli, `vide` ne dessine
 *    rien exprès. Les passer en silence aurait cache un vrai manquant derriere une exception. */
ok(FACETTES_CREATE.includes('lettre'), '`lettre` reste offerte — c est le repli assume');
ok(/o\.facette === 'vide'/.test(src), '`vide` est traite explicitement dans logo.js');

/* ══ 3. AUCUN OCTET IMPORTE — la regle qui protege une image IRREVERSIBLE ═══════════════════
 * ⛔ La face est GRAVEE : personne ne peut la changer ensuite. Un asset tiers ou une police
 *    d emoji rendrait le dessin dependant de l appareil, et poserait une licence a verifier sur
 *    une image qu on ne peut plus retirer. */
/* ⛔⛔ PREMIERE VERSION : `!/<image\b/` sur tout le fichier. Elle a accuse la PHOTO DE
 *     L UTILISATEUR — une fonctionnalite voulue, et deja bornee a `data:image/`, donc sans aucun
 *     octet distant. Interdire le mot-cle au lieu de la regle aurait supprime une vraie
 *     fonctionnalite pour satisfaire un test. La regle est : AUCUN OCTET VENU D AILLEURS. */
const photoBornee = /o\.photo\.startsWith\('data:image\/'\)/.test(src);
ok(photoBornee,
  "la photo de l utilisateur est bornee a `data:image/` — inlinee, jamais chargee d un tiers");
/* ⛔ LE NAMESPACE XML N EST PAS UNE RESSOURCE. `http://www.w3.org/2000/svg` est obligatoire pour un
 *    SVG autonome et n est JAMAIS charge par un navigateur — c est un identifiant, pas une adresse.
 *    Le refuser aurait casse le rendu pour satisfaire un test, ce qui est l inverse du but. */
const NAMESPACES = /^https?:\/\/www\.w3\.org\//;
const distantes = [...src.matchAll(/["'`(]\s*(https?:\/\/[^"'`)\s]+)/g)]
  .map((m) => m[1]).filter((u) => !NAMESPACES.test(u));
ok(distantes.length === 0,
  'aucune URL distante dans le dessin — trouve : ' + distantes.join(' · '));
/* ⛔ LE CONTROLE DES EMOJI PORTE SUR LA TABLE DES MOTIFS, pas sur les commentaires : ce fichier en
 *    contient, et ils expliquent justement pourquoi on n en met pas dans les traces. */
/* ⛔ L ANCRE DE FIN A CHANGE quand les silhouettes Noto ont ete cablees : la table ne se termine
 *    plus par `}[o.facette];` mais par `}[o.facette]` suivi du repli `|| MOTIFS_NOTO[...]`. Le
 *    point-virgule etait donc une ancre FRAGILE — elle a fait echouer ce controle sur du code sain.
 *    Il est retire, et la borne de la table est le crochet lui-meme. */
const tableMotifs = /const d = \{[\s\S]*?\n    \}\[o\.facette\]/.exec(src);
ok(tableMotifs !== null, 'la table des motifs est lisible pour etre controlee');
/* ⛔⛔ LES COMMENTAIRES SONT RETIRES AVANT LE CONTROLE, et l en-tete de ce bloc le disait deja :
 *     « le controle porte sur la table des motifs, PAS sur les commentaires ». La table en contient
 *     desormais — ceux qui expliquent pourquoi `adn` et `livre` ont ete redessines — et ils portent
 *     des ⛔. Le detecteur les a signales comme des emoji dans un trace : faux, et il aurait fait
 *     supprimer l explication pour satisfaire le test. Ce qui est interdit, c est un emoji DESSINE. */
const tableSansCommentaires = tableMotifs
  ? tableMotifs[0].replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
  : '';
const emoji = tableSansCommentaires.match(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu);
ok(!emoji,
  'aucun emoji DANS LES TRACES — un emoji est un glyphe de police : il changerait de dessin selon '
  + "l appareil, sur une image gravee pour toujours. Trouve : " + (emoji || []).join(' '));

/* ══ 4. LE COMPTE PUBLIE SUIT LES LISTES ════════════════════════════════════════════════════ */
eq(LISTES.facette.length, FACETTES_CREATE.length, 'le menu Face offre bien toute la liste etendue');
const attendu = 361 * 361 * 8 * 13 * 9 * 81 * ORBITES_CREATE.length * FACETTES_CREATE.length
  * MATIERES_CREATE.length * ORNEMENTS_CREATE.length;
eq(combinaisonsCreate(), attendu,
  'le nombre publie a l ecran est calcule sur les listes reelles, jamais fige a la main');

/* ══ 5. LE TEMOIN — sans lui, un test qui ne detecterait rien passerait aussi ════════════════ */
{
  ok(!traces.has('zzinexistant'),
    'temoin : un nom absent de la table n est PAS vu comme trace — le detecteur discrimine');
  ok(traces.has('coeur'),
    'temoin inverse : un motif reellement present est bien trouve');
}

console.log('test-faces-dessinees : ' + n + ' assertions, ' + FACETTES_CREATE.length
  + ' facettes offertes, ' + traces.size + ' motifs traces, OK');
