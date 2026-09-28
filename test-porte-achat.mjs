/* test-porte-achat.mjs — LA PORTE D ACHAT : DEUX CONDITIONS, TROIS ETATS, DES CHIFFRES REELS.
 *
 * ⛔ TOUTES LES FIXTURES SONT LUES SUR LA CHAINE le 2026-09-28 (`slot0()`, `liquidity()`,
 *   `token0()`, `tickSpacing()`, et la provenance par aller-retour sur la factory Aerodrome
 *   `0xf8f2eb4940cfe7d13603dddd87f123820fc061ef`). Aucune valeur inventee : un glissement plausible
 *   et faux est exactement ce qu on publierait sans le voir.
 * ⚠️ CE QUE CE TEST NE PROUVE PAS : que le glissement calcule soit celui d un achat reel. Il reste
 *   DANS le tick courant, donc c est un PLANCHER. Un achat qui franchit une borne coute plus.
 */
import assert from 'node:assert/strict';
import { VERDICTS_PORTE, GLISSEMENT_MAX_BPS, TAILLE_REFERENCE_USDC,
  glissementBps, porteDAchat, meriteUnePuce, porteNotreFrais } from './porte-achat.js';

let n = 0;
const cas = (nom, f) => { try { f(); n += 1; } catch (e) { console.log('✗ ' + nom); console.log('  ' + e.message); process.exit(1); } };

/* ── les cinq pools REELLES, lues le 2026-09-28 ──────────────────────────────────────────────── */
const POOLS = new Map([
  ['BEc', { sqrtPriceX96: '48588818357156691218189332790', liquidite: '3088617690', entreeEst0: true, famille: 'aerodrome', bpsAttendus: 385n }],
  ['MUc', { sqrtPriceX96: '24475272734523979322534669863', liquidite: '72297574125', entreeEst0: true, famille: 'autre', bpsAttendus: 8n }],
  ['HIMSc', { sqrtPriceX96: '139506451548367156544154519742', liquidite: '8157209009', entreeEst0: true, famille: 'aerodrome', bpsAttendus: 418n }],
  ['AVGOc', { sqrtPriceX96: '40780075941449323018499902426', liquidite: '2381129229', entreeEst0: true, famille: 'aerodrome', bpsAttendus: 418n }],
  ['NVDAc', { sqrtPriceX96: '52331659940558246504530950757', liquidite: '230172262108896', entreeEst0: true, famille: 'aerodrome', bpsAttendus: 0n }],
]);
const gl = (sym) => glissementBps({ ...POOLS.get(sym), entree: TAILLE_REFERENCE_USDC });
const porte = (sym) => porteDAchat({ glissement: gl(sym), familleProuvee: POOLS.get(sym).famille });

cas('⛔ les verdicts sont exhaustifs et disjoints', () => {
  assert.deepEqual([...VERDICTS_PORTE], ['ADMIS', 'ADMIS_SANS_FRAIS', 'GLISSEMENT_TROP_FORT', 'NON_MESURE']);
  assert.equal(new Set(VERDICTS_PORTE).size, VERDICTS_PORTE.length);
  assert.throws(() => { VERDICTS_PORTE.push('X'); }, 'la liste des verdicts doit etre gelee');
});

cas('⛔⛔ LE GLISSEMENT MESURE REPRODUIT LES CINQ POOLS REELLES, AU BPS', () => {
  for (const [sym, p] of POOLS) {
    const r = gl(sym);
    assert.equal(r.etat, 'OK', sym + ' devrait etre calculable');
    assert.equal(r.bps, p.bpsAttendus, sym + ' : ' + r.bps + ' bps au lieu de ' + p.bpsAttendus);
  }
});

