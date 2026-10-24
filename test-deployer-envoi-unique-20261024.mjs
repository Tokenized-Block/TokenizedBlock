/* test-deployer-envoi-unique-20261024.mjs — LES PAGES DE DEPLOIEMENT N ENVOIENT JAMAIS DEUX CREATIONS (revue BlockDuelsV2 2026-10-24, LOW n°3).
 * EXECUTE (pas lu) : le script REEL de chaque page (deployer-duels-v2.html, deployer-duels.html, deployer-slots.html) tourne dans un faux DOM,
 *   avec un faux wallet (window.ethereum) qui compte les eth_sendTransaction. Une COPIE du script est ecrite a cote de la page (imports
 *   relatifs) ; la copie ne change que : la fiche (adresse et bloc remis a null pour v1 et slots, deja deployes), et l attente (pas de 2 s).
 * AFFIRME, pour chaque page :
 *   S1 un wallet qui ACCEPTE le changement de reseau mais reste ailleurs (eth_chainId relu != 0x2105) : AUCUN envoi, la page le dit ;
 *   S2 un recu qui n arrive pas pendant l attente : UN envoi, le hash garde et montre, Deploy RESTE eteint, « Check again » propose ; un 2e
 *      appui sur Deploy n envoie rien ; « Check again » relit le recu (arrive entre-temps) et la relecture ; toujours UN envoi ;
 *   S3 un contrat qui ne relit pas ce qui a ete signe : Deploy reste eteint (aucun 2e envoi) ;
 *   S4 deux appuis rapides : UN envoi ;  S5 refus dans le wallet (4001) : aucun envoi, Deploy rallume (rien n est parti) ;
 *   S6 la page RECHARGEE apres un envoi (meme navigateur) : Deploy eteint, « Check again » propose, le hash montre ;
 *   S7 une erreur du wallet SANS hash (on ne sait pas s il a envoye) : Deploy reste eteint, la page le dit ;
 *   S8 un recu status 0x0 (aucun contrat cree, final) : Deploy rallume, la page le dit.
 *   + le module envoi-creation.js (execute) : surBase relit eth_chainId apres le changement ; envoyer() refuse tant qu un hash est garde.
 * Modules remplacables (mutants) : ENVOI_CREATION (envoi-creation.js), PAGE_DUELS_V2, PAGE_DUELS, PAGE_SLOTS.
 * ⛔ PORTABLE : process.exitCode. NE PROUVE PAS : un vrai wallet (MetaMask, Coinbase), un vrai deploiement sur Base. */
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
const HEX = (v) => '0x' + BigInt(v).toString(16);

/* ── le faux DOM : des elements par selecteur ; un bouton DESACTIVE ne recoit pas le clic (comme un navigateur) ── */
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
/* l etat initial des boutons vient de la page (attribut hidden / disabled), lu dans son HTML */
function etatInitial(page, D) {
  for (const m of page.matchAll(/<button[^>]*id="(\w+)"[^>]*>/g)) { const e = D.document.querySelector('#' + m[1]); e.hidden = /\shidden[\s>]/.test(m[0]); e.disabled = /\sdisabled[\s>]/.test(m[0]); }
  for (const m of page.matchAll(/<dl[^>]*id="(\w+)"[^>]*>/g)) { const e = D.document.querySelector('#' + m[1]); e.hidden = /\shidden[\s>]/.test(m[0]); }
}

/* ── le faux wallet : compte les creations ; recu, chaine, relectures reglables ── */
function wallet({ chaine = '0x2105', changeVraiment = true, refuse = null, erreurSansHash = false, recuApres = 0, statut = '0x1', relectures = {}, code = '0x' }) {
  const w = { envois: [], chaine, appels: [], polls: 0, recuApres, statut, relectures, adresse: '0x' + '9c'.repeat(20) };
  w.ethereum = {
    on() {},
    async request({ method, params }) {
      w.appels.push(method);
      if (method === 'eth_requestAccounts') return ['0x' + 'de'.repeat(20)];
      if (method === 'eth_chainId') return w.chaine;
      if (method === 'wallet_switchEthereumChain') { if (changeVraiment) w.chaine = params[0].chainId; return null; }
      if (method === 'eth_sendTransaction') {
        if (refuse) { const e = new Error('User rejected'); e.code = refuse; throw e; }
        w.envois.push(params[0]);
        if (erreurSansHash) throw new Error('internal wallet error');
        return '0x' + String(w.envois.length).padStart(2, '0').repeat(32);
      }
      if (method === 'eth_getTransactionReceipt') { w.polls += 1; return w.polls > w.recuApres ? { status: w.statut, contractAddress: w.statut === '0x1' ? w.adresse : null, blockNumber: '0x10', blockHash: '0x' + '0b'.repeat(32), transactionHash: params[0] } : null; }
      if (method === 'eth_getCode') return code;
      if (method === 'eth_call') { const sel = params[0].data.slice(0, 10); if (!(sel in w.relectures)) throw new Error('unexpected eth_call ' + params[0].data.slice(0, 10)); return w.relectures[sel]; }
      throw new Error('unexpected ' + method);
    },
  };
  return w;
}

