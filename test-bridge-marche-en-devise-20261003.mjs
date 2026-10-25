/* test-bridge-marche-en-devise-20261003.mjs — LE BRIDGE LIT LE MARCHE COMME LE PROFIL, ET DIT LE MONTANT DANS SES DECIMALES.
 *
 * ⛔⛔ AUDIT RAILS R9 (2026-10-03, verification adversariale) : le Bridge appelait planEchange SANS marche lu. planEchange
 *   relisait par vieDuBlock sans `clesExactes`, aveugle aux pools V8 contre une devise ERC-20 : e7e9 (pool V8 SPCXc/e7e9,
 *   prix lu) recevait « this block has no market to trade on yet ». Et le Bridge formatait le minimum recu en 18 decimales
 *   quel que soit l actif : en SPCXc (8 dec) le chiffre affiche avant la signature aurait ete 1e10 fois trop petit.
 * ⛔ On execute les VRAIES fonctions d app.html (marcheDuHubBridge, recuBridge, extraites), pas des copies.
 * BORNES : partie A hors reseau (deterministe). Partie B lit Base mainnet + /api/cle de la prod, en LECTURE ; une panne
 *   reseau est un KO nomme, jamais un vert. Rien n est signe : le compte de simulation ne detient rien, la vente revert
 *   ou s arrete a une etape d approbation — le banc ne prouve que la LECTURE DU MARCHE et l AFFICHAGE, pas un echange. */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const imp = (f) => import(pathToFileURL(path.join(ICI, f)).href);
const E = await imp('echange.js');
const { vieDuBlock } = await imp('marche.js');
const { formaterUnites } = await imp('montants.js');
const { V4_ADRESSES } = await imp('lancer-pool.js');
const html = fs.readFileSync(path.join(ICI, 'app.html'), 'utf8').replace(/\r\n/g, '\n');

let n = 0, ko = 0;
const ok = (c, m) => { n += 1; if (c) console.log('ok  ' + m); else { ko += 1; console.log('KO  ' + m); } };
const extraire = (nom) => {
  const i = html.indexOf('function ' + nom + '(');
  if (i < 0) return null;
  let j = html.indexOf('{', i), prof = 0;
  for (let k = j; k < html.length; k += 1) {
    if (html[k] === '{') prof += 1; else if (html[k] === '}') { prof -= 1; if (prof === 0) return html.slice(i, k + 1); }
  }
  return null;
};
/* ⛔⛔ 2026-10-25 (Phil : « remove that ») : la vente du Bridge est RETIREE avec `marcheDuHubBridge` et `recuBridge`. Les cas
 *    qui les executaient (12 assertions, 1 mutant) gardaient deux regles ; elles sont re-ancrees sur ce qui reste :
 *    (1) tout appel `planEchange` de l ecran passe un marche lu (le site restant : Buy/Sell de la fiche) ;
 *    (2) le minimum recu dit avant signature est formate dans les decimales LUES de ce qu on recoit, jamais 18 en dur —
 *        dans le chemin du Chat (bcProposerSwap), ou passe desormais le Swap du Wallet. */
const code = html.replace(/\/\*[\s\S]*?\*\//g, ' ');
ok(!extraire('marcheDuHubBridge') && !extraire('recuBridge'), 'les lecteurs de la vente du Bridge sont partis avec elle');
const appels = code.match(/planEchange\(\{[^}]*\}\)/g) || [];
ok(appels.length >= 1 && appels.every((a) => /marcheLu: /.test(a)), 'tout appel planEchange de l ecran passe marcheLu (' + appels.length + ')');
/* (`extraire` s arrete a la premiere accolade : ici celle du parametre destructure — on borne donc par la signature entiere) */
const swap = (/async function bcProposerSwap\(qui, classe, \{ de, vers, montant \}, ref, suivi = null\) \{([\s\S]*?)\n\}/.exec(html) || ['', ''])[1];
ok(swap.length > 3000, 'bcProposerSwap extraite (' + swap.length + ')');
const ligneMin = (swap.match(/bcEtape\(m, 'You receive at least '[^\n]*/) || [''])[0];
ok(/bcUnites\(rs\.recoitAuMoins, decVers\)/.test(ligneMin) && !/, 18\)/.test(ligneMin),
  'Chat : le minimum recu est formate dans les decimales LUES de vers (decVers), pas 18 en dur');
ok(/decVers === null \? rs\.recoitAuMoins \+ ' raw units of '/.test(ligneMin), 'Chat : decimales illisibles -> unites brutes nommees, jamais un chiffre devine');
/* MUTANT (sur une COPIE du texte) : 18 decimales en dur a la place de decVers — la regle ci-dessus doit le voir */
const mutantLigne = ligneMin.replace('bcUnites(rs.recoitAuMoins, decVers)', 'bcUnites(rs.recoitAuMoins, 18)');
ok(mutantLigne !== ligneMin && !(/bcUnites\(rs\.recoitAuMoins, decVers\)/.test(mutantLigne) && !/, 18\)/.test(mutantLigne)),
  'MUTANT 18 decimales en dur : la regle le refuse');
