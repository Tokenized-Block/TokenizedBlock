/* mesure-a6cf-jetons-ont-un-marche.mjs — LES JETONS ENCAISSES SONT-ILS DANS LA LISTE DES MARCHES ?
 *
 * ⛔⛔ LA QUESTION, ET POURQUOI ELLE DECIDE. Phil, 2026-09-24 : « si paye avec du gas c est notre
 *     reward » — donc presenter l ETH dans le rail fiat. Mesure faite avant : a6cf encaisse AUSSI
 *     des jetons, 7 detentions confirmees par `balanceOf` (de l etat, pas des logs falsifiables).
 *     Reste la seule chose qui compte : ces jetons valent-ils un dollar ? Un solde de 149 396
 *     unites d un jeton que personne n echange ne paie pas 200 $ de frais.
 *
 * ⛔ POURQUOI CETTE TROISIEME PASSE. La precedente interrogeait `/api/cle/<jeton>` : le noeud
 *   derriere a rendu « over rate limit » aux SEPT lectures, cinq fois de suite. La sonde a refuse
 *   de conclure — et c est ce refus qui a evite de publier « 7 sans marche, valeur 0 $ », qui aurait
 *   ete FAUX. On change d instrument au lieu d insister.
 *
 * ⇒ On lit `/api/trending`, qui recense deja les blocks A PAIRE VIVANTE a partir de donnees Base
 *   reelles. `canonical-helper-weaker-copy` : la liste existe, on ne la recalcule pas.
 *
 * ⛔⛔ CE QUE CETTE SONDE PEUT CONCLURE :
 *     · ABSENT de la liste ⇒ pas de marche suivi ⇒ ce solde ne se transforme pas en dollars.
 *     · PRESENT dans la liste ⇒ un marche existe. Valeur toujours INCONNUE : la profondeur n est
 *       pas lue, et vendre 149 396 unites dans une pool fine ne rend pas 149 396 fois le prix.
 *   ⛔ Et si `fenetresRatees` n est pas nul, la liste elle-meme est incomplete : un « absent »
 *     devient alors « absent de ce que j ai pu lire », ce qui n est pas la meme affirmation.
 */
const API = process.argv[2] || 'https://tokenizedblock.space';

const DETENUS = [
  ['0xb2000000000000000000006d6f9102e9e4b221e0', 'OK', '149 396,3475'],
  ['0xb20000000000000000000071224edc6587e362d2', 'TUTU', '48 155,8314'],
  ['0xb200000000000000000000df3ffcd9be89b3843c', '(sans symbole)', '1 981,2614'],
  ['0xb20000000000000000000024c30d3fcb7931272e', 'TBLOCK', '98,5323'],
  ['0xb200000000000000000000e63ffc3f40bf92a042', 'BASED', '1 000 000 000 — supply ENTIERE'],
  ['0x5354057f7fdaa8d9f6b894f2b44d187273993b06', '$JEANPHIL', '10'],
  ['0xb2000000000000000000004ff41cbd5ef8e49f14', 'RNG', '1 986,6177'],
];

let t;
try { t = await (await fetch(API + '/api/trending', { cache: 'no-store' })).json(); }
catch (e) { console.log('⛔ /api/trending illisible (' + String(e.message).slice(0, 50) + ') — RIEN conclu.'); process.exitCode = 1; }

if (t) {
  /* ⛔ On cherche les adresses PARTOUT dans la reponse plutot que de parier sur un nom de champ :
   *   une cle renommee ferait rendre « aucun marche » a une lecture pourtant reussie. */
  const brut = JSON.stringify(t).toLowerCase();
  const avecPaire = Number(t.blocksAvecPaire);
  const ratees = Number(t.fenetresRatees);

  console.log('═══ LES JETONS DE a6cf ONT-ILS UN MARCHE SUIVI ? ═══\n');
  console.log('liste lue : ' + (t.blocksSuivis ?? '?') + ' blocks suivis · '
    + (Number.isFinite(avecPaire) ? avecPaire : '?') + ' avec une paire vivante'
    + ' · volume 24 h ' + (t.volume24hUsd ?? '?'));
  if (Number.isFinite(ratees) && ratees > 0) {
    console.log('⛔ ' + ratees + ' fenetre(s) RATEE(S) dans ce scan : la liste est INCOMPLETE.');
    console.log('   Un « absent » ci-dessous veut donc dire « absent de ce que le scan a pu lire ».');
  } else {
    console.log('✅ 0 fenetre ratee : la liste est complete sur sa periode.');
  }
  console.log('');

  let presents = 0, absents = 0;
  for (const [jeton, sym, solde] of DETENUS) {
    const la = brut.includes(jeton.toLowerCase());
    if (la) { presents++; console.log('◐ ' + sym.padEnd(15) + ' PRESENT dans la liste  · solde ' + solde);
      console.log('     ⚠️ un marche existe ; la PROFONDEUR n est pas lue, donc la valeur reste inconnue.'); }
    else { absents++; console.log('⛔ ' + sym.padEnd(15) + ' ABSENT  · solde ' + solde);
      console.log('     ⇒ aucun marche suivi : ce solde ne devient pas des dollars.'); }
  }

  console.log('\n── verdict ──');
  console.log(presents + ' jeton(s) avec un marche suivi · ' + absents + ' sans');
  if (absents === DETENUS.length) {
    console.log('\n⛔⛔ AUCUN des jetons encaisses par a6cf n a de marche suivi.');
    console.log('   ⇒ La part « jetons » du revenu ne paie RIEN aujourd hui. Phil a donc raison sur');
    console.log('     la CONCLUSION (presenter l ETH) — mais pas pour la raison donnee : ce n est pas');
    console.log('     que tout arrive en ETH, c est que ce qui arrive en jetons est invendable.');
  } else if (presents) {
    console.log('\n⚠️ ' + presents + ' jeton(s) ont un marche. La part « jetons » du revenu n est donc PAS');
    console.log('   nulle par construction — mais aucun montant n a ete mesure, et je n en avancerai pas.');
  }
  console.log('\n⛔ CE QUE CETTE SONDE NE PEUT PAS FAIRE : donner un prix. Aucune vente n a ete simulee.');
  console.log('   Le seul resultat solide est la SEPARATION entre « vendable en principe » et « non ».');
}
