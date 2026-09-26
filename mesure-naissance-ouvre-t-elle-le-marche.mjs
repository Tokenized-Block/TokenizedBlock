/* mesure-naissance-ouvre-t-elle-le-marche.mjs — LA NAISSANCE CHOISIT-ELLE NOTRE HOOK, OU REMET-ELLE
 * LE CHOIX A PLUS TARD ?
 *
 * ⛔⛔ CE QUI A DECLENCHE CETTE MESURE (Phil, 2026-09-26) : « notre frais n existe que si le createur
 *     choisit notre hook, et personne ne le choisit. force le choix direct ».
 *     Mesure du meme jour, 24 h, 44 fenetres sur 44 : 685 pools B20 ouvertes, ZERO sur notre hook,
 *     14 378 echanges B20 dont 100 % ne nous paient rien. Et `mesure-qui-tient-le-marche` avait
 *     deja etabli que 4 naissances sur 6 ouvrent leur marche DANS LA MEME TRANSACTION, chez un
 *     concurrent, sur une pool a 0,00 %.
 *
 * ⛔ ON NE PEUT PAS FORCER LA POOL D UN TIERS : la factory B20 est PUBLIQUE, n importe qui ouvre le
 *   marche qu il veut avec le hook qu il veut. Le seul endroit ou le choix est A NOUS est la
 *   naissance faite PAR NOTRE APP. La question fermee est donc :
 *     le `createPaid` du CreateRouter ouvre-t-il la pool dans la MEME transaction,
 *     ou le block nait-il endormi, laissant le choix du hook a un geste ulterieur ?
 *
 * COMMENT ON TRANCHE, SANS CROIRE UN COMMENTAIRE (deux ont ete dementis par la chaine aujourd hui) :
 *   1. le CreateRouter connait-il le PoolManager ? Son bytecode contient-il son adresse ?
 *      ⛔ UNE ABSENCE N EST PAS UNE PREUVE : une adresse peut etre calculee, ou vivre dans un
 *        contrat appele. Un OUI est informatif ; un NON ne conclut rien, et c est dit.
 *   2. la preuve qui decide : pour un block NE via le CreateRouter, la transaction de naissance
 *      contient-elle AUSSI un log `Initialize` du PoolManager ? Meme `transactionHash` = meme
 *      geste ; hash different = le choix a ete remis a plus tard.
 *
 * ⛔ LECTURE SEULE. Aucune signature, aucune transaction.
 */
import { selecteur } from './keccak.js';

const RPC = process.env.TB_RPC || 'https://mainnet.base.org';
const PM_V4 = '0x498581ff718922c3f8e6a244956af099b2652b2b';
const { CREATE_ROUTER } = await import('./frais-creation.js');
/* ⛔ TOPIC COPIE DE LA SONDE QUI L UTILISE DEJA, jamais recalcule de tete : un topic faux rendrait
 *   zero log et se lirait comme « la naissance n ouvre rien », ce qui est exactement la conclusion
 *   qu on cherche a etablir. Le piege serait parfait. */
const TOPIC_INITIALIZE = '0xdd466e674ea557f56295e2d0218a125ea4b4f0f6f3307b95f85e6110838d6438';

