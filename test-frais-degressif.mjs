/* Le bareme degressif : ce qu il garantit, et la falaise qu il ferme.
 *
 * ⭐ DECISION DE PHIL (2026-10-01) : « mini 50 bps pour petit montant et tu adaptes au montant ».
 * ⛔ LES PALIERS VIENNENT DE LA DISTRIBUTION MESUREE des tailles de trade (250 lignes servies) :
 *   p75 = 95,94 $ et p99 = 1 672,31 $. Donc 100 $ et 1 700 $ — pas des nombres ronds choisis au
 *   hasard, mais les quantiles de ce qui se passe reellement chez nous.
 *
 * ⛔⛔⛔ ET LA PROPRIETE QUI COMPTE LE PLUS : PAYER PLUS NE DOIT JAMAIS COUTER MOINS. Avec des taux
 *   appliques betement au montant entier, 100 $ a 50 bps coute 0,50 $ et 101 $ a 20 bps coute
 *   0,202 $ — une falaise qui s exploite en poussant son montant juste au-dessus du palier. Elle
 *   est testee AUX DEUX COTES DE CHAQUE PALIER, au cent pres : une propriete verifiee au milieu
 *   des tranches ne prouve RIEN sur les bords.
 */
import { strict as assert } from 'node:assert';
import { ETATS, PALIERS, BPS_MAX, bpsPourUsd, fraisPourMontant,
  phraseFraisDegressif } from './frais-degressif.js';

let n = 0;
const cas = (titre, f) => { n++; try { f(); } catch (e) { console.error('✗ ' + titre); throw e; } };

/* OUSD : 6 decimales, prix lu a ~1,00 $ (mesure : 1,00000088). */
const DEC = 6;
const PRIX = 1;
const u = (dollars) => BigInt(Math.round(dollars * 10 ** DEC));
const f = (dollars, prix = PRIX) => fraisPourMontant({ montant: u(dollars), decimales: DEC, prixUsd: prix });

console.log('le bareme, sur le palier MESURE');
/* ⛔ DECISION FINALE DE PHIL : « peu taxer, donc 0,1 % 0,2 % ». Elle REMPLACE le plancher a 50 bps
 *   qu il avait evoque avant — et ce test l encode, pour qu un retour a 50 bps rougisse. */
cas('deux paliers : 0,2 % jusqu a 100 $, puis 0,1 % sans plafond', () => {
  assert.equal(PALIERS.length, 2);
  assert.equal(PALIERS[0].jusquaUsd, 100);
  assert.equal(PALIERS[1].jusquaUsd, null);
  assert.deepEqual(PALIERS.map((p) => p.bps), [20n, 10n]);
});
cas('⛔ et AUCUN palier ne depasse 0,2 % — « peu taxer » est une borne, pas une intention', () => {
  for (const p of PALIERS) assert.ok(p.bps <= 20n, 'un palier a ' + p.bps + ' bps');
});
cas('⛔ le bareme est GELE — un bareme modifiable n est plus un bareme', () => {
  assert.ok(Object.isFrozen(PALIERS));
  for (const p of PALIERS) assert.ok(Object.isFrozen(p));
});
cas('BPS_MAX est bien le taux le plus HAUT du bareme', () => { assert.equal(BPS_MAX, 20n); });

console.log('');
console.log('⭐ 0,2 % en bas — la ou vit la mediane de nos echanges (22,57 $)');
cas('10 $ paie 20 bps', () => {
  const r = f(10);
  assert.equal(r.etat, 'OK', r.pourquoi);
  assert.equal(r.bps, 20n);
  assert.equal(r.frais, u(10) * 20n / 10000n);
});
cas('22,57 $ — la MEDIANE mesuree — paie 20 bps', () => { assert.equal(f(22.57).bps, 20n); });
cas('100 $ (le palier p75) paie encore 20 bps : la borne elle-meme est DANS la tranche', () => {
  assert.equal(f(100).bps, 20n);
});

console.log('');
console.log('la degressivite : le TAUX descend bien');
cas('1 000 $ paie 10 bps', () => { assert.equal(f(1000).bps, 10n); });
cas('10 000 $ paie 10 bps — le taux « comme d hab »', () => { assert.equal(f(10000).bps, 10n); });
cas('⛔ et le TAUX EFFECTIF descend vraiment entre 10 $ et 100 000 $', () => {
  const petit = f(10), gros = f(100000);
  assert.ok(gros.bpsEffectif < petit.bpsEffectif,
    'effectif ' + gros.bpsEffectif + ' pas sous ' + petit.bpsEffectif);
});

