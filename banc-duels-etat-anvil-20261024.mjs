/* banc-duels-etat-anvil-20261024.mjs — LA LECTURE DES DUELS PAR L ETAT contre le BYTECODE COMPILE de BlockDuels, sur un anvil LOCAL (pas un
 * fork : rien n est lu de Base), avec un noeud qui REFUSE eth_getLogs a la tranche du serveur.
 * DEROULE : JetonT (6 decimales, le jeton de test de contracts/test/BlockDuels.t.sol) et BlockDuels deployes depuis contracts/out ; deux
 *   wallets anvil jouent 8 duels, chaque appel construit par les planners de l app (duels-plan-app.js) : un gagne, une egalite, un annule,
 *   un rejoint laisse 257 blocs puis rembourse, un jamais rejoint expire puis rembourse, un rejoint REGLABLE, un ouvert, un rejoint en ATTENTE.
 *   Puis la VRAIE tranche de serveur-web.js (lireDuelsSrv + la route /api/duels) tourne contre l anvil, eth_getLogs REFUSE ; sa reponse est
 *   comparee, duel par duel et champ par champ, a lireDuels sur les VRAIS logs de l anvil (l ancien chemin, ici servi) : meme createur,
 *   jeton, mise, guess, expiration, joueur, cible, reglement (hash, scores, gagnant, gain), annule, rembourse, et meme etat.
 * Usage : "%USERPROFILE%\.foundry\bin\anvil.exe" --port 9663   puis   node banc-duels-etat-anvil-20261024.mjs [http://127.0.0.1:9663]
 * NE PROUVE PAS : le contrat LIVE (son bytecode n est pas compare ici) ni le noeud de production ; blocCree (inconnu par l etat) n est pas compare. */
import { readFileSync } from 'node:fs';
import { selecteur } from './keccak.js';
import * as APPD from './duels-plan-app.js';
import * as E from './duels-etat.js';
import { blocsPour } from './temps-de-bloc.js';

const URL_ANVIL = /^https?:/.test(process.argv[2] || '') ? process.argv[2] : 'http://127.0.0.1:9663';
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_ANVIL)) { console.log('KO anvil must be a local http address: nothing is sent'); process.exit(1); }
let n = 0, ko = 0, idRpc = 0;
const ok = (c, m) => { n += 1; if (c) console.log('ok  ' + m); else { ko += 1; console.log('KO  ' + m); } return !!c; };
const rpc = async (method, params = []) => {
  const r = await fetch(URL_ANVIL, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: ++idRpc, method, params }) }).then((x) => x.json());
  if (r.error) throw new Error(method + ': ' + r.error.message);
  return r.result;
};
const bas = (x) => String(x || '').toLowerCase();
const mot = (x) => BigInt(x).toString(16).padStart(64, '0');
const adrMot = (a) => bas(a).slice(2).padStart(64, '0');
const hex = (v) => '0x' + BigInt(v).toString(16);
async function recu(h) { for (let i = 0; i < 100; i += 1) { const r = await rpc('eth_getTransactionReceipt', [h]); if (r) return r; await new Promise((o) => setTimeout(o, 50)); } throw new Error('no receipt ' + h); }
const envoyer = async (de, a) => { const r = await recu(await rpc('eth_sendTransaction', [{ from: de, to: a.to, data: a.data, gas: hex(800000) }])); if (r.status !== '0x1') throw new Error('status ' + r.status + ' : ' + (a.quoi || a.data.slice(0, 10))); return r; };
const deployer = async (de, code) => { const r = await recu(await rpc('eth_sendTransaction', [{ from: de, data: code, gas: hex(6000000) }])); if (r.status !== '0x1' || !r.contractAddress) throw new Error('deploy failed'); return bas(r.contractAddress); };
const art = (p) => JSON.parse(readFileSync(new URL('./contracts/out/' + p, import.meta.url), 'utf8')).bytecode.object;
const bloc = async () => parseInt(await rpc('eth_blockNumber'), 16);
const ts = async () => parseInt((await rpc('eth_getBlockByNumber', ['latest', false])).timestamp, 16);

