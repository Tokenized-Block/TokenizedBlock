/* test-buy-tenable-seulement.mjs — « BUY » NE DOIT PAS PROMETTRE CE QUE L APP NE PEUT PAS TENIR.
 *
 * ⛔⛔ LE DEFAUT, MESURE EN PRODUCTION LE 2026-09-27. Le bouton s affichait des que DexScreener
 *     connaissait un marche, QUEL QUE SOIT LE DEX. Or le chemin in-app passe par
 *     `echangeAutorise`, qui exige `etatVie === 'LUE'` — NOTRE lecture Uniswap v4. Sur les 6 blocks
 *     dont la pool est Aerodrome (fork v3), elle ne peut pas aboutir.
 *     Parcours mesure sur MUc, 384 812 $ de volume / 24 h : clic sur « Buy » -> le profil s ouvre
 *     -> `#pEchange` reste MASQUE -> 80 tentatives a 500 ms -> au bout de 62 s l ecran propose de
 *     CREER UN AUTRE BLOCK pour 0,001 ETH.
 *     ⚠️ TEMOIN DE CONTROLE mesure le meme jour : LAYA (pool v4) ouvre `#pEchange` en 14 s. Le
 *     defaut est donc propre aux marches non-v4, pas general.
 *
 * ⛔⛔ ET LE PIEGE DE LA CORRECTION : masquer « Buy » sur toute lecture ratee RETIRERAIT
 *     l affordance a des blocks parfaitement echangeables, parce que le noeud public refuse ~35 %
 *     des appels. On ne masque donc que sur un FAIT (`NON_TROUVEE` = aucune pool v4), jamais sur
 *     `NON_LUE` (= on n a pas pu regarder). C est la meme distinction que `pool-cl.js`.
 *
 * ⚠️ CE QU IL NE PROUVE PAS : qu un achat aboutisse. Il prouve que l ecran ne propose plus un achat
 *   dont on a mesure qu il ne peut pas aboutir, et qu il ne le retire pas sur un simple hoquet.
 */
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
/* ⛔ LE MODULE EST IMPORTE, pas decrit : depuis le 2026-09-27 la garde delegue a `routage.js`, et
 *   verifier le cablage sans verifier le COMPORTEMENT laisserait passer un module permissif. */
import { verdictRoutage, phraseRoutage } from './routage.js';
/* ⛔ PORTABLE LF/CRLF (test-tests-portables.mjs) : comme `s.indexOf('\n…', de)`, mais le saut
 *   de ligne peut etre `\r\n` (checkout Windows). Rend la position du `\n`, comme indexOf, ou -1. */
const indexEol = (s, re, de = 0) => {
  const g = new RegExp(re.source, 'g'); g.lastIndex = de;
  const m = g.exec(s); return m ? m.index + m[0].indexOf('\n') : -1;
};

let n = 0;
const cas = (titre, f) => { n++; try { f(); } catch (e) { console.error('✗ ' + titre); throw e; } };
const app = readFileSync(new URL('./app.html', import.meta.url), 'utf8');
/* ⛔ commentaires depouilles ET concatenations recollees : sinon la sonde accuse sa propre
 *   documentation, ou ne voit pas une phrase coupee par des `' + '`. Les deux m ont deja eu. */
const nu = app.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ').replace(/'\s*\+\s*'/g, '');

