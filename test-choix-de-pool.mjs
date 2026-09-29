/* test-choix-de-pool.mjs — DEVIER VERS LA POOL QUI NOUS PAIE NE DOIT JAMAIS COUTER PLUS QUE LE FRAIS.
 *
 * ⛔⛔ CE FICHIER GARDE DE L ARGENT DANS LES DEUX SENS, ET LE SECOND EST LE PLUS IMPORTANT :
 *     · que le frais TOMBE quand il peut tomber (sinon le travail ne sert a rien) ;
 *     · que le visiteur ne paie JAMAIS le detour plus cher que le frais qu on prend.
 *     La seconde garde protege quelqu un qui n est pas dans la piece. Si elle saute, on prend en
 *     silence plus que les 0,1 % annonces — et ce serait exactement le genre de chiffre que ce
 *     projet refuse de publier.
 *
 * ⛔ ET LE CAS « ON NE SAIT PAS » EST TESTE A PART : un glissement illisible ne doit PAS faire
 *   devier. Devier sans connaitre le cout, c est decider a la place du visiteur sans rien mesurer.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { choisirPool, phraseDuChoix, VERDICTS_CHOIX, MARGE_BPS } from './choix-de-pool.js';

let n = 0;
const cas = (t, f) => { n += 1; try { f(); } catch (e) { console.error('✗ ' + t); throw e; } };
const A = '0xaaaa000000000000000000000000000000000001';
const B = '0xbbbb000000000000000000000000000000000002';

cas('⛔ AERODROME MEILLEURE OU EGALE : on y va, et le frais tombe', () => {
  for (const [gA, gB] of [[0, 50], [10, 10], [3, 900]]) {
    const r = choisirPool({ aerodrome: { pool: A, glissementBps: gA }, autre: { pool: B, glissementBps: gB } });
    assert.equal(r.verdict, 'AERODROME', gA + ' vs ' + gB);
    assert.equal(r.pool, A);
    assert.equal(r.porteFrais, true);
  }
});

cas('⛔ SURCOUT DANS LA MARGE : on devie, et on DIT le surcout', () => {
  const r = choisirPool({ aerodrome: { pool: A, glissementBps: 55 }, autre: { pool: B, glissementBps: 50 } });
  assert.equal(r.verdict, 'AERODROME');
  assert.equal(r.surcoutBps, 5n);
  assert.match(phraseDuChoix(r), /5 bps more/);
});

cas('⛔⛔ LA FRONTIERE EXACTE EST ACCEPTEE, ET C EST DELIBERE', () => {
  /* ⛔ surcout == marge : le detour coute EXACTEMENT ce qu il rapporte. Accepte, et nomme.
   *   Une inegalite stricte rejetterait ce cas sans raison — mais le cas juste au-dessus doit,
   *   lui, basculer. C est la paire qui prouve que le seuil est au bon endroit. */
  const pile = choisirPool({ aerodrome: { pool: A, glissementBps: 60 }, autre: { pool: B, glissementBps: 50 } });
  assert.equal(pile.surcoutBps, MARGE_BPS);
  assert.equal(pile.verdict, 'AERODROME', 'le cas EXACTEMENT a la marge doit passer');
  const unDePlus = choisirPool({ aerodrome: { pool: A, glissementBps: 61 }, autre: { pool: B, glissementBps: 50 } });
  assert.equal(unDePlus.verdict, 'AUTRE_MEILLEURE', 'un bps au-dessus de la marge doit basculer');
});

