/* test-reserve-derivee-pas-ecrite.mjs — UNE RESERVE ECRITE EN DUR DANS LE HTML EST UNE RESERVE
 * QU ON OUBLIERA.
 *
 * ⛔⛔⛔ LE DEFAUT, NOMME PAR RAKSHA LE 2026-10-02 : « ecris pas que ca marche pas car on le build
 *      puis tu oublie de modifier sur le frontend ». Ce n est pas une preference de ton, c est un
 *      defaut de STRUCTURE. Une capacite en chantier a un drapeau — ici `HUB_SWAP_LIVE`. Tout texte
 *      derive de ce drapeau bascule SEUL le jour ou il passe a `true`. Tout texte ecrit en dur dans
 *      le HTML ne bascule jamais, et personne ne se souvient d un paragraphe statique.
 *
 * ⭐ MESURE DU 2026-10-02, onglet Bridge. L utilisateur lisait l absence TROIS fois :
 *      · `<p class="sous">`  « (not live) · (net swap not live yet) »   STATIQUE, sans `id`
 *      · `#brLegsNote`       phraseBridgeLegs()                          DERIVEE  ✅
 *      · `<p class="note">`  « Atomic token↔token net via hub is not live » STATIQUE, sans `id`
 *   Les deux statiques DOUBLAIENT la derivee. Le jour de la bascule, la derivee s allume et les deux
 *   autres continuent d annoncer que rien ne marche — sur le dernier ecran lu avant une signature.
 *   ⛔ ET LE COMMENTAIRE QUI DEFENDAIT LA PREMIERE AVERTISSAIT DEJA : « corriger une source d un
 *     texte duplique laisse l autre gagner a l ecran ». Il decrivait la ligne juste en dessous de
 *     lui sans la voir. Connaitre la regle ne suffit pas ; seul un controle EXTERNE protege.
 *
 * ⛔ CE QUE CE BANC GARDE : qu aucune annonce d absence ne vive dans le HTML STATIQUE. Elle doit
 *   venir d une branche du drapeau, ou ne pas exister.
 * ⛔ CE QU IL NE GARDE PAS, ET C EST IMPORTANT : il ne dit pas que la reserve a disparu. Elle DOIT
 *   survivre une fois, a l endroit du devis, parce que le panneau From/To produit un vrai chiffre et
 *   que son bouton reste cliquable. Un prix a cote d une capacite absente est le defaut le plus
 *   souvent paye dans ce depot. Ce banc exige donc les DEUX : zero en statique, au moins une en
 *   derive. Supprimer la reserve partout le ferait ROUGE, et c est voulu.
 */
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('./app.html', import.meta.url), 'utf8');
let n = 0, ko = 0;
const ok = (nom, cond, vu) => {
  n += 1;
  if (cond) { console.log('  ok  ' + nom); return true; }
  ko += 1; console.log('  KO  ' + nom + (vu === undefined ? '' : '\n        vu: ' + vu));
  return false;
};

/* ── CE QU ON CHERCHE ────────────────────────────────────────────────────────────────────────── */
/* ⛔ Les formulations reellement vues a l ecran sur ce parcours, pas une liste imaginee. Chacune a
 *   ete lue dans app.html ou bridge.js avant d etre ajoutee ici. */
const ANNONCES_D_ABSENCE = [
  /not live yet/i,
  /\bnot live\b/i,
  /not built yet/i,
  /cannot be settled/i,
  /is the only leg running/i,
  /quote only/i,
  /not a live atomic promise/i,
];

/* ── LE HTML STATIQUE, COMMENTAIRES ET SCRIPTS RETIRES ───────────────────────────────────────── */
/* ⛔⛔ ON RETIRE LES COMMENTAIRES HTML : ils contiennent ces phrases EXPRES, c est la documentation
 *    du defaut. Les accuser rendrait ce banc inutilisable et il finirait desactive — ce depot a
 *    deja tue une garde qui accusait 60 fichiers le premier jour.
 *  ⛔ ON RETIRE AUSSI LES `<script>` : les chaines JS y vivent, et c est exactement la forme
 *    AUTORISEE. Ne pas les retirer ferait de ce banc l inverse de ce qu il veut dire.
 *  ⛔ FINS DE LIGNE : aucune. `[\s\S]` traverse CRLF comme LF. Le cliquet test-tests-portables
 *    refuse tout litteral `\r\n` ou `\n` dans ces motifs, et il a raison : ce fichier est CRLF sur
 *    un checkout Windows et LF sur Railway. */
