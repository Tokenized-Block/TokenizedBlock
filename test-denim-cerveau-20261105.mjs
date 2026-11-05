// test-denim-cerveau-20261105.mjs — LE SILENCE DU CERVEAU SE CONVERTIT AU TEMPS DE BLOC MESURE (Denim : 2 s -> 200 ms/bloc).
// AVANT : cerveau-echange.js silenceDepuisBlocs avait `blocsParJour = 43200` par defaut, et journal-cerveau.js ne passait rien :
//   apres Denim, 43 200 blocs = 2,4 h, et le block aurait dit « quiet for 24 hours » (DEJA_PERDU, reclame un echange) a tort.
// AFFIRME (EXECUTION de silenceDepuisBlocs, decisionEchange, pensees) : a 2 s, a 0,2 s, et « non mesure » -> NON_MESURE (rien reclame) ;
//   temoins (un vrai silence long reclame bien) ; MUTANTS (l ancien code de HEAD, un repli a 2 s, le journal qui ne passe pas le temps)
//   doivent etre TUES.
// NE PROUVE PAS : le temps de bloc reel de mainnet apres Denim ; ni que /api/tirage le sert au Brain (lecture de source seulement).
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

let n = 0;
const vu = (c, m) => { assert.ok(c, m); n++; };
const ICI = new URL('./', import.meta.url);
const lire = (f) => readFileSync(new URL(f, ICI), 'utf8');

/** le banc : rend la liste des assertions RATEES (vide = vert) pour une paire de modules */
function banc(CE, JC) {
  const rates = [];
  const ok = (c, m) => { try { if (!c) rates.push(m); } catch (e) { rates.push(m + ' (' + e.message + ')'); } };
  const S = (o) => { try { return CE.silenceDepuisBlocs(o); } catch (e) { return 'THROW ' + e.message; } };
  const D = (silenceH) => CE.decisionEchange({ silenceH, transferts: 40, depuisRappelH: 100 });
  /* 2 s/bloc : inchange */
  ok(S({ dernierBloc: 1000, blocFin: 1000 + 43200, sParBloc: 2 }) === 24, '2 s : 43 200 blocs = 24 h');
  ok(D(S({ dernierBloc: 1000, blocFin: 1000 + 43200 * 4, sParBloc: 2 })).etat === 'DEJA_PERDU', '2 s : 4 jours de blocs -> DEJA_PERDU');
  /* 0,2 s/bloc (Denim) */
  const h = S({ dernierBloc: 1000, blocFin: 1000 + 43200, sParBloc: 0.2 });
  ok(Math.abs(h - 2.4) < 1e-9, '0,2 s : 43 200 blocs = 2,4 h (lu : ' + h + ')');
  ok(D(h).etat === 'PAS_ENCORE' && D(h).reclame === false, '0,2 s : 43 200 blocs de silence -> PAS_ENCORE, rien reclame');
  ok(D(S({ dernierBloc: 0, blocFin: 18000 * 18, sParBloc: 0.2 })).etat === 'BIENTOT_PERDU', '0,2 s : 324 000 blocs = 18 h -> BIENTOT_PERDU');
  ok(D(S({ dernierBloc: 0, blocFin: 432000, sParBloc: 0.2 })).etat === 'DEJA_PERDU', '0,2 s : 432 000 blocs = 24 h -> DEJA_PERDU (temoin : la regle des 24 h tient)');
  /* non mesure : refuser de conclure */
  const nm = S({ dernierBloc: 1000, blocFin: 1000 + 43200 * 4 });
  ok(typeof nm === 'number' && Number.isNaN(nm), 'non mesure : NaN (lu : ' + nm + ')');
  ok(D(nm).etat === 'NON_MESURE' && D(nm).reclame === false, 'non mesure : NON_MESURE, rien reclame');
  for (const s of [0, -1, 1e9, NaN, '2', undefined, null]) {
    const v = S({ dernierBloc: 1, blocFin: 43201, sParBloc: s });
    ok(D(v).reclame === false, 'temps de bloc implausible ' + String(s) + ' : rien reclame (lu : ' + v + ')');
  }
  /* les cas douteux de blocs restent null (inchange) */
  ok(S({ dernierBloc: 200, blocFin: 100, sParBloc: 0.2 }) === null, 'dernier bloc apres la tete : null (inchange)');
  ok(S({ dernierBloc: 1, blocFin: 43201, blocsParJour: 43200 }) === 24, 'blocsParJour EXPLICITE : honore');
  /* le journal (pensees) passe le temps de bloc */
  const nourr = (o) => ({ etat: 'LUE', gm: 5, messages: 1, detenteurs: 3, mort: false, transfertsTotal: 40, ...o });
  const commun = { phase: 'EVEILLE', vie: 1, etatVie: 'LUE', memoire: 0.1, spikes: 3, symbole: 'TST' };
  const quiet = (r) => r.some((p) => /quiet for/i.test(p.texte));
  let p1, p2, p3, p4;
  try {
    p1 = JC.pensees({ ...commun, sParBloc: 0.2, nourriture: nourr({ dernierBloc: 1000, blocFin: 1000 + 43200 }) });
    p2 = JC.pensees({ ...commun, sParBloc: 0.2, nourriture: nourr({ dernierBloc: 1000, blocFin: 1000 + 432000 * 2 }) });
    p3 = JC.pensees({ ...commun, nourriture: nourr({ dernierBloc: 1000, blocFin: 1000 + 43200 * 4 }) });
    p4 = JC.pensees({ ...commun, sParBloc: 2, nourriture: nourr({ dernierBloc: 1000, blocFin: 1000 + 43200 * 4 }) });
  } catch (e) { rates.push('pensees a leve : ' + e.message); return rates; }
  ok(!quiet(p1), 'journal 0,2 s : 2,4 h de silence -> aucune demande « quiet for »');
  ok(quiet(p2) && p2.find((p) => /quiet for/i.test(p.texte)).texte.includes('48 hours'), 'journal 0,2 s : 864 000 blocs -> « quiet for 48 hours » (temoin)');
  ok(!quiet(p3), 'journal non mesure : aucune demande (meme 172 800 blocs)');
  ok(quiet(p4), 'journal 2 s : 4 jours -> demande (temoin, inchange)');
  return rates;
}

