/* test-sent-relecture-20261011.mjs - « SENT » NE PERD PLUS UNE FENETRE REFUSEE (Phil, 2026-10-11 : capture « Sent ? » · « None of the 2206
 * events read matches this filter » — « faut pas casser le Sent », « fix it »).
 * MESURE en prod avant le correctif : base.drpc.org rendait 2 lectures d envois (42 et 15 transferts) puis 429 « Public endpoint rate
 *   limit » ; la fenetre refusee n etait jamais relue (ses envois perdus, la puce « ? » pour toujours) ; une fois la page lisible, la meme
 *   puce a dit « Sent ≥10 » : le classement marchait, c est la lecture refusee qui etait perdue.
 * AFFIRME (EXECUTE) :
 *   A. fil-live.transfertsLive : un refus rend une fenetre qui PORTE son lot d adresses ; relue avec ce lot, elle rend le GM ; les filtres
 *      d avant restent (creation, jambe PoolManager, transaction de swap, gros mouvement) ; evenementsLive rend toujours le GM (meme fonction).
 *   B. app.html relireTransfertsRefuses (extrait et execute avec des bouchons) : une fenetre relue avec succes fait entrer son GM et RETIRE
 *      son refus (« ? » -> nombre) ; encore refusee : gardee, comptee une fois ; jamais relue si ses ECHANGES ont ete refuses ; 2 au plus par
 *      tour ; appelee par lireLive ; noterRateesLive garde les fenetres d envois et d echanges.
 * NE PROUVE PAS : le debit reel des noeuds publics (la relecture peut encore etre refusee : la puce le dit alors). */
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { transfertsLive, evenementsLive } from './fil-live.js';
import { TOPIC_TRANSFER } from './index-blocks.js';
let n = 0;
const vu = (c, m) => { assert.ok(c, m); n += 1; };
const PM = '0x498581ff718922c3f8e6a244956af099b2652b2b';
const J1 = '0xb200000000000000000000e4b0c5fbe9c8df579e', J2 = '0xb200000000000000000000baa5356bfc210cc30a';
const t32 = (a) => '0x' + '0'.repeat(24) + a.slice(2);
const v32 = (v) => '0x' + BigInt(v).toString(16).padStart(64, '0');
const ALICE = '0x' + 'a1'.repeat(20), BOB = '0x' + 'b0'.repeat(20), ZERO = '0x' + '0'.repeat(40);
const log = (jeton, de, a, v, tx, i = 0) => ({ address: jeton, topics: [TOPIC_TRANSFER, t32(de), t32(a)], data: v32(v), blockNumber: '0x64', transactionHash: tx, logIndex: '0x' + i.toString(16) });
const LOGS = [
  log(J1, ALICE, BOB, 5n * 10n ** 18n, '0xaa01'),                 /* un vrai envoi : GM */
  log(J1, ZERO, ALICE, 10n ** 27n, '0xaa02', 1),                  /* creation */
  log(J1, PM, ALICE, 3n * 10n ** 18n, '0xaa03', 2),               /* jambe PoolManager */
  log(J1, BOB, ALICE, 2n * 10n ** 18n, '0xaa04', 3),              /* routeur tiers dans une tx de swap */
  log(J2, ALICE, BOB, 2n * 10n ** 24n, '0xaa05', 4),              /* gros mouvement (> 1 M) */
  log(J2, ALICE, BOB, 0n, '0xaa06', 5),                           /* note (transfert de 0) */
];
const blocks = [{ jeton: J1, sym: 'IB022', dec: 18 }, { jeton: J2, sym: 'SS7', dec: 18 }];
/* ── A ── */
let refuser = true, appels = 0;
const rpc = async (methode, params) => {
  if (methode !== 'eth_getLogs') throw new Error('unexpected ' + methode);
  appels += 1;
  if (refuser) throw new Error('You reached Public endpoint rate limit, please upgrade to paid plan');
  const adr = [].concat(params[0].address).map((x) => x.toLowerCase());
  return LOGS.filter((l) => adr.includes(l.address));
};
const r1 = await transfertsLive({ rpc, poolManager: PM, blocks, deBloc: 100, aBloc: 150, txSwaps: new Set(['0xaa04']) });
vu(r1.evenements.length === 0 && r1.fenetresRatees.length === 1, 'A refus : aucune fausse donnee, une fenetre refusee');
const f = r1.fenetresRatees[0];
vu(f.quoi === 'transfers' && f.de === 100 && f.a === 150 && Array.isArray(f.adresses) && f.adresses.includes(J1) && f.adresses.includes(J2), 'A la fenetre refusee porte son lot d adresses (pour la relire) : ' + JSON.stringify(f));
refuser = false;
const r2 = await transfertsLive({ rpc, poolManager: PM, blocks, deBloc: f.de, aBloc: f.a, txSwaps: new Set(['0xaa04']), jetons: f.adresses });
const types = r2.evenements.map((e) => e.type + ':' + e.tx).sort();
vu(r2.fenetresRatees.length === 0 && JSON.stringify(types) === JSON.stringify(['GM:0xaa01', 'NOTE:0xaa06']), 'A relue : le GM et la note seulement (creation, PoolManager, tx de swap, gros mouvement ecartes) : ' + JSON.stringify(types));
vu(r2.evenements.find((e) => e.type === 'GM').quantite === '5', 'A le montant du GM est lu (5)');
const r3 = await transfertsLive({ rpc, poolManager: PM, blocks, deBloc: 100, aBloc: 150, jetons: [J2] });
vu(r3.evenements.every((e) => e.jeton === J2), 'A `jetons` limite la relecture a CE lot');
const ev = await evenementsLive({ rpc: async (m, p) => (m === 'eth_getLogs' && p[0].topics && p[0].topics[0] === TOPIC_TRANSFER && Array.isArray(p[0].address) ? rpc(m, p) : []), poolManager: PM, blocks, deBloc: 100, aBloc: 150, lireCreations: async () => ({ creations: [], fenetresRatees: [] }) });
vu(ev.evenements.some((e) => e.type === 'GM' && e.tx === '0xaa01'), 'A evenementsLive rend toujours le GM (meme fonction, pas de jumeau)');
/* ── B ── */
const html = readFileSync(process.env.TB_APP || new URL('./app.html', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const i0 = html.indexOf('async function relireTransfertsRefuses(');
vu(i0 > 0, 'app.html n a pas relireTransfertsRefuses');
const fin = html.indexOf('\n}\n', i0) + 3;
vu(/if \(sens !== 'ancien'\) \{ try \{ await relireTransfertsRefuses\(\); \}/.test(html), 'lireLive n appelle pas la relecture');
vu(/if \(q === 'transfers' && [^\n]*liveTransfertsARelire\.push\(\{ de: f\.de, a: f\.a, adresses: f\.adresses \}\)/.test(html) && /if \(q === 'swaps' && [^\n]*liveSwapsRefuses\.push/.test(html), 'noterRateesLive ne garde pas les fenetres a relire');
const executer = async ({ aRelire, swapsRefuses, ratees, evts, stub }) => {
  const env = { liveTransfertsARelire: aRelire, liveSwapsRefuses: swapsRefuses, liveRateesParQuoi: ratees, liveEvts: evts, liveRatees: [...ratees.values()].reduce((a, b) => a + b, 0) };
  const fn = new Function('V4_ADRESSES', 'CHAINE', 'blocksSuivisLive', 'transfertsLive', 'rpc', 'cleEvtLive', 'env',
    'let { liveTransfertsARelire, liveSwapsRefuses, liveRateesParQuoi, liveEvts, liveRatees } = env;\n' + html.slice(i0, fin)
    + '\nreturn relireTransfertsRefuses().then((r) => { env.liveRatees = liveRatees; return r; });');
  const r = await fn({ 8453: { poolm: PM } }, 8453, () => blocks, stub, rpc, (e) => e.type + ':' + e.tx + ':' + e.jeton + ':' + (e.logIndex ?? ''), env);
  return { r, env };
};
const ok = async (a) => transfertsLive({ ...a, rpc });
let x = await executer({ aRelire: [{ de: 100, a: 150, adresses: [J1, J2] }], swapsRefuses: [], ratees: new Map([['transfers', 1]]), evts: [], stub: ok });
vu(x.r === 1 && x.env.liveTransfertsARelire.length === 0 && !x.env.liveRateesParQuoi.has('transfers') && x.env.liveRatees === 0 && x.env.liveEvts.some((e) => e.type === 'GM'),
  'B relue avec succes : le GM entre, la fenetre sort, son refus est RETIRE (« ? » -> nombre)');
x = await executer({ aRelire: [{ de: 100, a: 150, adresses: [J1] }], swapsRefuses: [], ratees: new Map([['transfers', 3]]), evts: [], stub: async (a) => ({ evenements: [], fenetresRatees: [{ quoi: 'transfers' }] }) });
vu(x.r === 0 && x.env.liveTransfertsARelire.length === 1 && x.env.liveRateesParQuoi.get('transfers') === 3, 'B encore refusee : gardee, comptee une seule fois');
let appele = false;
x = await executer({ aRelire: [{ de: 100, a: 150, adresses: [J1] }], swapsRefuses: [{ de: 140, a: 160 }], ratees: new Map([['transfers', 1], ['swaps', 1]]), evts: [], stub: async () => { appele = true; return { evenements: [], fenetresRatees: [] }; } });
vu(!appele && x.env.liveTransfertsARelire.length === 1 && x.env.liveRateesParQuoi.get('transfers') === 1, 'B fenetre dont les ECHANGES ont ete refuses : jamais relue (une jambe de swap passerait pour un envoi)');
let nAppels = 0;
x = await executer({ aRelire: [1, 2, 3, 4].map((k) => ({ de: 100 * k, a: 100 * k + 50, adresses: [J1] })), swapsRefuses: [], ratees: new Map([['transfers', 4]]), evts: [], stub: async () => { nAppels += 1; return { evenements: [], fenetresRatees: [{ quoi: 'transfers' }] }; } });
vu(nAppels === 2, 'B 2 relectures au plus par tour (le noeud est en limite de debit) : ' + nAppels);
console.log('ok sent-relecture - ' + n + ' assertions ; NE PROUVE PAS le debit reel des noeuds publics');