const sansCommentaires = app.replace(/<!--[\s\S]*?-->/g, ' ');
const htmlStatique = sansCommentaires.replace(/<script\b[\s\S]*?<\/script>/gi, ' ');

/* ── TEMOIN : LE BANC S ACCUSE D ABORD ───────────────────────────────────────────────────────── */
/* ⛔⛔ Un banc qui ne retrouve pas la forme d AVANT ne cherche rien, et son zero ne vaut rien.
 *    On lui redonne les deux paragraphes exacts qui etaient en ligne ce matin. */
const AVANT_1 = '<p class="sous">Move value through a hub.\r\n'
  + '        <b>Legs:</b> Fund · ETH/USDC swap fee (<b>not live</b>) · Block/Token hub quote '
  + '(net swap <b>not live yet</b>) · tokenized equity <b>later</b>.</p>';
const AVANT_2 = '<p class="note">Selling a block through its own market is live. '
  + 'Atomic token↔token net via hub is <b>not live</b> — quote only, not a live atomic promise.</p>';
const APRES_OK = '<p class="note" id="brSwapReserve">Selling a block through its own market is '
  + 'live: the fee is taken inside the same transaction.</p>';

const accuse = (t) => ANNONCES_D_ABSENCE.some((re) => re.test(t));
ok('0. TEMOIN POSITIF — la premiere forme d avant (liste des jambes) est accusee', accuse(AVANT_1));
ok('0b. TEMOIN POSITIF — la seconde (reserve du swap) est accusee', accuse(AVANT_2));
ok('0c. TEMOIN NEGATIF — la forme corrigee n est PAS accusee', !accuse(APRES_OK), APRES_OK);
/* ⛔ ET UN TEMOIN SUR LE DECOUPAGE LUI-MEME : si le retrait des `<script>` emportait tout le
 *   fichier, `htmlStatique` serait vide et chaque assertion passerait par ABSENCE. */
ok('0d. TEMOIN — le HTML statique est encore substantiel apres decoupage',
  htmlStatique.length > 60000, htmlStatique.length + ' octets');
ok('0e. TEMOIN — et il contient bien du texte d interface',
  htmlStatique.includes('Bridge block') && htmlStatique.includes('Fund wallet'));

/* ── 1. AUCUNE ANNONCE D ABSENCE DANS LE HTML STATIQUE ───────────────────────────────────────── */
/* ⛔⛔⛔ LE DEFAUT N EST PAS « C EST STATIQUE », C EST « RIEN NE PEUT LE REPEINDRE ». Ma premiere
 *      version de ce banc accusait tout texte statique et sortait TROIS prises dont DEUX fausses :
 *        · `#brLegsNote` porte un fallback statique, mais il est ECRASE au demarrage par
 *          `phraseBridgeLegs()`, qui derive du drapeau. Il basculera seul. Ce n est pas le defaut.
 *        · `#tbApercu` est une decision de Raksha, le 2026-09-24 : « mets en mode faux le temps de
 *          build ». `BANK_CONTRACT` vaut `null`, le bandeau est VRAI, et le retirer serait trancher
 *          seul une semantique produit. Exemption nommee ci-dessous, avec sa raison.
 *      Une garde qui accuse juste mais trop large finit desactivee, et ce depot l a deja vu.
 * ⇒ ON ACCUSE DONC : un texte d absence dont l element porteur n a PAS d `id`, ou dont l `id`
 *   n apparait dans AUCUN site de peinture. C est la definition exacte de « on oublie le front ». */
const EXEMPTIONS = new Map([
  ['tbApercu', 'decision de Raksha 2026-09-24 « mets en mode faux le temps de build » ; '
    + 'BANK_CONTRACT vaut null, donc le bandeau est VRAI. Le retirer serait trancher seul une '
    + 'semantique produit. ⛔ Il devra partir le jour ou la banque existe — pas avant.'],
]);

/* L `id` de l element porteur : le dernier `id="…"` avant le texte, a condition qu aucune balise
 * fermante de bloc ne se glisse entre les deux (sinon l id appartient a un element deja ferme). */
