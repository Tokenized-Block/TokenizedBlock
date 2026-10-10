/* test-si-autorisation-20261010.mjs — S.I par autorisation plafonnee (Permit2), DRAPEAU OFF. Hors reseau, portable. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
const ICI = path.dirname(fileURLToPath(import.meta.url));
let n = 0, ko = 0;
const ok = (c, m) => { n += 1; if (!c) { ko += 1; console.log('KO  ' + m); } else console.log('ok  ' + m); };
const enfant = (env, code) => spawnSync(process.execPath, ['--input-type=module', '-e', code], { cwd: ICI, env: { ...process.env, ...env }, encoding: 'utf8' });
const I = "import * as S from './si-autorisation.js';";
const r0 = enfant({ SI_AUTORISATION: '' }, I + "console.log(JSON.stringify([S.SI_AUTORISATION_ACTIVE, S.messageAutorisation({}).etat]))");
ok(r0.stdout.trim() === '[false,"REFUSE"]', '1 drapeau OFF par defaut : rien n est construit (' + r0.stdout.trim() + r0.stderr.slice(0, 200) + ')');
const W = '0x' + '1'.repeat(40), X = '0x' + '2'.repeat(40), T = '0x' + '3'.repeat(40);
const code = I + `
const a = S.messageAutorisation({ jeton: '${T}', budget: '10000000000000000', parTrade: '2000000000000000', dureeS: 86400, executeur: '${X}', nonce: 0, maintenantS: 1000 });
const tr = (o) => S.tradeAdmis({ autorisation: a, depense: o.d || 0, maintenantS: o.t || 2000, trade: { type: 'swap', de: '${T}', compte: '${W}', destinataire: o.dest || '${W}', montant: o.m || '2000000000000000', ...(o.x || {}) } });
console.log(JSON.stringify({ etat: a.etat, amount: a.typedData.message.details.amount, exp: a.typedData.message.details.expiration, vc: a.typedData.domain.verifyingContract,
  trop: S.messageAutorisation({ jeton: '${T}', budget: '1', parTrade: '1', dureeS: 90000, executeur: '${X}', nonce: 0, maintenantS: 1000 }).etat,
  eth: S.messageAutorisation({ jeton: '0x' + '0'.repeat(40), budget: '1', parTrade: '1', dureeS: 60, executeur: '${X}', nonce: 0, maintenantS: 1000 }).etat,
  okT: tr({}).ok, parTrade: tr({ m: '2000000000000001' }).ok, budget: tr({ d: '9000000000000000' }).ok, expire: tr({ t: 87400 }).ok,
  levier: tr({ x: { levier: 2 } }).ok, autreDest: tr({ dest: '${X}' }).ok, pasSwap: tr({ x: { type: 'transfer' } }).ok }));`;
const r1 = enfant({ SI_AUTORISATION: '1' }, code);
let j = {}; try { j = JSON.parse(r1.stdout); } catch (_) { console.log(r1.stderr); }
ok(j.etat === 'PRET' && j.amount === '10000000000000000' && j.exp === '87400', '2 drapeau ON : PermitSingle avec amount = budget et expiration = maintenant + 24 h (plafond et duree poses SUR LA CHAINE par Permit2)');
ok(/^0x000000000022D473030F116dDEE9F6B43aC78BA3$/i.test(String(j.vc)), '2 verifyingContract = PERMIT2 du depot (lancer-pool.js)');
ok(j.trop === 'REFUSE' && j.eth === 'REFUSE', '3 duree > 24 h refusee ; ETH natif refuse (WETH d abord)');
ok(j.okT === true && j.parTrade === false && j.budget === false && j.expire === false, '4 un trade au plafond passe ; au-dela du par-trade, du budget, ou apres expiration : refuse');
ok(j.levier === false && j.autreDest === false && j.pasSwap === false, '5 SPOT seulement : levier, autre destinataire, autre chose qu un swap : refuse');
const src = fs.readFileSync(path.join(ICI, 'si-autorisation.js'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
ok(!/eth_send|sendTransaction|signTypedData|privateKey|\.sign\(|wallet_sendCalls/i.test(src), '6 le module ne signe ni n envoie rien (le wallet de la personne signe le message)');
ok(!/cerveau/i.test('si-autorisation.js'), '6 le module n est pas un module du cerveau (execution separee)');
const html = fs.readFileSync(path.join(ICI, 'app.html'), 'utf8');
ok(/const SI_AUTORISATION_ACTIVE = false;/.test(html), '7 cote page : drapeau OFF');
ok(/SI_AUTORISATION_ACTIVE \? 'One signature sets a capped/.test(html) && /'Its brain proposes; you confirm each trade in your wallet\. Each trade pays the usual trade fee\.'/.test(html), '7 la phrase sous Start S.I ne change que drapeau ON');
console.log((n - ko) + ' ok / ' + ko + ' KO (' + n + ' assertions)');
process.exit(ko ? 1 : 0);
