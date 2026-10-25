/* test-devis-meme-source-que-la-tx.mjs — LE CHIFFRE MONTRE AVANT DE SIGNER VIENT DU MEME APPEL QUE
 * LA TRANSACTION.
 *
 * ⛔⛔⛔ CE BANC REMPLACE UNE PROPRIETE DEVENUE FAUSSE DANS SIX AUTRES, ET C EST LE POINT DELICAT —
 *      SIX GARDES QUI ROUGISSENT LE MEME JOUR, C EST NORMALEMENT LE SIGNE QU ON CASSE QUELQUE CHOSE.
 *      Elles exigeaient toutes, directement ou non : « puisqu un net est affiche, une reserve doit
 *      dire qu il ne sera pas regle ». Leur PREMISSE a change le 2026-10-02.
 *
 * ⭐ CE QUI A CHANGE, MESURE AVANT DE TOUCHER A QUOI QUE CE SOIT :
 *      · l onglet Bridge portait deux selecteurs « From » / « To » listant vingt actifs ;
 *      · le gestionnaire du bouton appelle `planEchange({ jeton: hub, sens: 'VENTE', montant })` ;
 *      · `fromSym` et `toSym` apparaissaient ZERO fois dans le corps du gestionnaire apres leur
 *        lecture, et `const q = quoteBridge(...)` n etait utilise NULLE PART — valeur lue puis
 *        jetee, motif de defaut n°1 de ce depot ;
 *      · `quoteBridge` est un stub documente « fee = amount * 0.0001 » (0,01 %) alors que
 *        `BRIDGE_FEE_BPS` vaut 50n (0,5 %) : facteur CINQUANTE, deja paye ici le 2026-09-25.
 *    ⇒ Le net affiche n etait pas « le net d une capacite absente » : c etait le net d un CALCUL
 *      QUI N AVAIT AUCUN RAPPORT avec la transaction envoyee. La reserve couvrait le mauvais defaut.
 *
 * ⛔ L INVARIANT QUI REMPLACE LA RESERVE, ET IL EST PLUS FORT : le chiffre montre vient de la MEME
 *   fonction qui construit la transaction. Une reserve demande au lecteur de se mefier ; une source
 *   unique rend la mefiance inutile. Deux formules pour une question, c est une de trop.
 *
 * ⛔ L ORDRE DES DEUX GESTES EST TOUT L ARGUMENT. Retirer la reserve EN GARDANT les selecteurs
 *   aurait affiche un prix a cote d une capacite absente — le defaut le plus cher de ce depot, et
 *   le pire des trois choix possibles. On retire l OFFRE d abord ; la phrase suit.
 *
 * ⚠️ CE QUE CE BANC NE PROUVE PAS : qu une vente reelle aboutisse, ni que le chiffre annonce soit
 *   celui qui sera recu. `recoitAuMoins` est un MINIMUM lu avant inclusion ; le prix bouge entre la
 *   lecture et le bloc. Ce qui est garde, c est qu il n y a plus qu une source — pas qu elle soit
 *   exacte au wei.
 */
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('./app.html', import.meta.url), 'utf8');
const bridgeJs = readFileSync(new URL('./bridge.js', import.meta.url), 'utf8');
let n = 0, ko = 0;
const ok = (nom, cond, vu) => {
  n += 1;
  if (cond) { console.log('  ok  ' + nom); return true; }
  ko += 1; console.log('  KO  ' + nom + (vu === undefined ? '' : '\n        vu: ' + vu));
  return false;
};

/* ── 0. TEMOINS : le banc s accuse d abord ───────────────────────────────────────────────────── */
/* ⛔⛔ UN BANC QUI NE RETROUVE PAS SA CIBLE NE GARDE RIEN, et son vert est pire qu un rouge. On
 *    borne par la GRAMMAIRE, jamais par un compte d octets : deux fois aujourd hui une fenetre
 *    `slice(i, i + N)` a cesse silencieusement de couvrir parce qu un commentaire l avait decalee. */
