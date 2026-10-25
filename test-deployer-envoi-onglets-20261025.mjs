/* test-deployer-envoi-onglets-20261025.mjs — DEUX ONGLETS, UNE PAGE RECHARGEE PENDANT LA DEMANDE DU WALLET, UN WALLET HORS DE BASE :
 *   toujours AU PLUS UNE creation (revue dv2Review 2026-10-25, defauts 1 a 3 de envoi-creation.js).
 * EXECUTE (pas lu) : le script REEL de chaque page (deployer-duels-v2.html, deployer-duels.html, deployer-slots.html) tourne dans un faux DOM,
 *   avec un faux wallet qui compte les eth_sendTransaction ; deux pages peuvent etre montees EN MEME TEMPS (deux onglets : chaque copie du
 *   script a son propre `document` / `window`, le stockage est partage). La copie ne change que : la fiche (adresse et bloc remis a null pour
 *   v1, slots et v2, deja deployes), l attente (pas de 2 s), et les deux constantes `document` / `window` en tete du module.
 * AFFIRME, pour chaque page :
 *   O1 l onglet A envoie (recu en retard) ; l onglet B, ouvert AVANT, appuie sur Deploy : rien n est envoye, B montre le hash de A, le hash de
 *      A reste dans le stockage, B propose « Check again » ;
 *   O2 l onglet A attend la signature du wallet ; l onglet B appuie sur Deploy : rien n est envoye, B le dit ; A recoit le hash : « Check
 *      again » dans B adopte CE hash (aucun envoi) ;
 *   R1 la page RECHARGEE pendant la demande du wallet : Deploy eteint, « Check again » et « Nothing was sent » proposes, une phrase qui dit de
 *      regarder l historique du wallet ; Deploy (eteint) et « Check again » n envoient rien ; « Nothing was sent » rallume Deploy ;
 *   R2 une erreur du wallet SANS hash, puis la page rechargee : Deploy reste eteint, « cannot tell whether » redit, et le message ne dit plus
 *      « reload this page » ;
 *   R3 un refus 4001 : la marque est effacee — une page rechargee a Deploy allume ;
 *   B1 « Check again » avec le wallet passe sur une autre chaine : eth_chainId relu, AUCUN recu lu, la page dit que le wallet n est pas sur
 *      Base (et quelle chaine), Deploy reste eteint ; de retour sur Base, « Check again » lit le recu.
 *   + le module envoi-creation.js (execute) : deux instances sur le meme stockage (peutEnvoyer et envoyer RELISENT), la marque d attente avant
 *     l envoi, INCERTAIN garde, un 0x0 n efface que SON hash, liberer() n efface jamais un hash.
 * Modules remplacables (mutants) : ENVOI_CREATION (envoi-creation.js), PAGE_DUELS_V2, PAGE_DUELS, PAGE_SLOTS.
 * ⛔ PORTABLE : process.exitCode. NE PROUVE PAS : un vrai navigateur (evenement `storage`, deux onglets reels, l atomicite du stockage entre
 *   onglets), un vrai wallet (MetaMask, Coinbase) qui garderait sa demande apres un rechargement, un vrai deploiement sur Base. */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { selecteur } from './keccak.js';
const ICI = path.dirname(fileURLToPath(import.meta.url));
let n = 0, ko = 0;
const ok = (c, m) => { n += 1; if (c) console.log('ok  ' + m); else { ko += 1; console.log('KO  ' + m); } };
const lire = (f) => fs.readFileSync(path.isAbsolute(f) ? f : path.join(ICI, f), 'utf8').replace(/\r\n/g, '\n');
const pause = (ms = 0) => new Promise((r) => setTimeout(r, ms));
const u = (v) => BigInt(v).toString(16).padStart(64, '0');
const aw = (a) => String(a).toLowerCase().replace(/^0x/, '').padStart(64, '0');
const H = (k) => '0x' + String(k).padStart(2, '0').repeat(32);

