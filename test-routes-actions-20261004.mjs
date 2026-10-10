/* test-routes-actions-20261004.mjs — LES ROUTES NEUVES DES ACTIONS TOKENISEES : contre ETH, contre un block, contre une autre action.
 *
 * Phil, 2026-10-04 : « Payer un block avec n importe quelle TStock : pas route — fais-le » ; « les trades avec action tokenisee
 *   comme sur Coinbase wallet, avec nos fees — c est notre market tout entier ».
 * CE QUI EST PROUVE AILLEURS, en EXECUTION : banc-marche-actions-fork-20261004.mjs (fork de Base) — chaque route est envoyee
 *   telle que le planificateur la rend, et le wallet des frais est mesure sur ses soldes.
 * CE QUE CE FICHIER TIENT, hors reseau :
 * A. calldata-aerodrome.js : la sortie en ETH NATIF remplace le balayage par `unwrapWETH9WithFee(min, destinataire, bps, wallet des
 *    frais)` — et seulement si le chemin finit sur le WETH ; sans le drapeau, rien ne change (temoin).
 * B. rails-api.js : l AIGUILLAGE. Une action v4 qui paie un block / une action lit d abord SON marche (route 5) ; une action de la
 *    table Aerodrome contre ETH passe par le batisseur Aerodrome ; les refus disent quoi faire, sans une lecture de chaine.
 * C. app.html : le ticket propose « for ETH » a la vente d une action, et les actions v4 pour payer un block.
 * D. MUTANTS (sur des copies) : chaque branche retiree fait rougir son assertion.
 * ⛔ BORNE : un faux noeud qui ne rend que des zeros ne prouve AUCUN plan — seulement quel batisseur est appele, et dans quel ordre. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
const ICI = path.dirname(fileURLToPath(import.meta.url));
const imp = (f, dir = ICI) => import(pathToFileURL(path.join(dir, f)).href + '?v=' + Math.random());
let n = 0, ko = 0;
const ok = (c, m) => { n += 1; if (c) console.log('ok  ' + m); else { ko += 1; console.log('KO  ' + m); } };
const lire = (f) => fs.readFileSync(path.join(ICI, f), 'utf8').replace(/\r\n/g, '\n');

const { ACTIONS_COINBASE } = await imp('paires.js');
const { POOLS_ACTIONS_AERODROME } = await imp('pools-actions-aerodrome.js');
const { USDC_BASE, FEE_WALLET } = await imp('frais-creation.js');
const { WETH_BASE } = await imp('plan-eth-block.js');
const USDC = USDC_BASE.toLowerCase(), WETH = WETH_BASE.toLowerCase(), FRAIS = FEE_WALLET.toLowerCase();
const aero = [...POOLS_ACTIONS_AERODROME.keys()].map((k) => String(k).toLowerCase());
const adrDe = (sym) => String(ACTIONS_COINBASE.find((a) => a.symbole === sym).adr).toLowerCase();
const symAero = ACTIONS_COINBASE.find((a) => aero.includes(String(a.adr).toLowerCase())).symbole;
const v4 = ACTIONS_COINBASE.filter((a) => !aero.includes(String(a.adr).toLowerCase()));
const symV4 = v4[0].symbole, symV4b = v4[1].symbole;
const COMPTE = '0x00000000000000000000000000000000c0ffee77', BLOCK = '0xb200000000000000000000000000000000000001';

console.log('— A. calldata : la sortie en ETH natif');
async function calldata(dir, extra) {
  const C = await imp('calldata-aerodrome.js', dir);
  return { C, r: C.calldataExactInputAvecFrais({ sauts: [{ de: adrDe(symAero), vers: USDC, tickSpacing: 10 }, { de: USDC, vers: WETH, tickSpacing: 100 }],
    recipient: COMPTE, amountIn: 1000000n, amountOutMinimum: 2000000000000n, deadline: 1900001200n, maintenant: 1900000000n, beneficiaireFrais: FRAIS, ...extra }) };
}
const mot = (x) => BigInt(x).toString(16).padStart(64, '0');
{
  const { C, r } = await calldata(ICI, { sortieEthNatif: true });
  const d = String(r.data || '').toLowerCase(), sel = C.SELECTEURS.unwrapWETH9WithFee.slice(2), i = d.indexOf(sel);
  ok(r.etat === 'PRET' && i > 0 && !d.includes(C.SELECTEURS.sweepTokenWithFee.slice(2)), 'A sortie ETH : le balayage est unwrapWETH9WithFee, et sweepTokenWithFee n y est plus');
  const bps = BigInt(r.fraisBps), minU = 2000000000000n * (10000n - bps) / 10000n;
  ok(bps > 0n && d.slice(i + 8, i + 8 + 256) === mot(minU) + COMPTE.slice(2).padStart(64, '0') + mot(bps) + FRAIS.slice(2).padStart(64, '0'),
    'A … ses 4 arguments, dans l ordre : minimum APRES retenue (' + minU + '), le destinataire, ' + bps + ' bps, le wallet des frais du depot');
  ok(String(r.minUtilisateur) === minU.toString() && String(r.minPools) === '2000000000000', 'A … deux minimums distincts : celui des pools, et celui de l utilisateur (apres retenue)');
  const t = await calldata(ICI, {});
  const dt = String(t.r.data || '').toLowerCase();
  ok(t.r.etat === 'PRET' && dt.includes(C.SELECTEURS.sweepTokenWithFee.slice(2)) && !dt.includes(sel), 'A temoin : sans le drapeau, le balayage reste sweepTokenWithFee (rien ne change pour les chemins existants)');
  const x = C.calldataExactInputAvecFrais({ sauts: [{ de: adrDe(symAero), vers: USDC, tickSpacing: 10 }], recipient: COMPTE, amountIn: 1000000n, amountOutMinimum: 5n,
    deadline: 1900001200n, maintenant: 1900000000n, beneficiaireFrais: FRAIS, sortieEthNatif: true });
  ok(x.etat === 'REFUSE' && /ends on WETH/.test(String(x.pourquoi)), 'A une sortie ETH sur un chemin qui ne finit PAS sur le WETH est refusee (unwrap ne balaie que le WETH)');
}

console.log('— B. rails-api.js : l aiguillage');
/* faux noeud : toute lecture rend des zeros. `clesDe` est un ESPION : il note QUEL marche le planificateur lit, et dans quel ordre. */
async function router(dir, de, vers) {
  const R = await imp('rails-api.js', dir);
  let appels = 0; const lus = [];
  const rpc = async (m) => { appels += 1; if (m === 'eth_blockNumber') return '0x1'; return '0x' + '0'.repeat(64 * 8); };
  const r = await R.planRail({ de, vers, montant: '1000000', compte: COMPTE }, { rpc, clesDe: async (a) => { lus.push(String(a).toLowerCase()); return []; } });
  return { r, appels, lus };
}
{
  const e = await router(ICI, adrDe(symAero), 'ETH');
  ok(e.r.route === 'ACTION>ETH' && e.r.via === 'planAerodromeSegment' && e.r.pool === 'aerodrome' && e.appels > 0 && e.r.etat !== 'PRET',
    'B ' + symAero + ' (table Aerodrome) > ETH : batisseur Aerodrome, qui lit ses pools ; faux noeud = aucun plan (etat ' + e.r.etat + ')');
  const b = await router(ICI, adrDe(symV4), BLOCK);
  ok(b.r.route === 'ACTION>BLOCK' && b.lus[0] === adrDe(symV4) && !/this block trades against/.test(String(b.r.pourquoi)),
    'B ' + symV4 + ' (pool v4) > BLOCK : le planificateur lit d abord le marche de L ACTION (route 5), pas celui du block (route 1)');
  const a = await router(ICI, adrDe(symV4), adrDe(symV4b));
  ok(a.r.route === 'ACTION>ACTION' && a.lus[0] === adrDe(symV4) && !/no measured deep Aerodrome pool/.test(String(a.r.pourquoi)),
    'B ' + symV4 + ' > ' + symV4b + ' (deux pools v4) : route 5, plus le refus « no measured deep Aerodrome pool »');
  const h = await router(ICI, adrDe(symV4), 'ETH');
  ok(h.r.route === 'ACTION>ETH' && h.lus[0] === adrDe(symV4) && h.r.via !== 'planAerodromeSegment', 'B ' + symV4 + ' (pool v4) > ETH : route 5 (v4), jamais le batisseur Aerodrome');
  const x = await router(ICI, adrDe(symV4), adrDe(symAero));
  ok(x.r.etat === 'REFUSE' && /trades on Aerodrome and .* on Uniswap v4: sell for USDC, then buy with USDC \(two trades\)/.test(String(x.r.pourquoi)) && x.appels === 0 && x.lus.length === 0,
    'B ' + symV4 + ' (v4) > ' + symAero + ' (Aerodrome) : refus qui dit quoi faire, AVANT toute lecture');
  const y = await router(ICI, adrDe(symAero), BLOCK);
  /* 2026-10-10 (P4) : une action Aerodrome PAIE desormais un block v4 en un lot atomique (rails-api.js 4 ter, prouve sur fork par
   *   banc-action-aero-vers-bloc-fork-20261010.mjs). Sur ce faux noeud, le marche du block ne se lit pas : AUCUN plan, et il a LU. */
  ok(y.r.etat !== 'PRET' && y.appels > 0, 'B ' + symAero + ' (Aerodrome) > BLOCK : lit le marche du block (P4), aucun plan sur un faux noeud (' + y.r.etat + ')');
  const t = await router(ICI, USDC, BLOCK);
  ok(t.r.route === 'USDC>BLOCK' && t.lus[0] === BLOCK, 'B temoin : USDC > BLOCK garde la route 1 (le marche du block est lu en premier)');
  /* route 6 (QA wallet reel de Grok, P0) : ETH <-> USDC est ROUTE ; les autres devises restent refusees (aller sans retour, mesure
   *   sur fork : banc-devises-fork-20261004.mjs — depuis cbBTC / TOSHI / OUSD le planificateur refuse 12/12) */
  const { DEVISES_BASE } = await imp('paires.js');
  const TOSHI = String(DEVISES_BASE.find((d) => d.symbole === 'TOSHI').adr).toLowerCase();
  for (const [de, vers, nom] of [['ETH', USDC, 'ETH > USDC'], [USDC, 'ETH', 'USDC > ETH']]) {
    const x = await router(ICI, de, vers);
    ok(!/is not offered by this API yet/.test(String(x.r.pourquoi)) && x.appels > 0 && /sautsDepuisChemin|planEchangeMultiSauts/.test(String(x.r.via)),
      'B ' + nom + ' : ROUTE (le planificateur cherche la pool v4 de la paire ; faux noeud = aucun plan, etat ' + x.r.etat + ')');
  }
  for (const [de, vers, nom] of [[USDC, TOSHI, 'USDC > TOSHI'], [TOSHI, USDC, 'TOSHI > USDC'], [TOSHI, 'ETH', 'TOSHI > ETH']]) {
    const x = await router(ICI, de, vers);
    ok(x.r.etat === 'REFUSE' && /is not offered by this API yet/.test(String(x.r.pourquoi)) && x.appels === 0, 'B ' + nom + ' : refuse sans lecture — une devise qu on ne peut pas revendre ici ne s y achete pas');
  }
}

