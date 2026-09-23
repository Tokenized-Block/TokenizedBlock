import { readFileSync } from 'fs';
const h = readFileSync('./app.html', 'utf8');
const need = [
  ['tip', 'data-build="20260923-reclaim-volume"'],
  ['tip comment', 'tip 20260923-reclaim-volume'],
  ['OL IB copy', 'TB earns $0 there. Want a hooked market? Instant Birth on TB · 0.001 ETH'],
  ['OL IB button', 'data-tf-act="instant-birth-tb">Instant Birth on TB · 0.001 ETH</button>'],
  ['OL wire', 'OpenLaunch Feed IB reclaim'],
  ['peFrais visible', 'id="peFrais">0.5%'],
  ['Prepare buy', 'Prepare buy · 0.5%'],
  ['Prepare sell', 'Prepare sell · 0.5%'],
  ['profile default IB', 'MAIN first paint = Instant Birth on TB'],
  ['foreign amplify', 'opens hooked market / Buy'],
  ['foreign chip', 'data-filtre="CREATION_FOREIGN"'],
  ['Created paid-only', "liveFiltre === 'CREATION') return e.type === 'CREATION' && e.paidCreate === true"],
  ['trending gate', 'Buy · 0.5% only when fee-capturable'],
  ['trending Trade TB', 'Trade on TB · 0.001 ETH'],
  ["etape('achat')", "etape('achat')"],
];
for (const [label, s] of need) {
  if (!h.includes(s)) throw new Error('missing ' + label + ': ' + s.slice(0, 100));
}
if (h.includes('id="peFrais" hidden style="display:none"')) throw new Error('peFrais still display:none');
if (h.includes('Fees for Dev')) throw new Error('Fees for Dev');
const ui = h.match(/<(?:button|a|span|b|p)[^>]*>[^<]*a6cf[^<]*</gi) || [];
if (ui.length) throw new Error('a6cf in UI: ' + ui.join('|'));
if (h.includes('data-build="20260923-feed-catch-router"')) throw new Error('old tip left');
console.log('ok reclaim-volume');
