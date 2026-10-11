/* test-positions-memoire-par-compte-20261011.mjs - (G) : les positions gardees EN MEMOIRE (localStorage plein) sont rangees par
 * compte/chaine (clePositions) : changer de wallet ne montre pas les positions d un autre compte. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ICI = path.dirname(fileURLToPath(import.meta.url));
let rouges = 0;
const ok = (c, m) => { if (c) console.log('  ok  ' + m); else { rouges += 1; console.log('  ROUGE  ' + m); } };
const html = fs.readFileSync(path.join(ICI, 'app.html'), 'utf8');
const d = html.indexOf('function garderPositionDans('), f = html.indexOf('async function peindrePositions(');
ok(d > 0 && f > d, 'bloc des positions trouve dans app.html');
const bloc = html.slice(d, f);
const plein = { getItem: () => null, setItem: () => { throw new Error('QuotaExceeded'); }, removeItem: () => {} };
const fab = new Function('localStorage', 'RPC_STOCKAGE', 'CHAINE', 'etat', bloc.replace(/\bcompte\b/g, 'etat.compte')
  + '\nreturn { garderPosition, positionsGardees };');
const etat = { compte: '0xAAAA000000000000000000000000000000000001' };
const P = fab(plein, 'rpc', 8453, etat);
ok(P.garderPosition('11', '0xB1') === 'MEMOIRE', 'stockage plein : la position A est gardee en memoire');
ok(P.positionsGardees().some((x) => x.id === '11'), 'compte A la voit');
etat.compte = '0xBBBB000000000000000000000000000000000002';
ok(!P.positionsGardees().some((x) => x.id === '11'), 'compte B ne voit PAS la position du compte A');
P.garderPosition('22', '0xB1');
etat.compte = '0xaaaa000000000000000000000000000000000001';
const a = P.positionsGardees().map((x) => x.id);
ok(a.includes('11') && !a.includes('22'), 'retour au compte A (casse differente) : la sienne, pas celle de B');
console.log(rouges ? 'ROUGE : ' + rouges : 'VERT');
process.exitCode = rouges ? 1 : 0;
