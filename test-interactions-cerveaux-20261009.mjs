/* test-interactions-cerveaux-20261009.mjs — PARLER A UN CERVEAU, ET LES FAIRE SE RENCONTRER, SANS MENTIR.
 *
 * Demande de Phil (2026-10-09) : boutons d interaction en direct humain <-> Brain AI, cerveaux qui s envoient des interactions,
 * une communaute de blocks. Les gardes :
 *   A. le module est PUR et REJOUABLE : meme adresse + memes faits = meme rencontre, chez tout le monde ;
 *   B. rien n est invente : « non lu » reste NON_LU (jamais « endormi »), « rien n a tire » reste null (jamais 0 %) ;
 *   C. la synchronie MESURE : elle varie d une paire a l autre (une sortie constante n est pas une mesure) ;
 *   D. le message de rencontre tient dans la garde des messages payes (en-tete tbx1 compris) ;
 *   E. le cablage de l app : aucun LLM, aucun envoi direct — le message passe par le formulaire du profil (Prepare -> Sign).
 * ⛔ BORNE : l affichage dans un navigateur est verifie a part (serveur local), pas ici. */
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { rencontre, cercle, rejouer, synchronie, faitsLus, repliqueDe, conseilDe, texteRencontre, pourcentSynchro, BATTEMENTS_RENCONTRE } from './interactions-cerveaux.js';
import { ACTIONS_COINBASE } from './paires.js';
import { encoderMessageBlock } from './messagerie-blocks.js';
import { PHASES } from './cerveau.js';

let n = 0;
const cas = (titre, f) => { n++; try { f(); } catch (e) { console.error('✗ ' + titre); throw e; } };
const adrs = ACTIONS_COINBASE.slice(0, 10).map((x) => x.adr);
const LU = { vie: 5000, etatVie: 'LUE' };

cas('A1 meme entree = meme rencontre (rejouable)', () => {
  const x = rencontre({ a: adrs[0], faitsA: LU, b: adrs[1], faitsB: LU });
  const y = rencontre({ a: adrs[0].toUpperCase().replace('0X', '0x'), faitsA: LU, b: adrs[1], faitsB: LU });
  assert.equal(x.etat, 'LU');
  assert.deepEqual(x, y);
  assert.equal(x.battements, BATTEMENTS_RENCONTRE);
});
cas('A2 un cerveau ne se rencontre pas lui-meme ; une adresse tronquee est refusee', () => {
  assert.equal(rencontre({ a: adrs[0], b: adrs[0] }).etat, 'REFUSE');
  assert.equal(rencontre({ a: adrs[0].slice(0, 20), b: adrs[1] }).etat, 'REFUSE');
  assert.equal(rejouer('0x12', {}), null);
});
cas('B1 sans vie ni etat lus : NON_LU (« market unread »), jamais DORMANT', () => {
  assert.deepEqual(faitsLus({}), { vie: null, etatVie: 'NON_LUE' });
  assert.deepEqual(faitsLus(null), { vie: null, etatVie: 'NON_LUE' });
  assert.equal(rejouer(adrs[0], faitsLus({})).phase, 'NON_LU');
  assert.equal(faitsLus({ vie: 12 }).etatVie, 'LUE');
  assert.equal(faitsLus({ vie: NaN }).vie, null);
});
cas('B2 rien n a tire : synchronie null et pourcent null (jamais 0 %)', () => {
  assert.equal(synchronie([[], []], [[], []]), null);
  assert.equal(pourcentSynchro(null), null);
  assert.equal(pourcentSynchro(NaN), null);
  assert.equal(synchronie([[1, 2]], [[2, 3]]), 1 / 3);
  assert.equal(synchronie([[1, 2]], [[1, 2]]), 1);
});
cas('B3 chaque phase a sa replique ; une phase inconnue repond comme NON_LU', () => {
  for (const p of PHASES) assert.ok(repliqueDe(p).length > 0, p);
  assert.equal(repliqueDe('???'), repliqueDe('NON_LU'));
  assert.equal(conseilDe('EXCITE').geste, 'buy');
  assert.equal(conseilDe('INQUIET').geste, 'sell_quarter');
  assert.equal(conseilDe('DORMANT').geste, 'gm');
  assert.equal(conseilDe('NON_LU').geste, 'rien');
  for (const p of PHASES) assert.ok(!/\d/.test(conseilDe(p).texte), 'un conseil ne porte aucun montant : ' + p);
});
cas('C1 la synchronie MESURE : plusieurs valeurs distinctes sur 9 paires', () => {
  const v = new Set(adrs.slice(1).map((b) => rencontre({ a: adrs[0], faitsA: LU, b, faitsB: LU }).synchronie.toFixed(4)));
  assert.ok(v.size >= 3, 'synchronie quasi constante : ' + [...v]);
});
cas('C2 le cercle : sans lui-meme, sans doublon, trie, borne', () => {
  const voisins = [...adrs, adrs[2]].map((adr) => ({ adr, sym: 'X', vie: 5000, etatVie: 'LUE' }));
  const c = cercle({ a: adrs[0], faitsA: LU, voisins, max: 5 });
  assert.equal(c.length, 5);
  assert.ok(!c.some((x) => x.adr === adrs[0].toLowerCase()));
  assert.equal(new Set(c.map((x) => x.adr)).size, c.length);
  for (let i = 1; i < c.length; i++) assert.ok(c[i - 1].synchronie >= c[i].synchronie);
  assert.deepEqual(c, cercle({ a: adrs[0], faitsA: LU, voisins: voisins.slice().reverse(), max: 5 }), 'l ordre de la Map change le cercle');
});
cas('D1 le texte de rencontre passe la garde des messages payes (en-tete tbx1 compris)', () => {
  const r = rencontre({ a: adrs[0], faitsA: LU, b: adrs[1], faitsB: LU });
  const t = texteRencontre({ symA: 'A'.repeat(40), symB: 'B'.repeat(40), r });
  assert.ok(t.length <= 150);
  assert.equal(encoderMessageBlock({ de: adrs[0], a: adrs[1], texte: t }).etat, 'OK');
  const vide = texteRencontre({ symA: 'A', symB: 'B', r: { ...r, synchronie: null } });
  assert.match(vide, /no neuron fired in common/);
});