function dom() {
  const els = new Map();
  const el = (sel) => {
    if (!els.has(sel)) {
      const x = { sel, textContent: '', innerHTML: '', hidden: false, disabled: false, className: '', value: '', dataset: {}, enfants: [], l: {},
        append(...c) { this.enfants.push(...c); }, addEventListener(t, f) { (this.l[t] = this.l[t] || []).push(f); },
        async clic() { if (this.disabled || this.hidden) return false; await Promise.all((this.l.click || []).map((f) => f({ preventDefault() {}, target: this }))); return true; } };
      els.set(sel, x);
    }
    return els.get(sel);
  };
  return { els, document: { querySelector: el, querySelectorAll: () => [], createElement: (t) => ({ tag: t, textContent: '', append() {} }), getElementById: (i) => el('#' + i) } };
}
function etatInitial(page, D) {
  for (const m of page.matchAll(/<button[^>]*id="(\w+)"[^>]*>/g)) { const e = D.document.querySelector('#' + m[1]); e.hidden = /\shidden[\s>]/.test(m[0]); e.disabled = /\sdisabled[\s>]/.test(m[0]); }
  for (const m of page.matchAll(/<dl[^>]*id="(\w+)"[^>]*>/g)) { const e = D.document.querySelector('#' + m[1]); e.hidden = /\shidden[\s>]/.test(m[0]); }
}
/* le faux wallet : un compteur d envois PARTAGE (deux onglets, un seul wallet) ; `pendre` : la demande reste ouverte jusqu a lacher(hash) */
function wallet({ envois = [], chaine = '0x2105', pendre = false, erreurSansHash = false, refuse = null, recuApres = 1e9, relectures = {}, code = '0x' } = {}) {
  const w = { envois, chaine, polls: 0, recuApres, relectures, adresse: '0x' + '9c'.repeat(20), enAttente: [] };
  w.lacher = (h) => { for (const r of w.enAttente.splice(0)) r(h); };
  w.ethereum = {
    on() {},
    async request({ method, params }) {
      if (method === 'eth_requestAccounts') return ['0x' + 'de'.repeat(20)];
      if (method === 'eth_chainId') return w.chaine;
      if (method === 'wallet_switchEthereumChain') { w.chaine = params[0].chainId; return null; }
      if (method === 'eth_sendTransaction') {
        if (refuse) { const e = new Error('User rejected'); e.code = refuse; throw e; }
        w.envois.push(params[0]);
        if (erreurSansHash) throw new Error('internal wallet error');
        if (pendre) return new Promise((r) => w.enAttente.push(r));
        return H(w.envois.length);
      }
      if (method === 'eth_getTransactionReceipt') { w.polls += 1; return w.polls > w.recuApres ? { status: '0x1', contractAddress: w.adresse, blockNumber: '0x10', blockHash: '0x' + '0b'.repeat(32), transactionHash: params[0] } : null; }
      if (method === 'eth_getCode') return code;
      if (method === 'eth_call') { const sel = params[0].data.slice(0, 10); if (!(sel in w.relectures)) throw new Error('unexpected eth_call ' + sel); return w.relectures[sel]; }
      throw new Error('unexpected ' + method);
    },
  };
  return w;
}

const { DUELS_V2_DEPLOIEMENT: DV2 } = await import('./duels-v2-deploiement.js');
const { DUELS_DEPLOIEMENT: DV1 } = await import('./duels-deploiement.js');
const { SLOTS_DEPLOIEMENT: DS } = await import('./slots-deploiement.js');
const art = JSON.parse(lire('contracts/out/BlockDuelsV2.sol/BlockDuelsV2.json'));
const sel = (s) => selecteur(s).slice(0, 10);
const relDuels = (D) => ({ [sel('USDC()')]: '0x' + aw(D.constructeur.usdc), [sel('DEV_WALLET()')]: '0x' + aw(D.constructeur.devWallet), [sel('REWARD_POOL()')]: '0x' + aw(D.constructeur.rewardPool),
  [sel('GUARDIAN()')]: '0x' + aw(D.constructeur.guardian), [sel('tokenOk(address)')]: '0x' + u(1), [sel('nextId()')]: '0x' + u(1), [sel('WINNER_BPS()')]: '0x' + u(9000), [sel('POOL_BPS()')]: '0x' + u(700), [sel('SETTLE_WINDOW()')]: '0x' + u(256) });
