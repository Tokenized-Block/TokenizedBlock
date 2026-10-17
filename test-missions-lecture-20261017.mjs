/* test-missions-lecture-20261017.mjs - LE TABLEAU DES MISSIONS SE LIT PAR LES VUES DU CONTRAT, ET NE DEVINE RIEN.
 * AFFIRME (EXECUTE, pur, faux noeud) : (1) selecteurs calcules (taskCount, tasks, holdOf, escrowLeft) ; (2) decodage exact d un Task de
 *   12 mots et d un Hold de 5 mots, longueur fausse -> null ; (3) etat OUVERTE / COMPLETE / EXPIREE / FERMEE ; (4) lireMissions : les
 *   plus recentes d abord, une mission illisible est rendue `lue: false` (jamais completee), borne `max` dite.
 * NE PROUVE PAS : la disposition contre le VRAI contrat (prouvee quand Grok rejoue sur fork avec l adresse deployee). */
import { strict as assert } from 'node:assert';
import { SEL, appel, decoderTache, decoderDetention, etatMission, lireMissions } from './missions-lecture.js';
import { selecteur } from './keccak.js';
let n = 0;
const vu = (c, m) => { assert.ok(c, m); n += 1; };
vu(SEL.tasks === String(selecteur('tasks(uint256)')).replace(/^0x/, '') && SEL.tasks.length === 8, 'selecteur tasks(uint256)');
vu(appel('tasks', 3) === '0x' + SEL.tasks + '3'.padStart(64, '0'), 'calldata tasks(3)');
const m = (v) => BigInt(v).toString(16).padStart(64, '0'), a = (x) => x.slice(2).padStart(64, '0');
const BLK = '0x' + 'b2'.repeat(20), AMZ = '0x' + 'aa'.repeat(20), CREA = '0x' + 'c0'.repeat(20), PM = '0x' + '49'.repeat(20);
/* claude/missions-v3 82f3570 : Task porte topic1 EN DERNIER -> 13 mots */
const tache = '0x' + [a(BLK), a(AMZ), a(AMZ), a(CREA), m(10n ** 18n), m(20), m(3), m(1), m(1800000000), a(PM), 'ab'.repeat(32), 'cd'.repeat(32), 'ef'.repeat(32)].join('');
const t = decoderTache(tache);
vu(t && t.blockToken === BLK && t.paired === AMZ && t.rewardToken === AMZ && t.creator === CREA && t.reward === '1000000000000000000' && t.maxDone === 20 && t.done === 3
  && t.perWallet === 1 && t.expiry === 1800000000 && t.target === PM && t.topic0 === '0x' + 'ab'.repeat(32) && t.topic1 === '0x' + 'ef'.repeat(32), 'Task decode exact (13 mots, topic1 en dernier)');
vu(decoderTache(tache.slice(0, -64)) === null, '12 mots (l ancien format) -> null, jamais un topic1 invente');
const h = decoderDetention('0x' + [m(50n * 10n ** 18n), m(2n * 10n ** 18n), m(0), m(0), m(86400)].join(''));
vu(h && h.minBlock === '50000000000000000000' && h.minPaired === '2000000000000000000' && h.window === 86400, 'Hold decode exact (5 mots)');
vu(etatMission(t, '5', 1700000000) === 'OUVERTE' && etatMission(t, '0', 1700000000) === 'FERMEE' && etatMission(t, '5', 1800000000) === 'EXPIREE'
  && etatMission({ ...t, done: 20 }, '5', 1700000000) === 'COMPLETE' && etatMission(null, '5', 0) === 'NON_LU', 'etats');
/* faux noeud : 3 missions, la 1 illisible */
const rpc = async (meth, [{ data }]) => {
  const s = data.slice(2, 10), i = data.length > 10 ? Number(BigInt('0x' + data.slice(10))) : null;
  if (s === SEL.taskCount) return '0x' + m(3);
  if (i === 1) throw new Error('node down');
  if (s === SEL.tasks) return tache;
  if (s === SEL.holdOf) return '0x' + [m(1), m(0), m(0), m(0), m(86400)].join('');
  if (s === SEL.escrowLeft) return '0x' + m(7);
  throw new Error('?');
};
const r = await lireMissions({ rpc, contrat: '0x' + '11'.repeat(20), max: 50, maintenant: 1700000000 });
vu(r.total === 3 && r.missions.map((x) => x.id).join(',') === '2,1,0', 'plus recentes d abord');
vu(r.missions[1].lue === false && r.missions[1].etat === 'NON_LU' && r.missions[0].lue === true && r.missions[0].escrowLeft === '7', 'illisible -> lue:false, jamais devinee');
const r2 = await lireMissions({ rpc, contrat: '0x' + '11'.repeat(20), max: 2, maintenant: 1700000000 });
vu(r2.missions.length === 2 && r2.bornee === true, 'borne max dite');
console.log('ok missions-lecture - ' + n + ' assertions ; NE PROUVE PAS la disposition contre le vrai contrat');