cas('⛔⛔ LA TVL CLASSE A L ENVERS, ET C EST TOUTE LA RAISON DE CE MODULE', () => {
  /* BEc a PLUS de TVL que MUc (10 072 $ contre 9 728 $) et 48 fois PLUS de glissement. */
  assert.ok(gl('BEc').bps > gl('MUc').bps * 40n,
    'BEc devrait glisser bien plus que MUc — sinon l inversion mesuree a disparu et ce module perd sa raison');
  /* ⛔ ET LE SENS DE L INVERSION EST TENU, pas seulement son existence. */
  assert.equal(gl('MUc').bps, 8n);
  assert.equal(gl('BEc').bps, 385n);
});

cas('⛔ un glissement au-dessus de la borne ferme, et le verdict le NOMME', () => {
  for (const sym of ['BEc', 'HIMSc', 'AVGOc']) {
    const v = porte(sym);
    assert.equal(v.verdict, 'GLISSEMENT_TROP_FORT', sym);
    assert.ok(v.bps > GLISSEMENT_MAX_BPS, sym + ' doit depasser la borne');
    assert.match(v.pourquoi, /bps price impact/i);
    assert.equal(meriteUnePuce(v), false);
  }
});

cas('⛔⛔ MUc : ADMISE PARCE QUE SON MARCHE EST BON, ET DITE SANS FRAIS PARCE QU ELLE NE PAIE PAS', () => {
  const v = porte('MUc');
  /* ⛔⛔ PREMIERE VERSION : `PAS_AERODROME`, pas de puce. Corrigee sur decision de Phil le
   *     2026-09-29 — refuser un marche a 8 bps parce qu IL ne nous paie pas ferait passer notre
   *     interet avant celui de l utilisateur. Elle est admise, et le dit. */
  assert.equal(v.verdict, 'ADMIS_SANS_FRAIS');
  assert.equal(v.bps, 8n, 'son glissement est bon et le verdict doit le porter');
  assert.ok(v.bps < GLISSEMENT_MAX_BPS, 'MUc passe la condition de glissement');
  assert.match(v.pourquoi, /not on the Aerodrome/i);
  assert.match(v.pourquoi, /takes no 0\.10%/i, 'la phrase doit dire qu on ne prend rien dessus');
  /* ⛔⛔ LES DEUX QUESTIONS SONT SEPAREES, ET C EST LE COEUR DE CE CAS : elle merite sa puce ET
   *     elle ne porte pas notre frais. Une seule fonction pour les deux ferait soit refuser un bon
   *     marche, soit compter un revenu inexistant. */
  assert.equal(meriteUnePuce(v), true, 'un marche a 8 bps merite sa puce');
  assert.equal(porteNotreFrais(v), false, 'et il ne rapporte rien : sweepTokenWithFee est Aerodrome-seul');
});

cas('⛔⛔ QUAND LES DEUX CONDITIONS ECHOUENT, LE VERDICT DIT LE GLISSEMENT — ET C EST L ORDRE', () => {
  /* ⛔⛔ CE CAS MANQUAIT, ET SON ABSENCE RENDAIT FAUX UN COMMENTAIRE DE CE FICHIER. Le test de MUc
   *     affirmait tenir « l ordre des deux tests » ; il ne le tenait pas, parce que MUc PASSE la
   *     condition de glissement — les deux ordres y rendent `PAS_AERODROME`. Seul un cas qui
   *     echoue aux DEUX distingue les deux ordres. Une mutation l a montre : inverser les blocs ne
   *     cassait rien.
   *   ⛔ POURQUOI LE GLISSEMENT D ABORD : c est le fait le plus cher pour l utilisateur. Un marche
   *     a 418 bps reste mauvais meme s il passait un jour sur Aerodrome ; dire « pas Aerodrome »
   *     ferait croire qu un changement de routeur suffirait. */
  const lesDeux = porteDAchat({ glissement: { etat: 'OK', bps: 900n }, familleProuvee: 'autre' });
  assert.equal(lesDeux.verdict, 'GLISSEMENT_TROP_FORT',
    'un actif qui echoue aux deux doit rendre le glissement, pas la famille');
  assert.match(lesDeux.pourquoi, /900 bps/);
  assert.doesNotMatch(lesDeux.pourquoi, /Aerodrome router/i,
    'le verdict ne doit pas parler du routeur quand c est le glissement qui ferme');
});