const relSlots = { [sel('USDC()')]: '0x' + aw(DS.constructeur.usdc), [sel('DEV_WALLET()')]: '0x' + aw(DS.constructeur.devWallet), [sel('SPIN_PRICE()')]: '0x' + u(DS.constructeur.spinPrice),
  [sel('POT_SHARE_BPS()')]: '0x' + u(DS.constructeur.potShareBps), [sel('prizes()')]: '0x' + DS.constructeur.prizes.map(u).join(''), [sel('pot()')]: '0x' + u(0) };
const PAGES = [
  /* 2026-10-25 : BlockDuelsV2 deploye (adresse + bloc ecrits par noter-deploiement-duelsv2) -> comme v1 et slots, la page tourne sur SA fiche
   *   ramenee a l etat d avant (memes octets, adresse et bloc null) : sinon elle dirait « Already deployed » et chaque O passerait a vide */
  { nom: 'deployer-duels-v2.html', env: 'PAGE_DUELS_V2', fiche: ['./duels-v2-deploiement.js', 'DUELS_V2_DEPLOIEMENT'], rel: relDuels(DV2), code: art.deployedBytecode.object },
  { nom: 'deployer-duels.html', env: 'PAGE_DUELS', fiche: ['./duels-deploiement.js', 'DUELS_DEPLOIEMENT'], rel: relDuels(DV1), code: '0x' },
  { nom: 'deployer-slots.html', env: 'PAGE_SLOTS', fiche: ['./slots-deploiement.js', 'SLOTS_DEPLOIEMENT'], rel: relSlots, code: '0x' },
];
const ENVOI = process.env.ENVOI_CREATION ? path.resolve(process.env.ENVOI_CREATION) : null;

