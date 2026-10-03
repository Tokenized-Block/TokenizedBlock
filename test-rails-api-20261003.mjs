/* test-rails-api-20261003.mjs — NOS RAILS EXPOSES : rails-api.js + GET /api/rails/plan (serveur-web.js).
 * A. HORS RESEAU : classement des jetons, refus AVANT toute lecture, forme unique de la reponse (APPROBATIONS = deux temps,
 *    aucun swap rendu), BigInt serialises.
 * B. MUTANTS HORS RESEAU : un normaliser qui jette APPROBATIONS, un garde « meme jeton » retire — A doit les voir.
 * C. SERVEUR (faux noeud local qui refuse tout, instantanement) : 400 usage, 405, budget par IP (429 + retry-after),
 *    une AUTRE IP passe (le 429 est par IP, pas global), compteurs dans /sante, nos sondes comptees a part.
 * D. TEMOIN ON-CHAIN (lecture seule, wallet vide) : ETH > IB022 = PRET, une transaction vers le Universal Router, value =
 *    montant, aucune approbation ; IB022 > ETH = APPROBATIONS (Permit2 du block, puis routeur), aucun swap rendu.
 * ⛔ BORNE : D prouve le CHOIX du planificateur et la forme rendue, au bloc lu. Il ne prouve ni l execution ni le frais
 *   (prouves ailleurs, sur les transactions), et une simulation depuis un wallet vide ne prouve pas qu un wallet a les fonds.
 * ⛔ PORTABLE : process.exitCode, jamais process.exit (crash UV_HANDLE_CLOSING sous Windows). */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { pathToFileURL, fileURLToPath } from 'node:url';
const ICI = path.dirname(fileURLToPath(import.meta.url));
const imp = (f, dir = ICI) => import(pathToFileURL(path.join(dir, f)).href + '?v=' + Math.random());
const R = await imp('rails-api.js');
const P = await imp('paires.js');
const { ROUTEUR } = await imp('echange.js');
const { PERMIT2 } = await imp('lancer-pool.js');
let n = 0, ko = 0;
const ok = (c, m) => { n += 1; if (c) console.log('ok  ' + m); else { ko += 1; console.log('KO  ' + m); } };
const bas = (a) => String(a || '').toLowerCase();
const ETH = '0x0000000000000000000000000000000000000000';
const USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const OUSD = P.DEVISES_BASE.find((d) => d.symbole === 'OUSD').adr;
const NV = P.ACTIONS_COINBASE.find((x) => x.symbole === 'NVDAc').adr;
const IB = (fs.readFileSync(path.join(ICI, 'pool-sans-hook.js'), 'utf8').match(/'(0xb20+e4b0[0-9a-f]+)', \/\* IB022/i) || [])[1];
const VIDE = '0x' + '1'.repeat(40);

console.log('— A. hors reseau');
ok(!!IB, 'IB022 lu dans pool-sans-hook.js (' + IB + ')');
const nat = [[ETH, 'ETH'], [USDC, 'USDC'], [OUSD, 'OUSD'], [NV, 'ACTION'], [P.DEVISES_BASE.find((d) => d.symbole === 'cbBTC').adr, 'DEVISE'],
  [IB, 'BLOCK'], ['0x' + '7'.repeat(40), 'AUTRE']];
