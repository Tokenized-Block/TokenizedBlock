/* test-espacements-cl.mjs — UNE LISTE ECRITE A LA MAIN NE DOIT PLUS DECIDER QUELLES POOLS EXISTENT.
 *
 * ⛔⛔⛔ CE QUE CE FICHIER GARDE, ET IL A COUTE DES JOURS. `ESPACEMENTS_ALTERNATIVE` valait
 *      `[1, 10, 50, 100, 200, 2000]` alors que la factory declare NEUF espacements. Les trois
 *      absents — **80, 150, 500** — cachaient 9 des 13 pools de blocks cotes en action, dont
 *      TE/MUc a tickSpacing 80 et 107 505 $ de volume 24 h. L ecran disait « pas de pool » : un
 *      refus qui ressemblait a un fait de la chaine et qui etait un fait sur NOTRE liste.
 *
 * ⛔ LA GARDE CENTRALE : la retombee doit CONTENIR tout ce que la factory a declare le jour de la
 *   mesure. Une retombee plus courte que la verite reproduit le bug exactement.
 *
 * ⚠️ BORNE : ce fichier est PUR. Il ne prouve pas que la factory reponde aujourd hui, ni qu une
 *    pool existe a un espacement donne, ni qu elle porte de la liquidite.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { sansCommentaires } from './outils-test.js';
import { decodeEspacements, lireEspacements, phraseEspacements,
  ESPACEMENTS_RETOMBEE, ETATS_ESPACEMENTS, SELECTEUR_TICKSPACINGS } from './espacements-cl.js';

let n = 0;
const cas = (t, f) => { n += 1; try { f(); } catch (e) { console.error('✗ ' + t); throw e; } };

const mot = (v) => BigInt(v).toString(16).padStart(64, '0');
const tableau = (vals) => '0x' + mot(32) + mot(vals.length) + vals.map((v) => mot(v)).join('');

/* ⛔ LA REPONSE REELLE, RECOPIEE D UN `eth_call` DU 2026-09-30 sur la factory Aerodrome CL
 *   `0xf8f2eb4940cfe7d13603dddd87f123820fc061ef`. 9 valeurs, dans l ordre des activations. */
const REPONSE_REELLE = tableau([1, 50, 100, 200, 2000, 500, 10, 80, 150]);

cas('⛔⛔⛔ LA REPONSE REELLE DE LA FACTORY DONNE LES NEUF, DONT LES TROIS QUI MANQUAIENT', () => {
  const r = decodeEspacements(REPONSE_REELLE);
  assert.equal(r.etat, 'OK', r.pourquoi);
  assert.deepEqual(r.espacements, [1, 10, 50, 80, 100, 150, 200, 500, 2000],
    'le decodage ne rend pas les neuf espacements tries');
  /* ⛔⛔ LES TROIS COUPABLES, NOMMES : sans eux, TE/MUc (107 505 $/24 h) reste introuvable. */
  for (const manquait of [80, 150, 500]) {
    assert.ok(r.espacements.includes(manquait),
      'l espacement ' + manquait + ' manque : c est exactement le bug qu on repare');
  }
});

cas('⛔⛔⛔ LA RETOMBEE CONTIENT TOUT CE QUE LA FACTORY A DECLARE', () => {
  /* ⛔⛔ SI CETTE ASSERTION TOMBE, LA RETOMBEE REPRODUIT LE BUG. Une retombee plus courte que la
   *     verite est pire qu une absence de retombee : elle rend un refus credible. */
  const vrais = decodeEspacements(REPONSE_REELLE).espacements;
  for (const v of vrais) {
    assert.ok(ESPACEMENTS_RETOMBEE.includes(v),
      'la retombee ne contient pas ' + v + ' : elle est plus pauvre que la factory');
  }
  /* ⚠️ ET PAS D INVENTION DANS L AUTRE SENS : un espacement que la factory n autorise pas ferait
   *    sonder des pools qui ne peuvent pas exister — du bruit, pas une erreur d argent. */
  for (const v of ESPACEMENTS_RETOMBEE) {
    assert.ok(vrais.includes(v), 'la retombee porte ' + v + ', que la factory n a pas declare');
  }
});

cas('⛔⛔ UNE REPONSE TRONQUEE EST REFUSEE, PAS RACCOURCIE', () => {
  /* ⛔⛔ LE CAS LE PLUS DANGEREUX DE TOUS : une reponse coupee en transport declare 9 et n en porte
   *     que 5. Rendre les 5 serait le bug d origine, en plus sournois — une liste partielle qui a
   *     l air d une lecture reussie. */
  const complet = tableau([1, 50, 100, 200, 2000, 500, 10, 80, 150]);
  const coupe = complet.slice(0, complet.length - 4 * 64);
  const r = decodeEspacements(coupe);
  assert.equal(r.etat, 'NON_MESURE', 'une reponse tronquee a ete acceptee');
  assert.deepEqual(r.espacements, [], 'une liste partielle a ete rendue');
  assert.match(r.pourquoi, /length/i);
});