const temporaires = [];
let k = 0;
/** monte UN onglet : sa propre copie du script, son `document` et son `window` (le stockage est celui donne) */
async function monter(P, w, store) {
  const src = lire(process.env[P.env] || P.nom);
  const script = (src.match(/<script type="module">([\s\S]*?)<\/script>/) || ['', ''])[1];
  let s = script.replace(/setTimeout\(r, 2000\)/g, 'setTimeout(r, 0)').replace(/creerEnvoiCreation\(\{/g, 'creerEnvoiCreation({ pasMs: 0, essais: 3, ');
  if (ENVOI) s = s.replace(/from '\.\/envoi-creation\.js'/, () => "from '" + pathToFileURL(ENVOI).href + "'");
  k += 1;
  if (P.fiche) {
    const f = path.join(ICI, '.tmp-onglets-' + process.pid + '-' + k + '-fiche.mjs');
    fs.writeFileSync(f, "import { " + P.fiche[1] + " as X } from '" + P.fiche[0] + "';\nexport const " + P.fiche[1] + " = Object.freeze({ ...X, adresse: null, bloc: null });\n");
    temporaires.push(f);
    s = s.split("from '" + P.fiche[0] + "'").join("from './" + path.basename(f) + "'");
  }
  const D = dom(); etatInitial(src, D);
  const id = 'onglet' + (k + 1);
  const W = { ethereum: w.ethereum, localStorage: store.vue ? store.vue(id) : store,
    addEventListener: (t, f) => { if (t === 'storage' && store.ecoutes) store.ecoutes.push({ id, f }); } };
  globalThis['__onglet' + k] = { document: D.document, window: W };
  s = 'const { document, window } = globalThis.__onglet' + k + ';\n' + s;
  const f = path.join(ICI, '.tmp-onglets-' + process.pid + '-' + k + '-page.mjs');
  fs.writeFileSync(f, s); temporaires.push(f);
  await import(pathToFileURL(f).href);
  for (let i = 0; i < 50 && !/ok|ko/.test(D.document.querySelector('#dVerif').className); i++) await pause(2);
  return D;
}
/* le stockage partage ; `vue(id)` = le localStorage d UN onglet : une ecriture previent les AUTRES onglets (evenement `storage`, comme un
 *   navigateur : jamais l onglet qui ecrit) ; evenements: false = aucun evenement (l appui doit se garder seul) */
const magasin = ({ evenements = true } = {}) => {
  const m = new Map(), ecoutes = [];
  const prevenir = (id) => { if (evenements) for (const e of ecoutes) if (e.id !== id) e.f({ key: 'k' }); };
  const vue = (id) => ({ getItem: (x) => (m.has(x) ? m.get(x) : null), setItem: (x, v) => { m.set(x, String(v)); prevenir(id); }, removeItem: (x) => { m.delete(x); prevenir(id); } });
  return { m, ecoutes, vue, ...vue('banc') };
};
const q = (D, s) => D.document.querySelector(s);
const etat = (D) => q(D, '#dEtat').textContent;
const valeurs = (st) => [...st.m.values()];
async function connecter(D) { await q(D, '#bConnecter').clic(); await pause(1); }
/** un appui qui ne retourne pas tant que le wallet n a pas rendu (onglet A pendant la demande) : on le lance sans l attendre */
const lancer = (b) => { const p = b.clic(); return p; };

try {
  for (const P of PAGES) {
    console.log('— ' + P.nom);
    {
      /* O1 : deux onglets ouverts, A envoie (recu en retard), B appuie ensuite */
      const store = magasin(), envois = [];
      const wA = wallet({ envois }); wA.relectures = P.rel;
      const wB = wallet({ envois }); wB.relectures = P.rel;
      const A = await monter(P, wA, store); await connecter(A);
      const B = await monter(P, wB, store); await connecter(B);
      ok(q(A, '#bDeployer').disabled === false && q(B, '#bDeployer').disabled === false, 'O1 deux onglets ouverts, verifies, connectes : Deploy allume dans les deux');
      await q(A, '#bDeployer').clic();
      ok(envois.length === 1 && valeurs(store).includes(H(1)), 'O1 l onglet A envoie : UN envoi, son hash dans le stockage');
      ok(q(B, '#bDeployer').disabled === true && q(B, '#rTx').textContent === H(1) && /already sent/i.test(etat(B)), 'O1 l evenement `storage` repeint B AVANT tout appui : Deploy eteint, le hash de A montre, B le dit (' + etat(B).slice(0, 50) + ')');
      await q(B, '#bDeployer').clic();
      ok(envois.length === 1, 'O1 l onglet B (ouvert avant) appuie sur Deploy : RIEN n est envoye (' + envois.length + ' envoi)');
      ok(valeurs(store).includes(H(1)) && valeurs(store).length === 1, 'O1 le hash de A reste dans le stockage (non ecrase)');
      ok(q(B, '#bDeployer').disabled === true && q(B, '#rTx').textContent === H(1) && q(B, '#bRevoir').hidden === false, 'O1 B montre le hash de A, Deploy eteint, « Check again » propose (' + etat(B).slice(0, 60) + ')');
    }
    {
      /* O3 : la meme chose SANS evenement `storage` (B pas repeint) : l appui de B se garde seul */
      const store = magasin({ evenements: false }), envois = [];
      const wA = wallet({ envois }); wA.relectures = P.rel;
      const wB = wallet({ envois }); wB.relectures = P.rel;
      const A = await monter(P, wA, store); await connecter(A);
      const B = await monter(P, wB, store); await connecter(B);
      await q(A, '#bDeployer').clic();
      ok(q(B, '#bDeployer').disabled === false, 'O3 sans evenement : B n est pas repeint (Deploy encore allume a l ecran)');
      await q(B, '#bDeployer').clic();
      ok(envois.length === 1 && store.m.get([...store.m.keys()][0]) === H(1) && q(B, '#bDeployer').disabled === true && q(B, '#rTx').textContent === H(1) && /already sent/i.test(etat(B)),
        'O3 B appuie : RIEN n est envoye, le hash de A garde et montre, B le dit (' + etat(B).slice(0, 50) + ')');
    }
    {
      /* O2 : A attend la signature ; B appuie ; A recoit le hash ; B « Check again » */
      const store = magasin(), envois = [];
      const wA = wallet({ envois, pendre: true }); wA.relectures = P.rel;
      const wB = wallet({ envois }); wB.relectures = P.rel;
      const A = await monter(P, wA, store); await connecter(A);
      const B = await monter(P, wB, store); await connecter(B);
      const pA = lancer(q(A, '#bDeployer')); await pause(5);
      ok(envois.length === 1 && wA.enAttente.length === 1, 'O2 l onglet A : la demande est ouverte dans le wallet');
      await q(B, '#bDeployer').clic();
      ok(envois.length === 1 && q(B, '#bDeployer').disabled === true && /never came back|another tab/i.test(etat(B)), 'O2 B appuie pendant la demande de A : rien n est envoye, B le dit (' + etat(B).slice(0, 70) + ')');
      wA.lacher(H(7)); await pA;
      await q(B, '#bRevoir').clic();
      ok(envois.length === 1 && q(B, '#rTx').textContent === H(7) && wB.polls >= 1, 'O2 A recoit le hash : « Check again » dans B adopte CE hash et lit son recu, aucun envoi');
    }
    {
      /* R1 : la page rechargee pendant la demande du wallet */
      const store = magasin(), envois = [];
      const w0 = wallet({ envois, pendre: true }); w0.relectures = P.rel;
      const A = await monter(P, w0, store); await connecter(A);
      void lancer(q(A, '#bDeployer')); await pause(5);
      const w = wallet({ envois }); w.relectures = P.rel;
      const R = await monter(P, w, store);
      ok(/never came back/.test(etat(R)), 'R1 la page rechargee le dit DES le chargement, avant tout wallet connecte (' + etat(R).slice(0, 50) + ')');
      await connecter(R);
      ok(envois.length === 1 && q(R, '#bDeployer').disabled === true, 'R1 page rechargee pendant la demande : Deploy ETEINT');
      ok(q(R, '#bRevoir').hidden === false && q(R, '#bLiberer').hidden === false, 'R1 « Check again » et « Nothing was sent » proposes');
      ok(/wallet/i.test(etat(R)) && /history/i.test(etat(R)) && /pending/i.test(etat(R)) && !/reload this page/i.test(etat(R)), 'R1 la phrase dit de regarder l historique et la demande en cours du wallet (' + etat(R).slice(0, 90) + ')');
      await q(R, '#bDeployer').clic(); await q(R, '#bRevoir').clic();
      ok(envois.length === 1 && w.polls === 0 && q(R, '#bDeployer').disabled === true && /never came back/.test(etat(R)), 'R1 Deploy et « Check again » : rien n est envoye, « Check again » redit ATTENTE (' + etat(R).slice(0, 40) + ')');
      w.chaine = '0x1';
      await q(R, '#bRevoir').clic();
      ok(envois.length === 1 && /not Base/.test(etat(R)) && /0x1/.test(etat(R)), 'R1 « Check again » sans hash, wallet sur 0x1 : eth_chainId relu, la page dit « not Base » (' + etat(R).slice(0, 60) + ')');
      w.chaine = '0x2105';
      await q(R, '#bLiberer').clic();
      ok(q(R, '#bDeployer').disabled === false && q(R, '#bLiberer').hidden === true && envois.length === 1, 'R1 « Nothing was sent » : Deploy rallume, rien n est envoye tout seul');
    }
    {
      /* R2 : INCERTAIN garde */
      const store = magasin(), envois = [];
      const w0 = wallet({ envois, erreurSansHash: true }); w0.relectures = P.rel;
      const A = await monter(P, w0, store); await connecter(A);
      await q(A, '#bDeployer').clic();
      ok(envois.length === 1 && /cannot tell whether/i.test(etat(A)) && !/reload/i.test(etat(A)), 'R2 erreur sans hash : « cannot tell whether », plus de « reload this page » (' + etat(A).slice(0, 80) + ')');
      const w = wallet({ envois }); w.relectures = P.rel;
      const R = await monter(P, w, store); await connecter(R);
      await q(R, '#bDeployer').clic();
      ok(envois.length === 1 && q(R, '#bDeployer').disabled === true && /cannot tell whether/i.test(etat(R)) && q(R, '#bLiberer').hidden === false, 'R2 page rechargee : Deploy reste eteint, la page le redit (INCERTAIN garde)');
    }
    {
      /* R3 : refus 4001 -> la marque effacee */
      const store = magasin(), envois = [];
      const w0 = wallet({ envois, refuse: 4001 }); w0.relectures = P.rel;
      const A = await monter(P, w0, store); await connecter(A);
      await q(A, '#bDeployer').clic();
      const w = wallet({ envois }); w.relectures = P.rel;
      const R = await monter(P, w, store); await connecter(R);
      ok(envois.length === 0 && store.m.size === 0 && q(R, '#bDeployer').disabled === false, 'R3 refus 4001 : la marque est effacee, la page rechargee a Deploy allume');
    }
    {
      /* B1 : « Check again » hors de Base */
      const store = magasin(), envois = [];
      const w = wallet({ envois, code: P.code }); w.relectures = P.rel;
      const A = await monter(P, w, store); await connecter(A);
      await q(A, '#bDeployer').clic();
      const polls0 = w.polls;
      w.chaine = '0x1'; w.recuApres = 0;
      await q(A, '#bRevoir').clic();
      ok(envois.length === 1 && w.polls === polls0 && /not Base/.test(etat(A)) && /0x1/.test(etat(A)) && q(A, '#bDeployer').disabled === true, 'B1 « Check again » sur la chaine 0x1 : AUCUN recu lu, la page dit « not Base » et la chaine (' + etat(A).slice(0, 80) + ')');
      w.chaine = '0x2105';
      await q(A, '#bRevoir').clic();
      ok(envois.length === 1 && w.polls > polls0 && /reads back exactly what was signed/.test(etat(A)), 'B1 de retour sur Base : « Check again » lit le recu et relit le contrat, toujours UN envoi');
    }
  }

  console.log('— envoi-creation.js (execute)');
  {
    let M = null; try { M = await import(pathToFileURL(ENVOI || path.join(ICI, 'envoi-creation.js')).href); } catch (e) { M = null; }
    ok(!!M && typeof M.creerEnvoiCreation === 'function', 'le module existe et exporte creerEnvoiCreation');
    if (M) {
      const de = '0x' + 'de'.repeat(20);
      const opt = (w, st) => ({ eth: () => w.ethereum, chaineHex: '0x2105', creation: '0x60', cle: 'k', stockage: st, pasMs: 0, essais: 1 });
      {
        const st = magasin(), envois = [], w = wallet({ envois });
        const A = M.creerEnvoiCreation(opt(w, st)), B = M.creerEnvoiCreation(opt(w, st));
        await A.envoyer(de);
        ok(B.peutEnvoyer() === false, 'deux instances, meme stockage : peutEnvoyer() de B RELIT le stockage apres l envoi de A');
      }
      {
        const st = magasin(), envois = [], w = wallet({ envois });
        const A = M.creerEnvoiCreation(opt(w, st)), B = M.creerEnvoiCreation(opt(w, st));
        await A.envoyer(de); const rb = await B.envoyer(de);
        ok(envois.length === 1 && rb.etat === 'DEJA_ENVOYE' && rb.tx === H(1) && st.m.get('k') === H(1), 'envoyer() de B RELIT le stockage : DEJA_ENVOYE avec le hash de A, UN envoi, le hash de A garde');
      }
      {
        /* B ouvert AVANT l envoi de A, interroge par envoyer() d abord : aucune question au wallet (pas meme eth_chainId) */
        const st = magasin(), envois = [], w = wallet({ envois });
        const wB = wallet({ envois }); const vusB = []; const req0 = wB.ethereum.request; wB.ethereum.request = (a) => { vusB.push(a.method); return req0(a); };
        const A = M.creerEnvoiCreation(opt(w, st)), B = M.creerEnvoiCreation(opt(wB, st));
        await A.envoyer(de);
        const rb = await B.envoyer(de);
        ok(rb.etat === 'DEJA_ENVOYE' && vusB.length === 0 && envois.length === 1, 'envoyer() de B, le hash de A deja garde : DEJA_ENVOYE sans RIEN demander au wallet (' + vusB.join() + ')');
      }
      {
        /* la course : A ecrit son hash PENDANT que B attend eth_chainId (son changement de reseau) — B relit apres, n envoie pas */
        const st = magasin(), envois = [];
        const wB = wallet({ envois }); const req0 = wB.ethereum.request;
        wB.ethereum.request = async (a) => { if (a.method === 'eth_chainId') st.m.set('k', H(3)); return req0(a); };
        const rb = await M.creerEnvoiCreation(opt(wB, st)).envoyer(de);
        ok(rb.etat === 'DEJA_ENVOYE' && rb.tx === H(3) && envois.length === 0, 'course : un hash ecrit pendant le changement de reseau de B : B le relit, DEJA_ENVOYE, aucun envoi (' + rb.etat + ')');
      }
      {
        const st = magasin(), envois = [], w = wallet({ envois, pendre: true });
        const A = M.creerEnvoiCreation(opt(w, st));
        const B = M.creerEnvoiCreation(opt(w, st)); /* ouvert AVANT la marque */
        const p = A.envoyer(de); await pause(2);
        const marque = String(st.m.get('k') || '');
        ok(envois.length === 1 && marque.startsWith('attente:'), 'une marque « attente » est ecrite AVANT que le wallet rende (' + marque.slice(0, 12) + ')');
        ok(B.etat().attente === true, 'etat() de B (ouvert avant) RELIT : attente');
        ok(B.peutEnvoyer() === false && (await B.envoyer(de)).etat === 'ATTENTE' && envois.length === 1, 'une autre instance voit la marque : ATTENTE, rien n est envoye');
        w.lacher(H(5)); await p;
        ok(st.m.get('k') === H(5) && B.etat().tx === H(5), 'le hash remplace la marque ; l autre instance l adopte');
      }
      {
        const st = magasin(), w = wallet({ erreurSansHash: true });
        await M.creerEnvoiCreation(opt(w, st)).envoyer(de);
        const B = M.creerEnvoiCreation(opt(w, st));
        const w0 = wallet({ erreurSansHash: true }); const E0 = M.creerEnvoiCreation({ ...opt(w0, null), stockage: null });
        const r01 = await E0.envoyer(de), r02 = await E0.envoyer(de);
        ok(r01.etat === 'INCERTAIN' && r02.etat === 'INCERTAIN' && w0.envois.length === 1 && E0.peutEnvoyer() === false, 'erreur sans hash SANS stockage : la memoire garde INCERTAIN, aucun 2e envoi');
        ok(st.m.get('k') === 'incertain' && B.peutEnvoyer() === false && (await B.envoyer(de)).etat === 'INCERTAIN' && w.envois.length === 1, 'INCERTAIN est garde dans le stockage : une page rechargee n envoie pas');
        ok(typeof B.liberer === 'function' && B.liberer() === true && B.peutEnvoyer() === true && !st.m.has('k'), 'liberer() (la personne : rien n est parti) efface INCERTAIN');
      }
      {
        const st = magasin(), w = wallet({ refuse: 4001 });
        const r = await M.creerEnvoiCreation(opt(w, st)).envoyer(de);
        ok(r.etat === 'DECLINE' && !st.m.has('k'), 'refus 4001 : la marque est effacee');
      }
      {
        const st = magasin(), w = wallet({});
        const A = M.creerEnvoiCreation(opt(w, st)); await A.envoyer(de);
        ok(typeof A.liberer === 'function' && A.liberer() === false && st.m.get('k') === H(1) && A.peutEnvoyer() === false, 'liberer() n efface JAMAIS un hash garde');
      }
      {
        const st = magasin(), w = wallet({}); w.recuApres = 0;
        w.ethereum.request = ((orig) => async (a) => (a.method === 'eth_getTransactionReceipt' ? { status: '0x0', contractAddress: null, blockNumber: '0x10' } : orig(a)))(w.ethereum.request);
        const A = M.creerEnvoiCreation(opt(w, st));
        const B = M.creerEnvoiCreation(opt(w, st));
        await A.envoyer(de);
        ok(!st.m.has('k') && A.peutEnvoyer() === true, 'recu 0x0 : SON hash efface du stockage, envoyer de nouveau permis');
        /* B avait adopte rien ; un autre onglet ecrit un AUTRE hash ; A (dont le 0x0 est connu) ne l efface pas en relisant le sien */
        st.m.set('k', H(9));
        ok(B.peutEnvoyer() === false && B.etat().tx === H(9) && A.peutEnvoyer() === false, 'un autre hash ecrit ensuite : adopte par les deux instances (Deploy eteint)');
        /* le 0x0 arrive alors qu un AUTRE hash est dans le stockage : seul SON hash s efface */
        const st2 = magasin(), w2 = wallet({});
        w2.ethereum.request = ((orig) => async (a) => { if (a.method === 'eth_getTransactionReceipt') { st2.m.set('k', H(8)); return { status: '0x0', contractAddress: null, blockNumber: '0x10' }; } return orig(a); })(w2.ethereum.request);
        const r2 = await M.creerEnvoiCreation(opt(w2, st2)).envoyer(de);
        ok(r2.etat === 'ECHOUE' && st2.m.get('k') === H(8), 'recu 0x0 avec un AUTRE hash dans le stockage : celui-la reste (seul SON hash s efface)');
      }
      {
        const st = magasin(), w = wallet({});
        const A = M.creerEnvoiCreation(opt(w, st)); await A.envoyer(de);
        w.chaine = '0x1'; const p0 = w.polls;
        const r = await A.verifier();
        ok(r.etat === 'HORS_BASE' && r.chaine === '0x1' && w.polls === p0 && w.chaine === '0x1', 'verifier() hors de Base : HORS_BASE (la chaine dite), aucun recu lu, AUCUN changement de reseau demande');
        ok(typeof M.phraseEnvoi === 'function' && /not Base/.test(M.phraseEnvoi(r)) && /0x1/.test(M.phraseEnvoi(r)) && /history/.test(M.phraseEnvoi({ etat: 'ATTENTE' })) && !/reload/i.test(M.phraseEnvoi({ etat: 'INCERTAIN' })),
          'phraseEnvoi : HORS_BASE nomme la chaine ; ATTENTE renvoie a l historique ; INCERTAIN ne dit plus « reload »');
      }
    }
  }
} finally {
  for (const f of temporaires) fs.rmSync(f, { force: true });
  for (const x of Object.keys(globalThis)) if (x.startsWith('__onglet')) delete globalThis[x];
}
console.log('\n' + (n - ko) + ' ok / ' + ko + ' KO (' + n + ' assertions) ; NE PROUVE PAS un vrai navigateur (deux onglets, evenement storage), un vrai wallet, ni Base');
if (ko) process.exitCode = 1;
