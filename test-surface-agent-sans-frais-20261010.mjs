/* test-surface-agent-sans-frais-20261010.mjs - window.__TB_BRAIN_TASKS__ (lue par les agents de la page) NE PORTE JAMAIS
 * fee_sink / fee_wallet ni l adresse du wallet de frais (QA a6cf, regle de Phil). EXECUTE l affectation extraite d app.html
 * (TB_APP = ancienne version) sur la vraie sortie de resumeTaches. AFFIRME aussi que .tasks et .offer_preview restent lisibles
 * (lus par la commande 'tasks', le panneau Market et le rendu du recu). NE PROUVE PAS : l echange (calldata), ou le
 * destinataire DOIT figurer, ni l achat de skin qui l affiche volontairement avant signature (decision de Phil).
 */
import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';
import { resumeTaches, FEE_WALLET_TASKS } from './brain-tasks.js';
const html = readFileSync(process.env.TB_APP || new URL('./app.html', import.meta.url), 'utf8');
const i = html.indexOf('window.__TB_BRAIN_TASKS__ = ');
assert.ok(i > 0, 'affectation introuvable');
const debut = html.lastIndexOf('try {', i), fin = html.indexOf('/* agent surface */ }', i) + '/* agent surface */ }'.length;
const avant = html.slice(Math.max(0, debut - 600), debut);
const helper = (avant.match(/const sansCleFrais = [^\r\n]+/) || [''])[0];
const resume = resumeTaches({ address: '0x' + '1'.repeat(40) }, {});
const window = {};
new Function('window', 'resume', helper + '\n' + html.slice(debut, fin))(window, resume);
const s = JSON.stringify(window.__TB_BRAIN_TASKS__, (k, v) => (typeof v === 'bigint' ? String(v) : v));
assert.ok(s, 'surface vide');
assert.ok(!/fee_sink|fee_wallet/.test(s), 'cle de frais sur la surface agent');
assert.ok(!s.toLowerCase().includes(FEE_WALLET_TASKS.toLowerCase()), 'adresse de frais sur la surface agent');
assert.ok(Array.isArray(window.__TB_BRAIN_TASKS__.tasks) && window.__TB_BRAIN_TASKS__.tasks.length === resume.tasks.length, 'tasks perdues');
assert.ok(window.__TB_BRAIN_TASKS__.offer_preview, 'offer_preview perdu');
assert.ok(JSON.stringify(resume, (k, v) => (typeof v === 'bigint' ? String(v) : v)).toLowerCase().includes(FEE_WALLET_TASKS.toLowerCase()), 'temoin : la source ne porte plus l adresse, test aveugle');
console.log('ok surface-agent-sans-frais - tasks ' + resume.tasks.length + ', temoin positif ; NE PROUVE PAS calldata ni skin');