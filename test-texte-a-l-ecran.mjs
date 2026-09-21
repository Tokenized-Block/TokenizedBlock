// test-texte-a-l-ecran.mjs — CE QUE L UTILISATEUR LIT EST EN ANGLAIS, ET N EST PAS UNE NOTE INTERNE.
//
// ⛔⛔ POURQUOI CE FICHIER EXISTE (Phil, 2026-09-21, et il avait raison d etre dur) : l app servie au
//     public affichait, en toutes lettres, sous la carte des stades :
//
//       « 256 block(s) on the map · 3 made with TokenizedBlock · 165 tier(s) from the public market
//         (DexScreener), the rest read on chain · markets still loading ·
//         named when life is LUE (unread ≠ broken). »
//
//     Trois defauts dans une seule phrase :
//       · « LUE » est du FRANCAIS, en plein ecran anglais ;
//       · « tier(s) » est un calque de « tiers » (= third-party). En anglais, « tier » veut dire
//         « palier » : la phrase ne dit pas ce qu elle croit dire, elle dit autre chose ;
//       · « (unread ≠ broken) » est une NOTE DE CONCEPTION. Elle explique a un developpeur pourquoi
//         un etat vide n est pas une panne. L utilisateur n a pas a connaitre nos etats internes.
//
// ⛔ J AVAIS DEJA LA REGLE, ECRITE, ET JE L AI VIOLEE : « notes de conception en commentaire, jamais
//    a l ecran ». Une regle qu aucun test n applique n est pas une regle, c est un souvenir. Ce
//    fichier la rend executable.
//
// ⛔ CE QU IL NE PEUT PAS FAIRE : juger le style. Il attrape des MOTIFS — mots francais, jargon
//    interne, notation de specification — dans les chaines qui finissent a l ecran. Une phrase
//    anglaise, correcte et inutile lui echappera.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

let n = 0;
const ok = (c, m) => { assert.ok(c, m); n++; };

/* ⛔⛔ TOUTES LES PAGES PUBLIQUES, PAS SEULEMENT L APP. Premiere version : elle ne lisait
 *     qu `app.html`. Phil a dit « ya encore full erreur sur frontend » — corriger la page ou le
 *     defaut a ete VU et laisser les autres est exactement le motif « le correctif rate le jumeau ».
 * ⛔ Les pages `deploy-*.html` sont ECARTEES, et la raison est ecrite : ce sont des consoles de
 *    signature que seul Phil ouvre. Elles DOIVENT parler en octets et en selecteurs — leur imposer
 *    un langage grand public retirerait l information qui permet de refuser une signature. */
/* ⛔⛔ DEUX PAGES SONT ECARTEES PARCE QU ELLES NE SONT JAMAIS AFFICHEES, et c est MESURE, pas
 *     suppose : `index.html` et `block-0.html` repondent 301 vers `/#creer` en production (curl,
 *     2026-09-21). Leur contenu — l ancien ecran, 593 Ko — n atteint aucun utilisateur. Les
 *     corriger aurait ete du travail invisible, et les laisser dans le compte aurait noyé les
 *     deux vraies fautes (pot.html et lien-x.html) sous seize fausses.
 * ⛔ SI L UNE REDEVENAIT SERVIE, CE TEST NE LE VERRAIT PAS. C est la borne de ce fichier, et elle
 *    est ecrite ici plutot que decouverte plus tard : la liste est statique, pas lue du serveur. */
const REDIRIGEES = new Set(['index.html', 'block-0.html']);
const PAGES = readdirSync(new URL('./', import.meta.url))
  .filter((f) => f.endsWith('.html') && !/^deploy-/.test(f) && !REDIRIGEES.has(f))
  .sort();

/* ══ CE QU ON CHERCHE ════════════════════════════════════════════════════════════════════════
 * ⛔ Chaque motif porte la raison de sa presence : une liste de mots interdits sans justification
 *    finit par etre elaguee par quelqu un qui ne sait pas pourquoi ils y etaient. */
