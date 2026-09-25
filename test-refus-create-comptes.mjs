/* test-refus-create-comptes.mjs — UN REFUS QU ON S INFLIGE DOIT SE COMPTER.
 *
 * ⛔⛔ CE QUI A ETE MESURE, entonnoir de production le 2026-09-25 (persistant depuis le 09-19) :
 *     `create_clic` = 45 · `cree` = 6 · `cree_echec` = 8.
 *     TRENTE-UN clics n ont laisse AUCUNE trace — ni succes, ni echec. Et la cause n est pas une
 *     panne : une partie de ces sorties sont des refus que NOUS produisons nous-memes.
 *     Un refus qu on s inflige sans le compter ressemble a « personne n a essaye » alors qu il
 *     veut dire « on a dit non » — et ces deux-la ne se reparent pas de la meme facon.
 *
 * ⛔⛔ ET LA SONDE M A CORRIGE. J avais annonce TROIS refus muets — ceux que j avais lus. Lancee sur
 *     la version d avant, elle en a trouve DIX-HUIT — dont deux comptees en amont, donc SEIZE
 *     reellement muets. Parmi eux : solde insuffisant (deux fois, deux
 *     branches jumelles), prix ETH/USD illisible, solde illisible, chaine illisible, les 0,001 ETH
 *     non confirmes, le paiement non prouve, l adresse introuvable, la requete non construite.
 *     Autrement dit : j allais instrumenter un sixieme du trou en croyant l avoir bouche. Compter
 *     a la main ce qu une sonde peut compter est exactement l erreur que la sonde existe pour eviter.
 *
 * ⛔ CETTE GARDE S ACCUSE ELLE-MEME D ABORD (`probe-must-accuse-itself-first`). Lancee sur la
 *   version de app.html qui precede le correctif, elle DOIT trouver des refus muets. Si elle n en
 *   trouve aucun, c est elle qui est cassee, pas le code. Le mode s active ainsi :
 *       node test-refus-create-comptes.mjs --temoin <fichier-html>
 *   et il exige au moins un refus muet — un temoin negatif qui ne trouve rien ne prouve rien.
 *
 * ⛔ ELLE A AUSSI ACCUSE A TORT, et c est pour ca que `COMPTES_AILLEURS` existe : deux refus sont
 *   comptes par la fonction qu ils appellent, ce qu aucune lecture du seul corps de `creerBlock` ne
 *   peut voir. `never-accuse-on-own-incompleteness` — une garde qui liste des faux positifs finit
 *   par etre ignoree comme celle qui crie au loup.
 *
 * ⛔ CE QUE CE TEST NE PROUVE PAS : que les compteurs comptent la bonne chose, ni que les 31 clics
 *   perdus sont recuperes. Ils n ont jamais ete captures ; rien ne les rattrape. La mesure commence
 *   au deploiement, et il faudra de vrais visiteurs pour la lire.
 */
import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';

const temoin = process.argv[2] === '--temoin' ? process.argv[3] : null;
const html = readFileSync(temoin ? temoin : new URL('./app.html', import.meta.url), 'utf8');

/** Le corps de `creerBlock`, borne par equilibrage d accolades — pas par un nombre de lignes, qui
 *  pourrit des que la fonction bouge (`handoff-figures-rot`). */
function corpsDe(nom) {
  const d = html.indexOf('async function ' + nom + '(');
  assert.ok(d > 0, nom + ' est introuvable : ce test ne garde plus rien');
  let prof = 0, texte = null;
  for (let i = html.indexOf('{', d); i < html.length; i++) {
    const c = html[i];
    if (texte) { if (c === texte && html[i - 1] !== '\\') texte = null; continue; }
    if (c === '"' || c === "'" || c === '`') { texte = c; continue; }
    if (c === '{') prof++;
    else if (c === '}' && !--prof) return html.slice(d, i + 1);
  }
  assert.fail('les accolades de ' + nom + ' ne s equilibrent pas');
}

/* On s arrete a `etape('cree')` : apres, la creation est LANCEE et les echecs sont deja instrumentes
 * par `cree_echec` + les categories de `causes-echec.js`. Ce test ne regarde que l AVANT. */