/* ── chaque page : sa fiche, ses relectures « bonnes » ── */
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
  { nom: 'deployer-duels-v2.html', env: 'PAGE_DUELS_V2', fiche: null, rel: relDuels(DV2), code: art.deployedBytecode.object, mauvais: sel('GUARDIAN()') },
  { nom: 'deployer-duels.html', env: 'PAGE_DUELS', fiche: ['./duels-deploiement.js', 'DUELS_DEPLOIEMENT'], rel: relDuels(DV1), code: '0x', mauvais: sel('GUARDIAN()') },
  { nom: 'deployer-slots.html', env: 'PAGE_SLOTS', fiche: ['./slots-deploiement.js', 'SLOTS_DEPLOIEMENT'], rel: relSlots, code: '0x', mauvais: sel('SPIN_PRICE()') },
];
const ENVOI = process.env.ENVOI_CREATION ? path.resolve(process.env.ENVOI_CREATION) : null;

const temporaires = [];
let k = 0;
/** monte la page : copie du script a cote de la page, fiche non deployee, attente sans pause ; rend { D, w, store } apres la verification */
async function monter(P, w, store) {
  const src = lire(process.env[P.env] || P.nom);
  const script = (src.match(/<script type="module">([\s\S]*?)<\/script>/) || ['', ''])[1];
  let s = script.replace(/setTimeout\(r, 2000\)/g, 'setTimeout(r, 0)').replace(/creerEnvoiCreation\(\{/g, 'creerEnvoiCreation({ pasMs: 0, essais: 3, ');
  if (ENVOI) s = s.replace(/from '\.\/envoi-creation\.js'/, () => "from '" + pathToFileURL(ENVOI).href + "'");
  k += 1;
  if (P.fiche) {
    const f = path.join(ICI, '.tmp-envoi-' + process.pid + '-' + k + '-fiche.mjs');
    fs.writeFileSync(f, "import { " + P.fiche[1] + " as X } from '" + P.fiche[0] + "';\nexport const " + P.fiche[1] + " = Object.freeze({ ...X, adresse: null, bloc: null });\n");
    temporaires.push(f);
    s = s.split("from '" + P.fiche[0] + "'").join("from './" + path.basename(f) + "'");
  }
  const f = path.join(ICI, '.tmp-envoi-' + process.pid + '-' + k + '-page.mjs');
  fs.writeFileSync(f, s); temporaires.push(f);
  const D = dom(); etatInitial(src, D);
  globalThis.document = D.document;
  globalThis.window = { ethereum: w.ethereum, localStorage: store };
  globalThis.localStorage = store;
  await import(pathToFileURL(f).href);
  for (let i = 0; i < 50 && !/ok|ko/.test(D.document.querySelector('#dVerif').className); i++) await pause(2);
  return D;
}
const magasin = () => { const m = new Map(); return { m, getItem: (x) => (m.has(x) ? m.get(x) : null), setItem: (x, v) => { m.set(x, String(v)); }, removeItem: (x) => { m.delete(x); } }; };
const q = (D, s) => D.document.querySelector(s);
const etat = (D) => q(D, '#dEtat').textContent;
async function connecter(D) { await q(D, '#bConnecter').clic(); await pause(1); }

try {
  for (const P of PAGES) {
    console.log('— ' + P.nom);
    {
      const w = wallet({ chaine: '0x1', changeVraiment: false, rel: P.rel }); w.relectures = P.rel;
      const D = await monter(P, w, magasin()); await connecter(D);
      ok(q(D, '#dVerif').className.includes('ok') && q(D, '#bDeployer').disabled === false, P.nom + ' : verification verte, wallet connecte -> Deploy allume');
      await q(D, '#bDeployer').clic();
      ok(w.envois.length === 0 && w.appels.filter((m) => m === 'eth_chainId').length >= 2 && /Base/.test(etat(D)), 'S1 le wallet dit oui au changement mais reste sur 0x1 : eth_chainId RELU, AUCUN envoi (' + etat(D).slice(0, 60) + ')');
    }
    const store = magasin();
    {
      const w = wallet({ recuApres: 1e9, code: P.code }); w.relectures = P.rel;
      const D = await monter(P, w, store); await connecter(D);
      await q(D, '#bDeployer').clic();
      ok(w.envois.length === 1 && w.envois[0].data === (P.fiche ? (P.nom.includes('slots') ? DS : DV1) : DV2).creation && !w.envois[0].to, 'S2 recu en retard : UN envoi (la creation figee, sans `to`)');
      const tx = '0x' + '01'.repeat(32);
      ok(q(D, '#bDeployer').disabled === true && q(D, '#rTx').textContent === tx && q(D, '#dResultat').hidden === false, 'S2 le hash est garde et montre ; Deploy reste ETEINT');
      const rev = q(D, '#bRevoir');
      ok(rev.hidden === false && rev.disabled === false && /Check again/i.test(lire(process.env[P.env] || P.nom).match(/<button[^>]*id="bRevoir"[^>]*>([^<]*)</)?.[1] || ''), 'S2 « Check again » propose a la place');
      await q(D, '#bDeployer').clic();
      ok(w.envois.length === 1, 'S2 un 2e appui sur Deploy : rien n est envoye (' + w.envois.length + ' envoi)');
      w.recuApres = 0;
      await rev.clic();
      ok(w.envois.length === 1 && /reads back exactly what was signed/.test(etat(D)) && q(D, '#rAdr').textContent.startsWith(w.adresse), 'S2 « Check again » : le recu relu, le contrat relu, toujours UN envoi (' + etat(D).slice(0, 50) + ')');
      ok(q(D, '#bDeployer').disabled === true && q(D, '#bRevoir').hidden === true, 'S2 deploye et relu : Deploy eteint, « Check again » retire');
    }
    {
      /* S6 : la meme page rechargee, avec le hash garde dans ce navigateur (S2 a envoye) — on recharge AVANT la confirmation */
      const st = magasin();
      const w0 = wallet({ recuApres: 1e9 }); w0.relectures = P.rel;
      const D0 = await monter(P, w0, st); await connecter(D0); await q(D0, '#bDeployer').clic();
      const w = wallet({ recuApres: 1e9 }); w.relectures = P.rel;
      const D = await monter(P, w, st); await connecter(D);
      await q(D, '#bDeployer').clic();
      ok(w0.envois.length === 1 && w.envois.length === 0 && q(D, '#bDeployer').disabled === true && q(D, '#bRevoir').hidden === false && q(D, '#rTx').textContent === '0x' + '01'.repeat(32),
        'S6 page rechargee apres un envoi : Deploy eteint, « Check again » et le hash montres, aucun nouvel envoi');
    }
    {
      const rel = { ...P.rel, [P.mauvais]: '0x' + u(12345) };
      const w = wallet({ code: P.code }); w.relectures = rel;
      const D = await monter(P, w, magasin()); await connecter(D);
      await q(D, '#bDeployer').clic();
      ok(w.envois.length === 1 && /differs from what was signed/.test(etat(D)), 'S3 relecture differente : dit « Do not use it » (' + etat(D).slice(0, 60) + ', ' + w.envois.length + ')');
      await q(D, '#bDeployer').clic();
      ok(w.envois.length === 1 && q(D, '#bDeployer').disabled === true, 'S3 Deploy reste eteint : aucun 2e envoi (' + w.envois.length + ')');
    }
    {
      const w = wallet({ code: P.code }); w.relectures = P.rel;
      const D = await monter(P, w, magasin()); await connecter(D);
      await Promise.all([q(D, '#bDeployer').clic(), q(D, '#bDeployer').clic()]);
      ok(w.envois.length === 1, 'S4 deux appuis rapides : UN envoi');
    }
    {
      const w = wallet({ refuse: 4001 }); w.relectures = P.rel;
      const D = await monter(P, w, magasin()); await connecter(D);
      await q(D, '#bDeployer').clic();
      ok(w.envois.length === 0 && /declined/.test(etat(D)) && q(D, '#bDeployer').disabled === false, 'S5 refus dans le wallet : rien n est parti, Deploy rallume');
    }
    {
      const w = wallet({ erreurSansHash: true }); w.relectures = P.rel;
      const D = await monter(P, w, magasin()); await connecter(D);
      await q(D, '#bDeployer').clic();
      await q(D, '#bDeployer').clic();
      ok(w.envois.length === 1 && q(D, '#bDeployer').disabled === true && /cannot tell whether/i.test(etat(D)), 'S7 erreur du wallet sans hash : Deploy reste eteint, « cannot tell whether » dit (' + etat(D).slice(0, 70) + ')');
    }
    {
      const w = wallet({ statut: '0x0' }); w.relectures = P.rel;
      const D = await monter(P, w, magasin()); await connecter(D);
      await q(D, '#bDeployer').clic();
      ok(w.envois.length === 1 && /no contract was created/.test(etat(D)) && q(D, '#bDeployer').disabled === false && q(D, '#bRevoir').hidden === true, 'S8 recu 0x0 (final, aucun contrat) : Deploy rallume, la page le dit');
    }
    {
      const page = lire(process.env[P.env] || P.nom);
      const script = (page.match(/<script type="module">([\s\S]*?)<\/script>/) || ['', ''])[1];
      ok(/import \{ creerEnvoiCreation \} from '\.\/envoi-creation\.js';/.test(script) && !/data: D\.creation/.test(script.replace(/creation: D\.creation/, '')), P.nom + ' : la creation part par envoi-creation.js (aucun autre eth_sendTransaction de D.creation dans la page)');
    }
  }

  console.log('— envoi-creation.js (execute)');
  {
    let M = null; try { M = await import(pathToFileURL(ENVOI || path.join(ICI, 'envoi-creation.js')).href); } catch (e) { M = null; }
    ok(!!M && typeof M.creerEnvoiCreation === 'function', 'le module existe et exporte creerEnvoiCreation');
    if (M) {
      const w = wallet({ chaine: '0x1' }); const E = M.creerEnvoiCreation({ eth: () => w.ethereum, chaineHex: '0x2105', creation: '0x60', pasMs: 0, essais: 2 });
      ok((await E.surBase()) === true && w.appels.join() === 'eth_chainId,wallet_switchEthereumChain,eth_chainId', 'surBase : lit, change, RELIT eth_chainId');
      const w2 = wallet({ chaine: '0x1', changeVraiment: false }); const E2 = M.creerEnvoiCreation({ eth: () => w2.ethereum, chaineHex: '0x2105', creation: '0x60', pasMs: 0, essais: 2 });
      ok((await E2.surBase()) === false, 'surBase : un changement accepte mais pas fait -> false');
      const w3 = wallet({ recuApres: 1e9 }); const E3 = M.creerEnvoiCreation({ eth: () => w3.ethereum, chaineHex: '0x2105', creation: '0x60', pasMs: 0, essais: 2 });
      const r1 = await E3.envoyer('0x' + 'de'.repeat(20)); const r2 = await E3.envoyer('0x' + 'de'.repeat(20));
      ok(r1.etat === 'NON_CONFIRME' && r2.etat === 'DEJA_ENVOYE' && w3.envois.length === 1 && E3.peutEnvoyer() === false && E3.etat().tx === r1.tx, 'envoyer : NON_CONFIRME puis DEJA_ENVOYE, UN envoi, peutEnvoyer faux');
      const w5 = wallet({}); const E5 = M.creerEnvoiCreation({ eth: () => w5.ethereum, chaineHex: '0x2105', creation: '0x60', pasMs: 0, essais: 2 });
      const [a1, a2] = await Promise.all([E5.envoyer('0x' + 'de'.repeat(20)), E5.envoyer('0x' + 'de'.repeat(20))]);
      ok(w5.envois.length === 1 && [a1.etat, a2.etat].sort().join() === 'CONFIRME,EN_COURS', 'deux envoyer() simultanes (sans la page) : UN envoi, le second dit EN_COURS');
      const st = magasin(); const w6 = wallet({ recuApres: 1e9 });
      await M.creerEnvoiCreation({ eth: () => w6.ethereum, chaineHex: '0x2105', creation: '0x60', pasMs: 0, essais: 1, stockage: st, cle: 'k' }).envoyer('0x' + 'de'.repeat(20));
      const E6 = M.creerEnvoiCreation({ eth: () => w6.ethereum, chaineHex: '0x2105', creation: '0x60', pasMs: 0, essais: 1, stockage: st, cle: 'k' });
      ok(E6.peutEnvoyer() === false && (await E6.envoyer('0x' + 'de'.repeat(20))).etat === 'DEJA_ENVOYE' && w6.envois.length === 1, 'un module recree avec le meme stockage : le hash relu, aucun nouvel envoi');
      const casse = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); }, removeItem() { throw new Error('blocked'); } };
      const w4 = wallet({}); const E4 = M.creerEnvoiCreation({ eth: () => w4.ethereum, chaineHex: '0x2105', creation: '0x60', pasMs: 0, essais: 2, stockage: casse, cle: 'k' });
      ok((await E4.envoyer('0x' + 'de'.repeat(20))).etat === 'CONFIRME' && w4.envois.length === 1, 'un stockage qui leve : l envoi marche quand meme (une fois)');
    }
  }
} finally {
  for (const f of temporaires) fs.rmSync(f, { force: true });
  delete globalThis.document; delete globalThis.window; delete globalThis.localStorage;
}
console.log('\n' + (n - ko) + ' ok / ' + ko + ' KO (' + n + ' assertions) ; NE PROUVE PAS un vrai wallet ni un deploiement sur Base');
if (ko) process.exitCode = 1;
