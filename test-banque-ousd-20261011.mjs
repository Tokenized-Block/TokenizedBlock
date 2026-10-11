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
/* 2026-10-11 (revue adverse) : la ligne suit CHAQUE relecture du compte - bcBanqueIndices l appelle, et bcBanqueChoisir comme
 *   bcBanquePourToi (connexion, changement de compte, deconnexion, apres une operation) appellent bcBanqueIndices */
vu(/function bcBanqueIndices\(\) \{\n\s+const mk = bcBanque\.choisi; if \(!mk\) return;\n\s+void bcBanqueOusd\(mk, bcBanque\.sens\);/.test(html), 'bcBanqueIndices n appelle pas bcBanqueOusd en tete');
vu(/\$\('#bcBanqueFiat'\)\.hidden = [^\n]+\n[\s\S]{0,900}?bcBanqueDeviseLend\(\);\n\s+bcBanqueIndices\(\);/.test(html), 'bcBanqueChoisir n appelle plus bcBanqueDeviseLend puis bcBanqueIndices apres #bcBanqueFiat');
vu((html.match(/if \(bcBanque\.choisi\) bcBanqueIndices\(\);/g) || []).length === 2, 'bcBanquePourToi (connecte ET deconnecte) doit repeindre le formulaire choisi');
vu((html.match(/bcBanqueOusd\(/g) || []).length === 2, 'bcBanqueOusd : une definition + un seul appel (bcBanqueIndices)');

const OUSD = '0xb2000000000000000000002feb517dfec7415344', USDC = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913';
const DEVISES_BASE = [{ symbole: 'USDC', adr: USDC }, { symbole: 'OUSD', adr: OUSD }];
const mkUsdc = { pret: { symbole: 'USDC' } };
const attendre = (ms) => new Promise((o) => setTimeout(o, ms));
function monde({ compte = '0x00000000000000000000000000000000c0ffee77', solde = 12500000n, dec = 6, rate = false, delais = [] } = {}) {
  /* textContent = '' vide les enfants, comme le DOM ; dataset est un objet */
  const z = { hidden: true, enfants: [], dataset: {}, append(...e) { this.enfants.push(...e); },
    set textContent(v) { if (v === '') this.enfants = []; }, get textContent() { return this.enfants.map((e) => e.text || '').join(''); } };
  const proposes = [], lus = [];
  const bcEl = (tag, o = {}) => { const e = { tag, ...o, ecouteurs: {} }; e.addEventListener = (t, f) => { e.ecouteurs[t] = f; }; return e; };
  const etat = { compte, bcBanque: { sens: 'preter' } };
  const ctl = { solde, rate };
  let k = 0;
  const bcSolde = async (j, q) => { lus.push([j, q]); const d = delais[k++] || 0; if (d) await attendre(d); if (ctl.rate) throw new Error('read failed'); return typeof ctl.solde === 'function' ? ctl.solde(q) : ctl.solde; };
  const f = new Function('$', 'DEVISES_BASE', 'bcEl', 'bcUnites', 'bcSolde', 'bcDecimales', 'bcAvecDelai', 'bcProposerSwap', 'etat', 'bcBanqueDeviseLend', 'bcBanqueIndices',
    'with (etat) {\n' + src + '\nreturn bcBanqueOusd; }');
  const bcUnites = (b, d) => { const s = BigInt(b).toString().padStart(d + 1, '0'); const fr = s.slice(s.length - d).replace(/0+$/, ''); return s.slice(0, s.length - d) + (fr ? '.' + fr : ''); };
  const menu = { value: 'USDC', hidden: false }, champ = { value: '' }, repeint = [];
  const $ = (sel) => (sel === '#bcBanqueDevise' ? menu : sel === '#bcBanqueMontant' ? champ : z);
  const fn = f($, DEVISES_BASE, bcEl, bcUnites, bcSolde, async () => dec, (p) => p, (...a) => { proposes.push(a); }, etat, () => repeint.push('mode'), () => repeint.push('indices'));
  return { z, proposes, lus, fn, etat, ctl, menu, champ, repeint };
}
{
  const w = monde();
  await w.fn(mkUsdc, 'preter');
  vu(w.z.hidden === false, 'Lend USDC + 12.5 OUSD detenus : la ligne doit s afficher');
  const bouton = w.z.enfants.find((e) => e.tag === 'button');
  vu(bouton && bouton.text === 'Use all my 12.5 OUSD', 'le bouton dit le montant lu (' + (bouton && bouton.text) + ')');
  vu(/You hold 12\.5 OUSD\. This market lends USDC, not OUSD/.test(w.z.enfants[0].text) && /shows our fee and the least you receive before you sign/.test(w.z.enfants[0].text),
    'la phrase dit pourquoi (le marche prete de l USDC) et que le frais se dit avant la signature');
  vu(w.lus.length === 1 && w.lus[0][0] === OUSD, 'le solde lu est celui de l OUSD');
  vu(w.proposes.length === 0, 'rien n est propose avant le clic');
  bouton.ecouteurs.click();
  /* 2026-10-11 : un seul bouton d echange (#bcBanqueGo) - celui-ci REMPLIT le formulaire : menu sur OUSD, tout le solde lu ; rien n est envoye */
  vu(w.proposes.length === 0 && w.menu.value === 'OUSD' && w.champ.value === '12.5' && w.repeint.join(',') === 'mode,indices',
    'le clic remplit le formulaire (menu OUSD, 12.5, mode repeint) et ne propose RIEN (' + w.menu.value + ' / ' + w.champ.value + ' / ' + w.repeint.join(',') + ')');
}
/* ── le menu (Phil, capture : « toujours pas de menu deroulant ») ── */
vu(/<select id="bcBanqueDevise" aria-label="Currency you lend with" hidden><option value="USDC">USDC<\/option><option value="OUSD">OUSD → USDC<\/option><\/select>/.test(html),
  'le menu #bcBanqueDevise (USDC, OUSD -> USDC) est dans le champ du montant');
vu(/const choixDevise = sens === 'preter' && mk\.pret\.symbole === 'USDC';\n\s+\$\('#bcBanqueDevise'\)\.hidden = !choixDevise; \$\('#bcBanqueMontantU'\)\.hidden = choixDevise;/.test(html),
  'bcBanqueChoisir : le menu remplace l unite en Lend sur un marche USDC, seulement la');
{
  const i2 = html.indexOf('function bcBanqueDeviseLend() {');
  vu(i2 > 0, 'bcBanqueDeviseLend absent');
  const f2 = /\n\}\n/.exec(html.slice(i2));
  const src2 = html.slice(i2, i2 + f2.index + f2[0].length);
  const lancer = (valeur, cache, sens = 'preter', noteKo = false) => {
    const el = { '#bcBanqueDevise': { value: valeur, hidden: cache }, '#bcBanqueGo': { textContent: '' }, '#bcBanqueMontantLib': { textContent: '' },
      '#bcBanquePuces': { hidden: false }, '#bcBanqueMontant': { placeholder: 'You have 5' }, '#bcBanqueNote': { textContent: 'x', classList: { contains: (c) => noteKo && c === 'wKo' } } };
    const bcBanque = { sens };
    new Function('$', 'bcBanque', src2 + '\nbcBanqueDeviseLend();')((s) => el[s], bcBanque);
    return { el, bcBanque };
  };
  const o = lancer('OUSD', false);
  vu(o.bcBanque.lendEnOusd === true && o.el['#bcBanqueGo'].textContent === 'Swap OUSD to USDC first' && o.el['#bcBanqueMontantLib'].textContent === 'You swap (OUSD to USDC)'
    && o.el['#bcBanquePuces'].hidden === true && /OUSD is not lent here/.test(o.el['#bcBanqueNote'].textContent), 'OUSD choisi : bouton, libelle, puces USDC masquees, note qui dit pourquoi');
  const u = lancer('USDC', false);
  vu(u.bcBanque.lendEnOusd === false && u.el['#bcBanqueGo'].textContent === 'Review' && u.el['#bcBanqueMontantLib'].textContent === 'You lend' && u.el['#bcBanqueNote'].textContent === '', 'USDC choisi : le formulaire d avant');
  const c = lancer('OUSD', true);
  vu(c.bcBanque.lendEnOusd === false && c.el['#bcBanqueGo'].textContent === 'Review', 'menu cache (Borrow, autre marche) : jamais le mode OUSD, meme si la valeur traine');
  const k = lancer('OUSD', false, 'preter', true);
  vu(k.el['#bcBanqueNote'].textContent === 'x', 'une note d erreur (rouge) n est pas ecrasee par la note du mode');
}
vu(/if \(bcBanque\.sens === 'preter' && bcBanque\.lendEnOusd\) \{\n[\s\S]{0,1400}void bcProposerSwap\('You', '', \{ de: \{ adr: String\(o\.adr\)\.toLowerCase\(\), sym: 'OUSD' \}, vers: \{ adr: String\(u\.adr\)\.toLowerCase\(\), sym: 'USDC' \}, montant: brut\.toString\(\) \}, null\);\n\s+return;/.test(html),
  'Review en mode OUSD : propose l echange OUSD -> USDC du montant tape, et rien d autre (pas de pret)');
vu(/if \(brut < 10n \*\* BigInt\(Math\.max\(0, dec - 2\)\)\) \{ note\.className = 'note wKo'; note\.textContent = 'Swap at least 0\.01 OUSD/.test(html), 'Review en mode OUSD : moins d un cent -> refuse avant le planificateur');
vu(/if \(bcBanque\.sens === 'preter' && bcBanque\.lendEnOusd\) \{ \$\('#bcBanqueMontant'\)\.placeholder = '0\.0';/.test(html), 'bcBanqueIndices : en mode OUSD, ni indice ni montants tout faits en USDC');
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
/* ── revue adverse 2026-10-11 : la ligne suit le compte, une lecture ratee l efface, la poussiere ne propose rien ── */
const B = '0x00000000000000000000000000000000000000bb';
const mkA = { id: 'm1', pret: { symbole: 'USDC' } };
{
  const w = monde({ solde: (q) => (q === B ? 0n : 12500000n) });
  await w.fn(mkA, 'preter');
  vu(w.z.hidden === false && /12\.5 OUSD/.test(w.z.textContent), 'compte A : la ligne dit 12.5 OUSD');
  w.etat.compte = B;
  await w.fn(mkA, 'preter');
  vu(w.z.hidden === true && w.z.enfants.length === 0, 'changement de compte vers B (0 OUSD) : la ligne de A disparait');
  w.etat.compte = null;
  await w.fn(mkA, 'preter');
  vu(w.z.hidden === true && w.z.enfants.length === 0 && w.z.dataset.pour === undefined, 'deconnexion : rien');
}
{
  const w = monde();
  await w.fn(mkA, 'preter');
  vu(w.z.hidden === false, 'temoin : ligne affichee');
  w.ctl.solde = 0n;
  await w.fn(mkA, 'preter');
  vu(w.z.hidden === true && w.z.enfants.length === 0, 'apres le swap (solde relu = 0) : la ligne disparait');
}
{
  const w = monde();
  await w.fn(mkA, 'preter');
  w.ctl.rate = true;
  await w.fn(mkA, 'preter');
  vu(w.z.hidden === true && w.z.enfants.length === 0, 'relecture ratee : la ligne d avant est effacee (un solde d avant n est pas un solde lu)');
}
{
  const w = monde({ delais: [0, 40] });
  await w.fn(mkA, 'preter');
  const p = w.fn(mkA, 'preter');
  await attendre(10);
  vu(w.z.hidden === false && /12\.5 OUSD/.test(w.z.textContent), 'meme compte, meme marche : la ligne RESTE pendant la relecture (pas de clignotement)');
  await p;
  vu(w.z.enfants.filter((e) => e.tag === 'button').length === 1, '... et une seule ligne apres la relecture');
}
{
  const w = monde({ delais: [0, 40] });
  await w.fn(mkA, 'preter');
  const p = w.fn({ id: 'm2', pret: { symbole: 'USDC' } }, 'preter');
  await attendre(10);
  vu(w.z.hidden === true, 'autre marche : la ligne est effacee des le debut de la relecture');
  await p;
  vu(w.z.hidden === false, '... puis repeinte pour ce marche');
}
for (const [solde, vue, nom] of [[300n, false, '300 unites (0.0003 OUSD, poussiere)'], [9999n, false, '9999 unites (moins d un cent)'], [10000n, true, '10000 unites (un cent)']]) {
  const w = monde({ solde });
  await w.fn(mkA, 'preter');
  vu(w.z.hidden === !vue, nom + ' : ' + (vue ? 'la ligne s affiche' : 'rien (le planificateur refuserait)'));
}
console.log('ok banque-ousd - ' + n + ' assertions ; NE PROUVE PAS le rendu navigateur');