const corps = corpsDe('creerBlock');
const finAvant = corps.indexOf("etape('cree')");
assert.ok(finAvant > 0, "etape('cree') est introuvable dans creerBlock : borne perdue");
const avant = corps.slice(0, finAvant);

/** Les refus muets : un `return` precede, dans la meme fenetre, d un message affiche a l ecran et
 *  d AUCUN appel a `etape(`.
 *  ⛔ La fenetre est prise en arriere depuis le `return` et bornee au `return` precedent : sans
 *    cette borne, l instrumentation d un refus couvrirait le refus voisin et on declarerait
 *    compte quelque chose qui ne l est pas (`convergence-on-one-column-proves-one-column`). */
/* ⛔⛔ COMPTES EN AMONT, PAS MUETS — et cette liste existe parce que ma sonde a d abord ACCUSE A
 *     TORT. `never-accuse-on-own-incompleteness` : un refus qui delegue a une fonction qui compte
 *     deja n est pas un refus perdu, et aucune lecture du seul corps de `creerBlock` ne peut le
 *     voir. Chaque entree nomme le compteur qui la couvre et l endroit ou il vit — verifie a la
 *     main, pas suppose. Si l un de ces compteurs disparaissait, les assertions du bas le diraient. */
/* ⛔ HUIT NOMS, ENSEMBLE CLOS, groupes par REPARATION et non par message : quatre familles pour les
 *   refus precoces, quatre pour ce qui casse en route. Un nom par message aurait une cardinalite
 *   libre, et le serveur jette en silence ce qu il ne connait pas. */
const NOMS = ['cree_refus_forme', 'cree_refus_gratuit', 'cree_refus_a_lancer', 'cree_refus_encours',
  'cree_refus_solde', 'cree_refus_lecture', 'cree_refus_frais', 'cree_refus_preparation'];

const COMPTES_AILLEURS = [
  { motif: 'wallet did not connect',
    par: ['wallet_connect_refus', 'wallet_no_provider'],
    ou: 'la fonction de connexion du wallet — elle compte AVANT de rendre la main a creerBlock' },
  { motif: 'preflightInstantBirthEthFixe',
    par: ['ib_preflight_fail', 'ib_balance_short'],
    ou: 'preflightInstantBirthEthFixe, qui compte son propre refus et le motif du manque' },
];

