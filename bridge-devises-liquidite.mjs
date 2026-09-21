/* bridge-devises-liquidite.mjs — LE BRIDGE ENTRE DEVISES TOKENISEES EST-IL SEULEMENT POSSIBLE ?
 *
 *   node bridge-devises-liquidite.mjs [jours]      defaut : 1
 *
 * ⛔⛔ CE QUE PHIL DEMANDE (2026-09-21) : « Bridge monnaie Tokenized pour tokenized directement la
 *     monnaie avec tt les devises possible pas juste tokenized usdc […] on prends les fees sur les
 *     transfert et volume ». Un bridge qui echange A contre B suppose que A et B S ECHANGENT DEJA.
 *     Sinon il n y a rien a router, et le frais porte sur un volume inexistant — l erreur exacte
 *     qu on vient de corriger sur les swaps de blocks.
 *
 * ⛔ CE QUI EST DEJA MESURE, et qu on ne refait pas :
 *      · 17 devises admises par le hook V8 (`devises-admises.mjs`), liste gravee au constructeur ;
 *      · 3 d entre elles ont une supply de ZERO (COINc, CRCLc, INTCc) — admises, pas en circulation ;
 *      · ni CNH ni RUB tokenise liquide sur Base : « toutes les devises » n existe pas.
 *
 * ⛔ CE QUE CE FICHIER MESURE, ET RIEN D AUTRE : pour chaque devise admise, le NOMBRE DE TRANSFERTS
 *    et le NOMBRE D ADRESSES DISTINCTES sur la fenetre. Pas des dollars : convertir demanderait un
 *    prix par jeton qu on n a pas mesure. Un transfert n est pas un utilisateur, et le compte
 *    d ADRESSES est la colonne qui parle — la lecon du jour meme, ou 43 263 swaps cachaient
 *    35 adresses.
 *
 * ⛔ LE REFUS : si une fenetre ne peut pas etre lue, le compte de CETTE devise est marque NON LU et
 *    n entre dans aucun classement. Un plancher biaise n est pas un plancher.
 * ⛔ LECTURE SEULE.
 */
import { DEVISES_BASE, ACTIONS_COINBASE, ETH_NATIF, TBLOCK_MAINNET } from './paires.js';
import { PAS_LOGS, topicDe } from './veille-frais.js';
import { BLOCS_PAR_JOUR } from './comparer-frais.js';

const RPC = process.env.TB_RPC || 'https://mainnet.base.org';
const TOPIC_TRANSFER = topicDe('Transfer(address,address,uint256)');
const PLANCHER_BLOCS = 25;

let idRpc = 1;
async function rpc(m, p) {
  let dernier = 'inconnu';
  for (let e = 0; e < 10; e++) {
    const r = await fetch(RPC, { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: idRpc++, method: m, params: p }) });
    const j = await r.json();
    if (!j.error) return j.result;
    dernier = j.error.message || '';
    if (!/rate limit|limit exceeded|too many|capacity/i.test(dernier)) throw new Error(dernier);
    await new Promise((f) => setTimeout(f, 600 * (e + 1)));
  }
  throw new Error(dernier);
}

const adr = (t) => '0x' + String(t || '').slice(26).toLowerCase();

/** Balaye les Transfer d un jeton, en coupant la fenetre a chaque echec. */
async function transfertsDe(jeton, de, a) {
  const etat = { transferts: 0, adresses: new Set(), blocsNonLus: 0, appels: 0 };
  async function balayer(d, f) {
    etat.appels++;
    let logs;
    try {
      logs = await rpc('eth_getLogs', [{ address: jeton, topics: [TOPIC_TRANSFER],
        fromBlock: '0x' + d.toString(16), toBlock: '0x' + f.toString(16) }]);
    } catch (e) {
      if (f - d + 1 > PLANCHER_BLOCS) {
        const m = d + Math.floor((f - d) / 2);
        await balayer(d, m); await balayer(m + 1, f);
        return;
      }
      etat.blocsNonLus += f - d + 1;
      return;
    }
    for (const l of logs || []) {
      etat.transferts++;
      /* ⛔ On compte les DEUX cotes : un jeton peut avoir beaucoup d envois depuis une seule
       *    adresse (distribution) et zero echange reel. */
      etat.adresses.add(adr(l.topics[1]));
      etat.adresses.add(adr(l.topics[2]));
    }
  }
  for (let b = de; b <= a; b += PAS_LOGS) await balayer(b, Math.min(b + PAS_LOGS - 1, a));
  return etat;
}

