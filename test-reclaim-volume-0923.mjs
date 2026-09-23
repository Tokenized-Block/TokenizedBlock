/* ⛔ CONTROLES DE PASTILLE RETIRES (2026-09-23, demande de Phil) : ils exigeaient la presence
 *    des filtres « TB · paid » et « another launchpad », supprimes de l interface — « TB · paid »
 *    affichait 0 en permanence, et la distinction regardait NOUS, pas le lecteur.
 *    ⛔ LES CONTROLES SUR LA LOGIQUE DE PARTITION SONT GARDES plus bas : la partition existe
 *      toujours dans le code et doit rester gardee. On retire l exigence d un BOUTON, jamais
 *      celle d un COMPORTEMENT. */
/* ⛔ EPINGLE DE BUILD RETIREE (2026-09-23) : la table des chaines obligatoires contenait une
 *    entree `['tip', 'data-build="<tip>"']` — elle exigeait un numero de build PRECIS, donc elle
 *    rougissait des qu un autre agent deployait. Elle ne testait pas une fonctionnalite : elle
 *    testait que personne n avait deploye depuis. Les controles « un ANCIEN tip n est pas reste »
 *    sont LAISSES INTACTS plus bas — eux gardent vraiment quelque chose. */
import { readFileSync } from 'fs';
const h = readFileSync('./app.html', 'utf8');
const need = [
  ['tip comment', 'tip 20260923-created-history'],
  ['OL IB copy', 'TB earns $0 there. Want a hooked market? Instant Birth on TB · 0.001 ETH'],
  ['OL IB button', 'data-tf-act="instant-birth-tb">Instant Birth on TB · 0.001 ETH</button>'],
  ['OL wire', 'OpenLaunch Feed IB reclaim'],
  ['peFrais visible', 'id="peFrais">0.5%'],
  ['Prepare buy', 'Prepare buy · 0.5%'],
  ['Prepare sell', 'Prepare sell · 0.5%'],
  ['profile default IB', 'MAIN first paint = Instant Birth on TB'],
  ['foreign amplify', 'opens hooked market / Buy'],
  /* tip 20260923-created-history: Created = all births; partitions stay honest */
  ['Created all births', "if (liveFiltre === 'CREATION') return e.type === 'CREATION';"],
  ['TB paid partition', "liveFiltre === 'CREATION_TB') return e.type === 'CREATION' && e.paidCreate === true"],
  ['foreign partition', "liveFiltre === 'CREATION_FOREIGN') return e.type === 'CREATION' && e.paidCreate !== true"],
  ['trending gate', 'Buy · 0.5% only when fee-capturable'],
  /* ⛔ LIBELLE CORRIGE LE 2026-09-23 : « Trade on TB · 0.001 ETH » figurait a cote de lignes
   *    « Buy · 0.5% », et le lecteur croyait comparer deux PRIX pour la MEME action. Or ce
   *    bouton-la n echange rien : son `data-tf-act="instant-birth-tb"` OUVRE un marche.
   *    ⛔ Le controle reste : le bouton de repli doit exister et porter son prix. Ce qui change,
   *      c est qu il doit maintenant dire ce qu il FAIT. */
  ['trending repli = ouvrir un marche', 'Open its market · 0.001 ETH'],
  ['trending repli branche sur Instant Birth', 'data-tf-act="instant-birth-tb">Open its market'],
  ["etape('achat')", "etape('achat')"],
];
for (const [label, s] of need) {
  if (!h.includes(s)) throw new Error('missing ' + label + ': ' + s.slice(0, 100));
}
if (h.includes("liveFiltre === 'CREATION') return e.type === 'CREATION' && e.paidCreate === true")) {
  throw new Error('Created still paid-only');
}
if (h.includes('id="peFrais" hidden style="display:none"')) throw new Error('peFrais still display:none');
if (h.includes('Fees for Dev')) throw new Error('Fees for Dev');
const ui = h.match(/<(?:button|a|span|b|p)[^>]*>[^<]*a6cf[^<]*</gi) || [];
if (ui.length) throw new Error('a6cf in UI: ' + ui.join('|'));
if (h.includes('data-build="20260923-reclaim-volume"')) throw new Error('old reclaim tip left');
if (h.includes('data-build="20260923-wallet-intent-market"')) throw new Error('old wallet-intent tip left');
console.log('ok reclaim-guards-on-created-history');
