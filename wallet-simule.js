// wallet-simule.js — UN WALLET SIMULE (fournisseur EIP-1193) POUR LE MODE ESSAI : aucune cle, un fork local, et rien d autre.
// ================================================================================================
// CE QUE C EST (2026-10-04). L objet que la page recoit comme `window.ethereum` quand le mode essai est actif
//   (mode-essai.js). Il repond comme un wallet de type compte classique (EOA) : `eth_requestAccounts`, `eth_accounts`,
//   `eth_chainId`, `wallet_switchEthereumChain`, `eth_sendTransaction`, et les lectures (`eth_call`, recus, soldes) relayees.
//   Un envoi part vers le fork par `eth_sendTransaction` depuis le compte d essai, que le fork accepte parce que ce compte
//   y est IMPERSONNE (`anvil_impersonateAccount`) — ce qu aucun noeud reel ne permet.
//
// ⛔⛔ IL NE PEUT RIEN BOUGER DE REEL, PAR CONSTRUCTION, ET PAS PAR PROMESSE :
//     · il ne detient AUCUNE cle : il ne sait pas signer. Sur un vrai noeud, `eth_sendTransaction` sans cle est refuse ;
//     · il ne parle qu a un noeud de CETTE machine (`urlLocale`), et il refuse de se connecter si ce noeud ne se presente
//       pas comme un fork anvil (`web3_clientVersion`) sur la chaine Base (0x2105) ;
//     · il ne relaie qu une liste FERMEE de lectures : aucune methode `anvil_*` / `evm_*` n est offerte a la page.
// ⛔ JAMAIS LE WALLET DES FRAIS : le compte d essai ne peut pas etre `FEE_WALLET` (les bancs jugent sur SON solde).
// ⚠️ CE QU IL NE PROUVE PAS, et qu un test avec un vrai wallet prouve seul :
//     · l ecran du wallet (ce qu il affiche, ses alertes de prix, ses refus a lui) — ici un journal dans un bandeau ;
//     · l estimation de gaz DU WALLET (il renvoie tel quel le `gas` que l app propose) ;
//     · un smart wallet : `wallet_sendCalls` / `wallet_getCapabilities` repondent « non supporte » (code 4200), la page
//       prend donc toujours le chemin etape par etape ;
//     · une signature de message (`personal_sign`) : sans cle, refusee — la voix d un block et la messagerie privee
//       ne se testent pas ici.
import { urlLocale } from './mode-essai.js';
import { FEE_WALLET } from './frais-creation.js';

export const CHAINE_BASE_HEX = '0x2105';
/** Les lectures relayees telles quelles au fork. ⛔ LISTE FERMEE : tout le reste est « non supporte ». */
export const LECTURES_RELAYEES = Object.freeze(['eth_call', 'eth_estimateGas', 'eth_getBalance', 'eth_getTransactionReceipt',
  'eth_getTransactionByHash', 'eth_getTransactionCount', 'eth_blockNumber', 'eth_getBlockByNumber', 'eth_getCode',
  'eth_gasPrice', 'eth_maxPriorityFeePerGas', 'eth_feeHistory', 'eth_getLogs', 'eth_getStorageAt']);
/** Ce qu un compte classique sans cle ne sait pas faire — dit avec la raison, jamais par un silence. */
/* ⛔ LA PHRASE EST CELLE D UN VRAI WALLET (« method … not supported », code 4200) : envoi.js et groupe-wallet.js reconnaissent
 *   un wallet qui ne SAIT PAS grouper a ces mots et a ce code. Une autre phrase tomberait dans « on ne sait pas si le lot est
 *   parti », un etat qu un compte classique ne produit jamais. */
const NON_SUPPORTEES = Object.freeze({
  wallet_getCapabilities: 'The method wallet_getCapabilities is not supported: the simulated wallet is a plain account, it does not batch calls.',
  wallet_sendCalls: 'The method wallet_sendCalls is not supported: the simulated wallet is a plain account, it does not batch calls.',
  wallet_getCallsStatus: 'The method wallet_getCallsStatus is not supported: the simulated wallet is a plain account, it does not batch calls.',
  personal_sign: 'The method personal_sign is not supported: the simulated wallet holds no key, it cannot sign a message.',
  eth_sign: 'The method eth_sign is not supported: the simulated wallet holds no key, it cannot sign a message.',
  eth_signTypedData_v4: 'The method eth_signTypedData_v4 is not supported: the simulated wallet holds no key, it cannot sign a message.',
});
const ADRESSE = /^0x[0-9a-f]{40}$/;
const erreur = (code, message, data) => Object.assign(new Error(message), { code }, data === undefined ? {} : { data });