cas('⛔⛔⛔ SURCOUT AU-DESSUS DE LA MARGE : ON RENONCE AU FRAIS, PAS LE VISITEUR A SON PRIX', () => {
  /* ⛔⛔ LE CAS QUI PROTEGE QUELQU UN QUI N EST PAS DANS LA PIECE. Sans lui, un block dont la pool
   *     Aerodrome est minuscule enverrait le visiteur y perdre des pourcents pour qu on gagne
   *     10 bps. On prefere ne RIEN prendre. */
  for (const [gA, gB] of [[200, 50], [9000, 3], [11, 0]]) {
    const r = choisirPool({ aerodrome: { pool: A, glissementBps: gA }, autre: { pool: B, glissementBps: gB } });
    assert.equal(r.verdict, 'AUTRE_MEILLEURE', gA + ' vs ' + gB);
    assert.equal(r.pool, B, 'le visiteur doit rester sur la meilleure pool');
    assert.equal(r.porteFrais, false, 'on ne prend RIEN quand on ne devie pas');
    assert.match(phraseDuChoix(r), /no fee is taken/);
  }
});

cas('⛔⛔ UN GLISSEMENT ILLISIBLE NE FAIT JAMAIS DEVIER', () => {
  /* ⛔ « je n ai pas pu lire » n est pas « c est bon ». Devier sans connaitre le cout, c est
   *   decider a la place du visiteur sans rien mesurer. */
  for (const mauvais of [null, undefined, NaN, 'beaucoup', {}]) {
    const r = choisirPool({ aerodrome: { pool: A, glissementBps: mauvais }, autre: { pool: B, glissementBps: 50 } });
    assert.equal(r.verdict, 'NON_MESURE', 'glissement aerodrome = ' + String(mauvais));
    assert.equal(r.porteFrais, false);
    assert.equal(r.pool, B, 'on laisse le visiteur sur la pool connue');
  }
  const r2 = choisirPool({ aerodrome: { pool: A, glissementBps: 10 }, autre: { pool: B, glissementBps: NaN } });
  assert.equal(r2.verdict, 'NON_MESURE', 'un glissement manquant DE L AUTRE COTE compte aussi');
});

cas('⛔ NaN NE DOIT PAS TRAVERSER LA COMPARAISON', () => {
  /* ⛔⛔ `NaN <= x` est FAUX, donc un NaN pourrait glisser vers « AUTRE_MEILLEURE » au lieu d etre
   *     nomme NON_MESURE — un echec qui se deguise en decision. Ce depot a deja paye ce motif. */
  const r = choisirPool({ aerodrome: { pool: A, glissementBps: NaN }, autre: { pool: B, glissementBps: NaN } });
  assert.equal(r.verdict, 'NON_MESURE');
  assert.equal(r.surcoutBps, null, 'aucun surcout ne doit etre annonce quand rien n est lu');
});

cas('⛔ UNE SEULE POOL : rien a arbitrer, mais le frais est nomme dans les deux sens', () => {
  const seuleA = choisirPool({ aerodrome: { pool: A, glissementBps: 40 }, autre: null });
  assert.equal(seuleA.verdict, 'AERODROME_SEULE');
  assert.equal(seuleA.porteFrais, true);
  const seuleB = choisirPool({ aerodrome: null, autre: { pool: B, glissementBps: 40 } });
  assert.equal(seuleB.verdict, 'AUTRE_SEULE');
  assert.equal(seuleB.porteFrais, false);
  assert.match(phraseDuChoix(seuleB), /no Aerodrome pool/);
  const aucune = choisirPool({ aerodrome: null, autre: null });
  assert.equal(aucune.verdict, 'NON_MESURE');
  assert.equal(aucune.pool, null);
});

cas('⛔ LE FRAIS N EST JAMAIS ANNONCE SANS POOL, ET JAMAIS TU QUAND IL TOMBE', () => {
  /* ⛔ Invariant croise : `porteFrais === true` EXIGE une pool Aerodrome choisie. */
  const tous = [
    choisirPool({ aerodrome: { pool: A, glissementBps: 0 }, autre: { pool: B, glissementBps: 0 } }),
    choisirPool({ aerodrome: { pool: A, glissementBps: 999 }, autre: { pool: B, glissementBps: 0 } }),
    choisirPool({ aerodrome: null, autre: { pool: B, glissementBps: 0 } }),
    choisirPool({ aerodrome: { pool: A, glissementBps: 5 }, autre: null }),
    choisirPool({ aerodrome: null, autre: null }),
  ];
  for (const r of tous) {
    assert.ok(VERDICTS_CHOIX.includes(r.verdict), 'verdict hors liste : ' + r.verdict);
    if (r.porteFrais) assert.equal(r.pool, A, 'frais annonce sur une pool qui n est pas celle d Aerodrome');
    assert.equal(typeof phraseDuChoix(r), 'string');
    assert.ok(phraseDuChoix(r).length > 20, 'phrase trop courte pour dire quoi que ce soit');
  }
});

