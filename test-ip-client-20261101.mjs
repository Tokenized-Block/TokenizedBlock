// test-ip-client-20261101.mjs — game81 : l IP du visiteur n est plus celle que le client ecrit.
// PROUVE : serveur-web.js n a plus aucune lecture du PREMIER element de x-forwarded-for ; les 7 budgets par IP passent par ipClient ;
//   ipClient (extrait du fichier et execute sur une copie) rend le DERNIER element (ajoute par le proxy), la socket sans en-tete,
//   et un client qui ecrit « 1.2.3.4, » devant ne change pas l IP retenue. Un mutant qui remet l ancienne lecture est tue.
// NE PROUVE PAS : ce que l edge Railway met reellement dans l en-tete (sonde en prod a part).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

let n = 0;
const ok = (c, m) => { assert.ok(c, m); n++; };
const ICI = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.join(ICI, 'serveur-web.js'), 'utf8');

ok(!/x-forwarded-for'\][^\n]*\.split\(','\)\[0\]/.test(src), 'plus aucune lecture du PREMIER element de x-forwarded-for');
ok((src.match(/ipClient\(req\)/g) || []).length >= 7, 'les budgets par IP passent par ipClient (' + (src.match(/ipClient\(req\)/g) || []).length + ' appels)');

/* la fonction elle-meme, extraite telle quelle dans un module temporaire (le serveur ne s importe pas sans demarrer) */
const m = /function ipClient\(req\) \{[\s\S]*?\n\}/.exec(src);
ok(m !== null, 'ipClient est definie dans serveur-web.js');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'ip-client-'));
async function charger(code, nom) { const f = path.join(TMP, nom + '.mjs'); fs.writeFileSync(f, code + '\nexport { ipClient };\n'); return (await import(pathToFileURL(f).href)).ipClient; }
const ip = await charger(m[0], 'vrai');
const req = (xff, sock = '10.9.9.9') => ({ headers: xff === undefined ? {} : { 'x-forwarded-for': xff }, socket: { remoteAddress: sock } });
ok(ip(req('203.0.113.7')) === '203.0.113.7', 'un seul element (l edge remplace l en-tete) : celui-la');
ok(ip(req('1.2.3.4, 203.0.113.7')) === '203.0.113.7', 'un client qui ecrit « 1.2.3.4 » devant : l IP retenue reste celle du proxy');
ok(ip(req('1.1.1.1, 2.2.2.2, 203.0.113.7')) === '203.0.113.7', 'plusieurs elements forges : toujours le dernier');
ok(ip(req(undefined)) === '10.9.9.9' && ip(req('')) === '10.9.9.9', 'sans en-tete : l adresse de la socket');
ok(ip(req(' 203.0.113.7 , ')) === '203.0.113.7', 'espaces et virgule finale ignores');

/* mutant : l ancienne lecture (premier element) — le banc doit le tuer */
const mut = await charger(m[0].replace('xff[xff.length - 1]', 'xff[0]'), 'mutant');
assert.notEqual(m[0], m[0].replace('xff[xff.length - 1]', 'xff[0]'), 'mutant applique');
const tue = mut(req('1.2.3.4, 203.0.113.7')) !== '203.0.113.7';
ok(tue, 'MUTANT « premier element » : TUE');
fs.rmSync(TMP, { recursive: true, force: true });
console.log('MUTANTS : 1/1 tues');
console.log('test-ip-client-20261101 : ' + n + ' assertions OK');
