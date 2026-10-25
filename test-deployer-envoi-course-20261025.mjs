/* test-deployer-envoi-onglets-20261025.mjs — DEUX ONGLETS, UNE PAGE RECHARGEE PENDANT LA DEMANDE DU WALLET, UN WALLET HORS DE BASE :
 *   toujours AU PLUS UNE creation (revue dv2Review 2026-10-25, defauts 1 a 3 de envoi-creation.js).
 * EXECUTE (pas lu) : le script REEL de chaque page (deployer-duels-v2.html, deployer-duels.html, deployer-slots.html) tourne dans un faux DOM,
 *   avec un faux wallet qui compte les eth_sendTransaction ; deux pages peuvent etre montees EN MEME TEMPS (deux onglets : chaque copie du
 *   script a son propre `document` / `window`, le stockage est partage). La copie ne change que : la fiche (adresse et bloc remis a null pour
 *   v1 et slots, deja deployes), l attente (pas de 2 s), et les deux constantes `document` / `window` en tete du module.
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
  { nom: 'deployer-duels-v2.html', env: 'PAGE_DUELS_V2', fiche: null, rel: relDuels(DV2), code: art.deployedBytecode.object },
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
    const f = path.join(ICI, '.tmp-rzrace-' + process.pid + '-' + k + '-fiche.mjs');
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
  const f = path.join(ICI, '.tmp-rzrace-' + process.pid + '-' + k + '-page.mjs');
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
    const store = magasin(), envois = [];
    const wA = wallet({ envois, pendre: true }); wA.relectures = P.rel;
    const wB = wallet({ envois }); wB.relectures = P.rel;
    const A = await monter(P, wA, store); await connecter(A);
    const B = await monter(P, wB, store); await connecter(B);
    /* tab B: Deploy clicked, its wallet is slow to answer eth_chainId (WalletConnect round trip, or a network-switch prompt) */
    let lacherB = null; const orig = wB.ethereum.request.bind(wB.ethereum);
    wB.ethereum.request = async (a) => { if (a.method === 'eth_chainId' && !lacherB) { await new Promise((r) => { lacherB = r; }); } return orig(a); };
    const pB = lancer(q(B, '#bDeployer')); await pause(5);
    /* tab A: Deploy clicked, wallet prompt open (pending marker written) */
    const pA = lancer(q(A, '#bDeployer')); await pause(5);
    console.log(P.nom, 'after A click: envois=', envois.length, 'stored=', [...store.m.values()]);
    lacherB(); await pause(20);
    ok(envois.length === 1, P.nom + ' tab B resumes after its eth_chainId while tab A is in its wallet prompt: creations sent = ' + envois.length + ' ; B says: ' + etat(B).slice(0, 60));
    wA.lacher(H(9)); await pause(20);
    console.log('   stored at end=', [...store.m.values()]);
  }
} finally { for (const f of temporaires) { try { fs.unlinkSync(f); } catch (_) {} } }
console.log('\n' + (n - ko) + ' ok / ' + ko + ' KO');
process.exit(ko ? 1 : 0);
