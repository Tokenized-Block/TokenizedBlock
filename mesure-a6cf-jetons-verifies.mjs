/* mesure-a6cf-jetons-verifies.mjs — a6cf DETIENT-IL VRAIMENT CES JETONS ?
 *
 * ⛔⛔ POURQUOI CETTE SECONDE PASSE EXISTE. Ma premiere sonde a lu 29 logs `Transfer` vers a6cf sur
 *     14 jours, dont DEUX d exactement 1e27 — la supply entiere d un block. Un frais ne ressemble
 *     pas a ca. Et ma propre regle dit : UN EVENEMENT N EST PAS UNE TRANSACTION. N importe quel
 *     contrat peut emettre un `Transfer` nommant une adresse qui n a jamais rien recu ; c est un
 *     procede de spam courant, et deux faux ont deja ete pris comme vrais dans ce projet.
 *
 * ⇒ ON VERIFIE CONTRE L ETAT, PAS CONTRE LES LOGS. `balanceOf(a6cf)` est du STOCKAGE : il ne peut
 *   pas etre falsifie par un log. Un solde nul en face d un « transfert recu » est la preuve que
 *   l evenement etait un mensonge — ou que les jetons sont repartis, ce qui se distingue.
 *
 * ⛔ CE QUE CETTE SONDE PROUVE : la detention ACTUELLE, et le nom/les decimales tels que le contrat
 *   les declare. Elle ne dit pas d ou venaient les jetons ni s ils ont ete vendus.
 */
const RPC = 'https://mainnet.base.org';
const A6CF = '0xa6cf99d35949c6cb911adb910078f4ca46f0f5d4';

/* les 9 jetons vus dans les logs de la passe precedente — repris tels quels, aucun retape */
const VUS = [
  ['0xb2000000000000000000006d6f9102e9e4b221e0', 13, '149396347517599591340743'],
  ['0xb20000000000000000000071224edc6587e362d2', 5, '1244811424523423334607270'],
  ['0x58bdc4310db1b19854ca9066deed7e3df4f2ec9b', 3, '2128269777454243'],
  ['0xb200000000000000000000df3ffcd9be89b3843c', 2, '1981261382432368210651'],
  ['0xb20000000000000000000024c30d3fcb7931272e', 2, '98532313699999961351'],
  ['0xb200000000000000000000e63ffc3f40bf92a042', 1, '1000000000000000000000000000'],
  ['0x5354057f7fdaa8d9f6b894f2b44d187273993b06', 1, '10000000000000000000'],
  ['0xb200000000000000000000ab549fa65ad4edae3f', 1, '1000000000000000000000000000'],
  ['0xb2000000000000000000004ff41cbd5ef8e49f14', 1, '1986617653252006543005'],
];

/* ⛔ selecteurs de fonctions standard, courts et verifiables a l oeil :
 *   balanceOf(address) 0x70a08231 · symbol() 0x95d89b41 · decimals() 0x313ce567 */
const SEL_BAL = '0x70a08231', SEL_SYM = '0x95d89b41', SEL_DEC = '0x313ce567';

async function rpc(m, p) {
  for (let e = 0; e < 4; e++) {
    try {
      const r = await fetch(RPC, { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: m, params: p }) });
      if (r.status === 429) { await new Promise((k) => setTimeout(k, 700 * 2 ** e)); continue; }
      const j = await r.json();
      if (j.error) return { erreur: j.error.message };
      return { ok: j.result };
    } catch (err) { if (e === 3) return { erreur: String(err.message || err) }; }
  }
  return { erreur: 'illisible' };
}

function texteAbi(hex) {
  /* une chaine ABI : offset, longueur, octets. On echoue PROPREMENT plutot que de deviner. */
  try {
    const d = hex.slice(2);
    if (d.length < 128) return null;
    const len = parseInt(d.slice(64, 128), 16);
    if (!Number.isFinite(len) || len === 0 || len > 64) return null;
    const s = Buffer.from(d.slice(128, 128 + len * 2), 'hex').toString('utf8');
    return /^[\x20-\x7e]+$/.test(s) ? s : null;
  } catch (_) { return null; }
}

console.log('═══ a6cf DETIENT-IL CE QUE LES LOGS ANNONCENT ? ═══\n');
let detenus = 0, vides = 0, illisibles = 0;
for (const [jeton, nLogs, brutLogs] of VUS) {
  const bal = await rpc('eth_call', [{ to: jeton, data: SEL_BAL + A6CF.slice(2).padStart(64, '0') }, 'latest']);
  const sym = await rpc('eth_call', [{ to: jeton, data: SEL_SYM }, 'latest']);
  const dec = await rpc('eth_call', [{ to: jeton, data: SEL_DEC }, 'latest']);

  /* ⛔⛔ TROIS ETATS, JAMAIS DEUX : detenu · solde nul · LECTURE ECHOUEE. Confondre le troisieme
   *     avec le deuxieme ferait ecrire « il ne detient rien » sur une panne de RPC. */
  if (bal.erreur || !bal.ok || bal.ok === '0x') {
    illisibles++;
    console.log('⛔ ' + jeton + '  LECTURE ECHOUEE (' + String(bal.erreur || 'reponse vide').slice(0, 45) + ') — rien conclu');
    continue;
  }
  const solde = BigInt(bal.ok);
  const d = (!dec.erreur && dec.ok && dec.ok !== '0x') ? Number(BigInt(dec.ok)) : null;
  const symbole = (!sym.erreur && sym.ok) ? (texteAbi(sym.ok) || '?') : '?';
  const lisible = (d !== null && d >= 0 && d <= 36)
    ? (Number(solde) / 10 ** d).toLocaleString('fr-FR', { maximumFractionDigits: 4 }) : solde.toString() + ' (unites brutes)';

  if (solde === 0n) {
    vides++;
    console.log('⚠️ ' + jeton + '  ' + symbole.padEnd(12) + ' solde 0'
      + '  — ' + nLogs + ' log(s) annonçaient une entree');
    /* ⛔ ON NE CRIE PAS « FAUX » : un solde nul peut aussi vouloir dire « recu puis reparti ».
     *   Les deux sont indiscernables d ici, et le dire est plus utile que de trancher. */
    console.log('      ⇒ soit l evenement etait du spam, soit les jetons sont repartis. Indiscernable ici.');
  } else {
    detenus++;
    console.log('✅ ' + jeton + '  ' + symbole.padEnd(12) + ' DETENU : ' + lisible
      + (d !== null ? '  (' + d + ' dec.)' : ''));
    if (brutLogs === '1000000000000000000000000000') {
      console.log('      ⛔ 1e27 = la SUPPLY ENTIERE d un block. Ce n est pas un frais : quelqu un a');
      console.log('         envoye tout un jeton ici. A regarder de pres avant d appeler ca un revenu.');
    }
  }
}

console.log('\n── verdict ──');
console.log(detenus + ' jeton(s) reellement DETENU(S) · ' + vides + ' a solde nul · ' + illisibles + ' illisible(s)');
if (illisibles) console.log('⛔ ' + illisibles + ' lecture(s) ratee(s) : le compte de detenus est un PLANCHER.');
console.log('\n⛔ CE QUE CECI NE DIT PAS : la VALEUR de ces jetons. Un solde non nul dans un jeton sans');
console.log('   marche vaut zero dollar. « Detenu » et « encaisse » sont deux choses differentes.');
