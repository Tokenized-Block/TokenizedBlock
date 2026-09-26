/* test-pool-permanente-ne-paie-rien.mjs — CE QUE LA POOL PERMANENTE COUTE, FIGE ET NOMME.
 *
 * ⛔⛔ CE TEST NE DIT PAS QUE LA REGLE EST MAUVAISE. Il fige une decision de PHIL (2026-09-13,
 *     `DECISIONS-regles-du-jeu`) et ecrit a cote ce qu elle coute, pour que personne ne la change
 *     sans voir l arbitrage — ni ne la garde sans le voir non plus.
 *
 * LA REGLE : la position de liquidite est frappee au nom de l ADRESSE MORTE. Personne — ni le
 * createur, ni nous — ne peut jamais retirer la liquidite. La pool est permanente, pour de vrai.
 *
 * ⛔⛔ CE QU ELLE COUTE, ET C EST MESURE : `onlyIfApproved` du PositionManager v4 garde a la fois le
 *     RETRAIT et la COLLECTE. Une position possedee par l adresse morte ne peut donc jamais
 *     `collect()` ses frais. D ou `FEE_POOL = 0` : on ne fait pas payer un frais que personne ne
 *     touchera. Consequence : NOS POOLS NE RAPPORTENT RIEN PAR CONSTRUCTION, et le seul revenu
 *     possible est le frais du hook — qui n existe que si le createur choisit notre hook.
 *
 * ⛔ MESURE DU 2026-09-26 QUI DONNE SON PRIX A CETTE LIGNE (24 h, 44 fenetres sur 44, 0 ratee) :
 *     685 pools B20 ouvertes sur Base · 0 sur notre hook · 14 378 echanges B20 · 0 dans nos pools.
 *     558 transactions de creation en 44 h, 0 par notre CreateRouter paye.
 *     a6cf : 0,002293010 ETH de solde, et 0 de ses 7 jetons encaisses n a de marche suivi.
 *
 * ⚠️ LE CONCURRENT MESURE (thestonks.exchange, source verifiee Sourcify + lecture on-chain) FAIT
 *   L INVERSE SUR CE SEUL POINT : il verrouille le NFT dans UN CONTRAT QU IL CONTROLE, jamais a
 *   l adresse morte. `decreaseLiquidity` n est jamais appele — donc la liquidite est permanente de
 *   la meme facon — mais `collect()` reste possible, et c est TOUT son revenu (1 % de fee tier,
 *   split 0,70 % createur / 0,300 % plateforme, verifie a 29,99-30,00 % sur de vrais events).
 *   ⇒ VERROUILLER LE NFT N EST PAS VERROUILLER LES FRAIS. C est la seule difference structurelle.
 *
 * ⛔ CE TEST NE TRANCHE PAS. Changer le proprietaire de la position modifie une REGLE PUBLIEE
 *   (« personne ne peut jamais y toucher » deviendrait « personne ne peut retirer, mais nous
 *   collectons »). C est une decision produit, et elle appartient a Phil.
 */
import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';

const depouiller = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:'"\w])\/\/[^\n]*/g, '$1 ');
const src = readFileSync(new URL('./lancer-pool.js', import.meta.url), 'utf8');
const nu = depouiller(src);

let n = 0;
const v = (nom, fn) => { fn(); n++; };

v('⛔ la pool est ouverte a frais ZERO, et c est une consequence, pas un oubli', () => {
  assert.ok(/export const FEE_POOL = 0;/.test(nu),
    'FEE_POOL n est plus 0 : si la position reste a l adresse morte, ce frais serait preleve sur les '
    + 'acheteurs sans que PERSONNE ne puisse jamais le collecter — de l argent brule.');
  assert.ok(/fee: FEE_POOL/.test(nu),
    'la cle de pool n utilise plus FEE_POOL : le taux reel pourrait diverger de la constante lue ici');
});

v('⛔⛔ la position appartient a l adresse morte — la liquidite est permanente', () => {
  const i = nu.indexOf('encodeMintPosition({');
  assert.ok(i > 0, 'le mint de position est introuvable');
  const bloc = nu.slice(i, i + 420);
  assert.ok(/proprietaire/.test(bloc),
    'le proprietaire de la position n est plus nomme explicitement au mint : le defaut serait le '
    + 'compte du createur, qui POURRAIT retirer la liquidite — la promesse « permanente » tomberait');
  /* ⛔⛔ MA PREMIERE VERSION CHERCHAIT `MORTE`, UN NOM LU DANS UN COMMENTAIRE. La constante s appelle
   *     `PROPRIETAIRE_PERMANENT` ; `MORTE` n apparait que dans une phrase explicative — que mon
   *     propre depouillage retire. Le test etait donc ROUGE des le depart sur l arbre sain, et ce
   *     rouge a MASQUE le resultat de deux mutations (elles rapportaient toutes la meme erreur).
   *   ⇒ Un test qui echoue pour une mauvaise raison ne dit plus rien des bonnes.
   *   ⛔ ON ASSERTE SUR LE CODE, JAMAIS SUR UN NOM CITE DANS UNE PHRASE. */
  assert.ok(/export const PROPRIETAIRE_PERMANENT = '0x0{36}dEaD';/.test(nu),
    'la constante du proprietaire permanent a disparu, ou sa valeur a change : c est elle qui rend '
    + 'la liquidite irretirable, et une adresse recopiee a la main est le geste qui a deja coute cher ici');
});

v('⛔⛔ les deux moities de l arbitrage sont ECRITES, pas seulement la moitie flatteuse', () => {
  /* Une regle dont on ne lit que le benefice se garde par inertie. Le commentaire doit porter le
   * cout — sinon la prochaine lecture conclura que tout va bien. */
  assert.ok(/onlyIfApproved/.test(src),
    'le commentaire ne dit plus POURQUOI les frais sont a zero : sans `onlyIfApproved`, « frais 0 » '
    + 'se lit comme un choix commercial alors que c est une contrainte technique');
  assert.ok(/jamais retirer la liquidite/.test(src),
    'la promesse faite au visiteur n est plus ecrite a cote de son cout');
});

v('⛔ le frais de l ancien ecran reste lisible, pour que la divergence soit un FAIT', () => {
  /* ⛔ Deux ecrans ont applique deux taux. Garder l ancien en clair empeche de croire qu il n y a
   *   jamais eu qu une valeur — et un jour ou l autre quelqu un comparera. */
  assert.ok(/export const FEE_ANCIEN_ECRAN = 5000;/.test(nu),
    'la valeur de l ancien ecran a disparu : la divergence deviendrait invisible au lieu d etre prouvee');
});

assert.equal(n, 4, 'compte de cas inattendu : ' + n);
console.log('ok pool-permanente-ne-paie-rien — ' + n + ' cas.');
console.log('   La regle est figee AVEC son cout : position a l adresse morte -> collecte impossible');
console.log('   -> FEE_POOL = 0 -> nos pools ne rapportent rien par construction.');
console.log('⚠️ NE DIT PAS que la regle doit changer. Deplacer la position vers un contrat qu on');
console.log('   controle rendrait `collect()` possible sans rendre le RETRAIT possible — c est ce que');
console.log('   fait le concurrent mesure — mais ca modifie une regle PUBLIEE. Decision de Phil.');
