/* test-guichet-paiement.mjs — UN PAIEMENT OUVRE UN DROIT, UNE SEULE FOIS, ET LA PANNE FERME.
 *
 * ⛔⛔ CE QUE CE TEST DEFEND EST DE L ARGENT, PAS UNE FORME. Trois defauts precis, chacun deja vu
 *     en vrai dans ce projet ou dans un depot voisin :
 *     1. LE REJEU. Le verificateur de chaine repond « cette tx a paye » — et repondra la meme chose
 *        mille fois. Sans registre, UN paiement ouvre UNE INFINITE de droits.
 *     2. L ECHEC OUVERT. Dans notre propre paywall d un autre depot : `init failed -> paywall
 *        disabled`. La panne rendait la ressource payante GRATUITE. Ici toute panne doit REFUSER.
 *     3. LA COURSE. La verification etant asynchrone, deux requetes portant le MEME hash peuvent
 *        franchir la premiere garde ensemble. Un seul droit doit sortir. C est le cas que personne
 *        n ecrit, et c est celui qui coute.
 *
 * ⛔ AUCUN RESEAU : le `rpc` est une fonction locale qui rend des transactions fabriquees. Ce test
 *   prouve la LOGIQUE DU GUICHET, pas le comportement de la chaine.
 * ⚠️ CE QU IL NE PROUVE PAS : qu un paiement reel arrive. Aucune transaction n a ete signee — le
 *   harnais l interdit. Et il ne prouve rien de deux PROCESSUS concurrents : la course fermee ici
 *   est celle d un seul processus, ce que le module dit lui-meme.
 */
import { strict as assert } from 'node:assert';
import { creerGuichet, OUVERT, REFUS_CONFIG, REFUS_REJEU, REFUS_AUTRE_BESOIN, REFUS_CHAINE }
  from './guichet-paiement.js';
/* ⛔ LA FRONTIERE EST LUE, PAS RECOPIEE. Figer « 12 » ici ferait tester une frontiere PERIMEE le
 *   jour ou la constante change : le test resterait VERT en mesurant autre chose. Et c est ce
 *   test-ci qui m a appris la valeur — mon gabarit donnait 11 confirmations et le guichet a
 *   refuse, a raison. */
import { CONFIRMATIONS_MIN } from './verif-paiement.js';

let n = 0;
const cas = (titre, f) => { n++; try { f(); } catch (e) { console.error('✗ ' + titre); throw e; } };
const casAsync = async (titre, f) => { n++; try { await f(); } catch (e) { console.error('✗ ' + titre); throw e; } };

const PAY_TO = '0x' + 'a'.repeat(40);
const PAYEUR = '0x' + 'b'.repeat(40);
const HASH = '0x' + 'c'.repeat(64);
const HASH2 = '0x' + 'd'.repeat(64);
const TARIFS = { rapport: { montantMin: 1000000n, actif: 'USDC', quoi: 'one block report' },
  autre: { montantMin: 2000000n, actif: 'USDC', quoi: 'something else' } };
const USDC = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913';
const TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const mot = (h) => '0x' + String(h).slice(2).padStart(64, '0');

/** Un lecteur de chaine qui rend un paiement USDC valide, sauf si on le derange. */
function lecteur({ from = PAYEUR, status = '0x1', to = PAY_TO, montant = 1000000n,
  bloc = 1000, tete = 1000 + CONFIRMATIONS_MIN, jette = null, txAbsente = false } = {}) {
  return async (m) => {
    if (jette) throw new Error(jette);
    if (m === 'eth_blockNumber') return '0x' + tete.toString(16);
    if (m === 'eth_getTransactionByHash') return txAbsente ? null : { from, to: USDC, value: '0x0' };
    if (m === 'eth_getTransactionReceipt') {
      return txAbsente ? null : { status, blockNumber: '0x' + bloc.toString(16),
        logs: [{ address: USDC, topics: [TOPIC, mot(from), mot(to)], data: '0x' + montant.toString(16).padStart(64, '0') }] };
    }
    throw new Error('methode non prevue : ' + m);
  };
}
/** Registre en memoire — le VRAI doit etre persistant, ce que le module exige et dit. */
function registre() {
  let etat = {};
  return { lire: () => etat, ecrire: (r) => { etat = r; }, voir: () => etat };
}