cas('⛔⛔ LA MARGE EST LE FRAIS, et ce lien doit rester explicite', () => {
  /* ⛔ SI QUELQU UN AUGMENTE LA MARGE SANS AUGMENTER LE FRAIS, le detour couterait au visiteur plus
   *   que ce qu il nous rapporte — et ce test doit le dire tout de suite. 10 bps = 0,1 %. */
  assert.equal(MARGE_BPS, 10n,
    'la marge a change : si ce n est pas une decision de Phil, le detour peut maintenant couter au '
    + 'visiteur PLUS que le frais qu on encaisse');
});

cas('⛔⛔ LE CHEMIN D ACHAT UTILISE VRAIMENT L ARBITRAGE, ET AFFICHE SON COUT', () => {
  /* ⛔ UN MODULE PARFAIT QUE PERSONNE N APPELLE NE RAPPORTE RIEN ET NE PROTEGE PERSONNE. Cette
   *   garde existe parce que le depot a deja eu le cas : `rachat.js`, 13 assertions, importe par
   *   personne. */
  const html = readFileSync(new URL('./app.html', import.meta.url), 'utf8');
  const d = html.indexOf('async function acheterAvecUsdc(');
  const f = html.indexOf("$('#fAcheterUsdc').addEventListener", d);
  assert.ok(d > 0 && f > d, 'la fonction d achat USDC est introuvable : ce controle ne garde rien');
  const bloc = html.slice(d, f);
  assert.match(html, /import \{ choisirPool, phraseDuChoix \} from '\.\/choix-de-pool\.js'/,
    'le module d arbitrage n est pas importe');
  assert.match(bloc, /choisirPool\(\{/, 'le chemin d achat n arbitre pas entre les deux pools');
  assert.match(bloc, /phraseDuChoix\(choix\)/,
    'le cout du detour n est pas affiche : devier en silence, c est prendre sans le dire');
  /* ⛔⛔ ET LA POOL CHOISIE DOIT ETRE CELLE QU ON PASSE AU PLANIFICATEUR. Sans ca, on afficherait
   *     une belle phrase et on achèterait quand meme sur l ancienne pool — une divulgation qui ne
   *     correspond a rien, ce qui est pire que pas de divulgation. */
  assert.match(bloc, /pool:\s*poolChoisie/,
    'le planificateur recoit encore `pool` et non `poolChoisie` : le choix ne change rien');
  const iChoix = bloc.indexOf('choisirPool({');
  const iPlan = bloc.indexOf('planAchatUsdcV3({');
  assert.ok(iChoix > 0 && iPlan > iChoix, 'l arbitrage arrive APRES le plan : il ne peut rien changer');
  /* ⛔ LE FRAIS NE S ALLUME QUE SI L ARBITRAGE LE DIT : `famille = 'cl'` force sans `porteFrais`
   *   reintroduirait le frais sur une pool qui ne peut pas le porter. */
  assert.match(bloc, /choix\.porteFrais\s*\?\s*'cl'/,
    'la famille ne depend pas du verdict d arbitrage');
});

console.log('✓ test-choix-de-pool : ' + n + ' cas');
console.log('   On devie vers la pool qui paie UNIQUEMENT si le surcout reste <= au frais lui-meme.');
console.log('   Au-dela, on renonce au frais — un frais non pris ne blesse personne.');
console.log('   ⚠️ NE PROUVE PAS que les glissements donnes sont justes : ce module DECIDE, il ne lit pas.');