/**
 * @param {{ rpcUrl: string, compte: string, fetchImpl?: Function, chaineDepart?: string, surJournal?: Function }} o
 *   `chaineDepart` : la chaine sur laquelle le « wallet » s ouvre (defaut Base ; `0x1` rejoue un wallet ouvert sur Ethereum).
 */
export function creerWalletSimule({ rpcUrl, compte, fetchImpl, chaineDepart = CHAINE_BASE_HEX, surJournal = null } = {}) {
  const url = urlLocale(rpcUrl);
  if (!url) throw new Error('the simulated wallet only talks to a node on this machine (127.0.0.1, localhost or [::1])');
  const moi = String(compte || '').toLowerCase();
  if (!ADRESSE.test(moi)) throw new Error('the simulated wallet needs a whole account address');
  if (moi === String(FEE_WALLET).toLowerCase()) throw new Error('never test from the fee wallet');
  const aller = fetchImpl || globalThis.fetch;
  if (typeof aller !== 'function') throw new Error('no fetch to reach the local fork');

  let idRpc = 0, connecte = false, forkVerifie = false, refuserLaProchaine = false;
  let chaine = String(chaineDepart).toLowerCase();
  const journal = [];
  const ecouteurs = new Map();
  const emettre = (ev, v) => { for (const fn of [...(ecouteurs.get(ev) || [])]) { try { fn(v); } catch (_) { /* un ecouteur qui jette ne casse pas le wallet */ } } };
  const noter = (ligne) => {
    const l = { t: Date.now(), ...ligne };
    journal.push(l);
    if (journal.length > 200) journal.shift();
    if (typeof surJournal === 'function') { try { surJournal(l, journal); } catch (_) { /* le bandeau ne casse pas le wallet */ } }
    return l;
  };

  async function noeud(method, params) {
    let r;
    try {
      r = await aller(url, { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: ++idRpc, method, params: params || [] }) });
    } catch (e) { throw erreur(4900, 'the local fork did not answer (' + String((e && e.message) || e).slice(0, 80) + ')'); }
    const j = await r.json().catch(() => null);
    if (!j) throw erreur(-32603, 'the local fork returned no JSON (HTTP ' + r.status + ')');
    if (j.error) throw erreur(Number.isInteger(j.error.code) ? j.error.code : -32603, String(j.error.message || 'rpc error'), j.error.data);
    return j.result;
  }
  /* ⛔ LE NOEUD DOIT ETRE UN FORK DE BASE, ET IL LE DIT LUI-MEME. Un noeud local qui ne serait pas anvil (un vrai client,
   *   un relais vers un fournisseur) n a rien a recevoir d ici. Verifie une fois ; un echec se reverifie au prochain essai. */
  async function verifierFork() {
    if (forkVerifie) return;
    const client = String(await noeud('web3_clientVersion', []));
    if (!/^anvil\b/i.test(client)) throw erreur(4900, 'this node is not a local fork (it says “' + client.slice(0, 40) + '”): the simulated wallet only works against anvil');
    const id = String(await noeud('eth_chainId', [])).toLowerCase();
    if (id !== CHAINE_BASE_HEX) throw erreur(4901, 'the local fork is on chain ' + id + ', not Base (' + CHAINE_BASE_HEX + ')');
    forkVerifie = true;
  }
  /* la case « Decline the next wallet request » : ce qu un humain ferait dans la fenetre de son wallet */
  const refusSiDemande = (methode, detail = {}) => {
    if (!refuserLaProchaine) return;
    refuserLaProchaine = false;
    noter({ methode, ...detail, issue: 'declined' });
    throw erreur(4001, 'User rejected the request.');
  };

  async function request(args) {
    const methode = String((args && args.method) || '');
    const params = (args && args.params) || [];
    if (methode === 'eth_accounts') return connecte ? [moi] : [];
    if (methode === 'eth_chainId') return chaine;
    if (methode === 'net_version') return String(parseInt(chaine, 16));
    if (methode === 'eth_requestAccounts') {
      if (connecte) return [moi]; /* deja autorise : un wallet ne rouvre pas sa fenetre */
      refusSiDemande(methode);
      await verifierFork();
      await noeud('anvil_impersonateAccount', [moi]);
      connecte = true;
      noter({ methode, issue: 'connected' });
      return [moi];
    }
    if (methode === 'wallet_switchEthereumChain' || methode === 'wallet_addEthereumChain') {
      const voulue = String((params[0] && params[0].chainId) || '').toLowerCase();
      /* ce wallet ne connait que Base : toute autre chaine rend le code qu un vrai wallet rend pour une chaine inconnue */
      if (voulue !== CHAINE_BASE_HEX) throw erreur(4902, 'Unrecognized chain ID ' + voulue + ': the simulated wallet only knows Base');
      refusSiDemande(methode, { chaine: voulue });
      const change = chaine !== voulue;
      chaine = voulue;
      noter({ methode, chaine: voulue, issue: 'switched' });
      if (change) emettre('chainChanged', chaine);
      return null;
    }
    if (methode === 'eth_sendTransaction') {
      const tx = params[0] || {};
      const de = String(tx.from || '').toLowerCase();
      const detail = { vers: tx.to ? String(tx.to).toLowerCase() : null, valeur: String(tx.value || '0x0'),
        octets: Math.max(0, (String(tx.data || '0x').length - 2) / 2), gaz: tx.gas ? String(tx.gas) : null };
      if (!connecte) { noter({ methode, ...detail, issue: 'refused', pourquoi: 'not connected' }); throw erreur(4100, 'The simulated wallet is not connected.'); }
      /* ⛔ UN WALLET NE SIGNE QUE POUR SON COMPTE. Sans cette garde, le fork (qui impersonne ce qu on lui demande) enverrait
       *   depuis n importe quelle adresse deja impersonnee — et la page croirait avoir fait signer un autre compte. */
      if (de !== moi) { noter({ methode, ...detail, issue: 'refused', pourquoi: 'from is not the wallet account' }); throw erreur(4100, 'The simulated wallet only signs for its own account.'); }
      if (chaine !== CHAINE_BASE_HEX) { noter({ methode, ...detail, issue: 'refused', pourquoi: 'wallet on chain ' + chaine }); throw erreur(4901, 'The simulated wallet is on chain ' + chaine + ', not Base.'); }
      if (tx.to !== undefined && tx.to !== null && !ADRESSE.test(String(tx.to).toLowerCase())) { noter({ methode, ...detail, issue: 'refused', pourquoi: 'to is not an address' }); throw erreur(-32602, 'Invalid “to” address.'); }
      refusSiDemande(methode, detail);
      await verifierFork();
      const envoi = { from: moi, data: tx.data || '0x', value: tx.value || '0x0' };
      if (tx.to) envoi.to = tx.to;
      if (tx.gas) envoi.gas = tx.gas;
      let hash;
      try { hash = await noeud('eth_sendTransaction', [envoi]); }
      catch (e) { noter({ methode, ...detail, issue: 'failed', pourquoi: String((e && e.message) || e).slice(0, 160) }); throw e; }
      noter({ methode, ...detail, issue: 'sent', hash });
      return hash;
    }
    if (Object.prototype.hasOwnProperty.call(NON_SUPPORTEES, methode)) throw erreur(4200, NON_SUPPORTEES[methode]);
    if (LECTURES_RELAYEES.includes(methode)) return noeud(methode, params);
    throw erreur(4200, 'The method ' + (methode || '(none)') + ' is not supported by the simulated wallet.');
  }

  return {
    isWalletSimule: true,
    compte: moi,
    rpcUrl: url,
    request,
    on(ev, fn) { if (typeof fn === 'function') { if (!ecouteurs.has(ev)) ecouteurs.set(ev, new Set()); ecouteurs.get(ev).add(fn); } return this; },
    removeListener(ev, fn) { const s = ecouteurs.get(ev); if (s) s.delete(fn); return this; },
    /** Le prochain appel qui ouvrirait la fenetre du wallet (connexion, changement de chaine, envoi) sera REFUSE (code 4001). */
    refuserLaProchaine(v = true) { refuserLaProchaine = !!v; },
    /** Le refus est-il arme ? (le bandeau relit CET etat, il ne le devine pas) */
    refusArme() { return refuserLaProchaine; },
    /** Ce que le « wallet » a recu, dans l ordre : la seule trace de ce qu un ecran de wallet aurait montre. */
    journal,
    /** L humain « deconnecte » son wallet : la page recoit `accountsChanged` avec une liste vide. */
    deconnecter() { connecte = false; noter({ methode: 'disconnect', issue: 'disconnected' }); emettre('accountsChanged', []); },
  };
}

