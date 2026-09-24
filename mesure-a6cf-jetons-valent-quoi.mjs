/* mesure-a6cf-jetons-valent-quoi.mjs — CES JETONS DETENUS VALENT-ILS QUELQUE CHOSE ?
 *
 * ⛔⛔ LA QUESTION QUI DECIDE. a6cf detient 7 jetons, verifies par `balanceOf` — donc par l etat,
 *     pas par des logs falsifiables. Mais « detenu » n est pas « encaisse » : un jeton sans marche
 *     vaut ZERO dollar, quel que soit le nombre affiche. Phil veut 200 $ de frais ; un solde de
 *     149 396 unites d un jeton que personne n echange n y contribue pas d un centime.
 *
 * ⛔ ON REUTILISE UN INSTRUMENT DEJA MESURE plutot que d en ecrire un nouveau : `/api/cle/<jeton>`
 *   lit la vraie cle de pool SUR LA CHAINE (elle est deja en production et deja verifiee).
 *   `canonical-helper-weaker-copy` : refaire la lecture ici en produirait une version plus faible.
 *
 * ⛔⛔ CE QUE CETTE SONDE PEUT CONCLURE, ET CE QU ELLE NE PEUT PAS :
 *     · PAS DE POOL  ⇒ valeur nulle, et c est une CONCLUSION : rien ne peut etre vendu.
 *     · POOL EXISTE  ⇒ valeur INCONNUE. Une pool peut etre vide, ou si fine que vendre 149 396
 *       unites ne rendrait presque rien. Je ne transformerai pas « une pool existe » en « ca vaut
 *       de l argent » — c est exactement le genre de saut qui fabrique un faux revenu.
 */
const API = process.argv[2] || 'https://tokenizedblock.space';

/* les 7 detentions VERIFIEES par balanceOf a la passe precedente, plus les 2 illisibles, dits */
const DETENUS = [
  ['0xb2000000000000000000006d6f9102e9e4b221e0', 'OK', '149 396,3475'],
  ['0xb20000000000000000000071224edc6587e362d2', 'TUTU', '48 155,8314'],
  ['0xb200000000000000000000df3ffcd9be89b3843c', '?', '1 981,2614'],
  ['0xb20000000000000000000024c30d3fcb7931272e', 'TBLOCK', '98,5323'],
  ['0xb200000000000000000000e63ffc3f40bf92a042', 'BASED', '1 000 000 000 (supply ENTIERE)'],
  ['0x5354057f7fdaa8d9f6b894f2b44d187273993b06', '$JEANPHIL', '10'],
  ['0xb2000000000000000000004ff41cbd5ef8e49f14', 'RNG', '1 986,6177'],
];
const NON_LUS = ['0x58bdc4310db1b19854ca9066deed7e3df4f2ec9b', '0xb200000000000000000000ab549fa65ad4edae3f'];

console.log('═══ LES JETONS DE a6cf ONT-ILS UN MARCHE ? ═══\n');
let sansPool = 0, avecPool = 0, illisibles = 0;
for (const [jeton, sym, solde] of DETENUS) {
  /* ⛔⛔ REPRISE SUR RATE-LIMIT, AJOUTEE APRES MESURE. Ma premiere version tirait les 7 lectures
   *     d affilee : le noeud a repondu « over rate limit » aux SEPT, et la sonde a rendu
   *     « 7 illisibles ». Elle a eu RAISON de ne rien conclure — en deux etats seulement, elle
   *     aurait ecrit « 7 sans marche, valeur 0 $ », ce qui est faux et aurait ete publie. On espace,
   *     on reessaie, et on ne declare illisible qu apres avoir vraiment insiste. */
  let r, j, dernier = '';
  for (let essai = 0; essai < 5; essai++) {
    if (essai) await new Promise((k) => setTimeout(k, 2500 * essai));
    try {
      r = await fetch(API + '/api/cle/' + jeton, { cache: 'no-store' });
      j = await r.json();
      dernier = JSON.stringify(j);
      if (!/rate limit/i.test(dernier)) break;
    } catch (e) { dernier = String(e.message).slice(0, 60); j = null; }
  }
  if (!j || /rate limit/i.test(dernier)) {
    illisibles++;
    console.log('⛔ ' + sym.padEnd(10) + ' LECTURE ECHOUEE apres 5 essais (' + dernier.slice(0, 55) + ') — rien conclu');
    continue;
  }
  /* ⛔ TROIS ETATS. « pas de pool » et « je n ai pas pu lire » ne s ecrivent pas pareil. */
  if (!j || j.ok === false && !j.etat) {
    illisibles++;
    console.log('⛔ ' + sym.padEnd(10) + ' reponse illisible — rien conclu  ' + JSON.stringify(j).slice(0, 90));
    continue;
  }
  const cle = j.cle || j.poolKey || null;
  const aPool = !!(cle && (cle.fee !== undefined || cle.currency1));
  if (aPool) {
    avecPool++;
    console.log('◐ ' + sym.padEnd(10) + ' une pool EXISTE (fee=' + String(cle.fee) + ')  solde ' + solde);
    console.log('     ⚠️ valeur INCONNUE : une pool peut etre vide ou trop fine pour absorber ce solde.');
  } else {
    sansPool++;
    console.log('⛔ ' + sym.padEnd(10) + ' AUCUNE pool  solde ' + solde);
    console.log('     ⇒ invendable. Ce solde vaut 0 $, quel que soit le nombre affiche.');
  }
}

if (NON_LUS.length) {
  console.log('\n⚠️ ' + NON_LUS.length + ' jeton(s) dont la DETENTION n a pas pu etre lue a la passe precedente :');
  for (const n of NON_LUS) console.log('   ' + n + ' — ni confirme ni infirme, donc pas compte ici.');
}

console.log('\n── verdict ──');
console.log(sansPool + ' sans marche (valeur 0 $, conclusion) · ' + avecPool
  + ' avec une pool (valeur INCONNUE) · ' + illisibles + ' illisible(s)');
console.log('\n⛔⛔ CE QUE JE NE DIRAI PAS : que ces jetons « valent » un montant. Aucun prix n a ete');
console.log('   lu, aucune vente n a ete simulee. Le seul chiffre solide de tout ceci est le');
console.log('   nombre de soldes qui ne peuvent PAS etre vendus.');
