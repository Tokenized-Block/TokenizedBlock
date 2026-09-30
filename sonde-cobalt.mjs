/* sonde-cobalt.mjs — QUELLES SURFACES B20 LE HARD FORK COBALT AJOUTE-T-IL, REELLEMENT ?
 * ================================================================================================
 * Lancer AVANT la fork :  node sonde-cobalt.mjs --base
 * Lancer APRES la fork :  node sonde-cobalt.mjs --diff
 *
 * ⛔⛔ POURQUOI UNE LIGNE DE BASE AVANT. Cobalt passe en mainnet le 2026-09-30 a 18:00 UTC. Apres
 *     coup, voir un selecteur repondre ne prouve RIEN : il repondait peut-etre deja. La seule
 *     mesure qui vaut est la DIFFERENCE entre un avant et un apres enregistres — pas entre un
 *     apres et un souvenir. On ecrit donc l avant sur le disque, et le diff le relit.
 *   ⛔ UN B20 N A QU UN OCTET DE CODE (`0xef`) : aucun PUSH4 a extraire, donc aucune enumeration
 *     possible. On est OBLIGE de proposer des noms — et donc obligé d avoir un TEMOIN NEGATIF,
 *     sinon « ca repond » ne voudrait rien dire.
 *
 * ⛔ TROIS ETATS, JAMAIS DEUX :
 *     OK          la fonction repond -> elle est declaree
 *     REVERT      elle refuse        -> c est un FAIT (« pas declaree », ou « pas avec ces args »)
 *     NON_MESURE  on n a pas pu lire -> ce n est ni l un ni l autre, et ca ne compte pas dans le diff
 *   ⛔ Sans cette separation, une limite de debit pendant la fenetre de la fork se lirait comme
 *     « la surface a disparu » — ou comme « elle est apparue ». Les deux seraient faux.
 *
 * ⚠️ BORNE HONNETE : les noms testes sont DEVINES, a partir de ce que l annonce decrit. Un silence
 *    ne dit pas « Cobalt n ajoute rien » — il dit « aucun de MES noms n est le bon ». Et un nom
 *    A ARGUMENTS qui reverte est ambigu : il peut etre declare et refuser des arguments nuls.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { selecteur } from './keccak.js';

const RPC = process.env.RPC_BASE || 'https://mainnet.base.org';
const EN_TETE = { 'content-type': 'application/json', 'x-ms-monitor': '1' };
const FICHIER = new URL('./sonde-cobalt-base.json', import.meta.url);
const MODE = process.argv.includes('--diff') ? 'diff' : 'base';

/* ⛔ LES CIBLES SONT LUES DANS `paires.js`, jamais transcrites : deux adresses recopiees a la main
 *   sur trois etaient fausses le 2026-09-29, et j ai passe trois passages a soupconner le RPC. */
const src = readFileSync(new URL('./paires.js', import.meta.url), 'utf8');
const ACTIONS = [...src.matchAll(/symbole: '([^']+)', nom: '[^']*', adr: '(0xb2[0-9a-fA-F]{38})'/g)]
  .map((m) => ({ sym: m[1], adr: m[2].toLowerCase() })).slice(0, 3);
if (ACTIONS.length < 2) { console.log('⛔ moins de deux actions lues dans paires.js — je ne sonde pas'); process.exit(2); }