console.log('— C. app.html : le ticket');
const html = lire('app.html');
/* Phil, 2026-10-04 : « swap action to USDC et inversement, pas que ETH — USDC natif sera plus simple » : USDC d abord pour une action */
/* 2026-10-04 soir (retest Rabby : « 0 WETH recu, -100 % » sur NVDAc -> ETH, alors que la simulation sur la vraie chaine ne revertait pas) :
 *   une action AERODROME ne se vend plus « for ETH » depuis le ticket ; une action v4 si (le routeur Uniswap rend l ETH natif). */
ok(html.includes("else if (ACTIONS_PAR_ADR.has(a)) choix = (q && q.ok ? [[q.adr, 'for ' + q.sym]] : []).concat(POOLS_ACTIONS_AERODROME.has(a) ? [] : [['ETH', 'for ETH']]);"),
  'C vendre une action : sa cotation (USDC) en premier ; « for ETH » seulement pour une action a pool v4');
/* 2026-10-04 (soir) : les choix de PAIEMENT vivent dans `bcChoixPaiement`, une seule liste pour le ticket Buy ET pour le mode S.I */
ok(/function bcChoixPaiement\(a, q\) \{/.test(html) && /if \(ACTIONS_PAR_ADR\.has\(a\)\) return \[\['USDC', 'USDC'\], \['ETH', 'ETH'\]\];/.test(html)
  && /if \(!standard\) return \[\[q\.adr, q\.sym\]\];\s+const choix = \[\['ETH', 'ETH'\], \['USDC', 'USDC'\]\];/.test(html),
  'C acheter une action : USDC en premier, ETH en second ; un block garde ETH en premier ; une autre cotation : elle seule');
/* 2026-10-10 (P4, route 4 ter) : les actions de la table Aerodrome aussi — en LOT atomique ; execute dans test-paiement-actions-aerodrome-20261010.mjs */
ok(/const v4 = bcActionsV4\(\);\s+for \(const st of ACTIONS_COINBASE\) \{ const sa = String\(st\.adr\)\.toLowerCase\(\); if \(v4\.has\(sa\) \|\| POOLS_ACTIONS_AERODROME\.has\(sa\)\) choix\.push\(\[sa, st\.symbole \+ ' \(stock\)'\]\); \}\s+return choix;/.test(html),
  'C acheter un block (cote en ETH ou USDC) : les actions a pool v4 mesuree ET celles de la table Aerodrome sont proposees comme moyen de paiement');
ok(/if \(achat\) choix = bcChoixPaiement\(a, q\);/.test(html) && /const choix = bcChoixPaiement\(a, q\);\s+for \(const \[v, l\] of choix\) s\.append\(bcEl\('option', \{ value: v, text: l \}\)\);/.test(html)
  && (html.match(/bcChoixPaiement\(a, q\)/g) || []).length === 3, 'C le ticket Buy et le menu « Pay with » du mode S.I lisent la MEME liste (bcChoixPaiement) — pas deux copies');
/* le mode S.I (ex-AiFi) : son nom, et sa devise de paiement */
ok(/data-mode="full" aria-selected="false">S\.I</.test(html) && /b\.textContent = s \? 'Stop S\.I' : 'Start S\.I';/.test(html) && !/>AiFi<|'Start AiFi'|'Stop AiFi'|AiFi stopped\.'\)|'Its brain · AiFi'/.test(html),
  'C le mode s appelle « S.I » partout a l ecran (bouton, switch, cartes, avis) — plus aucun libelle « AiFi » affiche');
ok(/<select id="bcAiDevise"/.test(html) && /try \{ dec = await bcAvecDelai\(bcDecimales\(r\.adr\), 6000\); \} catch \(_\) \{ dec = null; \}/.test(html)
  && /if \(!Number\.isInteger\(dec\)\) return dire\('The decimals of ' \+ r\.sym \+ ' could not be read — try again\.'\);/.test(html)
  && /enUnitesBrutes\(v\.replace\(',', '\.'\), devise\.dec\)/.test(html),
  'C S.I : la devise de paiement se choisit ; ses decimales sont LUES (jamais 18 par defaut pour un jeton) et un echec de lecture refuse de demarrer');
ok(/bcUnites\(s\.propose, dv\.dec\) \+ ' of ' \+ bcUnites\(s\.budget, dv\.dec\) \+ ' ' \+ dv\.sym/.test(html) && /for \(const id of \['#bcAiAchat', '#bcAiVente', '#bcAiDevise',/.test(html),
  'C S.I : le budget s affiche dans la devise choisie ; le menu est fige tant que S.I tourne');
ok(/if \(ACTIONS_PAR_ADR\.has\(k\) && !POOLS_ACTIONS_AERODROME\.has\(k\)\) s\.add\(k\);/.test(html) && /for \(const l of LOGS_INITIALIZE_MESURES\) \{\s+const d = decoderInitialize\(l\);\s+if \(!d \|\| !d\.cle\) continue;\s+for \(const c of \[d\.cle\.currency0, d\.cle\.currency1\]\)/.test(html),
  'C … cette liste vient des pools v4 LUES (logs redecodes), et exclut la table Aerodrome (qui ne paie pas un block en un trade)');

/* AiFi (Phil, 2026-10-04 : deux cartes identiques puis sept fois le meme avis — « ca casse tout, corrige ») */
ok(/const bcAifiOuverte = \(x\) => !!x && \(x\.op \? BC_EN_COURS\.includes\(x\.op\.etat\) : Date\.now\(\) - x\.depuis < 20000\);/.test(html)
  && /if \(bcAifiOuverte\(bcAifiSuivi\.achat\)\) return;/.test(html) && /if \(bcAifiOuverte\(bcAifiSuivi\.vente\)\) return;/.test(html)
  && /if \(suivi\) suivi\.op = op;/.test(html), 'C AiFi : UNE proposition ouverte par sens — tant que sa carte attend, il n en ouvre pas une autre');
ok(html.indexOf('if (bcAifiOuverte(bcAifiSuivi.achat)) return;') < html.indexOf("s.propose = (BigInt(s.propose) + m).toString(); bcAifiSauver(); bcAifiPeindre();")
  && html.indexOf('if (bcAifiOuverte(bcAifiSuivi.achat)) return;') > html.indexOf("if (s.achat && phase === 'EXCITE') {"), 'C … et le doublon ecarte ne compte RIEN au budget (le controle precede le decompte)');
ok(/function bcAifiDire\(texte\) \{ if \(bcAifiSuivi\.avis === texte\) return; bcAifiSuivi\.avis = texte; bcAifiNote\(texte\); \}/.test(html)
  && !/bcMessage\('AiFi', '', 'It got worried/.test(html), 'C AiFi : un avis identique au precedent n est pas reecrit (plus aucun « It got worried » ecrit sans passer par ce filtre)');
/* le fil condense (Phil : « fais pas de doublon, mets le chat en condense ») : UN bloc AiFi, des lignes dedans */
ok(/if \(der && der\.dataset && der\.dataset\.aifi === '1'\) \{\s+if \(der\.dataset\.derniere !== texte\) \{ bcEtape\(der, texte\);/.test(html)
  && (html.match(/bcMessage\('S\.I'/g) || []).length === 1 && !/bcMessage\('AiFi'/.test(html) && /if \(pourquoi\) bcAifiNote\(pourquoi\);/.test(html) && /bcAifiNote\('Started on '/.test(html),
  'C S.I : started / stopped / avis s ajoutent en LIGNES dans un seul bloc « S.I » (un seul `bcMessage(\'S.I\'` dans tout le source : celui qui ouvre ce bloc)');
ok(/\.bcLimites \.bcCoche\{[^}]*user-select:none/.test(html), 'C les libelles des cases AiFi ne se selectionnent plus au double-clic (capture de Phil : texte grise illisible)');

/* pre-commandes : pas de doublon sur une action (Phil : « buy stock et block c est la meme, donc choisis ») */
ok(/if \(c === 'buy_stock' \|\| c === 'sell_stock'\) b\.hidden = estAction;/.test(html) && /if \(c === 'buy_block'\) b\.textContent = sym \? 'Buy ' \+ sym : 'Buy this block';/.test(html)
  && /b\.setAttribute\('data-pre', p\.cle\);/.test(html) && /bcPeindreTicket\(a, sym, mk, snap\);\s+bcPeindrePre\(a, sym\);/.test(html),
  'C pre-commandes : sur une action, « Buy a stock » / « Sell a stock » sont masquees (doublon) ; « Buy <SYM> » / « Sell <SYM> » portent le nom');

ok(/for \(const p of PRECOMMANDES\) \{[\s\S]{0,520}if \(p\.cle === 'tasks'\) continue;\s+const b = bcEl\('button', \{ type: 'button', cls: 'puce', text: p\.libelle \}\);/.test(html),
  'C la puce « What can it do? » n est plus affichee (Phil : « retire ca ») — la commande ecrite `tasks` reste dans la grammaire');

console.log('— D. mutants');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tb-routes-'));
const copie = () => { const dir = fs.mkdtempSync(path.join(tmp, 'm-')); for (const f of fs.readdirSync(ICI)) if (/\.js$/.test(f) && !/^(serveur-web|vendor|mcp-ext-apps)/.test(f)) fs.copyFileSync(path.join(ICI, f), path.join(dir, f)); return dir; };
const muter = (fichier, de, vers) => { const src = lire(fichier); const dir = copie(); const une = src.split(de).length === 2; fs.writeFileSync(path.join(dir, fichier), src.replace(de, () => vers)); return { dir, une }; };
{
  const m = muter('rails-api.js', "if (nv === 'BLOCK' && nd !== 'BLOCK' && nd !== 'ACTION') {", "if (nv === 'BLOCK' && nd !== 'BLOCK') {");
  let rouge = false;
  try { const b = await router(m.dir, adrDe(symV4), BLOCK); rouge = b.lus[0] !== adrDe(symV4); } catch (_) { rouge = true; }
  ok(m.une && rouge, 'D mutant « la route 1 reprend ACTION>BLOCK » : ROUGE (c est le marche du block qui est lu, l action ne paie plus)');
}
{
  const m = muter('rails-api.js', "if (nv === 'ACTION' && nd !== 'ACTION') {", "if (nv === 'ACTION') {");
  let rouge = false;
  try { const a = await router(m.dir, adrDe(symV4), adrDe(symV4b)); rouge = /no measured deep Aerodrome pool/.test(String(a.r.pourquoi)) || a.lus[0] !== adrDe(symV4); } catch (_) { rouge = true; }
  ok(m.une && rouge, 'D mutant « la route 3 reprend ACTION>ACTION » : ROUGE');
}
{
  const m = muter('rails-api.js', "if (nd === 'ACTION' && nv === 'ETH' && POOLS_ACTIONS_AERODROME.has(de)) {", 'if (false) {');
  let rouge = false;
  try { const e = await router(m.dir, adrDe(symAero), 'ETH'); rouge = e.r.via !== 'planAerodromeSegment'; } catch (_) { rouge = true; }
  ok(m.une && rouge, 'D mutant « vente Aerodrome contre ETH retiree » : ROUGE');
}
{
  const m = muter('rails-api.js', "&& (d.symbole === 'ETH' || d.symbole === 'USDC')).map(", ').map(');
  let rouge = false;
  try {
    const { DEVISES_BASE } = await imp('paires.js');
    const TOSHI = String(DEVISES_BASE.find((d) => d.symbole === 'TOSHI').adr).toLowerCase();
    const x = await router(m.dir, USDC, TOSHI); rouge = !/is not offered by this API yet/.test(String(x.r.pourquoi));
  } catch (_) { rouge = true; }
  ok(m.une && rouge, 'D mutant « toutes les devises du registre ouvertes » : ROUGE (USDC > TOSHI serait route, sans retour possible)');
}
{
  const m = muter('calldata-aerodrome.js', 'const balayage = sortieEthNatif', 'const balayage = false');
  let rouge = false;
  try { const { C, r } = await calldata(m.dir, { sortieEthNatif: true }); rouge = !String(r.data || '').toLowerCase().includes(C.SELECTEURS.unwrapWETH9WithFee.slice(2)); } catch (_) { rouge = true; }
  ok(m.une && rouge, 'D mutant « sortie ETH qui balaie quand meme du WETH » : ROUGE');
}
{
  const m = muter('plan-aerodrome-segment.js', 'fraisBps, beneficiaireFrais, sortieEthNatif,', 'fraisBps, beneficiaireFrais,');
  /* le drapeau perdu en route : le plan rendrait du WETH en annoncant de l ETH — on le voit sur un noeud qui rend des pools lisibles */
  const P = await imp('plan-aerodrome-segment.js', m.dir), Pv = await imp('plan-aerodrome-segment.js');
  const C = await imp('calldata-aerodrome.js');
  const pool = '0x' + '1'.repeat(40);
  /* ⛔ 2026-10-10 (234ff51, revue adverse point 2) : une action de la table se trade sur SA pool mesuree, que la factory doit rendre.
   *   Ce faux noeud rendait 0x11..1 a tout getPool -> le temoin devenait REFUSE (« the factory no longer returns the measured pool »).
   *   Il rend maintenant la pool MESUREE quand l appel nomme l action, la pool fictive pour le saut USDC/WETH (non epingle). */
  const mesuree = POOLS_ACTIONS_AERODROME.get(adrDe(symAero)).pool;
  const PIVOT = '0x3fe04a59ebd38cf06080a6f60a98d124eb59392a';
  const rpc = async (methode, params) => {
    if (methode === 'eth_simulateV1') return [{ calls: params[0].blockStateCalls[0].calls.map(() => ({ status: '0x1' })) }]; /* 2026-10-10 (e0b346d) : le segment simule son plan ; ce faux noeud dit que la simulation passe */
    const data = String(params[0].data || '');
    if (data.startsWith(C.SELECTEURS.getPool)) return '0x' + (data.toLowerCase().includes(adrDe(symAero).slice(2)) ? mesuree : PIVOT).slice(2).padStart(64, '0'); /* 4 bis : USDC/WETH est epingle sur sa pool mesuree (ts 50) */
    if (data.startsWith('0x70a08231')) return '0x' + (10n ** 12n).toString(16).padStart(64, '0');
    if (data.startsWith('0x0dfe1681')) return '0x' + String(params[0].to === pool ? USDC : USDC).slice(2).padStart(64, '0'); /* token0() */
    return '0x' + (1n << 96n).toString(16).padStart(64, '0') + '0'.repeat(64 * 6); /* slot0 : prix 1:1 */
  };
  const args = { rpc, chemin: [{ de: adrDe(symAero), vers: USDC, famille: 'aerodrome' }, { de: USDC, vers: WETH, famille: 'aerodrome' }], devise: adrDe(symAero), block: WETH,
    montant: 10n ** 9n, compte: COMPTE, beneficiaireFrais: FRAIS, maintenant: 1900000000000, sortieEthNatif: true };
  const vrai = await Pv.planAerodromeSegment(args), mut = await P.planAerodromeSegment(args);
  const sel = C.SELECTEURS.unwrapWETH9WithFee.slice(2);
  ok(vrai.etat === 'PRET' && String(vrai.appels[1].data).toLowerCase().includes(sel) && /^0x0{40}$/.test(String(vrai.resume.recoitDevise)),
    'D temoin : le plan complet (2 sauts) rend PRET, se termine par unwrapWETH9WithFee, et annonce de l ETH natif (etat ' + vrai.etat + (vrai.pourquoi ? ' — ' + vrai.pourquoi : '') + ')');
  ok(m.une && mut.etat === 'PRET' && !String(mut.appels[1].data).toLowerCase().includes(sel), 'D mutant « drapeau perdu entre le plan et le calldata » : ROUGE (le plan annoncerait de l ETH et rendrait du WETH)');
}
console.log('— E. le marche d une action se lit en UNE lecture de pool (mesure prod : 27 a 175 s par plan)');
/* faux noeud qui REPOND : slot0 non nul, decimales 8, offre 1e16. `vieDuBlock` doit rendre le marche de la cle exacte sans
 * passer par les 17 pools ETH. On COMPTE les getSlot0. */
async function lecturesMarche(dir, extra) {
  const M = await imp('marche.js', dir), { LOGS_INITIALIZE_ACTIONS } = await imp('cles-v4-actions.js'), { decoderInitialize } = await imp('pools-du-jeton.js');
  const { V4_ADRESSES } = await imp('lancer-pool.js'), { selecteur } = await imp('keccak.js');
  const cle = LOGS_INITIALIZE_ACTIONS.map(decoderInitialize).map((d) => d && d.cle).find((c) => c && [String(c.currency0).toLowerCase(), String(c.currency1).toLowerCase()].includes(adrDe(symV4)));
  const s0 = '0x' + selecteur('getSlot0(bytes32)').replace(/^0x/, '');
  let slot0 = 0;
  const rpc = async (m, p) => {
    const d = String(p[0].data);
    if (d.startsWith(s0)) { slot0 += 1; return '0x' + (1n << 96n).toString(16).padStart(64, '0') + '0'.repeat(64 * 3); }
    if (d.startsWith('0x313ce567')) return '0x' + (8).toString(16).padStart(64, '0');
    if (d.startsWith('0x18160ddd')) return '0x' + (10n ** 16n).toString(16).padStart(64, '0');
    return '0x' + '0'.repeat(64);
  };
  const v = await M.vieDuBlock({ rpc, stateView: V4_ADRESSES[8453].stateView, jeton: adrDe(symV4), clesExactes: [cle], ...extra });
  return { v, slot0, cle };
}
{
  const a = await lecturesMarche(ICI, { deviseDAbord: true });
  ok(a.v.etat === 'LUE' && a.slot0 === 1 && String(a.v.deviseAdr).toLowerCase() === USDC, 'E ' + symV4 + ' avec deviseDAbord : marche LU en USDC, en 1 lecture de pool (' + a.slot0 + ')');
  const t = await lecturesMarche(ICI, {});
  /* le faux noeud repond « pool initialisee » a TOUT : sans le drapeau, la 1re cle ETH essayee l emporte — c est le chemin d avant */
  ok(t.v.etat === 'LUE' && String(t.v.deviseAdr || '').toLowerCase() !== USDC, 'E temoin : sans le drapeau, l ordre d avant est INCHANGE (les pools ETH sont essayees d abord)');
  const src = lire('rails-api.js');
  ok(/const marcheDe = async \(a\) => vieDuBlock\(\{ rpc, stateView, jeton: a, clesExactes: await clesDe\(a\), deviseDAbord: natureJeton\(a\) === 'ACTION' \}\);/.test(src),
    'E rails-api.js ne pose le drapeau que pour une ACTION du registre (un block garde l ordre ETH d abord)');
  ok(/const sautAction = !!k && \(natureJeton\(d1\) === 'ACTION' \|\| natureJeton\(v1\) === 'ACTION'\);/.test(src) && /candidates: sautAction \? sup : sup\.concat\(CLES_PRIX\)/.test(src),
    'E un saut d action dont la cle est lue ne devise que cette cle (plus les 5 gabarits ETH/USDC qui revertaient)');
  const m = muter('marche.js', 'if (deviseDAbord && clesSaines.length) {', 'if (false) {');
  let rouge = false;
  try { const x = await lecturesMarche(m.dir, { deviseDAbord: true }); rouge = String(x.v.deviseAdr || '').toLowerCase() !== USDC || x.slot0 !== 1; } catch (_) { rouge = true; }
  ok(m.une && rouge, 'E mutant « raccourci retire » : ROUGE');
}
fs.rmSync(tmp, { recursive: true, force: true });
console.log('\n' + (n - ko) + ' ok / ' + ko + ' KO (' + n + ' assertions)');
process.exit(ko ? 1 : 0);
