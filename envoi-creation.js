/* envoi-creation.js — UNE transaction de creation, envoyee AU PLUS UNE FOIS par les pages de deploiement (deployer-duels-v2.html,
 *   deployer-duels.html, deployer-slots.html). Revue BlockDuelsV2 2026-10-24 (LOW n°3) : apres « Not confirmed yet after 3 minutes » ou une
 *   relecture differente, la page rallumait Deploy et un 2e appui envoyait une 2e creation ; et le changement de reseau etait cru sur parole.
 * LA REGLE :
 *   - eth_chainId est RELU apres wallet_switchEthereumChain, juste avant l envoi : un wallet qui dit oui mais reste ailleurs -> rien ne part ;
 *   - des que le wallet rend le hash de l envoi, il est GARDE (memoire + stockage du navigateur si donne) : envoyer() ne renvoie plus jamais ;
 *     la page propose « Check again » (verifier() relit le recu de CE hash) ;
 *   - une erreur du wallet SANS hash (autre qu un refus 4001) : on ne sait pas s il a envoye -> plus d envoi depuis cette page ouverte ;
 *   - seuls un refus 4001 (rien n est parti) et un recu status 0x0 (final : aucun contrat cree) laissent envoyer de nouveau.
 * Aucune cle, aucune signature ici : le wallet de la personne signe. `eth` est une FONCTION qui rend le provider (window.ethereum). */
const HASH = /^0x[0-9a-f]{64}$/;
const bas = (x) => String(x == null ? '' : x).toLowerCase();

export function creerEnvoiCreation({ eth, chaineHex, creation, cle = null, stockage = null, pasMs = 2000, essais = 90, dormir = (ms) => new Promise((r) => setTimeout(r, ms)) }) {
  const s = { tx: null, enVol: false, incertain: false };
  const lireStock = () => { try { return stockage && cle ? stockage.getItem(cle) : null; } catch (_) { return null; } };
  const ecrireStock = (v) => { try { if (stockage && cle) { if (v) stockage.setItem(cle, v); else stockage.removeItem(cle); } } catch (_) { /* stockage refuse : la memoire suffit pour cette page ouverte */ } };
  { const t = bas(lireStock()); if (HASH.test(t)) s.tx = t; }
  const garder = (tx) => { s.tx = tx; ecrireStock(tx); };
  const oublier = () => { s.tx = null; ecrireStock(null); };
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
    const r = await recuDe(s.tx);
    if (!r) return { etat: 'NON_CONFIRME', tx: s.tx };
    if (r.status === '0x1' && r.contractAddress) return { etat: 'CONFIRME', tx: s.tx, recu: r };
    /* status 0x0 : final, aucun contrat n existe — envoyer de nouveau ne cree pas de doublon */
    const tx = s.tx; oublier();
    return { etat: 'ECHOUE', tx, recu: r };
  }
  /** rend { etat: PAS_BASE | DECLINE | INCERTAIN | NON_CONFIRME | CONFIRME | ECHOUE | DEJA_ENVOYE | EN_COURS, tx?, recu?, message? } */
  async function envoyer(from, { avant = null, envoye = null } = {}) {
    if (s.tx) return { etat: 'DEJA_ENVOYE', tx: s.tx };
    if (s.incertain) return { etat: 'INCERTAIN' };
    if (s.enVol) return { etat: 'EN_COURS' };
    s.enVol = true;
    try {
      if (!(await surBase())) return { etat: 'PAS_BASE' };
      if (avant) avant();
      let tx;
      try { tx = bas(await req('eth_sendTransaction', [{ from, data: creation }])); }
      catch (e) {
        if (e && e.code === 4001) return { etat: 'DECLINE' };
        s.incertain = true;
        return { etat: 'INCERTAIN', message: String((e && e.message) || e).slice(0, 160) };
      }
      if (!HASH.test(tx)) { s.incertain = true; return { etat: 'INCERTAIN', message: 'the wallet returned no transaction hash' }; }
      garder(tx);
      if (envoye) envoye(tx);
      return await lireRecu();
    } finally { s.enVol = false; }
  }
  /** « Check again » : relit le recu du hash garde (jamais un envoi) */
  async function verifier() {
    if (!s.tx) return { etat: 'RIEN' };
    if (s.enVol) return { etat: 'EN_COURS' };
    s.enVol = true;
    try { return await lireRecu(); } finally { s.enVol = false; }
  }
  return { surBase, envoyer, verifier, peutEnvoyer: () => !s.tx && !s.enVol && !s.incertain, etat: () => ({ tx: s.tx, enVol: s.enVol, incertain: s.incertain }) };
}