console.log('');
console.log('⛔⛔⛔ LA MONOTONIE : PAYER PLUS NE COUTE JAMAIS MOINS');
cas('juste au-dessus du palier 100 $, le frais ne BAISSE pas', () => {
  /* ⛔ LA FALAISE, SANS PLANCHER : 100 $ a 20 bps = 0,20 ; 100,01 $ a 10 bps = 0,10. Payer un cent
   *   de plus couterait MOITIE MOINS, et ca s exploite en poussant son montant juste au-dessus. */
  const avant = f(100), apres = f(100.01);
  assert.ok(apres.frais >= avant.frais,
    'falaise : ' + avant.frais + ' -> ' + apres.frais);
  assert.ok(apres.parPlancher, 'le plancher n a pas joue');
});
cas('⛔⛔ ET LA MONOTONIE TIENT SUR TOUTE LA PLAGE, pas seulement aux bords', () => {
  /* ⛔ Un balayage, parce qu une propriete verifiee a deux endroits n est pas une propriete. */
  let precedent = 0n, pire = null;
  for (const d of [1, 5, 10, 25, 50, 99, 99.99, 100, 100.01, 150, 500, 999,
    2000, 5000, 10000, 50000, 100000]) {
    const r = f(d);
    assert.equal(r.etat, 'OK', d + ' $ : ' + r.pourquoi);
    if (r.frais < precedent) pire = d + ' $ paie ' + r.frais + ' alors que moins payait ' + precedent;
    precedent = r.frais > precedent ? r.frais : precedent;
  }
  assert.equal(pire, null, pire || '');
});
cas('⛔ et le taux EFFECTIF est bien celui qu on paie, plancher compris', () => {
  const r = f(100.01);
  assert.ok(r.bpsEffectif > Number(r.bps),
    'le plancher devrait rendre l effectif SUPERIEUR au taux du palier');
});

console.log('');
console.log('⛔⛔ SANS PRIX LU, ON APPLIQUE LE TAUX LE PLUS HAUT');
cas('prix absent -> 50 bps, et la raison est NOMMEE', () => {
  const r = fraisPourMontant({ montant: u(10000), decimales: DEC });
  assert.equal(r.etat, 'OK');
  assert.equal(r.bps, BPS_MAX);
  assert.match(r.pourquoi, /no USD price was read/i);
  /* ⛔ Le doute nous coute un revenu potentiel sur les gros montants — jamais une surprise a
   *   l utilisateur, et jamais une SOUS-facturation sur une supposition. */
});
cas('prix nul, negatif ou non fini -> le taux le plus haut', () => {
  for (const p of [0, -1, NaN, Infinity, null, 'un dollar']) {
    assert.equal(fraisPourMontant({ montant: u(10000), decimales: DEC, prixUsd: p }).bps, BPS_MAX,
      'prix ' + String(p) + ' a change le taux');
  }
});
cas('⛔ un prix lu NON-DOLLAR situe le palier correctement (ETH a 2 700 $)', () => {
  /* ⛔ 0,05 ETH a 2 700 $ = 135 $, donc AU-DESSUS du palier de 100 $ ⇒ 10 bps. C est le point du
   *   test : le palier se lit en DOLLARS, pas en unites — 0,05 « unite » ferait croire a un petit
   *   montant alors que c est 135 $. Sans le prix, on serait reste au taux le plus haut. */
  const r = fraisPourMontant({ montant: 50000000000000000n, decimales: 18, prixUsd: 2700 });
  assert.equal(r.etat, 'OK', r.pourquoi);
  assert.equal(r.bps, 10n);
});
cas('⛔ et un PETIT montant en ETH reste au taux haut (0,01 ETH = 27 $)', () => {
  /* ⛔ L envers : sans ce cote, un bareme qui rendrait 10 bps PARTOUT passerait le cas precedent. */
  const r = fraisPourMontant({ montant: 10000000000000000n, decimales: 18, prixUsd: 2700 });
  assert.equal(r.etat, 'OK', r.pourquoi);
  assert.equal(r.bps, 20n);
});

console.log('');
console.log('⛔ LES ENTREES ABSURDES REFUSENT AU LIEU DE SUPPOSER');
cas('montant nul, negatif, non entier ou absent -> REFUSE', () => {
  for (const m of [0n, -1n, undefined, null, '100', 1.5]) {
    assert.equal(fraisPourMontant({ montant: m, decimales: DEC, prixUsd: PRIX }).etat, 'REFUSE',
      'montant ' + String(m) + ' a passe');
  }
});
cas('⛔ des decimales NON LUES -> REFUSE (jamais 18 par defaut)', () => {
  for (const d of [undefined, null, -1, 1.5, 37, '6']) {
    assert.equal(fraisPourMontant({ montant: u(10), decimales: d, prixUsd: PRIX }).etat, 'REFUSE',
      'decimales ' + String(d) + ' a passe');
  }
});
/* ⛔⛔ CE CAS A CORRIGE MON ATTENTE, PAS LE CODE. J attendais un REFUS sur 1 unite : faux. 1 unite a
 *   50 bps donne un frais de ZERO (arrondi vers le bas), ce qui est correct et ne « mange » rien.
 *   ⭐ ET EN LE VERIFIANT, J AI VU QUE LA GARDE `frais >= montant` EST INATTEIGNABLE avec ce
 *     bareme : le plancher vient toujours d un palier INFERIEUR au montant, donc il reste toujours
 *     quelque chose a echanger. C est un `zero par impossibilite` — une garde qui ne peut pas
 *     tomber. Je la GARDE (elle coute rien et protege un futur changement de paliers) mais je ne
 *     pretends pas la tester : affirmer qu un test la couvre serait un faux temoin. */