const JOURS = Number(process.argv[2] || 1);
const tete = Number(BigInt(await rpc('eth_blockNumber', [])));
const DE = tete - Math.round(JOURS * BLOCS_PAR_JOUR);
console.log('fenetre : ' + DE + ' → ' + tete + '  (' + JOURS + ' j)');
console.log('topic Transfer : ' + TOPIC_TRANSFER + '\n');

const CIBLES = [
  ...DEVISES_BASE.filter((p) => p.adr !== ETH_NATIF).map((p) => ({ sym: p.symbole, adr: p.adr })),
  ...ACTIONS_COINBASE.map((s) => ({ sym: s.symbole, adr: s.adr })),
];
/* ⛔ TBLOCK est dans DEVISES_BASE : on le garde, c est notre propre jeton et son chiffre nous
 *    concerne autant que les autres — surtout s il est bas. */
void TBLOCK_MAINNET;

console.log('devise'.padEnd(9) + 'transferts'.padEnd(12) + 'adresses'.padEnd(10)
  + 'transf/adr'.padEnd(12) + 'lecture');
console.log('-'.repeat(62));
const lignes = [];
for (const c of CIBLES) {
  const e = await transfertsDe(c.adr, DE, tete);
  const complet = e.blocsNonLus === 0;
  lignes.push({ ...c, ...e, complet });
  console.log(c.sym.padEnd(9) + String(e.transferts).padEnd(12) + String(e.adresses.size).padEnd(10)
    + (e.adresses.size ? (e.transferts / e.adresses.size).toFixed(1) : '—').padEnd(12)
    + (complet ? '✅ complete' : '⛔ ' + e.blocsNonLus + ' blocs NON LUS'));
}

const lues = lignes.filter((l) => l.complet);
const mortes = lues.filter((l) => l.transferts === 0);
const vivantes = lues.filter((l) => l.transferts > 0).sort((a, b) => b.adresses.size - a.adresses.size);

console.log('\n=== CE QUE CA DIT DU BRIDGE ===');
console.log('   devises lues completement : ' + lues.length + ' / ' + CIBLES.length
  + (lues.length < CIBLES.length ? '  ⛔ les autres ne sont dans AUCUN classement' : ''));
console.log('   devises a ZERO transfert  : ' + mortes.length
  + (mortes.length ? '  (' + mortes.map((l) => l.sym).join(', ') + ')' : ''));
console.log('   devises avec du mouvement : ' + vivantes.length);
if (vivantes.length) {
  console.log('\n   les trois plus larges, par ADRESSES distinctes :');
  for (const l of vivantes.slice(0, 3)) {
    console.log('      ' + l.sym.padEnd(8) + l.adresses.size + ' adresses · ' + l.transferts + ' transferts');
  }
}
console.log('\n=== VERDICT ===');
if (lues.length === 0) {
  console.log('   ⛔ RIEN N A ETE LU COMPLETEMENT — aucun verdict. Relancer sur une fenetre plus courte.');
} else if (vivantes.length <= 1) {
  console.log('   ⛔ UN BRIDGE A BESOIN DE DEUX COTES. Une seule devise bouge : il n y a pas de paire');
  console.log('      a router, donc pas de volume sur lequel prendre un frais.');
} else {
  console.log('   ' + vivantes.length + ' devises bougent : un routeur a matiere a exister.');
  console.log('   ⛔ MAIS CE N EST PAS UNE VALIDATION. Ces transferts se font AUJOURD HUI sans nous,');
  console.log('      sur des routes existantes et gratuites. Un bridge qui prend 0,5 % doit expliquer');
  console.log('      pourquoi quelqu un le paierait plutot que de garder sa route actuelle — et cette');
  console.log('      question-la ne se mesure pas ici.');
}
console.log('\n⛔ BORNE : on compte des TRANSFERTS et des ADRESSES, jamais des dollars. Et un transfert');
console.log('   n est pas un echange : une distribution a mille adresses en produit mille sans qu un');
console.log('   seul marche ait eu lieu.');