function idPorteur(src, i) {
  const amont = src.slice(Math.max(0, i - 900), i);
  const ids = [...amont.matchAll(/\sid="([A-Za-z][\w-]*)"/g)];
  if (!ids.length) return null;
  const dernier = ids[ids.length - 1];
  const entre = amont.slice(dernier.index + dernier[0].length);
  if (/<\/(p|div|section|li|td|h[1-6])>/i.test(entre)) return null;
  return dernier[1];
}
const peint = (id) => new RegExp("(\\$\\('#" + id + "'\\)|getElementById\\('" + id + "'\\))")
  .test(app);

const fautifs = [], exemptes = [], repeignables = [];
for (const re of ANNONCES_D_ABSENCE) {
  for (const m of htmlStatique.matchAll(new RegExp(re.source, 'gi'))) {
    const extrait = htmlStatique.slice(Math.max(0, m.index - 90), m.index + 90)
      .replace(/\s+/g, ' ').trim();
    const id = idPorteur(htmlStatique, m.index);
    const ou = '« ' + m[0] + ' »' + (id ? '  dans #' + id : '  SANS id') + '  : …' + extrait + '…';
    if (id && EXEMPTIONS.has(id)) { exemptes.push(ou); continue; }
    if (id && peint(id)) { repeignables.push(ou); continue; }
    fautifs.push(ou);
  }
}
/* ⛔ TEMOIN DU CLASSEUR : si `idPorteur` rendait toujours `null`, tout basculerait en « fautif » ;
 *   s il rendait toujours un id peint, tout passerait au vert. On exige donc que les trois
 *   populations soient DISTINGUEES — au moins une exemption connue et au moins un repeignable. */
ok('1a. TEMOIN — le classeur distingue repeignable / exempte / fautif',
  exemptes.length >= 1 && repeignables.length >= 1,
  exemptes.length + ' exempte(s), ' + repeignables.length + ' repeignable(s), '
  + fautifs.length + ' fautif(s)');
ok('1. ⭐ aucune annonce d absence n est hors de portee d une repeinture',
  fautifs.length === 0, fautifs.length + ' trouvee(s)\n        ' + fautifs.join('\n        '));
for (const e of exemptes) console.log('      ⚠️ EXEMPTE  ' + e.slice(0, 110));
for (const [id, pourquoi] of EXEMPTIONS) console.log('         #' + id + ' — ' + pourquoi);

/* ── 2. LA RESERVE SURVIT, DERIVEE DU DRAPEAU ────────────────────────────────────────────────── */
/* ⛔⛔ C EST LA MOITIE QU ON OUBLIE. « Zero reserve en statique » est satisfait aussi bien par une
 *    correction que par une SUPPRESSION PURE — et supprimer la reserve pendant que le devis affiche
 *    un chiffre, c est afficher un prix pour un service qu on ne rend pas. On exige donc la preuve
 *    que la reserve existe ENCORE, et qu elle est branchee sur le drapeau. */
ok('2. le drapeau existe et vaut false aujourd hui',
  /export const HUB_SWAP_LIVE = false;/.test(readFileSync(new URL('./bridge.js', import.meta.url), 'utf8')));
const brPeint = /resv\.textContent =/.test(app) && /\$\('#brSwapReserve'\)/.test(app);
ok('3. ⭐ la reserve du swap est PEINTE, donc repeignable', brPeint);
ok('4. …et son texte depend du drapeau',
  /const resv = \$\('#brSwapReserve'\);[\s\S]{0,1400}?HUB_SWAP_LIVE/.test(app));
/* ⛔ LA RESERVE SURVIT A L ENDROIT DU DEVIS. C est la seule place ou elle informe : un chiffre
 *   apparait, et le lecteur doit savoir qu il ne sera pas regle. */
ok('5. ⛔ et elle survit SOUS LE DEVIS, la ou un chiffre apparait',
  /You receive: nothing yet/.test(app) && /this quote is an estimate for later, not an offer/.test(app));
/* ⛔ LE JOUR DE LA BASCULE : plus aucune phrase a changer a la main. On compte les emplacements
 *   derives — s il en reste moins de quatre, quelqu un a recable une phrase en dur. */
const derives = (app.match(/HUB_SWAP_LIVE\s*(\?|===|!==|&&|\|\|)/g) || []).length
  + (app.match(/HUB_SWAP_LIVE$/gm) || []).length;
ok('6. ⭐ au moins quatre emplacements derivent du drapeau (devis, frais, net, reserve, jambes)',
  derives >= 4, derives + ' emplacement(s)');
