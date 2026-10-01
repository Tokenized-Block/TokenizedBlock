/* UN LOT A MOITIE APPLIQUE N EST PAS UN ACHAT REUSSI.
 *
 * ⭐ CE FICHIER EXISTE A CAUSE DE L AUDIT ADVERSE DU 2026-10-01. Deux defauts de gravite « argent »
 *   vivaient dans `envoi.js`, sur le chemin exact de l achat, et AUCUN test ne couvrait ce chemin —
 *   `grep "ENVOYE_AA|getCallsStatus" test-*.mjs` ne rendait que des tests du JUMEAU.
 *
 * ⛔⛔⛔ DEFAUT 1 — LE VERDICT ETAIT LU SUR `receipts[0]`.
 *     const hash = receipts[0] && (...);
 *     if (hash) return { etat: 'ENVOYE_AA', ... };     // AVANT tout controle de status
 *   Les tests d echec qui suivaient etaient donc INATTEIGNABLES des qu un recu existait, et
 *   `receipts[0]` est la JAMBE 1. Un lot [swap V4 reussi, swap Aerodrome reverte] rendait
 *   `CONFIRME, atomique: true` : l ecran annoncait « Bought in one signature », le compteur
 *   `achat_ok` montait, et l acheteur n avait que le pivot — aucun frais preleve sur la 2e jambe.
 *   Un achat rate comptait comme un achat reussi, et un frais perdu passait pour un revenu.
 *   ⇒ Le code 600 (« partiellement applique ») n etait dans AUCUNE branche.
 *
 * ⛔⛔⛔ DEFAUT 2 — LE LOT ETAIT REJOUE APRES N IMPORTE QUELLE ERREUR.
 *   Le `catch` du premier `wallet_sendCalls` renvoyait le MEME tableau d appels en version 1.0 sans
 *   regarder la raison. Le commentaire disait « older wallets » ; la condition n existait pas. Une
 *   reponse JSON-RPC perdue — timeout, onglet en veille, WalletConnect qui tombe — rouvrait le
 *   wallet avec les memes appels. Signer une seconde fois executait TOUT deux fois.
 *
 * ⛔ CE QUE CE FICHIER NE PROUVE PAS : il teste la LECTURE et la DECISION, pas un vrai wallet. Il
 *   ne prouve pas qu un wallet donne rende bien 600 quand il applique a moitie — seulement que si
 *   on le lui dit, on ne l appelle plus un succes.
 */
import { lireStatutGroupe } from './groupe-wallet.js';
import { messageEnvoi, ENVOI_PARTI, ENVOI_RIEN_PARTI } from './envoi.js';
import { readFileSync } from 'node:fs';

let ok = 0; const ko = [];
const t = (nom, cond) => { if (cond) ok += 1; else ko.push(nom); };
const envoiBrut = readFileSync(new URL('./envoi.js', import.meta.url), 'utf8');
/**
 * ⛔⛔⛔ LE CODE SEUL, SANS LES COMMENTAIRES — ET C EST LA QUATRIEME FOIS DANS LA MEME JOURNEE.
 *   Des gardes statiques ont deja accuse a tort, trois fois, parce qu elles lisaient MA PROSE comme
 *   du code : un nom de compteur cite dans un commentaire, un motif `etape('...')` ecrit en clair,
 *   et une phrase citee a cote du mot qu on cherchait. Ici c est pire : les assertions qui
 *   verifient qu un defaut A DISPARU trouvent le defaut... dans le commentaire qui RACONTE sa
 *   disparition. Plus on documente une correction, plus la garde croit qu elle n a pas eu lieu.
 *   ⇒ On corrige la CAUSE, pas chaque assertion : tout ce qui scanne du code passe par ici.
 * ⚠️ CE DEPOUILLEUR EST NAIF et il le dit : il ne comprend ni les chaines contenant `/*` ni les
 *   expressions regulieres. Pour un fichier de ce depot — commentaires en tete de bloc, pas de
 *   `/*` dans une chaine — ca suffit, et le temoin ci-dessous le verifie au lieu de le supposer.
 */
const sansCommentaires = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const envoi = sansCommentaires(envoiBrut);

/* ══ 1. LE SCENARIO EXACT DE L AUDIT : jambe 1 passe, jambe 2 reverte ═════════════════════════ */
const lotMoitie = { status: 200, receipts: [
  { transactionHash: '0xaaa', status: '0x1' },   /* jambe 1 — le swap V4 */
  { transactionHash: '0xbbb', status: '0x0' },   /* jambe 2 — le swap Aerodrome, REVERTE */
] };
const v = lireStatutGroupe(lotMoitie);
t('un lot dont la 2e jambe reverte N EST PAS confirme', v.etat !== 'CONFIRME');
t('il est explicitement un ECHEC', v.etat === 'ECHEC');
t('et la raison dit que rien n a ete applique', /reverted|nothing was applied/i.test(v.pourquoi));
/* ⛔ LA LECTURE NAIVE QUI VIVAIT DANS `envoi.js` : prendre receipts[0] et s arreter. Ce test fige
 *   la difference, pour qu on voie tout de suite si quelqu un la reintroduit. */
t('⛔ la lecture naive (receipts[0] seul) aurait dit « succes »',
  lotMoitie.receipts[0].status === '0x1' && v.etat === 'ECHEC');

/* ⛔⛔ LE CODE 600 : le wallet DIT lui-meme n avoir applique qu une partie. */
const six = lireStatutGroupe({ status: 600, receipts: [{ transactionHash: '0xccc', status: '0x1' }] });
t('le code 600 rend PARTIEL', six.etat === 'PARTIEL');
t('et PARTIEL n est ni CONFIRME ni ECHEC', six.etat !== 'CONFIRME' && six.etat !== 'ECHEC');

