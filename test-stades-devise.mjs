// test-stades-devise.mjs — `stades.js` NE DOIT PLUS ETRE ETH-SEUL.
// ================================================================================================
// ⛔⛔ LE DEFAUT QUE CE FICHIER EMPECHE DE REVENIR (mesure du 2026-09-25). `stades.js` jugeait le palier
//    ainsi : `if (x.devise !== 'ETH' || !prixOk) { mettre('PRIX_NON_LU', base); continue; }`. Un block
//    dont la pool est cotee en USDC, en cbBTC ou dans une action tokenisee — `marche.js ▸ vieEnDevise`
//    rend alors `devise: 'USDC' | 'cbBTC' | 'METAc'…` — voyait son palier « en attente d un prix », et
//    n essayait meme pas la FDV publique, qui est pourtant DEJA en dollars.
//    `peindreJeu` (app.html) avait ete corrige le 2026-09-20 ; ce fichier-ci, non. Meme calcul, deux
//    endroits, un seul corrige : c est `canonical-helper-weaker-copy`.
//
// ⛔ AMPLEUR MESUREE LE 2026-09-25 (lecture seule, /api/trending puis /api/cle de chaque block) :
//    sur les 227 blocks cotes de trending, 24 n ont AUCUNE pool ETH natif mais une pool contre une
//    devise admise (17 SPCXc, 4 METAc, 3 USDC) — dont MUc, 155 446 $ de FDV, cote en USDC. Ces 24
//    tombaient dans PRIX_NON_LU. 131 des 227 lectures de cles ont ete refusees (« over rate limit ») a
//    la premiere passe : elles ne comptent ni pour ni contre, et le chiffre est un PLANCHER.
//    Rejeu de `stadesDesBlocks` sur ces 24 : tous sortent de PRIX_NON_LU — 3 par la conversion USDC
//    (source CHAINE), 21 par la FDV publique que l ancien cul-de-sac n essayait jamais (source MARCHE).
//
// ⛔ CE QUE CE TEST NE PROUVE PAS : que l ecran affiche le bon palier. Il porte sur le classement rendu
//    par `stades.js`, pas sur le HTML qui le peint.
import assert from 'node:assert/strict';
import { stadesDesBlocks, prixUsdDeLaDevise, STADES_HORS_PALIER } from './stades.js';
import { pairesProposees } from './paires.js';

let n = 0;
const ok = (nom, f) => { f(); n++; console.log('  ok', nom); };
const groupeDe = (r, adr) => r.groupes.find((g) => g.blocks.some((b) => b.adr === adr.toLowerCase()));
const blocDe = (r, adr) => r.groupes.flatMap((g) => g.blocks).find((b) => b.adr === adr.toLowerCase());

const A = '0xb20000000000000000000000000000000000000a';
const B = '0xb20000000000000000000000000000000000000b';
const ETH_USD = 4000;

/* ══ 1. LE TEMOIN QUI TIENT TOUT LE RESTE ════════════════════════════════════════════════════════
 * ⛔ Sans lui, « USDC est range en Trunk » ne prouverait pas que la devise y est pour quelque chose :
 *    n importe quel bug qui rangerait TOUT en Trunk passerait aussi. */
ok('temoin : l ETH est toujours converti par le prix ETH/USD (0,25 ETH x 4000 = 1000 $ -> Sprout)', () => {
  const r = stadesDesBlocks({ blocks: [{ adr: A, sym: 'AAA', vie: 0.25, devise: 'ETH', etatVie: 'LUE' }], ethUsd: ETH_USD });
  assert.equal(groupeDe(r, A).cle, 'POUSSE');
  assert.equal(blocDe(r, A).capUsd, 1000);
  assert.equal(blocDe(r, A).source, 'CHAINE');
});

ok('temoin : sans prix ETH, un block cote en ETH reste en PRIX_NON_LU — jamais range en Seed', () => {
  const r = stadesDesBlocks({ blocks: [{ adr: A, sym: 'AAA', vie: 12, devise: 'ETH', etatVie: 'LUE' }], ethUsd: null });
  assert.equal(groupeDe(r, A).cle, 'PRIX_NON_LU');
  assert.equal(blocDe(r, A).capUsd, null);
});

/* ══ 2. LA GARDE : UNE DEVISE STABLE EST JUGEE, PAS MISE EN ATTENTE ══════════════════════════════
 * ⛔ C EST L ASSERTION QUI ROUGIT SI LA CONDITION ETH-SEULE REVIENT. */
