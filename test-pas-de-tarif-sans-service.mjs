/* ON N AFFICHE PAS UN TARIF A COTE D UNE CAPACITE QU ON N A PAS.
 *
 * ⭐ PHIL, 2026-10-01, en pointant l ecran de naissance : « c est bugger ca corrige ».
 *   La phrase disait :
 *     « Tokenized↔tokenized after funding? Open the Bridge tab — 0.5% via your Bridge block. »
 *
 * ⛔⛔⛔ LE DEFAUT N ETAIT PAS LE CHIFFRE — il est juste, `BRIDGE_FEE_BPS` vaut bien 50n et un test
 *   force deja l egalite entre l affiche et le preleve. Le defaut etait de citer un PRIX pour un
 *   service qui N EXISTE PAS : `HUB_SWAP_LIVE` vaut `false`, et l onglet Bridge le dit DEUX fois
 *   lui-meme — « net swap not live yet » et « Atomic token↔token net via hub is not live — quote
 *   only, not a live atomic promise ».
 *   ⇒ On envoyait donc le visiteur dans une impasse, AVEC un tarif. Et un tarif a cote d une
 *     capacite absente est ce qui transforme une reserve honnete en appat : la personne retient le
 *     chiffre, pas la reserve.
 *   ⛔ LE DEPOT PORTAIT DEJA LA REGLE, a cote de la constante : « LA CONSTANTE QUI EMPECHE DE
 *     FACTURER UN SERVICE QU ON NE REND PAS ». Elle existait, et cette phrase passait a cote d elle
 *     — une regle ecrite ne protege que ce qu un controle EXTERNE verifie.
 *
 * ⛔ CE FICHIER NE TESTE PAS UNE FORMULATION, IL TESTE UN LIEN : tant que `HUB_SWAP_LIVE` est faux,
 *   aucune promesse de tokenized↔tokenized ne doit coexister avec un tarif. Le jour ou la capacite
 *   arrive, ce test suit tout seul.
 */
import { readFileSync } from 'node:fs';
import { HUB_SWAP_LIVE, BRIDGE_FEE_LABEL, BRIDGE_FEE_BPS } from './bridge.js';

const html = readFileSync(new URL('./app.html', import.meta.url), 'utf8');
let ok = 0; const ko = [];
const t = (nom, cond) => { if (cond) ok += 1; else ko.push(nom); };

/* ⛔ On ne lit que le CODE : un commentaire qui RACONTE le defaut corrige en contient forcement le
 *   texte, et une garde qui ne distingue pas les deux accuse le correctif lui-meme. C est arrive
 *   quatre fois dans la journee. */
const sansCommentaires = html
  .replace(/<!--[\s\S]*?-->/g, '')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');
t('le depouilleur a bien retire du texte', sansCommentaires.length < html.length);
t('et il a garde le code', /HUB_SWAP_LIVE/.test(sansCommentaires));

/* ══ 1. LE LIEN : PAS DE TARIF SANS SERVICE ═══════════════════════════════════════════════════ */
/* La phrase fautive, telle qu elle etait : une promesse tokenized↔tokenized ET un tarif. */
/* ⛔⛔ UN SCAN LIGNE PAR LIGNE A ECHOUE ICI, ET POUR LA BONNE RAISON : la garde est une TERNAIRE
 *   etalee sur plusieurs lignes, donc `HUB_SWAP_LIVE` et la promesse ne sont jamais sur la meme.
 *   C est le troisieme angle mort du meme type dans la journee. Mais elargir a une FENETRE serait
 *   l autre erreur — elle accuse la PROXIMITE au lieu de l ASSOCIATION, et m a deja fait
 *   « corriger » du code correct.
 *   ⇒ On isole donc l AFFECTATION complete, de `br.textContent =` jusqu a son point-virgule, et on
 *     verifie que la promesse vit dans la branche VRAIE de la garde. C est l association reelle,
 *     ni la ligne ni le voisinage. */
const affectation = (sansCommentaires.match(/br\.textContent\s*=\s*HUB_SWAP_LIVE[\s\S]*?;\s*\n/) || [''])[0];
const promesses = sansCommentaires.split('\n')
  .filter((l) => /Tokenized↔tokenized/i.test(l) && /BRIDGE_FEE_LABEL|0\.5%/.test(l));
