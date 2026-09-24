/* mesure-posts-graves.mjs — COMBIEN DE BLOCKS PORTENT VRAIMENT UN POST, ET LE SERVEUR LE REND-IL ?
 *
 * ⛔⛔ POURQUOI. Phil : « je vois pas le block associe au post sur X ». Une enquete a montre que le
 *     lien part BIEN on-chain, dans la meme transaction que le nom, le symbole et la face — donc la
 *     copy ne ment pas. Mais l affichage lit `faceConnue(adr)`, un cache de NAVIGATEUR, pendant
 *     qu il affirme « cannot be changed ». Une valeur ecrite sur la chaine, lue dans un cache.
 *
 * ⇒ AVANT DE CORRIGER, ON MESURE DEUX CHOSES DISTINCTES :
 *   1. combien de nos blocks portent un `tweet` dans leur face ON-CHAIN ;
 *   2. si `/api/face/<adr>` — qui lit la chaine — le RESSORT dans sa reponse.
 *   Si (1) vaut 0, il n y a rien a afficher et le defaut est ailleurs : corriger l affichage
 *   n aurait rien change et j aurais cru avoir repare quelque chose.
 *
 * ⛔ CETTE SONDE NE LIT QUE NOS BLOCKS (ceux que /api/nos-blocks connait). Un post grave sur le
 *    block de quelqu un d autre n est pas vu ici — ce n est pas « aucun post n existe ».
 */
const API = process.argv[2] || 'https://tokenizedblock.space';

let liste;
try {
  liste = await (await fetch(API + '/api/nos-blocks', { cache: 'no-store' })).json();
} catch (e) {
  console.log('⛔ /api/nos-blocks illisible (' + String(e.message).slice(0, 60) + ') — RIEN conclu.');
  process.exitCode = 1;
}

if (liste) {
  /* ⛔ On ne parie pas sur un nom de champ : on ramasse toutes les adresses de la reponse. Une cle
   *   renommee ferait rendre « 0 block » a une lecture pourtant reussie. */
  const adrs = [...new Set((JSON.stringify(liste).match(/0x[0-9a-fA-F]{40}/g) || [])
    .map((a) => a.toLowerCase()))];
  console.log('═══ POSTS GRAVES ═══');
  console.log(adrs.length + ' adresse(s) trouvee(s) dans /api/nos-blocks\n');

  let avecPost = 0, sansPost = 0, illisibles = 0;
  const champsVus = new Set();
  for (const a of adrs) {
    let j = null, dernier = '';
    for (let e = 0; e < 4; e++) {
      if (e) await new Promise((k) => setTimeout(k, 1800 * e));
      try {
        j = await (await fetch(API + '/api/face/' + a, { cache: 'no-store' })).json();
        dernier = JSON.stringify(j);
        if (!/rate limit/i.test(dernier)) break;
      } catch (err) { dernier = String(err.message).slice(0, 50); j = null; }
    }
    /* ⛔ TROIS ETATS : porte un post · n en porte pas · lecture ratee. Confondre les deux derniers
     *   ferait ecrire « aucun post » sur un noeud sature. */
    if (!j || /rate limit/i.test(dernier)) {
      illisibles++;
      console.log('⛔ ' + a + '  LECTURE ECHOUEE — rien conclu');
      continue;
    }
    const f = j.face || {};
    for (const k of Object.keys(f)) champsVus.add(k);
    const lien = typeof f.tweet === 'string' ? f.tweet : null;
    if (lien) {
      avecPost++;
      console.log('✅ ' + a + '  POST : ' + lien);
    } else {
      sansPost++;
      console.log('   ' + a + '  etat=' + j.etat + '  aucun champ tweet dans la reponse');
    }
  }

  console.log('\n── verdict ──');
  console.log(avecPost + ' avec un post · ' + sansPost + ' sans · ' + illisibles + ' illisible(s)');
  console.log('champs de face rendus par l API : ' + [...champsVus].sort().join(', '));
  /* ⛔⛔ LE POINT QUI DECIDE DU CORRECTIF. Si AUCUNE reponse ne contient jamais « tweet », deux
   *     explications restent ouvertes et elles appellent des correctifs OPPOSES : soit aucun de nos
   *     blocks n en porte, soit le serveur le retire de sa reponse. On ne tranche pas ici. */
  if (!champsVus.has('tweet')) {
    console.log('\n⚠️ AUCUNE reponse ne contient le champ « tweet ». DEUX explications possibles, et');
    console.log('   elles demandent des correctifs opposes :');
    console.log('   (a) aucun de ces blocks ne porte de post grave — alors l affichage n est pas en cause ;');
    console.log('   (b) /api/face le lit mais ne le ressort pas — alors c est la route qu il faut corriger.');
    console.log('   ⛔ Je ne tranche pas sans avoir vu un block qui EN PORTE un.');
  }
  console.log('\n⛔ CETTE SONDE NE VOIT QUE NOS BLOCKS. « 0 post » ici ne veut pas dire « 0 post ».');
  if (illisibles) console.log('⛔ ' + illisibles + ' lecture(s) ratee(s) : le compte est un PLANCHER.');
}
