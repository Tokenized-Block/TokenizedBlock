/* test-pools-du-bloc-20261017.mjs — la jambe d un block cote TOUTES ses pools de la paire, et le meilleur devis gagne.
 * ⛔ MESURE (2026-10-17) : /api/cle de UNIT rend 2 cles (ETH sur le hook 7030, et mmETH 0x4fc5…4131 sur le hook 0xb272…a8c0) ;
 *   rails-api `resolveurAvec` et app.html `resoudreA` / `resoudre` ne passaient au quoter QUE la cle du marche lu.
 * EXECUTE echange.js (`clesDeLaPaire`, `meilleureClePourBloc`) avec un quoter simule (aucun reseau), puis verifie le CABLAGE :
 *   A. deux pools de NOTRE hook sur la meme paire : la mieux cotee gagne, meme si ce n est pas la cle connue ;
 *   B. la cle d une AUTRE paire (UNIT/mmETH pour un saut UNIT -> ETH) est ecartee ET nommee, jamais cotee ;
 *   C. une pool a hook TIERS d un block qui a une pool sur notre hook est ecartee (regle du fondateur) ; piege > 10 % ecarte ;
 *   D. une pool qui ne cote pas est sautee et DITE (nonCotees) ;
 *   E. « pool qui paie » : OpenLaunch sans hook (ne paie pas) mieux cotee de <= MARGE_BPS -> notre pool ; au-dela -> la meilleure ;
 *   F. cablage : rails-api et app.html appellent meilleureClePourBloc avec TOUTES les cles du block.
 * ⛔ BORNE : prouve le CHOIX de cle ; le frais a l arrivee est prouve par banc-pools-du-bloc-fork-20261017.mjs (soldes). */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
const ICI = path.dirname(fileURLToPath(import.meta.url));
const imp = (f) => import(pathToFileURL(path.join(ICI, f)).href);
let n = 0, ko = 0;
const ok = (c, m) => { n += 1; if (c) console.log('ok  ' + m); else { ko += 1; console.log('KO  ' + m); } };
const E = await imp('echange.js');
const T = await imp('tokenomics.js');
const { MARGE_BPS } = await imp('choix-de-pool.js');
ok(typeof E.meilleureClePourBloc === 'function' && typeof E.clesDeLaPaire === 'function', 'echange.js exporte clesDeLaPaire et meilleureClePourBloc');
if (typeof E.meilleureClePourBloc !== 'function') { console.log('FAIL pools-du-bloc - ' + n + ' assertions, ' + ko + ' KO'); process.exit(1); }

const ETH = '0x0000000000000000000000000000000000000000';
const UNIT = '0xb2000000000000000000007afa7ed748b0874f27';
const MM = '0x4fc59c42653e052c7ab5c8381f839e2d70504131';
const TIERS = '0xb272897088653b14168712a8fae1978b9855a8c0';
const H7030 = T.HOOK_7030, HV8 = T.HOOK_V8;
const cle = (c0, fee, ts, hooks) => ({ currency0: c0, currency1: UNIT, fee, tickSpacing: ts, hooks });
const K7030 = cle(ETH, 0, 200, H7030);
const KV8 = cle(ETH, 0, 200, HV8);
const KMM = cle(MM, 0, 1, TIERS);
const KTIERS = cle(ETH, 0, 1, TIERS);
const KPIEGE = cle(ETH, 880238, 200, ETH);
const KOPEN = cle(ETH, 30000, 200, ETH); /* format OpenLaunch : seule pool sans hook admise pour un block, et elle ne paie pas a6cf */
/* quoter simule : le devis depend du hook ET du frais de la cle lue dans le calldata ; absent = revert */
const quoter = (table) => {
  const appels = [];
  const f = async (m, p) => {
    const d = String(p[0].data).toLowerCase();
    appels.push(d);
    for (const [k, q] of table) {
      const h = String(k.hooks).toLowerCase().slice(2), fe = Number(k.fee).toString(16).padStart(64, '0');
      if (d.includes(h.padStart(64, '0')) && d.includes(fe) && d.includes(Number(k.tickSpacing).toString(16).padStart(64, '0'))) {
        if (q === null) throw new Error('execution reverted');
        return '0x' + BigInt(q).toString(16).padStart(64, '0') + '0'.repeat(64);
      }
    }
    throw new Error('execution reverted');
  };
  f.appels = appels;
  return f;
};
const base = { chaine: 8453, de: UNIT, vers: ETH, montant: 10n ** 18n };