if (!HUB_SWAP_LIVE) {
  /* ⛔ LE CAS EN VIGUEUR AUJOURD HUI : toute promesse tokenized↔tokenized TARIFEE doit vivre a
   *   l interieur de l affectation gardee. Hors d elle, elle s afficherait inconditionnellement. */
  t('la garde ternaire a bien ete isolee', affectation.length > 80);
  t('⛔ aucune promesse tokenized↔tokenized tarifee ne vit HORS de la garde',
    promesses.every((l) => affectation.includes(l.trim())));
  /* ⛔ ET LA PROMESSE EST BIEN DANS LA BRANCHE **VRAIE**, pas dans celle de repli : l y mettre par
   *   erreur inverserait exactement le defaut qu on corrige. */
  const vraie = affectation.split(/:\s*'/)[0];
  t('⛔ et elle est dans la branche VRAIE de la garde', /Tokenized↔tokenized/.test(vraie));
  /* ⛔ ET LE TEXTE DE REPLI DOIT EXISTER ET DIRE QUE CE N EST PAS VIVANT. Supprimer la phrase
   *   aurait ete l autre moitie du defaut : le visiteur qui cherche cette fonction merite de
   *   savoir qu elle n existe pas, au lieu de la chercher. */
  t('un texte de repli dit que ce n est pas vivant',
    /is not live yet/.test(sansCommentaires) && /cannot be settled/.test(sansCommentaires));
  /* ⛔ ET IL POINTE VERS CE QUI MARCHE : un renvoi honnete vaut mieux qu un silence. Supprimer la
   *   phrase aurait ete l autre moitie du defaut — le visiteur qui cherche cette fonction merite de
   *   savoir qu elle n existe pas, au lieu de la chercher. */
  t('et il nomme ce qui fonctionne vraiment', /through its own\s*'?\s*\+?\s*'?\s*market/.test(sansCommentaires));
  /* ⛔⛔ LE REPLI NE CITE AUCUN TARIF. C est tout le point : un chiffre a cote d une capacite
   *   absente est retenu, la reserve ne l est pas. */
  const repli = (sansCommentaires.match(/is not live yet[\s\S]*?market\.'/) || [''])[0];
  t('⛔ le texte de repli ne cite AUCUN pourcentage', !/%/.test(repli) && repli.length > 40);
  /* ⛔⛔⛔ ET LE LIEN VERS L ONGLET SURVIT. Ma premiere correction remplacait tout le paragraphe par
   *   un `<p>` vide : elle supprimait `#cGoBridge`, le SEUL lien vers un onglet qui rend de VRAIS
   *   services. `test-ids-fantomes.mjs` l a crie. J effacais une affordance qui MARCHE en
   *   corrigeant un texte qui MENTAIT — le motif « fail-closed sur une affordance efface le
   *   produit », deja paye ici. Cette assertion empeche la rechute. */
  t('⛔ le lien vers l onglet Bridge SURVIT a la correction', /id="cGoBridge"/.test(html));
} else {
  t('HUB_SWAP_LIVE est vrai : la promesse tarifee est legitime', true);
}

/* ══ 2. LA PHRASE EST DERIVEE, PAS ECRITE EN DUR ══════════════════════════════════════════════ */
t('le texte du renvoi est choisi par HUB_SWAP_LIVE',
  /HUB_SWAP_LIVE[\s\S]{0,160}Tokenized↔tokenized/.test(sansCommentaires));
t('et l element existe bien dans le HTML', /id="cBridgeRetarget"/.test(html));
/* ⛔ L EMPLACEMENT EST VIDE DANS LE HTML : si le peintre ne tourne jamais, l ecran ne montre RIEN
 *   plutot qu une promesse figee. Un texte manquant est honnete, un texte faux ne l est pas —
 *   exactement la regle deja appliquee au tarif (« — » plutot qu un chiffre de repli). */
/* ⛔ C EST LE `<span>` QUI EST VIDE, pas le paragraphe : le paragraphe porte le lien, et le vider
 *   emporterait le bouton. Si le peintre ne tourne pas, on ne montre AUCUNE promesse et le lien
 *   reste utilisable — meme regle que le « — » du tarif, appliquee a la CAPACITE. */
t('⛔ l emplacement du texte est VIDE dans le HTML, pas pre-rempli',
  /<span id="cBridgeRetargetTexte"><\/span>/.test(html));

/* ══ 3. LE TARIF, LUI, RESTE EXACT — la moitie inverse ════════════════════════════════════════ */
/* ⛔ SANS CETTE MOITIE, on pourrait faire passer ce fichier en retirant TOUS les tarifs. Le tarif
 *   du Bridge est juste et doit le rester : c est la capacite qui manquait, pas le chiffre. */
t('le label suit les bps, au centieme', BRIDGE_FEE_LABEL === (Number(BRIDGE_FEE_BPS) / 100) + '%');
t('et il est toujours affiche la ou le service EXISTE',
  (html.match(/data-frais-bridge/g) || []).length >= 4);

console.log((ko.length ? 'KO ' + ko.length : 'OK') + ' — ' + ok + ' assertions'
  + '   (HUB_SWAP_LIVE = ' + HUB_SWAP_LIVE + ')');
for (const k of ko) console.log('  KO ' + k);
process.exit(ko.length ? 1 : 0);