/* 1. le vrai code : vert */
const CE = await import(new URL('./cerveau-echange.js', ICI));
const JC = await import(new URL('./journal-cerveau.js', ICI));
const r0 = banc(CE, JC);
vu(r0.length === 0, 'banc vert sur le code : ' + r0.join(' | '));

/* 2. les MUTANTS (copies dans un dossier temporaire, imports reecrits vers ce dossier-ci) : chacun doit etre tue */
const dir = mkdtempSync(join(tmpdir(), 'mut-denim-cerveau-'));
const abs = (f) => pathToFileURL(new URL(f, ICI).pathname.replace(/^\/([A-Za-z]:)/, '$1')).href;
const reecrire = (src) => src.replace(/from '\.\/(temps-de-bloc|cerveau)\.js'/g, (m, f) => "from '" + abs(f + '.js') + "'");
let k = 0;
async function mutant(nom, srcCE, srcJC) {
  k += 1;
  const fCE = join(dir, 'ce' + k + '.mjs'), fJC = join(dir, 'jc' + k + '.mjs');
  writeFileSync(fCE, reecrire(srcCE));
  writeFileSync(fJC, reecrire(srcJC).replace(/from '\.\/cerveau-echange\.js'/, "from '" + pathToFileURL(fCE).href + "'"));
  const r = banc(await import(pathToFileURL(fCE).href), await import(pathToFileURL(fJC).href));
  vu(r.length > 0, 'mutant TUE — ' + nom + ' (' + r.length + ' rate(s), ex. : ' + (r[0] || '-') + ')');
}
const srcCE = lire('cerveau-echange.js'), srcJC = lire('journal-cerveau.js');
let headCE = null, headJC = null;
try {
  headCE = execFileSync('git', ['show', 'HEAD:cerveau-echange.js'], { cwd: new URL('.', ICI).pathname.replace(/^\/([A-Za-z]:)/, '$1'), encoding: 'utf8' });
  headJC = execFileSync('git', ['show', 'HEAD:journal-cerveau.js'], { cwd: new URL('.', ICI).pathname.replace(/^\/([A-Za-z]:)/, '$1'), encoding: 'utf8' });
} catch (_) { headCE = null; }
try {
  /* l ancien code n est un mutant que tant que HEAD le porte (avant le commit) ; ensuite la constante est remise a la main ci-dessous */
  if (headCE && /blocsParJour = 43200 \}\) \{/.test(headCE)) await mutant('ancien code (HEAD) : 43 200 blocs/jour par defaut', headCE, headJC);
  const m43200 = srcCE.replace("sParBloc = null, blocsParJour = null }", "sParBloc = null, blocsParJour = 43200 }");
  vu(m43200 !== srcCE, 'mutant 43200 applique');
  await mutant('defaut 43 200 blocs/jour remis', m43200, srcJC);
  const m2s = srcCE.replace('return s === null ? NaN : s / 3600;', 'return s === null ? ((blocFin - dernierBloc) * 2) / 3600 : s / 3600;');
  vu(m2s !== srcCE, 'mutant repli 2 s applique');
  await mutant('non mesure -> repli a 2 s', m2s, srcJC);
  const mJ = srcJC.replace('blocFin: n.blocFin, sParBloc }', 'blocFin: n.blocFin }');
  vu(mJ !== srcJC, 'mutant journal applique');
  await mutant('le journal ne passe pas sParBloc', srcCE, mJ);
} finally { rmSync(dir, { recursive: true, force: true }); }

/* 3. la colle : app.html passe le temps de bloc servi au journal */
const APP = lire('app.html');
const i = APP.indexOf('const nouvelles = pensees({');
vu(i > 0 && /sParBloc: sParBlocApp \}\);/.test(APP.slice(i, i + 600)), 'app.html : pensees recoit sParBloc: sParBlocApp');

console.log('ok denim-cerveau — ' + n + ' assertions (dont ' + k + ' mutants tues) ; NE PROUVE PAS le temps de bloc reel de mainnet');