/* ── 1. la configuration absente FERME, elle n ouvre pas ───────────────────────────────────── */
cas('sans payTo, le guichet refuse tout', () => {
  const g = creerGuichet({ rpc: lecteur(), payTo: '', tarifs: TARIFS,
    lireRegistre: () => ({}), ecrireRegistre: () => {} });
  assert.equal(g.etat().ok, false, 'un guichet sans destinataire se declare utilisable');
  assert.match(String(g.etat().pourquoi), /recipient/, 'le refus ne nomme pas sa cause');
});

cas('SANS REGISTRE DE REJEU, le guichet REFUSE de fonctionner', () => {
  /* ⛔⛔ LE CAS LE PLUS IMPORTANT DE CE FICHIER. Un guichet qui verifie bien mais ne retient rien
   *     laisse rejouer a l infini : il aurait l air de marcher, ce qui est pire que rien. */
  const g = creerGuichet({ rpc: lecteur(), payTo: PAY_TO, tarifs: TARIFS });
  assert.equal(g.etat().ok, false, 'un guichet sans registre se declare utilisable');
  assert.match(String(g.etat().pourquoi), /replay/i, 'le refus ne nomme pas le rejeu');
});

cas('un tarif de zero est refuse', () => {
  const r = registre();
  const g = creerGuichet({ rpc: lecteur(), payTo: PAY_TO, tarifs: { gratuit: { montantMin: 0n, actif: 'USDC', quoi: 'x' } },
    lireRegistre: r.lire, ecrireRegistre: r.ecrire });
  return g.ouvrir({ txHash: HASH, payeur: PAYEUR, besoin: 'gratuit' })
    .then((v) => { assert.equal(v.etat, REFUS_CONFIG, 'un tarif de zero ouvre un droit'); });
});

/* ── 2. le chemin qui marche ───────────────────────────────────────────────────────────────── */
let rBon;
await casAsync('un paiement prouve ouvre le droit, et le registre le retient', async () => {
  rBon = registre();
  const g = creerGuichet({ rpc: lecteur(), payTo: PAY_TO, tarifs: TARIFS,
    lireRegistre: rBon.lire, ecrireRegistre: rBon.ecrire });
  const v = await g.ouvrir({ txHash: HASH, payeur: PAYEUR, besoin: 'rapport' });
  assert.equal(v.etat, OUVERT, 'un paiement prouve n ouvre pas : ' + v.pourquoi);
  /* ⛔ UNE VALEUR LUE PUIS JETEE EST UN DEFAUT : le registre doit porter le besoin, sinon on ne
   *   pourra jamais refuser la representation pour autre chose. */
  assert.equal(Object.keys(rBon.voir()).length, 1, 'le registre ne retient pas le hash');
  assert.equal(rBon.voir()[HASH.toLowerCase()].besoin, 'rapport', 'le registre ne retient pas le besoin');
});

/* ── 3. le rejeu ───────────────────────────────────────────────────────────────────────────── */
await casAsync('le MEME hash represente est refuse', async () => {
  const g = creerGuichet({ rpc: lecteur(), payTo: PAY_TO, tarifs: TARIFS,
    lireRegistre: rBon.lire, ecrireRegistre: rBon.ecrire });
  const v = await g.ouvrir({ txHash: HASH, payeur: PAYEUR, besoin: 'rapport' });
  assert.equal(v.etat, REFUS_REJEU, 'un paiement deja consomme ouvre a nouveau');
});

await casAsync('le meme hash pour un AUTRE besoin est refuse', async () => {
  /* ⛔ Un paiement pour A ne doit pas ouvrir B — sinon le tarif le moins cher ouvre tout. */
  const g = creerGuichet({ rpc: lecteur(), payTo: PAY_TO, tarifs: TARIFS,
    lireRegistre: rBon.lire, ecrireRegistre: rBon.ecrire });
  const v = await g.ouvrir({ txHash: HASH, payeur: PAYEUR, besoin: 'autre' });
  assert.equal(v.etat, REFUS_AUTRE_BESOIN, 'un paiement pour un besoin en ouvre un autre');
});

