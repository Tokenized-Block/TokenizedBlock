/* mesure-constats-audit.mjs — LES CONSTATS DE L AUDIT TIENNENT-ILS ENCORE ?
 *
 * ⛔⛔ POURQUOI. L enquete multi-agents du 2026-09-24 a rendu 20 constats BLOQUANTS. Six ont ete
 *     contre-enquetes (tous TIENNENT) ; quatorze ne l ont jamais ete — c etait un plafond que je
 *     m etais impose, pas une conclusion. Entre-temps j ai corrige beaucoup de choses.
 *     ⇒ Affirmer « 9 sont regles » de memoire serait exactement ce que ce depot interdit. On RELIT
 *       le code pour chacun, et on laisse la sonde trancher.
 *
 * ⛔ CHAQUE VERIFICATION EST UNE LECTURE, JAMAIS UN SOUVENIR. Et quand elle ne peut pas trancher,
 *   elle rend INDETERMINE — pas « regle ».
 */
import { readFileSync } from 'node:fs';

const lire = (f) => { try { return readFileSync(new URL('./' + f, import.meta.url), 'utf8'); } catch { return null; } };
const nu = (s) => (s || '').replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:'"\w])\/\/[^\n]*/g, '$1 ')
  .replace(/<!--[\s\S]*?-->/g, ' ');

const app = nu(lire('app.html'));
const srv = nu(lire('serveur-web.js'));
const x402 = nu(lire('x402-pay.js'));
const qa = nu(lire('test-bridge-x402-brain-0923.mjs'));

/* ⛔ Le nom « x402 » est-il encore REVENDIQUE a l ecran ? On lit le HTML visible, hors scripts et
 *   hors commentaires. ⛔ FENETRE SOUPLE, jamais « 70 caracteres de chaque cote » : une sonde qui
 *   exige un large contexte sur la MEME ligne rend « 0 occurrence » sur un texte bien present —
 *   ca m est arrive quatre fois aujourd hui. */
function revendiqueX402() {
  const visible = (lire('app.html') || '')
    .replace(/<!--[\s\S]*?-->/g, ' ').replace(/<script[\s\S]*?<\/script>/gi, ' ');
  return [...visible.matchAll(/(?:^|>)[^<>]{0,200}/g)].some((m) => /x402/i.test(m[0]));
}

/* ⛔ `regle` doit etre une FONCTION qui lit, jamais un booleen ecrit a la main. Un booleen serait
 *   mon opinion deguisee en mesure. */