/* 0. le deploiement local */
const [A, B, TIERS, DEV, POOL] = (await rpc('eth_accounts')).map(bas);
const chaine = parseInt(await rpc('eth_chainId'), 16);
if (!ok(chaine !== 8453, 'anvil LOCAL (chaine ' + chaine + ', pas Base)')) process.exit(1);
const JETON = await deployer(A, art('BlockDuels.t.sol/JetonT.json') + mot(6));
const C = await deployer(A, art('BlockDuels.sol/BlockDuels.json') + adrMot(JETON) + adrMot(DEV) + adrMot(POOL) + adrMot(A));
ok(BigInt(await rpc('eth_call', [{ to: C, data: selecteur('nextId()') }, 'latest'])) === 1n, 'BlockDuels compile deploye (' + C + '), nextId() = 1 avant tout duel');
for (const w of [A, B]) await envoyer(A, { to: JETON, data: selecteur('mint(address,uint256)') + adrMot(w) + mot(1_000_000_000n) });

const MISE = 5_000_001n;
const creer = async (qui, guess, expiresIn = 3600) => { const p = APPD.planCreate({ contrat: C, token: JETON, stake: MISE, guess, expiresIn }); let r; for (const a of p.appels) r = await envoyer(qui, a); return APPD.lireEvenementsDuel(r.logs, C).find((x) => x.type === 'CREATED').id; };
const rejoindre = async (qui, id, guess) => {
  const d = { id, creator: A, token: JETON, stake: MISE, expiresAt: (await ts()) + 3000, joiner: null };
  const p = APPD.planJoin({ contrat: C, duel: d, guess, moi: qui, maintenant: await ts() });
  for (const a of p.appels) await envoyer(qui, a);
};
const ids = {};
/* 1. un duel GAGNE (le hash n est pas choisi : une egalite est rejouee, 8 essais au plus ; les egalites restent dans la liste, comparees aussi) */
for (let essai = 0; essai < 8; essai += 1) {
  const gA = [0, 1, 2, 3, 4].map((v, i) => (v + essai) % APPD.TAILLES[i]), gB = gA.map((v, i) => (v + 1) % APPD.TAILLES[i]);
  const id = await creer(A, gA); await rejoindre(B, id, gB); await rpc('anvil_mine', ['0x2']);
  const r = await envoyer(TIERS, APPD.planSettle({ contrat: C, id }).appels[0]);
  const s = APPD.lireEvenementsDuel(r.logs, C).find((e) => e.type === 'SETTLED');
  if (s && s.payout > 0n) { ids.regle = id; break; }
  ids['egaliteAuHasard' + essai] = id;
}
if (!ok(!!ids.regle, 'un duel GAGNE obtenu (#' + ids.regle + ')')) process.exit(1);
/* 2. egalite garantie */
ids.egalite = await creer(A, [3, 4, 5, 6, 7]); await rejoindre(B, ids.egalite, [3, 4, 5, 6, 7]); await rpc('anvil_mine', ['0x2']);
await envoyer(TIERS, APPD.planSettle({ contrat: C, id: ids.egalite }).appels[0]);
/* 3. annule */
ids.annule = await creer(A, [1, 1, 1, 1, 1]); await envoyer(A, APPD.planCancel({ contrat: C, id: ids.annule }).appels[0]);
/* 4. rejoint, 257 blocs, rembourse */
ids.rembJoint = await creer(A, [2, 2, 2, 2, 2]); await rejoindre(B, ids.rembJoint, [0, 0, 0, 0, 0]); await rpc('anvil_mine', [hex(260)]);
await envoyer(TIERS, APPD.planRefund({ contrat: C, id: ids.rembJoint }).appels[0]);
/* 5. jamais rejoint, expire, rembourse */
ids.rembOuvert = await creer(A, [4, 4, 4, 4, 4], 600); await rpc('evm_increaseTime', [601]); await rpc('evm_mine', []);
await envoyer(TIERS, APPD.planRefund({ contrat: C, id: ids.rembOuvert }).appels[0]);
/* 6. rejoint, REGLABLE */
ids.reglable = await creer(A, [5, 5, 5, 5, 5]); await rejoindre(B, ids.reglable, [0, 9, 18, 8, 7]); await rpc('anvil_mine', ['0x3']);
/* 7. ouvert */
ids.ouvert = await creer(A, [0, 0, 0, 0, 1]);
/* 8. rejoint, ATTENTE (la cible n est pas passee) */
ids.attente = await creer(A, [1, 2, 3, 4, 0]); await rejoindre(B, ids.attente, [2, 3, 4, 5, 6]);
const nCrees = Object.keys(ids).length;
ok(BigInt(await rpc('eth_call', [{ to: C, data: selecteur('nextId()') }, 'latest'])) === BigInt(nCrees + 1), nCrees + ' duels joues sur le bytecode compile (nextId = ' + (nCrees + 1) + ')');