/* ⛔ LE TEMOIN POSITIF : un lot entierement applique DOIT etre confirme, sinon cette garde
 *   refuserait tout et serait inutilisable. */
const bon = lireStatutGroupe({ status: 200, receipts: [
  { transactionHash: '0xaaa', status: '0x1' }, { transactionHash: '0xbbb', status: '0x1' }] });
t('TEMOIN : un lot entierement applique est CONFIRME', bon.etat === 'CONFIRME');
t('et il rend ses recus', (bon.recus || []).length === 2);
/* ⛔ UN LOT « 200 » SANS AUCUN RECU N EST PAS UN SUCCES : zero appel applique n est pas « tout ». */
t('un 200 sans aucun recu n est pas confirme',
  lireStatutGroupe({ status: 200, receipts: [] }).etat === 'ECHEC');

/* ══ 2. `envoi.js` UTILISE LE CANONIQUE, ET N A PLUS SA COPIE ═════════════════════════════════ */
t('envoi.js importe le helper canonique', /import \{ lireStatutGroupe \} from '\.\/groupe-wallet\.js'/.test(envoi));
t('envoi.js l APPELLE', /lireStatutGroupe\(st\)/.test(envoi));
/* ⛔⛔ LA COPIE FAIBLE NE DOIT PLUS EXISTER : une sortie sur `receipts[0]` suivie d un retour. */
t('⛔ la sortie sur receipts[0] a disparu',
  !/const hash = receipts\[0\][\s\S]{0,120}if \(hash\) return \{ etat: 'ENVOYE_AA'/.test(envoi));
t('⛔ et `atomique: true` n est plus affirme sans mesure', !/atomique: true/.test(envoi));
/* ⛔⛔ LE TEMOIN DU DEPOUILLEUR, parce qu une garde qui se trompe de texte est pire qu absente.
 *   Il doit avoir RETIRE quelque chose — sinon il ne depouille rien et toutes les assertions
 *   au-dessus redeviennent des lectures de prose — et il doit avoir GARDE le code. */
t('TEMOIN : le depouilleur a bien retire du texte', envoi.length < envoiBrut.length);
t('TEMOIN : et il a garde le code', /export function messageEnvoi/.test(envoi));
/* ⛔ ET LA PREUVE QUE LE DEFAUT EST BIEN RACONTE QUELQUE PART : si le commentaire disparaissait, on
 *   perdrait la memoire de pourquoi cette garde existe. Le texte doit rester dans le fichier BRUT. */
t('le defaut corrige reste DOCUMENTE dans le fichier', /atomique: true/.test(envoiBrut));
/* ⛔ A LA PLACE, UN FAIT VERIFIABLE : le nombre d appels confirmes, et sa comparaison. */
t('un fait verifiable remplace la promesse', /appelsConfirmes/.test(envoi) && /tousConfirmes/.test(envoi));

/* ══ 3. LE REJEU N EST PLUS AVEUGLE ═══════════════════════════════════════════════════════════ */
/* ⛔⛔ LE DISCRIMINANT DOIT ETRE APPLIQUE **AVANT** LE SECOND ENVOI, pas apres. Il existait deja
 *   dans ce fichier — une etape trop tard, c est-a-dire apres que le risque avait ete pris. */
const avantRepli = envoi.slice(0, envoi.indexOf("version: '1.0'"));
t('le repli 1.0 est garde par un test sur la raison de l erreur',
  /not supported|32601/.test(avantRepli));
t('et ce garde refuse AVANT de rouvrir le wallet',
  /return \{ etat: 'ECHEC_ENVOI', sendCallsUnsupported: false/.test(avantRepli));
t('le refus explique le risque de double execution',
  /would run the whole thing twice|already be on its way/i.test(envoi));

/* ══ 4. LES FAMILLES D ETAT : PARTIEL N EST JAMAIS « RIEN N EST PARTI » ═══════════════════════ */
t('⛔⛔ PARTIEL n est PAS dans « rien n est parti »', !ENVOI_RIEN_PARTI.includes('PARTIEL'));
t('PARTIEL est bien dans « quelque chose est parti »', ENVOI_PARTI.includes('PARTIEL'));
const m = messageEnvoi({ etat: 'PARTIEL', pourquoi: 'the wallet applied only part of it' });
t('le message dit qu une PARTIE a ete appliquee', /Partly applied/i.test(m));
t('il interdit de resigner', /do NOT sign again/.test(m));
/* ⛔ ET IL NE DIT JAMAIS QUE RIEN N A BOUGE — ce serait un mensonge sur le seul ecran ou la
 *   personne decide si elle doit agir. */
t('⛔ il ne dit JAMAIS « nothing moved »', !/nothing moved|untouched/i.test(m));
/* ⛔ IL DIT CE QUE LA PERSONNE DETIENT MAINTENANT : sans ca, elle cherche une transaction entiere
 *   qui n existe pas. */
t('il nomme l actif intermediaire', /in-between asset/i.test(m));
/* ⛔ TEMOIN INVERSE : un vrai « rien n est parti » doit, lui, rassurer. Sans cette moitie, on
 *   pourrait faire passer le test en rendant tout alarmant. */
const rien = messageEnvoi({ etat: 'REFUSE_PAR_UTILISATEUR', pourquoi: 'you declined' });
t('TEMOIN INVERSE : un refus utilisateur dit bien que rien n a bouge', /nothing moved/i.test(rien));
t('et les deux messages DIFFERENT', m !== rien);

console.log((ko.length ? 'KO ' + ko.length : 'OK') + ' — ' + ok + ' assertions');
for (const k of ko) console.log('  KO ' + k);
process.exit(ko.length ? 1 : 0);