const CONSTATS = [
  { id: 1, titre: 'Mark pay recognized ne verifiait aucun paiement',
    regle: () => /verifierPaiement\s*\(/.test(app) && /transaction hash is required/i.test(x402) },
  { id: 2, titre: '« You receive » promettait un net jamais livre',
    regle: () => /netEl\.textContent[\s\S]{0,200}HUB_SWAP_LIVE/.test(app) },
  { id: 3, titre: 'Le CTA Fund wallet ne pouvait jamais obtenir de session',
    regle: () => { const m = lire('onramp-session.js') || ''; return /montantFiat: null/.test(m); } },
  { id: 4, titre: 'sansNaviguer est INERTE — aucun appelant ne le passe',
    regle: () => /ouvrirProfil\([^)]*sansNaviguer/.test(app) || /\{\s*sansNaviguer:\s*true\s*\}/.test(app) },
  /* ⛔ MOTIF CORRIGE : il cherchait `miroirProgression|progressionDansCreate|cEtatProgression` —
   *   trois noms que j avais IMAGINES avant d ecrire le correctif. Le vrai s appelle
   *   `miroirVieDansCreate`, et il ecrit dans `#cVieProgression`. La sonde declarait donc « tient
   *   toujours » sur du code deja corrige : elle testait ma memoire, pas le depot. Une sonde qui
   *   cherche un nom suppose mesure la supposition. */
  { id: 5, titre: 'Le panneau de lancement est invisible depuis Create',
    regle: () => /miroirVieDansCreate/.test(app) && /cVieProgression/.test(app) },
  { id: 6, titre: 'Les messages d etape n ont qu une destination (#plProgression)',
    regle: () => { const i = app.indexOf('function majProgressionVie('); if (i < 0) return false;
      const c = app.slice(i, app.indexOf('\n}', i)); return /#cEtat|miroir/.test(c); } },
  { id: 7, titre: 'vie_echec absent des totaux : les echecs ne comptaient rien',
    regle: () => /vie_ko_etape/.test(app) && /vie_ko_etape1/.test(srv) },
  { id: 8, titre: '18 sorties d echec, une seule comptait',
    regle: () => { const i = app.indexOf('function vieAutoArreter('); if (i < 0) return false;
      return /etape\(\s*'vie_ko_/.test(app.slice(i, app.indexOf('\n}', i) + 2)); } },
  /* ⛔ CE CONSTAT ETAIT RENDU « INDETERMINE » — a raison, tant que rien ne s occupait du cas. Il
   *   est devenu mesurable le jour ou l echec a eu un chemin d affichage dans Create : on verifie
   *   que `vieAutoArreter` ECRIT quelque chose la-bas quand ca rate. Sans ca, le panneau garderait
   *   son texte de succes pendant que la vie a echoue dans un panneau invisible. */
  { id: 9, titre: 'Create garderait son texte de SUCCES pendant que la vie echoue ailleurs',
    regle: () => { const i = app.indexOf('function vieAutoArreter('); if (i < 0) return false;
      const j = app.indexOf('function ', i + 10);
      const c = app.slice(i, j > i ? j : i + 1200);
      return /miroirVieDansCreate/.test(c) && /not alive yet|stopped at step/i.test(c); } },
  { id: 10, titre: 'recordPay n exigeait aucune preuve',
    regle: () => /no verified payment/i.test(x402) },
  { id: 11, titre: 'Le montant n etait jamais confronte a la chaine',
    regle: () => /montantConstate/.test(x402) },
  { id: 12, titre: 'Le test de QA PROUVAIT l absence de verification',
    regle: () => /sansPreuve[\s\S]{0,200}ok,\s*false/.test(qa) },
  /* ⛔⛔ CES TROIS-LA DEMANDENT UNE DISTINCTION QUE « regle / tient » ne sait pas exprimer, et la
   *     confondre serait de la rationalisation.
   *     LE FAIT reste VRAI : nous n implementons pas le protocole x402 — pas de reponse 402, pas
   *     d en-tete X-PAYMENT, pas de facilitateur, pas de liaison paiement↔ressource.
   *     LE DEFAUT, lui, etait de REVENDIQUER ce nom a l ecran pour autre chose. Ce que l app fait
   *     depuis aujourd hui — vous payez par une transaction ordinaire, et on va la LIRE sur la
   *     chaine — est parfaitement defendable ; c est l emprunt du nom qui ne l etait pas.
   *   ⇒ On mesure donc la DISPARITION DE LA REVENDICATION, et on continue d afficher le fait. */
  { id: 13, titre: 'Pas de reponse HTTP 402 — et on ne revendique plus x402 a l ecran',
    regle: () => !revendiqueX402(), fait: 'aucun writeHead(402) dans le serveur : toujours vrai' },
  { id: 14, titre: 'Aucune primitive du protocole x402 — et le nom ne s affiche plus',
    regle: () => !revendiqueX402(), fait: 'ni X-PAYMENT, ni facilitateur, ni EIP-3009 : toujours vrai' },
  { id: 15, titre: 'Pas de liaison paiement <-> ressource — et plus de promesse de paywall',
    regle: () => !revendiqueX402(), fait: 'aucun routeKey : toujours vrai' },
  { id: 16, titre: 'La page LIVE ecrivait « pay recognized » sans txHash',
    regle: () => /bBotTx/.test(app) && /verifierPaiement/.test(app) },
];

console.log('═══ LES 16 CONSTATS NON CONTRE-ENQUETES, RELUS DANS LE CODE ═══\n');
let regles = 0, tiennent = 0, indetermines = 0;
for (const c of CONSTATS) {
  let r;
  try { r = c.regle(); } catch (e) { r = null; }
  if (r === null) { indetermines++; console.log('  ?  [' + String(c.id).padStart(2) + '] ' + c.titre);
    console.log('        INDETERMINE — une lecture de code ne peut pas trancher ce point.'); continue; }
  if (r) {
    regles++;
    console.log('  ✅ [' + String(c.id).padStart(2) + '] ' + c.titre);
    /* ⛔ QUAND LE FAIT RESTE VRAI, ON LE DIT. Un ✅ seul laisserait croire que la limite technique a
     *   disparu ; c est la REVENDICATION qui a disparu, pas le fait. */
    if (c.fait) console.log('        ⚠️ le fait reste vrai : ' + c.fait);
  }
  else { tiennent++; console.log('  ⛔ [' + String(c.id).padStart(2) + '] ' + c.titre + '  — TIENT TOUJOURS'); }
}

console.log('\n── verdict ──');
console.log(regles + ' regle(s) · ' + tiennent + ' tiennent toujours · ' + indetermines + ' indetermine(s)');
console.log('\n⛔ CE QUE CETTE SONDE NE PEUT PAS FAIRE : juger si un correctif est BON. Elle verifie');
console.log('   qu il est PRESENT. Un correctif present et faux passerait au vert ici — c est a quoi');
console.log('   servent les tests, pas cette sonde.');
process.exitCode = tiennent ? 1 : 0;