/* ⛔⛔⛔ CETTE FONCTION EXISTE PARCE QUE LA BORNE A RETRECI EN SILENCE, LE 2026-09-27, ET QUE LES DEUX
 *      ASSERTIONS NEGATIVES CI-DESSOUS ONT CONTINUE A PASSER EN NE COUVRANT PLUS RIEN.
 *      La borne etait `nu.indexOf('});', i)`. Un appel ajoute dans la garde —
 *      `verdictRoutage({ … })` — se termine par `}` `)` `;`, donc par la sous-chaine `});`.
 *      La borne s est arretee LA : bloc mesure a 249 caracteres sur 9 lignes, sans `aBuy.hidden`,
 *      sans `aIb.hidden`, sans la note. Deux gardes vertes qui ne gardaient plus le code garde.
 *    ⇒ DEUX CORRECTIFS, ET LE SECOND EST LE VRAI : (1) la borne s ancre sur un `});` EN DEBUT DE
 *      LIGNE, c est-a-dire la fermeture du listener et non une parenthese interne ; (2) LA BORNE
 *      AFFIRME SA PROPRE TAILLE. Une borne qui peut rapetisser sans rien casser ne protege rien —
 *      il ne suffit pas d eviter le motif, il faut que le retrecissement soit DETECTE.
 *    ⚠️ CE QU ELLE NE PROUVE PAS : que le bloc soit le bon bloc si quelqu un renomme `aBuy`. Elle
 *      prouve qu on ne garde pas un fragment en croyant garder la garde. */
function blocDeLaGarde() {
  const i = nu.indexOf("const aBuy = $('#fAcheter')");
  assert.notEqual(i, -1, 'le bloc de visibilite de Buy est introuvable');
  const j = indexEol(nu, /\r?\n\}\);/, i);
  assert.notEqual(j, -1, 'la fermeture du bloc de la garde est introuvable');
  const bloc = nu.slice(i, j);
  /* ⛔ LES TROIS TEMOINS DE COMPLETUDE : si l un manque, la borne a glisse et les assertions
   *   negatives qui suivent seraient vraies pour la mauvaise raison. */
  for (const temoin of ['aBuy.hidden', 'aIb.hidden', 'noteRoutage']) {
    assert.ok(bloc.includes(temoin),
      'la borne du bloc a RETRECI : `' + temoin + '` en est sorti, donc les assertions negatives '
      + 'ci-dessous ne couvrent plus la garde (bloc mesure : ' + bloc.length + ' caracteres)');
  }
  return bloc;
}

cas('⛔⛔ Buy ne s affiche que si le chemin in-app peut aboutir', () => {
  /* ⛔⛔ CETTE ASSERTION A CHANGE LE 2026-09-27, ET IL FAUT DIRE POURQUOI PLUTOT QUE DE LA REECRIRE
   *     EN SILENCE. Elle exigeait litteralement `const tenable = aMarche && !pasDePoolV4;`.
   *     L invariant qu elle protege est juste ; sa VERIFICATION etait liee a une ORTHOGRAPHE. Quand
   *     la garde est passee au module `routage.js`, elle a crie — alors que l ensemble des blocks
   *     qui montrent « Buy » etait rigoureusement IDENTIQUE : mesure du meme jour sur les 155 lignes
   *     servies par /api/trending, 0 ecart entre l ancienne garde et le nouveau verdict.
   *   ⇒ On verifie desormais l INVARIANT et le COMPORTEMENT, pas la lettre.
   *   ⚠️ CE QUI N A PAS ETE AFFAIBLI : la source du drapeau reste exigee, donc on ne peut pas
   *     satisfaire ce test en ecrivant `aBuy.hidden = false` — ni en rendant le module permissif,
   *     puisque les quatre cas ci-dessous incluent un temoin POSITIF. */
  assert.ok(/aBuy\.hidden = !vRoutage\.achetableIci;/.test(nu),
    'la visibilite de Buy n est plus pilotee par le verdict de routage : le bouton peut revenir sur '
    + 'des marches ou l echange in-app ne peut pas s ouvrir');
  /* ⛔ L ENTREE DU VERDICT EST EXIGEE LIGNE PAR LIGNE, ET PAS DANS L APPEL. L objet est construit
   *   avant l appel expres : ecrit en ligne, il se terminait par `});` et faisait rapetisser la
   *   borne de `blocDeLaGarde()` (mesure : 249 caracteres au lieu de 487). Le code s adapte a la
   *   sonde ici, parce que la sonde protege une lecon payee en production. */
  assert.ok(/const entreeRoutage = \{ aMarche, dex: dexLu, poolAdr: poolAdrLu \};/.test(nu),
    'le verdict n est plus calcule a partir du marche lu (dex + poolAdr)');
  assert.ok(/verdictRoutage\(entreeRoutage\)/.test(nu),
    'le verdict n est plus appele avec cette entree');
  assert.equal(verdictRoutage({ aMarche: false }).achetableIci, false,
    'sans marche, Buy doit rester masque');
  assert.equal(verdictRoutage({ aMarche: true, dex: 'aerodrome', poolAdr: '0x' + 'a'.repeat(40) }).achetableIci,
    false, 'sur une pool hors de portee du router, Buy doit rester masque');
  assert.equal(verdictRoutage({ aMarche: true, dex: 'uniswap', poolAdr: '0x' + 'b'.repeat(40) }).achetableIci,
    false, 'sur une pool v3, notre calldata ne sait pas encore ecrire la commande : Buy masque');
  /* ⛔ TEMOIN POSITIF, SANS LUI CE TEST SERAIT SATISFAIT PAR UN MODULE QUI REFUSE TOUT — et refuser
   *   tout retirerait l affordance a 140 blocks mesures, ce qui est le defaut OPPOSE. */
  assert.equal(verdictRoutage({ aMarche: true, dex: 'uniswap', poolAdr: null }).achetableIci, true,
    'une pool Uniswap v4 DOIT ouvrir Buy');
});

