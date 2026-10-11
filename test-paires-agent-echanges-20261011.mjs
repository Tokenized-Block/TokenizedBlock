/* test-paires-agent-echanges-20261011.mjs - tblock_pairs ANNONCE les echanges de devises que tblock_plan_swap construit.
 * QA Grok (2026-10-11, M7, MCP en prod) : « tblock_pairs liste OUSD comme devise de creation mais ne donne aucune paire d echange
 *   pour OUSD » - un agent ne pouvait pas DECOUVRIR l echange OUSD <-> USDC deploye le meme soir.
 * AFFIRME (EXECUTE) :
 *   - rails-api.js echangesDevisesAnnonces() rend exactement ETH<->USDC et USDC<->OUSD (jamais ETH<->OUSD : la route le refuse) ;
 *   - CHAQUE paire annoncee est routee par planRail dans les DEUX sens (faux noeud : pas de refus « not offered » / « USDC only »,
 *     des lectures faites) - l annonce ne peut pas promettre ce que la route refuse ;
 *   - serveur-web.js pairesPourAgent les publie (champ `echanges`) ; la description MCP de tblock_pairs le dit.
 * NE PROUVE PAS : l execution (banc-devises-fork-20261004.mjs ; rejeu prod : OUSD>USDC APPROBATIONS 20 bps). */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { strict as assert } from 'node:assert';
const ICI = path.dirname(fileURLToPath(import.meta.url));
let n = 0;
const vu = (c, m) => { assert.ok(c, m); n += 1; };
const R = await import(pathToFileURL(path.join(ICI, 'rails-api.js')).href);
const { DEVISES_BASE } = await import(pathToFileURL(path.join(ICI, 'paires.js')).href);
const adr = (s) => String(DEVISES_BASE.find((d) => d.symbole === s).adr).toLowerCase();
const USDC = adr('USDC'), OUSD = adr('OUSD');
vu(typeof R.echangesDevisesAnnonces === 'function', 'echangesDevisesAnnonces absent de rails-api.js');
const e = R.echangesDevisesAnnonces();
const cles = e.map((x) => x.entre.map((t) => t.symbole).sort().join('<->')).sort();
vu(JSON.stringify(cles) === JSON.stringify(['ETH<->USDC', 'OUSD<->USDC']), 'annonce attendue ETH<->USDC et OUSD<->USDC (' + cles.join(', ') + ')');
vu(e.every((x) => x.sens === 'both ways' && x.entre.length === 2), 'chaque paire : deux jetons, les deux sens');
vu(!e.some((x) => x.entre.some((t) => t.symbole === 'ETH') && x.entre.some((t) => t.symbole === 'OUSD')), 'jamais ETH<->OUSD (la route le refuse)');
vu(e.some((x) => x.entre.some((t) => t.adresse === OUSD) && x.entre.some((t) => t.adresse === USDC)), 'OUSD/USDC annonce avec les adresses du registre');
/* la garde : ce qui est annonce est ROUTE, dans les deux sens */
const COMPTE = '0x00000000000000000000000000000000c0ffee77';
for (const x of e) {
  for (const [a, b] of [[x.entre[0].adresse, x.entre[1].adresse], [x.entre[1].adresse, x.entre[0].adresse]]) {
    let appels = 0;
    const rpc = async (m) => { appels += 1; if (m === 'eth_blockNumber') return '0x1'; return '0x' + '0'.repeat(64 * 8); };
    const r = await R.planRail({ de: a, vers: b, montant: '1000000', compte: COMPTE }, { rpc, clesDe: async () => [] });
    vu(!/is not offered by this API yet|against USDC only/.test(String(r.pourquoi)) && appels > 0,
      'annonce ' + a.slice(0, 10) + ' -> ' + b.slice(0, 10) + ' : la route la CONSTRUIT (faux noeud : ' + r.etat + ', ' + appels + ' lectures)');
  }
}
const srv = fs.readFileSync(path.join(ICI, 'serveur-web.js'), 'utf8');
vu(/import \{ planRail, echangesDevisesAnnonces \} from '\.\/rails-api\.js';/.test(srv) && /echanges: echangesDevisesAnnonces\(\),/.test(srv), 'pairesPourAgent ne publie pas `echanges`');
const mcp = fs.readFileSync(path.join(ICI, 'mcp-tblock.js'), 'utf8');
vu(/name: 'tblock_pairs'[\s\S]{0,700}currency swaps/.test(mcp), 'la description de tblock_pairs ne dit pas qu elle liste les echanges');
console.log('ok paires-agent-echanges - ' + n + ' assertions ; NE PROUVE PAS l execution');
