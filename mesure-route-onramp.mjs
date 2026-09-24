/* mesure-route-onramp.mjs — LA ROUTE FIAT REPOND-ELLE VRAIMENT CE QU ON CROIT ?
 *
 * ⛔ POURQUOI UNE SONDE ET PAS UN CURL. PowerShell 5.1 jette le CORPS des reponses 4xx : mes quatre
 *    premiers appels ont rendu trois lignes VIDES. Une ligne vide se lit comme « pas de probleme »
 *    alors qu elle veut dire « je n ai pas regarde ». C est `absence-of-evidence-vs-failure-to-look`
 *    au niveau de l outil de mesure lui-meme — et c est deja arrive aujourd hui avec un `2>/dev/null`.
 *
 * ⛔ CETTE SONDE NE PROUVE PAS QUE LE RAIL ENCAISSE. Elle prouve ce que la route REPOND quand la
 *    cle est absente — c est-a-dire l etat exact de la production aujourd hui.
 */
const BASE = process.argv[2] || 'http://127.0.0.1:8837';
const A = '0xa6cf99d35949c6cb911adb910078f4ca46f0f5d4';

/* ⛔⛔ CES ATTENTES ONT ETE REECRITES LE 2026-09-24, ET LA RAISON EST LA LECON.
 *     Elles avaient ete ecrites pour un monde SANS cle CDP : « demande valide » attendait le refus
 *     `CDP_API_KEY_ID`, et « montant absent » attendait un 400. Le jour ou la cle a ete posee et ou
 *     le montant est devenu facultatif, la sonde s est mise a declarer « non conforme » sur des
 *     SUCCES — et son alarme « une URL a ete fabriquee sans jeton » se declenchait sur des URL qui
 *     en portaient un.
 *   ⇒ Une sonde mesure une CONFIGURATION. Quand la configuration change, elle se corrige ou elle
 *     ment — et une sonde qui alarme a tort finit par etre ignoree le jour ou elle a raison.
 *
 * ⛔ CE QUI NE CHANGE PAS : les REFUS. Ce sont eux qui protegent, et ils doivent tenir avec la cle
 *   exactement comme sans elle. Une cle valide ne doit jamais assouplir une validation. */
const CAS = [
  ['demande valide', `adresse=${A}&montant=20`, 200, /"ok":true/],
  ['adresse tronquee', 'adresse=0xa6cf&montant=20', 400, /whole wallet address/i],
  ['adresse absente', 'montant=20', 400, /whole wallet address/i],
  /* ⛔ le montant est FACULTATIF depuis le 2026-09-24 : l avoir rendu obligatoire avait tue le rail
   *   entier, le seul appelant n en envoyant pas. Un 200 est donc le comportement ATTENDU ici. */
  ['montant absent (facultatif)', `adresse=${A}`, 200, /"ok":true/],
  ['montant present mais vide', `adresse=${A}&montant=`, 400, /blank/i],
  ['montant non numerique', `adresse=${A}&montant=abc`, 400, /not a number/i],
  ['montant au-dessus de la borne', `adresse=${A}&montant=99999`, 400, /caution bound/i],
  ['actif euro (banni ici)', `adresse=${A}&montant=20&actif=EURC`, 400, /asset must be one of/i],
  ['actif inconnu', `adresse=${A}&montant=20&actif=BTC`, 400, /asset must be one of/i],
  ['actif USDC (valide)', `adresse=${A}&montant=20&actif=USDC`, 200, /"ok":true/],
];

let ok = 0, ko = 0;
console.log('═══ /api/onramp/session — ' + BASE + ' ═══\n');
for (const [nom, q, codeAttendu, motif] of CAS) {
  let r, texte;
  try {
    r = await fetch(BASE + '/api/onramp/session?' + q);
    texte = await r.text();
  } catch (e) {
    /* ⛔ une panne de sonde n est PAS un echec de la route : on le dit, on ne compte pas un KO */
    console.log('⚠️  ' + nom.padEnd(34) + ' SONDE EN PANNE (' + String(e.message).slice(0, 40) + ') — rien conclu');
    continue;
  }
  const bonCode = r.status === codeAttendu;
  const bonMotif = motif.test(texte);
  /* ⛔⛔ LE CAS QUI COMPTE LE PLUS, ET IL A FALLU LE REECRIRE. Il interdisait TOUTE url Coinbase —
   *     ce qui etait juste tant qu aucune cle n existait, et devenu faux le jour ou la route en
   *     rend de vraies. Ce qu il faut interdire n est pas l url : c est une url SANS JETON, qui
   *     menerait a une page d erreur. On garde donc la garde en la visant correctement. */
  const urlSansJeton = /pay\.coinbase\.com/.test(texte) && !/sessionToken=[^"&]+/.test(texte);
  const bon = bonCode && bonMotif && !urlSansJeton;
  if (bon) ok++; else ko++;
  console.log((bon ? '✅ ' : '⛔ ') + nom.padEnd(34) + ' HTTP ' + r.status
    + (bonCode ? '' : ' (attendu ' + codeAttendu + ')')
    + (bonMotif ? '' : ' · MOTIF ABSENT')
    + (urlSansJeton ? ' · ⛔⛔ UNE URL COINBASE A ETE FABRIQUEE SANS JETON' : ''));
  console.log('     ' + texte.slice(0, 150));
}
console.log('\n' + ok + ' conformes · ' + ko + ' non conformes sur ' + CAS.length + ' cas');
console.log('⚠️ CE QUE CETTE SONDE NE DIT TOUJOURS PAS : que quelqu un peut ACHETER. Elle prouve que');
console.log('   Coinbase nous rend un jeton de session pour notre JWT — donc que la cle et la');
console.log('   signature sont acceptees. Le parcours d achat lui-meme, le paiement par carte et');
console.log('   l arrivee des fonds ne sont PAS exerces ici, et 0 $ n a ete encaisse.');
/* ⛔⛔ `process.exitCode`, JAMAIS `process.exit()`. Ma premiere version appelait `process.exit(0)` :
 *     sur Windows, sortir pendant qu un socket `fetch` se ferme encore declenche une assertion
 *     libuv (`!(handle->flags & UV_HANDLE_CLOSING)`) et le processus rend -1073740791 — APRES avoir
 *     imprime « 9 conformes · 0 non conformes ». Une garde de deploiement qui lit le code de sortie
 *     verrait donc un ECHEC sur une mesure entierement reussie, et le texte au-dessus dirait le
 *     contraire. `exitCode` laisse node fermer ses poignees puis sortir proprement. */
process.exitCode = ko === 0 ? 0 : 1;
