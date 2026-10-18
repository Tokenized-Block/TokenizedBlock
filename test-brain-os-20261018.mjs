/* test-brain-os-20261018.mjs - LES OUTILS DU BRAIN OS DISENT CE QUI EST MESURE, ET RIEN DE PLUS.
 * AFFIRME (brain-os.js, rpc et lireJson simules) : (1) allerRetour : achat cote + revente NotEnoughLiquidity -> VENTE_MINCE (pool mince,
 *   jamais « refus ») ; revente revert d une autre cause -> VENTE_REFUSEE ; panne reseau -> NON_LU ; tout cote -> LU avec gardeBps ;
 *   (2) lireWallet : index serveur INCOMPLET et vide -> « not known yet », jamais « Blocks created: 0 » ; complet -> le compte ; incomplet
 *   avec des blocks -> « at least N ». (3) Aucune ligne ne dit « safe ».
 * Mesure du 2026-10-18 sur Base (sonde manuelle, non rejouee ici) : safety UNIT -> NotEnoughLiquidity a la revente de 0,001 ETH achete. */
import { allerRetour, lireWallet } from './brain-os.js';
let n = 0;
const vu = (c, m) => { if (!c) { console.error('KO ' + m); process.exit(1); } n++; };
const J = '0xb2000000000000000000007afa7ed748b0874f27', ETH = '0x0000000000000000000000000000000000000000';
const cle = { currency0: ETH, currency1: J, fee: 0, tickSpacing: 60, hooks: '0x32f3f572dd17625bab9035789c953e1d001864cc' };
const mot = (v) => '0x' + BigInt(v).toString(16).padStart(64, '0') + '0'.repeat(64);
const nel = Object.assign(new Error('execution reverted'), { data: '0x6190b2b0' + '00'.repeat(64) + '7a5ed734' });
const autre = new Error('execution reverted: custom');
const reseau = new Error('fetch failed');
const rpcDe = (seq) => { let i = 0; return async () => { const x = seq[i++]; if (x instanceof Error) throw x; return x; }; };
/* (1) */
vu((await allerRetour({ rpc: rpcDe([mot(5000), nel]), quoteur: '0x' + '1'.repeat(40), cle, jeton: J, entree: 10n ** 15n })).etat === 'VENTE_MINCE', 'revente NotEnoughLiquidity -> VENTE_MINCE (pool mince)');
vu((await allerRetour({ rpc: rpcDe([mot(5000), autre]), quoteur: '0x' + '1'.repeat(40), cle, jeton: J, entree: 10n ** 15n })).etat === 'VENTE_REFUSEE', 'revente revert d une autre cause -> VENTE_REFUSEE');
vu((await allerRetour({ rpc: rpcDe([mot(5000), reseau]), quoteur: '0x' + '1'.repeat(40), cle, jeton: J, entree: 10n ** 15n })).etat === 'NON_LU', 'panne reseau a la revente -> NON_LU, jamais un verdict');
const lu = await allerRetour({ rpc: rpcDe([mot(5000), mot(9 * 10 ** 14)]), quoteur: '0x' + '1'.repeat(40), cle, jeton: J, entree: 10n ** 15n });
vu(lu.etat === 'LU' && lu.gardeBps === 9000, 'tout cote -> LU, 90 % garde (' + lu.gardeBps + ' bps)');
/* (2) */
const W = '0x' + 'ab'.repeat(20);
const rpcW = async (m) => { if (m === 'eth_getBalance') return '0x0'; if (m === 'eth_blockNumber') return '0x10'; if (m === 'eth_getLogs') return []; if (m === 'eth_call') return '0x' + '0'.repeat(64); return null; };
const wal = async (blocks) => (await lireWallet({ rpc: rpcW, lireJson: async (u) => (/blocks-de/.test(u) ? blocks : /avoirs/.test(u) ? { ok: true, avoirs: [] } : { ok: false }), adresse: W })).lignes.map((l) => l.texte).join(' | ');
const vide = await wal({ ok: true, blocks: [], couvertureComplete: false });
vu(/Blocks created: not known yet/.test(vide) && !/Blocks created: 0/.test(vide), 'index incomplet et vide -> « not known yet », jamais 0');
vu(/Blocks created: 0\./.test(await wal({ ok: true, blocks: [], couvertureComplete: true })), 'index complet et vide -> « 0 » (vrai)');
vu(/Blocks created: at least 1 /.test(await wal({ ok: true, blocks: [J], couvertureComplete: false })), 'index incomplet avec un block -> « at least 1 »');
/* (3) */
vu(!/\bsafe\b/i.test(vide), 'aucune ligne ne dit « safe »');
console.log('ok brain-os - ' + n + ' assertions ; NE PROUVE PAS le rendu ni une lecture reelle (sonde manuelle Base le 2026-10-18)');