/* ── LE BANDEAU (navigateur seulement) : dit a l ecran que rien ici n est reel, et montre ce que le wallet a recu ─────────
 * ⛔ Tout texte est pose en textContent. Le bandeau est petit, en bas a gauche, au-dessus de la barre d onglets, et se replie. */
const ethLisible = (hexWei) => {
  let w; try { w = BigInt(hexWei || '0x0'); } catch (_) { return '?'; }
  const s = w.toString().padStart(19, '0');
  const frac = s.slice(-18).replace(/0+$/, '');
  return s.slice(0, -18) + (frac ? '.' + frac : '');
};
/** La ligne du bandeau pour une entree du journal : ce qu un ecran de wallet aurait montre, en clair. */
export function ligneJournal(l) {
  if (!l) return '';
  if (l.methode === 'eth_requestAccounts') return l.issue === 'declined' ? 'connect → declined' : 'connect → connected';
  if (l.methode === 'disconnect') return 'disconnect';
  if (l.methode === 'wallet_switchEthereumChain' || l.methode === 'wallet_addEthereumChain') return 'switch network to ' + l.chaine + ' → ' + l.issue;
  if (l.methode === 'eth_sendTransaction') {
    return 'transaction → to ' + (l.vers || '(contract creation)') + ' · value ' + ethLisible(l.valeur) + ' ETH · ' + l.octets + ' bytes of data'
      + (l.gaz ? ' · gas limit ' + parseInt(l.gaz, 16) : '') + ' → ' + (l.issue === 'sent' ? 'sent ' + l.hash : l.issue + (l.pourquoi ? ' (' + l.pourquoi + ')' : ''));
  }
  return l.methode + ' → ' + l.issue;
}

