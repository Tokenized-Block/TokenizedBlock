/* guichet-paiement.js — LE COTE SERVEUR QUI MANQUAIT : UN PAIEMENT QUI OUVRE UN DROIT.
 *
 * ⛔⛔ CE MODULE COMBLE UN MANQUE QUE LE DEPOT AVAIT DEJA ECRIT LUI-MEME. `x402-pay.js` dit, dans
 *     son propre commentaire : « ce registre vit dans le navigateur. Il se vide, se modifie, se
 *     fabrique. Une reconnaissance enregistree ici est un CONFORT d interface, jamais un titre a un
 *     service payant. POUR QU UN PAIEMENT OUVRE UN DROIT, C EST LE SERVEUR QUI DOIT VERIFIER. »
 *   ⇒ Aujourd hui aucun endpoint de cette application ne rend HTTP 402, et le registre x402 est du
 *     `localStorage`. Le rail ne peut donc RIEN encaisser — ce n est pas « peu », c est ZERO PAR
 *     CONSTRUCTION, la meme forme de defaut que notre position de liquidite brulee.
 *
 * ⛔ CE MODULE NE REECRIT PAS LE VERIFICATEUR, IL L APPELLE. `verif-paiement.js` sait deja lire la
 *   chaine : `tx.from` (la seule preuve du signataire), `status 0x1` (une tx incluse peut avoir
 *   REVERT), un minimum de confirmations, ETH et USDC. En ecrire une copie ici aurait produit un
 *   jumeau plus faible — le motif exact qui fait qu un correctif rate son jumeau.
 *
 * ⛔⛔ CE QU IL AJOUTE, ET C EST CE QUI PROTEGE L ARGENT :
 *     1. LE REJEU. Le verificateur repond « cette tx a paye » — et repondra la meme chose mille
 *        fois. Sans registre, UN paiement ouvre UNE INFINITE de droits. Le registre est donc
 *        PERSISTANT : en memoire, il se viderait a chaque deploiement et rouvrirait tout.
 *     2. LE LIEN AVEC CE QUI EST ACHETE. Un paiement pour A ne doit pas ouvrir B. La tx est liee a
 *        UN besoin, et representee pour un autre besoin, elle est REFUSEE.
 *     3. L ECHEC FERME. Tout etat qui n est pas exactement `PAYE` refuse — y compris `NON_MESURE`
 *        (« la chaine n a pas pu etre lue »). C est le defaut que j ai trouve dans notre propre
 *        paywall d un autre depot : `init failed -> paywall disabled`, c est-a-dire que la panne
 *        rendait la ressource payante GRATUITE. Ici une panne refuse.
 *     4. LE REFUS DE SERVIR SANS TARIF. Pas de `payTo`, ou un besoin sans prix : REFUS. Un
 *        paywall mal configure ne doit pas se rabattre sur « gratuit ».
 *
 * ⛔ LA BORNE HONNETE : ce n est PAS le protocole x402 complet. x402 fait signer une autorisation
 *   EIP-3009 que le payeur ne diffuse pas lui-meme, et un `facilitator` la regle. Ce guichet demande
 *   au payeur une transaction DEJA REGLEE et la LIT. Avantage decisif pour nous : AUCUNE CLE de
 *   notre cote — nous ne signons rien, nous lisons. Inconvenient a dire : ce n est pas le rail que
 *   les agents x402 parlent nativement, donc ca n apporte pas la decouvrabilite du Bazaar.
 *
 * ⚠️ DECISION QUI N EST PAS LA MIENNE : servir un defi 402 EXIGE de publier l adresse qui recoit —
 *   un payeur ne peut pas payer une adresse cachee. La regle « ne jamais montrer l adresse de
 *   collecte a l ecran » vise les ecrans du visiteur ; un defi 402 est machine-a-machine. Quelle
 *   adresse y figure reste un choix de Phil : ce module la LIT dans la configuration, il n en code
 *   aucune en dur.
 */
import { verifierPaiement } from './verif-paiement.js';

const ADR = /^0x[0-9a-fA-F]{40}$/;
const HASH = /^0x[0-9a-fA-F]{64}$/;

/** Etats rendus par `ouvrir`. Un seul ouvre le droit. */
export const OUVERT = 'OUVERT';
export const REFUS_CONFIG = 'REFUS_CONFIG';
export const REFUS_REJEU = 'REFUS_REJEU';
export const REFUS_AUTRE_BESOIN = 'REFUS_AUTRE_BESOIN';
export const REFUS_CHAINE = 'REFUS_CHAINE';

/**
 * @param {object} o
 * @param {(m:string,p:any[])=>Promise<any>} o.rpc   lecteur JSON-RPC (injecte : testable)
 * @param {string} o.payTo                           qui recoit — LU, jamais code en dur
 * @param {Record<string,{montantMin:bigint,actif:string,quoi:string}>} o.tarifs
 * @param {()=>Record<string,{besoin:string,bloc:number}>} o.lireRegistre  hashes deja utilises
 * @param {(r:Record<string,any>)=>void} o.ecrireRegistre                 PERSISTANT
 */
