// 2026-10-02 fee lot 2 (3): the liquidity REFUSE copy names the LP fee — "0 % LP fee", never a bare "0 % fee".
import { readFileSync } from 'node:fs';
const src = readFileSync(new URL('./liquidite.js', import.meta.url), 'utf8');
let ko = 0; const ok = (c, m) => { console.log((c ? 'ok  ' : 'KO  ') + m); if (!c) ko++; };
ok(src.includes('(ETH or TBLOCK, 0 % LP fee, spacing 200, our hook or none)'), 'REFUSE text says "0 % LP fee"');
ok(!/0 % fee[,)]/.test(src), 'no bare "0 % fee" left');
console.log('2 assertions, ' + ko + ' KO'); process.exit(ko ? 1 : 0);
