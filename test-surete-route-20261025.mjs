/* test-surete-route-20261025.mjs - LA LIGNE DE SURETE D UNE ACTION LIT LA POOL OU PASSE L ECHANGE, ET NE DIT JAMAIS « no pool found »
 *   QUAND CETTE POOL EXISTE.
 * Rapport du testeur live (2026-10-25, game44) : SNDKc « Measured: B20 · mint open · no pool found » alors que l achat de 0,05 USDC venait
 *   de passer par le routeur Aerodrome (tx 0x5ed6…e86f, status 1) ; TSLAc « Safety of TSLAc: not read. ». Reproduit sur la chaine le
 *   2026-10-25 (lecture seule, base-rpc.publicnode.com, cles de /api/cle) : lireSurete rendait « no pool found » pour TSLAc ET SNDKc.
 * CAUSE : brain-os.js lireSurete ne cherchait qu une pool Uniswap v4 (vieDuBlock) ; une action de la table se trade sur SA pool Aerodrome
 *   (POOLS_ACTIONS_AERODROME, la table epinglee que le planificateur et les rolls en action utilisent : actionMesuree de rolls-en-action.js).
 * CE BANC (rpc simule, aucune lecture reseau) : (A) TSLAc, pool v4 introuvable, pool de la table lue -> la ligne nomme CETTE pool, son USDC,
 *   l aller-retour de 10 USDC cote sur le quoter Aerodrome ; jamais « no pool found ». (B) le noeud refuse les lectures Aerodrome -> « its
 *   Aerodrome pool not read », jamais « no pool found ». (C) une pool de la table qui n apparie pas l action a l USDC -> dit, en rouge.
 *   (D) temoin : un jeton hors table sans route -> « no pool found » (inchange). (E) une route servie (hors table) passee par l app.
 *   (F) mutants sur des COPIES du module (fichier temporaire a cote, efface).
 * NE PROUVE PAS : la cause du « not read » de TSLAc dans l app (un depassement des 15 s est plausible, non mesure dans l app). */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { selecteur } from './keccak.js';
import { POOLS_ACTIONS_AERODROME } from './pools-actions-aerodrome.js';
import { QUOTEUR_AERODROME_CL } from './rolls-en-action.js';
import { USDC_BASE } from './frais-creation.js';
const ICI = path.dirname(fileURLToPath(import.meta.url));
const bas = (x) => String(x).toLowerCase();
const U = bas(USDC_BASE), Q = bas(QUOTEUR_AERODROME_CL);
const TSLA = [...POOLS_ACTIONS_AERODROME].find(([, v]) => v.symbole === 'TSLAc');
if (!TSLA) throw new Error('TSLAc absent de la table');
const [J, { pool: P, tickSpacing: TS }] = TSLA;
const mot = (v) => '0x' + BigInt(v).toString(16).padStart(64, '0');
const motA = (a) => '0x' + bas(a).slice(2).padStart(64, '0');
const S = { t0: selecteur('token0()'), t1: selecteur('token1()'), bal: selecteur('balanceOf(address)'), q: selecteur('quoteExactInputSingle((address,address,uint256,int24,uint160))') };

/* le noeud simule : code B20, tout le reste a zero (aucune pool v4 : getSlot0 rend 0), la pool Aerodrome repond si `aero` */
function rpcDe({ aero = 'ok', paire = true, pool = P } = {}) {
  const appels = [];
  const f = async (m, p) => {
    appels.push(m + ' ' + JSON.stringify(p).slice(0, 140));
    if (m === 'eth_getCode') return '0xef';
    if (m !== 'eth_call') return '0x0';
    const { to, data } = p[0];
    const t = bas(to), d = bas(data);
    const aeroAppel = t === bas(pool) || t === Q || (t === U && d.startsWith(S.bal) && d.endsWith(bas(pool).slice(2)));
    if (aeroAppel && aero === 'refus') throw new Error('429 Too Many Requests');
    if (t === bas(pool) && d === S.t0) return motA(paire ? (BigInt(U) < BigInt(J) ? U : J) : '0x' + '11'.repeat(20));
    if (t === bas(pool) && d === S.t1) return motA(paire ? (BigInt(U) < BigInt(J) ? J : U) : '0x' + '22'.repeat(20));
    if (t === U && d.startsWith(S.bal) && d.endsWith(bas(pool).slice(2))) return mot(38207695200n);
    if (t === Q && d.startsWith(S.q)) {
      const tokenIn = '0x' + d.slice(10 + 24, 10 + 64);
      return tokenIn === U ? mot(26746n) + '0'.repeat(192) : mot(9990000n) + '0'.repeat(192);
    }
    return '0x' + '0'.repeat(64);
  };
  f.appels = appels;
  return f;
}