const souffler = (ms = 350) => new Promise((r) => setTimeout(r, ms));
async function rpc(method, params, essais = 4) {
  for (let i = 0; i < essais; i++) {
    const r = await fetch(RPC, { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
    const j = await r.json();
    if (!j.error) return j.result;
    const msg = j.error.message || String(j.error.code);
    /* ⛔ ON NE REESSAIE QUE L ETRANGLEMENT : un revert est une reponse du contrat, pas un refus. */
    if (!/rate limit|too many|429|limited/i.test(msg) || i === essais - 1) throw new Error(msg);
    await souffler(1000 * (i + 1));
  }
}

console.log('═══ LA NAISSANCE OUVRE-T-ELLE LE MARCHE ? ═══\n');
console.log('CreateRouter : ' + CREATE_ROUTER);
console.log('PoolManager  : ' + PM_V4 + '\n');

/* ── 1. le CreateRouter connait-il le PoolManager ? ─────────────────────────────────────────── */
const code = await rpc('eth_getCode', [CREATE_ROUTER, 'latest']);
if (!code || code === '0x') {
  console.log('⛔ le CreateRouter n a AUCUN bytecode a cette adresse — rien d autre ne tient.');
  process.exit(1);
}
const nu = code.toLowerCase();
const pmDansCode = nu.includes(PM_V4.replace(/^0x/, '').toLowerCase());
console.log('── 1. le CreateRouter porte-t-il l adresse du PoolManager ? ──');
console.log('  bytecode : ' + ((nu.length - 2) / 2) + ' octets');
console.log('  adresse du PoolManager presente : ' + (pmDansCode ? 'OUI' : 'NON'));
console.log('  ⛔ UN « NON » NE CONCLUT RIEN : l adresse peut etre calculee, ou vivre dans un');
console.log('    contrat que celui-ci appelle. Seule l etape 2 tranche.');

/* ── 2. la preuve : naissance et ouverture, meme transaction ? ──────────────────────────────── */
console.log('\n── 2. LA PREUVE — meme transaction, ou deux gestes ? ──');
const tete = parseInt(await rpc('eth_blockNumber', []), 16);
/* ⛔ 2000 blocs par fenetre : le noeud public refuse au-dela, et un refus se lirait comme un vide. */
/* ⛔ LA FENETRE EST UN PARAMETRE, ET SA VALEUR PAR DEFAUT A DEJA MENTI. 60 fenetres = 67 h : les six
 *   creations connues datent du 2026-09-19 au 09-23, donc HORS de cette fenetre. La sonde a
 *   correctement refuse de trancher, mais un lecteur presse aurait lu « 0 naissance » comme
 *   « le chemin ne sert pas », alors qu il ne servait pas SUR CES 67 HEURES. */
const PAS = 2000, FENETRES = Number(process.env.TB_FENETRES || 60);
/* ⛔⛔ MA PREMIERE VERSION MESURAIT UN ZERO PAR IMPOSSIBILITE, et elle l a fait DEUX fois.
 *     Elle lisait `eth_getLogs` SUR L ADRESSE DU CreateRouter. 210 fenetres sur 210, zero ratee,
 *     233 heures de chaine : « 0 naissance ». Or l entonnoir de production dit `cree` = 6.
 *     Deux mesures qui ne peuvent pas coexister — donc l une est cassee, et c etait la mienne :
 *     RIEN NE GARANTIT QUE CE CONTRAT EMETTE UN SEUL EVENEMENT. Un routeur de 3 131 octets peut
 *     tres bien ne rien journaliser. Mon zero ne mesurait pas l usage, il mesurait son silence.
 *   ⇒ ON INVERSE LA DEPENDANCE : on part des `Created` de la FACTORY, dont on sait qu ils existent
 *     (296 lus en 24 h par `mesure-manque-a-gagner`), et on lit le `to` de leur transaction.
 *     `to == CREATE_ROUTER` prouve le passage par notre chemin paye, sans rien supposer des logs. */
const FACTORY = (await import('./tokenomics.js')).FACTORY
  || (await import('./index-blocks.js').catch(() => ({}))).FACTORY;
if (!FACTORY) { console.log('⛔ adresse de la factory introuvable — je ne la devine pas.'); process.exit(1); }
console.log('  factory lue : ' + FACTORY);
let vues = 0, ratees = 0, crees = 0, parNotreRoute = 0, naissances = 0, memeTx = 0, txSeules = [];
const txVues = new Set();
for (let i = 0; i < FENETRES; i++) {
  const fin = tete - i * PAS, debut = fin - PAS + 1;
  try {
    await souffler();
    const logs = await rpc('eth_getLogs', [{ address: FACTORY,
      fromBlock: '0x' + debut.toString(16), toBlock: '0x' + fin.toString(16) }]);
    vues++;
    for (const l of logs || []) {
      const tx = l.transactionHash;
      if (txVues.has(tx)) continue;
      txVues.add(tx);
      crees++;
      await souffler();
      const t = await rpc('eth_getTransactionByHash', [tx]);
      const to = String((t && t.to) || '').toLowerCase();
      if (to !== String(CREATE_ROUTER).toLowerCase()) continue;
      parNotreRoute++; naissances++;
      await souffler();
      const rec = await rpc('eth_getTransactionReceipt', [tx]);
      const aInit = (rec && rec.logs || []).some((x) =>
        String(x.address).toLowerCase() === PM_V4 && (x.topics || [])[0] === TOPIC_INITIALIZE);
      if (aInit) memeTx++; else txSeules.push(tx);
    }
  } catch (e) { ratees++; }
}
console.log('  transactions de creation vues (toutes origines) : ' + crees);
console.log('  dont passees par NOTRE CreateRouter paye        : ' + parNotreRoute);
console.log('  fenetres lues : ' + vues + '/' + FENETRES + ' (ratees ' + ratees + ')'
  + '  ~' + ((FENETRES * PAS * 2) / 3600).toFixed(1) + ' h de chaine');
console.log('  naissances via le CreateRouter : ' + naissances);
if (!naissances) {
  /* ⛔⛔ UN ZERO QUI NE PEUT PAS MONTER RESSEMBLE A UN ZERO DE SUCCES. Ici il ne dit rien sur le
   *     contrat : il dit que personne n a cree par ce chemin sur la fenetre. La question du
   *     « meme geste » reste OUVERTE, et on ne la tranche pas par defaut. */
  console.log('  ⛔ AUCUNE naissance sur la fenetre : cette sonde NE PEUT PAS trancher.');
  console.log('    Ce zero ne dit RIEN du contrat — il dit que ce chemin n a pas servi.');
  console.log('    ⚠️ Et c est deja une mesure : notre chemin paye est inutilise.');
  process.exitCode = 2;
} else {
  console.log('  dont la MEME transaction ouvre aussi une pool : ' + memeTx + '/' + naissances);
  if (memeTx === naissances) {
    console.log('  ✅ la naissance OUVRE le marche : le hook est choisi dans le meme geste.');
  } else {
    console.log('  ⛔⛔ ' + (naissances - memeTx) + ' naissance(s) SANS ouverture de pool : le block');
    console.log('    nait endormi, et le choix du hook est remis a un geste ulterieur — celui que');
    console.log('    les concurrents font dans la meme transaction.');
    for (const t of txSeules.slice(0, 5)) console.log('      tx ' + t);
  }
}

console.log('\n── CE QUE CETTE SONDE NE DIT PAS ──');
console.log('⛔ Elle ne peut pas forcer la pool d un tiers : la factory B20 est PUBLIQUE.');
console.log('⛔ Elle ne dit pas combien un marche ouvert chez nous rapporterait : il faut du volume.');
console.log('⛔ Un « NON » a l etape 1 ne prouve pas l absence d ouverture — seule l etape 2 tranche.');
