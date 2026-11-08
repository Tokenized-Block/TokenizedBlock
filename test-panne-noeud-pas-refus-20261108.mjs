/* test-panne-noeud-pas-refus-20261108.mjs — UNE PANNE DE NOEUD N EST PAS UN REFUS DE LA CHAINE.
 * ⛔ KO PROD 2026-11-08 (game293, sonde echange de /sante) : « REFUSE — the chain refuses this exact transaction: HTTP 429 ». Le noeud
 *   limitait le debit ; rien n avait ete simule. Dit comme un refus certain, et la relecture des sondes (reservee aux NON_MESURE) ne
 *   partait pas. Ce banc pilote le VRAI planEchange (v4) jusqu a sa simulation finale, que le faux noeud fait echouer de 3 facons.
 * ⚠️ NE PROUVE PAS un swap reel : le noeud est scripte (montage de test-ecran-frais-par-hook). */
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const E = await import(pathToFileURL(path.join(ICI, 'echange.js')).href);
const T = await import(pathToFileURL(path.join(ICI, 'tokenomics.js')).href);

let n = 0, ko = 0;
const ok = (c, m) => { n += 1; if (c) console.log('ok  ' + m); else { ko += 1; console.log('KO  ' + m); } };

const ETH = '0x' + '0'.repeat(40), BLOC = '0xb2ffffffffffffffffffffffffffffffffffff01', compte = '0x' + '4'.repeat(40);
const q = '0x' + (10n ** 18n).toString(16).padStart(64, '0') + '0'.repeat(64);
const v8Eth = { currency0: ETH, currency1: BLOC, fee: 0, tickSpacing: 200, hooks: T.HOOK_V8 };
const R = String(E.ROUTEUR[8453] || E.ROUTEUR).toLowerCase();
/* toutes les lectures repondent ; seule la simulation de la transaction (un eth_call VERS le routeur) echoue avec `message` */
const noeud = (message) => async (m, params) => {
  if (m === 'eth_call' && message && params && params[0] && String(params[0].to).toLowerCase() === R) throw new Error(message);
  return m === 'eth_call' ? q : m === 'eth_chainId' ? '0x2105' : '0x' + '0'.repeat(64);
};
const plan = (message) => E.planEchange({ rpc: noeud(message), chaine: 8453, jeton: BLOC, compte, sens: 'ACHAT', montant: 10n ** 15n,
  marcheLu: { etat: 'LUE', cle: v8Eth, paire: 'ETH' } });

const sain = await plan(null);
ok(['PRET', 'APPROBATIONS'].includes(sain.etat), 'temoin : sans panne, le plan est PRET (' + sain.etat + ' ' + (sain.pourquoi || '') + ')');
for (const message of ['HTTP 429', 'You reached Public endpoint rate limit, please upgrade to paid plan', 'request timed out', 'fetch failed']) {
  const p = await plan(message);
  ok(p.etat === 'NON_MESURE' && !/chain refuses/i.test(p.pourquoi || ''), 'panne « ' + message + ' » -> NON_MESURE, jamais « chain refuses » (' + p.etat + ' : ' + p.pourquoi + ')');
}
for (const message of ['execution reverted: TooLittleReceived', 'insufficient funds for gas * price + value']) {
  const p = await plan(message);
  /* la sonde de forme le voit d abord : « the router refuses » ou « not enough ETH » ; l important est REFUSE, jamais efface en NON_MESURE */
  ok(p.etat === 'REFUSE' && /refuses|not enough/i.test(p.pourquoi || ''), 'vrai refus « ' + message + ' » -> REFUSE garde (' + p.etat + ' : ' + p.pourquoi + ')');
}
/* LE cas de prod : la sonde de forme passe (1er appel au routeur), puis la simulation de la transaction EXACTE tombe sur la panne */
for (const message of ['HTTP 429', 'fetch failed']) {
  let appels = 0;
  const rpc = async (m, params) => {
    if (m === 'eth_call' && params && params[0] && String(params[0].to).toLowerCase() === R && ++appels > 1) throw new Error(message);
    return m === 'eth_call' ? q : m === 'eth_chainId' ? '0x2105' : '0x' + '0'.repeat(64);
  };
  const p = await E.planEchange({ rpc, chaine: 8453, jeton: BLOC, compte, sens: 'ACHAT', montant: 10n ** 15n, marcheLu: { etat: 'LUE', cle: v8Eth, paire: 'ETH' } });
  ok(appels >= 2 && p.etat === 'NON_MESURE' && !/chain refuses/i.test(p.pourquoi || ''), 'simulation finale en panne « ' + message + ' » -> NON_MESURE (' + appels + ' appels routeur ; ' + p.etat + ' : ' + p.pourquoi + ')');
}
ok(E.estPanneDeNoeud({ message: 'execution reverted: 0x82b42900' }) === false && E.estPanneDeNoeud({ message: 'HTTP 429' }) === true
  && E.estPanneDeNoeud({ message: 'execution reverted: rate' }) === false, 'estPanneDeNoeud : un revert n est jamais une panne, meme avec « rate » ou 0x..429..');

console.log(n + ' assertions, ' + ko + ' KO');
process.exit(ko ? 1 : 0);