/* ── LES CANDIDATS, groupes par ce que l annonce decrit ─────────────────────────────────────── */
const CANDIDATS = [
  /* temoins POSITIFS : doivent repondre AVANT comme APRES. S ils tombent, la sonde est cassee et
   * aucun autre resultat du passage ne vaut quoi que ce soit. */
  ['temoin+', 'decimals()'], ['temoin+', 'totalSupply()'], ['temoin+', 'multiplier()'],
  /* 1. multiplicateur PROGRAMME — « issuers can schedule a scale change for a future time » */
  ['multiplicateur', 'scheduledMultiplier()'], ['multiplicateur', 'pendingMultiplier()'],
  ['multiplicateur', 'nextMultiplier()'], ['multiplicateur', 'multiplierSchedule()'],
  ['multiplicateur', 'multiplierEffectiveAt()'], ['multiplicateur', 'pendingMultiplierTime()'],
  ['multiplicateur', 'nextMultiplierAt()'], ['multiplicateur', 'multiplierUpdate()'],
  ['multiplicateur', 'scheduledMultiplierAt()'], ['multiplicateur', 'multiplierAt(uint256)'],
  /* 2. frais payes EN B20 — « you will not always need ETH in the wallet just to move a token » */
  ['frais-en-b20', 'feeToken()'], ['frais-en-b20', 'gasToken()'], ['frais-en-b20', 'payFeesIn()'],
  ['frais-en-b20', 'feeCurrency()'], ['frais-en-b20', 'isFeeToken()'], ['frais-en-b20', 'feeConfig()'],
  ['frais-en-b20', 'canPayFees()'], ['frais-en-b20', 'feeEnabled()'],
  /* 3. conformite — « a first-class seize path replaces burnBlocked ; UNION and INTERSECT policies » */
  ['conformite', 'policy()'], ['conformite', 'policies()'], ['conformite', 'unionPolicy()'],
  ['conformite', 'intersectPolicy()'], ['conformite', 'isBlocked(address)'],
  ['conformite', 'canTransfer(address,address,uint256)'], ['conformite', 'seize(address,address,uint256)'],
  ['conformite', 'burnBlocked(address,uint256)'],
  /* ⛔ LE TEMOIN NEGATIF : s il repond, la sonde ne discrimine RIEN et on n en tire aucune conclusion. */
  ['temoin-', 'cobaltSelecteurQuiNExistePas()'],
];
const AVEC_ARGS = (sig) => /\([^)]+\)/.test(sig);

let id = 0;
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
/* ⛔ PATIENT SUR LE 429, ET SUR UN SEUL NOEUD. Mesure du 2026-09-30 : `mainnet.base.org` SAIT lire
 *   ce qu on lui demande mais rend `429 over rate limit` ; `publicnode` rend `403 Archive requests
 *   require a personal token`. Basculer vers le secours etait la PIRE reponse — il ne peut pas
 *   repondre du tout. La bonne reponse est d ATTENDRE. */
async function appel(to, data) {
  for (let k = 0; k < 6; k += 1) {
    try {
      const r = await fetch(RPC, { method: 'POST', headers: EN_TETE,
        body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method: 'eth_call', params: [{ to, data }, 'latest'] }) });
      const t = await r.text();
      if (r.status === 200) {
        const j = JSON.parse(t);
        if (!j.error) return { etat: 'OK', res: j.result };
        const m = JSON.stringify(j.error);
        if (/revert/i.test(m)) return { etat: 'REVERT' };
        if (!/rate|limit/i.test(m)) return { etat: 'NON_MESURE', pourquoi: m.slice(0, 70) };
      } else if (r.status !== 429) return { etat: 'NON_MESURE', pourquoi: 'HTTP ' + r.status };
    } catch (e) { /* on reessaie */ }
    await pause(1500 * (k + 1));
  }
  return { etat: 'NON_MESURE', pourquoi: 'abandonne apres 6 essais (debit)' };
}

/* ── LE PASSAGE ──────────────────────────────────────────────────────────────────────────────── */
async function passer() {
  const t = await appel(ACTIONS[0].adr, '0x18160ddd');
  if (t.etat !== 'OK') { console.log('⛔ meme `totalSupply()` ne repond pas : reseau indisponible, je ne mesure rien'); return null; }
  const vu = {};
  for (const a of ACTIONS) {
    vu[a.sym] = {};
    for (const [groupe, sig] of CANDIDATS) {
      const sel = selecteur(sig);
      /* ⛔ ARGUMENTS NULS pour les signatures qui en prennent, et l AMBIGUITE est dite plus bas :
       *   un revert peut vouloir dire « pas declaree » OU « declaree mais refuse ces arguments ». */
      const data = AVEC_ARGS(sig) ? sel + '0'.repeat(64 * (sig.split(',').length)) : sel;
      const r = await appel(a.adr, data);
      vu[a.sym][sig] = { groupe, sel, etat: r.etat, ambigu: AVEC_ARGS(sig) };
      await pause(320);
    }
  }
  return vu;
}

function temoinsTenus(vu) {
  const pb = [];
  for (const [sym, par] of Object.entries(vu)) {
    for (const [sig, r] of Object.entries(par)) {
      if (r.groupe === 'temoin+' && r.etat !== 'OK') pb.push(sym + ' : ' + sig + ' -> ' + r.etat);
      if (r.groupe === 'temoin-' && r.etat === 'OK') pb.push(sym + ' : le TEMOIN NEGATIF repond');
    }
  }
  return pb;
}