cas('⛔ NVDAc passe les deux conditions', () => {
  const v = porte('NVDAc');
  assert.equal(v.verdict, 'ADMIS');
  assert.equal(v.bps, 0n);
  assert.equal(meriteUnePuce(v), true);
});

cas('⛔⛔ NON_MESURE N EST PAS UN REFUS, ET NE DOIT JAMAIS OUVRIR LA PORTE', () => {
  /* ⛔ `L == 0` est nomme a part : une pool sans liquidite au tick n est pas « cher », elle est
   *   IMPOSSIBLE. Rendre un grand nombre de bps l aurait fait passer pour un marche mauvais. */
  const zero = glissementBps({ sqrtPriceX96: POOLS.get('NVDAc').sqrtPriceX96, liquidite: 0n,
    entree: TAILLE_REFERENCE_USDC, entreeEst0: true });
  assert.equal(zero.etat, 'NON_MESURE');
  assert.match(zero.pourquoi, /zero liquidity/i);
  for (const mauvais of [
    { sqrtPriceX96: 0n, liquidite: 1n, entree: 1n, entreeEst0: true },
    { sqrtPriceX96: 1n, liquidite: null, entree: 1n, entreeEst0: true },
    { sqrtPriceX96: 1n, liquidite: 1n, entree: 0n, entreeEst0: true },
  ]) assert.equal(glissementBps(mauvais).etat, 'NON_MESURE', JSON.stringify(String(mauvais.sqrtPriceX96)));
  /* et la porte ne s ouvre pas sur un glissement non mesure, MEME sur Aerodrome */
  const v = porteDAchat({ glissement: zero, familleProuvee: 'aerodrome' });
  assert.equal(v.verdict, 'NON_MESURE');
  assert.equal(v.bps, null);
  assert.equal(meriteUnePuce(v), false);
});

cas('⛔⛔ AUCUN DEFAUT SUR LE SENS DE L ECHANGE', () => {
  /* ⛔ un `false` implicite donnerait un chiffre faux d un facteur enorme sans lever la main :
   *   sur NVDAc, se tromper de sens fait passer 0 bps a autre chose. */
  const sansSens = glissementBps({ sqrtPriceX96: POOLS.get('BEc').sqrtPriceX96,
    liquidite: POOLS.get('BEc').liquidite, entree: TAILLE_REFERENCE_USDC });
  assert.equal(sansSens.etat, 'NON_MESURE');
  assert.match(sansSens.pourquoi, /which side goes in/i);
  /* et les deux sens ne rendent PAS le meme chiffre — sinon le parametre ne servirait a rien */
  const a = glissementBps({ ...POOLS.get('BEc'), entree: TAILLE_REFERENCE_USDC, entreeEst0: true });
  const b = glissementBps({ ...POOLS.get('BEc'), entree: TAILLE_REFERENCE_USDC, entreeEst0: false });
  assert.notEqual(String(a.bps), String(b.bps), 'les deux sens doivent differer');
});

cas('⛔ une borne nulle ou absurde ne relache pas la porte', () => {
  for (const max of [0n, -1n, null, 'x', undefined]) {
    const v = porteDAchat({ glissement: gl('NVDAc'), familleProuvee: 'aerodrome', glissementMaxBps: max });
    if (max === undefined) { assert.equal(v.verdict, 'ADMIS', 'undefined doit retomber sur le defaut'); continue; }
    assert.equal(v.verdict, 'NON_MESURE', 'borne ' + String(max) + ' devrait fermer, pas ouvrir');
  }
});

