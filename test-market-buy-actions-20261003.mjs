/* test-market-buy-actions-20261003.mjs — LE MARKET ACHETE LES ACTIONS TOKENISEES QUE LA FICHE SAIT ACHETER.
 * ⛔ MESURE (prod, 2026-10-03) : 220 lignes, 34 « Buy » ; les 9 actions sur Aerodrome (GOOGLc, METAc, MSFTc, NVDAc…) n en
 *   avaient pas, alors que leur fiche de carte affiche « Buy » (ETH en une tx / USDC) avec notre frais de 0,1 % (sortie,
 *   sweepTokenWithFee). Ce banc : (A) le cablage, (B) le verdict applique aux VRAIES lignes servies par /api/trending. */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
const ICI = path.dirname(fileURLToPath(import.meta.url));
const R = await import(pathToFileURL(path.join(ICI, 'routage.js')).href);
const { verdictRoutage } = R;
const { FRAIS_INTERFACE_BPS_CL, FACTORY_AERODROME_CL } = await import(pathToFileURL(path.join(ICI, 'calldata-aerodrome.js')).href);
const { selecteur } = await import(pathToFileURL(path.join(ICI, 'keccak.js')).href);
const { avecPoolAction, POOLS_ACTIONS_AERODROME } = await import(pathToFileURL(path.join(ICI, 'pools-actions-aerodrome.js')).href);
const P = await import(pathToFileURL(path.join(ICI, 'paires.js')).href);
let n = 0, ko = 0;
const ok = (c, m) => { n += 1; if (c) console.log('ok  ' + m); else { ko += 1; console.log('KO  ' + m); } };
const html = fs.readFileSync(path.join(ICI, 'app.html'), 'utf8').replace(/\r\n/g, '\n');