ok(nat.every(([a, attendu]) => R.natureJeton(a) === attendu), 'classement : ETH, USDC, OUSD (un B20, mais une devise), NVDAc = ACTION, cbBTC = DEVISE, IB022 = BLOCK, inconnu = AUTRE');
let lectures = 0;
const sansReseau = async () => { lectures += 1; throw new Error('no network in part A'); };
const refus = async (q) => R.planRail({ compte: VIDE, montant: '1', ...q }, { rpc: sansReseau });
const rMeme = await refus({ de: 'ETH', vers: ETH });
ok(rMeme.etat === 'REFUSE' && /same token/.test(rMeme.pourquoi), '« ETH » et 0x0 sont le meme jeton : refuse');
ok((await refus({ de: 'ETH', vers: IB.slice(0, 20) })).etat === 'REFUSE', 'adresse tronquee : refusee, jamais completee');
ok((await refus({ de: 'ETH', vers: IB, montant: '0' })).etat === 'REFUSE', 'montant 0 : refuse');
ok((await refus({ de: 'ETH', vers: IB, montant: '1.5' })).etat === 'REFUSE', 'montant non entier : refuse (unites brutes)');
ok((await refus({ de: 'ETH', vers: IB, compte: '' })).etat === 'REFUSE', 'sans le wallet qui signera : refuse');
ok(lectures === 0, 'TEMOIN : aucun de ces refus n a touche le reseau (' + lectures + ' lecture)');
const rAutre = await R.planRail({ de: 'ETH', vers: '0x' + '7'.repeat(40), montant: '1', compte: VIDE }, { rpc: sansReseau });
ok(rAutre.etat === 'REFUSE' && rAutre.route === 'ETH>AUTRE' && lectures === 0, 'un jeton hors registres et hors B20 : route nommee, refus nomme, sans lecture');
const nA = R.normaliser('BLOCK>ETH', { etat: 'APPROBATIONS', etapes: [{ nom: 'Allow Permit2', to: IB, data: '0x095ea7b3', value: '0x0' }], resume: { montantSwap: 10n ** 18n } });
ok(nA.ok === true && nA.appels.length === 0 && nA.aSigner.length === 1 && /ask for this plan again/.test(nA.suite),
  'APPROBATIONS : ok, les autorisations a signer, AUCUN swap, et la consigne de redemander');
ok(nA.resume.montantSwap === '1000000000000000000', 'BigInt serialise en chaine (JSON)');
const nP = R.normaliser('ETH>BLOCK', { etat: 'PRET', etapes: [], tx: { to: ROUTEUR[8453], data: '0x3593564c', value: '0x5' } });
ok(nP.ok && nP.appels.length === 1 && nP.aSigner.length === 1 && nP.suite === null, 'PRET : un appel, rien d autre');
const nF = R.normaliser('BLOCK>ACTION', { etat: 'PRET', exigeAtomique: true, appels: [{ to: IB, data: '0x01', role: 'approve' }, { to: USDC, data: '0x02', value: 0n }] });
ok(nF.atomique === true && nF.aSigner[0].role === 'approve' && nF.aSigner[0].value === '0x0' && nF.aSigner[1].value === '0x0',
  'lot atomique : ordre et roles gardes, value en hex (0n -> 0x0)');
ok(R.normaliser('X', { etat: 'PRET', appels: [{ to: IB, data: '0x', value: 255n }] }).appels[0].value === '0xff', 'value BigInt non nulle -> hex (255n -> 0xff), jamais en decimal');
ok(R.normaliser('X', { etat: 'NON_MESURE', pourquoi: 'node' }).ok === false && R.normaliser('X', null).ok === false, 'NON_MESURE et absence de plan : ok false');