ok('GARDE · un block cote en USDC est juge sur son palier, pas range en PRIX_NON_LU', () => {
  /* 250 000 USDC de vie : au-dessus de 1e5, sous 1e6 -> Trunk. Le prix de l ETH n y sert a rien. */
  const r = stadesDesBlocks({ blocks: [{ adr: A, sym: 'USDCBLOCK', vie: 250_000, devise: 'USDC', etatVie: 'LUE' }], ethUsd: ETH_USD });
  assert.equal(groupeDe(r, A).cle, 'TRONC', 'un block en USDC doit etre juge sur les memes paliers en dollars');
  assert.equal(blocDe(r, A).capUsd, 250_000, 'la vie en USDC est deja en dollars — parite 1, comme dans l app');
  assert.equal(blocDe(r, A).source, 'CHAINE');
  assert.equal(r.parMarche, 0, 'ce palier vient de la chaine, pas du marche public');
});

ok('GARDE · sans aucun prix ETH, un block en USDC est juge quand meme', () => {
  const r = stadesDesBlocks({ blocks: [{ adr: A, sym: 'USDCBLOCK', vie: 2_000_000, devise: 'USDC', etatVie: 'LUE' }], ethUsd: null });
  assert.equal(groupeDe(r, A).cle, 'CANOPEE', 'le prix de l ETH ne conditionne pas un palier en USDC');
});

/* ══ 3. LA GARDE : LE PRIX D UNE DEVISE LU PAR L APPELANT EST UTILISE ════════════════════════════
 * ⛔ C est le meme mecanisme que `prixDeviseUsd` dans `peindreJeu` (lu sur /api/prix-usd). */
ok('GARDE · un prix de devise fourni par l appelant juge le palier (cbBTC)', () => {
  const r = stadesDesBlocks({ blocks: [{ adr: A, sym: 'BTCBLOCK', vie: 2, devise: 'cbBTC', etatVie: 'LUE' }],
    ethUsd: ETH_USD, prixUsdParDevise: { cbBTC: 60_000 } });
  assert.equal(blocDe(r, A).capUsd, 120_000);
  assert.equal(groupeDe(r, A).cle, 'TRONC');
});

ok('GARDE · une action tokenisee avec son prix lu est jugee (METAc)', () => {
  const r = stadesDesBlocks({ blocks: [{ adr: A, sym: 'METABLOCK', vie: 10, devise: 'METAc', etatVie: 'LUE' }],
    ethUsd: ETH_USD, prixUsdParDevise: { METAc: 1400 } });
  assert.equal(blocDe(r, A).capUsd, 14_000);
  assert.equal(groupeDe(r, A).cle, 'BRANCHE'); /* 14 000 $ : au-dessus de 1e4, sous 1e5 */
});

/* ══ 4. CE QUI DOIT RESTER FERME — « pas lu » n est pas « pas de valeur » ════════════════════════ */
ok('sans prix pour sa devise et sans FDV, un block en cbBTC reste en PRIX_NON_LU (echec FERME)', () => {
  const r = stadesDesBlocks({ blocks: [{ adr: A, sym: 'BTCBLOCK', vie: 2, devise: 'cbBTC', etatVie: 'LUE' }], ethUsd: ETH_USD });
  assert.equal(groupeDe(r, A).cle, 'PRIX_NON_LU', 'aucun prix invente pour une devise qu on n a pas lue');
  assert.equal(blocDe(r, A).capUsd, null);
  assert.equal(blocDe(r, A).source, 'RIEN');
});

ok('un prix de devise absurde n est pas un prix (0, negatif, NaN, texte)', () => {
  for (const v of [0, -3, NaN, Infinity, '60000', null, undefined]) {
    const r = stadesDesBlocks({ blocks: [{ adr: B, sym: 'BTCBLOCK', vie: 2, devise: 'cbBTC', etatVie: 'LUE' }],
      ethUsd: ETH_USD, prixUsdParDevise: { cbBTC: v } });
    assert.equal(groupeDe(r, B).cle, 'PRIX_NON_LU', 'prix cbBTC = ' + String(v));
  }
});

