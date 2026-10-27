// test-muc-buy-20261027 : a tokenized stock with no DexScreener line but a route ACHETABLE read on chain AND a measured table pool
// gets the SAME Buy as the table rows (MUc, prod 2026-10-27 11:59Z). Never on a refused route, never off the table.
// Bound: static reading of app.html + the rendered expression evaluated on 4 cases; the click path is the table rows' own (not re-run).
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const app = readFileSync(new URL('app.html', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const m = app.match(/\+ \(x\.route === 'ACHETABLE' && x\.table === true \? ('[^\n]+') : ''\)/);
assert.ok(m, 'the Buy of a line-less stock is guarded by ACHETABLE + table');
const enTexte = (s) => String(s);
const rendu = (x) => (x.route === 'ACHETABLE' && x.table === true ? eval(m[1]) : '');
const adr = '0xb200000000000000000000fd2f87532b90095211';
assert.match(rendu({ adr, route: 'ACHETABLE', table: true }), /data-acheter="0xb2[0-9a-f]{38}">Buy</, 'MUc: Buy');
assert.equal(rendu({ adr, route: 'ACHETABLE', table: false }), '', 'off the table: no Buy');
assert.equal(rendu({ adr, route: 'LIQUIDITE_SOUS_SEUIL', table: true }), '', 'refused route: no Buy');
assert.equal(rendu({ adr, route: null, table: true }), '', 'route not read: no Buy');
assert.ok(/sansLigneVues\.map\(\(x\) =>[\s\S]{0,900}x\.route === 'ACHETABLE' && x\.table === true/.test(app), 'it sits in the line-less rows');
console.log('test-muc-buy-20261027: 6 assertions, OK');
