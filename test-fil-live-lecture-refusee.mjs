/* test-fil-live-lecture-refusee.mjs — UNE LECTURE REFUSEE N EST PAS UN ZERO.
 *
 * ⛔⛔ 2026-10-09 (capture du fondateur) : Feed > Live affichait « All 0 · Created 0 · Feed 0 · Kill 0 · Sent 0 ·
 *   Big 0 » et « reading chain blocks 52,379,831–52,379,940… ». Mesure : mainnet.base.org rendait 429
 *   « request limit reached » a TOUS les eth_getLogs (meme 1 bloc) ; il est le seul noeud de la factory et des
 *   transferts multi-adresses. Sur ces 110 blocs la factory a emis 1 B20Created (tx status 0x1) : la chaine
 *   n etait pas calme. Les puces disaient « 0 », et la phrase « reading… » cachait l alerte des refus.
 * Ce banc : rpc SIMULE (hors reseau), la vraie `evenementsLive`, les vrais `compteDePuce` / `teteNoteLive`,
 * et le cablage d app.html relu dans le source. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { evenementsLive, compteDePuce, teteNoteLive } from './fil-live.js';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const html = fs.readFileSync(path.join(ICI, 'app.html'), 'utf8').replace(/\r\n/g, '\n');
let n = 0, ko = 0;
const ok = (c, m) => { n += 1; if (c) console.log('ok  ' + m); else { ko += 1; console.log('KO  ' + m); } };

/* ── 1. les trois etats d une puce ── */
ok(compteDePuce(0, 'CREATION', new Map()).texte === '0', 'tout lu, rien trouve : « 0 »');
ok(compteDePuce(3, 'CREATION', new Map()).texte === '3', 'tout lu : le compte');
ok(compteDePuce(0, 'CREATION', new Map([['creations', 1]])).texte === '?', 'creations refusees : Created dit « ? », pas « 0 »');
ok(compteDePuce(2, 'CREATION', new Map([['creations', 1]])).texte === '≥2', 'lu en partie : « ≥2 » (un plancher)');
/* ⛔ 2026-10-09 (revue adverse) : CORRIGE. Feed lit les echanges des blocks SUIVIS, qui viennent des creations lues : un refus de
 *   creations laisse des blocks non suivis, donc Feed n est pas un zero mesure. L assertion d avant disait l inverse. */
ok(compteDePuce(0, 'ACHAT', new Map([['creations', 1]])).texte === '?', 'un refus de creations TOUCHE Feed (blocks non suivis)');
ok(compteDePuce(0, 'GM', new Map([['creations', 1]])).texte === '?', 'un refus de creations touche Sent');
ok(compteDePuce(0, 'MESSAGE', new Map([['creations', 1]])).texte === '0', 'MESSAGE (lu au wallet des frais) ne depend pas des creations');
ok(compteDePuce(0, 'ACHAT', new Map([['decouverte', 1]])).texte === '?', 'decouverte des pools refusee : Feed « ? »');
ok(compteDePuce(0, 'MESSAGE', { 'messages USDC': 1 }).texte === '?', '« messages USDC » compte pour MESSAGE (prefixe)');
ok(compteDePuce(0, 'TOUT', new Map([['transfers', 1]])).texte === '?', 'All est touche par n importe quel refus');
ok(compteDePuce(0, 'GM', new Map([['tout', 1]])).texte === '?', 'un refus « tout » (exception) touche chaque puce');
ok(compteDePuce(0, 'GM', new Map([['transfers', 0]])).texte === '0', 'un compteur a 0 ne touche rien');
ok(teteNoteLive(0, 0) === 'Nothing happened', 'rien refuse, rien lu : « Nothing happened »');
ok(teteNoteLive(0, 3) === 'Nothing could be read', '3 refus, rien lu : jamais « Nothing happened »');
ok(teteNoteLive(5, 3) === '5 event(s)', 'des evenements : leur nombre');

/* ── 2. la vraie evenementsLive avec un noeud qui refuse la factory et les multi-adresses (429) ── */
const FACTORY = '0xb20f000000000000000000000000000000000000';
const JETON = '0xb2000000000000000000004884b426556b92883d';
const appels = [];
const rpc = async (m, p) => {
  appels.push(m);
  if (m !== 'eth_getLogs') return null;
  const adr = p[0].address;
  if (adr === FACTORY || Array.isArray(adr)) throw new Error('HTTP 429 on https://mainnet.base.org');
  return [];
};
const r = await evenementsLive({ rpc, poolManager: '0x498581fF718922c3f8e6A244956aF099B2652b2b',
  blocks: [{ jeton: JETON, sym: 'T', dec: 18 }], deBloc: 52379831, aBloc: 52379940 });
