/* test-banque-ousd-20261011.mjs - LA CARTE LEND PROPOSE DE CHANGER SON OUSD EN USDC (Phil, 2026-10-11 : « tu peux lend aussi les tokenized
 * stock comme pour usdc et ajoute la path OUSD si possible » ; choix « OUSD -> USDC »).
 * MESURE d abord (blue-api Morpho, Base) : aucun marche ne prete une action, aucun ne touche l OUSD — ce qui se prete, c est l USDC.
 * AFFIRME (EXECUTE, bcBanqueOusd extrait d app.html, DOM et lectures simules) :
 *   - Lend sur un marche USDC + un wallet qui detient de l OUSD -> une ligne qui le dit et UN bouton ; son clic propose le swap
 *     OUSD -> USDC de TOUT le solde lu (bcProposerSwap : la carte du Chat dit frais et minimum, la personne signe) ; rien n est signe ici ;
 *   - solde nul, lecture ratee, Borrow, marche non USDC, aucun wallet -> rien d affiche ;
 *   - une lecture plus ancienne (deux peintures croisees) n ecrit pas ;
 *   - bcBanqueChoisir l appelle, et le paragraphe existe dans le formulaire.
 * NE PROUVE PAS : le rendu navigateur ; l execution du swap (banc-devises-fork-20261004.mjs ETH USDC OUSD : 6/6 executes sur fork). */
import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';
const html = readFileSync(process.env.TB_APP || new URL('./app.html', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
let n = 0;
const vu = (c, m) => { assert.ok(c, m); n += 1; };
const i = html.indexOf('let bcBanqueOusdGen = 0;');
vu(i > 0, 'bcBanqueOusd absent d app.html');
const fin = /\n\}\n/.exec(html.slice(i));
const src = html.slice(i, i + fin.index + fin[0].length);
vu(/<p class="note" id="bcBanqueOusd"[^>]* hidden><\/p>/.test(html), 'le paragraphe #bcBanqueOusd manque dans le formulaire de la Bank');
vu(/\$\('#bcBanqueFiat'\)\.hidden = [^\n]+\n\s+void bcBanqueOusd\(mk, sens\);/.test(html), 'bcBanqueChoisir n appelle pas bcBanqueOusd');

const OUSD = '0xb2000000000000000000002feb517dfec7415344', USDC = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913';
const DEVISES_BASE = [{ symbole: 'USDC', adr: USDC }, { symbole: 'OUSD', adr: OUSD }];
const mkUsdc = { pret: { symbole: 'USDC' } };
const attendre = (ms) => new Promise((o) => setTimeout(o, ms));
function monde({ compte = '0x00000000000000000000000000000000c0ffee77', solde = 12500000n, dec = 6, rate = false, delais = [] } = {}) {
  const z = { textContent: '', hidden: true, enfants: [], append(...e) { this.enfants.push(...e); } };
  const proposes = [], lus = [];
  const bcEl = (tag, o = {}) => { const e = { tag, ...o, ecouteurs: {} }; e.addEventListener = (t, f) => { e.ecouteurs[t] = f; }; return e; };
  const etat = { compte, bcBanque: { sens: 'preter' } };
  let k = 0;
  const bcSolde = async (j, q) => { lus.push([j, q]); const d = delais[k++] || 0; if (d) await attendre(d); if (rate) throw new Error('read failed'); return solde; };
  const f = new Function('$', 'DEVISES_BASE', 'bcEl', 'bcUnites', 'bcSolde', 'bcDecimales', 'bcAvecDelai', 'bcProposerSwap', 'etat',
    'with (etat) {\n' + src + '\nreturn bcBanqueOusd; }');
  const bcUnites = (b, d) => { const s = BigInt(b).toString().padStart(d + 1, '0'); const fr = s.slice(s.length - d).replace(/0+$/, ''); return s.slice(0, s.length - d) + (fr ? '.' + fr : ''); };
  const fn = f(() => z, DEVISES_BASE, bcEl, bcUnites, bcSolde, async () => dec, (p) => p, (...a) => { proposes.push(a); }, etat);
  return { z, proposes, lus, fn, etat };
}
{
  const w = monde();
  await w.fn(mkUsdc, 'preter');
  vu(w.z.hidden === false, 'Lend USDC + 12.5 OUSD detenus : la ligne doit s afficher');
  const bouton = w.z.enfants.find((e) => e.tag === 'button');
  vu(bouton && bouton.text === 'Swap my 12.5 OUSD to USDC', 'le bouton dit le montant lu (' + (bouton && bouton.text) + ')');
  vu(/You hold 12\.5 OUSD\. This market lends USDC, not OUSD/.test(w.z.enfants[0].text) && /shows our fee and the least you receive before you sign/.test(w.z.enfants[0].text),
    'la phrase dit pourquoi (le marche prete de l USDC) et que le frais se dit avant la signature');
  vu(w.lus.length === 1 && w.lus[0][0] === OUSD, 'le solde lu est celui de l OUSD');
  vu(w.proposes.length === 0, 'rien n est propose avant le clic');
  bouton.ecouteurs.click();
  const [qui, , ordre, ref] = w.proposes[0] || [];
  vu(w.proposes.length === 1 && qui === 'You' && ordre.de.adr === OUSD && ordre.de.sym === 'OUSD' && ordre.vers.adr === USDC && ordre.vers.sym === 'USDC'
    && ordre.montant === '12500000' && ref === null, 'le clic propose OUSD -> USDC de tout le solde lu, en unites brutes (12500000)');
}
for (const [nom, opts, mk, sens] of [
  ['solde nul', { solde: 0n }, mkUsdc, 'preter'],
  ['lecture ratee', { rate: true }, mkUsdc, 'preter'],
  ['aucun wallet', { compte: null }, mkUsdc, 'preter'],
  ['Borrow', {}, mkUsdc, 'emprunter'],
  ['marche qui prete autre chose que l USDC', {}, { pret: { symbole: 'WETH' } }, 'preter'],
]) {
  const w = monde(opts);
  if (sens === 'emprunter') w.etat.bcBanque.sens = 'emprunter';
  await w.fn(mk, sens);
  vu(w.z.hidden === true && w.z.enfants.length === 0, nom + ' : rien ne doit s afficher');
}
{
  const w = monde({ delais: [40, 0] });
  const a = w.fn(mkUsdc, 'preter');
  const b = w.fn(mkUsdc, 'preter');
  await Promise.all([a, b]);
  vu(w.z.enfants.filter((e) => e.tag === 'button').length === 1, 'deux peintures croisees : une seule ligne (la lecture ancienne n ecrit pas)');
}
{
  const w = monde({ delais: [30] });
  const a = w.fn(mkUsdc, 'preter');
  w.etat.bcBanque.sens = 'emprunter';
  await a;
  vu(w.z.hidden === true, 'passe sur Borrow pendant la lecture : rien ne s affiche');
}
console.log('ok banque-ousd - ' + n + ' assertions ; NE PROUVE PAS le rendu navigateur');
