/* test-route-multi-sauts.mjs — UNE ROUTE NE VAUT QUE SA JAMBE LA PLUS MINCE.
 *
 * ⛔⛔ CE QUE CE MODULE REPARE. Mesure du 2026-09-27 : notre echange in-app est Uniswap v4 et un
 *     SEUL saut. Un block cote en USDC sur Aerodrome est donc inatteignable depuis l ETH —
 *     parcours mesure sur MUc : clic « Buy », 62 secondes, puis l ecran propose de creer un AUTRE
 *     block. Le concurrent thestonks.exchange le resout et l affiche :
 *         « ETH route : Aerodrome (ETH -> USDC -> quote) · $2.08M »
 *
 * ⛔⛔ LA REGLE QUE CE FICHIER DEFEND AVANT TOUT : LA PROFONDEUR D UNE ROUTE EST LE MINIMUM DE SES
 *     JAMBES. Sur la route reelle mesuree pour RDDTc :
 *         ETH  -> USDC   PancakeSwap  4 872 535 $
 *         USDC -> RDDTc  Aerodrome       15 186 $
 *     La route vaut 15 186 $. Annoncer 4 872 535 $ — ou la somme — serait un chiffre vrai pour un
 *     saut et faux pour le trajet, juste avant que quelqu un engage de l argent dessus.
 *
 * ⚠️ CE QU IL NE PROUVE PAS : qu un echange aboutisse. Le glissement, les frais par saut et l etat
 *   reel au bloc ne sont pas simules. Il prouve qu on trouve un chemin et qu on le DECRIT juste.
 */
import { strict as assert } from 'node:assert';
import { planifierRoute, phraseRoute, SAUTS_MAX } from './route-multi-sauts.js';

let n = 0;
const cas = (titre, f) => { n++; try { f(); } catch (e) { console.error('✗ ' + titre); throw e; } };

/* adresses REELLES, mesurees le 2026-09-27 — pas inventees */
const ETH = '0x4200000000000000000000000000000000000006';
const USDC = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913';
const RDDT = '0xb20000000000000000000066242d4067724cb7a1';
const P_ETH_USDC = { pool: '0x72AB388E2E2F6FaceF59E3C3FA2C4E29011c2D38', dexId: 'pancakeswap', a: ETH, b: USDC, liquiditeUsd: 4872535 };
const P_USDC_RDDT = { pool: '0x2C0009a907d2616740D1F5db90CA9Dfe8e3Cbc20', dexId: 'aerodrome', a: RDDT, b: USDC, liquiditeUsd: 15186 };

cas('⛔⛔ la route reelle est trouvee, et sa profondeur est le GOULOT', () => {
  const r = planifierRoute({ depuis: ETH, vers: RDDT, marches: [P_ETH_USDC, P_USDC_RDDT] });
  assert.equal(r.etat, 'TROUVEE', 'la route ETH -> USDC -> RDDTc n est plus trouvee : ' + r.pourquoi);
  assert.equal(r.sauts.length, 2, 'la route ne fait plus deux sauts');
  assert.equal(r.profondeurUsd, 15186,
    'la profondeur annoncee est ' + r.profondeurUsd + ' au lieu de 15 186 : une route ne fait pas '
    + 'passer plus que son goulot, et annoncer la plus grosse jambe (4 872 535) serait vrai pour un '
    + 'saut et faux pour le trajet');
  assert.notEqual(r.profondeurUsd, 4872535, 'la profondeur est celle de la PLUS GROSSE jambe');
  assert.notEqual(r.profondeurUsd, 4872535 + 15186, 'la profondeur est une SOMME de jambes');
  assert.equal(r.goulot.dex, 'aerodrome', 'le goulot n est plus nomme, ou pas le bon');
});

cas('⛔⛔ une pool sous le seuil est EXCLUE, pas seulement moins bien classee', () => {
  /* ⛔⛔ Une arete trop mince n est pas « un peu moins bonne » : elle fera ECHOUER le trade. La
   *     laisser entrer produirait une route qui a l air de marcher — le pire des deux. */
  const mince = { ...P_USDC_RDDT, liquiditeUsd: 100 };
  const r = planifierRoute({ depuis: ETH, vers: RDDT, marches: [P_ETH_USDC, mince], liqMin: 500 });
  assert.equal(r.etat, 'SANS_ROUTE',
    'une jambe a 100 $ passe le seuil de 500 $ : on proposerait une route qui ne peut pas absorber '
    + 'le trade');
});

