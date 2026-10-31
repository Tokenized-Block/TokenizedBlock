/* tam-serveur.js — TAM phase C : ce que le serveur repond pour l onglet TAM. LECTURE SEULE : rien n est signe ni envoye ; `rpc` est INJECTE.
 *   GET /api/tam/choix?graine=0x…  le choix du cerveau (tam-moteur.js#choisirOeuvre) : params, certificats, octets, keccak.
 *     Sans graine : le hash du DERNIER bloc lu (cache 60 s : a 200 ms par bloc, une graine par requete brulerait le CPU et le RPC).
 *     &block=0x… : le cerveau de CE block (defaut UNIT ; repli IB022 etiquete), rebati par cerveau.js depuis sa graine, 24 battements
 *     nourris de sa vie de marche lue par le serveur (etatCerveauTam). Son keccak entre dans la graine (empreinteEtat). La reponse
 *     porte `cerveau.etiquette` : quel cerveau, quel battement, ce qu il a mange — et qu il n est PAS le cerveau vivant du visiteur.
 *   GET /api/tam/oeuvres  les oeuvres mintees, lues dans les evenements Minted de TamArt (une fois l adresse ecrite) ; cache 60 s,
 *     balayage INCREMENTAL par fenetres. Avant le deploiement : une liste vide AVEC sa raison (etat PAS_DEPLOYE), jamais un vide muet. */
import { choisirOeuvre, decoder, signature, certifierReglage } from './tam-moteur.js';
import { adresseTam, SIG_TAM, appelLecture, decoderBytes, MAX_PARAMS } from './tam-plan.js';
import { topic, keccak256Hex } from './keccak.js';
const MAX_PARAMS_JSON = MAX_PARAMS;
import { etatInitial, pas } from './cerveau.js';

export const TOPIC_MINTED = topic(SIG_TAM.minted);
export const FENETRE_LOGS = 9000, FENETRES_PAR_APPEL = 20, TTL_MS = 60000;
const G32 = /^0x[0-9a-fA-F]{64}$/;

/* 2026-10-31 (decision du lead) : le cerveau d UN block, nomme. Defaut : UNIT ; repli : IB022, ETIQUETE comme repli. */
export const CERVEAU_DEFAUT = Object.freeze({ adresse: '0xb2000000000000000000007afa7ed748b0874f27', symbole: 'UNIT' });
export const CERVEAU_REPLI = Object.freeze({ adresse: '0xb200000000000000000000e4b0c5fbe9c8df579e', symbole: 'IB022' });
export const BATTEMENTS = 24;
const ADR = /^0x[0-9a-fA-F]{40}$/;
/**
 * L etat du cerveau d un block qui entre dans la graine : cerveau.js, depuis SA graine (etatInitial(adresse)), `battements` pas
 * nourris comme l app nourrit un block (entreesCerveau) avec ce que le SERVEUR sait : sa vie de marche lue (ou NON_LUE), aucune
 * nourriture (gm, messages, detenteurs a 0), aucun echange vu, la hauteur de lecture. ⛔ Ce n est PAS le cerveau vivant du
 * visiteur : celui-la vit dans SON navigateur (memoire locale, echanges vus par son fil). C est le meme cerveau, REBATI ici, et
 * c est dit tel quel (etiquette).
 */
export function etatCerveauTam(adresse, { battements = BATTEMENTS, vie = null, etatVie = 'NON_LUE', bloc = null, symbole = null, repli = false } = {}) {
  const faits = { vie: typeof vie === 'number' && Number.isFinite(vie) ? vie : null, vieAvant: null, gm: 0, messages: 0, detenteurs: 0, mort: false,
    etatVie: etatVie || 'NON_LUE', gmAvant: null, messagesAvant: null, detenteursAvant: null, role: null, bloc: Number.isSafeInteger(bloc) ? bloc : null };
  let e = etatInitial(adresse);
  for (let i = 0; i < battements; i++) e = pas(e, faits).etat;
  return { cerveau: String(adresse).toLowerCase(), symbole: symbole || null, battements, tick: e.tick, spikes: e.spikes, empreinte: e.c.empreinte,
    vie: faits.vie, etatVie: faits.etatVie, blocFaits: faits.bloc, repli: !!repli, potentiels: e.potentiels.map((x) => Math.round(x * 1e6) / 1e6) };
}
/** l etiquette, en anglais simple, de ce cerveau-la (jamais « live ») */
export function etiquetteCerveau(et) {
  const nom = et.symbole || (et.cerveau.slice(0, 6) + '…' + et.cerveau.slice(-4));
  const marche = et.etatVie === 'LUE' && et.vie !== null ? 'fed its market life read on chain' + (et.blocFaits ? ' at block ' + et.blocFaits : '') : 'with its market life not read (no market facts)';
  return 'brain of ' + nom + ' at beat ' + et.tick + ', rebuilt on the server from its seed, ' + marche + '; not your live brain'
    + (et.repli ? ' (fallback: the ' + (et.symbole || 'default') + ' brain could not be built)' : '');
}

