/* Ce que ce test tient, et le defaut vecu qu il empeche.
 *
 * Phil, 2026-09-30 : il cree un block, le flux paie puis casse, la ligne reste — et au coup
 * suivant Create est REFUSE tant qu il n a pas clique « dismiss » sur un block peut-etre deja
 * vivant. La liste n etait JAMAIS reconciliee avec la chaine.
 */
import { VERDICTS, etatDuBlock, reconcilier, bloqueLaCreation, phraseRappel } from './blocks-a-lancer.js';

let n = 0, ko = 0;
function ok(nom, cond, vu) {
  n += 1;
  if (cond) { console.log('  ok   ' + nom); return; }
  ko += 1;
  console.log('  KO   ' + nom + (vu === undefined ? '' : '   vu: ' + JSON.stringify(vu)));
}
const A = '0x' + 'a'.repeat(40);
const B = '0x' + 'b'.repeat(40);
const C = '0x' + 'c'.repeat(40);

console.log('etatDuBlock — la PREUVE positive, et elle seule');
ok('cote par l index -> VIVANT_PROUVE', (() => {
  const r = etatDuBlock(A, { marches: new Map([[A, {}]]) });
  return r.verdict === 'VIVANT_PROUVE' && r.preuve === 'MARCHE_COTE';
})(), etatDuBlock(A, { marches: new Map([[A, {}]]) }));
ok('une pool decouverte -> VIVANT_PROUVE', (() => {
  const r = etatDuBlock(A, { poolPour: (x) => (x === A ? { cle: {} } : null) });
  return r.verdict === 'VIVANT_PROUVE' && r.preuve === 'POOL_DECOUVERTE';
})());
ok('la casse de l adresse ne change rien', etatDuBlock(A.toUpperCase().replace('0X', '0x'),
  { marches: new Map([[A, {}]]) }).verdict === 'VIVANT_PROUVE');
/* ⛔ L ASYMETRIE : une ABSENCE ne prouve rien, donc elle ne retire rien. */
ok('absent de tout -> NON_PROUVE (jamais VIVANT)', etatDuBlock(A, {}).verdict === 'NON_PROUVE');
ok('index vide -> NON_PROUVE', etatDuBlock(A, { marches: new Map() }).verdict === 'NON_PROUVE');
ok('poolPour qui rend null -> NON_PROUVE',
  etatDuBlock(A, { poolPour: () => null }).verdict === 'NON_PROUVE');
/* ⛔ UN LECTEUR QUI LEVE NE DOIT PAS FAIRE CROIRE A UNE PREUVE. */
ok('poolPour qui LEVE -> NON_PROUVE, pas une exception',
  etatDuBlock(A, { poolPour: () => { throw new Error('noeud muet'); } }).verdict === 'NON_PROUVE');
ok('aucun contexte -> NON_PROUVE', etatDuBlock(A).verdict === 'NON_PROUVE');
console.log('etatDuBlock — les entrees qui ne sont pas des adresses');
ok('adresse tronquee -> ENTREE_INVALIDE', etatDuBlock('0xabc', {}).verdict === 'ENTREE_INVALIDE');
ok('null -> ENTREE_INVALIDE', etatDuBlock(null, {}).verdict === 'ENTREE_INVALIDE');
ok('non-hexa -> ENTREE_INVALIDE', etatDuBlock('0x' + 'z'.repeat(40), {}).verdict === 'ENTREE_INVALIDE');
ok('les verdicts sont geles', Object.isFrozen(VERDICTS));

console.log('reconcilier — on retire ce qui est PROUVE, on garde le reste');
const LISTE = [{ adr: A, sym: 'AAA' }, { adr: B, sym: 'BBB' }, { adr: C, sym: 'CCC' }];
ok('seul le prouve part', (() => {
  const r = reconcilier(LISTE, { marches: new Map([[B, {}]]) });
  return r.retires.length === 1 && r.retires[0].adr === B && r.gardes.length === 2;
})(), reconcilier(LISTE, { marches: new Map([[B, {}]]) }));
/* ⛔ LE RETRAIT PORTE SA PREUVE : un retrait sans preuve serait invérifiable. */
ok('le retire porte SA PREUVE', (() => {
  const r = reconcilier(LISTE, { marches: new Map([[B, {}]]) });
  return r.retires[0].preuve === 'MARCHE_COTE';
})());
ok('les champs de l entree sont conserves (le symbole survit)', (() => {
  const r = reconcilier(LISTE, { marches: new Map([[B, {}]]) });
  return r.retires[0].sym === 'BBB';
})());
ok('les DEUX preuves fonctionnent ensemble', (() => {
  const r = reconcilier(LISTE, { marches: new Map([[A, {}]]), poolPour: (x) => (x === C ? {} : null) });
  return r.retires.length === 2 && r.gardes.length === 1 && r.gardes[0].adr === B;
})(), reconcilier(LISTE, { marches: new Map([[A, {}]]), poolPour: (x) => (x === C ? {} : null) }));
ok('aucune preuve -> rien ne part', reconcilier(LISTE, {}).retires.length === 0);
ok('liste vide -> rien', (() => {
  const r = reconcilier([], {});
  return r.gardes.length === 0 && r.retires.length === 0;
})());
ok('liste absente -> rien, pas d exception', reconcilier(null, {}).gardes.length === 0);
/* ⛔ UNE ENTREE INVALIDE RESTE : la juger nous ferait perdre un rappel legitime. */
ok('une entree invalide est GARDEE, pas retiree', (() => {
  const r = reconcilier([{ adr: '0xnope' }], { marches: new Map([[A, {}]]) });
  return r.gardes.length === 1 && r.retires.length === 0;
})());
ok('la liste d entree n est pas MUTEE', (() => {
  const src = [{ adr: A }, { adr: B }];
  reconcilier(src, { marches: new Map([[A, {}]]) });
  return src.length === 2;
})());

console.log('bloqueLaCreation — LE MUR TOMBE, et une mutation qui le remet est attrapee');
/* ⛔⛔ LE MOTIF DU BLOCAGE A EXPIRE : il existait parce que creer etait GRATUIT
 *    (« Create still offered free -> infinite asleep blocks »). Creer coute desormais
 *    0,001 ETH : le frein, c est le frais. */
ok('Create n est JAMAIS refuse a cause de cette liste', bloqueLaCreation() === false);

console.log('phraseRappel — on retire le mur, PAS l information');
ok('liste vide -> silence (ici le silence est le succes)', phraseRappel([]) === '');
ok('liste absente -> silence', phraseRappel(null) === '');
ok('entrees invalides seules -> silence', phraseRappel([{ adr: '0xnope' }]) === '');
ok('un block : le rappel PARLE', phraseRappel([{ adr: A }]).length > 0);
ok('le rappel dit le COUT', /0\.001 ETH/.test(phraseRappel([{ adr: A }])));
/* ⛔ ET IL DIT QU ON PEUT QUAND MEME CREER — sinon on a retire le mur sans le dire. */
ok('le rappel dit qu on peut creer quand meme',
  /create another one/i.test(phraseRappel([{ adr: A }])), phraseRappel([{ adr: A }]));
ok('le compte est juste au pluriel', /^2 blocks/.test(phraseRappel([{ adr: A }, { adr: B }])));
ok('le singulier est correct', /^1 block /.test(phraseRappel([{ adr: A }])));
ok('les invalides ne sont pas comptees', /^1 block /.test(phraseRappel([{ adr: A }, { adr: 'x' }])));

console.log('');
console.log(n + ' assertions, ' + ko + ' KO');
if (ko) process.exit(1);
