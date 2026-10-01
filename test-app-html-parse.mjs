/* test-app-html-parse.mjs — CHAQUE <script> INLINE DE CHAQUE PAGE DOIT PARSER.
 *
 * ⛔⛔ LA CLASSE DE DEFAUT QUE CETTE GARDE FERME. `app.html` porte **un seul** <script type="module">
 *     de plus de 16 000 lignes, edite a la main, servi TEL QUEL au navigateur : il n y a ni bundler
 *     ni transpileur entre l edition et la production. Une erreur de syntaxe n y casse pas « une
 *     fonction » — elle empeche le module ENTIER de s evaluer. Aucun `addEventListener` ne se pose,
 *     aucun onglet ne s ouvre, la page s affiche et NE FAIT RIEN. Et cote serveur tout est vert :
 *     HTTP 200, octets servis, `/sante` d accord. Le seul endroit ou ce defaut existe est la
 *     console du visiteur.
 *   ⇒ C est la forme extreme du motif deja paye ici : un deploiement VERT sur une app MORTE.
 *
 * ⛔ CE QU ELLE SAIT PROUVER : que le texte de chaque script inline est du JavaScript PARSABLE,
 *    avec la bonne grammaire (module vs classique — `import` au niveau haut n est legal que dans un
 *    module, et un parseur classique le refuserait a tort).
 * ⛔ CE QU ELLE NE PEUT PAS PROUVER, ET QU ELLE LE DIT :
 *    · parser n est pas EXECUTER. Un `undefined is not a function` passe cette garde sans broncher.
 *    · elle ne lit pas les scripts EXTERNES (`src=`) : ce sont des fichiers a part, parsables
 *      directement par `node --check`, et les melanger masquerait lequel a casse.
 *    · elle ne dit rien de l ORDRE d evaluation ni des dependances entre scripts.
 *
 * ⛔⛔ POURQUOI ELLE PORTE SES TEMOINS. Une sonde de syntaxe qui n a jamais dit KO est
 *     indiscernable d une sonde dont l extraction est cassee : si la regexp ne capture plus rien,
 *     « 0 KO » s affiche et tout a l air parfait. Ce depot a deja vu un banc VERT sur une
 *     transaction `status 0x0`. Donc :
 *       TEMOIN 1 — un script delibrement casse DOIT etre rapporte KO ;
 *       TEMOIN 2 — un `type` non-JS (JSON-LD) DOIT etre compte comme SAUTE, jamais comme « ok » ;
 *       TEMOIN 3 — un `import` au niveau haut d un module DOIT passer, et le MEME texte dans un
 *                  script classique DOIT echouer. C est ce qui prouve que la grammaire est choisie
 *                  et non devinee — la v1 de cette sonde accusait notre vrai module pour ca.
 *       TEMOIN 4 — le compte de scripts PARSES doit etre > 0 sur la vraie page. Un zero ici n est
 *                  pas un succes, c est une extraction morte.
 */