ok('une devise inconnue du registre n est PAS convertie au prix de l ETH', () => {
  /* ⛔ Le piege inverse : « tout convertir » rangerait un block libelle en n importe quoi dans un faux palier. */
  const r = stadesDesBlocks({ blocks: [{ adr: A, sym: 'ZZZ', vie: 3, devise: 'MONNAIEDESINGE', etatVie: 'LUE' }], ethUsd: ETH_USD });
  assert.equal(groupeDe(r, A).cle, 'PRIX_NON_LU');
  const r2 = stadesDesBlocks({ blocks: [{ adr: A, sym: 'ZZZ', vie: 3, devise: null, etatVie: 'LUE' }], ethUsd: ETH_USD });
  assert.equal(groupeDe(r2, A).cle, 'PRIX_NON_LU', 'une devise non nommee n est pas de l ETH');
});

/* ══ 5. LE CUL-DE-SAC EST LEVE : LA FDV PUBLIQUE PEUT JUGER CE QUE LA DEVISE NE PERMET PAS ═══════ */
ok('vie lue en cbBTC sans prix, mais FDV publique connue : le marche juge, et il se declare', () => {
  const r = stadesDesBlocks({ blocks: [{ adr: A, sym: 'BTCBLOCK', vie: 2, devise: 'cbBTC', etatVie: 'LUE', capUsdMarche: 155_446 }],
    ethUsd: ETH_USD });
  assert.equal(groupeDe(r, A).cle, 'TRONC');
  assert.equal(blocDe(r, A).source, 'MARCHE', 'ce palier ne vient pas de la chaine et le dit');
  assert.equal(r.parMarche, 1);
});

ok('la vie convertible garde la priorite sur la FDV publique', () => {
  /* 250 000 USDC lus on-chain contre une FDV publique qui dirait Monument : la chaine gagne. */
  const r = stadesDesBlocks({ blocks: [{ adr: A, sym: 'USDCBLOCK', vie: 250_000, devise: 'USDC', etatVie: 'LUE', capUsdMarche: 5e9 }],
    ethUsd: ETH_USD });
  assert.equal(groupeDe(r, A).cle, 'TRONC');
  assert.equal(blocDe(r, A).source, 'CHAINE');
  assert.equal(r.parMarche, 0);
});

ok('vie lue, aucun prix, aucune FDV : PRIX_NON_LU — et surtout pas NON_LU', () => {
  /* ⛔ « marche non lu » accuserait notre noeud d un echec qui n a pas eu lieu : le marche A ete lu. */
  const r = stadesDesBlocks({ blocks: [{ adr: A, sym: 'BTCBLOCK', vie: 2, devise: 'cbBTC', etatVie: 'LUE' }], ethUsd: ETH_USD });
  assert.equal(groupeDe(r, A).cle, 'PRIX_NON_LU');
  assert.notEqual(groupeDe(r, A).cle, 'NON_LU');
});

/* ══ 6. LE TITRE NE NOMME PLUS UNE FAUSSE CAUSE ═════════════════════════════════════════════════ */
ok('le titre de PRIX_NON_LU ne promet plus que seul le prix de l ETH manque', () => {
  const t = STADES_HORS_PALIER.find((s) => s.cle === 'PRIX_NON_LU').titre;
  assert.ok(!/ETH/.test(t), 'le groupe contient aussi des blocks cotes ailleurs : ' + t);
  assert.ok(/price/i.test(t), 'il doit quand meme dire que c est un prix qui manque : ' + t);
});

/* ══ 7. LE REGISTRE EST IMPORTE, PAS RECOPIE ════════════════════════════════════════════════════
 * ⛔ Si `paires.js` gagne un stablecoin, `stades.js` doit le savoir SANS etre re-edite. */
ok('chaque devise STABLE du registre paires.js est convertie a parite, sans liste locale', () => {
  const stables = pairesProposees(8453).filter((p) => p.type === 'STABLE');
  assert.ok(stables.length >= 1, 'le registre doit contenir au moins un stable — sinon ce test ne regarde rien');
  for (const s of stables) assert.equal(prixUsdDeLaDevise(s.symbole, null), 1, s.symbole);
  /* et un MAJEUR / une ACTION n est PAS a parite */
  for (const p of pairesProposees(8453).filter((q) => q.type === 'MAJEUR' || q.type === 'ACTION')) {
    assert.equal(prixUsdDeLaDevise(p.symbole, ETH_USD), null, p.symbole + ' ne vaut pas 1 $');
  }
});

ok('prixUsdDeLaDevise : ETH suit ethUsd, et rend null quand il n est pas mesure', () => {
  assert.equal(prixUsdDeLaDevise('ETH', 4321), 4321);
  for (const v of [null, 0, -1, NaN, '4000', undefined]) assert.equal(prixUsdDeLaDevise('ETH', v), null, String(v));
});

console.log('test-stades-devise:', n, 'assertions groupees, exit 0');