export function creerGuichet({ rpc, payTo, tarifs, lireRegistre, ecrireRegistre } = {}) {
  /* ⛔ LA CONFIGURATION EST VALIDEE A LA CREATION, ET UNE CONFIGURATION ABSENTE NE DONNE PAS UN
   *   GUICHET PERMISSIF : elle donne un guichet qui refuse tout. Un paywall casse doit fermer. */
  const configKo = (() => {
    if (typeof rpc !== 'function') return 'no chain reader';
    if (!ADR.test(String(payTo || ''))) return 'no valid recipient configured';
    if (!tarifs || typeof tarifs !== 'object' || !Object.keys(tarifs).length) return 'no tariff configured';
    if (typeof lireRegistre !== 'function' || typeof ecrireRegistre !== 'function') {
      /* ⛔⛔ SANS REGISTRE, PAS DE GUICHET. Accepter ici donnerait un guichet qui verifie bien et
       *     laisse rejouer a l infini : pire que pas de guichet, parce qu il aurait l air de marcher. */
      return 'no replay ledger — refusing to run without one';
    }
    return null;
  })();

  /** Le defi : ce qu on renvoie avec HTTP 402. Machine-a-machine. */
  function defi(besoin) {
    if (configKo) return { ko: configKo };
    const t = tarifs[besoin];
    if (!t) return { ko: 'unknown need' };
    return {
      besoin,
      quoi: t.quoi,
      actif: t.actif,
      montantMin: String(t.montantMin),
      payTo,
      chaine: 'eip155:8453',
      comment: 'Send the amount to payTo on Base, then present the transaction hash. '
        + 'We read the chain: this hash, this signer, this amount, this recipient. Nothing is taken on trust.',
    };
  }

  /**
   * Le paiement ouvre-t-il le droit ? Un seul etat ouvre.
   * @returns {Promise<{etat:string, pourquoi?:string, preuve?:object}>}
   */
  async function ouvrir({ txHash, payeur, besoin } = {}) {
    if (configKo) return { etat: REFUS_CONFIG, pourquoi: configKo };
    const t = tarifs[besoin];
    if (!t) return { etat: REFUS_CONFIG, pourquoi: 'unknown need' };
    /* ⛔ UN TARIF DE ZERO N EST PAS UN TARIF. Le verificateur le refuse aussi, mais on ne compte
     *   pas sur une garde lointaine pour un controle qui protege l argent ici. */
    let min;
    try { min = BigInt(t.montantMin); } catch (_) { return { etat: REFUS_CONFIG, pourquoi: 'tariff is not a whole number' }; }
    if (min <= 0n) return { etat: REFUS_CONFIG, pourquoi: 'a tariff of zero is not a tariff' };
    if (!HASH.test(String(txHash || ''))) return { etat: REFUS_CHAINE, pourquoi: 'a whole transaction hash is required' };

    /* ── le rejeu, PREMIERE lecture ──────────────────────────────────────────────────────────
     * ⛔ On regarde AVANT de lire la chaine : inutile de payer 3 appels RPC pour un hash deja
     *   consomme, et surtout ca ferme la porte plus tot. */
    const dejaAvant = lireRegistre() || {};
    const vuAvant = dejaAvant[String(txHash).toLowerCase()];
    if (vuAvant) {
      return { etat: vuAvant.besoin === besoin ? REFUS_REJEU : REFUS_AUTRE_BESOIN,
        pourquoi: vuAvant.besoin === besoin
          ? 'this transaction has already opened this right — one payment, one right'
          : 'this transaction already paid for something else — a payment for one thing does not open another' };
    }

    /* ── la chaine, par le verificateur CANONIQUE ────────────────────────────────────────── */
    const p = await verifierPaiement({ rpc, txHash, payeur, destinataire: payTo,
      actif: t.actif, montantMin: min });
    /* ⛔⛔ ECHEC FERME. Tout ce qui n est pas exactement `PAYE` refuse — `NON_MESURE` compris. Une
     *     chaine illisible n est PAS un paiement, et ce n est pas non plus une raison d offrir le
     *     service. C est precisement le defaut trouve dans notre autre paywall : la panne
     *     desactivait le peage. */
    if (!p || p.etat !== 'PAYE') {
      return { etat: REFUS_CHAINE, pourquoi: (p && p.pourquoi) || 'payment not proven', chaineEtat: p && p.etat };
    }

    /* ── la reservation, SANS `await` entre la relecture et l ecriture ───────────────────────
     * ⛔⛔ LA COURSE EST REELLE ET ELLE EST FERMEE ICI. Deux requetes portant le MEME hash peuvent
     *     franchir la premiere lecture en meme temps, puisque la verification est asynchrone. On
     *     RELIT donc le registre et on ecrit dans le MEME TOUR d evenement : en Node, rien ne
     *     s intercale entre ces deux lignes, donc la seconde requete voit la reservation de la
     *     premiere. Mettre un `await` entre les deux rouvrirait la faille en entier.
     *   ⛔ BORNE A DIRE : ca protege UN processus. Deux instances servant le meme registre
     *     pourraient encore se croiser — la ou ca devient vrai, il faut un verrou dans le stockage,
     *     pas dans ce fichier. Ce module ne pretend pas plus que ce qu il tient. */
    const deja = lireRegistre() || {};
    const cle = String(txHash).toLowerCase();
    if (deja[cle]) {
      return { etat: deja[cle].besoin === besoin ? REFUS_REJEU : REFUS_AUTRE_BESOIN,
        pourquoi: 'this transaction was claimed while we were reading the chain' };
    }
    deja[cle] = { besoin, bloc: p.bloc, paye: p.paye, actif: p.actif };
    ecrireRegistre(deja);

    return { etat: OUVERT, preuve: p };
  }

  /** Pour les sondes : le guichet est-il utilisable, et sinon pourquoi ? */
  function etat() { return configKo ? { ok: false, pourquoi: configKo } : { ok: true, besoins: Object.keys(tarifs) }; }

  return { defi, ouvrir, etat };
}