/* A */
const ra = await E.meilleureClePourBloc({ ...base, rpc: quoter([[K7030, 100n], [KV8, 120n]]), cles: [K7030, KV8, KMM], cleConnue: K7030 });
ok(ra.etat === 'OK' && String(ra.cle.hooks).toLowerCase() === HV8.toLowerCase() && ra.quote === 120n, 'A. la pool V8 cotee 120 bat la cle connue 7030 cotee 100 (' + ra.etat + ' ' + (ra.cle && ra.cle.hooks) + ' ' + ra.quote + ')');
ok(ra.choixPool && ra.choixPool.verdict === 'PAYEUSE_MEILLEURE', 'A. la gagnante paie a6cf : aucun arbitrage de marge (' + (ra.choixPool && ra.choixPool.verdict) + ')');
ok(typeof ra.zeroForOne === 'boolean' && ra.zeroForOne === false, 'A. direction derivee : UNIT -> ETH, UNIT est currency1 -> zeroForOne false');
const ra2 = await E.meilleureClePourBloc({ ...base, rpc: quoter([[K7030, 100n], [KV8, 100n]]), cles: [KV8, K7030], cleConnue: K7030 });
ok(ra2.etat === 'OK' && String(ra2.cle.hooks).toLowerCase() === H7030.toLowerCase(), 'A. a devis EGAL la cle connue garde sa place (premier candidat payeur) : ' + (ra2.cle && ra2.cle.hooks));

/* B */
const sonde = quoter([[K7030, 100n], [KMM, 999n]]);
const rb = await E.meilleureClePourBloc({ ...base, rpc: sonde, cles: [K7030, KMM], cleConnue: K7030 });
ok(rb.etat === 'OK' && String(rb.cle.hooks).toLowerCase() === H7030.toLowerCase(), 'B. la pool mmETH (devis 999 sur SA paire) ne devient pas la jambe UNIT -> ETH');
ok(rb.pools.ecartees.length === 1 && /another pair/.test(rb.pools.ecartees[0].pourquoi) && rb.pools.ecartees[0].currency0 === MM, 'B. la cle mmETH est ecartee ET nommee : ' + JSON.stringify(rb.pools.ecartees.map((e) => e.pourquoi)));
ok(!sonde.appels.some((d) => d.includes(TIERS.slice(2))), 'B. la cle mmETH n est jamais envoyee au quoter');
ok(/set aside/.test(rb.pourquoiPools || ''), 'B. la phrase le dit : ' + rb.pourquoiPools);

/* C */
const rc = await E.meilleureClePourBloc({ ...base, rpc: quoter([[K7030, 100n], [KTIERS, 500n], [KPIEGE, 900n]]), cles: [K7030, KTIERS, KPIEGE], cleConnue: K7030 });
ok(rc.etat === 'OK' && String(rc.cle.hooks).toLowerCase() === H7030.toLowerCase(), 'C. ni la pool a hook tiers (500) ni le piege a 88 % (900) ne gagnent : ' + (rc.cle && rc.cle.hooks));
ok(rc.pools.ecartees.some((e) => /third-party hook/.test(e.pourquoi)) && rc.pools.ecartees.some((e) => /trap/.test(e.pourquoi)), 'C. les deux sont ecartees ET nommees : ' + JSON.stringify(rc.pools.ecartees.map((e) => e.pourquoi)));
/* controle : le hook tiers SEUL (block sans pool sur nos hooks dans le contexte) n est pas ecarte par la regle « pool de NOTRE hook » */
const { candidats: cTiersSeul } = E.clesDeLaPaire({ cles: [KTIERS], de: UNIT, vers: ETH });
console.log('    info : hook tiers seul, sans pool TB en contexte -> ' + (cTiersSeul.length ? 'candidat' : 'ecarte (block INCONNU traite en TB, fail-closed)'));

