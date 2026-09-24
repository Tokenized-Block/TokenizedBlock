/* mesure-a6cf-recoit-quoi.mjs — a6cf ENCAISSE-T-IL DE L ETH, OU DES JETONS ?
 *
 * ⛔⛔ POURQUOI CETTE MESURE EXISTE. Phil, 2026-09-24 : « si paye avec du gas c est notre reward »
 *     — c est-a-dire : presenter l ETH dans le rail fiat est juste, parce que c est l ETH qui nous
 *     revient. C est une AFFIRMATION VERIFIABLE, et une de mes propres notes la contredit
 *     partiellement : sur un swap a sortie exacte, le hook V6 prend son frais EN JETON.
 *     ⇒ Si une part reelle du revenu arrive en jetons, alors « achete de l ETH » ne couvre qu une
 *       partie du chemin, et il faut le SAVOIR avant de construire dessus.
 *
 * ⛔ ON NE RECOPIE AUCUN CHIFFRE DE MEMOIRE (`handoff-figures-rot`). Le 0,00280 ETH / 14 j deja
 *   mesure n est PAS reutilise ici : il est remesure, ou il n est pas cite.
 *
 * ⛔ CE QUE CETTE SONDE PEUT PROUVER : les entrees de JETONS (les `Transfer` ERC-20 sont des logs,
 *   donc lisibles exhaustivement) et le SOLDE ETH actuel.
 * ⛔⛔ CE QU ELLE NE PEUT PAS PROUVER, ET QUI DOIT ETRE DIT : le flux d ETH entrant. Un frais verse
 *     par un contrat arrive par un appel INTERNE, qui n emet aucun log. Sans API de trace, un
 *     solde ETH ne distingue pas « recu 10, depense 9 » de « recu 1 ». Je ne conclurai donc RIEN
 *     sur le montant d ETH — seulement sur sa presence, et sur la comparaison avec les jetons.
 */
const RPC = 'https://mainnet.base.org';
const A6CF = '0xa6cf99d35949c6cb911adb910078f4ca46f0f5d4';
const TRANSFER = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const topicAdr = (a) => '0x' + a.slice(2).toLowerCase().padStart(64, '0');

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
  return { erreur: 'illisible apres 4 essais' };
}

const tete = await rpc('eth_blockNumber', []);
if (tete.erreur) { console.log('⛔ tete de chaine illisible (' + tete.erreur + ') — rien conclu.'); process.exitCode = 1; }
else {
  const haut = parseInt(tete.ok, 16);
  /* Base : ~2 s par bloc ⇒ 14 j ≈ 604 800 s / 2 = 302 400 blocs. */
  const JOURS = 14, BLOCS = Math.floor((JOURS * 86400) / 2);
  const bas = haut - BLOCS;
  console.log('═══ QUE RECOIT a6cf ? ═══');
  console.log('fenetre : blocs ' + bas + ' → ' + haut + '  (' + JOURS + ' j a ~2 s/bloc)\n');

  const sol = await rpc('eth_getBalance', [A6CF, 'latest']);
  if (sol.erreur) console.log('solde ETH : ⛔ illisible (' + sol.erreur + ') — rien conclu');
  else console.log('solde ETH actuel : ' + (Number(BigInt(sol.ok)) / 1e18).toFixed(9) + ' ETH');
  console.log('⚠️ un SOLDE n est pas un REVENU : « recu 10 puis depense 9 » et « recu 1 » donnent');
  console.log('   le meme solde. Aucune conclusion de montant ne sera tiree de cette ligne.\n');

  /* ⛔ LA FENETRE EST SONDEE, PAS DEVINEE. Les noeuds plafonnent eth_getLogs et le plafond n est
   *   pas documente de la meme facon partout — on demande au noeud, on ne suppose pas. */
  let fenetre = 0;
  for (const essai of [50_000, 10_000, 2_000, 999]) {
    const t = await rpc('eth_getLogs', [{ fromBlock: '0x' + (haut - essai).toString(16),
      toBlock: '0x' + haut.toString(16), topics: [TRANSFER, null, topicAdr(A6CF)] }]);
    if (!t.erreur) { fenetre = essai; console.log('fenetre getLogs acceptee : ' + essai + ' blocs'); break; }
    console.log('  ' + essai + ' blocs refuse : ' + String(t.erreur).slice(0, 70));
  }
  if (!fenetre) { console.log('\n⛔ aucune fenetre acceptee — rien conclu.'); process.exitCode = 1; }
  else {
    const parJeton = new Map();
    let logs = 0, fenetresKo = 0, fenetresOk = 0;
    for (let h = haut; h > bas; h -= fenetre) {
      const b = Math.max(bas, h - fenetre + 1);
      const r = await rpc('eth_getLogs', [{ fromBlock: '0x' + b.toString(16),
        toBlock: '0x' + h.toString(16), topics: [TRANSFER, null, topicAdr(A6CF)] }]);
      if (r.erreur) { fenetresKo++; continue; }
      fenetresOk++;
      for (const l of r.ok || []) {
        logs++;
        const jeton = String(l.address).toLowerCase();
        const v = BigInt(l.data && l.data !== '0x' ? l.data : '0x0');
        const e = parJeton.get(jeton) || { n: 0, brut: 0n };
        e.n++; e.brut += v; parJeton.set(jeton, e);
      }
    }
    /* ⛔⛔ ON DIT COMBIEN DE FENETRES ONT ECHOUE. Un balayage incomplet presente comme complet est
     *     le motif `absence-of-evidence-vs-failure-to-look` : « 0 jeton recu » et « je n ai pas
     *     lu 30 % de la periode » ne doivent jamais s ecrire pareil. */
    console.log('\nbalayage : ' + fenetresOk + ' fenetres lues, ' + fenetresKo + ' EN ECHEC');
    if (fenetresKo) {
      console.log('⛔ ' + fenetresKo + ' fenetre(s) non lue(s) : le resultat ci-dessous est un PLANCHER,');
      console.log('   pas un total. Ne pas le citer comme exhaustif.');
    }
    console.log('\n── entrees de JETONS vers a6cf ──');
    if (!parJeton.size) {
      console.log('   AUCUN transfert de jeton recu sur la fenetre lue.');
      console.log('   ⇒ Sur cette periode, le revenu de a6cf n arrive PAS en jetons.');
    } else {
      for (const [j, e] of [...parJeton].sort((a, b) => b[1].n - a[1].n)) {
        console.log('   ' + j + '  ' + String(e.n).padStart(4) + ' transfert(s)  brut=' + e.brut.toString());
      }
      console.log('   ⚠️ « brut » est en unites du jeton : sans ses decimales, ce n est PAS un montant');
      console.log('      comparable. Je ne convertis pas ce que je n ai pas lu.');
    }
    console.log('\n' + logs + ' log(s) Transfer au total vers a6cf.');
    console.log('\n⛔ CE QUE CETTE SONDE NE DIT PAS : combien d ETH est entre. Les frais verses par un');
    console.log('   contrat passent par un appel INTERNE, sans log. Il faudrait une API de trace.');
  }
}