async function verifier(mod) {
  const ko = [];
  /* (A) */
  const a = await mod.lireSurete({ rpc: rpcDe(), jeton: J, chaine: 8453, clesExactes: [] });
  const ta = a.lignes.map((l) => l.texte).join(' | ');
  if (/no pool found/i.test(a.resume)) ko.push('A : « no pool found » alors que la pool de l echange existe (' + a.resume + ')');
  if (!ta.includes(bas(P))) ko.push('A : la pool ou passe l echange (' + P + ') n est pas nommee (' + ta.slice(0, 300) + ')');
  if (!/Aerodrome/.test(ta)) ko.push('A : le lieu (Aerodrome) n est pas dit');
  if (!/38,?207\.69 USDC|38207\.69 USDC/.test(ta)) ko.push('A : l USDC de la pool n est pas dit (' + ta.slice(0, 400) + ')');
  if (!/10 USDC/.test(ta) || !/0\.1 % lost/.test(ta)) ko.push('A : l aller-retour de 10 USDC (0,1 % perdu) n est pas dit');
  if (!/0\.1 % lost/.test(a.resume)) ko.push('A : le resume ne porte pas l aller-retour (' + a.resume + ')');
  if (/\bsafe\b/i.test(ta + a.resume)) ko.push('A : une ligne dit « safe »');
  /* (B) */
  const b = await mod.lireSurete({ rpc: rpcDe({ aero: 'refus' }), jeton: J, chaine: 8453, clesExactes: [] });
  if (/no pool found/i.test(b.resume)) ko.push('B : « no pool found » sur une lecture refusee (' + b.resume + ')');
  if (!/Aerodrome pool not read/.test(b.resume)) ko.push('B : le resume ne dit pas ce qui n a pas ete lu (' + b.resume + ')');
  if (!b.lignes.some((l) => l.classe === 'non' && /not read/.test(l.texte) && l.texte.includes(bas(P)))) ko.push('B : aucune ligne rouge « not read » nommant la pool');
  /* (C) */
  const c = await mod.lireSurete({ rpc: rpcDe({ paire: false }), jeton: J, chaine: 8453, clesExactes: [] });
  if (!c.lignes.some((l) => l.classe === 'non' && /does not pair/.test(l.texte))) ko.push('C : une pool qui n apparie pas l action a l USDC passe sans le dire');
  if (/0\.1 % lost/.test(c.resume)) ko.push('C : un aller-retour dit sur une pool qui n est pas la sienne');
  /* (D) temoin */
  const H = '0xb2' + '00'.repeat(17) + 'beef';
  const d = await mod.lireSurete({ rpc: rpcDe(), jeton: H, chaine: 8453, clesExactes: [] });
  if (!/no pool found/.test(d.resume)) ko.push('D (temoin) : un jeton sans pool connue ne dit plus « no pool found » (' + d.resume + ')');
  /* (E) route servie hors table */
  const P2 = '0x' + '5e'.repeat(20);
  const e = await mod.lireSurete({ rpc: rpcDe({ pool: P2 }), jeton: J, chaine: 8453, clesExactes: [], poolAerodrome: { pool: P2, tickSpacing: 10, source: 'route' } });
  const te = e.lignes.map((l) => l.texte).join(' | ');
  if (!te.includes(P2) || /no pool found/.test(e.resume)) ko.push('E : la route servie passee par l app n est pas lue (' + e.resume + ')');
  return ko;
}

let n = 0;
const vu = (cond, m) => { if (!cond) { console.log('KO ' + m); process.exitCode = 1; } n += 1; };
const SRC = fs.readFileSync(path.join(ICI, 'brain-os.js'), 'utf8');
const ko = await verifier(await import(pathToFileURL(path.join(ICI, 'brain-os.js')).href));
if (ko.length) console.log('  ' + ko.join('\n  '));
vu(ko.length === 0, 'lireSurete : la pool Aerodrome de l echange est lue et nommee ; jamais « no pool found » quand elle existe ; refus dit ; temoin inchange');

/* l app passe la route servie (hors table) a la lecture, et la meme fonction sert la ligne avant signature et la commande « safety » */
const APP = fs.readFileSync(path.join(ICI, 'app.html'), 'utf8');
const bc = APP.slice(APP.indexOf('async function bcSureteDe('), APP.indexOf('async function bcCommandeSafety('));
vu(/poolAerodrome/.test(bc), 'app.html bcSureteDe passe poolAerodrome (route servie hors table)');

const MUTANTS = [
  ['la pool Aerodrome n est plus lue', 'const aeroP = aero ? lireAerodrome({ rpc, jeton: a, pool: aero.pool, tickSpacing: aero.tickSpacing }) : null;', 'const aeroP = null;'],
  ['le v4 introuvable redit « no pool found » malgre la pool', "morceaux.push(aero ? 'no pool on Uniswap' : 'no pool found');", "morceaux.push('no pool found');"],
  ['la paire n est plus verifiee', 'if (!ra.paire) {', 'if (false) {'],
  ['un refus de lecture se tait', "morceauxAero.push('its Aerodrome pool not read');", "morceauxAero.push('');"],
  ['la route servie est ignoree', 'routeValide(poolAerodrome) || actionMesuree(a)', 'actionMesuree(a)'],
];
let tues = 0;
for (const [nom, de, vers] of MUTANTS) {
  if (SRC.split(de).length !== 2) { vu(false, 'mutant « ' + nom + ' » : ancre absente ou multiple'); continue; }
  const f = path.join(ICI, '.mutant-brain-os-' + process.pid + '-' + tues + '.mjs');
  fs.writeFileSync(f, SRC.replace(de, vers));
  let k;
  try { k = await verifier(await import(pathToFileURL(f).href)); } catch (e) { k = ['import : ' + e.message]; } finally { fs.unlinkSync(f); }
  if (process.env.VERBEUX) console.log('  [mutant] ' + nom + ' -> ' + String(k[0]).slice(0, 160));
  vu(k.length > 0, 'mutant « ' + nom + ' » : ROUGE');
  if (k.length) tues += 1;
}
if (process.exitCode) { console.log('KO surete-route'); process.exit(1); }
console.log('ok surete-route - ' + n + ' assertions, ' + tues + '/' + MUTANTS.length + ' mutants tues ; NE PROUVE PAS la cause du « not read » de TSLAc dans l app');
