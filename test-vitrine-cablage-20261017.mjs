/* test-vitrine-cablage-20261017.mjs - LA VITRINE EST CABLEE DE BOUT EN BOUT, ET LE SERVEUR NE CROIT QUE LA CHAINE.
 * AFFIRME (lecture des fichiers servis) : (1) app.html importe ref-vitrine.js, capture la ref par lireRefVitrine (ref == block) et
 *   joint &r= a signalerPaye depuis le premier contact garde ; (2) ref-vitrine.js est dans SERVIS (sinon page morte) ; (3) /api/paye
 *   n ecrit au registre QUE pour un frais externe verifie, et le createur vient de createurDuBlock (lecture on chain), jamais de q ;
 *   (4) createurDuBlock essaie createurs(bytes32) (7030) PUIS createurDe(bytes32) ; (5) la route publique existe et dit que du != paye.
 * NE PROUVE PAS : un vrai frais attribue (aucun frais externe vu a ce jour) ni la lecture on chain (voir le commit). */
import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';
let n = 0;
const vu = (c, m) => { assert.ok(c, m); n += 1; };
const app = readFileSync(new URL('./app.html', import.meta.url), 'utf8');
const srv = readFileSync(new URL('./serveur-web.js', import.meta.url), 'utf8');
vu(/import \{ lireRefVitrine, attribuer as attribuerVitrine, refActive as refVitrineActive \} from '\.\/ref-vitrine\.js';/.test(app), 'app importe ref-vitrine.js');
vu(/lireRefVitrine\(location\.search, \{ chain: CHAINE \}\)/.test(app), 'app capture la ref de la page (ref == block)');
const sp = app.slice(app.indexOf('function signalerPaye('), app.indexOf('function allerA('));
vu(/const r = vitrineActive\(\);/.test(sp) && /\(r \? '&r=' \+ r : ''\)/.test(sp), 'signalerPaye joint &r= depuis le premier contact garde');
const servis = srv.slice(srv.indexOf('const SERVIS = ['), srv.indexOf('];', srv.indexOf('const SERVIS = [')));
vu(servis.includes("'ref-vitrine.js'"), 'ref-vitrine.js est SERVI');
const paye = srv.slice(srv.indexOf("if (chemin === '/api/paye'"), srv.indexOf("if (chemin === '/api/registre-createurs')"));
vu(/if \(verif\.externe && \/\^0x\[0-9a-f\]\{40\}\$\/\.test\(r\)/.test(paye), 'registre : frais EXTERNE verifie seulement');
vu(/const createur = await createurDuBlock\(r\);/.test(paye) && !/q\.get\('c/.test(paye), 'createur lu par createurDuBlock, jamais pris dans la requete');
/* chasse 2026-10-17 (HIGH) : ni `r` ni `i` ne viennent plus du client */
vu(!/q\.get\('r'\)/.test(paye) && !/q\.get\('i'\)/.test(paye) && /const verif = v;/.test(paye), '/api/paye ne lit plus r ni i dans la requete');
vu(paye.indexOf('verifierFrais(') < paye.indexOf('createurDuBlock(r)'), 'la verification du frais precede l attribution');
const d0 = srv.indexOf('async function createurDuBlock('), f0 = /\r?\n\}\r?\n/.exec(srv.slice(d0));
const cdb = f0 ? srv.slice(d0, d0 + f0.index) : ''; /* la fonction ENTIERE (une fenetre fixe la coupait des qu elle grandissait) */
vu(cdb.length > 200, 'createurDuBlock lue en entier');
vu(/nos\.has\(String\(c\.hooks\)\.toLowerCase\(\)\)/.test(cdb) && /nos\.has\(String\(p\.hook\)\.toLowerCase\(\)\)/.test(cdb), 'les deux sources de pools filtrees sur NOS hooks');
vu(/for \(const sel of \[SEL_CREATEURS, SEL_CREATEUR_DE\]\)/.test(cdb) && /selecteurSrv\('createurs\(bytes32\)'\)/.test(srv), 'createurs(bytes32) (7030) avant createurDe(bytes32)');
vu(/chemin === '\/api\/registre-createurs'/.test(srv) && /Owed is not paid/.test(srv), 'route publique du registre, et elle dit que du n est pas paye');
console.log('ok vitrine-cablage - ' + n + ' assertions ; NE PROUVE PAS un frais attribue reel');
