/* mesure-refus-muets.mjs — OU L APP DIT « NON » SANS LE COMPTER, PARTOUT.
 *
 * ⛔⛔ POURQUOI CE BALAYAGE EXISTE. Le 2026-09-25, j ai annonce TROIS refus non comptes dans
 *     `creerBlock()` apres l avoir lu a l oeil. La sonde en a trouve SEIZE. Puis j ai instrumente
 *     cette fonction-la — UNE fonction — et j ai failli en conclure que « les refus sont comptes ».
 *     Le chemin qui RAPPORTE n est pas la creation, c est l ACHAT : les frais viennent des trades.
 *     Regarder une seule fonction et generaliser est exactement l erreur que la premiere sonde
 *     venait de me montrer.
 *
 * ⛔ CE N EST PAS UNE GARDE, C EST UNE MESURE. Elle CLASSE, elle n interdit rien : beaucoup de
 *   fonctions affichent un refus dont le compteur vit chez l appelant, et aucune lecture statique
 *   ne peut le savoir. Le nombre sert a decider OU regarder, pas a accuser
 *   (`never-accuse-on-own-incompleteness`). Chaque site doit etre lu avant d etre appele un defaut.
 *
 * ⛔ CE QU ELLE NE PEUT PAS DIRE : si un compteur compte la bonne chose, et si un refus est
 *   frequent. La frequence se lit dans `/api/entonnoir`, jamais dans le source.
 *
 * usage : node mesure-refus-muets.mjs [fichier.html]
 */
import { readFileSync } from 'node:fs';

const chemin = process.argv[2] || new URL('./app.html', import.meta.url);
const html = readFileSync(chemin, 'utf8');

/** Corps d une fonction, borne par equilibrage d accolades en ignorant les chaines. */
function corpsDepuis(i) {
  let prof = 0, texte = null;
  for (let k = html.indexOf('{', i); k < html.length; k++) {
    const c = html[k];
    if (texte) { if (c === texte && html[k - 1] !== '\\') texte = null; continue; }
    if (c === '"' || c === "'" || c === '`') { texte = c; continue; }
    if (c === '{') prof++;
    else if (c === '}' && !--prof) return html.slice(i, k + 1);
  }
  return null;
}

/* ⛔ On prend les declarations `function nom(` ET `const nom = async (…) =>` : ne balayer que les
 *   premieres laisserait dehors une part du code, et un balayage partiel qui se presente comme
 *   complet est pire que pas de balayage (`search-tool-glob-halves-the-sweep`). */
const fonctions = [];
for (const m of html.matchAll(/(?:async\s+)?function\s+([A-Za-z0-9_$]+)\s*\(/g)) {
  const corps = corpsDepuis(m.index);
  if (corps) fonctions.push({ nom: m[1], corps });
}

/** Les sorties qui ANNONCENT un refus et ne comptent rien dans leur propre fenetre. */
function muetsDe(corps) {
  const out = [];
  let precedent = 0;
  for (const m of corps.matchAll(/\breturn\b[^;{]*;/g)) {
    const debut = Math.max(precedent, m.index - 700);
    const fenetre = corps.slice(debut, m.index);
    precedent = m.index + m[0].length;
    /* un refus ANNONCE : quelque chose a ete ecrit a l ecran juste avant de sortir */
    if (!/\.(textContent|innerHTML)\s*=/.test(fenetre)) continue;
    /* ⛔ le marqueur « wKo » distingue un refus d une simple mise a jour d affichage : sans lui, on
     *   compterait chaque rendu normal suivi d un `return` comme un refus non mesure. */
    if (!/wKo|refus|Refus/.test(fenetre)) continue;
    if (/\betape\(/.test(fenetre)) continue;
    out.push(fenetre.replace(/\s+/g, ' ').slice(-96));
  }
  return out;
}

const lignes = fonctions.map((f) => ({ nom: f.nom, muets: muetsDe(f.corps) }))
  .filter((x) => x.muets.length > 0)
  .sort((a, b) => b.muets.length - a.muets.length);

const total = lignes.reduce((a, b) => a + b.muets.length, 0);
console.log('── refus annonces a l ecran et non comptes sur place ──');
console.log('   ' + fonctions.length + ' fonctions balayees · ' + lignes.length
  + ' en contiennent · ' + total + ' sites au total\n');
for (const l of lignes.slice(0, 18)) {
  console.log('  ' + String(l.muets.length).padStart(3) + '  ' + l.nom);
}
if (lignes.length > 18) console.log('  … et ' + (lignes.length - 18) + ' autres fonctions');

/* ⛔ LE DETAIL DES CHEMINS QUI RAPPORTENT, nomme : ce sont les seuls ou un refus perdu coute de
 *   l argent. Les autres sont du confort d affichage tant que personne ne les a lus. */
const ARGENT = /achat|acheter|buy|vendre|sell|echange|swap|bridge|frais|vie|vivre|lancer/i;
const argent = lignes.filter((l) => ARGENT.test(l.nom));
console.log('\n── parmi elles, sur un chemin qui touche a l argent ──');
if (!argent.length) console.log('   aucune — et ca demande verification, pas soulagement.');
for (const l of argent) {
  console.log('\n  ' + l.nom + ' (' + l.muets.length + ')');
  for (const m of l.muets) console.log('     · …' + m);
}
console.log('\n⚠️ CE CLASSEMENT N ACCUSE PERSONNE : un refus peut etre compte par l appelant, ce qu une');
console.log('   lecture statique ne voit pas. Lire chaque site avant de l appeler un defaut.');
console.log('⚠️ ET IL NE DIT RIEN DE LA FREQUENCE : ca se lit dans /api/entonnoir, pas dans le source.');