console.log('— B. mutants hors reseau');
const src = fs.readFileSync(path.join(ICI, 'rails-api.js'), 'utf8');
const MUTANTS = [
  ['ok: etat === \'PRET\' || etat === \'APPROBATIONS\',', 'ok: etat === \'PRET\',', async (M) => M.normaliser('B>E', { etat: 'APPROBATIONS', etapes: [{ to: IB, data: '0x' }] }).ok === true],
  ['if (de === vers) return normaliser', 'if (false) return normaliser', async (M) => (await M.planRail({ de: 'ETH', vers: ETH, montant: '1', compte: VIDE }, { rpc: sansReseau })).etat === 'REFUSE' && /same token/.test((await M.planRail({ de: 'ETH', vers: ETH, montant: '1', compte: VIDE }, { rpc: sansReseau })).pourquoi)],
];
const dirM = fs.mkdtempSync(path.join(os.tmpdir(), 'tb-rails-mut-'));
for (const f of fs.readdirSync(ICI)) if (/\.js$/.test(f)) fs.copyFileSync(path.join(ICI, f), path.join(dirM, f));
for (const [motif, remplace, critere] of MUTANTS) {
  ok(src.includes(motif), 'motif present : ' + motif.slice(0, 40));
  ok(await critere(R), 'original : le critere tient (' + motif.slice(0, 30) + ')');
  fs.writeFileSync(path.join(dirM, 'rails-api.js'), src.replace(motif, remplace));
  const M = await imp('rails-api.js', dirM);
  ok(!(await critere(M)), 'MUTANT « ' + remplace.slice(0, 30) + ' » : le critere le voit');
}
fs.rmSync(dirM, { recursive: true, force: true });

console.log('— C. serveur, faux noeud local');
/* ⛔ LE FAUX NOEUD REPOND VITE ET SANS ERREUR : rpcServeur reessaie TOUTE erreur trois fois (1,8 s par lecture) — un noeud qui
 *   refusait tout faisait durer chaque plan ~1 min, et la fenetre « par minute » se remettait a zero entre deux requetes
 *   (premier passage : 200,200,200,200 — le banc mesurait l horloge, pas le budget). Ici : chaine vide, aucune pool. */
const noeud = http.createServer((req, res) => {
  let b = ''; req.on('data', (c) => { b += c; });
  req.on('end', () => {
    let id = 1, m = ''; try { const j = JSON.parse(b); id = j.id; m = j.method; } catch (_) {}
    res.writeHead(200, { 'content-type': 'application/json' });
    /* un mot nul de 32 octets : une vraie reponse (« pas de pool »), pas `0x` — que le lecteur des plans reessaie */
    res.end(JSON.stringify({ jsonrpc: '2.0', id, result: m === 'eth_blockNumber' ? '0x100000' : m === 'eth_getLogs' ? [] : '0x' + '0'.repeat(64) }));
  });
});
await new Promise((o) => noeud.listen(0, '127.0.0.1', o));
const u = 'http://127.0.0.1:' + noeud.address().port;
const vol = fs.mkdtempSync(path.join(os.tmpdir(), 'tb-rails-vol-'));
const port = 20000 + Math.floor(Math.random() * 20000);
const enfant = spawn(process.execPath, [path.join(ICI, 'serveur-web.js')], { cwd: ICI, stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, NODE_OPTIONS: '', PORT: String(port), BASE_RPC: u, BASE_RPC_LECTURE: u, RAILWAY_VOLUME_MOUNT_PATH: vol, TB_NOS_CREATEURS: '' } });
enfant.stdout.on('data', () => {}); enfant.stderr.on('data', () => {});
const base = 'http://127.0.0.1:' + port;
const obtenir = async (chemin, init = {}) => {
  const r = await fetch(base + chemin, { ...init, signal: AbortSignal.timeout(60000) });
  return { code: r.status, retry: r.headers.get('retry-after'), cors: r.headers.get('access-control-allow-origin'), corps: await r.json().catch(() => null) };
};
let pret = false;
for (let i = 0; i < 120 && !pret; i += 1) { try { pret = (await fetch(base + '/sante', { signal: AbortSignal.timeout(2000) })).ok; } catch (_) { await new Promise((o) => setTimeout(o, 500)); } }
ok(pret, 'serveur demarre (port ' + port + ')');
if (pret) {
  const usage = await obtenir('/api/rails/plan');
  ok(usage.code === 400 && /usage/.test(usage.corps.pourquoi), 'sans parametres : 400 et l usage');
  ok((await obtenir('/api/rails/plan?de=ETH&vers=' + IB + '&montant=1&compte=' + VIDE, { method: 'POST' })).code === 405, 'POST : 405');
  const q = '/api/rails/plan?de=ETH&vers=' + IB + '&montant=1000000000000&compte=' + VIDE;
  /* le budget vit dans une fenetre d une minute : on ne commence pas la sequence dans ses 15 dernieres secondes */
  const sec = new Date().getSeconds();
  if (sec > 45) await new Promise((o) => setTimeout(o, (61 - sec) * 1000));
  const s1 =await obtenir(q, { headers: { 'x-ms-monitor': '1' } });
  ok(s1.code === 200 && s1.corps.ok === false && s1.cors === '*', 'requete valide, noeud qui refuse tout : 200, ok false (jamais un plan invente), CORS ouvert');
  const codes = [];
  for (let i = 0; i < 4; i += 1) codes.push((await obtenir(q)).code);
  ok(codes.join() === '200,200,200,429', 'budget par IP (4/min) : 3 de plus passent, le 5e = 429 (' + codes.join() + ')');
  const trop = await obtenir(q);
  ok(trop.code === 429 && trop.retry === '60', '429 porte retry-after: 60');
  const autreIp = await obtenir(q, { headers: { 'x-forwarded-for': '10.0.0.2' } });
  ok(autreIp.code === 200, 'TEMOIN : une autre IP passe — le 429 est par IP, pas un mur global');
  const sante = (await obtenir('/sante')).corps;
  ok(sante && sante.rails && sante.rails.sondes === 1 && sante.rails.plans === 4 && sante.rails.trop === 2 && sante.rails.prets === 0,
    '/sante : 1 sonde a part, 4 plans, 2 refus de budget, 0 pret (' + JSON.stringify(sante && sante.rails) + ')');
}
enfant.kill();
noeud.close();
try { fs.rmSync(vol, { recursive: true, force: true }); } catch (_) {}