function refusMuets(src) {
  const muets = [];
  let precedent = 0;
  for (const m of src.matchAll(/\breturn\s*;/g)) {
    const debut = Math.max(precedent, m.index - 700);
    const fenetre = src.slice(debut, m.index);
    precedent = m.index + m[0].length;
    if (!/\.textContent\s*=/.test(fenetre)) continue; /* sortie defensive, pas un refus annonce */
    if (/\betape\(/.test(fenetre)) continue;          /* refus annonce ET compte sur place */
    if (COMPTES_AILLEURS.some((x) => fenetre.includes(x.motif))) continue;
    muets.push(fenetre.replace(/\s+/g, ' ').slice(-110));
  }
  return muets;
}

const muets = refusMuets(avant);

if (temoin) {
  /* ⛔⛔ LE TEMOIN NEGATIF. Une garde qui ne trouve rien sur le code d AVANT ne garde rien du tout :
   *     elle passerait aussi bien sur un fichier vide. */
  assert.ok(muets.length > 0,
    'TEMOIN INUTILE : aucun refus muet trouve dans ' + temoin + ' — la sonde ne detecte rien, '
    + 'c est elle qui est cassee');
  console.log('ok temoin — ' + muets.length + ' refus muet(s) detecte(s) dans ' + temoin + ' :');
  for (const m of muets) console.log('   · …' + m);
  console.log('⇒ la sonde voit bien ce qu elle doit voir.');
} else {
  let n = 0;
  const v = (nom, fn) => { fn(); n++; };

  v('⛔⛔ aucun refus annonce a l ecran ne sort sans etre compte', () => {
    assert.deepEqual(muets, [],
      'refus annonce mais NON compte dans creerBlock — il ressemblera a « personne n a essaye » :\n'
      + muets.map((m) => '   · …' + m).join('\n'));
  });

  v('⛔⛔ les refus « comptes ailleurs » le sont VRAIMENT', () => {
    /* ⛔⛔ SANS CE CAS, la liste d exemption serait un trou : il suffirait d y ecrire un motif pour
     *     faire taire la garde. On exige que chaque compteur invoque existe reellement dans l app —
     *     une exemption doit prouver sa couverture, pas l affirmer.
     *   ⛔ Et le compteur doit vivre HORS de creerBlock : s il y etait, la fenetre l aurait vu et
     *     l exemption serait inutile — signe qu elle est perimee. */
    for (const x of COMPTES_AILLEURS) {
      assert.ok(avant.includes(x.motif),
        'exemption perimee : « ' + x.motif + ' » n existe plus dans creerBlock — la retirer');
      for (const c of x.par) {
        assert.ok(html.includes("etape('" + c + "')"),
          'exemption invalide : le compteur ' + c + ' (' + x.ou + ') n existe plus, donc « '
          + x.motif + ' » est redevenu un refus MUET');
        assert.ok(!corps.includes("etape('" + c + "')"),
          'le compteur ' + c + ' vit maintenant DANS creerBlock : l exemption ne sert plus a rien');
      }
    }
  });

  v('les quatre noms de refus sont bien ceux du prefixe convenu', () => {
    /* ⛔ `cree_refus_*` et `cree_ko_*` ne disent pas la meme chose : refuser avant d essayer et
     *   echouer en essayant ne se reparent pas pareil. Un nom qui melange les deux rend le tableau
     *   de bord illisible au moment ou on en a besoin. */
    for (const nom of NOMS) {
      assert.ok(corps.includes("etape('" + nom + "')"), 'refus non instrumente : ' + nom);
    }
  });

  v('⛔ un double-clic n est pas compte comme un refus de formulaire', () => {
    /* ⛔ `creationEnCours` veut dire qu une creation est EN TRAIN de reussir. La confondre avec un
     *   refus gonflerait le compteur des refus avec des succes — et c est le genre d erreur qui
     *   envoie reparer le mauvais ecran. */
    const g = /if \(creationEnCours\) \{[^}]*etape\('cree_refus_encours'\)/.test(corps);
    assert.ok(g, 'le garde-fou du double-clic ne compte pas son propre nom');
  });

  v('⛔ aucun compteur ne peut faire tomber une creation', () => {
    /* ⛔⛔ Un compteur de mesure qui jette casserait la fonction qu il observe — on aurait paye une
     *     creation pour une statistique. Chaque appel ajoute est en try/catch, comme les autres. */
    for (const m of corps.matchAll(/etape\('cree_refus_[a-z_]+'\)/g)) {
      const autour = corps.slice(Math.max(0, m.index - 60), m.index + m[0].length + 30);
      assert.match(autour, /try \{[^}]*etape\('cree_refus_[a-z_]+'\);?\s*\} catch/,
        'compteur de refus hors try/catch : ' + m[0]);
    }
  });

  v('⛔ la liste blanche du serveur les connait — sinon ils sont jetes sans erreur', () => {
    /* ⛔⛔ Le defaut du 2026-09-23 : 34 noms sur 48 rejetes EN SILENCE par `/api/etape`, qui rend 204
     *     dans les deux cas. `test-etapes-comptees.mjs` garde la parite globale ; ici on exige
     *     nommement ces quatre-la, pour que le message d echec dise quoi faire. */
    const srv = readFileSync(new URL('./serveur-web.js', import.meta.url), 'utf8');
    for (const nom of NOMS) {
      assert.ok(srv.includes("'" + nom + "'"),
        nom + ' manque dans ETAPES_ENTONNOIR : le serveur le jettera sans rien dire');
    }
  });

  assert.equal(n, 6, 'compte de cas inattendu : ' + n);
  /* 18 correspondances brutes sur la version d avant, moins les 2 comptees en amont = 16 refus
   * reellement muets. Le chiffre exact compte : c est celui qu on relira. */
  console.log('ok refus-create-comptes — ' + n + ' cas : 0 refus muet avant `cree` (16 avant), '
    + NOMS.length + ' noms');
  console.log('   cables, chacun en try/catch et present dans la liste blanche du serveur.');
  console.log('⚠️ NE PROUVE PAS que les compteurs comptent juste, ni que les 31 clics perdus');
  console.log('   reviennent : ils n ont jamais ete captures. La mesure commence au deploiement.');
}
