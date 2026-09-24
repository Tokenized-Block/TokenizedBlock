/* mesure-echelle-cubes.mjs — QUELLE ECHELLE FAIT VOIR L ECART ?
 *
 * ⛔⛔ LA DEMANDE. Phil, 2026-09-24 : « check la taille, adapte avec une echelle que tu vas creer
 *     pour faire grossir les cubes plus gros, pour faire reellement confronter ». Sur le classement
 *     qu il a envoye, le premier vaut 316 438 $ et le dixieme 38 797 $ — huit fois moins. A
 *     l ecran, les deux cubes se ressemblent.
 *
 * ⛔ POURQUOI : l echelle est LOGARITHMIQUE. Un log ecrase par construction — c est son but quand on
 *   veut tout faire tenir, et c est son defaut quand on veut faire COMPARER. Huit fois plus d argent
 *   ne donne qu un tiers de decade sur trois.
 *
 * ⛔ ON NE REMPLACE PAS UNE INTUITION PAR UNE AUTRE : on calcule les trois echelles candidates sur
 *   les VRAIS chiffres du classement, et on regarde le rapport de largeur entre le 1er et le 10e.
 *   Le choix se fait sur le tableau, pas sur une preference.
 *
 * ⛔ CE QUE CETTE SONDE NE PEUT PAS FAIRE : dire ce qui est joli. Elle dit ce qui est LISIBLE —
 *   c est-a-dire de combien deux cubes different quand leurs valeurs different.
 */

/* le classement reel envoye par Phil le 2026-09-24 (10 premiers) */
const CLASSEMENT = [
  ['Muse Charm', 316438], ['Muse Fi', 123136], ['BEGJEV', 66809], ['MARIO', 46901],
  ['XDNA XRP', 44850], ['VSFO', 41150], ['SMOLTING', 39891], ['BLUESTONK', 39529],
  ['basedguy', 38890], ['MUSEINHOOD', 38797],
];
/* et des valeurs basses, parce qu une echelle se juge AUSSI sur ce qu elle fait du bas */
const BAS = [['un petit', 5000], ['tres petit', 1200], ['minuscule', 200]];

const MIN = 30, PLAFOND_USD = 1000000, PLANCHER_USD = 1000;

const echelles = {
  'log (actuelle)': (usd, max) => {
    const bas = Math.log10(PLANCHER_USD), haut = Math.log10(PLAFOND_USD);
    const p = (Math.log10(usd) - bas) / (haut - bas);
    return MIN + Math.max(0, Math.min(1, p)) * (max - MIN);
  },
  /* ⛔ RACINE CUBIQUE = le VOLUME du cube suit la valeur. C est la lecture la plus litterale d un
   *   cube, mais elle compresse presque autant que le log. */
  'racine cubique': (usd, max) => {
    const p = Math.cbrt(Math.max(0, usd) / PLAFOND_USD);
    return MIN + Math.max(0, Math.min(1, p)) * (max - MIN);
  },
  /* ⛔ RACINE CARREE = l AIRE du cube a l ecran suit la valeur. C est la convention etablie pour
   *   encoder une quantite par la taille d une marque : l oeil compare des surfaces, pas des
   *   largeurs. Ce n est donc pas « grossir arbitrairement », c est le codage juste. */
  'racine carree': (usd, max) => {
    const p = Math.sqrt(Math.max(0, usd) / PLAFOND_USD);
    return MIN + Math.max(0, Math.min(1, p)) * (max - MIN);
  },
};

function tableau(nom, f, max) {
  const l = [...CLASSEMENT, ...BAS].map(([n, v]) => [n, v, Math.round(f(v, max))]);
  const premier = l[0][2], dixieme = l[9][2], petit = l[l.length - 1][2];
  console.log('\n── ' + nom + '  (plafond ' + max + ' px) ──');
  for (const [n, v, px] of l) {
    const barre = '█'.repeat(Math.max(1, Math.round(px / 6)));
    console.log('   ' + n.padEnd(12) + String(v).padStart(7) + ' $  ' + String(px).padStart(4) + ' px  ' + barre);
  }
  console.log('   ⇒ 1er / 10e : ' + (premier / dixieme).toFixed(2) + '×  pour 8,15× d argent'
    + '   ·  1er / minuscule : ' + (premier / petit).toFixed(2) + '×');
  return premier / dixieme;
}

console.log('═══ QUELLE ECHELLE FAIT VOIR L ECART ? ═══');
console.log('Le 1er vaut 8,15× le 10e. Question : de combien leurs cubes doivent-ils differer ?');

const r = {};
r['log (actuelle)'] = tableau('log (actuelle)', echelles['log (actuelle)'], 170);
r['racine cubique'] = tableau('racine cubique', echelles['racine cubique'], 220);
r['racine carree'] = tableau('racine carree', echelles['racine carree'], 220);

console.log('\n── verdict ──');
for (const [k, v] of Object.entries(r)) console.log('   ' + k.padEnd(18) + v.toFixed(2) + '× de largeur');
console.log('\n⛔ CE QUE CE TABLEAU NE DIT PAS : si le resultat est beau, ni si la carte reste lisible');
console.log('   quand 188 cubes se partagent l ecran. Ca se verifie dans un navigateur, pas ici.');
