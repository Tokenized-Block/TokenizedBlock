/* tam-serveur.js — TAM phase C : ce que le serveur repond pour l onglet TAM. LECTURE SEULE : rien n est signe ni envoye ; `rpc` est INJECTE.
 *   GET /api/tam/choix?graine=0x…  le choix du cerveau (tam-moteur.js#choisirOeuvre) : params, certificats, octets, keccak.
 *     Sans graine : le hash du DERNIER bloc lu (cache 60 s : a 200 ms par bloc, une graine par requete brulerait le CPU et le RPC).
 *     L etat du cerveau : le cerveau de IB022 (BLOCK_SONDE) apres 24 battements SANS faits de marche — deterministe, rejouable par
 *     n importe qui avec cerveau.js ; son keccak entre dans la graine (empreinteEtat). Ce n est pas le cerveau « en direct » d un block.
 *   GET /api/tam/oeuvres  les oeuvres mintees, lues dans les evenements Minted de TamArt (une fois l adresse ecrite) ; cache 60 s,
 *     balayage INCREMENTAL par fenetres. Avant le deploiement : une liste vide AVEC sa raison (etat PAS_DEPLOYE), jamais un vide muet. */
import { choisirOeuvre, decoder, signature } from './tam-moteur.js';
import { adresseTam, SIG_TAM, appelLecture, decoderBytes } from './tam-plan.js';
import { topic } from './keccak.js';
import { etatInitial, pas } from './cerveau.js';

export const TOPIC_MINTED = topic(SIG_TAM.minted);
export const FENETRE_LOGS = 9000, FENETRES_PAR_APPEL = 20, TTL_MS = 60000;
const G32 = /^0x[0-9a-fA-F]{64}$/;

/** l etat du cerveau qui entre dans la graine : IB022 apres `battements` pas, sans faits (vie inconnue) */
export function etatCerveauTam(adresse, battements = 24) {
  let e = etatInitial(adresse);
  for (let i = 0; i < battements; i++) e = pas(e, { vie: null, vieAvant: null, etatVie: 'NON_LUE' }).etat;
  return { cerveau: String(adresse).toLowerCase(), battements, tick: e.tick, spikes: e.spikes, empreinte: e.c.empreinte, potentiels: e.potentiels.map((x) => Math.round(x * 1e6) / 1e6) };
}

const sansSignature = (c) => { const { signature: _s, ...r } = c || {}; return r; };
const hexDe = (u8) => '0x' + [...u8].map((b) => b.toString(16).padStart(2, '0')).join('');