const spcx = { paire: 'DEVISE', devise: 'SPCXc', decDevise: 8 };
ok(formaterUnites(150000000n, 8) !== formaterUnites(150000000n, 18), 'TEMOIN : 8 et 18 decimales donnent bien deux textes differents');

/* ── B. sur la chaine : e7e9 (marche V8 contre SPCXc), IB022 (marche V8 contre ETH) ── */
const URLS = ['https://mainnet.base.org', 'https://base-rpc.publicnode.com'];
let id = 0;
const rpc = async (method, params) => {
  let derniere = null;
  for (let e = 0; e < 4; e += 1) for (const url of URLS) {
    try {
      const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', 'x-ms-monitor': '1' },
        signal: AbortSignal.timeout(30000), body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params }) }).then((x) => x.json());
      if (r.error) { const err = new Error(r.error.message + (r.error.data ? ' data=' + r.error.data : '')); err.data = r.error.data; throw err; }
      return r.result;
    } catch (err) {
      derniere = err;
      if (!/rate|limit|429|timeout|ECONN|fetch failed|network|503|502|504|too many|socket|aborted/i.test(String(err.message))) throw err;
      await new Promise((o) => setTimeout(o, 800));
    }
  }
  throw derniere;
};
const clesReellesDe = async (adr) => {
  const d = await fetch('https://tokenizedblock.space/api/cle/' + String(adr).toLowerCase(), { headers: { 'x-ms-monitor': '1' } }).then((r) => r.json());
  return d && d.ok === true && Array.isArray(d.cles) ? d.cles : [];
};
/* 2026-10-25 : `marcheDuHubBridge` n existe plus dans app.html ; la LECTURE qu elle faisait (vieDuBlock avec les cles exactes
 *   servies par /api/cle) est rejouee ici directement sur les modules — c est elle que la partie B garde. */
const marcheDuHubBridge = async (hub) => {
  try { return await vieDuBlock({ rpc, stateView: V4_ADRESSES[8453].stateView, jeton: hub, clesExactes: await clesReellesDe(hub) }); }
  catch (_) { return null; }
};
void spcx;

/* adresses LUES dans le depot (index-routeur.js, pool-sans-hook.js), jamais tapees */
const ir = fs.readFileSync(path.join(ICI, 'index-routeur.js'), 'utf8');
const E7 = (ir.match(/0xb20+e7e9[0-9a-f]+\b/i) || [])[0];
const COMPTE = '0x31e0dbc9038c82184b9fa6a90057a3ed500bde3b'; /* compte de simulation de l audit : ne detient ni e7e9 ni SPCXc */
ok(!!E7 && /^0x[0-9a-f]{40}$/i.test(E7), 'e7e9 lu dans index-routeur.js : ' + E7);
try {
  const m = await marcheDuHubBridge(E7);
  ok(m && m.etat === 'LUE' && m.paire === 'DEVISE' && m.devise === 'SPCXc' && Number(m.decDevise) === 8,
    'e7e9 : marche LU (vieDuBlock + cles exactes), paire DEVISE SPCXc, 8 dec (' + (m && [m.etat, m.paire, m.devise, m.decDevise].join(' ')) + ')');
  const avec = await E.planEchange({ rpc, chaine: 8453, jeton: E7, compte: COMPTE, sens: 'VENTE', montant: 10n ** 16n, marcheLu: m });
  /* ⛔ pas « absence du mot » seulement (passait A VIDE sur une adresse illisible) : le plan doit avoir atteint le quote */
  ok(!/no market to trade on yet|its market could not be read/.test(String(avec.pourquoi || '')),
    'e7e9 VENTE avec marche lu : ni « no market » ni « could not be read » (' + avec.etat + ' ' + String(avec.pourquoi || '').slice(0, 80) + ')');
  const achat = await E.planEchange({ rpc, chaine: 8453, jeton: E7, compte: COMPTE, sens: 'ACHAT', montant: 100000n, marcheLu: m });
  ok(['PRET', 'APPROBATIONS'].includes(achat.etat) && achat.resume && achat.resume.fraisParHook === true && achat.resume.fraisBps === 0n,
    'e7e9 ACHAT 0,001 SPCXc avec marche lu : plan construit, hook payeur, routeur 0 bps (' + achat.etat + ' ' + String(achat.pourquoi || '').slice(0, 60) + ')');
  /* TEMOIN : le chemin d avant (sans marcheLu) dit toujours « no market » — c est ce que le Bridge affichait */
  const sans = await E.planEchange({ rpc, chaine: 8453, jeton: E7, compte: COMPTE, sens: 'VENTE', montant: 10n ** 16n });
  ok(/no market to trade on yet/.test(String(sans.pourquoi || '')), 'TEMOIN sans marche lu : « no market » (le defaut d avant) (' + sans.etat + ')');
} catch (err) {
  ok(false, 'lecture reseau impossible — NON MESURE, pas un vert : ' + String(err && err.message).slice(0, 100));
}

console.log(n + ' assertions, ' + ko + ' KO');
process.exit(ko ? 1 : 0);