/* ⛔⛔⛔ 2026-10-25 — LA CIBLE CHANGE, PAS L INVARIANT. Phil a fait retirer la carte de vente du Bridge (« remove that ») :
 *      `majBridgeQuote` et le gestionnaire `#brConfirm`, que ce banc lisait, n existent plus. Le geste qui les remplace est
 *      le Swap du Wallet, qui ecrit une commande du Chat ; c est donc `bcProposerSwap` qui montre le devis ET fait signer.
 *      L invariant est le meme, et plus simple a tenir : devis et appels signes viennent du MEME objet `p` (un seul plan,
 *      /api/rails/plan), dans la MEME fonction. Les cas ci-dessous gardent leur numero, re-ancres sur ce chemin. */
const mFn = /async function bcProposerSwap\(qui, classe, \{ de, vers, montant \}, ref, suivi = null\) \{([\s\S]*?)\n\}/.exec(app);
ok('0. le chemin du devis et de la signature (bcProposerSwap) est trouve, borne par sa grammaire', !!mFn);
const devis = mFn ? mFn[1] : '';
ok('0b. TEMOIN — son corps est substantiel (une extraction ratee rendrait tout vrai par absence)',
  devis.length > 3000, devis.length + ' octets');
ok('0c. TEMOIN — il est `async`, donc capable d attendre le plan',
  /async function bcProposerSwap/.test(app));

/* ── 1. UNE SEULE SOURCE ─────────────────────────────────────────────────────────────────────── */
ok('1. ⭐ le net annonce vient du resume du plan `p`',
  /const rs = p\.resume \|\| \{\};/.test(devis) && /'You receive at least ' \+ [^;]*rs\.recoitAuMoins/.test(devis));
const mSigner = /const signer = async \(\) => \{([\s\S]*?)\n    \};/.exec(devis);
ok('2. TEMOIN — la fonction de signature est trouvee', !!mSigner);
const handler = mSigner ? mSigner[1] : '';
ok('3. ⭐ …et elle signe les appels de CE MEME plan `p` (lot et un-par-un)',
  /calls: p\.aSigner\.map/.test(handler) && /bcSigner\(m, p\.aSigner, 'swap_action'\)/.test(handler),
  handler.length + ' octets de signature');
/* ⛔⛔⛔ LE STUB N EST PLUS IMPORTABLE DEPUIS L ECRAN. Tant qu il reste dans la liste d import, il
 *      reste une seconde formule pour « combien on prend » — et c est la seule chose qui a produit
 *      le facteur cinquante. L interdire a l import est structurel ; l interdire par relecture ne
 *      l est pas. */
const mImport = /import \{([^}]*)\} from '\.\/bridge\.js';/.exec(app);
ok('4. TEMOIN — la ligne d import de bridge.js est trouvee', !!mImport);
const importes = mImport ? mImport[1] : '';
ok('5. ⭐ `quoteBridge` n est plus importe dans l ecran', !/\bquoteBridge\b/.test(importes), importes.trim().slice(0, 120));
ok('6. …ni appele nulle part dans le code de l ecran',
  !/\bquoteBridge\s*\(/.test(app.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/<!--[\s\S]*?-->/g, ' ')));
/* ⛔ MAIS IL EXISTE TOUJOURS DANS LE MODULE, avec ses bancs. On ne supprime pas une fonction testee
 *   pour la retirer d un ecran : on la DECABLE. Si cette assertion tombe, quelqu un a confondu les
 *   deux gestes. */
