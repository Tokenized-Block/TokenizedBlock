/* test-plan-etat-marche-non-lu-20261010.mjs - LE PLAN TRADE DIT SON ETAT, ET UN CERVEAU N ACCEPTE PAS UN MARCHE NON LU (QA Grok Super,
 * prod 20261010-rail-hook-dex : le plan sans PRET/NON_MESURE/REFUSE ; 'Brain: ... accepts' pendant que Market disait MARKET UNREAD).
 * EXECUTE, extraits d app.html (TB_APP = ancienne) : bcMarcheLue, bcLigneEtatPlan, la ligne du ticket, et la porte de bcProposerSwap.
 * AFFIRME : Ready / Not measured / Refused en tete ; 'Nothing was sent.' sur un refus ; marche non lu -> 'Brain: waiting for the
 * market read.' (jamais 'accepts') ; marche lu -> 'accepts' comme avant ; un refus du cerveau reste un refus.
 * NE PROUVE PAS : le rendu en navigateur, ni que l instantane du cerveau porte toujours `marche` (NON mesure en prod).
 */
import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';
const html = readFileSync(process.env.TB_APP || new URL('./app.html', import.meta.url), 'utf8');
const lignes = html.split(/\r?\n/);
const ligne = (motif) => { const l = lignes.find((x) => x.includes(motif)); assert.ok(l, 'introuvable : ' + motif); return l; };
const i = lignes.findIndex((x) => x.startsWith('function bcLigneEtatPlan('));
assert.ok(i > 0, 'bcLigneEtatPlan absente : le plan ne dit pas son etat');
const src = ligne('function bcMarcheLue(') + '\n' + lignes.slice(i, i + 6).join('\n');
const { bcMarcheLue, bcLigneEtatPlan } = new Function(src + '; return { bcMarcheLue, bcLigneEtatPlan };')();
assert.match(bcLigneEtatPlan({ etat: 'PRET' }), /^Ready \u2014 /);
assert.match(bcLigneEtatPlan({ etat: 'APPROBATIONS' }), /^Ready \u2014 /);
assert.equal(bcLigneEtatPlan({ etat: 'REFUSE', pourquoi: 'balance too low' }), 'Refused \u2014 balance too low. Nothing was sent.');
assert.match(bcLigneEtatPlan({ etat: 'NON_MESURE', pourquoi: 'the plan could not be fetched' }), /^Not measured \u2014 we couldn\u2019t read this market yet\. Retry\. \(the plan could not be fetched\)$/);
assert.match(bcLigneEtatPlan({}), /^Not measured/);
/* la ligne du ticket, executee */
const lt = ligne("!aBattu ? 'Brain: waking up").trim();
const ticket = (g, snap) => new Function('estAction', 'aBattu', 'g', 'humeur', 'snap', 'bcRaison', 'bcMarcheLue', lt + '; return t;')(false, true, g, 'calm', snap, (x) => x, bcMarcheLue);
assert.equal(ticket({ ok: true }, { tick: 1, phase: 'CALME', marche: { etatVie: 'NON_LUE' } }), 'Brain: waiting for the market read.');
assert.equal(ticket({ ok: true }, { tick: 1, phase: 'CALME' }), 'Brain: waiting for the market read.');
assert.match(ticket({ ok: true }, { tick: 1, marche: { etatVie: 'LUE', vie: 3 } }), /accepts/);
assert.match(ticket({ ok: false, pourquoi: 'dead' }, { tick: 1, marche: { etatVie: 'NON_LUE' } }), /refuses: dead/);
/* la porte de bcProposerSwap : la ligne 'waiting' existe et precede 'accepts' */
const k = html.indexOf('async function bcProposerSwap(');
const corps = html.slice(k, html.indexOf('const refuser = ()', k));
const iw = corps.indexOf("'Brain: waiting for the market read.'"), ia = corps.indexOf("') accepts.'");
assert.ok(iw > 0 && iw < ia, 'bcProposerSwap peut dire accepts sur un marche non lu');
assert.ok(corps.includes('if (g.ok && !bcMarcheLue(window.__TB_BRAIN_SNAPSHOT__))'), 'la porte du swap ne regarde pas le marche lu');
console.log('ok plan-etat-marche-non-lu - etats Ready/Not measured/Refused, attente du marche ; NE PROUVE PAS le rendu navigateur');