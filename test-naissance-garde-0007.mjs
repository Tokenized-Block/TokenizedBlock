// test-naissance-garde-0007.mjs — 2026-10-02, prod KO du build 20261002-one-fee-per-leg.
// createPaid porte valeurCreation(FRAIS_OUVERTURE_WEI) = 0,0007 ETH ; toute garde de creerBlock qui compare
// `valueSend` a un seuil PLUS HAUT refuse chaque Instant Birth avant le wallet. Ce test evalue, dans le VRAI
// app.html, chaque seuil `BigInt(valueSend || '0x0') < / >= X` contre la valeur que l app envoie vraiment.
// Controle negatif : `node test-naissance-garde-0007.mjs <app.html du build 7135acd>` doit ECHOUER.
import { readFileSync } from 'node:fs';
import { FRAIS_OUVERTURE_WEI, CREATE_FEE_WEI_FLOOR } from './frais-creation.js';
const chemin = process.argv[2] || new URL('./app.html', import.meta.url);
const html = readFileSync(chemin, 'utf8');
let ko = 0, n = 0;
const ok = (c, m) => { n++; if (!c) { ko++; console.log('KO  ' + m); } else console.log('ok  ' + m); };
const src = html.match(/function valeurCreation\(fraisWei\) \{[\s\S]*?\n\}/);
ok(!!src, 'valeurCreation present');
const valeurCreation = new Function('FRAIS_OUVERTURE_WEI', 'CREATE_FEE_WEI_FLOOR', 'utiliseCreateRouter', src[0] + '; return valeurCreation;')(FRAIS_OUVERTURE_WEI, CREATE_FEE_WEI_FLOOR, () => true);
const envoye = BigInt(valeurCreation(FRAIS_OUVERTURE_WEI));
ok(envoye === FRAIS_OUVERTURE_WEI - CREATE_FEE_WEI_FLOOR, 'createPaid envoie ' + envoye + ' wei (0,001 - plancher)');
const corps = html.slice(html.indexOf('async function creerBlock()'), html.indexOf('async function creerBlock()') + 40000);
const seuils = [...corps.matchAll(/BigInt\(valueSend \|\| '0x0'\) (<|>=) (FRAIS_OUVERTURE_WEI(?: - CREATE_FEE_WEI_FLOOR)?)/g)];
ok(seuils.length >= 3, seuils.length + ' seuils sur valueSend trouves dans creerBlock');
for (const [, op, expr] of seuils) {
  const x = new Function('FRAIS_OUVERTURE_WEI', 'CREATE_FEE_WEI_FLOOR', 'return ' + expr)(FRAIS_OUVERTURE_WEI, CREATE_FEE_WEI_FLOOR);
  if (op === '<') ok(!(envoye < x), 'garde « < ' + expr + ' » laisse passer la valeur envoyee');
  else ok(envoye >= x, 'enregistrement « >= ' + expr + ' » reconnait la valeur envoyee');
}
/* et la garde garde ses dents : 1 wei sous la valeur envoyee doit etre refuse par au moins une garde « < » */
ok(seuils.some(([, op, expr]) => op === '<' && (envoye - 1n) < new Function('FRAIS_OUVERTURE_WEI', 'CREATE_FEE_WEI_FLOOR', 'return ' + expr)(FRAIS_OUVERTURE_WEI, CREATE_FEE_WEI_FLOOR)),
  '1 wei de moins est refuse (la garde n est pas desarmee)');
console.log(ko ? 'FAIL naissance-garde-0007 · ' + ko + '/' + n + ' KO' : 'ALL PASS naissance-garde-0007 · ' + n + ' assertions');
process.exit(ko ? 1 : 0);