cas('⛔⛔ on ne masque que sur un FAIT, jamais sur notre propre panne', () => {
  assert.ok(/h\.etatVie === 'NON_TROUVEE'/.test(nu),
    'la garde ne teste plus `NON_TROUVEE` : si elle testait « pas LUE », un hoquet du noeud '
    + 'retirerait Buy d un block parfaitement echangeable');
  /* ⛔ L ASSERTION NEGATIVE EST BORNEE AU BLOC. Ma premiere version balayait TOUT le fichier :
   *   `etatVie !== 'LUE'` existe ailleurs, legitimement, et la sonde accusait du code sans rapport.
   *   Une garde negative non bornee finit toujours par crier sur autre chose. */
  const bloc = blocDeLaGarde();
  assert.ok(!/etatVie !== 'LUE'/.test(bloc),
    'la garde est passee a « pas LUE » : elle masquerait Buy sur `NON_LUE`, c est-a-dire sur notre '
    + 'incapacite a regarder, pas sur un fait de la chaine');
  assert.ok(/mkPublic.poolAdr/.test(bloc), 'la garde ne repose plus sur `poolAdr`, le seul signal disponible au moment de la peinture');
});

cas('⛔⛔ la garde ne depend pas d un etat NON ENCORE RESOLU a la peinture', () => {
  /* ⛔⛔ C EST LA LECON QUI A COUTE UN DEPLOIEMENT INERTE. Ma premiere version testait
   *     `h.etatVie === 'NON_TROUVEE'`. La garde etait JUSTE en principe et JAMAIS VRAIE en
   *     pratique : quand la carte se peint, la lecture de la chaine n a pas abouti et l etat vaut
   *     `NON_LU`. Livre, verifie en production : Buy restait promis sur RDDTc exactement comme
   *     avant, alors que sa lecture CL s affichait a 480,264 USDC deux lignes plus haut.
   *   ⇒ Une garde d affichage doit reposer sur une valeur DISPONIBLE AU MOMENT DE LA PEINTURE.
   *     `mkPublic.poolAdr` vient du serveur avec la carte ; `h.etatVie` arrive plus tard. */
  /* ⛔ MEME BORNE QUE CI-DESSUS, ET POUR LA MEME RAISON : cette assertion negative avait la meme
   *   faiblesse, et elle a rapetisse en meme temps sans que rien ne le dise. */
  const bloc = blocDeLaGarde();
  assert.ok(!/etatVie/.test(bloc),
    'la visibilite de Buy depend de nouveau de `etatVie`, qui n est pas resolu quand la carte se '
    + 'peint : la garde sera VRAIE dans le code et INERTE a l ecran');
});