/**
 * Cree le wallet simule ET son bandeau. Appele par la page en mode essai seulement (app.html, par `import()`).
 * @param {{ rpcUrl: string, compte: string, document?: Document, fetchImpl?: Function }} o
 */
export function installerWalletSimule({ rpcUrl, compte, document: doc, fetchImpl } = {}) {
  let peindre = () => {};
  const wallet = creerWalletSimule({ rpcUrl, compte, fetchImpl, surJournal: () => peindre() });
  if (!doc || !doc.body || typeof doc.createElement !== 'function') return wallet;
  const el = (tag, texte, style) => { const e = doc.createElement(tag); if (texte) e.textContent = texte; if (style) e.setAttribute('style', style); return e; };
  const boite = el('div', '', 'position:fixed;left:8px;bottom:76px;z-index:2147483000;max-width:min(420px,calc(100vw - 16px));max-height:45vh;overflow:auto;'
    + 'background:#fff3bf;color:#111;border:2px solid #111;border-radius:8px;padding:8px 10px;font:12px/1.35 ui-monospace,Consolas,monospace;box-shadow:0 2px 10px rgba(0,0,0,.35)');
  boite.id = 'walletSimule';
  boite.setAttribute('role', 'status');
  const titre = el('div', 'TEST MODE — simulated wallet', 'font-weight:700');
  const replier = el('button', 'Hide', 'float:right;font:inherit;margin-left:8px');
  replier.type = 'button';
  const corps = el('div');
  corps.append(
    el('div', 'Account ' + wallet.compte),
    el('div', 'Local fork ' + wallet.rpcUrl + ' — no real funds move, nothing here is on Base.'));
  const serveur = el('div', 'Server: checking…');
  serveur.id = 'walletSimuleServeur';
  const caseRefus = doc.createElement('input');
  caseRefus.type = 'checkbox'; caseRefus.id = 'walletSimuleRefus';
  caseRefus.addEventListener('change', () => wallet.refuserLaProchaine(caseRefus.checked));
  const lab = el('label', '', 'display:block;margin:6px 0');
  lab.append(caseRefus, doc.createTextNode(' Decline the next wallet request'));
  const liste = el('ol', '', 'margin:4px 0 0 18px;padding:0');
  liste.id = 'walletSimuleJournal';
  corps.append(serveur, lab, el('div', 'Wallet log (what a wallet window would have shown):', 'font-weight:700'), liste);
  replier.addEventListener('click', () => { const cache = corps.style.display === 'none'; corps.style.display = cache ? '' : 'none'; replier.textContent = cache ? 'Hide' : 'Show'; });
  boite.append(replier, titre, corps);
  doc.body.append(boite);
  peindre = () => {
    caseRefus.checked = wallet.refusArme(); /* la case suit l etat du wallet : un refus consomme la decoche */
    liste.textContent = '';
    for (const l of wallet.journal.slice(-12)) liste.append(el('li', ligneJournal(l)));
  };
  /* ⛔ TROIS ETATS : le serveur de cette page lit-il le MEME fork ? oui / non / non lu. S il lit la vraie chaine, ses plans
   *   ne correspondent pas aux soldes du fork — on le dit, on ne laisse pas chercher une panne ailleurs. */
  const aller = fetchImpl || globalThis.fetch;
  Promise.resolve().then(() => aller('/sante', { cache: 'no-store' })).then((r) => r.json()).then((j) => {
    const e = j && j.essai;
    serveur.textContent = e && e.rpc === wallet.rpcUrl ? 'Server: test mode, reading the same fork.'
      : e && e.rpc ? 'Server: test mode on ANOTHER node (' + e.rpc + ') — its plans will not match this fork.'
        : 'Server: NOT in test mode — its plans come from the real chain and will not match this fork.';
  }).catch(() => { serveur.textContent = 'Server: mode not read.'; });
  return wallet;
}
