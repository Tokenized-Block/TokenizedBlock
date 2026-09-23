import { readFileSync } from 'fs';
const h = readFileSync('./app.html', 'utf8');
if (!h.includes('data-build="20260923-map-seed"')) throw new Error('tip');
if (!h.includes('vues.length >= Math.max(80, habitants.length)')) throw new Error('guard');
if (h.index('void soleilsSurLaMap();') > h.index('charger().then(() => { void soleilsSurLaMap(); })')) throw new Error('boot order');
# first soleils before charger().then
i1 = h.index('void soleilsSurLaMap();\ncharger()'.replace('\\n','\n')) if False else h.find('seed soleils')
if 'seed soleils from /api/trending FIRST' not in h: raise SystemExit('no seed boot')
print('ok map-seed');