/* ⛔ ET LE PRIX NE PART JAMAIS SANS LA CAPACITE. Un tarif cite dans la branche « pas encore » est
 *   le motif exact qui a transforme une divulgation honnete en appat le 2026-09-25. */
/* ⛔⛔⛔ CETTE EXTRACTION EST BORNEE PAR LE CODE, PAS PAR UN COMPTE D OCTETS — ET C EST UNE MUTATION
 *      SURVIVANTE QUI L A EXIGE, UNE HEURE APRES QUE J AI CORRIGE LE MEME DEFAUT AILLEURS.
 *      Ma premiere version faisait `app.slice(iRetarget, iRetarget + 1200)`. Le bloc de commentaire
 *      que j ai ajoute au-dessus du ternaire l a pousse HORS de ces 1200 octets : l assertion est
 *      restee VERTE en ne regardant plus RIEN, et la mutation « recite un tarif » a survecu.
 *   ⛔ UNE FENETRE FIXE NE CASSE PAS BRUYAMMENT, ELLE CESSE SILENCIEUSEMENT DE COUVRIR. C est pour
 *     ca qu on ne la detecte qu en mutant : aucun rouge ne l annonce.
 *   ⇒ On extrait le ternaire par sa GRAMMAIRE : du `HUB_SWAP_LIVE` qui suit l ancre jusqu au `;` qui
 *     termine l affectation. Et on PROUVE que les deux branches ont ete isolees avant de juger. */
const iRetarget = app.indexOf("const br = document.getElementById('cBridgeRetargetTexte')");
ok('7. le site du Create est trouve', iRetarget > 0, iRetarget);
const mTern = /br\.textContent = HUB_SWAP_LIVE([\s\S]*?);/.exec(app.slice(iRetarget));
ok('7b. TEMOIN — le ternaire du Create est isole par sa grammaire, pas par un compte d octets',
  !!mTern, mTern ? 'ok' : 'introuvable');
const ternaire = mTern ? mTern[1] : '';
const iPointInt = ternaire.indexOf('?');
const iDeuxPts = ternaire.indexOf(':', iPointInt + 1);
/* ⛔ TEMOIN DES DEUX BRANCHES : sans lui, une extraction ratee rendrait `''`, et « aucun tarif dans
 *   une chaine vide » serait VRAI gratuitement. C est le meme piege, un etage plus bas. */
ok('7c. TEMOIN — les deux branches du ternaire sont bien separees',
  iPointInt > -1 && iDeuxPts > iPointInt, 'declencheur ' + iPointInt + ', branche morte ' + iDeuxPts);
const brancheVivante = iPointInt > -1 ? ternaire.slice(iPointInt + 1, iDeuxPts) : '';
const brancheMorte = iDeuxPts > -1 ? ternaire.slice(iDeuxPts + 1) : '';
ok('7d. TEMOIN — la branche VIVANTE cite bien le tarif, elle (sinon on ne compare rien)',
  /BRIDGE_FEE_LABEL/.test(brancheVivante), brancheVivante.replace(/\s+/g, ' ').trim().slice(0, 90));
ok('8. ⛔ la branche « pas encore » du Create ne cite AUCUN tarif',
  brancheMorte.length > 20
  && !/BRIDGE_FEE_LABEL/.test(brancheMorte) && !/\d+\s*(bps|%)/.test(brancheMorte),
  brancheMorte.replace(/\s+/g, ' ').trim().slice(0, 160));
/* ⛔ ET ELLE NE RACONTE PAS LE CHANTIER. C est la demande explicite de Raksha, 2026-10-02 : « ecris
 *   pas que ca marche pas car on le build puis tu oublie de modifier sur le frontend ». */
ok('9. ⭐ …et elle n annonce pas l absence : elle nomme les gestes vivants',
  !ANNONCES_D_ABSENCE.some((re) => re.test(brancheMorte)),
  brancheMorte.replace(/\s+/g, ' ').trim().slice(0, 160));

console.log('');
console.log(n + ' assertions, ' + ko + ' KO');
console.log('   Annonces d absence en HTML statique : 2 -> 0. Emplacements derives : ' + derives + '.');
console.log('⚠️ NE PROUVE PAS que la reserve soit LUE : elle est servie et derivee, pas forcement vue.');
console.log('   Ce qui est garde, c est que personne n aura a la modifier a la main le jour ou le');
console.log('   hub s allume — c est le defaut que Raksha a nomme, pas le ton des phrases.');
process.exit(ko ? 1 : 0);