ok('7. ⛔ et il existe TOUJOURS dans bridge.js : decable, pas supprime',
  /export function quoteBridge\(/.test(bridgeJs));

/* ── 2. PLUS D OFFRE FANTOME ─────────────────────────────────────────────────────────────────── */
/* ⛔ C EST CE QUI AUTORISE LE RETRAIT DE LA RESERVE. Si ces deux selecteurs revenaient, l ecran
 *   proposerait de nouveau un echange actif-vers-actif que rien ne regle — et il faudrait de
 *   nouveau l ecrire. Cette assertion est la condition de toutes les autres. */
/* ⛔⛔ ON DEPOUILLE LES DEUX SORTES DE COMMENTAIRES, HTML **ET** JS. Ma premiere version ne retirait
 *    que `<!-- -->`, et l assertion 9 a rougi sur MON PROPRE commentaire JS expliquant le retrait de
 *    `peindreBridgeActifs`. Troisieme fois aujourd hui qu un instrument lit la documentation comme
 *    du code — apres `test-ids-fantomes` et ma sonde de deploiement. Connaitre la regle ne suffit
 *    pas : il faut que l instrument la porte.
 *  ⛔ ET LE TEMOIN DE DEPOUILLEMENT VA DANS LES DEUX SENS : sans effet il ne protege de rien, trop
 *    gourmand il rend toutes les absences vraies. */
const html = app.replace(/<!--[\s\S]*?-->/g, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ');
ok('7b. TEMOIN — le depouillement a un effet ET garde le code vivant',
  html.length < app.length && html.length > 200000 && html.includes('id="brFundWallet"'),
  html.length + ' / ' + app.length + ' octets');
ok('8. ⭐ aucun selecteur « From » / « To » ne propose plus un echange actif-vers-actif',
  !/id="brFrom"/.test(html) && !/id="brTo"/.test(html));
ok('9. …et le peintre qui les remplissait a disparu, pas seulement son corps',
  !/function peindreBridgeActifs/.test(html) && !/peindreBridgeActifs\s*\(/.test(html));
/* ⛔ LE GESTE VIVANT SURVIT — c est la moitie qu on oublie. `fail-closed sur une affordance efface
 *   le produit` a deja coute 13 puces reduites a 2 EN PROD : retirer une offre fantome ne doit pas
 *   emporter l offre reelle. */
/* ⛔ 2026-10-25 : la vente du Bridge est RETIREE (decision de Phil) ; la vente vivante est au Swap du Wallet. On exige
 *   qu elle y soit, et que le Bridge ne la porte plus sans ce banc. */
ok('10. ⛔ le Bridge ne porte plus de bouton de vente (retire le 2026-10-25)',
  !/id="brConfirm"/.test(html) && !/id="brAmount"/.test(html));
ok('11. ⛔ la vente vivante est au Swap du Wallet : bouton, et commande `sell <n> <block>` ecrite pour le Chat',
  /id="bWalletSwap"/.test(html) && /'sell ' \+ n \+ ' ' \+ de/.test(html) && /bcExecuterTexte\(wsCommande\(de, vers, n\), etat\)/.test(html));
ok('12. ⛔ le choix du block hub du Bridge survit',
  /id="brBlock"/.test(html));

/* ── 3. CE QUE LE DEVIS DIT DE LUI-MEME ──────────────────────────────────────────────────────── */
/* ⛔⛔ « NON LU » N EST PAS « ZERO ». Une panne de lecture annoncee comme un montant nul ferait
 *    croire qu un block n a pas de marche. Ce depot a produit trois verdicts faux sur cette
 *    confusion exacte. */
/* 2026-10-25 : re-ancre sur bcProposerSwap — un plan qui n a pas pu etre lu est NON_MESURE et s arrete, jamais un zero. */
ok('13. ⭐ un plan illisible se dit NON_MESURE, jamais zero',
  /p = \{ etat: 'NON_MESURE', pourquoi: 'the plan could not be fetched', aSigner: \[\] \}/.test(devis)
  && /if \(p\.etat !== 'PRET' && p\.etat !== 'APPROBATIONS'\) \{/.test(devis));
ok('14. …et le net annonce est un MINIMUM, pas une promesse',
  /You receive at least /.test(devis) && /recoitAuMoins/.test(devis));
/* ⛔⛔ LE BOUTON DU WALLET NE DEPEND PAS D UNE LECTURE : il ne lit rien lui-meme, il ecrit une commande. Les trois cas qui
 *    gardaient le bouton du Bridge (decide avant la lecture, sur le block et le montant seuls) gardent ici la meme chose. */
const mWs = /\$\('#wsGo'\)\.addEventListener\('click', async \(\) => \{([\s\S]*?)\n\}\);/.exec(app);
const ws = mWs ? mWs[1] : '';
ok('15. TEMOIN — le gestionnaire du Swap du Wallet est trouve', ws.length > 300, ws.length + ' octets');
ok('16. ⭐ il ne lit pas la chaine avant d ecrire la commande (aucune lecture a rater, aucun bouton desactive sur un echec)',
  !/fetch\(|rpc\(|planEchange|\.disabled/.test(ws));
ok('17. …et il ne depend que de ce que la personne a choisi (de, vers, montant)',
  /bcExecuterTexte\(wsCommande\(de, vers, n\), etat\)/.test(ws));
/* ⛔ PLUS DE JETON DE COURSE NECESSAIRE : chaque demande ouvre SA carte dans le Chat, qui porte son propre plan — aucune
 *   reponse tardive ne peut repeindre le net d un autre montant dans une ligne partagee. On exige qu il n y ait pas de telle ligne. */
ok('18. ⭐ le Wallet ne peint aucun net lui-meme (pas de ligne partagee qu une reponse tardive ecraserait)',
  !/You receive/.test(ws));
ok('19. ⛔ …et la frappe ne declenche aucune lecture (pas d ecouteur `input` sur le montant)',
  !/\$\('#wsMontant'\)\.addEventListener\('input'/.test(app));

/* ── 4. LA PHRASE SUIT L OFFRE, ELLE NE LA PRECEDE PAS ───────────────────────────────────────── */
ok('20. ⭐ la phrase des jambes nomme le geste vivant',
  /then sell a block through its own market/.test(bridgeJs));
/* ⛔⛔⛔ CETTE ASSERTION VISAIT TOUT `bridge.js` ET ELLE AVAIT TORT DE LE FAIRE — mais son rouge a
 *      servi. Elle a trouve « not built yet » dans `BRIDGE_LEGS[].note`, une DONNEE du module, pas
 *      un commentaire. Verification : `BRIDGE_LEGS` est importe dans app.html et utilise NULLE PART,
 *      donc cette note n atteint jamais un ecran. L import mort est retire ; la donnee reste, avec
 *      ses propres bancs.
 *   ⇒ CE QU ON GARDE EST CE QUI S AFFICHE. On vise donc la CHAINE RENDUE par `phraseBridgeLegs`,
 *     pas le fichier entier. Une garde qui accuse des donnees non affichees finit desactivee.
 *   ⚠️ ET ON LE DIT : ce banc ne garde RIEN sur `BRIDGE_LEGS`. Si quelqu un recable ces notes a un
 *     ecran demain, « not built yet » revient sans qu aucune assertion ne bouge.
 *     `test-reserve-derivee-pas-ecrite.mjs` attraperait la version HTML, pas une injection JS. */
const mPhrase = /export function phraseBridgeLegs\(\) \{([\s\S]*?)\n\}/.exec(bridgeJs);
ok('20b. TEMOIN — le corps de la phrase est isole', !!mPhrase && mPhrase[1].length > 300);
const corpsPhrase = (mPhrase ? mPhrase[1] : '').replace(/\/\*[\s\S]*?\*\//g, ' ');
ok('21. …et ne desavoue plus un echange qui n est plus propose',
  !/not built yet/.test(corpsPhrase) && !/estimate for later, not an offer/.test(corpsPhrase),
  corpsPhrase.replace(/\s+/g, ' ').trim().slice(0, 150));
/* ⛔ « not a broker » RESTE : c est une limite JURIDIQUE permanente, pas l etat d un chantier. La
 *   confondre avec une reserve de developpement la ferait partir le jour ou le hub s allume. */
ok('22. ⛔ « not a broker » survit — limite juridique, pas etat d avancement',
  /not a broker/i.test(bridgeJs));
/* ⛔ ET LE DRAPEAU RESTE LA SOURCE DE LA BASCULE : le jour ou le hub existe, la branche vivante
 *   reprend seule. Si le drapeau disparaissait, la phrase redeviendrait figee. */
ok('23. ⛔ la phrase reste derivee de HUB_SWAP_LIVE',
  /export function phraseBridgeLegs\(\) \{\s*return HUB_SWAP_LIVE/.test(bridgeJs));

console.log('');
console.log(n + ' assertions, ' + ko + ' KO');
console.log('   Deux formules pour « combien on prend » -> UNE. Le stub (0,01 %) est decable du');
console.log('   l ecran ; le frais reel est 0,5 %. L offre fantome est partie AVANT la phrase.');
console.log('⚠️ NE PROUVE PAS qu une vente reelle aboutisse, ni que `recoitAuMoins` soit tenu : c est');
console.log('   un MINIMUM lu avant inclusion, et le prix bouge entre la lecture et le bloc.');
process.exit(ko ? 1 : 0);