const vu = await passer();
if (!vu) process.exit(2);
const pb = temoinsTenus(vu);
if (pb.length) {
  console.log('⛔⛔ LES TEMOINS NE TIENNENT PAS — aucune conclusion de ce passage ne vaut :');
  for (const p of pb) console.log('   ' + p);
  process.exit(2);
}
console.log('temoins tenus : les positifs repondent, le negatif reverte. La sonde discrimine.');
console.log('actions sondees : ' + Object.keys(vu).join(', ') + '   candidats : ' + CANDIDATS.length);

if (MODE === 'base') {
  writeFileSync(FICHIER, JSON.stringify({ quand: new Date().toISOString(), rpc: RPC, vu }, null, 1), 'utf8');
  console.log('\n✅ LIGNE DE BASE ECRITE dans sonde-cobalt-base.json.');
  console.log('   Relancer `node sonde-cobalt.mjs --diff` APRES 18:00 UTC.');
  const repondent = [];
  for (const [sym, par] of Object.entries(vu)) for (const [sig, r] of Object.entries(par)) {
    if (r.etat === 'OK' && r.groupe !== 'temoin+') repondent.push(sym + ' ' + sig);
  }
  console.log('   surfaces DEJA presentes avant la fork : ' + (repondent.length ? repondent.join(' · ') : 'aucune'));
  process.exit(0);
}

/* ── LE DIFF ─────────────────────────────────────────────────────────────────────────────────── */
if (!existsSync(FICHIER)) {
  console.log('⛔ aucune ligne de base : lancer `--base` AVANT la fork. Sans avant, un « apres » ne');
  console.log('   prouve rien — la surface repondait peut-etre deja.');
  process.exit(2);
}
const base = JSON.parse(readFileSync(FICHIER, 'utf8'));
console.log('\nligne de base du ' + base.quand + '\n');
console.log('action  signature                                 avant      apres');
const apparues = [], disparues = [], douteuses = [];
for (const [sym, par] of Object.entries(vu)) {
  for (const [sig, r] of Object.entries(par)) {
    const av = ((base.vu[sym] || {})[sig] || {}).etat || '[absent]';
    if (av === r.etat) continue;
    console.log(sym.padEnd(8) + sig.padEnd(42) + String(av).padEnd(11) + r.etat);
    /* ⛔ UN CHANGEMENT QUI IMPLIQUE `NON_MESURE` N EST PAS UN CHANGEMENT DE SURFACE : c est une
     *   lecture ratee d un cote ou de l autre. On le range a part au lieu de le compter. */
    if (av === 'NON_MESURE' || r.etat === 'NON_MESURE') douteuses.push(sym + ' ' + sig);
    else if (av === 'REVERT' && r.etat === 'OK') apparues.push(sym + ' ' + sig + (r.ambigu ? ' (args nuls — a confirmer)' : ''));
    else if (av === 'OK' && r.etat === 'REVERT') disparues.push(sym + ' ' + sig);
  }
}
console.log('\n=== CE QUE COBALT A CHANGE, SUR MES CANDIDATS ===');
console.log('APPARUES (revert -> repond) : ' + apparues.length + (apparues.length ? '\n  ' + apparues.join('\n  ') : ''));
console.log('DISPARUES (repond -> revert): ' + disparues.length + (disparues.length ? '\n  ' + disparues.join('\n  ') : ''));
console.log('DOUTEUSES (une lecture ratee d un cote) : ' + douteuses.length
  + (douteuses.length ? '   ⛔ a rejouer, ce ne sont PAS des changements' : ''));
if (!apparues.length && !disparues.length && !douteuses.length) {
  console.log('\n⛔ AUCUN DE MES CANDIDATS N A BOUGE. Deux lectures, et je ne tranche pas :');
  console.log('   soit Cobalt n ajoute pas d accesseur LISIBLE sur le jeton lui-meme, soit aucun de');
  console.log('   mes noms n est le bon. Dans les deux cas : je n ai PAS trouve la surface.');
}
console.log('\nborne : les noms sont devines, et un nom A ARGUMENTS qui reverte reste ambigu.');
