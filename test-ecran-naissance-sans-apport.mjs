/* test-ecran-naissance-sans-apport.mjs — L ECRAN DEMANDE-T-IL ENCORE UN APPORT ?
 *
 * ⛔⛔ UN MODULE QUI ACCEPTE LE ZERO NE SERT A RIEN SI L ECRAN CONTINUE D EXIGER UN SEED. C est la
 *     moitie qu on oublie : `planLancement` savait deja ouvrir une pool sans apport, et l interface
 *     calculait quand meme un seed par oracle et REFUSAIT la poussiere. Le chemin existait et
 *     personne ne pouvait l emprunter.
 *
 * ⛔ CE QUI L A DECIDE : 558 creations B20 en 44 h, ZERO par notre chemin paye. Le concurrent ouvre
 *   en 100 % coin sans apport. Nous demandions 0,0003 ETH de seed EN PLUS du frais de naissance.
 *
 * ⛔ ET LES TEXTES COMPTENT AUTANT QUE LE CALCUL. Une phrase qui annonce « puts 0 ETH into the
 *   pool » est vraie au chiffre et fausse au sens : le lecteur comprend qu on a rate quelque chose,
 *   pas qu on ne lui demande rien. Un refus qui nomme un « pool seed » abolie envoie chercher une
 *   somme qu on ne reclame pas.
 *
 * ⚠️ CE QUE CE TEST NE PROUVE PAS : qu une pool ainsi ouverte se comporte bien sur la chaine.
 *   Aucune transaction n a ete signee — le harnais l interdit.
 */
import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';

const brut = readFileSync(new URL('./app.html', import.meta.url), 'utf8');
/* ⛔ commentaires depouilles : ce fichier cite en clair les phrases qu il a retirees. */
const nu = brut.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/<!--[\s\S]*?-->/g, ' ');

let n = 0;
const v = (nom, fn) => { fn(); n++; };

v('⛔⛔ l ecran passe un seed NUL au plan de naissance', () => {
  const i = nu.indexOf('let quoteEthWei = null;');
  assert.ok(i > 0, 'le calcul du seed a disparu de l ecran');
  const bloc = nu.slice(i, i + 700);
  assert.ok(/quoteEthWei = 0n;/.test(bloc),
    'l ecran ne demande plus un seed nul : le createur devrait encore apporter de l ETH');
  /* ⛔ ET LES REFUS DE L ANCIEN MONDE SONT PARTIS AVEC. Les garder aurait laisse du code qui refuse
   *   au nom d une regle abolie — et un jour quelqu un aurait lu le refus comme la regle. */
  assert.ok(!/ETH seed is dust — need at least 0\.0003 ETH in the pool'/.test(bloc),
    'un refus de poussiere de seed survit dans l ecran, alors qu aucun seed n est demande');
  assert.ok(!/zero-ETH books refused/.test(nu),
    'l ecran refuse encore les « zero-ETH books » : c est exactement ce qu on vient d autoriser');
});

v('⛔⛔ la phrase n annonce plus un apport de zero', () => {
  /* Une phrase « puts 0 ETH » est vraie au chiffre et fausse au sens. */
  assert.ok(/You put NO ETH into the pool: it opens 100 % blocks/.test(nu),
    'la phrase du cas sans apport a disparu : l ecran afficherait « puts 0 ETH into the pool »');
  assert.ok(/plan\.p && plan\.p\.sansApport/.test(nu),
    'la phrase ne distingue plus les deux naissances : une seule des deux serait juste');
  /* ⛔ ET ELLE NE PROMET PAS LA GRATUITE : le frais et le micro-achat restent nommes. */
  assert.ok(/0\.001 ETH opening fee/.test(nu),
    'le frais de naissance n est plus nomme dans le cas sans apport : une depense tue est une '
    + 'mauvaise surprise au moment de signer');
  assert.ok(/A tiny first buy is added so indexers see a trade/.test(nu),
    'le micro-achat n est plus nomme : il coute des wei et il doit se voir');
});

v('⛔ le refus de solde nomme ce qui manque VRAIMENT', () => {
  const i = nu.indexOf('const sansApport = !!(plan.p && plan.p.sansApport);');
  assert.ok(i > 0, 'le refus de solde ne distingue plus le chemin sans apport');
  const bloc = nu.slice(i, i + 1200);
  assert.ok(/The pool itself costs you nothing\./.test(bloc),
    'le refus ne dit plus que la pool ne coute rien : le createur chercherait une somme qu on ne '
    + 'lui reclame pas et conclurait qu il n a pas assez');
  /* ⛔ ET L ANCIEN MESSAGE RESTE, pour le chemin a deux cotes qui existe toujours. */
  assert.ok(/Not enough ETH for open fee \+ pool seed \+ first micro-swap/.test(bloc),
    'le message du chemin a deux cotes a ete supprime : ce chemin existe encore dans le module');
});

v('⛔ la porte a deux cotes reste ouverte dans le module', () => {
  const lp = readFileSync(new URL('./lancer-pool.js', import.meta.url), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ');
  assert.ok(/if \(quoteEthWei === 0n\) \{/.test(lp),
    'le module ne distingue plus la naissance sans apport');
  assert.ok(/CREATE_FEE_WEI_FLOOR/.test(lp),
    'le plancher du chemin a deux cotes a disparu du module : on fermerait une porte au lieu d en '
    + 'ouvrir une');
});

assert.equal(n, 4, 'compte de cas inattendu : ' + n);
console.log('ok ecran-naissance-sans-apport — ' + n + ' cas.');
console.log('   L ecran passe un seed nul, la phrase dit « no ETH into the pool » sans promettre la');
console.log('   gratuite, et le refus de solde ne reclame plus un apport aboli.');
console.log('⚠️ NE PROUVE PAS qu une pool ainsi ouverte se comporte bien sur la chaine.');
