/* mesure-berceau-375.mjs — l avertissement « seize » tient-il en 3 lignes a 375 px ? MESURE, pas estimee.
 *
 * Copie app.html dans un dossier temporaire, y injecte un script qui ecrit les DEUX textes (actif, inconnu),
 * produits par `texteSaisie` de berceau-24h.js, dans #cSaisie (Create) et #pSaisie (profil), puis compte
 * les lignes rendues (hauteur / line-height) dans une iframe de 375 px servie en local. Chrome headless.
 * Pas un test de la suite (il lui faut un navigateur) : `node mesure-berceau-375.mjs`, code 0 = tout <= 3.
 * TEMOIN : un texte double DOIT depasser 3 lignes — sinon la mesure ne mesure rien. */
import { readFileSync, writeFileSync, mkdtempSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { texteSaisie } from './berceau-24h.js';

const CHROME = process.env.CHROME || 'google-chrome';
const SYMS = ['NVDAc', 'AAPLc', 'GOOGLc', 'TBLOCK', 'OUSD'];
const textes = {};
for (const s of SYMS) for (const e of ['enabled', 'unknown']) textes[s + '/' + e] = texteSaisie(s, e, true);
textes['TEMOIN-double'] = textes['GOOGLc/unknown'] + ' ' + textes['GOOGLc/unknown'];
const d = mkdtempSync(join(tmpdir(), 'm375-'));
const inj = `<script>addEventListener('load',()=>setTimeout(()=>{const T=${JSON.stringify(textes)};const o={vw:innerWidth};
const montrer=(el)=>{for(let e=el;e&&e!==document.body;e=e.parentElement){if(getComputedStyle(e).display==='none')e.style.display='block';e.hidden=false;}};
for(const id of ['cSaisie','pSaisie']){const el=document.getElementById(id);montrer(el);for(const[k,t]of Object.entries(T)){el.textContent=t;const lh=parseFloat(getComputedStyle(el).lineHeight);o[id+' '+k]=Math.round(el.getBoundingClientRect().height/lh);}}
parent.document.title='M375'+JSON.stringify(o);},800));</script>`;
writeFileSync(join(d, 'app.html'), readFileSync('app.html', 'utf8').replace('</body>', inj + '</body>'));
writeFileSync(join(d, 'cadre.html'), '<html><body style="margin:0"><iframe src="app.html" style="width:375px;height:812px;border:0"></iframe></body></html>');
const srv = createServer((q, r) => { try { r.end(readFileSync(join(d, q.url.split('?')[0].replace(/^\//, '') || 'cadre.html'))); } catch { r.statusCode = 404; r.end(); } });
await new Promise((ok) => srv.listen(0, '127.0.0.1', ok));
let dom = '';
try {
  /* ASYNCHRONE : un appel synchrone bloquerait la boucle d evenements, donc le serveur ci-dessus. */
  ({ stdout: dom } = await promisify(execFile)(CHROME, ['--headless=new', '--no-sandbox', '--disable-gpu', '--window-size=800,900', '--virtual-time-budget=10000', '--dump-dom', `http://127.0.0.1:${srv.address().port}/cadre.html`], { encoding: 'utf8', timeout: 90000, maxBuffer: 64 << 20 }));
} finally { srv.close(); }
const m = dom.match(/M375(\{[^<]*\})/);
if (!m) { console.log('KO  aucune mesure (Chrome absent ou page non chargee)'); process.exit(1); }
const o = JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&'));
let ko = 0;
console.log('viewport ' + o.vw + ' px' + (o.vw === 375 ? '' : '  KO (attendu 375)')); if (o.vw !== 375) ko++;
for (const [k, n] of Object.entries(o)) {
  if (k === 'vw') continue;
  const temoin = k.endsWith('TEMOIN-double');
  const bon = temoin ? n > 3 : n <= 3;
  if (!bon) ko++;
  console.log(`${bon ? 'ok' : 'KO'}  ${k.padEnd(26)} ${n} ligne(s)${temoin ? '  (temoin : doit depasser 3)' : ''}`);
}
console.log(`\n${ko} KO`);
process.exit(ko ? 1 : 0);
