/* test-impact-prix-20261009.mjs — L IMPACT DE PRIX D UN ACHAT D ACTION, DIT AVANT LA SIGNATURE ; UNE POOL TROP FINE NOMMEE.
 *
 * POURQUOI. Post public du 2026-10-09 : « un achat de 1 000 USDC de MRVLc fait +100 % ». Mesure le meme jour (lecture seule) : la pool
 *   v4 MRVLc/USDC (frais LP 5 %) ne remplit qu environ 448 USDC ; 100 USDC payaient 16 % au-dessus de son prix ; 500 et 1 000 USDC
 *   revertaient, et notre planificateur l appelait « could not be quoted » (NON_MESURE). Le ticket ne montrait que le minimum a 1 %.
 * A. impactDuDevis (echange.js) : la formule en BigInt dans les deux sens, 0 si le devis bat le spot, null si slot0 n est pas lu.
 * B. planEchange : impactBps dans le resume ; un devis qui reverte alors que le dixieme passe -> REFUSE « too thin » ; les deux
 *    revertent -> NON_MESURE comme avant.
 * C. app.html : la ligne « Price impact » ; rouge au-dela du seuil ; rien quand l impact n est pas lu.
 * D. MUTANTS.
 * ⛔ BORNE : faux noeud. La mesure sur MRVLc est dans le message de commit, pas ici. Le seuil (10 %) est une PROPOSITION. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
const ICI = path.dirname(fileURLToPath(import.meta.url));
const imp = (f, dir = ICI) => import(pathToFileURL(path.join(dir, f)).href + '?v=' + Math.random());
let n = 0, ko = 0;
const ok = (c, m) => { n += 1; if (c) console.log('ok  ' + m); else { ko += 1; console.log('KO  ' + m); } };
const lire = (f) => fs.readFileSync(path.join(ICI, f), 'utf8').replace(/\r\n/g, '\n');
const Q96 = 1n << 96n;
const mot = (x) => '0x' + BigInt(x).toString(16).padStart(64, '0');

console.log('— A. la formule');
{
  const E = await imp('echange.js');
  const cle = { currency0: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913', currency1: '0xb200000000000000000000000000000000000001', fee: 50000, tickSpacing: 101, hooks: '0x0000000000000000000000000000000000000000' };
  /* prix 1:4 (currency1 par currency0) -> sqrt = 2 * 2^96 */
  const slot = async () => mot(2n * Q96) + '0'.repeat(64 * 3);
  const a = await E.impactDuDevis({ lire: slot, stateView: '0x' + '1'.repeat(40), cle, zeroForOne: true, entree: 1000n, sortie: 3600n });
  ok(a.sortieSpot === 4000n && a.impactBps === 1000n, 'A zeroForOne : 1000 au prix 4 = 4000 au spot ; 3600 cotes = 1000 bps (' + a.impactBps + ')');
  const b = await E.impactDuDevis({ lire: slot, stateView: '0x' + '1'.repeat(40), cle, zeroForOne: false, entree: 4000n, sortie: 950n });
  ok(b.sortieSpot === 1000n && b.impactBps === 500n, 'A dans l autre sens : 4000 / 4 = 1000 au spot ; 950 cotes = 500 bps (' + b.impactBps + ')');
  const c = await E.impactDuDevis({ lire: slot, stateView: '0x' + '1'.repeat(40), cle, zeroForOne: true, entree: 1000n, sortie: 4100n });
  ok(c.impactBps === 0n, 'A un devis meilleur que le spot rend 0, jamais un impact negatif');
  const d = await E.impactDuDevis({ lire: async () => { throw new Error('429'); }, stateView: '0x' + '1'.repeat(40), cle, zeroForOne: true, entree: 1000n, sortie: 3600n });
  ok(d.impactBps === null && d.sortieSpot === null, 'A slot0 non lu -> null (non lu), jamais 0');
  const e = await E.impactDuDevis({ lire: async () => mot(0) + '0'.repeat(192), stateView: '0x' + '1'.repeat(40), cle, zeroForOne: true, entree: 1000n, sortie: 3600n });
  ok(e.impactBps === null, 'A une pool non initialisee (sqrt 0) -> null');
  ok(E.IMPACT_AVERTIR_BPS === 1000n, 'A le seuil d avertissement est une constante nommee (1000 bps, proposition)');
}

console.log('— B. le plan (source)');
const src = lire('echange.js');
ok(/const impact = await impactDuDevis\(\{ lire, stateView: V\.stateView, cle, zeroForOne: zf, entree: montantQuote, sortie: q \}\);/.test(src)
  && /resumeD\.impactBps = impact\.impactBps; resumeD\.sortieAuPrixPool = impact\.sortieSpot;/.test(src), 'B planEchange (marche en devise ERC-20 : les actions v4) mesure l impact et le met dans le resume');
