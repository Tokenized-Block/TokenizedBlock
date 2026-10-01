/* test-mes-blocks-peints-au-fil-de-l-eau.mjs — « Reading My blocks… » NE RESTE PLUS UNE MINUTE.
 *
 * ⛔⛔ LE DEFAUT (Raksha, 2026-10-01, wallet neuf et vide) : l onglet Wallet restait > 20 s sur
 *     « Reading My blocks… ». Mesure du Grok Bot (Chrome headless, wallet simule vide, prod) : 72,6 s
 *     avant « No B20 found », 345 eth_getTransactionByHash + 427 eth_getLogs.
 *     CAUSE : `peindreTokenizedBank` attendait EN SERIE `mesCreations()` puis `mesFrappes()` avant
 *     d ecrire quoi que ce soit, et l index serveur (/api/blocks-de, quelques ms) n arrivait qu au
 *     bout du premier balayage.
 * ⛔ CE FICHIER EXECUTE LA VRAIE FONCTION, extraite d app.html depouille de ses commentaires, avec des
 *   balayages que le test tient EN SUSPENS : il voit ce que la liste affiche PENDANT le balayage.
 * ⛔⛔ TEMOINS NEGATIFS : la peinture apres l index retiree, les balayages remis en serie, le jeton de
 *   generation retire — chacun fait tomber un cas ci-dessous (mutations dans le message du commit).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { sansCommentaires } from './outils-test.js';

let n = 0;
const cas = async (t, f) => { n += 1; try { await f(); console.log('  ok  ' + t); } catch (e) { console.error('✗ ' + t); throw e; } };
const nu = sansCommentaires(readFileSync(new URL('./app.html', import.meta.url), 'utf8'), { minRetire: 5000 });
const d = nu.indexOf('async function peindreTokenizedBank() {');
const f = nu.indexOf('async function tbLirePreuve(', d);
assert.ok(d > 0 && f > d, 'peindreTokenizedBank introuvable');
const source = nu.slice(d, f);

const A = '0x' + 'a'.repeat(40);
const B = '0x' + 'b'.repeat(40);
const C = '0x' + 'c'.repeat(40);
const tick = () => new Promise((r) => setTimeout(r, 5));
const enSuspens = () => { let ok; const p = new Promise((r) => { ok = r; }); return { p, ok }; };

function monter({ index = [], creations, frappes }) {
  const histoire = [];
  const sel = {
    _html: '', _val: '',
    get innerHTML() { return this._html; },
    set innerHTML(h) { this._html = h; histoire.push(h); const m = /value="([^"]*)"/.exec(h); this._val = m ? m[1] : ''; },
    get value() { return this._val; },
    set value(v) { this._val = this._html.includes('value="' + v + '"') ? v : ''; },
  };
  const els = { '#tbBlock': sel, '#tbEtat': { textContent: '' }, '#tbProof': { textContent: '' } };
  const $ = (q) => els[q] || null;
  const fn = new Function('$', 'fetch', 'mesCreations', 'mesFrappes', 'rpc', 'symboleDepuisReponse', 'court', 'enTexte',
    'BANK_CONTRACT', 'tbBankOuvertIci', 'peindrePanierBank', 'actifs', 'compteInitial',
    'let compte = compteInitial; let tbBankGeneration = 0; let tbPreuve = null; let tbPanierPreuves = [];\n' + source
    + '\nreturn { lancer: peindreTokenizedBank, compte: (c) => { compte = c; }, preuve: () => tbPreuve, poserPreuve: (p) => { tbPreuve = p; } };');
  const app = fn($,
    async () => ({ ok: true, json: async () => ({ ok: true, blocks: index }) }),
    () => creations(), (...a) => frappes(...a),
    async () => '0x', () => null, (x) => x.slice(0, 6), (x) => String(x), '0xbank', () => true, () => {}, [], '0x' + '1'.repeat(40));
  return { app, sel, histoire };
}

await cas('⛔⛔⛔ BALAYAGES EN COURS, INDEX SERVEUR CONNU : le block de l index est LISTE tout de suite, et la liste dit qu elle cherche encore', async () => {
  const c = enSuspens(); const fr = enSuspens();
  const { app, sel, histoire } = monter({ index: [A], creations: () => c.p, frappes: () => fr.p });
  const fin = app.lancer();
  await tick();
  assert.ok(sel.innerHTML.includes('value="' + A + '"'), 'le block de /api/blocks-de doit etre la PENDANT le balayage : ' + histoire.join(' | '));
  assert.match(sel.innerHTML, /Still scanning/);
  assert.doesNotMatch(sel.innerHTML, /Reading My blocks/);
  c.ok({ gardees: [] }); fr.ok({ blocks: [] }); await fin;
  assert.ok(sel.innerHTML.includes('value="' + A + '"'));
  assert.doesNotMatch(sel.innerHTML, /Still scanning/, 'la peinture finale ne dit plus « still scanning »');
});

await cas('⛔⛔ WALLET VIDE, BALAYAGES EN COURS : « No B20 found yet — still scanning », jamais un « Reading… » muet', async () => {
  const c = enSuspens(); const fr = enSuspens();
  const { app, sel } = monter({ creations: () => c.p, frappes: () => fr.p });
  const fin = app.lancer();
  await tick();
  assert.match(sel.innerHTML, /No B20 found yet — still scanning the chain/);
  c.ok({ gardees: [] }); fr.ok({ blocks: [] }); await fin;
  assert.match(sel.innerHTML, /No B20 found for this wallet yet/, 'contrat final inchange');
});

await cas('⛔⛔ LES DEUX BALAYAGES COURENT EN PARALLELE : les frappes recues s affichent sans attendre les creations', async () => {
  const c = enSuspens(); let appelee = false;
  const { app, sel } = monter({ creations: () => c.p, frappes: async () => { appelee = true; return { blocks: [{ jeton: B }] }; } });
  const fin = app.lancer();
  await tick();
  assert.ok(appelee, 'mesFrappes doit etre lancee sans attendre mesCreations');
  assert.ok(sel.innerHTML.includes('value="' + B + '"'), 'B recu doit etre liste pendant que les creations sont encore lues');
  c.ok({ gardees: [{ jeton: C, symbole: 'CCC' }] }); await fin;
  assert.ok(sel.innerHTML.includes('value="' + B + '"') && sel.innerHTML.includes('CCC'));
});

await cas('⛔⛔ UNE LECTURE PLUS ANCIENNE N ECRASE PAS LA PLUS RECENTE (changement de compte pendant le balayage)', async () => {
  const c1 = enSuspens(); const fr1 = enSuspens(); let tour = 0;
  const { app, sel } = monter({
    creations: () => (++tour === 1 ? c1.p : Promise.resolve({ gardees: [{ jeton: C, symbole: 'NEUF' }] })),
    frappes: () => (tour === 1 ? fr1.p : Promise.resolve({ blocks: [] })),
  });
  const premiere = app.lancer();
  await tick();
  app.compte('0x' + '2'.repeat(40));
  await app.lancer();
  assert.match(sel.innerHTML, /NEUF/);
  c1.ok({ gardees: [{ jeton: A, symbole: 'ANCIEN' }] }); fr1.ok({ blocks: [{ jeton: B }] });
  await premiere; await tick();
  assert.doesNotMatch(sel.innerHTML, /ANCIEN/, 'la lecture de l ancien compte a ecrase la liste du nouveau');
  assert.ok(!sel.innerHTML.includes('value="' + B + '"'));
});

await cas('⛔⛔ DECONNEXION PENDANT LE BALAYAGE : la fin du balayage ne remet pas de blocks sous « Connect wallet »', async () => {
  const c = enSuspens(); const fr = enSuspens();
  const { app, sel } = monter({ creations: () => c.p, frappes: () => fr.p });
  const fin = app.lancer();
  await tick();
  app.compte(null);
  await app.lancer();
  c.ok({ gardees: [{ jeton: A, symbole: 'AAA' }] }); fr.ok({ blocks: [] });
  await fin; await tick();
  assert.match(sel.innerHTML, /Connect wallet to list your blocks/);
});

await cas('⛔ UN BLOCK CHOISI PENDANT LE BALAYAGE RESTE CHOISI, et sa preuve deja lue n est pas jetee', async () => {
  const c = enSuspens();
  const { app, sel } = monter({ index: [A], creations: () => c.p, frappes: async () => ({ blocks: [{ jeton: B }] }) });
  const fin = app.lancer();
  await tick();
  sel.value = A;
  assert.equal(sel.value, A);
  app.poserPreuve({ block: A, solde: 1n });
  c.ok({ gardees: [{ jeton: C, symbole: 'CCC' }] }); await fin;
  assert.equal(sel.value, A, 'le choix de la personne a saute a la repeinture');
  assert.ok(app.preuve(), 'la preuve du block choisi a ete jetee');
});

await cas('⛔ TEMOIN : sans rien choisi, la peinture finale remet la preuve a zero (comportement d avant garde)', async () => {
  const { app } = monter({ creations: async () => ({ gardees: [] }), frappes: async () => ({ blocks: [] }) });
  app.poserPreuve({ block: A });
  await app.lancer();
  assert.equal(app.preuve(), null);
});

console.log(n + ' cas OK — test-mes-blocks-peints-au-fil-de-l-eau');