/* 2. la VRAIE tranche du serveur, eth_getLogs REFUSE */
const SRV = readFileSync(new URL('./serveur-web.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const tranche = (t, a, b) => { const i = t.indexOf(a), j = t.indexOf(b, i + 1); if (!(i > 0 && j > i)) throw new Error('tranche introuvable : ' + a); return t.slice(i, j); };
const srcLecteur = tranche(SRV, '/* ══ LES DUELS LUS SUR LA CHAINE (2026-10-18', "setInterval(() => { if (contratDuels()) void lireDuelsSrv(); }");
const srcRoute = tranche(SRV, "if (chemin === '/api/duels') {", '/* ══ BLOCK MISSIONS');
let getLogsDemandes = 0;
const rpcSansLogs = async (m, p) => { if (m === 'eth_getLogs') { getLogsDemandes += 1; throw new Error('request limit reached'); } return rpc(m, p); };
const f = new Function('DUELS_DEPLOIEMENT', 'rpcServeur', 'blocsPour', 'sParBlocSrv', 'TAILLE_LOGS_DUELS', 'filtreLogsDuels', 'lireDuels', 'duelEnJson', 'partageDuel', 'MISE_MIN_DUEL',
  'EXP_MIN_DUEL', 'EXP_MAX_DUEL', 'FINIS_DUEL', 'etatDuelSrv', 'regleurCouvre', 'regleurSlots', 'createurParBlock',
  'appelNextIdEtat', 'appelDuelEtat', 'lireNextIdDuels', 'duelDepuisEtat', 'reglerDepuisHash', 'idsDuelsATour',
  srcLecteur + '\nasync function route(req, res, chemin) {\n' + srcRoute + '\n}\nreturn { lireDuelsSrv, duelsSrv, route };');
const x = f({ adresse: C, bloc: 1, chaine, constructeur: { usdc: JETON, devWallet: DEV, rewardPool: POOL } }, rpcSansLogs, blocsPour, async () => 2, APPD.TAILLE_FENETRE_LOGS, APPD.filtreLogsDuels,
  APPD.lireDuels, APPD.duelEnJson, APPD.partage, APPD.MISE_MIN, APPD.EXPIRATION_MIN_S, APPD.EXPIRATION_MAX_S, APPD.FINIS, APPD.etatDuel, APPD.regleurCouvre,
  { etat: () => ({ etat: 'OFF', adresse: null, contrats: [] }) }, new Map(), E.appelNextIdEtat, E.appelDuelEtat, E.lireNextId, E.duelDepuisEtat, E.reglerDepuisHash, E.idsDuelsATour);
await x.lireDuelsSrv();
const res = { corps: null, writeHead() {}, end(s) { this.corps = s; } };
await x.route({ method: 'GET' }, res, '/api/duels');
const j = JSON.parse(res.corps);
ok(j.ok === true && j.etat === 'LU' && getLogsDemandes === 0, '/api/duels sur l anvil, eth_getLogs refuse : LU, ' + getLogsDemandes + ' getLogs demande (lu : ' + j.etat + (j.pourquoi ? ', ' + j.pourquoi : '') + ')');

/* 3. la reference : lireDuels sur les VRAIS logs de l anvil (servis ici) */
const tete = await bloc(), maintenant = await ts();
const logs = await rpc('eth_getLogs', [APPD.filtreLogsDuels({ contrat: C, de: 0, a: tete })]);
const ref = APPD.lireDuels({ logs, contrat: C }).duels;
const servis = new Map([...(j.duels || []), ...(j.recents || [])].map((o) => [o.id, { d: APPD.duelDepuisJson(o), etat: o.etat }]));
ok(ref.size === nCrees && servis.size === nCrees, 'logs : ' + ref.size + ' duels ; etat : ' + servis.size + ' duels servis');
const champs = ['creator', 'token', 'stake', 'guessA', 'expiresAt', 'joiner', 'guessB', 'targetBlock', 'settled', 'cancelled', 'refunded'];
const texte = (v) => JSON.stringify(v, (_, y) => (typeof y === 'bigint' ? y.toString() : y));
for (const [nom, id] of Object.entries(ids)) {
  const r = ref.get(String(id)), s = servis.get(String(id));
  const diff = !s || !s.d ? ['absent'] : champs.filter((k) => texte(r[k]) !== texte(s.d[k]));
  const eRef = APPD.etatDuel(r, tete, maintenant).etat, eSrv = s && s.d ? APPD.etatDuel(s.d, tete, maintenant).etat : null;
  ok(diff.length === 0 && eRef === eSrv, '#' + id + ' (' + nom + ') : etat = logs, champ par champ' + (diff.length ? ' -- DIFFERENT : ' + diff.map((k) => k + ' logs ' + texte(r[k]) + ' / etat ' + texte(s && s.d && s.d[k])).join(' ; ') : '') + ' ; etat ' + eSrv + (eRef !== eSrv ? ' (logs : ' + eRef + ')' : ''));
}
const attendus = { regle: 'REGLE', egalite: 'REGLE', annule: 'ANNULE', rembJoint: 'REMBOURSE', rembOuvert: 'REMBOURSE', reglable: 'REGLABLE', ouvert: 'OUVERT', attente: 'ATTENTE' };
for (const k of Object.keys(ids)) if (k.startsWith('egaliteAuHasard')) attendus[k] = 'REGLE';
ok(Object.entries(attendus).every(([k, e]) => (servis.get(String(ids[k])) || {}).etat === e), 'les 8 etats attendus : ' + Object.keys(attendus).map((k) => k + '=' + (servis.get(String(ids[k])) || {}).etat).join(', '));
ok(servis.get(String(ids.egalite)).d.settled.winner === '0x' + '0'.repeat(40) && servis.get(String(ids.egalite)).d.refunded === true, 'egalite : winner nul et refunded, comme Settled + Refunded des logs');
{ const s = servis.get(String(ids.regle)).d.settled; ok([A, B].includes(s.winner) && s.payout === APPD.partage(MISE).gagnant && s.scoreA !== s.scoreB, 'gagne : gagnant ' + (s.winner === A ? 'A' : 'B') + ' (' + s.scoreA + '-' + s.scoreB + '), gain ' + s.payout + ' = 90 % du pot, recalcules depuis le hash du bloc cible'); }
console.log((ko ? 'ECHEC ' : 'ok ') + 'banc-duels-etat-anvil - ' + n + ' assertions, ' + ko + ' KO ; anvil local ' + URL_ANVIL + ', bytecode compile, rien sur Base');
process.exit(ko ? 1 : 0);