cas('⛔ le trajet le plus COURT gagne — chaque saut coute', () => {
  /* ⛔ Un saut de plus, c est des frais, du glissement, et une pool de plus qui peut etre vide au
   *   moment du trade. Une route a 3 sauts plus profonde reste pire qu une a 2 sauts. */
  const X = '0x' + '1'.repeat(40);
  const detour1 = { pool: '0x' + 'a'.repeat(40), dexId: 'detourA', a: ETH, b: X, liquiditeUsd: 99999999 };
  const detour2 = { pool: '0x' + 'b'.repeat(40), dexId: 'detourB', a: X, b: USDC, liquiditeUsd: 99999999 };
  const r = planifierRoute({ depuis: ETH, vers: RDDT, marches: [P_ETH_USDC, P_USDC_RDDT, detour1, detour2] });
  assert.equal(r.sauts.length, 2, 'un detour plus profond mais plus long a ete prefere : ' + r.sauts.length + ' sauts');
});

cas('⛔ a longueur EGALE, le goulot le plus large gagne', () => {
  const alt = { pool: '0x' + 'c'.repeat(40), dexId: 'autreDex', a: RDDT, b: USDC, liquiditeUsd: 90000 };
  const r = planifierRoute({ depuis: ETH, vers: RDDT, marches: [P_ETH_USDC, P_USDC_RDDT, alt] });
  assert.equal(r.profondeurUsd, 90000,
    'a deux sauts des deux cotes, la route au goulot le plus MINCE a ete gardee (' + r.profondeurUsd + ')');
});

cas('⛔⛔ une pool s emprunte DANS LES DEUX SENS', () => {
  /* ⛔⛔ `a` et `b` ne sont pas base/quote. Forcer un sens ferait rater la moitie des routes — et
   *     silencieusement : on dirait « aucune route » la ou il y en a une. */
  const r = planifierRoute({ depuis: RDDT, vers: ETH, marches: [P_ETH_USDC, P_USDC_RDDT] });
  assert.equal(r.etat, 'TROUVEE', 'la route en sens inverse n est plus trouvee : les pools sont devenues orientees');
  assert.equal(r.sauts.length, 2);
});

cas('⛔ les sauts sont BORNES, et un cycle ne fait pas boucler', () => {
  /* ⛔ Sans borne ni detection de cycle, une file sur un graphe de milliers de pools ne rend jamais.
   *   Et au-dela de 3 sauts, ni l utilisateur ni nous ne pouvons juger ce qui est signe. */
  assert.ok(SAUTS_MAX <= 3, 'SAUTS_MAX est passe a ' + SAUTS_MAX + ' : chaque saut est une occasion '
    + 'de plus d echouer pour un seul clic');
  const A = '0x' + '2'.repeat(40), B = '0x' + '3'.repeat(40), C = '0x' + '4'.repeat(40);
  const cycle = [
    { pool: '0x' + 'd'.repeat(40), dexId: 'x', a: ETH, b: A, liquiditeUsd: 1e6 },
    { pool: '0x' + 'e'.repeat(40), dexId: 'x', a: A, b: B, liquiditeUsd: 1e6 },
    { pool: '0x' + 'f'.repeat(40), dexId: 'x', a: B, b: C, liquiditeUsd: 1e6 },
    { pool: '0x' + '9'.repeat(40), dexId: 'x', a: C, b: A, liquiditeUsd: 1e6 },
  ];
  const r = planifierRoute({ depuis: ETH, vers: RDDT, marches: cycle });
  assert.equal(r.etat, 'SANS_ROUTE', 'un graphe cyclique sans issue rend autre chose qu un refus');
});

cas('⛔ les refus sont DISTINCTS et disent quoi', () => {
  assert.equal(planifierRoute({ depuis: 'pas une adresse', vers: RDDT, marches: [] }).etat, 'REFUSE');
  assert.equal(planifierRoute({ depuis: ETH, vers: ETH, marches: [] }).etat, 'REFUSE',
    'partir et arriver au meme actif n est pas refuse');
  const sansPool = planifierRoute({ depuis: ETH, vers: RDDT, marches: [] });
  assert.equal(sansPool.etat, 'REFUSE', 'une liste de pools vide devrait etre refusee a l entree');
  const orphelin = planifierRoute({ depuis: ETH, vers: RDDT, marches: [P_USDC_RDDT] });
  assert.equal(orphelin.etat, 'SANS_ROUTE',
    'quand rien ne se paire avec l actif paye, ce n est pas un REFUS d entree mais une ABSENCE de '
    + 'route — les confondre ferait chercher un defaut dans la requete');
});