console.log('— D. temoin on-chain (lecture seule)');
const rpc = async (method, params) => {
  for (let e = 0; e < 6; e += 1) {
    try {
      const j = await fetch('https://mainnet.base.org', { method: 'POST', signal: AbortSignal.timeout(15000), headers: { 'content-type': 'application/json', 'x-ms-monitor': '1' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) }).then((x) => x.json());
      if (!j.error) return j.result;
      if (!/rate|limit/i.test(j.error.message)) throw new Error(j.error.message);
    } catch (x) { if (!/rate|limit|fetch|timeout|abort/i.test(String(x.message))) throw x; }
    await new Promise((o) => setTimeout(o, 800 * (e + 1)));
  }
  throw new Error('rate limit');
};
const achat = await R.planRail({ de: 'ETH', vers: IB, montant: '1000000000000', compte: VIDE }, { rpc });
ok(achat.route === 'ETH>BLOCK' && achat.via === 'planEchange' && achat.etat === 'PRET', 'ETH > IB022 : planEchange, PRET (' + achat.etat + ' ' + (achat.pourquoi || '') + ')');
ok(achat.approbations.length === 0 && achat.appels.length === 1 && bas(achat.appels[0].to) === bas(ROUTEUR[8453]) && BigInt(achat.appels[0].value) === 1000000000000n,
  'une transaction vers le Universal Router, value = le montant, aucune approbation (ETH natif)');
const vente = await R.planRail({ de: IB, vers: 'ETH', montant: '1000000000000000000', compte: VIDE }, { rpc });
ok(vente.route === 'BLOCK>ETH' && vente.etat === 'APPROBATIONS' && vente.appels.length === 0, 'IB022 > ETH, wallet vide : APPROBATIONS, aucun swap rendu (' + vente.etat + ')');
ok(vente.approbations.length === 2 && bas(vente.approbations[0].to) === bas(IB) && bas(vente.approbations[1].to) === bas(PERMIT2),
  'les deux autorisations, dans l ordre : Permit2 sur le block, puis le routeur via Permit2');
console.log(n + ' assertions, ' + ko + ' KO');
process.exitCode = ko ? 1 : 0;