/** le moteur de reponses ; `rpc(methode, params)` injecte, `deploiement` = TAMART_DEPLOIEMENT */
export function serveurTam({ rpc, deploiement, adresseCerveau, maintenant = () => Date.now() }) {
  const etat = etatCerveauTam(adresseCerveau);
  const parGraine = new Map();
  let tete = null; /* { bloc, hash, a } */
  const oe = { oeuvres: [], signatures: [], jusqua: null, a: 0, enVol: null, erreur: null };

  async function teteLue() {
    if (tete && maintenant() - tete.a < TTL_MS) return tete;
    const b = await rpc('eth_getBlockByNumber', ['latest', false]);
    if (!b || !G32.test(String(b.hash || ''))) throw new Error('latest block not read');
    tete = { bloc: parseInt(b.number, 16), hash: String(b.hash).toLowerCase(), a: maintenant() };
    return tete;
  }

  async function choix(graineDemandee) {
    let graine = null, bloc = null;
    if (graineDemandee !== null && graineDemandee !== undefined && graineDemandee !== '') {
      if (!G32.test(String(graineDemandee))) return { ok: false, etat: 'REFUSE', pourquoi: 'the seed must be 32 bytes in hex (0x + 64 hex)' };
      graine = String(graineDemandee).toLowerCase();
    } else {
      try { const t = await teteLue(); graine = t.hash; bloc = t.bloc; } catch (e) { return { ok: false, etat: 'NON_LU', pourquoi: 'the latest block was not read: ' + String((e && e.message) || e).slice(0, 100) }; }
    }
    const cle = graine + ':' + oe.signatures.length;
    if (parGraine.has(cle)) return parGraine.get(cle);
    const r = choisirOeuvre({ graine, etatCerveau: etat, existantes: oe.signatures });
    const rep = r.ok
      ? { ok: true, etat: 'PRET', graine, bloc, etatCerveau: { cerveau: etat.cerveau, battements: etat.battements, tick: etat.tick, spikes: etat.spikes }, empreinteEtat: r.params.empreinteEtat,
        params: r.params, certificats: sansSignature(r.certificats), octets: hexDe(r.octets), hash: r.hash, rejets: r.rejets, comparees: oe.signatures.length }
      : { ok: false, etat: 'AUCUNE', graine, bloc, pourquoi: 'no combination passed the certificates for this seed', rejets: r.rejets };
    if (parGraine.size > 64) parGraine.delete(parGraine.keys().next().value);
    parGraine.set(cle, rep);
    return rep;
  }

  async function balayer(contrat) {
    const h = parseInt(await rpc('eth_blockNumber', []), 16);
    let de = oe.jusqua === null ? deploiement.bloc : oe.jusqua + 1;
    for (let f = 0; f < FENETRES_PAR_APPEL && de <= h; f++) {
      const a = Math.min(h, de + FENETRE_LOGS - 1);
      const logs = await rpc('eth_getLogs', [{ address: contrat, topics: [TOPIC_MINTED], fromBlock: '0x' + de.toString(16), toBlock: '0x' + a.toString(16) }]);
      for (const l of logs || []) {
        if (String(l.address || '').toLowerCase() !== contrat || String(l.topics && l.topics[0]).toLowerCase() !== TOPIC_MINTED) continue;
        const id = Number(BigInt(l.topics[1]));
        if (oe.oeuvres.some((o) => o.tokenId === id)) continue;
        const o = { tokenId: id, minter: '0x' + String(l.topics[2]).slice(26).toLowerCase(), empreinte: String(l.topics[3]).toLowerCase(), graine: '0x' + String(l.data).slice(2, 66).toLowerCase(), tx: l.transactionHash, bloc: parseInt(l.blockNumber, 16) };
        oe.oeuvres.push(o);
        /* la signature (distance) des oeuvres existantes : lue dans les OCTETS stockes, jamais supposee */
        try { const d = decoderBytes(await rpc('eth_call', [appelLecture(contrat, SIG_TAM.donnees, id), 'latest'])); const x = decoder(d); oe.signatures.push(signature(x.points, x.q)); } catch (_) { o.signatureNonLue = true; }
      }
      oe.jusqua = a; de = a + 1;
    }
    oe.oeuvres.sort((x, y) => x.tokenId - y.tokenId);
    return oe.jusqua >= h;
  }

  async function oeuvres() {
    const contrat = adresseTam(deploiement);
    if (!contrat) return { ok: true, etat: 'PAS_DEPLOYE', pourquoi: 'TamArt is not deployed yet: no work can have been minted', contrat: null, oeuvres: [] };
    if (maintenant() - oe.a < TTL_MS && oe.jusqua !== null) return { ok: true, etat: oe.aJour ? 'LU' : 'EN_RETARD', contrat, jusqua: oe.jusqua, oeuvres: oe.oeuvres };
    if (!oe.enVol) oe.enVol = balayer(contrat).then((aJour) => { oe.aJour = aJour; oe.erreur = null; }, (e) => { oe.erreur = String((e && e.message) || e).slice(0, 120); }).finally(() => { oe.a = maintenant(); oe.enVol = null; });
    await oe.enVol;
    if (oe.jusqua === null) return { ok: false, etat: 'NON_LU', pourquoi: 'the Minted events were not read: ' + (oe.erreur || 'no answer'), contrat, oeuvres: [] };
    return { ok: true, etat: oe.erreur ? 'PARTIEL' : oe.aJour ? 'LU' : 'EN_RETARD', pourquoi: oe.erreur, contrat, jusqua: oe.jusqua, oeuvres: oe.oeuvres };
  }

  return { choix, oeuvres, etatCerveau: etat };
}
