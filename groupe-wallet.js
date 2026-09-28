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

/* ⛔⛔ BUG REPRODUIT (2026-09-19, capture de Phil dans le navigateur d un wallet) : ce wallet ne repond JAMAIS a
 *    wallet_getCapabilities — ni oui, ni erreur. Sans delai, l app restait figee sur « Step 1 — create it », 0 envoi.
 *    Toute question au wallet qui n ouvre pas de fenetre a signer a desormais un delai ; au-dela, on fait comme « non ». */
const DELAI = Symbol('delai');
const avecDelai = (p, ms) => Promise.race([p, new Promise((ok) => setTimeout(() => ok(DELAI), ms))]);

/** Les trois issues. ⛔ TROIS, PAS DEUX — la raison est juste en dessous. */
export const CAPACITES_LOT = Object.freeze(['OUI', 'NON', 'ILLISIBLE']);

/**
 * La capacite de groupement, EN TROIS ETATS.
 *
 * ⛔⛔ POURQUOI TROIS, ET POURQUOI CA A ETE AJOUTE LE 2026-09-28. `peutGrouper` rendait `false` pour
 *     TROIS situations distinctes : pas de provider, delai depasse, et « le wallet repond non ».
 *     Pour DECIDER c est correct — on se replie sur l etape par etape dans les trois cas, et c est
 *     fail-closed. Pour MESURER c est faux : un delai depasse serait compte comme « ce wallet ne
 *     sait pas grouper », et le refus paraitrait plus repandu qu il ne l est.
 *     « On n a pas pu demander » n est pas une reponse du wallet : c est notre aveuglement, et un
 *     aveuglement compte a part d un fait, sinon on repare la mauvaise chose.
 *   ⛔ LA LOGIQUE VIT ICI, UNE SEULE FOIS : `peutGrouper` delegue. Deux copies de cette regle
 *     divergeraient au premier correctif, et c est la voie SIGNANTE qui paierait l ecart.
 * ⚠️ CE QUE CA NE PROUVE PAS : qu un lot aboutisse. Un wallet qui declare `supported` peut encore
 *   refuser, planter ou n appliquer qu une partie — c est `envoyerGroupe` qui le decouvre.
 */
export async function capaciteDeGroupement({ eth, compte, chaineHex, delaiMs = 2500 }) {
  if (!eth || typeof eth.request !== 'function' || !compte) {
    return { capacite: 'ILLISIBLE', pourquoi: 'no provider or no account to ask' };
  }
  let caps;
  try { caps = await avecDelai(eth.request({ method: 'wallet_getCapabilities', params: [compte, [chaineHex]] }), delaiMs); }
  catch (e) {
    /* ⛔⛔ ICI SE SEPARENT LES DEUX CAS QUI SE RESSEMBLENT LE PLUS. Un wallet qui ne CONNAIT PAS
     *     `wallet_getCapabilities` repond par une erreur de METHODE (4200, -32601…) : c est une
     *     REPONSE, et elle veut dire « je ne sais pas grouper ». Tout autre echec — reseau, provider
     *     muet, exception interne — est notre aveuglement. Les compter ensemble ferait passer nos
     *     pannes pour un verdict du marche. */
    const m = String((e && (e.message || e.data)) || e || '');
    const codeMethode = e && (e.code === 4200 || e.code === -32601 || e.code === -32004);
    if (codeMethode || /unsupported|not supported|does not exist|unrecognized|unknown method|method not found/i.test(m)) {
      return { capacite: 'NON', pourquoi: 'the wallet does not know wallet_getCapabilities' };
    }
    return { capacite: 'ILLISIBLE', pourquoi: 'asking failed: ' + m.slice(0, 80) };
  }
  if (caps === DELAI) return { capacite: 'ILLISIBLE', pourquoi: 'the wallet did not answer in time' };
  const c = caps && (caps[chaineHex] || caps[String(parseInt(chaineHex, 16))] || caps[parseInt(chaineHex, 16)]);
  /* ⛔ UNE REPONSE SANS NOTRE CHAINE EST UNE REPONSE, PAS UN SILENCE : le wallet a parle, il ne
   *   declare simplement rien pour Base. */
  if (!c) return { capacite: 'NON', pourquoi: 'the wallet declares nothing for this chain' };
  const st = c.atomic && c.atomic.status;
  /* ⛔ « ready » NE SUFFIT PAS (2026-09-19) : pour un compte classique (EOA), « ready » veut dire « possible APRES une mise
   *    a niveau du compte » (EIP-7702) — le wallet affiche alors une demande de conversion en smart account, surprenante et
   *    facile a refuser. Seul « supported » (deja capable) prend la voie une-signature ; le reste garde l etape par etape. */
  if (st === 'supported' || !!(c.atomicBatch && c.atomicBatch.supported === true)) {
    return { capacite: 'OUI', pourquoi: 'atomic batching is already supported' };
  }
  return { capacite: 'NON', pourquoi: 'atomic status is ' + JSON.stringify(st || null) + ', not "supported"' };
}

/** Le wallet sait-il executer un lot ATOMIQUE sur cette chaine ?
 * ⛔ LA DECISION RESTE BINAIRE ET FAIL-CLOSED : tout ce qui n est pas un OUI franc — y compris
 *   `ILLISIBLE` — prend l etape par etape. Seule la MESURE a besoin du troisieme etat. */
export async function peutGrouper(args) {
  const r = await capaciteDeGroupement(args);
  return r.capacite === 'OUI';
}

/** L etape d entonnoir qui correspond a une capacite.
 *
 * ⛔⛔ CETTE FONCTION EXISTE PARCE QU UNE MUTATION EST PASSEE. La correspondance vivait dans un objet
 *     litteral au milieu d `app.html`, et mon test la verifiait en cherchant les trois NOMS D ETAPES
 *     dans le texte. Mutation appliquee : `ILLISIBLE: 'capacite_lot_non'` — les trois etats ecrases
 *     en deux. Le test est reste VERT, parce que la chaine `'capacite_lot_illisible'` survivait
 *     quelques lignes plus bas, dans le `.catch`. La sonde trouvait la bonne chaine au MAUVAIS
 *     ENDROIT.
 *   ⇒ Une correspondance qui doit etre garantie ne se verifie pas par recherche de texte : elle
 *     s appelle. Sortie ici, un test la teste en l APPELANT, et l ecrasement casse immediatement.
 * ⛔ FAIL-SAFE VERS `illisible` : une capacite inconnue est notre aveuglement, jamais un refus du
 *   wallet. Se tromper dans ce sens sous-estime nos wallets capables ; dans l autre, on inventerait
 *   des refus qui n existent pas et on irait construire un contrat pour rien. */
export function etapeDeCapacite(capacite) {
  if (capacite === 'OUI') return 'capacite_lot_oui';
  if (capacite === 'NON') return 'capacite_lot_non';
  return 'capacite_lot_illisible';
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
    try { s = await avecDelai(eth.request({ method: 'wallet_getCallsStatus', params: [id] }), 10000); } catch (_) { continue; }
    if (s === DELAI) continue;
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