const sansSignature = (c) => { const { signature: _s, ...r } = c || {}; return r; };
const hexDe = (u8) => '0x' + [...u8].map((b) => b.toString(16).padStart(2, '0')).join('');

/** le moteur de reponses ; `rpc(methode, params)` injecte, `deploiement` = TAMART_DEPLOIEMENT */
export function serveurTam({ rpc, deploiement, lireVie = null, lireSymbole = null, maintenant = () => Date.now() }) {
  const parGraine = new Map(), vies = new Map();
  /* le cerveau d un block : sa vie lue (cache 60 s), puis cerveau.js ; repli IB022 SEULEMENT si celui-la ne se construit pas */
  async function cerveauDe(adr) {
    const a = String(adr).toLowerCase();
    let v = vies.get(a);
    if (!v || maintenant() - v.a >= TTL_MS) {
      let vie = null, etatVie = 'NON_LUE', symbole = a === CERVEAU_DEFAUT.adresse ? CERVEAU_DEFAUT.symbole : a === CERVEAU_REPLI.adresse ? CERVEAU_REPLI.symbole : null, bloc = null;
      try { const r = lireVie ? await lireVie(a) : null; if (r && r.etat === 'LUE' && typeof r.vie === 'number') { vie = r.vie; etatVie = 'LUE'; bloc = Number.isSafeInteger(r.bloc) ? r.bloc : null; } } catch (_) { /* NON_LUE, dit dans l etiquette */ }
      if (!symbole && lireSymbole) { try { const s = await lireSymbole(a); if (typeof s === 'string' && /^[A-Za-z0-9.$-]{1,16}$/.test(s)) symbole = s; } catch (_) { symbole = null; } }
      v = { vie, etatVie, symbole, bloc, a: maintenant() };
      vies.set(a, v); if (vies.size > 64) vies.delete(vies.keys().next().value);
    }
    try { return etatCerveauTam(a, { vie: v.vie, etatVie: v.etatVie, bloc: v.bloc, symbole: v.symbole }); }
    catch (_) { return etatCerveauTam(CERVEAU_REPLI.adresse, { symbole: CERVEAU_REPLI.symbole, repli: true }); }
  }
  let tete = null; /* { bloc, hash, a } */
  const oe = { oeuvres: [], sigs: new Map(), jusqua: null, a: 0, enVol: null, erreur: null };

  async function teteLue() {
    if (tete && maintenant() - tete.a < TTL_MS) return tete;
    const b = await rpc('eth_getBlockByNumber', ['latest', false]);
    if (!b || !G32.test(String(b.hash || ''))) throw new Error('latest block not read');
    tete = { bloc: parseInt(b.number, 16), hash: String(b.hash).toLowerCase(), a: maintenant() };
    return tete;
  }

  async function choix(graineDemandee, blockDemande = null, minteurDemande = null) {
    let graine = null, bloc = null;
    if (blockDemande !== null && blockDemande !== undefined && blockDemande !== '' && !ADR.test(String(blockDemande))) return { ok: false, etat: 'REFUSE', pourquoi: 'block must be a whole address (0x + 40 hex)' };
    const vide = (x) => x === null || x === undefined || x === '';
    if (!vide(minteurDemande) && !ADR.test(String(minteurDemande))) return { ok: false, etat: 'REFUSE', pourquoi: 'minter must be a whole address (0x + 40 hex)' };
    const minteur = vide(minteurDemande) ? null : String(minteurDemande).toLowerCase(); /* le wallet qui mintera : il entre dans la graine */
    const etat = await cerveauDe(blockDemande ? blockDemande : CERVEAU_DEFAUT.adresse);
    if (graineDemandee !== null && graineDemandee !== undefined && graineDemandee !== '') {
      if (!G32.test(String(graineDemandee))) return { ok: false, etat: 'REFUSE', pourquoi: 'the seed must be 32 bytes in hex (0x + 64 hex)' };
      graine = String(graineDemandee).toLowerCase();
    } else {
      try { const t = await teteLue(); graine = t.hash; bloc = t.bloc; } catch (e) { return { ok: false, etat: 'NON_LU', pourquoi: 'the latest block was not read: ' + String((e && e.message) || e).slice(0, 100) }; }
    }
    /* ⛔ 2026-11-01 : la distinction se mesure contre TOUTES les oeuvres mintees. Une fois TamArt deploye : liste non lue jusqu a la tete,
     *   ou UNE signature non lue -> NON_LU, jamais une oeuvre comparee a une liste trouee. */
    if (adresseTam(deploiement)) {
      if (oe.jusqua === null || oe.erreur) return { ok: false, etat: 'NON_LU', graine, bloc, pourquoi: 'the minted works were not read, so distinctness cannot be measured' + (oe.erreur ? ': ' + oe.erreur : '') };
      if (!oe.aJour) return { ok: false, etat: 'NON_LU', graine, bloc, pourquoi: 'the minted works are still being read up to the latest block' };
    }
    const existantes = oe.oeuvres.map((o) => oe.sigs.get(o.tokenId) || null);
    const cle = graine + ':' + etat.cerveau + ':' + etat.tick + ':' + etat.etatVie + ':' + etat.vie + ':' + existantes.length + ':' + minteur;
    if (parGraine.has(cle)) return parGraine.get(cle);
    const r = choisirOeuvre({ graine, etatCerveau: etat, existantes, minteur });
    if (r.etat === 'NON_LU') return { ok: false, etat: 'NON_LU', graine, bloc, pourquoi: r.pourquoi };
    const cerveau = { adresse: etat.cerveau, symbole: etat.symbole, battement: etat.tick, spikes: etat.spikes, vie: etat.vie, etatVie: etat.etatVie, blocFaits: etat.blocFaits,
      repli: etat.repli, vivant: false, etiquette: etiquetteCerveau(etat) };
    const rep = r.ok
      ? { ok: true, etat: 'PRET', graine, bloc, cerveau, empreinteEtat: r.params.empreinteEtat,
        params: r.params, certificats: sansSignature(r.certificats), octets: hexDe(r.octets), hash: r.hash, rejets: r.rejets, comparees: existantes.length, minteur }
      : { ok: false, etat: 'AUCUNE', graine, bloc, cerveau, pourquoi: 'no combination passed the certificates for this seed', rejets: r.rejets };
    if (parGraine.size > 64) parGraine.delete(parGraine.keys().next().value);
    parGraine.set(cle, rep);
    return rep;
  }

  /* la signature (distance) d une oeuvre existante : lue dans ses OCTETS stockes, jamais supposee. Echec -> signatureNonLue (relue au
   *   balayage suivant) ; tant qu une seule manque, choix() rend NON_LU — elle n est jamais retiree en silence des `existantes`. */
  async function lireSignature(contrat, o) {
    try { const d = decoderBytes(await rpc('eth_call', [appelLecture(contrat, SIG_TAM.donnees, o.tokenId), 'latest'])); const x = decoder(d); oe.sigs.set(o.tokenId, signature(x.points, x.q)); delete o.signatureNonLue; }
    catch (_) { o.signatureNonLue = true; }
  }
  /* 2026-11-01 : GET /api/tam/certifier?p=<base64url(JSON des params)> — une oeuvre REGLEE (joueur ou cerveau) passe les MEMES certificats
   *   que le choix du cerveau, distance comprise contre TOUTES les oeuvres mintees (memes regles NON_LU que choix). Bornes d abord
   *   (validerReglage : n, q, pas = ceux du moteur — une requete ne peut pas commander un calcul plus long). */
  const parReglage = new Map();
  async function certifierParams(p64) {
    let json;
    try { json = Buffer.from(String(p64 || ''), 'base64url').toString('utf8'); } catch (_) { json = ''; }
    if (!json || json.length > MAX_PARAMS_JSON) return { ok: false, etat: 'REFUSE', codes: ['HORS_BORNES'], pourquoi: 'params missing or longer than ' + MAX_PARAMS_JSON + ' bytes' };
    let P; try { P = JSON.parse(json); } catch (_) { return { ok: false, etat: 'REFUSE', codes: ['HORS_BORNES'], pourquoi: 'params are not JSON' }; }
    if (adresseTam(deploiement)) {
      if (oe.jusqua === null || oe.erreur || !oe.aJour) return { ok: false, etat: 'NON_LU', codes: ['SIGNATURE_NON_LUE'], pourquoi: 'the minted works were not read up to the latest block, so distinctness cannot be measured' };
    }
    const existantes = oe.oeuvres.map((o) => oe.sigs.get(o.tokenId) || null);
    const cle = json + ':' + existantes.length;
    if (parReglage.has(cle)) return parReglage.get(cle);
    const c = certifierReglage(P, existantes);
    const { oeuvre: _o, octets, signature: _s, ...reste } = c;
    const rep = { ...reste, ok: c.ok === true, etat: c.ok ? 'CERTIFIE' : c.etat === 'NON_LU' ? 'NON_LU' : 'REFUSE', hash: octets ? keccak256Hex(octets) : null, comparees: existantes.length,
      pourquoi: c.ok ? null : (c.raisons || []).join('; ') };
    if (rep.etat !== 'NON_LU') { if (parReglage.size > 64) parReglage.delete(parReglage.keys().next().value); parReglage.set(cle, rep); }
    return rep;
  }

  async function balayer(contrat) {
    for (const o of oe.oeuvres) if (o.signatureNonLue) await lireSignature(contrat, o);
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
        await lireSignature(contrat, o);
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

  return { choix, oeuvres, cerveauDe, certifierParams };
}