cas('un montant d UNE unite rend un frais de ZERO, et reste valide', () => {
  const r = fraisPourMontant({ montant: 1n, decimales: DEC, prixUsd: PRIX });
  assert.equal(r.etat, 'OK', r.pourquoi);
  assert.equal(r.frais, 0n);
});
cas('⛔ et le frais ne depasse JAMAIS le montant, sur toute la plage balayee', () => {
  /* ⛔ La propriete que la garde inatteignable voulait proteger, verifiee directement. */
  for (const d of [0.000001, 0.01, 1, 10, 100, 100.01, 1000, 10000, 1000000]) {
    const r = f(d);
    if (r.etat !== 'OK') continue;
    assert.ok(r.frais < u(d), d + ' $ : frais ' + r.frais + ' >= montant ' + u(d));
  }
});
cas('sans argument du tout -> REFUSE', () => {
  assert.equal(fraisPourMontant().etat, 'REFUSE');
});
cas('⛔ l arrondi va VERS LE BAS (on prend MOINS que le taux affiche)', () => {
  /* 7 unites a 50 bps = 0,035 -> 0. Prendre 1 depasserait le taux annonce. */
  const r = fraisPourMontant({ montant: 7n, decimales: 0, prixUsd: 1 });
  assert.equal(r.etat, 'OK', r.pourquoi);
  assert.equal(r.frais, 0n);
});

console.log('');
console.log('la phrase : elle donne le taux QU ON PAIE, pas celui du palier');
cas('elle donne le montant et le taux effectif', () => {
  const r = f(1000);
  const s = phraseFraisDegressif(r, 'OUSD');
  assert.match(s, new RegExp(String(r.frais)));
  assert.match(s, /OUSD/);
  assert.match(s, /0\.2%/);
});
cas('⛔ quand le PLANCHER joue, elle dit POURQUOI le taux est plus haut que le palier', () => {
  const s = phraseFraisDegressif(f(100.01), 'OUSD');
  assert.match(s, /floor from the tier below/i);
});
cas('⛔ sans prix, elle dit que le taux le plus haut s applique', () => {
  const s = phraseFraisDegressif(fraisPourMontant({ montant: u(5000), decimales: DEC }), 'OUSD');
  assert.match(s, /no USD price was read/i);
});
cas('elle annonce la degressivite aux montants normaux, avec LES DEUX taux et LE SEUIL', () => {
  const s = phraseFraisDegressif(f(10), 'OUSD');
  assert.match(s, /Larger trades pay a lower rate/i);
  assert.match(s, /0\.2% up to \$100/);
  assert.match(s, /0\.1% above \$100/);
  /* ⛔ ET ELLE NE MENTIONNE PLUS 0,5 % : ce taux a ete remplace par la decision « peu taxer », et
   *   une phrase qui le garderait annoncerait un prix qu on ne prend pas. */
  assert.ok(!/0\.5%/.test(s));
});
cas('un REFUS parle', () => {
  assert.match(phraseFraisDegressif(fraisPourMontant({ montant: 0n, decimales: DEC })), /No fee line/i);
});
cas('null parle', () => { assert.ok(phraseFraisDegressif(null).length > 0); });

console.log('');
console.log('le taux par dollars, isole');
cas('bpsPourUsd suit les paliers', () => {
  assert.equal(bpsPourUsd(0), 20n);
  assert.equal(bpsPourUsd(100), 20n);
  assert.equal(bpsPourUsd(100.01), 10n);
  assert.equal(bpsPourUsd(1e9), 10n);
});
cas('⛔ une valeur absurde rend le taux le plus HAUT, jamais le plus bas', () => {
  for (const v of [NaN, -1, Infinity, null, undefined, 'beaucoup']) {
    assert.equal(bpsPourUsd(v), BPS_MAX, String(v) + ' a rendu autre chose');
  }
});

console.log('');
console.log(n + ' cas, 0 KO');
