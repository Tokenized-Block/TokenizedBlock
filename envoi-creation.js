/* envoi-creation.js — UNE transaction de creation, envoyee AU PLUS UNE FOIS par les pages de deploiement (deployer-duels-v2.html,
 *   deployer-duels.html, deployer-slots.html). Revue BlockDuelsV2 2026-10-24 (LOW n°3) : apres « Not confirmed yet after 3 minutes » ou une
 *   relecture differente, la page rallumait Deploy et un 2e appui envoyait une 2e creation ; et le changement de reseau etait cru sur parole.
 * Revue 2026-10-25 (dv2Review) : (1) le stockage n etait lu qu au chargement : deux onglets envoyaient chacun une creation, le 2e ecrasant le
 *   hash du 1er ; (2) rien n etait garde AVANT la demande au wallet : une page rechargee pendant la demande du wallet rallumait Deploy, et
 *   l etat INCERTAIN ne vivait qu en memoire (son message disait meme « reload this page ») ; (3) « Check again » ne relisait pas eth_chainId.
 * LA REGLE :
 *   - eth_chainId est RELU apres wallet_switchEthereumChain, juste avant l envoi : un wallet qui dit oui mais reste ailleurs -> rien ne part ;
 *   - le stockage est RELU a chaque question (peutEnvoyer, etat, envoyer, verifier) : un hash ecrit par un autre onglet est ADOPTE ;
 *   - AVANT la demande d envoi au wallet, une marque « attente » est ecrite ; elle n est effacee que par un refus 4001 (rien n est parti) ou remplacee
 *     par le hash. Une page qui trouve la marque d une AUTRE page (rechargee pendant la demande, ou un 2e onglet) : Deploy eteint, ATTENTE ;
 *   - des que le wallet rend le hash de l envoi, il est GARDE (memoire + stockage) : envoyer() ne renvoie plus jamais ; « Check again »
 *     (verifier()) relit eth_chainId, puis le recu de CE hash ;
 *   - une erreur du wallet SANS hash (autre qu un refus 4001) : on ne sait pas s il a envoye -> INCERTAIN, GARDE dans le stockage aussi ;
 *   - seuls un refus 4001, un recu status 0x0 (final : aucun contrat cree) et liberer() (la personne dit, apres avoir regarde l historique de
 *     son wallet, que rien n est parti) laissent envoyer de nouveau. Rien n est jamais renvoye tout seul.
 * Aucune cle, aucune signature ici : le wallet de la personne signe. `eth` est une FONCTION qui rend le provider (window.ethereum).
 * NE PROUVE PAS : l atomicite du stockage entre deux onglets (deux appuis dans deux onglets dans la meme milliseconde) ; un stockage refuse
 *   (navigation privee stricte) ne garde rien au-dela de la page ouverte. */
const HASH = /^0x[0-9a-f]{64}$/;
const bas = (x) => String(x == null ? '' : x).toLowerCase();
const ATTENTE = 'attente:', INCERTAIN = 'incertain';

/** la phrase que la page dit pour un etat qui bloque Deploy (une seule source pour les trois pages) ; '' sinon */
export function phraseEnvoi(r) {
  const e = r && r.etat;
  if (e === 'ATTENTE') return 'A deployment was started from this browser and its result never came back here (this page was reloaded while your wallet was asking, or another tab of this page is sending). Deploy stays off so nothing is sent twice. Look in your wallet for a pending request or transaction, and look up this wallet’s history on a block explorer. If a deployment was sent, do not deploy again: send its transaction hash to the team. If nothing was sent, press “Nothing was sent”.';
  if (e === 'INCERTAIN') return 'The wallet returned an error, so this page cannot tell whether it sent the transaction' + (r.message ? ' (' + r.message + ')' : '') + '. Deploy stays off: look up this wallet’s history on a block explorer first. If a deployment was sent, do not deploy again: send its transaction hash to the team. If nothing was sent, press “Nothing was sent”.';
  if (e === 'HORS_BASE') return 'Your wallet is ' + (r.chaine ? 'on another network (' + r.chaine + ')' : 'not answering which network it is on') + ', not Base, so this page cannot read the transaction from it. Switch the wallet to Base, then press Check again. Deploy stays off.';
  if (e === 'DEJA_ENVOYE') return 'A deployment was already sent from this browser (the transaction above). Deploy stays off so nothing is sent twice: press Check again.';
  return '';
}