cas('⛔⛔ UN ESPACEMENT NEGATIF EST REFUSE', () => {
  /* ⛔ int24 est SIGNE. Un mot plein de `f` passerait par `BigInt` en un nombre enorme, accepte en
   *   silence, et encode tronque sur trois octets : la pool serait introuvable sans aucune erreur. */
  const negatif = '0x' + mot(32) + mot(1) + 'f'.repeat(64);
  const r = decodeEspacements(negatif);
  assert.equal(r.etat, 'NON_MESURE');
  assert.match(r.pourquoi, /negative/i);
});

cas('⛔ UN ESPACEMENT HORS DES TROIS OCTETS DU CHEMIN EST REFUSE', () => {
  /* ⛔ Le chemin de swap encode le tickSpacing sur TROIS octets. Au-dela, il serait tronque. */
  const trop = '0x' + mot(32) + mot(1) + mot(1 << 23);
  const r = decodeEspacements(trop);
  assert.equal(r.etat, 'NON_MESURE');
  assert.match(r.pourquoi, /int24/i);
  assert.equal(decodeEspacements('0x' + mot(32) + mot(1) + mot(0)).etat, 'NON_MESURE', 'zero accepte');
});

cas('⛔⛔ UN OFFSET INATTENDU EST REFUSE — on decoderait autre chose que ce qu on croit', () => {
  const r = decodeEspacements('0x' + mot(64) + mot(1) + mot(10));
  assert.equal(r.etat, 'NON_MESURE');
  assert.match(r.pourquoi, /offset/i);
});

cas('⛔⛔ UNE LISTE VIDE EST « NON MESURE », JAMAIS « la factory n autorise rien »', () => {
  /* ⛔⛔ Zero espacement ne PEUT PAS etre vrai : la factory a des pools. Rendre `OK` avec une liste
   *     vide ferait sonder ZERO espacement et conclure « aucune pool n existe » partout. */
  const r = decodeEspacements('0x' + mot(32) + mot(0));
  assert.equal(r.etat, 'NON_MESURE');
  assert.deepEqual(r.espacements, []);
});

cas('⛔ UNE REPONSE ILLISIBLE REND NON_MESURE, ET LES ETATS SONT FERMES', () => {
  for (const rien of ['0x', '', null, undefined, 'pas du hex', '0xzz', '0x1234', 42, {}]) {
    const r = decodeEspacements(rien);
    assert.equal(r.etat, 'NON_MESURE', 'entree ' + String(rien) + ' -> ' + r.etat);
    assert.ok(ETATS_ESPACEMENTS.includes(r.etat));
  }
});

cas('⛔⛔⛔ LA RETOMBEE NE SE DEGUISE JAMAIS EN LECTURE', async () => {
  /* ⛔⛔ LE MOTIF N°1 DE CE DEPOT : un retour neutre qui avale une panne. Si la retombee rendait
   *     `OK`, personne ne saurait que la factory est muette — et le jour ou elle activera un
   *     dixieme espacement, on serait revenus au bug d origine SANS SIGNAL. */
  const muette = await lireEspacements(async () => null, '0xf8f2eb4940cfe7d13603dddd87f123820fc061ef');
  assert.equal(muette.etat, 'RETOMBEE', 'une factory muette a rendu ' + muette.etat);
  assert.deepEqual(muette.espacements, [...ESPACEMENTS_RETOMBEE]);
  assert.match(muette.pourquoi, /factory read failed/i, 'la raison de l echec est perdue');
  /* et une factory qui LEVE ne fait pas mourir l appelant */
  const casse = await lireEspacements(async () => { throw new Error('reseau'); }, '0xf8f2');
  assert.equal(casse.etat, 'RETOMBEE');
  /* ⛔ ET LE CHEMIN HEUREUX REND BIEN `OK`, sinon la garde ci-dessus serait vraie par accident */
  let vuTo = null; let vuData = null;
  const vraie = await lireEspacements(async (to, data) => { vuTo = to; vuData = data; return REPONSE_REELLE; }, '0xLAFACTORY');
  assert.equal(vraie.etat, 'OK', 'une factory qui repond ne rend pas OK');
  assert.equal(vraie.espacements.length, 9);
  assert.equal(vuTo, '0xLAFACTORY', 'la factory passee n est pas celle appelee');
  assert.equal(vuData, SELECTEUR_TICKSPACINGS, 'le selecteur appele n est pas tickSpacings()');
});

cas('⛔ LA PHRASE EST VIDE SUR OK, ET PARLE SUR LES DEUX AUTRES', () => {
  /* ⛔ Un avertissement permanent devient invisible : il ne s affiche que quand il dit quelque chose. */
  assert.equal(phraseEspacements({ etat: 'OK', espacements: [1] }), '');
  assert.match(phraseEspacements({ etat: 'RETOMBEE', espacements: [], pourquoi: 'muette' }), /snapshot/i);
  assert.match(phraseEspacements({ etat: 'NON_MESURE', pourquoi: 'x' }), /not read/i);
  assert.equal(phraseEspacements(null), 'tick spacings not read — unknown');
});

