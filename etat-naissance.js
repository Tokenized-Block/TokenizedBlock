// etat-naissance.js — CREATE-ONE-PATH (game343): the ONE reader of a $5 birth. It reads the chain only and returns the 3 steps,
// each signature done / next / waiting, the next signature and how many are left (M, the vault payment included).
// Used by the Create card, the block page card and the server plan; nothing else decides where a birth stands.
// Local storage may only speed up a read it can confirm (a known salt), never decide a step.
// Builds no call: the calls come from the existing planners (tblock-route.js, lancer-pool-v2.js, create-vault-tip.js), each simulated
// before the wallet opens. Step 2's core state (created / registered / market open) is lancement-guide.js lireEtatLancement, reused as is.
// Does NOT prove: that a wallet signs; that the vault payment belongs to this block (a transfer does not name it: `coffrePaye` comes
// from a server read of this wallet's TBLOCK transfer to the vault after the block's creation).
import { selecteur, poolId } from './pool.js';
import { lireEtatLancement } from './lancement-guide.js';

export const ETH0 = '0x0000000000000000000000000000000000000000';
export const PERMIT2 = '0x000000000022d473030f116ddee9f6b43ac78ba3';
export const POSITION_MANAGER = '0x7c5f5a4bbd8fd63184577525326123b519429bdc';
export const UNIVERSAL_ROUTER = '0x6ff5693b99212da76ad316178a184ab56d299b43';
export const AERODROME_ROUTER = '0x9ee35bf1bd69a03c6f0393582030fce8bb93d418';
export const CREATE_ROUTER = '0xe05cd0336cd18a0909bca980a4191a0b00a3fdf5';
export const HOOK_7030 = '0x32f3f572dd17625bab9035789c953e1d001864cc';
export const TBLOCK = '0xb200000000000000000000ba9bf8330307f8830e';
export const WTCOIN = '0x5cda0e1ca4ce2af96315f7f8963c85399c172204';
export const STATE_VIEW = '0xa3c0c9b65bad0b08107aa264b0f3db444b867a71';
export const WTCOIN_RESUME_MIN = 100000000000000n;
export const STATUTS = Object.freeze(['FAIT', 'SUIVANT', 'ATTENTE']);

const ADR = /^0x[0-9a-fA-F]{40}$/;
const bas = (a) => String(a || '').toLowerCase();
const pad = (a) => bas(a).replace(/^0x/, '').padStart(64, '0');
const mot = (h, i) => BigInt('0x' + (String(h).replace(/^0x/, '').slice(64 * i, 64 * (i + 1)) || '0'));

/** the ETH pool key of a block on the 7030 hook (the key TEST and every Instant Birth on ETH uses) */
export const cleEth = (bloc, hook = HOOK_7030) => ({ currency0: ETH0, currency1: bas(bloc), fee: 0, tickSpacing: 200, hooks: bas(hook) });

/**
 * lireEtatNaissance({ rpc, compte, bloc, partTblock, coffrePaye = null, maintenantSec })
 *  bloc        : the block address (created or predicted); required
 *  partTblock  : TBLOCK wei the vault step asks (create-vault-tip.js plan), or null when not priced (step 1 then reads "not read")
 *  coffrePaye  : true / false from the server read, null when unknown
 * -> { etat:'LU', etapes:[{ n, nom, statut, signatures:[{ cle, nom, to, statut, raison }] }], prochaine, restantes, faites }
 *  | { etat:'NON_MESURE', pourquoi }
 */
