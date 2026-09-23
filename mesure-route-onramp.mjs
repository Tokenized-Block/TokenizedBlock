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

const CAS = [
  ['demande valide, AUCUNE cle', `adresse=${A}&montant=20`, 200, /CDP_API_KEY_ID/],
  ['adresse tronquee', 'adresse=0xa6cf&montant=20', 400, /whole wallet address/i],
  ['adresse absente', 'montant=20', 400, /whole wallet address/i],
  ['montant absent', `adresse=${A}`, 400, /amount is required/i],
  ['montant non numerique', `adresse=${A}&montant=abc`, 400, /not a number/i],
  ['montant au-dessus de la borne', `adresse=${A}&montant=99999`, 400, /caution bound/i],
  ['actif euro (banni ici)', `adresse=${A}&montant=20&actif=EURC`, 400, /asset must be one of/i],
  ['actif inconnu', `adresse=${A}&montant=20&actif=BTC`, 400, /asset must be one of/i],
  ['actif USDC (valide)', `adresse=${A}&montant=20&actif=USDC`, 200, /CDP_API_KEY_ID/],
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
  /* ⛔⛔ LE CAS QUI COMPTE LE PLUS : aucune reponse, meme d erreur, ne doit contenir d URL Coinbase.
   *     Une url fabriquee sans jeton serait un bouton qui mene a une page d erreur. */
  const urlFuitee = /pay\.coinbase\.com/.test(texte);
  const bon = bonCode && bonMotif && !urlFuitee;
  if (bon) ok++; else ko++;
  console.log((bon ? '✅ ' : '⛔ ') + nom.padEnd(34) + ' HTTP ' + r.status
    + (bonCode ? '' : ' (attendu ' + codeAttendu + ')')
    + (bonMotif ? '' : ' · MOTIF ABSENT')
    + (urlFuitee ? ' · ⛔⛔ UNE URL COINBASE A ETE FABRIQUEE SANS JETON' : ''));
  console.log('     ' + texte.slice(0, 150));
}
console.log('\n' + ok + ' conformes · ' + ko + ' non conformes sur ' + CAS.length + ' cas');
console.log('⚠️ CE QUE CETTE SONDE NE DIT PAS : si Coinbase accepte notre jeton. Aucune cle ici,');
console.log('   aucun appel reel, 0 $ encaisse. Le chemin « OK » reste NON EXERCE.');
/* ⛔⛔ `process.exitCode`, JAMAIS `process.exit()`. Ma premiere version appelait `process.exit(0)` :
 *     sur Windows, sortir pendant qu un socket `fetch` se ferme encore declenche une assertion
 *     libuv (`!(handle->flags & UV_HANDLE_CLOSING)`) et le processus rend -1073740791 — APRES avoir
 *     imprime « 9 conformes · 0 non conformes ». Une garde de deploiement qui lit le code de sortie
 *     verrait donc un ECHEC sur une mesure entierement reussie, et le texte au-dessus dirait le
 *     contraire. `exitCode` laisse node fermer ses poignees puis sortir proprement. */
process.exitCode = ko === 0 ? 0 : 1;
