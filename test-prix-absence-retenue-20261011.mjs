/* test-prix-absence-retenue-20261011.mjs - UNE ABSENCE DE PRIX REPONDUE PAR LE SERVEUR N EST PLUS REDEMANDEE A CHAQUE REPEINTURE.
 * Mesure prod (2026-10-11, ancien code) : 193 /api/prix-usd pour 73 adresses en 25 s, les plus repetees (x5) = « no market above the
 *   1000 USD noise floor » (absence REPONDUE) ; sur une autre page : 113 requetes, 30 adresses repetees. Seuls les succes etaient retenus.
 * AFFIRME (EXECUTE assurerPrixDevise extrait d app.html, prixUsdDevise bouchonne) : une absence repondue n est pas redemandee pendant
 *   5 min, l est apres ; une panne reseau (rien retenu) est redemandee ; un succes l est comme avant. Et prixUsdDeviseBrut ne retient
 *   l absence QUE sur une reponse ok:false du serveur, jamais dans son catch.
 * NE PROUVE PAS : le nombre de requetes d une vraie visite (mesure locale apres correctif : 58 requetes, 58 adresses, 0 repetition - mais
 *   carte plus petite qu en prod). */
import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';
const html = readFileSync(process.env.TB_APP || new URL('./app.html', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
let n = 0;
const vu = (c, m) => { assert.ok(c, m); n += 1; };
const i = html.indexOf('function assurerPrixDevise(');
vu(i > 0 && html.includes('const prixUsdAbsentsLus = new Map();'), 'app.html ne retient pas les absences de prix');
const m = /\n\}\n/.exec(html.slice(i));
const src = html.slice(i, i + m.index + m[0].length);
const iB = html.indexOf('async function prixUsdDeviseBrut(');
const brut = html.slice(iB, iB + /\n\}\n/.exec(html.slice(iB)).index);
vu(/if \(d && d\.ok === false\) prixUsdAbsentsLus\.set\(String\(adr\)\.toLowerCase\(\), Date\.now\(\)\);/.test(brut)
  && !/catch \(_\) \{[^}]*prixUsdAbsentsLus/.test(brut), 'l absence n est retenue QUE sur une reponse ok:false, jamais sur une panne');
const ADR = '0xb2000000000000000000007b9fcbd005511acbd5';
const monde = (reponse) => {
  const env = { appels: 0, maintenant: 1_000_000, absents: new Map(), lus: new Map(), enVol: new Set() };
  const prixUsdDevise = async (adr) => {
    env.appels += 1;
    if (reponse === 'absent') { env.absents.set(String(adr).toLowerCase(), env.maintenant); return null; }
    if (reponse === 'panne') return null;
    return 123.4;
  };
  const fn = new Function('prixUsdDeviseLus', 'prixDeviseEnVol', 'prixUsdAbsentsLus', 'PRIX_ABSENT_MS', 'pairesProposees', 'CHAINE', 'prixUsdDevise', 'peindrePaireChips', 'Date',
    src + '\nreturn assurerPrixDevise;');
  const assurer = fn(env.lus, env.enVol, env.absents, 300000, () => [{ symbole: 'SPCXc', adr: ADR }], 8453, prixUsdDevise, () => {}, { now: () => env.maintenant });
  return { env, assurer };
};
const tic = () => new Promise((r) => setTimeout(r, 5));
let w = monde('absent');
w.assurer('SPCXc'); await tic(); w.assurer('SPCXc'); await tic(); w.assurer('SPCXc'); await tic();
vu(w.env.appels === 1, 'absence repondue : redemandee ' + w.env.appels + ' fois au lieu d une seule');
w.env.maintenant += 300001; w.assurer('SPCXc'); await tic();
vu(w.env.appels === 2, 'apres 5 min, l absence est relue');
w = monde('panne');
w.assurer('SPCXc'); await tic(); w.assurer('SPCXc'); await tic();
vu(w.env.appels === 2, 'une panne reseau n est jamais retenue : relue a la repeinture suivante');
w = monde('prix');
w.assurer('SPCXc'); await tic(); w.assurer('SPCXc'); await tic();
vu(w.env.appels === 1 && w.env.lus.get('SPCXc') === 123.4, 'un succes est retenu comme avant');
console.log('ok prix-absence-retenue - ' + n + ' assertions ; NE PROUVE PAS le compte d une vraie visite');