/* D */
const rd = await E.meilleureClePourBloc({ ...base, rpc: quoter([[K7030, null], [KV8, 77n]]), cles: [K7030, KV8], cleConnue: K7030 });
ok(rd.etat === 'OK' && rd.quote === 77n && rd.pools.nonCotees.length === 1 && String(rd.pools.nonCotees[0].hooks).toLowerCase() === H7030.toLowerCase(), 'D. la 7030 qui revert est sautee ET dite, la V8 cote : ' + JSON.stringify(rd.pools.nonCotees));
const rd2 = await E.meilleureClePourBloc({ ...base, rpc: quoter([]), cles: [K7030, KV8], cleConnue: K7030 });
ok(rd2.etat !== 'OK' && rd2.cle === null, 'D. rien ne cote : pas de cle inventee (' + rd2.etat + ')');

/* E — marge de la pool qui paie */
const sur = (q) => (q * (10000n + MARGE_BPS)) / 10000n;
const re1 = await E.meilleureClePourBloc({ ...base, rpc: quoter([[K7030, 1000000n], [KOPEN, sur(1000000n)]]), cles: [K7030, KOPEN], cleConnue: K7030 });
ok(re1.etat === 'OK' && String(re1.cle.hooks).toLowerCase() === H7030.toLowerCase() && re1.choixPool.verdict === 'PAYEUSE_DANS_LA_MARGE' && re1.choixPool.surcoutBps === MARGE_BPS,
  'E. OpenLaunch mieux cotee de ' + MARGE_BPS + ' bps (= la marge) -> la pool qui paie (' + (re1.choixPool && re1.choixPool.verdict) + ', ' + (re1.choixPool && re1.choixPool.surcoutBps) + ' bps)');
const re2 = await E.meilleureClePourBloc({ ...base, rpc: quoter([[K7030, 1000000n], [KOPEN, sur(1000000n) + 200n]]), cles: [K7030, KOPEN], cleConnue: K7030 });
ok(re2.etat === 'OK' && Number(re2.cle.fee) === 30000 && re2.choixPool.verdict === 'MEILLEURE_HORS_MARGE',
  'E. au-dela de la marge -> la meilleure pool, la personne ne paie pas le detour (' + (re2.choixPool && re2.choixPool.verdict) + ', ' + (re2.choixPool && re2.choixPool.surcoutBps) + ' bps)');

const re3 = await E.meilleureClePourBloc({ ...base, rpc: quoter([[K7030, 1000000n], [KOPEN, 1001040n]]), cles: [K7030, KOPEN], cleConnue: K7030 });
ok(re3.etat === 'OK' && Number(re3.cle.fee) === 30000 && re3.choixPool.surcoutBps === 11n, 'E. 10,39 bps se lit 11 (arrondi au-dessus) : jamais accepte sous la marge (' + (re3.choixPool && re3.choixPool.surcoutBps) + ')');

/* F — cablage */
const rails = fs.readFileSync(path.join(ICI, 'rails-api.js'), 'utf8');
const app = fs.readFileSync(path.join(ICI, 'app.html'), 'utf8');
ok(/meilleureClePourBloc\(\{ rpc, chaine, de: d1, vers: v1, montant: mt, cles: clesLues\.get\(block\) \|\| \[\], cleConnue: k, autres: CLES_PRIX \}\)/.test(rails), 'F. rails-api resolveurAvec : toutes les cles lues du block');
ok((rails.match(/await marcheAuMontant\(/g) || []).length === 2, 'F. rails-api : achat ET vente directs passent par marcheAuMontant');
ok(/meilleureClePourBloc\(\{ rpc, chaine: CHAINE, de, vers, montant: mt, cles: clesA, cleConnue: k, autres: CLES_PRIX_UI \}\)/.test(app), 'F. app.html resoudreA (block -> action)');
ok(/meilleureClePourBloc\(\{ rpc, chaine: CHAINE, de, vers, montant, cles: clesDuProfil, cleConnue: k, autres: CLES_PRIX_UI \}\)/.test(app), 'F. app.html resoudre (achat multi-sauts)');
ok(/marcheLu: marcheEch, fraisDevisesOk/.test(app), 'F. app.html achat / vente directs');
console.log((ko ? 'FAIL' : 'ok') + ' pools-du-bloc - ' + n + ' assertions, ' + ko + ' KO');
process.exitCode = ko ? 1 : 0;