export function creerEnvoiCreation({ eth, chaineHex, creation, cle = null, stockage = null, pasMs = 2000, essais = 90, dormir = (ms) => new Promise((r) => setTimeout(r, ms)) }) {
  const ID = Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  const MA_MARQUE = ATTENTE + ID;
  /* tx : le hash garde · incertain : cette page a eu une erreur sans hash · vu : ce que le stockage dit d une AUTRE page (ATTENTE | INCERTAIN) */
  const s = { tx: null, enVol: false, incertain: false, vu: null };
  const lireStock = () => { try { return stockage && cle ? stockage.getItem(cle) : null; } catch (_) { return null; } };
  const ecrireStock = (v) => { try { if (stockage && cle) { if (v) stockage.setItem(cle, v); else stockage.removeItem(cle); } } catch (_) { /* stockage refuse : la memoire suffit pour cette page ouverte */ } };
  /** relit le stockage : un hash est adopte (jamais oublie en memoire) ; une marque d une autre page bloque */
  function relire() {
    const v = bas(lireStock());
    if (HASH.test(v)) { if (!s.tx) s.tx = v; s.vu = null; return; }
    if (v.startsWith(ATTENTE)) { s.vu = v === MA_MARQUE && s.enVol ? null : 'ATTENTE'; return; }
    s.vu = v === INCERTAIN ? 'INCERTAIN' : null;
  }
  relire();
  const garder = (tx) => { s.tx = tx; ecrireStock(tx); };
  const oublier = (tx) => { s.tx = null; if (bas(lireStock()) === tx) ecrireStock(null); };
  const marquerIncertain = () => { s.incertain = true; const v = bas(lireStock()); if (!v || v === MA_MARQUE) ecrireStock(INCERTAIN); };
  /** ce qui bloque un envoi, dans l ordre (null si rien) */
  const bloque = () => {
    if (s.tx) return { etat: 'DEJA_ENVOYE', tx: s.tx };
    if (s.incertain || s.vu === 'INCERTAIN') return { etat: 'INCERTAIN' };
    if (s.enVol) return { etat: 'EN_COURS' };
    if (s.vu === 'ATTENTE') return { etat: 'ATTENTE' };
    return null;
  };
  const req = (method, params) => eth().request(params === undefined ? { method } : { method, params });
  const chaine = async () => bas(await req('eth_chainId'));

  /** vrai seulement si eth_chainId (relu APRES un changement) est chaineHex */
  async function surBase() {
    try { if ((await chaine()) === bas(chaineHex)) return true; } catch (_) { return false; }
    try { await req('wallet_switchEthereumChain', [{ chainId: chaineHex }]); } catch (_) { return false; }
    try { return (await chaine()) === bas(chaineHex); } catch (_) { return false; }
  }
  async function recuDe(tx) {
    for (let i = 0; i < essais; i += 1) {
      if (i > 0 || pasMs > 0) await dormir(pasMs);
      let r = null; try { r = await req('eth_getTransactionReceipt', [tx]); } catch (_) { r = null; }
      if (r) return r;
    }
    return null;
  }
  async function lireRecu() {
    const tx = s.tx;
    const r = await recuDe(tx);
    if (!r) return { etat: 'NON_CONFIRME', tx };
    if (r.status === '0x1' && r.contractAddress) return { etat: 'CONFIRME', tx, recu: r };
    /* status 0x0 : final, aucun contrat n existe — envoyer de nouveau ne cree pas de doublon */
    oublier(tx);
    return { etat: 'ECHOUE', tx, recu: r };
  }
  /** rend { etat: PAS_BASE | DECLINE | INCERTAIN | ATTENTE | NON_CONFIRME | CONFIRME | ECHOUE | DEJA_ENVOYE | EN_COURS, tx?, recu?, message? } */
  async function envoyer(from, { avant = null, envoye = null } = {}) {
    relire();
    { const b = bloque(); if (b) return b; }
    s.enVol = true;
    try {
      if (!(await surBase())) return { etat: 'PAS_BASE' };
      relire();
      { const b = bloque(); if (b && b.etat !== 'EN_COURS') return b; }
      ecrireStock(MA_MARQUE);
      if (avant) avant();
      let tx;
      try { tx = bas(await req('eth_sendTransaction', [{ from, data: creation }])); }
      catch (e) {
        if (e && e.code === 4001) { if (bas(lireStock()) === MA_MARQUE) ecrireStock(null); return { etat: 'DECLINE' }; }
        marquerIncertain();
        return { etat: 'INCERTAIN', message: String((e && e.message) || e).slice(0, 160) };
      }
      if (!HASH.test(tx)) { marquerIncertain(); return { etat: 'INCERTAIN', message: 'the wallet returned no transaction hash' }; }
      garder(tx);
      if (envoye) envoye(tx);
      return await lireRecu();
    } finally { s.enVol = false; }
  }
  /** « Check again » : relit eth_chainId (sans rien changer), puis le recu du hash garde ; jamais un envoi */
  async function verifier() {
    relire();
    if (s.enVol) return { etat: 'EN_COURS' };
    if (!s.tx && !s.incertain && !s.vu) return { etat: 'RIEN' };
    s.enVol = true;
    try {
      let c = null; try { c = await chaine(); } catch (_) { c = null; }
      if (c !== bas(chaineHex)) return { etat: 'HORS_BASE', chaine: c || null, tx: s.tx };
      relire();
      if (s.tx) return await lireRecu();
      /* sans hash : ce qui bloque (bloque() dirait EN_COURS, cette relecture etant elle-meme « en vol ») */
      if (s.incertain || s.vu === 'INCERTAIN') return { etat: 'INCERTAIN' };
      return s.vu === 'ATTENTE' ? { etat: 'ATTENTE' } : { etat: 'RIEN' };
    } finally { s.enVol = false; }
  }
  /** la personne dit que rien n est parti (apres avoir regarde l historique de son wallet) : efface une marque ATTENTE / INCERTAIN.
   *  Jamais un hash : un envoi connu reste garde. */
  function liberer() {
    relire();
    if (s.tx || s.enVol) return false;
    s.incertain = false; s.vu = null;
    const v = bas(lireStock());
    if (v === INCERTAIN || v.startsWith(ATTENTE)) ecrireStock(null);
    return true;
  }
  return {
    surBase, envoyer, verifier, liberer,
    peutEnvoyer: () => { relire(); return !bloque(); },
    etat: () => { relire(); return { tx: s.tx, enVol: s.enVol, incertain: s.incertain || s.vu === 'INCERTAIN', attente: s.vu === 'ATTENTE' }; },
  };
}