/* ── 4. l echec FERME, pour chaque forme de panne ──────────────────────────────────────────── */
for (const [titre, opts, motif] of [
  ['la chaine illisible', { jette: 'RPC down' }, /NON_MESURE|could not be read/],
  ['une tx qui a REVERT (status 0x0)', { status: '0x0' }, /reverted|ECHOUEE/],
  ['un autre signataire', { from: '0x' + 'e'.repeat(40) }, /someone else|MAUVAIS_PAYEUR/],
  ['une tx introuvable', { txAbsente: true }, /no transaction|INTROUVABLE/],
  ['un montant insuffisant', { montant: 999999n }, /less than|INSUFFISANT/],
  /* ⛔ EXACTEMENT UNE confirmation en moins que le minimum : on teste la FRONTIERE. Une valeur
   *   lointaine (1 confirmation sur 12) passerait meme si la comparaison etait fausse d un cran. */
  ['une confirmation de MOINS que le minimum', { bloc: 1000, tete: 1000 + CONFIRMATIONS_MIN - 2 }, /confirmation|TROP_RECENTE/],
]) {
  await casAsync('REFUS FERME : ' + titre, async () => {
    const r = registre();
    const g = creerGuichet({ rpc: lecteur(opts), payTo: PAY_TO, tarifs: TARIFS,
      lireRegistre: r.lire, ecrireRegistre: r.ecrire });
    const v = await g.ouvrir({ txHash: HASH2, payeur: PAYEUR, besoin: 'rapport' });
    assert.equal(v.etat, REFUS_CHAINE, titre + ' ouvre un droit');
    assert.match(String(v.pourquoi) + ' ' + String(v.chaineEtat), motif,
      titre + ' : le refus ne nomme pas sa cause');
    /* ⛔⛔ ET RIEN NE DOIT ETRE ECRIT SUR UN REFUS : un hash brule par une panne empecherait le
     *     payeur de representer un paiement PARFAITEMENT VALIDE une fois la chaine relue. */
    assert.equal(Object.keys(r.voir()).length, 0, titre + ' : un refus a quand meme brule le hash');
  });
}

/* ── 5. LA COURSE, et c est le cas que personne n ecrit ────────────────────────────────────── */
await casAsync('deux requetes SIMULTANEES sur le meme hash : UN SEUL droit', async () => {
  /* ⛔⛔ POURQUOI CE CAS EXISTE. La verification est ASYNCHRONE. Les deux requetes franchissent donc
   *     la premiere garde ensemble — le registre est encore vide pour les deux. Seule une relecture
   *     suivie d une ecriture DANS LE MEME TOUR d evenement les separe. Si quelqu un glisse un
   *     `await` entre la relecture et l ecriture, ce test doit tomber. */
  const r = registre();
  const g = creerGuichet({ rpc: lecteur(), payTo: PAY_TO, tarifs: TARIFS,
    lireRegistre: r.lire, ecrireRegistre: r.ecrire });
  const [a, b] = await Promise.all([
    g.ouvrir({ txHash: HASH2, payeur: PAYEUR, besoin: 'rapport' }),
    g.ouvrir({ txHash: HASH2, payeur: PAYEUR, besoin: 'rapport' }),
  ]);
  const ouverts = [a, b].filter((v) => v.etat === OUVERT).length;
  assert.equal(ouverts, 1, 'la course rend ' + ouverts + ' droits au lieu d un seul');
  assert.equal(Object.keys(r.voir()).length, 1, 'le registre porte plus d une entree pour un hash');
});

/* ── 6. le defi 402 ────────────────────────────────────────────────────────────────────────── */
cas('le defi porte le destinataire et un montant non nul', () => {
  const r = registre();
  const g = creerGuichet({ rpc: lecteur(), payTo: PAY_TO, tarifs: TARIFS,
    lireRegistre: r.lire, ecrireRegistre: r.ecrire });
  const d = g.defi('rapport');
  assert.equal(d.payTo, PAY_TO, 'le defi ne dit pas ou payer — un payeur ne peut pas payer');
  assert.equal(d.montantMin, '1000000', 'le defi ne porte pas le montant attendu');
  assert.equal(d.chaine, 'eip155:8453', 'le defi ne nomme pas Base');
  assert.equal(g.defi('inconnu').ko, 'unknown need', 'un besoin inconnu recoit un defi');
});

assert.equal(n, 14, 'compte de cas inattendu : ' + n);
console.log('ok guichet-paiement — ' + n + ' cas.');
console.log('   Le rejeu est ferme, la course rend UN seul droit, et les SIX formes de panne');
console.log('   refusent sans bruler le hash du payeur.');
console.log('⚠️ NE PROUVE PAS qu un paiement reel arrive : aucune transaction n a ete signee, et le');
console.log('   `rpc` est local. Et la course fermee ici est celle d UN processus — deux instances');
console.log('   partageant un registre exigeraient un verrou dans le stockage, pas dans ce module.');