cas('⛔ on ne pousse PAS « Instant Birth » a la place', () => {
  /* ⛔ C ETAIT LA REPONSE HORS-SUJET MESUREE : proposer de creer un AUTRE block a quelqu un qui
   *   voulait acheter CELUI-LA, qui fait 384 812 $ de volume. */
  assert.ok(/aIb\.hidden = aMarche;/.test(nu),
    'Instant Birth reapparait sur un block QUI A un marche : on propose d en creer un autre a '
    + 'quelqu un qui voulait acheter celui-ci');
});

cas('⛔ le bouton qui disparait est EXPLIQUE, et le marche est nomme', () => {
  /* ⛔ UN BOUTON QUI DISPARAIT SANS PHRASE SE LIT COMME UNE PANNE DE L APP. Et la phrase nomme le
   *   marche lu par le serveur — verifiable — au lieu de rester vague. */
  /* ⛔⛔ ET DEPUIS LE 2026-09-27 IL Y A DEUX PHRASES, PARCE QU IL Y A DEUX CAUSES. L unique phrase
   *     « on a pool this app cannot route through yet » melangeait :
   *       - pool Uniswap v3 : le router qu on utilise DEJA l atteint (factory 0x33128a8f… PRESENTE
   *         dans son bytecode) ; ce qui manque est notre commande v3. 3 blocks, 78 284 $.
   *       - pool Aerodrome  : sa factory 0xf8f2eb49… est ABSENTE de ce bytecode ; le router ne peut
   *         pas l adresser du tout. 12 blocks, 12 166 295 $.
   *     Une seule phrase faisait passer le premier — bon marche a lever — pour le second.
   *   ⛔ LA PHRASE VIT DANS `routage.js`, donc on l interroge PAR LE MODULE et non par un regex sur
   *     `app.html` : une phrase recopiee dans les deux endroits divergerait au premier correctif. */
  assert.ok(/const noteRoutage = phraseRoutage\(vRoutage\);/.test(nu),
    'la disparition de Buy n est plus expliquee : elle se lira comme un bug');
  assert.ok(/dexLu/.test(nu), 'le marche n est plus nomme dans la phrase');
  const pV3 = phraseRoutage(verdictRoutage({ aMarche: true, dex: 'uniswap', poolAdr: '0x' + 'c'.repeat(40) }));
  const pAero = phraseRoutage(verdictRoutage({ aMarche: true, dex: 'aerodrome', poolAdr: '0x' + 'd'.repeat(40) }));
  assert.notEqual(pV3, pAero, 'les deux causes partagent une phrase : la moins chere est cachee par la plus chere');
  for (const p of [pV3, pAero]) {
    assert.ok(/The price above is our own read of that pool/.test(p),
      'la phrase ne dit plus que le prix affiche vient de NOTRE lecture — c est pourtant la seule '
      + 'chose que ces ecrans apportent sur ces blocks');
    assert.ok(/aerodrome|uniswap/i.test(p), 'le marche n est pas nomme dans : ' + p);
  }
  /* ⛔ ET RIEN N EST DIT QUAND TOUT VA BIEN : une note sur un succes prendrait la place de celle qui
   *   sert, et l ecran finirait par expliquer ce que personne ne demande. */
  assert.equal(phraseRoutage(verdictRoutage({ aMarche: true, dex: 'uniswap', poolAdr: null })), null,
    'une pool v4 qui marche ne doit produire AUCUNE note');
});

assert.equal(n, 5, 'compte de cas inattendu : ' + n);
console.log('ok buy-tenable — ' + n + ' cas.');
console.log('   Buy ne s affiche que si le marche le plus liquide est une pool v4 ; la garde repose sur');
console.log('   `poolAdr`, disponible A LA PEINTURE, et sa disparition est expliquee.');
console.log('⚠️ NE PROUVE PAS qu un achat aboutisse — prouve qu on ne promet plus ce qu on a mesure');
console.log('   comme impossible, et qu on ne retire rien sur un hoquet.');