import { readFileSync, writeFileSync, mkdtempSync, rmSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';

const D = new URL('./', import.meta.url);
/* ⛔ TOUTES les pages, pas seulement `app.html` : `block-0.html` et les autres portent du script
 *   inline eux aussi, et une garde qui n en couvre qu une laisse les autres sans filet. */
const PAGES = readdirSync(D).filter((f) => f.endsWith('.html'));

const TYPES_JS = /^(module|text\/javascript|application\/javascript)$/i;

/** Extrait les <script> d un texte HTML et dit, pour chacun, ce qu on en fait et pourquoi. */
function scriptsDe(html) {
  const out = [];
  const re = /<script([^>]*)>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html))) {
    const attrs = m[1] || '', corps = m[2];
    const ligne = html.slice(0, m.index).split('\n').length;
    if (/\bsrc\s*=/i.test(attrs)) { out.push({ ligne, sort: 'saute', pourquoi: 'externe (src=)' }); continue; }
    const t = (attrs.match(/type\s*=\s*["']?([^"'\s>]+)/i) || [])[1] || '';
    /* ⛔ UN TYPE NON-JS N EST PAS UNE ERREUR DE JS. JSON-LD, importmap, gabarit : on les NOMME
     *   et on saute. Les passer au parseur fabriquerait des KO sur du contenu parfaitement valide
     *   — c est litteralement ce que ma premiere version a fait sur notre bloc JSON-LD. */
    if (t && !TYPES_JS.test(t)) { out.push({ ligne, sort: 'saute', pourquoi: 'type ' + t }); continue; }
    out.push({ ligne, sort: 'parser', module: /^module$/i.test(t), corps });
  }
  return out;
}

/** @returns {{ko:string[], parses:number, sautes:number}} */
function verifier(html, nomPage) {
  const dir = mkdtempSync(join(tmpdir(), 'tb-parse-'));
  const ko = [];
  let parses = 0, sautes = 0;
  try {
    for (const [i, s] of scriptsDe(html).entries()) {
      if (s.sort === 'saute') { sautes += 1; continue; }
      /* ⛔ L EXTENSION CHOISIT LA GRAMMAIRE : `.mjs` = module, `.cjs` = classique. C est ce qui
       *   rend le TEMOIN 3 possible. */
      const f = join(dir, 's' + i + (s.module ? '.mjs' : '.cjs'));
      writeFileSync(f, s.corps);
      parses += 1;
      try { execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' }); }
      catch (e) {
        const msg = String((e && e.stderr) || e.message).split('\n').filter(Boolean).slice(0, 3).join(' | ');
        ko.push(nomPage + ' script#' + (i + 1) + ' (' + (s.module ? 'module' : 'classique')
          + ', debute ligne ' + s.ligne + ') : ' + msg);
      }
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
  return { ko, parses, sautes };
}

let n = 0, echecs = 0;
const ok = (nom, cond, vu) => {
  n += 1;
  if (cond) { console.log('  ok  ' + nom); return true; }
  echecs += 1; console.log('  KO  ' + nom + (vu === undefined ? '' : '   vu: ' + vu));
  return false;
};

console.log('=== LES TEMOINS : cette sonde sait-elle dire NON ? ===');
const T1 = verifier('<script type="module">const a = (;</script>', 'temoin1');
ok('TEMOIN 1 — un script casse est rapporte KO', T1.ko.length === 1, T1.ko.length + ' KO');
const T2 = verifier('<script type="application/ld+json">{"@type":"not js at all" :: }</script>', 'temoin2');
ok('TEMOIN 2 — un type non-JS est SAUTE, pas parse', T2.sautes === 1 && T2.parses === 0 && !T2.ko.length,
  T2.parses + ' parses, ' + T2.sautes + ' sautes, ' + T2.ko.length + ' KO');
const IMPORT = "import { x } from './y.js';\nconsole.log(x);";
const T3a = verifier('<script type="module">' + IMPORT + '</script>', 'temoin3a');
const T3b = verifier('<script>' + IMPORT + '</script>', 'temoin3b');
ok('TEMOIN 3 — `import` passe en module ET echoue en classique : la grammaire est CHOISIE',
  T3a.ko.length === 0 && T3a.parses === 1 && T3b.ko.length === 1,
  'module ' + T3a.ko.length + ' KO / classique ' + T3b.ko.length + ' KO');
const T4 = verifier('<script src="/x.js"></script>', 'temoin4');
ok('TEMOIN 3b — un script externe est saute, jamais parse', T4.sautes === 1 && T4.parses === 0);

console.log('');
console.log('=== LES PAGES REELLES ===');
ok('il y a au moins une page a verifier', PAGES.length > 0, PAGES.length);
let totalParses = 0;
for (const p of PAGES) {
  const r = verifier(readFileSync(new URL(p, D), 'utf8'), p);
  totalParses += r.parses;
  const d = r.parses + ' parse(s), ' + r.sautes + ' saute(s)';
  if (!ok(p + ' — ' + d, r.ko.length === 0, r.ko.length + ' KO')) for (const l of r.ko) console.log('        ' + l);
}
/* ⛔⛔ TEMOIN 4 : SANS CETTE LIGNE, UNE EXTRACTION MORTE SERAIT VERTE. « 0 script parse, 0 KO » est
 *     la signature exacte d une regexp cassee, et elle ressemble a un succes. Un zero qui NE PEUT
 *     PAS etre legitime doit etre une assertion. */
ok('TEMOIN 4 — au moins un script inline a REELLEMENT ete parse sur les vraies pages',
  totalParses > 0, totalParses);

console.log('');
console.log(n + ' assertions, ' + echecs + ' KO');
process.exit(echecs ? 1 : 0);
