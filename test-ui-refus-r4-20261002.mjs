/* test-ui-refus-r4-20261002.mjs — revue UI (Grok Super) sur fix-r4, verifiee contre 242b475.
 *   KO1 : un refus STRUCTUREL dit exactement « Not tradable here yet. Nothing was sent. » sur tous les rails ; pas de
 *         « Not possible: », « Not prepared — », « (at <etape>) » ; « Nothing was sent » jamais deux fois.
 *   KO2 : une route que R4 / la regle de jonction / le verdict C2 refusent n est jamais dans `cliquables` ;
 *         un achat V1 sans pool V8 desactive « Prepare buy » au chargement (vente ouverte).
 *   KO3 : « Retry quote » n apparait pas apres un refus (seulement NON_MESURE / lecture ratee).
 * Portable : pathToFileURL / fileURLToPath, app.html normalise en LF. Temoins negatifs inclus ; 0 assertion => echec. */
import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const imp = (f) => import(pathToFileURL(path.join(ICI, f)).href);
const html = fs.readFileSync(path.join(ICI, 'app.html'), 'utf8').replace(/\r\n?/g, '\n');
const DD = await imp('devises-dentree.js');
const E = await imp('echange.js');
const T = await imp('tokenomics.js');
const P = await imp('paires.js');
const F = await imp('frais-creation.js');
const PS = await imp('pool-sans-hook.js');
const PA = await imp('plan-aerodrome-segment.js');
const PF = await imp('plan-franchissement.js');

let n = 0; const ko = [];
const ok = (c, m) => { n += 1; if (!c) ko.push(m); };
const TEXTE = 'Not tradable here yet. Nothing was sent.';