ok(/if \(dixiemeCote\) return \{ etat: 'REFUSE', poolTropFine: true,/.test(src) && /encodeQuote\(\{ cle, zeroForOne: zf, montant: montantQuote \/ 10n \}\)/.test(src),
  'B un devis qui reverte est recote au dixieme : s il passe, REFUSE « too thin » (la pool a repondu) au lieu de NON_MESURE');
/* execution de la branche de recote, extraite et rejouee avec un faux noeud */
async function recote(source, revertePlein, reverteDixieme) {
  const corps = source.slice(source.indexOf('      let dixiemeCote = false;'), source.indexOf("      return { etat: 'NON_MESURE', pourquoi: 'the price could not be quoted: '"));
  const f = new Function('lire', 'Q', 'encodeQuote', 'cle', 'zf', 'montantQuote', 'return (async () => {' + corps + ' return null; })();');
  const lireF = async (m, p) => { const plein = /PLEIN/.test(p[0].data); if ((plein && revertePlein) || (!plein && reverteDixieme)) throw new Error('revert'); return mot(5); };
  return f(lireF, '0xq', ({ montant }) => (montant === 1000n ? 'PLEIN' : 'DIXIEME'), {}, true, 1000n);
}
{
  const r1 = await recote(src, true, false);
  ok(r1 && r1.etat === 'REFUSE' && r1.poolTropFine === true, 'B (execute) plein reverte, dixieme passe -> REFUSE poolTropFine');
  const r2 = await recote(src, true, true);
  ok(r2 === null, 'B (execute) les deux revertent -> la branche ne refuse pas (NON_MESURE comme avant)');
}

console.log('— C. le panneau');
const html = lire('app.html');
ok(/const impact = rs\.impactBps !== undefined && rs\.impactBps !== null && \/\^\\d\+\$\/\.test\(String\(rs\.impactBps\)\) \? Number\(rs\.impactBps\) : null;/.test(html)
  && /if \(impact !== null\) \{/.test(html) && /bcEtape\(m, 'Price impact: ' \+ \(impact \/ 100\)\.toFixed\(1\)/.test(html), 'C la ligne « Price impact » n apparait que si l impact est LU');
ok(/const fort = impact >= BC_IMPACT_AVERTIR_BPS;/.test(html) && /const BC_IMPACT_AVERTIR_BPS = 1000;/.test(html), 'C au-dela du seuil (le meme que le moteur), la ligne passe en rouge et conseille un montant plus petit');

ok(/if \(ACTIONS_PAR_ADR\.has\(a\)\) \{\s+const su = bc\.offres && bc\.offres\.get\(a\);/.test(html) && /ligne\('All that exists', /.test(html)
  && /if \(brut !== null && Number\.isInteger\(dec\)\) bc\.offres\.set\(a, \{ brut, dec, t: Date\.now\(\) \}\);/.test(html), 'C l offre totale d une action est dite (lue sur la chaine) ; non lue = pas de tuile, jamais « 0 »');
ok(/if \(typeof p\.choix === 'string' && p\.choix\) bcEtape\(m, p\.choix \+ '\.'\);/.test(html), 'C le choix de pool (v4 ou Aerodrome) est dit sur la carte');

console.log('— E. le choix v4 / Aerodrome (rails-api.js meilleureAlternativeAerodrome, faux noeud)');
{
  const R = await imp('rails-api.js');
  const { USDC_BASE } = await imp('frais-creation.js');
  const ACT = '0xb200000000000000000000000000000000000001', POOL = '0x' + 'a'.repeat(40);
  /* faux noeud : la factory connait UNE pool a l espacement 10 ; sa profondeur ; token0 = USDC ; le quoter CL rend `sortieAero` */
  const noeud = (sortieAero, quoterReverte = false) => async (m, p) => {
    const d = String(p[0].data), to = String(p[0].to).toLowerCase();
    if (d.startsWith('0x28af8d0b')) return BigInt('0x' + d.slice(138, 202)) === 10n ? mot(BigInt(POOL)) : mot(0);
    if (d.startsWith('0x70a08231')) return mot(10n ** 12n);
    if (d.startsWith('0x0dfe1681')) return mot(BigInt(USDC_BASE));
    if (to !== POOL) { if (quoterReverte) throw new Error('execution reverted'); return mot(sortieAero) + '0'.repeat(64 * 3); }
    return mot(0);
  };
  const a1 = await R.meilleureAlternativeAerodrome({ rpc: noeud(2000n), action: ACT, montant: 1000000n, sortieV4: 1000n });
  ok(a1.choisie === true && a1.sortie === 2000n && /Aerodrome pool/.test(a1.phrase), 'E Aerodrome donne plus (apres son 0,1 %) : choisie, et la phrase le dit');
  const a2 = await R.meilleureAlternativeAerodrome({ rpc: noeud(1000n), action: ACT, montant: 1000000n, sortieV4: 1000n });
  ok(a2.choisie === false && /v4 pool kept/.test(a2.phrase), 'E a egalite (Aerodrome net = 999 < 1000) : la pool v4 reste, et c est dit');
  const a3 = await R.meilleureAlternativeAerodrome({ rpc: noeud(5000n, true), action: ACT, montant: 1000000n, sortieV4: 1000n });
  ok(a3.choisie === false, 'E devis Aerodrome qui reverte : jamais choisie');
  const a4 = await R.meilleureAlternativeAerodrome({ rpc: noeud(5000n), action: ACT, montant: 1000000n, sortieV4: null });
  ok(a4.choisie === false && a4.phrase === null, 'E devis v4 absent (non lu) : on ne devie pas a l aveugle');
  const a5 = await R.meilleureAlternativeAerodrome({ rpc: async () => { throw new Error('429'); }, action: ACT, montant: 1000000n, sortieV4: 1000n });
  ok(a5.choisie === false, 'E noeud muet : jamais choisie');
}

console.log('— D. mutants');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tb-impact-'));
{
  const dir = fs.mkdtempSync(path.join(tmp, 'm-'));
  for (const f of fs.readdirSync(ICI)) if (/\.js$/.test(f) && !/^(serveur-web|vendor|mcp-ext-apps)/.test(f)) fs.copyFileSync(path.join(ICI, f), path.join(dir, f));
  const de = "if (!r || String(r).length < 66) return { impactBps: null, sortieSpot: null };";
  fs.writeFileSync(path.join(dir, 'echange.js'), src.replace(de, "if (!r || String(r).length < 66) return { impactBps: 0n, sortieSpot: null };"));
  const M = await imp('echange.js', dir);
  const x = await M.impactDuDevis({ lire: async () => '0x', stateView: '0x' + '1'.repeat(40), cle: { currency0: '0x' + '0'.repeat(39) + '1', currency1: '0x' + '0'.repeat(39) + '2', fee: 0, tickSpacing: 1, hooks: '0x' + '0'.repeat(40) }, zeroForOne: true, entree: 1n, sortie: 1n });
  ok(src.split(de).length === 2 && x.impactBps !== null, 'D mutant « lecture ratee = impact 0 » : ROUGE');
}
{
  const r = await recote(src.replace('if (dixiemeCote) return', 'if (false) return'), true, false);
  ok(r === null, 'D mutant « recote ignoree » : ROUGE (le refus « too thin » disparait)');
}
{
  const dir = fs.mkdtempSync(path.join(tmp, 'r-'));
  for (const f of fs.readdirSync(ICI)) if (/\.js$/.test(f) && !/^(serveur-web|vendor|mcp-ext-apps)/.test(f)) fs.copyFileSync(path.join(ICI, f), path.join(dir, f));
  const rs = lire('rails-api.js'), de = 'if (v4 === null || net <= v4) return rien(';
  fs.writeFileSync(path.join(dir, 'rails-api.js'), rs.replace(de, 'if (false) return rien('));
  const M = await imp('rails-api.js', dir);
  const { USDC_BASE } = await imp('frais-creation.js');
  const POOL = '0x' + 'a'.repeat(40);
  const n2 = async (m, p) => { const d = String(p[0].data), to = String(p[0].to).toLowerCase();
    if (d.startsWith('0x28af8d0b')) return BigInt('0x' + d.slice(138, 202)) === 10n ? mot(BigInt(POOL)) : mot(0);
    if (d.startsWith('0x70a08231')) return mot(10n ** 12n); if (d.startsWith('0x0dfe1681')) return mot(BigInt(USDC_BASE));
    if (to !== POOL) return mot(500n) + '0'.repeat(192); return mot(0); };
  const x = await M.meilleureAlternativeAerodrome({ rpc: n2, action: '0xb200000000000000000000000000000000000001', montant: 1000000n, sortieV4: 1000n });
  ok(rs.split(de).length === 2 && x.choisie === true, 'D mutant « devier sans comparer » : ROUGE (Aerodrome choisi alors qu il donne MOINS a la personne)');
}
fs.rmSync(tmp, { recursive: true, force: true });
console.log('\n' + (n - ko) + ' ok / ' + ko + ' KO (' + n + ' assertions)');
process.exit(ko ? 1 : 0);