export async function lireEtatNaissance({ rpc, compte, bloc, partTblock = null, coffrePaye = null, maintenantSec = Math.floor(Date.now() / 1000), hook = HOOK_7030 } = {}) {
  if (typeof rpc !== 'function') return { etat: 'NON_MESURE', pourquoi: 'no chain reader' };
  if (!ADR.test(String(compte || '')) || !ADR.test(String(bloc || ''))) return { etat: 'NON_MESURE', pourquoi: 'a wallet and a block address are required' };
  const moi = bas(compte), b = bas(bloc);
  const call = async (to, data) => String(await rpc('eth_call', [{ to, data }, 'latest']));
  const bal = async (tok, qui) => mot(await call(tok, '0x' + selecteur('balanceOf(address)') + pad(qui)), 0);
  const allow = async (tok, spender) => mot(await call(tok, '0x' + selecteur('allowance(address,address)') + pad(moi) + pad(spender)), 0);
  const permit2 = async (tok, spender) => {
    const r = await call(PERMIT2, '0x' + selecteur('allowance(address,address,address)') + pad(moi) + pad(tok) + pad(spender));
    return { montant: mot(r, 0), expire: Number(mot(r, 1)) };
  };
  try {
    /* ── step 2 core first: created / registered / market open (lancement-guide.js, as is) */
    const cle = cleEth(b, hook);
    const lanc = await lireEtatLancement({ rpc, stateView: STATE_VIEW, jeton: b, cle, hook, compte: moi });
    if (lanc.etat !== 'LU') return { etat: 'NON_MESURE', pourquoi: lanc.pourquoi };
    const ouvert = lanc.marche === 'OUVERT';
    const inscrit = !!lanc.payee || (!!lanc.createur && !/^0x0{40}$/.test(lanc.createur)) || ouvert;

    /* ── step 1: TBLOCK for the vault part. Not needed (or already spent on the vault) = done. */
    const tbl = await bal(TBLOCK, moi);
    const s1 = [
      { cle: 'buy1', nom: 'ETH → wtCOIN', to: AERODROME_ROUTER, raison: 'Buys the price pivot on Aerodrome. wtCOIN is not a second fee: the next signatures turn it into TBLOCK.' },
      { cle: 'buy2', nom: 'Approve wtCOIN to Permit2', to: WTCOIN, raison: 'Exactly the wtCOIN just bought.' },
      { cle: 'buy3', nom: 'Permit2 permit', to: PERMIT2, raison: 'A one-hour permit so the swap can take that wtCOIN.' },
      { cle: 'buy4', nom: 'Swap wtCOIN → TBLOCK', to: UNIVERSAL_ROUTER, raison: 'Through the TBLOCK pool, whose hook burns part of every trade.' },
    ];
    let etape1Faite;
    if (coffrePaye === true) etape1Faite = true;
    else if (typeof partTblock === 'bigint') etape1Faite = tbl >= partTblock;
    else etape1Faite = null; /* not priced: step 1 cannot be judged */
    if (etape1Faite === true) s1.forEach((s) => { s.statut = 'FAIT'; });
    else if (etape1Faite === false) {
      const wt = await bal(WTCOIN, moi);
      if (wt >= WTCOIN_RESUME_MIN) {
        s1[0].statut = 'FAIT';
        const a = await allow(WTCOIN, PERMIT2);
        s1[1].statut = a >= wt ? 'FAIT' : 'A';
        const p = await permit2(WTCOIN, UNIVERSAL_ROUTER);
        s1[2].statut = s1[1].statut === 'FAIT' && p.montant >= wt && p.expire > maintenantSec ? 'FAIT' : 'A';
        if (s1[2].statut === 'A' && p.montant > 0n && p.expire <= maintenantSec) s1[2].expire = true;
        s1[3].statut = 'A';
      } else s1.forEach((s) => { s.statut = 'A'; });
    } else s1.forEach((s) => { s.statut = 'NON_LU'; });

    /* ── step 2: the 5 signatures of the birth */
    const s2 = [
      { cle: 'create', nom: 'Create', to: CREATE_ROUTER, raison: 'Face and brain are engraved. Your block is born.' },
      { cle: 'approve', nom: 'Approve the block to Permit2', to: b, raison: 'The whole offer of your block goes into its pool.' },
      { cle: 'permit2', nom: 'Permit2', to: PERMIT2, raison: 'A one-hour permit so the market can take that offer.' },
      { cle: 'register', nom: 'Hook registration', to: hook, raison: 'The birth fee, plus the creator deposit (about $1) that stays yours.' },
      { cle: 'open', nom: 'Open the market', to: POSITION_MANAGER, raison: 'The pool opens with 100 % block, no ETH added.' },
    ];
    if (!lanc.ne) s2.forEach((s) => { s.statut = 'A'; });
    else if (ouvert) s2.forEach((s) => { s.statut = 'FAIT'; });
    else {
      s2[0].statut = 'FAIT';
      const offre = await bal(b, moi);
      const a = await allow(b, PERMIT2);
      s2[1].statut = offre > 0n && a >= offre ? 'FAIT' : 'A';
      const p = await permit2(b, POSITION_MANAGER);
      s2[2].statut = s2[1].statut === 'FAIT' && offre > 0n && p.montant >= offre && p.expire > maintenantSec ? 'FAIT' : 'A';
      if (s2[2].statut === 'A' && p.montant > 0n && p.expire <= maintenantSec) s2[2].expire = true;
      s2[3].statut = inscrit ? 'FAIT' : 'A';
      s2[4].statut = 'A';
    }

    /* ── step 3: the vault payment (read by the server; unknown = not read) */
    const s3 = [{ cle: 'vault', nom: 'Pay the vault in TBLOCK', to: TBLOCK, raison: 'The rest of your $5, in TBLOCK, to the community vault.' }];
    s3[0].statut = coffrePaye === true ? 'FAIT' : coffrePaye === false ? 'A' : 'NON_LU';

    /* ── one next signature in order; the rest of the undone ones wait */
    const etapes = [
      { n: 1, nom: 'Get TBLOCK', signatures: s1 },
      { n: 2, nom: 'Birth + market', signatures: s2 },
      { n: 3, nom: 'Pay the vault', signatures: s3 },
    ];
    let prochaine = null, restantes = 0, faites = 0, nonLu = false;
    for (const e of etapes) for (const s of e.signatures) {
      if (s.statut === 'FAIT') { faites++; continue; }
      if (s.statut === 'NON_LU') { nonLu = true; s.statut = 'ATTENTE'; s.nonLu = true; restantes++; continue; }
      restantes++;
      if (!prochaine && !nonLu) { s.statut = 'SUIVANT'; prochaine = { etape: e.n, cle: s.cle, nom: s.nom, to: s.to, expire: !!s.expire }; }
      else s.statut = 'ATTENTE';
    }
    for (const e of etapes) {
      const st = e.signatures.map((s) => s.statut);
      e.statut = st.every((x) => x === 'FAIT') ? 'FAIT' : st.includes('SUIVANT') ? 'SUIVANT' : 'ATTENTE';
      e.faites = st.filter((x) => x === 'FAIT').length;
    }
    return { etat: 'LU', etapes, prochaine, restantes, faites, nonLu, marcheOuvert: ouvert, ne: lanc.ne, inscrit };
  } catch (e) {
    return { etat: 'NON_MESURE', pourquoi: 'the birth could not be read just now: ' + String((e && e.message) || e).slice(0, 120) };
  }
}

/** the Continue button's two lines, from the reader's answer (M = signatures left, the vault payment included) */
export function libelleContinue(r) {
  if (!r || r.etat !== 'LU') return { l1: 'Waiting for Base nodes…', l2: 'Continue comes back by itself' };
  if (!r.prochaine) return r.restantes === 0 ? { l1: 'Done — see it on the map', l2: '' } : { l1: 'Reading the chain…', l2: 'a step could not be read yet' };
  const quoi = r.prochaine.etape === 1 ? 'get TBLOCK' : r.prochaine.etape === 2 ? (r.ne ? 'open its market' : 'give it birth') : 'pay the vault';
  return { l1: 'Continue: ' + quoi + ' (step ' + r.prochaine.etape + ' of 3)', l2: 'Signature 1 of ' + r.restantes + ' · ' + r.prochaine.nom + (r.prochaine.expire ? ' (again)' : '') };
}
