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
const srcMarche = extraire('marcheDuHubBridge'), srcRecu = extraire('recuBridge');
ok(!!srcMarche && !!srcRecu, 'marcheDuHubBridge et recuBridge extraites d app.html');
const fabriquerRecu = (src) => new Function('formaterUnites', src + '\nreturn recuBridge;')(formaterUnites);
const recuBridge = fabriquerRecu(srcRecu);

/* ── les DEUX appels du Bridge passent le marche lu, et le texte avant signature passe par recuBridge ── */
const appels = html.match(/planEchange\(\{ rpc, chaine: CHAINE, jeton: hub, compte, sens: 'VENTE', montant: unites[^}]*\}\)/g) || [];
ok(appels.length === 2 && appels.every((a) => /marcheLu: marche[BS]\b/.test(a)), 'Bridge : les 2 appels planEchange passent marcheLu (' + appels.length + ')');
ok(/You receive at least ' \+ recuS\b/.test(html) && !/formaterUnites\(sortieResume\.recoitAuMoins \|\| 0n, 18\)/.test(html),
  'Bridge : le texte avant signature utilise recuBridge, plus de 18 decimales en dur');
ok(/if \(!recuS\) \{/.test(html), 'Bridge : devise illisible -> arret avant la signature');

/* ── A. recuBridge, hors reseau ── */
const spcx = { paire: 'DEVISE', devise: 'SPCXc', decDevise: 8 };
ok(recuBridge({ recoitDevise: 'pair', recoitAuMoins: 150000000n }, spcx) === formaterUnites(150000000n, 8) + ' SPCXc',
  'paire SPCXc 8 dec : 1,5e8 unites -> ' + recuBridge({ recoitDevise: 'pair', recoitAuMoins: 150000000n }, spcx));
ok(recuBridge({ recoitDevise: 'ETH', recoitAuMoins: 10n ** 15n }, null) === formaterUnites(10n ** 15n, 18) + ' ETH', 'TEMOIN vente en ETH : 18 decimales, inchange');
ok(recuBridge({ recoitDevise: 'pair', recoitAuMoins: 1n }, null) === null, 'paire sans marche lu -> null (on ne devine pas)');
ok(recuBridge({ recoitDevise: 'pair', recoitAuMoins: 1n }, { paire: 'DEVISE', devise: 'X' }) === null, 'paire sans decimales lues -> null');
ok(recuBridge(null, spcx) === null, 'pas de resume -> null');
/* MUTANT : l ancien formatage (18 en dur) — le banc doit voir la difference */
const mutant = fabriquerRecu(srcRecu.replace('formaterUnites(resume.recoitAuMoins || 0n, dec)', 'formaterUnites(resume.recoitAuMoins || 0n, 18)'));
ok(mutant({ recoitDevise: 'pair', recoitAuMoins: 150000000n }, spcx) !== recuBridge({ recoitDevise: 'pair', recoitAuMoins: 150000000n }, spcx),
  'MUTANT 18 decimales en dur : le montant affiche change, le banc le voit');

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
/* `extraire` commence a « function » : le mot « async » qui la precede dans app.html est remis ici */
ok(html.includes('async ' + srcMarche), 'marcheDuHubBridge est async dans app.html');
const marcheDuHubBridge = new Function('vieDuBlock', 'rpc', 'RESEAUX', 'CHAINE', 'clesReellesDe', 'async ' + srcMarche + '\nreturn marcheDuHubBridge;')(
  vieDuBlock, rpc, { 8453: { stateView: V4_ADRESSES[8453].stateView } }, 8453, clesReellesDe);

/* adresses LUES dans le depot (index-routeur.js, pool-sans-hook.js), jamais tapees */
const ir = fs.readFileSync(path.join(ICI, 'index-routeur.js'), 'utf8');
const E7 = (ir.match(/0xb20+e7e9[0-9a-f]+\b/i) || [])[0];
const COMPTE = '0x31e0dbc9038c82184b9fa6a90057a3ed500bde3b'; /* compte de simulation de l audit : ne detient ni e7e9 ni SPCXc */
ok(!!E7 && /^0x[0-9a-f]{40}$/i.test(E7), 'e7e9 lu dans index-routeur.js : ' + E7);
try {
  const m = await marcheDuHubBridge(E7);
  ok(m && m.etat === 'LUE' && m.paire === 'DEVISE' && m.devise === 'SPCXc' && Number(m.decDevise) === 8,
    'e7e9 : marche LU par le Bridge, paire DEVISE SPCXc, 8 dec (' + (m && [m.etat, m.paire, m.devise, m.decDevise].join(' ')) + ')');
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
