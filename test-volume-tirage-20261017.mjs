/* test-volume-tirage-20261017.mjs - LE TICKET QUOTIDIEN VIENT D UN VOLUME PROUVE DANS LE RECU, ET LE CALENDRIER JOUR/SEMAINE/MOIS EST EXACT.
 * AFFIRME : (1) poolIdDe(UNIT/ETH, hook 7030) = 0x79a40c32… (l id de la pool INITIALISEE lue sur Base le 2026-10-17, StateView) ;
 *   (2) UNIT : seuls les Swap EMIS PAR LE POOLMANAGER sur NOS pools comptent, |amount0| signe decode ; un Swap d une autre pool, ou imite
 *   par un autre contrat, ne compte pas ; (3) actions : Transfer du jeton depuis/vers le payeur seulement ; (4) payeur = sender v0.8, et un
 *   recu echoue / d une autre tx est refuse ; (5) jourDe/moisDe/joursEntre/entreesPeriode : bornes UTC, seuil 10 $, une entree par jour qualifie. */
import { strict as assert } from 'node:assert';
import { volumeVerifie, poolIdDe, TOPIC_SWAP_V4, TOPIC_TRANSFER } from './volume-tirage.js';
import { jourDe, moisDe, joursEntre, entreesPeriode, crediter, SEUIL_VOLUME_JOUR_USD, saisonDe } from './tirage-saison.js';
import { HOOK_7030 } from './tokenomics.js';
let n = 0;
const vu = (c, m) => { assert.ok(c, m); n += 1; };
const UNIT = '0xb2000000000000000000007afa7ed748b0874f27'; /* symbol() = UNIT lu sur Base le 2026-10-17 */
const PM = '0x498581ff718922c3f8e6a244956af099b2652b2b';
const ID_UNIT = poolIdDe({ currency0: '0x' + '0'.repeat(40), currency1: UNIT, fee: 0, tickSpacing: 200, hooks: HOOK_7030 });
vu(ID_UNIT === '0x79a40c325329a45db0874896a0ecd6f24ca2df12e1deb909bdfb3e5045b1c321', 'poolIdDe(UNIT/ETH, 7030) = la pool initialisee lue sur Base (' + ID_UNIT + ')');
const JOUEUR = '0x' + 'b0'.repeat(20), H = '0x' + '77'.repeat(32), AAPL = '0x' + 'a1'.repeat(20);
const w = (v) => { let x = BigInt(v); if (x < 0n) x += 1n << 256n; return x.toString(16).padStart(64, '0'); };
const swap = (emetteur, id, a0) => ({ address: emetteur, topics: [TOPIC_SWAP_V4, id, '0x' + '0'.repeat(64)], data: '0x' + w(a0) + w(-5) + w(1) + w(1) + w(0) + w(0) });
const tr = (jeton, de, vers, m) => ({ address: jeton, topics: [TOPIC_TRANSFER, '0x' + de.slice(2).padStart(64, '0'), '0x' + vers.slice(2).padStart(64, '0')], data: '0x' + w(m) });
const io = (logs, from = JOUEUR, status = '0x1') => ({ tx: { hash: H, from }, recu: { status, transactionHash: H, logs }, poolManager: PM, poolsUnit: new Set([ID_UNIT]), jetonsActions: new Set([AAPL]) });
/* (2) */
const v1 = volumeVerifie(io([swap(PM, ID_UNIT, -3n * 10n ** 15n)]));
vu(v1.ok && v1.unitWei === (3n * 10n ** 15n).toString() && v1.payeur === JOUEUR, 'Swap PM sur notre pool UNIT : |amount0| negatif decode (0,003 ETH)');
vu(volumeVerifie(io([swap(PM, '0x' + '12'.repeat(32), 10n ** 18n)])).unitWei === '0', 'Swap d une AUTRE pool : 0');
vu(volumeVerifie(io([swap('0x' + '66'.repeat(20), ID_UNIT, 10n ** 18n)])).unitWei === '0', 'Swap IMITE (emis par un autre contrat que le PoolManager) : 0');
/* (3) */
const v3 = volumeVerifie(io([tr(AAPL, JOUEUR, '0x' + 'cc'.repeat(20), 5n * 10n ** 8n), tr(AAPL, '0x' + 'dd'.repeat(20), '0x' + 'ee'.repeat(20), 10n ** 12n)]));
vu(v3.actions.length === 1 && v3.actions[0].jeton === AAPL && v3.actions[0].montant === (5n * 10n ** 8n).toString(), 'action : seul le Transfer DU payeur compte');
vu(volumeVerifie(io([tr('0x' + '99'.repeat(20), JOUEUR, PM, 10n ** 20n)])).actions.length === 0, 'jeton hors liste : 0');
/* (4) */
const EP8 = '0x4337084d9e255ff0702461cf8895ce9e3b5ff108', UO = '0x49628fd1471006c1482da88028e9ce4dbb080b815c9b0344d39e5a8e6ec1419f';
const SENDER = '0x' + '5e'.repeat(20);
const v4 = volumeVerifie(io([{ address: EP8, topics: [UO, '0x' + '0'.repeat(64), '0x' + SENDER.slice(2).padStart(64, '0'), '0x' + '0'.repeat(64)], data: '0x' }, swap(PM, ID_UNIT, 10n ** 16n)], '0x' + '43'.repeat(20)));
vu(v4.ok && v4.payeur === SENDER, 'smart wallet v0.8 : le volume est credite au sender, pas au bundler');
vu(volumeVerifie(io([swap(PM, ID_UNIT, 1)], JOUEUR, '0x0')).etat === 'REFUSE', 'tx echouee : REFUSE');
vu(volumeVerifie({ ...io([]), recu: { status: '0x1', transactionHash: '0x' + '88'.repeat(32), logs: [] } }).etat === 'REFUSE', 'recu d une autre tx : REFUSE');
/* (5) */
const t = Date.UTC(2026, 9, 17, 23, 59, 59);
vu(jourDe(t).id === 'J2026-10-17' && jourDe(t + 1000).id === 'J2026-10-18', 'jourDe : bornes UTC a minuit');
vu(moisDe(t).id === 'M2026-10' && moisDe(Date.UTC(2026, 9, 31, 23, 59)).fin === Date.UTC(2026, 10, 1), 'moisDe : octobre finit le 1er novembre 00:00 UTC');
const s = saisonDe(t);
vu(joursEntre(s.debut, s.fin).length === 7 && joursEntre(s.debut, s.fin)[0] === 'J2026-10-12', 'la semaine S0 = 7 jours depuis le lundi 12');
let e = {};
e = crediter(e, { saison: 'J2026-10-13', payeur: JOUEUR, hash: '0x' + '01'.repeat(32), usd: 6 });
e = crediter(e, { saison: 'J2026-10-13', payeur: JOUEUR, hash: '0x' + '02'.repeat(32), usd: 4.5 });
e = crediter(e, { saison: 'J2026-10-14', payeur: JOUEUR, hash: '0x' + '03'.repeat(32), usd: 9.99 });
e = crediter(e, { saison: 'J2026-10-15', payeur: AAPL, hash: '0x' + '04'.repeat(32), usd: 50 });
const ent = entreesPeriode(e, joursEntre(s.debut, s.fin));
vu(SEUIL_VOLUME_JOUR_USD === 10 && ent.length === 2 && ent.some((x) => x.adresse === JOUEUR && x.jour === 'J2026-10-13') && !ent.some((x) => x.jour === 'J2026-10-14'),
  '10,5 $ le 13 qualifie, 9,99 $ le 14 non ; 50 $ = UNE entree (pas plus) (' + JSON.stringify(ent) + ')');
console.log('ok volume-tirage - ' + n + ' assertions');