/* ══ LE CABLAGE : la liste ecrite a la main ne doit plus decider ══════════════════════════════ */
cas('⛔⛔⛔ `serveur-web.js` NE SONDE PLUS UNE LISTE PLUS PAUVRE QUE LA FACTORY', () => {
  /* ⛔⛔ C EST LA SEULE ASSERTION QUI TOUCHE LE BUG REEL. Le module peut etre parfait et le serveur
   *     continuer a sonder six espacements : « la presence d un nom n est pas son usage ». */
  const src = sansCommentaires(readFileSync(new URL('./serveur-web.js', import.meta.url), 'utf8'), { minRetire: 3000 });
  const m = /ESPACEMENTS_ALTERNATIVE\s*=\s*Object\.freeze\(\[([^\]]*)\]\)/.exec(src);
  assert.ok(m, 'ESPACEMENTS_ALTERNATIVE est introuvable dans le code nu de serveur-web.js');
  const vrais = decodeEspacements(REPONSE_REELLE).espacements;
  const corps = m[1].trim();
  /* ⛔⛔ DEUX FORMES SONT ACCEPTABLES, ET UNE SEULE NE L EST PAS. Soit la liste DERIVE du module
   *     (`...ESPACEMENTS_RETOMBEE`), dont un autre cas de ce fichier prouve qu il porte les neuf ;
   *     soit elle est litterale, et alors elle doit les contenir tous. Ce qui est refuse, c est
   *     une liste litterale INCOMPLETE — l etat exact du bug.
   *   ⛔ ET LA DERIVATION NE SUFFIT PAS SEULE : une liste derivee mais jamais confrontee a la
   *     factory revivrait le meme bug le jour d une dixieme activation. On exige donc AUSSI que la
   *     boucle sonde ce que la factory rend. */
  if (/\.\.\.\s*ESPACEMENTS_RETOMBEE/.test(corps)) {
    assert.match(src, /for \(const ts of aSonder\)/,
      'la liste derive du module mais la boucle ne sonde pas `aSonder` : elle resterait figee sur '
      + 'la photo, et une dixieme activation de la factory rejouerait le bug');
    assert.match(src, /espacementsASonder\(\)/, 'la lecture de la factory n est jamais appelee');
    assert.match(src, /lireEspacements\(/, '`lireEspacements` n est pas cable : la factory n est pas lue');
    /* ⛔ ET LE SEUIL DE REFUS DOIT SUIVRE LA LISTE SONDEE : reste a six avec neuf espacements, trois
     *   refus de trop suffisaient a graver un faux `absente` — pour toujours, ce cache n expire pas. */
    assert.match(src, /refus >= aSonder\.length/,
      'le seuil de refus est reste sur une constante : il gravera un faux ABSENTE');
  } else {
    const codes = corps.split(',').map((s) => Number(s.trim())).filter((v) => Number.isFinite(v));
    for (const v of vrais) {
      assert.ok(codes.includes(v),
        'le serveur ne sonde pas l espacement ' + v + ' que la factory declare : les pools qui y '
        + 'vivent restent introuvables, et l ecran dit « pas de pool » a tort (c etait le cas de '
        + 'TE/MUc a ts=80, 107 505 $ de volume 24 h)');
    }
  }
});

cas('⛔⛔ UNE POOL A `liquidity = 0` NE DOIT PLUS ETRE GRAVEE, ET LE TEMOIN EST REEL', () => {
  /* ⛔⛔ SUR USDC/PLTRc, LA POOL A tickSpacing 1 EXISTE ET PORTE `liquidity = 0` (mesure du
   *     2026-09-30). Le balayage retenait la PREMIERE adresse non nulle : il gravait donc une pool
   *     MORTE dans un cache qui n expire JAMAIS, et le glissement calcule dessus divisait par zero.
   *   ⛔ Un NaN traverse toutes les bornes : il aurait fait passer une pool vide pour une route
   *     acceptable. Exister n est pas etre echangeable. */
  const src = sansCommentaires(readFileSync(new URL('./serveur-web.js', import.meta.url), 'utf8'), { minRetire: 3000 });
  assert.match(src, /0x1a686502/,
    'le balayage ne lit pas `liquidity()` : il peut graver une pool vide');
  assert.match(src, /if \(liq === 0n\) continue;/,
    'une liquidite nulle n ecarte pas la pool');
  assert.match(src, /if \(liq === null\) \{ refus \+= 1; continue; \}/,
    'une liquidite NON LUE est traitee comme nulle : « je n ai pas su lire » deviendrait « c est vide »');
});

console.log('✓ test-espacements-cl : ' + n + ' cas');
console.log('   Les NEUF espacements de la factory sont lus ; 80, 150 et 500 manquaient et cachaient');
console.log('   9 des 13 pools de blocks cotes en action. La retombee est nommee, jamais deguisee en OK.');
console.log('   ⚠️ NE PROUVE PAS qu une pool existe a un espacement donne, ni qu elle soit echangeable.');
