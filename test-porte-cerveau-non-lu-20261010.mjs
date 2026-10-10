/* test-porte-cerveau-non-lu-20261010.mjs - UN CERVEAU QUI N A PAS LU SON MARCHE N A RIEN JUGE : IL ATTEND, IL NE REFUSE PAS.
 * Test prod de Grok (20261010-audit-aero-simule, NVDAc paie IB022) : 1re tentative « Its brain (Mood not judged - our read failed)
 *   refuses », 2e tentative « calm accepts ». Diagnostic Grok 21:58 : la porte trade_tblock refuse (band 'cold') un instantane en
 *   phase NON_LU, et le panneau ne disait « waiting for the market read » que si la porte ACCEPTAIT (g.ok && marche non lu).
 * EXECUTE : la vraie tacheAutorisee (brain-tasks.js) sur des instantanes reels de phase, puis la ligne du ticket d app.html (TB_APP =
 *   ancienne copie) et le predicat bcCerveauAttend s il existe ; la porte de bcProposerSwap est epinglee sur ce meme predicat.
 * AFFIRME : NON_LU -> 'waiting', jamais 'refuses' ; DORMANT / EVEILLE (LUS : pas de marche) et MORT restent des REFUS ; marche lu ->
 *   'accepts' ; phase vivante sans marche lu -> 'waiting' comme avant.
 * NE PROUVE PAS : le rendu en navigateur, ni que la lecture du marche aboutit ensuite (le planificateur juge le marche, il simule).
 */
import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';
import { tacheAutorisee } from './brain-tasks.js';
const html = readFileSync(process.env.TB_APP || new URL('./app.html', import.meta.url), 'utf8');
const lignes = html.split(/\r?\n/);
const ligne = (motif) => { const l = lignes.find((x) => x.includes(motif)); assert.ok(l, 'introuvable : ' + motif); return l; };
const lAttend = lignes.find((x) => x.startsWith('function bcCerveauAttend('));
const src = ligne('function bcMarcheLue(') + '\n' + (lAttend || '');
const { bcMarcheLue, bcCerveauAttend } = new Function(src + '; return { bcMarcheLue, bcCerveauAttend: typeof bcCerveauAttend === "function" ? bcCerveauAttend : null };')();
const lt = ligne("!aBattu ? 'Brain: waking up").trim();
const ticket = (snap) => {
  const g = tacheAutorisee('trade_tblock', snap);
  return new Function('estAction', 'aBattu', 'g', 'humeur', 'snap', 'bcRaison', 'bcMarcheLue', 'bcCerveauAttend', lt + '; return t;')(false, true, g, 'x', snap, (x) => x, bcMarcheLue, bcCerveauAttend);
};
let n = 0;
const vu = (cond, msg) => { assert.ok(cond, msg); n += 1; };
/* temoin : la vraie porte REFUSE bien un instantane NON_LU (sinon ce test ne teste rien) */
vu(tacheAutorisee('trade_tblock', { tick: 1, phase: 'NON_LU' }).ok === false, 'temoin : la porte accepte NON_LU, le cas teste a disparu');
/* le cas de Grok : NON_LU -> on attend */
vu(ticket({ tick: 1, phase: 'NON_LU' }) === 'Brain: waiting for the market read.', 'NON_LU dit : ' + ticket({ tick: 1, phase: 'NON_LU' }));
vu(ticket({ tick: 1, phase: 'NON_LU', marche: { etatVie: 'NON_LUE' } }) === 'Brain: waiting for the market read.', 'NON_LU + marche NON_LUE refuse encore');
/* les refus JUGES restent des refus (un marche LU et absent n est pas un marche non lu) */
vu(/refuses/.test(ticket({ tick: 1, phase: 'DORMANT', marche: { etatVie: 'LUE', vie: 0 } })), 'DORMANT (lu, pas de marche) ne refuse plus');
vu(/refuses/.test(ticket({ tick: 1, phase: 'EVEILLE' })), 'EVEILLE (lu, pas de marche) ne refuse plus');
vu(/refuses: dead/.test(ticket({ tick: 1, phase: 'MORT', marche: { etatVie: 'NON_LUE' } })), 'MORT ne refuse plus');
/* inchange : marche lu -> accepte ; phase vivante sans marche lu -> attend */
vu(/accepts/.test(ticket({ tick: 1, phase: 'CALME', marche: { etatVie: 'LUE', vie: 3 } })), 'marche lu n accepte plus');
vu(ticket({ tick: 1, phase: 'CALME' }) === 'Brain: waiting for the market read.', 'phase vivante sans marche lu n attend plus');
/* la classe rouge du ticket ne s allume pas sur une attente */
vu(/bcCerveauAttend\(snap, g\)/.test(ligne("tb.className = 'note'")), 'le ticket peint en rouge une attente');
/* la porte de bcProposerSwap juge avec le MEME predicat que le ticket */
const k = html.indexOf('async function bcProposerSwap(');
const corps = html.slice(k, html.indexOf('const refuser = ()', k));
vu(corps.includes('if (bcCerveauAttend(snapMoi, g))'), 'la porte du swap ne passe pas par bcCerveauAttend');
vu(corps.indexOf("'Brain: waiting for the market read.'") < corps.indexOf("') refuses: '"), 'la porte peut refuser avant d attendre');
console.log('ok porte-cerveau-non-lu - ' + n + ' assertions : NON_LU attend, DORMANT/EVEILLE/MORT refusent ; NE PROUVE PAS le rendu navigateur');
