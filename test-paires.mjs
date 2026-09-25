/* test-paires.mjs — LE TEST QUE `paires.js` ANNONÇAIT ET QUI N EXISTAIT PAS.
 *
 * ⛔⛔ `paires.js` porte, en tete de fichier, cette phrase : « Le registre est RECOPIE de
 *     `index.html` (STOCKS_BASE_REGISTRY, liste publiee des emetteurs Coinbase B20), et
 *     `test-paires.mjs` le compare au fichier. » Et plus bas : « Un test compare les deux listes,
 *     adresse par adresse. »
 *     CE FICHIER N EXISTAIT PAS. Deux affirmations de garde, zero garde — pendant que la ligne
 *     suivante dit pourquoi elle compte : « Un ticker invente mettrait l argent de quelqu un dans
 *     un jeton que personne n a verifie. »
 *
 * ⛔ C EST PIRE QU UNE GARDE MANQUANTE : c est une garde ANNONCEE. En relisant `paires.js` on
 *   conclut que la divergence est surveillee, donc on ne la surveille pas autrement. Une promesse
 *   de garde desarme la vigilance exactement comme une garde le ferait — sans rien garder.
 *
 * ⛔ VERIFICATION FAITE A LA MAIN LE 2026-09-25, avant d ecrire ce fichier : 13/13 concordent,
 *   adresse par adresse, et les 13 symboles + decimales ont ete relus SUR LA CHAINE (toutes a 8
 *   decimales, 0 divergence). Il manquait donc la garde, pas l exactitude.
 *
 * ⛔ CE QUE CE TEST NE PROUVE PAS : que ces adresses SONT les vraies actions Coinbase. Il prouve
 *   que les deux copies du depot disent la meme chose. La verite vient de la chaine — et elle a ete
 *   lue le 2026-09-25 ; la relire ici demanderait un reseau, ce qu un test de suite ne fait pas.
 */
import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';
import { ACTIONS_COINBASE, pairesProposees } from './paires.js';

const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
let n = 0;
const v = (nom, fn) => { fn(); n++; };

/** Le registre source, lu dans `index.html` — la copie dont `paires.js` dit descendre. */
function registreSource() {
  const d = html.indexOf('const STOCKS_BASE_REGISTRY = [');
  assert.ok(d > 0, 'STOCKS_BASE_REGISTRY est introuvable dans index.html : ce test ne compare plus rien');
  const fin = html.indexOf('];', d);
  assert.ok(fin > d, 'le registre source ne se referme pas');
  const bloc = html.slice(d, fin);
  const out = [];
  for (const m of bloc.matchAll(/\{\s*symbol:\s*'([^']+)'\s*,\s*nom:\s*'([^']*)'\s*,\s*adr:\s*'(0x[0-9a-fA-F]{40})'\s*\}/g)) {
    out.push({ symbole: m[1], nom: m[2], adr: m[3] });
  }
  return out;
}

const source = registreSource();

v('⛔⛔ les deux listes ont le MEME nombre d entrees', () => {
  /* ⛔⛔ Une entree ajoutee d un cote et pas de l autre est la forme la plus simple de la
   *     divergence — et la plus facile a ne pas voir en relecture. */
  assert.ok(source.length > 0, 'aucune entree lue dans index.html : l extraction est cassee');
  assert.equal(ACTIONS_COINBASE.length, source.length,
    'paires.js declare ' + ACTIONS_COINBASE.length + ' actions, index.html en publie '
    + source.length + ' : les deux listes ont diverge');
});

v('⛔⛔ chaque adresse concorde, symbole par symbole', () => {
  /* ⛔⛔ LE CAS CENTRAL, et c est de l argent : « un ticker invente mettrait l argent de quelqu un
   *     dans un jeton que personne n a verifie » — la phrase est de `paires.js`. Une adresse qui
   *     derive fait appairer un block a autre chose que ce que l ecran annonce. */
  const parSymbole = new Map(source.map((s) => [s.symbole, s.adr.toLowerCase()]));
  for (const a of ACTIONS_COINBASE) {
    const attendue = parSymbole.get(a.symbole);
    assert.ok(attendue, 'le symbole ' + a.symbole + ' de paires.js est absent du registre publie');
    assert.equal(String(a.adr).toLowerCase(), attendue,
      'ADRESSE DIVERGENTE pour ' + a.symbole + ' : paires.js dit ' + a.adr
      + ', index.html dit ' + attendue);
  }
});

v('⛔ aucun symbole du registre ne manque dans paires.js', () => {
  /* ⛔ Le controle INVERSE, qui manquait a ma premiere idee de ce test : comparer dans un seul sens
   *   laisse passer une action publiee que l app ne proposerait jamais. */
  const connus = new Set(ACTIONS_COINBASE.map((a) => a.symbole));
  const absents = source.filter((s) => !connus.has(s.symbole)).map((s) => s.symbole);
  assert.deepEqual(absents, [],
    'publies dans index.html mais absents de paires.js : ' + absents.join(', '));
});

v('⛔ aucune adresse en double, des deux cotes', () => {
  /* ⛔ Deux symboles sur la meme adresse, c est un copier-coller rate — et l un des deux mene au
   *   mauvais jeton, silencieusement. */
  for (const [nom2, liste] of [['paires.js', ACTIONS_COINBASE], ['index.html', source]]) {
    const vues = new Map();
    for (const a of liste) {
      const bas = String(a.adr).toLowerCase();
      assert.ok(!vues.has(bas),
        nom2 + ' : ' + a.symbole + ' et ' + vues.get(bas) + ' partagent l adresse ' + bas);
      vues.set(bas, a.symbole);
    }
  }
});

v('⛔⛔ les actions ne sont proposees QUE sur Base mainnet', () => {
  /* ⛔⛔ Les proposer ailleurs enverrait vers des adresses qui n y sont pas des actions — donc vers
   *     un contrat inconnu, ou vers rien. `paires.js` le dit ; on le verifie. */
  const surBase = pairesProposees(8453).filter((p) => p.type === 'ACTION');
  assert.equal(surBase.length, ACTIONS_COINBASE.length,
    'toutes les actions ne sont pas proposees sur Base : ' + surBase.length);
  const surSepolia = pairesProposees(84532).filter((p) => p.type === 'ACTION');
  assert.deepEqual(surSepolia, [],
    'des actions Coinbase sont proposees hors de Base mainnet : leurs adresses n y designent rien');
});

v('⛔ toutes les adresses sont bien formees', () => {
  for (const a of [...ACTIONS_COINBASE, ...source]) {
    assert.match(String(a.adr), /^0x[0-9a-fA-F]{40}$/,
      'adresse mal formee pour ' + a.symbole + ' : ' + a.adr);
  }
});

assert.equal(n, 6, 'compte de cas inattendu : ' + n);
console.log('ok paires — ' + n + ' cas · ' + ACTIONS_COINBASE.length
  + ' actions comparees adresse par adresse, dans LES DEUX SENS.');
console.log('⚠️ NE PROUVE PAS que ces adresses soient les vraies actions Coinbase : il prouve que');
console.log('   les deux copies du depot disent la meme chose. La chaine a tranche le 2026-09-25 —');
console.log('   13/13 symboles et decimales lus, 0 divergence.');
