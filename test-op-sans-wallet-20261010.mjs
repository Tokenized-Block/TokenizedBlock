/* test-op-sans-wallet-20261010.mjs - 'Connect your wallet first.' NE LAISSE PAS UNE OPERATION 'WAITING FOR YOU' OUVERTE (QA Grok Super, prod
 * 20261010-rail-hook-dex : 'WAITING FOR YOU - Swap 0.0005 ETH -> DJTc - open'). EXECUTE bcOp, bcOpMaj, BC_ETATS et le debut de
 * `planifier` / `preparer` EXTRAITS d app.html (TB_APP = ancienne) avec un bcAvecWallet qui dit 'pas de wallet'. AFFIRME : l operation
 * passe a noWallet (ni 'proposed' ni un etat 'en cours'), et un essai connecte la rouvre. NE PROUVE PAS le rendu de l historique.
 */
import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';
const html = readFileSync(process.env.TB_APP || new URL('./app.html', import.meta.url), 'utf8');
const L = html.split(/\r?\n/);
const iE = L.findIndex((l) => l.startsWith('const BC_ETATS = {'));
let jE = iE; while (!/\};\s*$/.test(L[jE])) jE++;
const etats = new Function(L.slice(iE, jE + 1).join('\n') + '; return BC_ETATS;')();
const enCours = Object.entries(etats).filter(([, v]) => v[1] === 'cours').map(([k]) => k);
for (const [nom, motif] of [['planifier', 'const planifier = async () => {'], ['preparer', 'const preparer = async () => {']]) {
  const i = L.findIndex((l) => l.includes(motif));
  assert.ok(i > 0, nom + ' introuvable');
  const corps = L.slice(i + 1, i + 3).filter((l) => /bcAvecWallet|bcOpMaj\(op, 'proposed'\)/.test(l)).join('\n');
  assert.ok(/bcAvecWallet/.test(corps), nom + ' : garde wallet introuvable');
  for (const connecte of [false, true]) {
    const op = { etat: 'proposed' };
    const bcOpMaj = (o, e) => { if (etats[e]) o.etat = e; };
    const f = new Function('op', 'bcOpMaj', 'bcAvecWallet', 'm', nom, 'return (async () => {' + corps + '\n return "suite"; })();');
    const r = await f(op, bcOpMaj, async () => connecte, {}, () => {});
    if (!connecte) {
      assert.ok(!enCours.includes(op.etat), nom + ' sans wallet : operation laissee en cours (' + op.etat + ')');
      assert.equal(op.etat, 'noWallet', nom + ' sans wallet : ' + op.etat);
      assert.match(etats.noWallet[0], /nothing was sent/);
    } else { assert.equal(r, 'suite'); assert.ok(['proposed'].includes(op.etat), nom + ' connecte : ' + op.etat); }
  }
}
console.log('ok op-sans-wallet - planifier et preparer referment l operation sans wallet ; NE PROUVE PAS le rendu de l historique');