cas('⛔ la phrase d ecran NOMME le goulot', () => {
  /* ⛔ C est lui qui decide de ce qui passe. Afficher la plus grosse jambe rendrait la route plus
   *   large qu elle n est, exactement devant quelqu un qui s apprete a payer. */
  const r = planifierRoute({ depuis: ETH, vers: RDDT, marches: [P_ETH_USDC, P_USDC_RDDT] });
  const p = phraseRoute(r);
  assert.ok(/thinnest leg/.test(p), 'la phrase ne dit plus que la profondeur est celle de la jambe la plus mince');
  assert.ok(/15,186/.test(p), 'la phrase annonce autre chose que le goulot : ' + p);
  assert.ok(!/4,872,535/.test(p), 'la phrase annonce la plus grosse jambe');
  assert.equal(phraseRoute({ etat: 'SANS_ROUTE' }), null, 'une route absente produit quand meme une phrase');
});

assert.equal(n, 8, 'compte de cas inattendu : ' + n);
console.log('ok route-multi-sauts — ' + n + ' cas.');
console.log('   La route reelle ETH -> USDC -> RDDTc est trouvee, sa profondeur est le GOULOT');
console.log('   (15 186 $, pas 4 872 535), les pools trop minces sont EXCLUES, et le plus court gagne.');
console.log('⚠️ NE PROUVE PAS qu un echange aboutisse : ni glissement, ni frais par saut, ni etat');
console.log('   reel au bloc. Et ce module ne signe rien et ne construit aucun calldata.');

/* ── ⛔⛔ LES DEUX FAMILLES DE POOLS, ET POURQUOI EN OUBLIER UNE VIDAIT LE GRAPHE ────────────── */
{
  let m = 0;
  const casF = (titre, f) => { m++; try { f(); } catch (e) { console.error('✗ ' + titre); throw e; } };
  const POOLID_V4 = '0x' + '7'.repeat(64);

  casF('⛔⛔ une pool Uniswap v4 (poolId 32 octets) est acceptee', () => {
    /* ⛔⛔ MA PREMIERE VERSION N ACCEPTAIT QUE DES ADRESSES DE CONTRAT et jetait EN SILENCE toutes
     *     les pools v4 — c est-a-dire exactement la famille ou vivent nos blocks.
     *     MESURE : sur 45 blocks et 10 actions, le graphe tombait a 10 pools et AUCUN block
     *     n atteignait une action ; les 81 paires « routables » etaient des actions entre elles.
     *     Avec les v4 : 46 pools, 156 paires routables (35,4 %). */
    const r = planifierRoute({ depuis: ETH, vers: RDDT, marches: [
      { pool: POOLID_V4, dexId: 'uniswap', a: ETH, b: USDC, liquiditeUsd: 2000000 },
      P_USDC_RDDT,
    ] });
    assert.equal(r.etat, 'TROUVEE',
      'une pool v4 identifiee par son poolId est de nouveau jetee : le routeur exclut la famille ou '
      + 'vivent nos blocks, et le graphe se vide sans rien dire');
    assert.equal(r.sauts[0].famille, 'v4', 'la famille de la pool ne voyage plus avec la jambe');
    assert.equal(r.sauts[1].famille, 'cl', 'une pool v3/CL n est plus classee `cl`');
  });

  casF('⛔ un identifiant de pool qu on ne sait pas classer est REFUSE', () => {
    /* ⛔ Ni 40 ni 64 hex : on ne saurait pas quoi appeler. Le laisser passer ferait echouer la
     *   transaction bien plus loin, sans rien pour remonter jusqu ici. */
    const r = planifierRoute({ depuis: ETH, vers: RDDT, marches: [
      { pool: '0xabc', dexId: 'inconnu', a: ETH, b: USDC, liquiditeUsd: 2000000 },
      P_USDC_RDDT,
    ] });
    assert.equal(r.etat, 'SANS_ROUTE', 'un identifiant de pool non classable entre dans le graphe');
  });

  assert.equal(m, 2, 'compte de cas (familles) inattendu : ' + m);
  console.log('   + ' + m + ' cas : les pools v4 ET v3/CL entrent dans le graphe, leur famille voyage.');
}