/* A. cablage */
/* 2026-10-03 (soir) : + `achetableIci` — les 20 actions a pool v4 USDC (cles-v4-actions.js) rendent IN_APP ; la fiche sait les acheter. */
/* 2026-10-25 : + `routeAction` (la route servie des actions prouvees sur la chaine, actions-chaine.js) */
ok(/const vR = verdictRoutage\(\{ aMarche: true, dex: lA\.dex, poolAdr: lA\.poolAdr, routeAction: lA\.routeAction \}\);\n(\s+\/\*[^]*?\*\/\n)?\s+const actionRegistre = ACTIONS_PAR_ADR\.has\(String\(l\.adr \|\| ''\)\.toLowerCase\(\)\);\n\s+if \(liqOk && \(vR\.achetableEnEth \|\| vR\.achetableEnUsdc \|\| \(vR\.achetableIci && actionRegistre\)\)\) \{\n\s+return (avecPair\()?'<button type="button" class="bouton trAcheter" data-acheter-fiche="/.test(html),
  'ligne du Market : Buy si le MEME verdict que la fiche dit achetable (ETH, USDC, ou v4 lisible ici — actions du registre seulement), liquidite au seuil');
/* ⛔⛔ mesure prod 2026-10-03 (build cles-mesurees-fusionnees) : LLYc, AMDc, PYPLc rendaient encore « Pair a block with it » — la garde
 *   testait `typeof STOCKS_BASE_BY_ADR`, un nom d index.html, TOUJOURS indefini dans app.html. Idem pour le Buy a trois sauts (ligne
 *   ~5267, 123 blocks cotes en action le 30/09) : la garde etait toujours fausse. Le nom ne doit plus apparaitre dans app.html. */
ok(!/STOCKS_BASE_BY_ADR\.has\(|typeof STOCKS_BASE_BY_ADR !==/.test(html), 'app.html n EXECUTE plus un nom qui n y existe pas (STOCKS_BASE_BY_ADR est a index.html ; les commentaires peuvent le citer)');
ok(/^const ACTIONS_PAR_ADR = new Set\(ACTIONS_COINBASE\.map\(\(a\) => String\(a\.adr\)\.toLowerCase\(\)\)\);$/m.test(html)
  && /const estAction = Boolean\(quote && ACTIONS_PAR_ADR\.has\(quote\)\);/.test(html), 'le registre des actions est ACTIONS_COINBASE (importe), pour le Market ET le Buy a trois sauts');
{ /* la garde du Market, extraite et executee : une action du registre passe, un block non */
  const { ACTIONS_COINBASE } = P;
  const ACTIONS_PAR_ADR = new Set(ACTIONS_COINBASE.map((a) => String(a.adr).toLowerCase()));
  const garde = (l) => ACTIONS_PAR_ADR.has(String(l.adr || '').toLowerCase());
  ok(garde({ adr: ACTIONS_COINBASE.find((a) => a.symbole === 'LLYc').adr.toUpperCase() }) && !garde({ adr: '0xb20000000000000000000084d0953bad205d563f' }) && !garde({}),
    'la garde : LLYc (casse quelconque) passe, Block 0 non, ligne sans adresse non');
}
const iV = html.indexOf('const vR = verdictRoutage({ aMarche: true'), iF = html.indexOf('if (feeOk && liqOk) {');
ok(iF > 0 && iV > iF, 'le Buy v4 historique reste prioritaire (teste avant)');
ok(/const ficheBtn = e\.target\.closest\('\[data-acheter-fiche\]'\);/.test(html) && /etape\('achat_clic'\)[\s\S]{0,200}allerA\('map'\)/.test(html)
  && /\.bloc\[data-block="' \+ cibleF\.toLowerCase\(\)/.test(html) && /else void ouvrirProfil\(adr, sym\);/.test(html),
  'clic : compte l intention (achat_clic), ouvre la fiche de la carte, sinon le profil comme avant');
ok(FRAIS_INTERFACE_BPS_CL === 10n, 'frais de ce chemin : 10 bps (0,1 %) pris sur la sortie — ' + FRAIS_INTERFACE_BPS_CL + ' bps');

/* A2. ⛔⛔ 2026-10-23 — UNE LIGNE SANS BUY DIT LA RAISON MESUREE, PAS UNE RAISON FAUSSE.
 *   MESURE (prod 18:2xZ, DOM de l onglet Market, 220 lignes) : ORCLc AVGOc NFLXc DJTc MRNAc sans Buy, avec « its pool cannot be quoted
 *   (empty, or a third-party hook that taxes resale) ». FAUX pour les cinq : leur pool la plus liquide (dexId DexScreener « aero ») n est
 *   ni vide (103 518 $ d USDC sur ORCLc) ni a hook — c est une pool CL dont `factory()` rend 0x9cb220581b91b0c83223012fe69688b92ad07a76,
 *   PAS la factory 0xf8f2…61ef que declare notre routeur Aerodrome (14/14 pools « aero » lues, bloc 52 995 302, mainnet.base.org). */
const lignePool = (dex) => ({ aMarche: true, dex, poolAdr: '0x62b5452e80e50b047dcf6dd3fb6a1d266c678eb5' });
ok(typeof R.raisonSansBuy === 'function', 'routage.js exporte raisonSansBuy (la raison d une ligne sans Buy, tiree du MEME verdict)');
if (typeof R.raisonSansBuy === 'function') {
  const aero = R.raisonSansBuy(verdictRoutage(lignePool('aero')));
  const pancake = R.raisonSansBuy(verdictRoutage(lignePool('pancakeswap')));
  const v4 = R.raisonSansBuy(verdictRoutage({ aMarche: true, dex: 'uniswap', poolAdr: null }));
  ok(aero && aero.code === 'DEX_HORS_ROUTEUR' && /newer pool factory \("aero"\)/.test(aero.phrase) && !/empty|hook/i.test(aero.phrase),
    'dex « aero » (pool a adresse) : DEX_HORS_ROUTEUR, nomme la factory plus recente, ne dit ni « empty » ni « hook » — ' + JSON.stringify(aero));
  ok(pancake && pancake.code === 'DEX_HORS_ROUTEUR' && /pancakeswap/.test(pancake.phrase) && !/Aerodrome/.test(pancake.phrase),
    'un autre dex hors routeur : nomme CE dex, sans emprunter le mot Aerodrome — ' + JSON.stringify(pancake && pancake.phrase));
  ok(v4 && v4.code === 'NON_COTEE' && /cannot be quoted/.test(v4.phrase), 'un block v4 (achetableIci, hors registre) sans cle cotee garde la raison d avant (NON_COTEE), jamais une note vide');
  const sousSeuil = R.raisonSansBuy(verdictRoutage(lignePool('aerodrome')), { liqOk: false, liqMin: 500 });
  ok(sousSeuil && sousSeuil.code === 'LIQUIDITE_SOUS_SEUIL' && /\$500/.test(sousSeuil.phrase), 'sous le seuil de liquidite : la raison est le seuil, meme sur une pool achetable — ' + JSON.stringify(sousSeuil && sousSeuil.phrase));
  ok(R.raisonSansBuy(verdictRoutage(lignePool('aerodrome'))) === null, 'temoin negatif : une pool Aerodrome achetable n a PAS de raison sans Buy (null)');
  ok(R.raisonSansBuy(null) && R.raisonSansBuy(null).code === 'NON_COTEE', 'verdict absent : la raison generique, jamais un plantage');
}
ok(/const raisonSb = raisonSansBuy\(vR, \{ liqOk, liqMin: LIQ_MIN_BUY_USD \}\) \|\| raisonSansBuy\(null\);\n\s+const raison = '<p class="note trRaison">' \+ enTexte\(raisonSb\.phrase\) \+ '<\/p>';/.test(html)
  && /import \{ verdictRoutage, phraseRoutage, raisonSansBuy \} from '\.\/routage\.js';/.test(html)
  && !/No buy: its pool cannot be quoted \(empty, or a third-party hook that taxes resale\)\.<\/(?:span|p)>';/.test(html),
  'app.html : la note sans Buy du Market vient de raisonSansBuy(vR) — plus de phrase fixe ecrite pour toutes les lignes');

/* B. les vraies lignes */
try {
  const r = await fetch('https://tokenizedblock.space/api/trending', { headers: { 'x-ms-monitor': '1' } }).then((x) => x.json());
  const rows = Array.isArray(r) ? r : Object.values(r).find(Array.isArray);
  const v4 = rows.filter((l) => (l.liquiditeUsd || 0) >= 500 && verdictRoutage({ aMarche: true, dex: l.dex, poolAdr: l.poolAdr }).achetableIci);
  const v4Actions = v4.filter((l) => P.ACTIONS_COINBASE.some((a) => String(a.adr).toLowerCase() === String(l.adr).toLowerCase()));
  console.log('    lignes v4 IN_APP : ' + v4.length + ' · dont actions du registre (Buy via la fiche) : ' + v4Actions.map((l) => l.sym).join(' '));
  /* 2026-10-18 : l ancienne borne « v4Actions >= 10 » comptait la BRANCHE du verdict (v4 IN_APP), pas l achat. Les actions ont
   *   migre vers des pools Aerodrome (14/20 a cle v4 servies en Aerodrome, Buy par ETH/USDC) : 3 lignes v4 restaient, KO a tort.
   *   Invariant vise : TOUTE ligne servie d une action du registre, liquidite >= 500 $, a un Buy — quelle que soit la branche. */
  const actRows = rows.filter((l) => (l.liquiditeUsd || 0) >= 500 && P.ACTIONS_COINBASE.some((a) => String(a.adr).toLowerCase() === String(l.adr).toLowerCase()));
  /* ⛔⛔ 2026-10-23 : CE BANC JUGEAIT LA LIGNE BRUTE, L APP JUGE `avecPoolAction(l)` (et `l.achat` avant). Mesure du jour : 14 « SANS Buy »
   *   ici, 5 seulement dans le DOM servi (METAc, GOOGLc… ont un Buy par leur pool epinglee). Le banc rejoue donc la MEME decision que
   *   la ligne du Market — hors la decouverte client (poolDecouvertPour), qui ne peut qu AJOUTER un Buy.
   *   Invariant vise : toute action servie (liq >= 500 $) a un Buy OU une raison mesuree — et la raison d une pool hors routeur est
   *   VRAIE (temoin chaine ci-dessous), jamais « empty / third-party hook ». */
  const decision = (l) => {
    if (l.achat && l.achat.cle) return { buy: 'serveur' };
    const lA = avecPoolAction(l);
    const v = verdictRoutage({ aMarche: true, dex: lA.dex, poolAdr: lA.poolAdr });
    if (v.achetableEnEth || v.achetableEnUsdc || v.achetableIci) return { buy: lA.poolSource ? 'epinglee' : 'verdict' };
    return { buy: null, raison: typeof R.raisonSansBuy === 'function' ? R.raisonSansBuy(v, { liqOk: true, liqMin: 500 }) : null, dex: lA.dex, poolAdr: lA.poolAdr };
  };
  const jug = actRows.map((l) => ({ l, d: decision(l) }));
  const avecBuy = jug.filter((x) => x.d.buy), sansBuy = jug.filter((x) => !x.d.buy);
  console.log('    actions servies : ' + jug.map((x) => x.l.sym + '=' + (x.d.buy || ('SANS:' + (x.d.raison ? x.d.raison.code : 'muet') + '@' + x.d.dex))).join(' '));
  ok(actRows.length >= 10 && sansBuy.every((x) => x.d.raison && x.d.raison.code && x.d.raison.phrase),
    'toute action du registre servie (liq >= 500 $) a un Buy OU une raison : Buy ' + avecBuy.length + '/' + actRows.length + ' · raison dite ' + sansBuy.filter((x) => x.d.raison).length + '/' + sansBuy.length);
  /* ⛔ LE BANC REJOUE L APP, PAS LA LIGNE BRUTE (mutant « lA = l » survivant avant cette assertion) : une action a pool epinglee
   *   (POOLS_ACTIONS_AERODROME) a TOUJOURS un Buy dans l app — avecPoolAction la rend sur sa pool Aerodrome mesuree. */
  const epinglees = jug.filter((x) => POOLS_ACTIONS_AERODROME.has(String(x.l.adr).toLowerCase()));
  ok(epinglees.length > 0 && epinglees.every((x) => x.d.buy),
    'toute action a pool epinglee a un Buy (comme le Market servi) : ' + epinglees.filter((x) => x.d.buy).length + '/' + epinglees.length
      + ' · dont servies sur une AUTRE pool que l epinglee : ' + epinglees.filter((x) => String(x.l.poolAdr || '').toLowerCase() !== POOLS_ACTIONS_AERODROME.get(String(x.l.adr).toLowerCase()).pool).map((x) => x.l.sym + '@' + x.l.dex).join(' '));
  /* anti-creux : « une raison partout » serait vert si TOUS les Buy disparaissaient — le Buy reste la regle */
  ok(avecBuy.length * 2 > actRows.length, 'anti-creux : la majorite des actions servies garde un Buy : ' + avecBuy.length + '/' + actRows.length);
  /* ⛔ LA RAISON EST VRAIE : chaque ligne DEX_HORS_ROUTEUR a pool a adresse est relue sur la chaine — `factory()` ne doit PAS etre celle
   *   que declare notre routeur (sinon la raison mentirait et un Buy manquerait). Lecture ratee = KO NON MESURE, jamais un vert. */
  const horsRouteur = sansBuy.filter((x) => x.d.raison && x.d.raison.code === 'DEX_HORS_ROUTEUR' && /^0x[0-9a-f]{40}$/i.test(String(x.d.poolAdr || '')));
  const lus = [];
  for (const x of horsRouteur) {
    let f = null;
    for (const u of ['https://mainnet.base.org', 'https://base-rpc.publicnode.com']) {
      try {
        const j = await fetch(u, { method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_call', params: [{ to: x.d.poolAdr, data: selecteur('factory()') }, 'latest'] }) }).then((r) => r.json());
        if (j && typeof j.result === 'string' && j.result.length >= 66) { f = '0x' + j.result.slice(-40).toLowerCase(); break; }
      } catch (_) { /* endpoint suivant */ }
    }
    lus.push({ sym: x.l.sym, f });
  }
  console.log('    factory() des pools hors routeur : ' + lus.map((x) => x.sym + '=' + (x.f || 'NON LU')).join(' '));
  /* ⛔ pas de vert creux : des lignes sans Buy dont AUCUNE n est hors routeur ne prouvent rien ici — on le dit, sans compter 0/0 vert */
  if (!horsRouteur.length) console.log('    (aucune ligne hors routeur aujourd hui : temoin chaine sans objet)');
  ok(lus.length === horsRouteur.length && lus.every((x) => x.f && x.f !== FACTORY_AERODROME_CL.toLowerCase()),
    'raison vraie : ' + lus.filter((x) => x.f && x.f !== FACTORY_AERODROME_CL.toLowerCase()).length + '/' + lus.length + ' pools « hors routeur » ont une factory() lue AUTRE que celle du routeur Aerodrome');
  ok(v4Actions.length < v4.length / 2, 'anti-gonflement : les actions ne sont pas la majorite des lignes v4 : ' + v4Actions.length + ' sur ' + v4.length);
  const fiche = rows.filter((l) => (l.liquiditeUsd || 0) >= 500 && (() => { const v = verdictRoutage({ aMarche: true, dex: l.dex, poolAdr: l.poolAdr }); return v.achetableEnEth || v.achetableEnUsdc; })());
  console.log('    lignes servies ' + rows.length + ' · nouveau Buy (fiche) : ' + fiche.map((l) => l.sym).join(' '));
  /* le verdict ouvre Aerodrome (ETH ou USDC) ET Uniswap v3 (USDC) : toutes hors v4, sur une pool a adresse de contrat */
  ok(fiche.length > 0 && fiche.every((l) => /^0x[0-9a-f]{40}$/i.test(String(l.poolAdr || ''))), 'des lignes reelles gagnent un Buy, toutes hors v4 (pool a adresse de contrat) : ' + fiche.length);
  const vol = fiche.reduce((s, l) => s + (l.volume24hUsd || 0), 0);
  console.log('    volume 24 h de ces lignes : ' + Math.round(vol) + ' $');
} catch (err) { ok(false, 'trending illisible — NON MESURE : ' + String(err && err.message).slice(0, 80)); }
console.log(n + ' assertions, ' + ko + ' KO');
process.exitCode = ko ? 1 : 0; /* pas process.exit : sous Windows il plante (UV_HANDLE_CLOSING) si un socket se ferme encore */