const MOTIFS = [
  { re: /\b(LUE|LUES|LU|NON LU|ILLISIBLE|MESURE|AUCUN|POURQUOI|ETAT)\b/,
    quoi: 'mot francais en majuscules (nos etats internes portent ces noms)' },
  { re: /\btier\(s\)|\btiers\b(?! party)/i,
    quoi: '« tier(s) » — calque de « tiers » ; en anglais « tier » veut dire palier' },
  { re: /≠|⛔|≥(?!\s*\d)/,
    quoi: 'notation de specification (≠, ⛔) — elle appartient au code, pas a l ecran' },
  { re: /\b(unread|unreadable)\s*[≠!=]/i, quoi: 'note de conception sur nos etats de lecture' },
  { re: /\b(fallback|nullish|undefined|NaN|boolean|bigint|calldata|selector|topic0)\b/i,
    quoi: 'jargon d implementation' },
];

/** Les chaines qui finissent a l ecran : `textContent`, `innerHTML` et le texte des balises. */
function chainesVisibles(src) {
  const out = [];
  /* 1. affectations de texte en JS.
   * ⛔⛔ LES COMPARAISONS SONT RETIREES D ABORD. Premiere version : elle signalait « undefined »
   *     comme du jargon affiche, alors que la chaine venait de `typeof window.ethereum ===
   *     'undefined'` — une CONDITION dans la meme expression ternaire, jamais un texte. Un
   *     detecteur qui accuse du code sain finit desactive, donc il est resserre, pas assoupli. */
  const sansComparaisons = src.replace(/(?:typeof\s+[\w.$]+\s*)?[!=]==?\s*(['"])(?:[^'"\\]|\\.)*\1/g, '');
  for (const m of sansComparaisons.matchAll(/\.(?:textContent|innerHTML|placeholder|title)\s*=\s*([^;]+);/g)) {
    for (const s of m[1].matchAll(/'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"/g)) {
      const t = (s[1] ?? s[2] ?? '').trim();
      if (t.length > 3) out.push({ t, ou: 'JS' });
    }
  }
  /* 2. texte des balises visibles du HTML. ⛔ Les commentaires HTML sont RETIRES d abord : ils
   *    portent justement nos notes de conception, et les attraper la serait un faux positif — la
   *    regle est « pas a l ecran », pas « pas dans le fichier ». */
  const sansCommentaires = src.replace(/<!--[\s\S]*?-->/g, '');
  const sansScript = sansCommentaires.replace(/<script[\s\S]*?<\/script>/g, '')
    .replace(/<style[\s\S]*?<\/style>/g, '');
  for (const m of sansScript.matchAll(/>([^<>{}]{4,})</g)) {
    const t = m[1].replace(/\s+/g, ' ').trim();
    if (t.length > 3 && /[a-zA-Z]/.test(t)) out.push({ t, ou: 'HTML' });
  }
  return out;
}

ok(PAGES.length >= 3, PAGES.length + ' page(s) publique(s) balayee(s) : ' + PAGES.join(', '));
let total = 0;
const fautes = [];
for (const nom of PAGES) {
  const src = readFileSync(new URL('./' + nom, import.meta.url), 'utf8');
  const visibles = chainesVisibles(src);
  total += visibles.length;
  for (const v of visibles) {
    for (const m of MOTIFS) {
      if (m.re.test(v.t)) fautes.push({ ...v, page: nom, quoi: m.quoi });
    }
  }
}
ok(total > 50, total + ' chaines visibles extraites — pas une liste vide');
ok(fautes.length === 0,
  fautes.length + ' texte(s) a l ecran a corriger :\n'
  + fautes.map((f) => '      ' + f.page + ' [' + f.ou + '] ' + f.quoi
    + '\n        « ' + f.t.slice(0, 160) + ' »').join('\n'));

/* ══ LE TEMOIN — sans lui, un detecteur qui ne detecte rien passerait aussi ═════════════════ */
{
  const faux = " · named when life is LUE (unread ≠ broken).";
  const attrape = MOTIFS.filter((m) => m.re.test(faux));
  ok(attrape.length >= 2,
    'temoin : la phrase EXACTE du 2026-09-21 declenche ' + attrape.length + ' motifs — '
    + attrape.map((m) => m.quoi).join(' · '));
  const sain = 'The biggest blocks first, by the market value we can read on chain.';
  ok(MOTIFS.every((m) => !m.re.test(sain)),
    'temoin inverse : une phrase anglaise saine n est PAS signalee a tort');
}

console.log('test-texte-a-l-ecran : ' + n + ' assertions, ' + PAGES.length + ' page(s), ' + total + ' chaines lues, OK');