cas('⛔ un glissement EXACTEMENT a la borne passe, un bps de plus ferme', () => {
  const pile = porteDAchat({ glissement: { etat: 'OK', bps: GLISSEMENT_MAX_BPS }, familleProuvee: 'aerodrome' });
  assert.equal(pile.verdict, 'ADMIS', 'la borne est inclusive');
  const unDePlus = porteDAchat({ glissement: { etat: 'OK', bps: GLISSEMENT_MAX_BPS + 1n }, familleProuvee: 'aerodrome' });
  assert.equal(unDePlus.verdict, 'GLISSEMENT_TROP_FORT');
});

cas('⛔⛔ LES DEUX PORTES SONT DISTINCTES SUR CHAQUE VERDICT, SANS EXCEPTION', () => {
  /* ⛔ la table complete, pas un echantillon : c est elle qui empeche qu un futur verdict se
   *   glisse du bon cote d une des deux fonctions sans que personne ne l ait decide. */
  const attendu = {
    ADMIS: { puce: true, frais: true },
    ADMIS_SANS_FRAIS: { puce: true, frais: false },
    GLISSEMENT_TROP_FORT: { puce: false, frais: false },
    NON_MESURE: { puce: false, frais: false },
  };
  for (const v of VERDICTS_PORTE) {
    assert.equal(meriteUnePuce({ verdict: v }), attendu[v].puce, 'puce sur ' + v);
    assert.equal(porteNotreFrais({ verdict: v }), attendu[v].frais, 'frais sur ' + v);
  }
  /* ⛔ et un objet absent ou mal forme n ouvre ni l une ni l autre */
  for (const rien of [null, undefined, {}, { verdict: '' }, 'ADMIS']) {
    assert.equal(meriteUnePuce(rien), false, 'puce sur ' + String(rien));
    assert.equal(porteNotreFrais(rien), false, 'frais sur ' + String(rien));
  }
});

cas('⛔ la famille doit etre le mot exact, jamais une variante', () => {
  for (const f of ['Aerodrome', 'AERODROME', 'aerodrome-cl', 'aero', '', null, undefined]) {
    const v = porteDAchat({ glissement: gl('NVDAc'), familleProuvee: f });
    /* ⛔⛔ UNE VARIANTE DE CASSE NE DOIT PAS PORTER NOTRE FRAIS. Depuis que hors-Aerodrome est
     *     ADMIS, l enjeu s est deplace : ce n est plus « a-t-il une puce » mais « compte-t-on un
     *     revenu dessus ». Une comparaison laxiste ferait croire que `sweepTokenWithFee` marche
     *     sur un routeur ou il n existe pas. */
    assert.equal(v.verdict, 'ADMIS_SANS_FRAIS', 'famille ' + String(f) + ' ne doit pas passer pour Aerodrome');
    assert.equal(porteNotreFrais(v), false, 'famille ' + String(f) + ' ne doit porter aucun frais');
  }
});

cas('⛔ la taille de reference est de 100 USDC a 6 decimales, pas 100 unites', () => {
  assert.equal(TAILLE_REFERENCE_USDC, 100000000n);
  assert.equal(GLISSEMENT_MAX_BPS, 300n);
  /* ⛔ une taille dix fois plus grande doit glisser plus — sinon le calcul ignore l entree */
  const petit = glissementBps({ ...POOLS.get('AVGOc'), entree: TAILLE_REFERENCE_USDC });
  const grand = glissementBps({ ...POOLS.get('AVGOc'), entree: TAILLE_REFERENCE_USDC * 10n });
  assert.ok(grand.bps > petit.bps, 'un achat dix fois plus gros doit glisser davantage');
});

console.log('✓ test-porte-achat : ' + n + ' cas');
console.log('   Cinq pools REELLES lues le 2026-09-28 ; l inversion TVL/glissement est gelee ici.');
console.log('   ⚠️ NE PROUVE PAS le glissement d un achat reel : le calcul reste DANS le tick');
console.log('      courant, donc c est un PLANCHER. Un achat qui franchit une borne coute plus.');