const parQuoi = new Map();
for (const f of r.fenetresRatees) parQuoi.set(f.quoi, (parQuoi.get(f.quoi) || 0) + 1);
ok(r.evenements.length === 0, 'aucun evenement lu (0)');
ok(parQuoi.get('creations') >= 1 && parQuoi.get('transfers') >= 1, 'les refus sont NOMMES : ' + [...parQuoi.keys()].join(', '));
ok(!parQuoi.has('swaps'), 'les swaps (lus) ne sont pas comptes comme refuses');
ok(compteDePuce(0, 'CREATION', parQuoi).texte === '?', 'Created : « ? » (le cas de la capture)');
ok(compteDePuce(0, 'GM', parQuoi).texte === '?', 'Sent : « ? »');
ok(compteDePuce(0, 'TOUT', parQuoi).texte === '?', 'All : « ? »');
ok(compteDePuce(0, 'ACHAT', parQuoi).texte === '?', 'Feed : « ? » — ses swaps sont lus, mais sur des blocks suivis sans les creations refusees');

/* ── 3. le cablage d app.html ── */
const fonction = (nom) => { const i = html.indexOf('function ' + nom + '('); if (i < 0) return ''; let p = 0;
  for (let k = html.indexOf('{', i); k < html.length; k++) { if (html[k] === '{') p++; else if (html[k] === '}' && --p === 0) return html.slice(i, k + 1); } return ''; };
const maj = fonction('majComptesFiltres');
ok(/compteDePuce\(n, f, liveRateesParQuoi\)/.test(maj) && /b\.textContent = b\.dataset\.nom \+ ' ' \+ c\.texte/.test(maj),
  'les puces affichent compteDePuce, pas le nombre brut');
const lire = fonction('lireLive');
ok(/'reading chain blocks '[^;]*liveRatees/.test(lire), '« reading chain blocks… » garde l alerte des refus');
ok(/noterRateesLive\(r\.fenetresRatees/.test(lire) && /noterRateesLive\(d\.fenetresRatees, 'decouverte'\)/.test(lire)
  && !/liveRatees \+=/.test(lire), 'chaque refus du fil passe par noterRateesLive (par nature)');
ok(/teteNoteLive\(liveEvts\.length, liveRatees\)/.test(fonction('peindreLive')) && !/'Nothing happened'/.test(html),
  'la note dit « Nothing happened » seulement via teteNoteLive');

/* ── 4. le cablage qui RAMENE l alerte (revue : retirer `liveRatees++` survivait, 24/24 verts) — EXECUTE, pas lu ── */
{
  const src = fonction('noterRateesLive');
  ok(src.length > 0, 'noterRateesLive trouvee');
  const fab = new Function('etat', 'const liveRateesParQuoi = etat.m; let liveRatees = 0;\n' + src
    + '\n; return (l, d) => { noterRateesLive(l, d); return { total: liveRatees, parQuoi: Object.fromEntries(liveRateesParQuoi) }; };');
  const noter = fab({ m: new Map() });
  noter([{ quoi: 'creations' }, { quoi: 'transfers' }]);
  const x = noter([{}], 'decouverte');
  ok(x.total === 3, 'chaque fenetre refusee augmente liveRatees (3 attendues, lu ' + x.total + ')');
  ok(x.parQuoi.creations === 1 && x.parQuoi.transfers === 1 && x.parQuoi.decouverte === 1, 'et son compteur PAR NATURE (le defaut nomme la nature)');
  const y = noter(null);
  ok(y.total === 3, 'une liste absente ne compte rien');
}
const lireL = fonction('lireLive');
ok(/catch[\s\S]{0,200}noterRateesLive\(\[\{ quoi: 'tout' \}\]\)/.test(html), 'une exception de la boucle Live est comptee comme refus « tout » (jamais un calme)');
ok(/b\.classList\.toggle\('vide', n === 0 && c\.etat === 'LU'\)/.test(maj), 'une puce « ? » ne prend pas le style d une puce vide');
ok(lireL.length > 0, 'lireLive trouvee');

console.log(`\n${n - ko}/${n} verts`);
if (ko) process.exit(1);
