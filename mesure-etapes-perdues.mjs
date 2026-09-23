/* mesure-etapes-perdues.mjs — QUELS CLICS L ENTONNOIR JETTE-T-IL EN SILENCE ?
 *
 * ⛔⛔ CE QUI A DECLENCHE CETTE MESURE. En cablant le rail fiat, j ai voulu verifier que ma nouvelle
 *     etape serait comptee. Elle ne l aurait pas ete : `/api/etape` valide le nom contre une liste
 *     blanche et, si le nom en est absent, il ne compte RIEN et ne dit RIEN. J ai alors regarde les
 *     etapes DEJA appelees par l app — et `create_fund_bridge`, le clic sur « Fund wallet », n y
 *     etait pas non plus.
 *
 * ⛔ C EST LE MOTIF `garde-sur-element-absent-toujours-fausse` applique a une MESURE : un compteur
 *    qui ne compte pas ne se plaint pas. Il rend zero, et zero se lit « personne n a clique » au
 *    lieu de « je n ai jamais regarde ». Phil demande depuis des jours ou on perd les gens.
 */
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('./app.html', import.meta.url), 'utf8');
const srv = readFileSync(new URL('./serveur-web.js', import.meta.url), 'utf8');

/* ⛔ Commentaires retires AVANT de decouper la liste : ceux qui la groupent contiennent des
 *   virgules, et un `split(',')` naif coupe en plein commentaire — ca m a fait accuser six etapes
 *   parfaitement presentes. Meme correctif que dans `test-etapes-comptees.mjs`. */
const srvNu = srv.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:'"\w])\/\/[^\n]*/g, '$1 ');
const mListe = /const ETAPES_ENTONNOIR = \[([\s\S]*?)\]/.exec(srvNu);
if (!mListe) {
  console.log('⛔ liste blanche introuvable — rien conclu (et surtout pas « tout va bien »)');
  process.exitCode = 1;
} else {
  const blanches = new Set(mListe[1].split(',').map((s) => s.trim().replace(/^'|'$/g, '')).filter(Boolean));

  /* ⛔ ON IGNORE LES COMMENTAIRES. Une de mes sondes a deja accuse un identifiant qui n existait que
   *   dans le commentaire expliquant son retrait. On enleve les commentaires du cote LU, jamais du
   *   cote de l univers de reference. */
  const sansCommentaires = html
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:'"\w])\/\/[^\n]*/g, '$1 ');

  const appelees = new Map();
  for (const m of sansCommentaires.matchAll(/\betape\(\s*'([a-z0-9_]+)'\s*\)/g)) {
    appelees.set(m[1], (appelees.get(m[1]) || 0) + 1);
  }

  /* ⛔⛔ LA SONDE S ACCUSE ELLE-MEME AVANT DE PUBLIER SON CHIFFRE. Ma premiere version comptait
   *     UNIQUEMENT `etape('nom_litteral')`. Or l app contient des appels comme
   *     `etape(bonne ? 'onramp_session_ok' : 'onramp_session_repli')` — que ce motif ne voit PAS.
   *     Le total « 33 perdues » etait donc un PLANCHER presente comme un total. On compte
   *     separement tous les `etape(` et on montre l ecart, pour qu aucun lecteur ne prenne le
   *     plancher pour la mesure complete. */
  const totalAppels = [...sansCommentaires.matchAll(/\betape\(/g)].length;
  const appelsLitteraux = [...appelees.values()].reduce((a, b) => a + b, 0);
  const nonResolus = totalAppels - appelsLitteraux;
  /* les noms caches dans une ternaire, recuperes a part — ils comptent aussi */
  const parTernaire = new Set();
  for (const m of sansCommentaires.matchAll(/\betape\(\s*[^)]*\?\s*'([a-z0-9_]+)'\s*:\s*'([a-z0-9_]+)'/g)) {
    parTernaire.add(m[1]); parTernaire.add(m[2]);
  }
  for (const e of parTernaire) if (!appelees.has(e)) appelees.set(e, 1);

  const perdues = [...appelees.keys()].filter((e) => !blanches.has(e)).sort();
  const jamaisAppelees = [...blanches].filter((e) => !appelees.has(e)).sort();

  console.log('═══ ENTONNOIR : CE QUI EST COMPTE, CE QUI EST JETE ═══\n');
  console.log('etapes sur la liste blanche du serveur : ' + blanches.size);
  console.log('etapes reellement appelees par l app    : ' + appelees.size + '\n');

  if (perdues.length) {
    console.log('⛔ ' + perdues.length + ' ETAPE(S) APPELEE(S) MAIS JETEE(S) EN SILENCE :');
    for (const e of perdues) console.log('   · ' + e.padEnd(28) + ' appelee ' + appelees.get(e) + '×  -> compte 0, pour toujours');
    console.log('   ⇒ chacune rend « 0 » dans le tableau de bord. Zero se lit « personne n a fait ca »');
    console.log('     alors que ca veut dire « je n ai jamais regarde ». C est un faux negatif payant.');
  } else {
    console.log('✅ aucune etape appelee n est absente de la liste blanche');
  }

  console.log('');
  if (jamaisAppelees.length) {
    console.log('⚠️ ' + jamaisAppelees.length + ' etape(s) sur la liste blanche que l app n appelle JAMAIS :');
    for (const e of jamaisAppelees) console.log('   · ' + e);
    console.log('   ⇒ elles ne sont pas un bug : elles resteront a 0 et ce 0 est SINCERE. Mais un 0');
    console.log('     sincere et un 0 aveugle se ressemblent dans un tableau — d ou cette sonde.');
  }

  console.log('\n── CE QUE CETTE SONDE VOIT, ET CE QU ELLE RATE ──────────────────────────────');
  console.log('   ' + totalAppels + ' appels a etape( dans la source · ' + appelsLitteraux + ' avec un nom litteral'
    + ' · ' + parTernaire.size + ' nom(s) recuperes dans une ternaire');
  if (nonResolus > parTernaire.size / 2) {
    console.log('   ⚠️ ' + nonResolus + ' appel(s) n ont PAS de nom litteral direct. Le compte de perdues');
    console.log('      ci-dessus est donc un PLANCHER, pas un total : un nom construit a l execution');
    console.log('      echappe a toute lecture statique. Ne pas citer ce chiffre comme exhaustif.');
  }
  console.log('⛔ CE QUE CETTE SONDE NE PEUT PAS DIRE : si les etapes comptees le sont CORRECTEMENT.');
  console.log('   Elle compare deux listes de noms ; elle ne regarde aucun compteur reel.');
  process.exitCode = perdues.length === 0 ? 0 : 1;
}
