// UNE SIGNATURE POUR TOUT (Phil, 2026-09-19 : « vasy fais le 1 clic 1 signature »).
//
// ⛔ MESURE (fork, interface, build 0109) : creer puis mettre en vie un block = 5 signatures d affilee
//    (creation, approve, Permit2, inscription payee au hook, ouverture du marche) — 5 fenetres de wallet, ~30 s.
//    Sur 3,5 h de prod : 0 inscription sur nos hooks. Chaque fenetre est une porte de sortie.
//
// Les wallets EIP-5792 (Coinbase Smart Wallet, Base App…) executent une LISTE d appels en une signature. Avec
// `atomicRequired: true`, c est tout ou rien : si un seul appel echoue, AUCUN n est applique — pas de block cree
// sans marche, pas de ≈ $1 paye sans block.
//
// ⚠️ CE QUE CE MODULE NE PROUVE PAS : qu un wallet donne sait grouper. On le DEMANDE (wallet_getCapabilities) ;
//    sans reponse claire, l app garde le parcours etape par etape. Aucun envoi ne part d ici sans le wallet.

/** Le wallet sait-il executer un lot ATOMIQUE sur cette chaine ? Faux au moindre doute. */
export async function peutGrouper({ eth, compte, chaineHex }) {
  if (!eth || typeof eth.request !== 'function' || !compte) return false;
  let caps;
  try { caps = await eth.request({ method: 'wallet_getCapabilities', params: [compte, [chaineHex]] }); }
  catch (_) { return false; }
  const c = caps && (caps[chaineHex] || caps[String(parseInt(chaineHex, 16))] || caps[parseInt(chaineHex, 16)]);
  if (!c) return false;
  const st = c.atomic && c.atomic.status;
  return st === 'supported' || st === 'ready' || !!(c.atomicBatch && c.atomicBatch.supported === true);
}

/** Lit un statut EIP-5792 (v2 : nombres 100/200/400/500/600 ; v1 : 'PENDING'/'CONFIRMED'). */
export function lireStatutGroupe(s) {
  const st = s && s.status;
  const recus = (s && s.receipts) || [];
  if (st === 100 || st === 'PENDING' || st == null) return { etat: 'EN_COURS' };
  if (st === 200 || st === 'CONFIRMED') {
    const ok = recus.length > 0 && recus.every((r) => r && (r.status === '0x1' || r.status === 1 || r.status === 'success'));
    return ok
      ? { etat: 'CONFIRME', hash: recus[recus.length - 1].transactionHash || null, recus }
      : { etat: 'ECHEC', pourquoi: 'a call in the batch reverted — nothing was applied', recus };
  }
  if (st === 400) return { etat: 'ECHEC', pourquoi: 'the wallet did not send it — nothing was applied' };
  if (st === 500) return { etat: 'ECHEC', pourquoi: 'the chain refused it — nothing was applied' };
  if (st === 600) return { etat: 'PARTIEL', pourquoi: 'the wallet applied only part of it — check your wallet before anything else' };
  return { etat: 'EN_COURS' };
}

/**
 * Envoie la liste en UNE signature, atomique, et attend le verdict.
 * @returns {Promise<{etat:'CONFIRME'|'REFUSE'|'ECHEC'|'PARTIEL'|'EN_ATTENTE', hash?:string, id?:string, pourquoi?:string}>}
 */
export async function envoyerGroupe({ eth, compte, chaineHex, calls, attendreMs = 240000, pauseMs = 1500 }) {
  let id;
  try {
    const r = await eth.request({ method: 'wallet_sendCalls', params: [{
      version: '2.0.0', chainId: chaineHex, from: compte, atomicRequired: true,
      calls: calls.map((c) => ({ to: c.to, data: c.data || '0x', value: c.value || '0x0' })),
    }] });
    id = typeof r === 'string' ? r : r && r.id;
  } catch (e) {
    const refus = e && (e.code === 4001 || /reject|denied|cancel/i.test(String(e.message)));
    return { etat: refus ? 'REFUSE' : 'ECHEC', pourquoi: refus ? 'you declined in your wallet — nothing was sent' : String((e && e.message) || e) };
  }
  if (!id) return { etat: 'ECHEC', pourquoi: 'the wallet returned no batch id — nothing is known to be sent' };
  const fin = Date.now() + attendreMs;
  while (Date.now() < fin) {
    await new Promise((ok) => setTimeout(ok, pauseMs));
    let s;
    try { s = await eth.request({ method: 'wallet_getCallsStatus', params: [id] }); } catch (_) { continue; }
    const v = lireStatutGroupe(s);
    if (v.etat !== 'EN_COURS') return { ...v, id };
  }
  return { etat: 'EN_ATTENTE', id, pourquoi: 'not confirmed yet — check your wallet before trying again' };
}

const pad = (a) => String(a).toLowerCase().replace(/^0x/, '').padStart(64, '0');
const mot = (n) => '0x' + BigInt(n).toString(16).padStart(64, '0');

/**
 * Un rpc qui repond, pour un block PAS ENCORE CREE, ce que la chaine repondra juste apres sa creation :
 * supply scellee, decimales fixes, tout le supply au createur, aucune autorisation. Tout le reste va a la chaine.
 * ⛔ Ce n est pas une supposition cachee : la creation et le lancement partent dans le MEME lot atomique — si la
 *    chaine ne donne pas exactement cet etat, un appel echoue et RIEN n est applique.
 */
export function rpcAvecBlockPrevu(rpc, { jeton, compte, supply, dec, solde, permit2 }) {
  const j = String(jeton).toLowerCase(), c = pad(compte), p2 = String(permit2).toLowerCase();
  return async (methode, params) => {
    const o = params && params[0];
    if (methode === 'eth_call' && o && typeof o === 'object') {
      const to = String(o.to || '').toLowerCase(), d = String(o.data || '').toLowerCase();
      if (to === j) {
        if (d.startsWith('0x18160ddd')) return mot(supply);
        if (d.startsWith('0x313ce567')) return mot(dec);
        if (d.startsWith('0x70a08231')) return mot(d.slice(10, 74) === c ? solde : 0n);
        if (d.startsWith('0xdd62ed3e')) return mot(0n);
      }
      if (to === p2 && d.startsWith('0x927da105') && d.slice(74, 138) === pad(j)) return '0x' + '0'.repeat(192);
    }
    if (methode === 'eth_getCode' && params && String(params[0]).toLowerCase() === j) return '0x';
    return rpc(methode, params);
  };
}