/* ══ KO1 ══ */
const bloc = (html.match(/const TEXTE_PAS_ICI = [\s\S]*?\nfunction texteRefusEchange\(pourquoi\) \{[\s\S]*?\n\}/) || [''])[0];
ok(bloc.length > 0, 'KO1 : helper texteRefusEchange + estRefusStructurel trouve');
const H = new Function(bloc + '; return { texteRefusEchange, estRefusStructurel, TEXTE_PAS_ICI };')();
ok(H.TEXTE_PAS_ICI === TEXTE, 'KO1 : TEXTE_PAS_ICI exact');
for (const k of ['refusBlocIntermediaire', 'refusBlocJonction', 'refusPlusieursHooks', 'refusFraisEnBlock', 'refusSansHook', 'refusBlocSansHookTb', 'refusV1Route', 'refusCheminFrais']) {
  ok(H.texteRefusEchange({ etat: 'REFUSE', pourquoi: PS.MESSAGE_SANS_POOL, [k]: true }) === TEXTE, 'KO1 : ' + k + ' => texte exact');
}
ok(H.texteRefusEchange({ etat: 'REFUSE', pourquoi: PS.MESSAGE_PAS_ICI }) === TEXTE, 'KO1 : MESSAGE_PAS_ICI sans drapeau => texte exact');
const autre = H.texteRefusEchange({ etat: 'REFUSE', pourquoi: 'this pool returns nothing for this amount' });
ok(autre === 'This pool returns nothing for this amount. Nothing was sent.', 'KO1 temoin : un refus NON structurel garde sa raison (' + autre + ')');
const sp = H.texteRefusEchange({ etat: 'REFUSE', pourquoi: PS.MESSAGE_SANS_POOL, refusTblock: true });
ok(sp.split(/nothing was sent/i).length === 2, 'KO1 : MESSAGE_SANS_POOL — « Nothing was sent » une seule fois (' + sp + ')');
ok(!H.estRefusStructurel({ etat: 'NON_MESURE', pourquoi: 'its market could not be read' }), 'KO1 temoin : NON_MESURE n est pas structurel');
/* les rails : chaque refus passe le PLAN (le drapeau decide) */
for (const [rail, re] of [
  ['afficherPlanMultiSauts', /return refuser\(p\.refusPoussiere \? String\(p\.pourquoi\) : texteRefusEchange\(p\), false\);/],
  ['afficherAerodromeSegment', /return refuser\(texteRefusEchange\(pa\), 'echange_multi_refus_pool', false\);/],
  ['afficherFranchissement', /return refuser\(texteRefusEchange\(pf\), 'echange_multi_refus_pool', false\);/],
  ['sautsDepuisChemin', /e\.textContent = texteRefusEchange\(b\);/],
  ['Buy\/Sell simple', /e\.textContent = estRefusStructurel\(p\) \? texteRefusEchange\(p\) : p\.refusPoussiere/],
  ['ETH->USDC', /e\.textContent = p\.refusPoussiere \? String\(p\.pourquoi\) : texteRefusEchange\(p\); return;/],
]) ok(re.test(html), 'KO1 : rail ' + rail + ' passe le plan a texteRefusEchange');
const debut = html.indexOf('function afficherPlanMultiSauts'), fin = html.indexOf("$('#peAcheter').addEventListener");
ok(debut > 0 && fin > debut, 'KO1 : zone des rails d echange trouvee');
const zoneBrute = html.slice(debut, fin);
/* preparerAjout (ajout de liquidite) n est pas un rail d echange : hors du perimetre KO1 (dit dans le rapport) */
const iAjout = zoneBrute.indexOf('async function preparerAjout');
const finAjout = iAjout > 0 ? zoneBrute.slice(iAjout).search(/\r?\n\}\r?\n/) : -1;
const zone = iAjout > 0 && finAjout > 0 ? zoneBrute.slice(0, iAjout) + zoneBrute.slice(iAjout + finAjout + 3) : zoneBrute;
ok(!/'Not possible: '|'Not prepared — '|Not possible as set/.test(zone), 'KO1 : aucun prefixe « Not possible: » / « Not prepared — » sur les rails d echange');
ok(!/\(at ' \+|' \(' \+ p[af]\.etape/.test(zone), 'KO1 : aucune etape interne (« (at forme) ») a l ecran');

/* ══ KO3 ══ */
const refusers = zone.match(/const refuser = \(texte(?:, compteur)?, relancer = true\) => \{[\s\S]*?\n  \};/g) || [];
ok(refusers.length === 3, 'KO3 : trois refuser() avec `relancer` (' + refusers.length + ')');
ok(refusers.every((r) => /if \(!relancer\) return;[\s\S]*Retry quote/.test(r)), 'KO3 : « Retry quote » conditionne a relancer');
const blocRefusPool = (zone.match(/try \{ etape\('echange_refus_pool'\); \} catch \(_\) \{\}[\s\S]*?return;/) || [''])[0];
ok(blocRefusPool && !/Retry quote/.test(blocRefusPool), 'KO3 : Buy/Sell simple — pas de « Retry quote » apres REFUSE');
const blocNonMesure = (zone.match(/if \(p\.etat === 'NON_MESURE'\) \{\n {4}e\.className = 'note wKo';\n {4}e\.textContent = 'Could not get a price right now[\s\S]*?Retry quote/) || [''])[0];
ok(!!blocNonMesure, 'KO3 temoin : « Retry quote » reste apres NON_MESURE');

/* ══ KO2 (a) : AUCUNE route refusee par les planificateurs dans `cliquables` ══ */
const offSrc = (html.match(/ {2}const offrable = \(d\) => \{[\s\S]*?\n {2}\};/) || [''])[0];
ok(!!offSrc, 'KO2 : offrable() trouve dans app.html');
const offrable = new Function('peutEtreAssemblee', 'ASSEMBLEUR_CABLE_SUR_LE_BOUTON', 'FRANCHISSEMENT_CABLE_SUR_LE_BOUTON', offSrc + '; return offrable;')(DD.peutEtreAssemblee, true, true);
const bas = (a) => String(a).toLowerCase();
const ETH = '0x' + '0'.repeat(40);
const USDC = bas(F.USDC_BASE);
const OUSD = bas(P.DEVISES_BASE.find((d) => d.symbole === 'OUSD').adr);
const AAPL = bas(P.ACTIONS_COINBASE.find((a) => a.symbole === 'AAPLc').adr);
const HTZ = bas(P.ACTIONS_COINBASE.find((a) => a.symbole === 'HTZc').adr);
const B1 = '0xb2' + '0'.repeat(20) + 'ffffffffffffffff01';
const B2 = '0xb2' + '0'.repeat(20) + 'ffffffffffffffff02';
const compte = '0x' + '4'.repeat(40);
const Q = bas(E.QUOTEUR[8453]);
const q = '0x' + (10n ** 18n).toString(16).padStart(64, '0') + '0'.repeat(64);
const rpc = async (m, p) => (m !== 'eth_call' ? (m === 'eth_chainId' ? '0x2105' : '0x' + '0'.repeat(64)) : bas((p && p[0] && p[0].to) || '') === Q ? q : '0x' + 'f'.repeat(128));
const rpcMuet = async () => { throw new Error('lecture'); };
/* resolution realiste : un saut qui touche un block passe par sa pool V8 (hook TB), les autres par une pool sans hook */
const cle = (a, b) => { const [c0, c1] = bas(a) < bas(b) ? [bas(a), bas(b)] : [bas(b), bas(a)];
  return PS.estBlockAJonction(a) || PS.estBlockAJonction(b) ? { currency0: c0, currency1: c1, fee: 0, tickSpacing: 200, hooks: T.HOOK_V8 }
    : { currency0: c0, currency1: c1, fee: 500, tickSpacing: 10, hooks: ETH }; };
const STRUCT = ['refusBlocIntermediaire', 'refusBlocJonction', 'refusPlusieursHooks', 'refusFraisEnBlock', 'refusSansHook', 'refusBlocSansHookTb', 'refusV1Route', 'refusTblock'];
const structurel = (p) => !!p && p.etat === 'REFUSE' && STRUCT.some((k) => p[k] === true);
async function planificateurRefuse(chemin) {
  const fam = chemin.map((s) => s.famille);
  const devise = chemin[0].de, block = chemin[chemin.length - 1].vers;
  if (fam.every((f) => f === 'uniswap-v4')) {
    const sauts = chemin.map((s) => { const c = cle(s.de, s.vers); return { cle: c, zeroForOne: bas(s.de) === c.currency0 }; });
    return structurel(await E.planEchangeMultiSauts({ rpc, chaine: 8453, compte, sauts, entree: devise, sortie: block, montant: 10n ** 18n, decimalesEntree: 18, prixUsdEntree: null, fraisDevisesOk: new Set([USDC, OUSD, AAPL]) }));
  }
  if (fam.every((f) => f === 'aerodrome')) {
    try { return structurel(await PA.planAerodromeSegment({ rpc: rpcMuet, chemin, devise, block, montant: 10n ** 7n, compte, beneficiaireFrais: F.FEE_WALLET })); } catch (_) { return false; }
  }
  try {
    return structurel(await PF.planFranchissement({ rpc: rpcMuet, chaine: 8453, compte, chemin, devise, block, montant: 10n ** 16n, decimalesEntree: 18,
      resoudreV4: async () => { throw new Error('resolution'); }, beneficiaireFrais: F.FEE_WALLET }));
  } catch (_) { return false; }
}
const NOEUDS = [USDC, ETH, AAPL, HTZ, B1, B2];
const FAM = ['uniswap-v4', 'aerodrome'];
let nRefuses = 0, nOfferts = 0, nCas = 0;
const devises = [];
for (const cible of [B1, AAPL]) {
  for (const m1 of NOEUDS) for (const m2 of [null, ...NOEUDS]) {
    const noeuds = [OUSD, m1, ...(m2 ? [m2] : []), cible];
    if (new Set(noeuds).size !== noeuds.length) continue;
    const nbSauts = noeuds.length - 1;
    for (let fm = 0; fm < (1 << nbSauts); fm += 1) {
      const chemin = noeuds.slice(1).map((v, i) => ({ de: noeuds[i], vers: v, famille: FAM[(fm >> i) & 1] }));
      const d = DD.classerDevise({ devise: OUSD, block: cible, aretes: chemin, faitsLus: true });
      if (!d.chemin || d.chemin.length !== nbSauts) continue;
      nCas += 1;
      const refuse = await planificateurRefuse(d.chemin);
      const offert = offrable(d);
      if (refuse) { nRefuses += 1; ok(!offert, 'KO2 : route refusee par le planificateur mais OFFERTE : ' + chemin.map((s) => s.famille[0] + ':' + s.vers.slice(0, 6) + s.vers.slice(-2)).join(' ')); }
      if (offert) nOfferts += 1;
      devises.push({ d, refuse });
    }
  }
}
const cliquables = devises.map((x) => x.d).filter(offrable);
ok(cliquables.every((d) => !devises.find((x) => x.d === d).refuse), 'KO2 : aucune route refusee dans cliquables');
ok(nCas > 50 && nRefuses > 20 && nOfferts > 5, 'KO2 : enumeration non vide (' + nCas + ' cas, ' + nRefuses + ' refuses, ' + nOfferts + ' offerts)');
/* temoins positifs explicites */
const off = (chemin, cible) => offrable(DD.classerDevise({ devise: OUSD, block: cible, aretes: chemin, faitsLus: true }));
ok(off([{ de: OUSD, vers: USDC, famille: 'uniswap-v4' }, { de: USDC, vers: ETH, famille: 'uniswap-v4' }, { de: ETH, vers: B1, famille: 'uniswap-v4' }], B1), 'KO2 temoin : OUSD>USDC>ETH>B1 tout V4 reste offert');
ok(off([{ de: OUSD, vers: USDC, famille: 'uniswap-v4' }, { de: USDC, vers: AAPL, famille: 'aerodrome' }], AAPL), 'KO2 temoin : franchissement OUSD>USDC>(Aerodrome)>AAPLc reste offert');
ok(!off([{ de: OUSD, vers: USDC, famille: 'uniswap-v4' }, { de: USDC, vers: B1, famille: 'aerodrome' }], B1), 'KO2 : franchissement vers un block refuse');
/* temoin negatif : sans le predicat statique, la meme enumeration offrirait des routes refusees */
const sansGarde = (d) => offrable({ ...d, chemin: [] });
ok(devises.some((x) => x.refuse && sansGarde(x.d)), 'KO2 TEMOIN NEGATIF : sans routeRefuseeStatiquement, une route refusee serait offerte');

/* ══ KO2 (b) : achat V1 sans pool V8 — « Prepare buy » desactive au chargement, vente ouverte ══ */
const v1Src = (html.match(/async function marquerAchatV1\(v\) \{[\s\S]*?\n\}/) || [''])[0];
ok(!!v1Src, 'KO2 : marquerAchatV1 trouve');
ok(/marcheProfil = v \? \{ adr: String\(adr\)\.toLowerCase\(\), chaine: CHAINE, v \} : null;\n {2}if \(perime\(\)\) return;\n {2}await marquerAchatV1\(v\);/.test(html), 'KO2 : marquerAchatV1 appele au chargement du profil');
async function simuler(v, actuelle) {
  const bouton = { disabled: false, apres: null, insertAdjacentElement(_, el) { this.apres = el; } };
  const doc = { createElement: () => ({ hidden: false, textContent: '' }), getElementById: () => bouton.apres };
  const f = new Function('$', 'document', 'poolActuelleDuBlock', 'rpc', 'RESEAUX', 'CHAINE', 'HOOK_PREVU', v1Src + '; return marquerAchatV1;')(
    (s) => (s === '#peAcheter' ? bouton : null), doc, async () => actuelle, null, { 8453: { stateView: '0x' + '5'.repeat(40) } }, 8453, T.HOOK_PREVU);
  await f(v);
  return bouton;
}
const vV1 = { etat: 'LUE', cle: { ...cle(ETH, B1), hooks: T.HOOK_PREVU } };
const b1 = await simuler(vV1, { cle: null, ratees: 0 });
ok(b1.disabled === true && b1.apres && b1.apres.textContent === 'Not tradable here yet' && b1.apres.hidden === false, 'KO2 : V1 sans V8 => Prepare buy desactive + « Not tradable here yet »');
const b2 = await simuler(vV1, { cle: cle(ETH, B1), ratees: 0 });
ok(b2.disabled === false, 'KO2 temoin : V1 avec pool V8 => Prepare buy actif');
const b3 = await simuler(vV1, { cle: null, ratees: 2 });
ok(b3.disabled === false, 'KO2 temoin : lecture ratee => rien n est ferme (le planificateur dira NON_MESURE)');
const b4 = await simuler({ etat: 'LUE', cle: cle(ETH, B1) }, { cle: null, ratees: 0 });
ok(b4.disabled === false, 'KO2 temoin : marche V8 => Prepare buy actif');
ok(!/peVendre/.test(v1Src), 'KO2 : la vente n est pas touchee');

/* ══ BADGE (vu en prod 23:10) : « Fee 3% · included » quand le hook paie, jamais « · fee · 0 ETH » ══ */
const badge = (html.match(/ {8}feeEl\.textContent = parHook \? [\s\S]*?;\n/) || [''])[0];
ok(!!badge, 'BADGE : expression trouvee');
if (badge) {
  const fb = new Function('parHook', 'p', 'r', 'libelleFrais', 'formaterUnites', 'feeLabel', 'const feeEl = {}; ' + badge + ' return feeEl.textContent;');
  const lib = () => ({ court: 'Fee 3%' });
  const fu = (x) => String(x);
  const tHook = fb(true, { cle: {} }, { frais: 0n, fraisDevise: 'ETH' }, lib, fu, 'fee');
  ok(tHook === 'Fee 3% · included', 'BADGE : hook paie => « Fee 3% · included » (' + tHook + ')');
  const tRout = fb(false, { cle: {} }, { frais: 50000n, fraisDevise: 'ETH' }, () => ({ court: 'Fee 0.5%' }), fu, 'fee');
  ok(tRout === 'Fee 0.5% · fee · 50000 ETH', 'BADGE temoin : frais routeur => montant affiche (' + tRout + ')');
}

for (const m of ko) console.log('  KO  ' + m);
console.log(n + ' assertions, ' + ko.length + ' KO');
if (n === 0) { console.log('⛔ aucune assertion'); process.exit(1); }
process.exit(ko.length ? 1 : 0);