const app = readFileSync(new URL('./app.html', import.meta.url), 'utf8');
const srv = readFileSync(new URL('./serveur-web.js', import.meta.url), 'utf8');
const corps = (nom) => { const i = app.indexOf(nom); assert.ok(i > 0, nom + ' absent'); const f = /\r?\n\}\r?\n/.exec(app.slice(i)); return app.slice(i, i + f.index); };
cas('E1 le module est servi ET importe (un import 404 arrete toute la page)', () => {
  assert.match(srv, /'interactions-cerveaux\.js',/);
  assert.match(app, /from '\.\/interactions-cerveaux\.js';/);
});
cas('E2 le panneau porte les trois boutons de conversation, dans les actions du block', () => {
  const c = corps('function bcPeindreActions(a, sym) {');
  for (const b of ['How are you?', 'What would you do?', 'Its circle']) assert.ok(c.includes("'" + b), b);
});
cas('E2b (Phil 2026-10-09 : « le chat reste bloque ») les gestes Brain sont AUSSI dans la vue Chat ; un fil par block', () => {
  assert.match(app, /<div class="bcPre bcParler" id="bcParlerChat"><\/div>/);
  const c = corps('function bcPeindreActions(a, sym) {');
  assert.match(c, /const parler = \(texte, f\) => \{ bouton\(texte, f, zp\); if \(zc\) bouton\(texte, f, zc\); \};/);
  for (const b of ['How are you?', 'What would you do?', 'Its circle']) assert.ok(c.includes("parler('" + b), b + ' absent de la vue Chat');
  const f = corps('function bcChangerFil(a) {');
  assert.match(f, /bc\.fils\.set\(bc\.filDe, \[\.\.\.fil\.childNodes\]\);/);
  assert.match(f, /for \(const n of bc\.fils\.get\(a\) \|\| \[\]\) fil\.append\(n\);/);
  assert.match(app, /if \(bc\.filDe !== a\) bcChangerFil\(a\);/);
});
cas('E3 la rencontre ne signe rien : elle mene au formulaire du profil, jamais au wallet', () => {
  const r = corps('function bcRencontre(a, symA, b, symB) {') + corps('async function bcPreparerMessageRencontre(');
  assert.ok(!/envoyerDepuisWallet|eth_sendTransaction|wallet_sendCalls|envoyerLotAtomique/.test(r), 'la rencontre envoie elle-meme');
  assert.match(r, /ouvrirProfil\(b,/);
  assert.match(r, /#pmsgTexte/);
});
cas('E4 aucun modele de langage : ni fetch ni API dans le module', () => {
  const mod = readFileSync(new URL('./interactions-cerveaux.js', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
  assert.ok(!/fetch\(|https?:\/\/|Math\.random|Date\.now/.test(mod), 'le module appelle le reseau ou le hasard');
});

console.log('✓ ' + n + ' cas — interactions des cerveaux : rejouables, honnetes, sans signature');
