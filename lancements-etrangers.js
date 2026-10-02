// lancements-etrangers.js — QUI a lance ce token sur Base ? Detecteur lecture seule (eth_getLogs + eth_call).
// ================================================================================================
// ⛔ MESURE DU 2026-10-02 (24 h, blocs 52 030 987 -> 52 074 187, 44/44 fenetres lues, 0 ratee) :
//    Zora 3 491 · Doppler 1 014 (dont bankr 560) · B20 auto-lances 156 · Clanker v4 148 · o1 Standard 113
//    (dont LaunchBlitz 24, J7Tracker 17, RapidLaunch 22) · o1 Tax 86 · OpenLaunch 96 · TB 0.
//    « Born on another launchpad » disait vrai, mais ne disait pas LEQUEL : ce module le dit.
// ⛔ LECTURE SEULE. Aucune signature, aucune ecriture. Une fenetre ratee est COMPTEE, jamais tue.
// ⛔ LaunchBlitz n a PAS de factory : c est un terminal (tweet -> token) qui lance via la factory o1 Standard.
//    On le reconnait a l URI de metadonnees (ipfs.launchblitz.ai, champ "createdOn":"o1_base"). Structure, pas preuve.
// ⛔ OpenLaunch (af8e) est un PARTENAIRE : classe a part, jamais traite comme un concurrent.

import { decoderChaineAbi } from './texte-onchain.js';

export const B20_FACTORY = '0xb20f000000000000000000000000000000000000';
export const TOPIC_B20_CREATED = '0xfd9bf2730513a1709722ff379a0844dfd8f997d600693c2bcc659e188bbdba0d';

/** Les launchpads lus. `jeton(l)` rend l adresse du token depuis le log. Adresses en minuscules. */
export const LAUNCHPADS = Object.freeze([
  { id: 'O1_STANDARD', nom: 'o1 Launchpad', adresse: '0x1176122eb77ad6a2339322cda7c4d7ea9bfa63dc',
    topic: '0x207384e895174175cc774fe7f7457b37c382f27ebf53d37d5257b862f80eaf9c',
    jeton: (l) => '0x' + l.topics[1].slice(26), createur: (l) => '0x' + l.topics[3].slice(26),
    hook: '0x1f91c998e7c2f4b690d75bdbf6502bdcd6e02acc' },
  { id: 'O1_TAX', nom: 'o1 Launchpad (Tax)', adresse: '0x53c59d8d335681d58f564cf62073fa3c57cf81ee',
    topic: '0x207384e895174175cc774fe7f7457b37c382f27ebf53d37d5257b862f80eaf9c',
    jeton: (l) => '0x' + l.topics[1].slice(26), createur: (l) => '0x' + l.topics[3].slice(26),
    hook: '0x9c7155d7216454d9d894f792c8b5c564f2c66acc' },
  { id: 'CLANKER', nom: 'Clanker', adresse: '0xe85a59c628f7d27878aceb4bf3b35733630083a9',
    topic: '0x9299d1d1a88d8e1abdc591ae7a167a6bc63a8f17d695804e9091ee33aa89fb67',
    jeton: (l) => '0x' + l.topics[1].slice(26), createur: (l) => '0x' + l.topics[2].slice(26) },
  { id: 'ZORA', nom: 'Zora', adresse: '0x777777751622c0d3258f214f9df38e35bf45baf3',
    topic: '0x2de436107c2096e039c98bbcc3c5a2560583738ce15c234557eecb4d3221aa81',
    jeton: (l) => '0x' + mot(l.data, 4).slice(24), createur: (l) => '0x' + l.topics[1].slice(26) },
  { id: 'ZORA', nom: 'Zora (creator coin)', adresse: '0x777777751622c0d3258f214f9df38e35bf45baf3',
    topic: '0x74b670d628e152daa36ca95dda7cb0002d6ea7a37b55afe4593db7abd1515781',
    jeton: (l) => '0x' + mot(l.data, 4).slice(24), createur: (l) => '0x' + l.topics[1].slice(26) },
  { id: 'DOPPLER', nom: 'Doppler', adresse: '0x660eaaedebc968f8f3694354fa8ec0b4c5ba8d12',
    topic: '0x68ff1cfcdcf76864161555fc0de1878d8f83ec6949bf351df74d8a4a1a2679ab',
    jeton: (l) => '0x' + mot(l.data, 0).slice(24), createur: () => null },
  { id: 'OPENLAUNCH', nom: 'OpenLaunch (partner)', adresse: '0x815542e8b392389a1389e22e588e4b62a67ade72',
    topic: '0xda18b133e41a7fe4e3adc625c6eeaf9237558c875e411398a623cc9603aad0a9',
    jeton: (l) => '0x' + l.topics[1].slice(26), createur: (l) => '0x' + l.topics[3].slice(26) },
]);

/** bankr lance via Doppler avec SON wallet de frais comme `integrator` (Airlock.getAssetData, mot 9). */
export const BANKR_INTEGRATEUR = '0xf60633d02690e2a15a54ab919925f3d038df163e';
export const SEL_GET_ASSET_DATA = '0x1652e7b7';

/** Front-ends connus de la factory o1, reconnus a l hote de l URI de metadonnees. */
export const FRONTS_O1 = Object.freeze([
  { re: /launchblitz\.ai/i, nom: 'LaunchBlitz' },
  { re: /j7tracker\.io/i, nom: 'J7Tracker' },
  { re: /rapidlaunch\.io/i, nom: 'RapidLaunch' },
]);

function mot(data, i) { return String(data || '0x').slice(2 + 64 * i, 2 + 64 * (i + 1)).padStart(64, '0'); }

/** Le front o1 d apres l URI (`null` si inconnu ou illisible). */
export function frontO1(uri) {
  const u = String(uri || '');
  for (const f of FRONTS_O1) if (f.re.test(u)) return f.nom;
  return null;
}

/** L interface Clanker, lue dans le contexte JSON du log (`{"interface":"Bankr",…}`). */
export function interfaceClanker(data) {
  const s = hexEnTexteLache(data);
  const m = s.match(/"interface":"([^"]{0,40})"/i);
  return m ? m[1] : null;
}

/**
 * Classe UNE transaction a partir de SES logs (ceux d une fenetre, regroupes par tx).
 * ⛔ Pure : aucun reseau. Rend [] si la tx ne lance rien.
 * @returns {{jeton,launchpad,nom,createur,tx,bloc,indice}[]}
 */
export function classerLogsDeTx(logs) {
  const out = [];
  const vus = new Set();
  for (const l of logs || []) {
    const a = String(l.address || '').toLowerCase();
    const t0 = String((l.topics || [])[0] || '').toLowerCase();
    const lp = LAUNCHPADS.find((x) => x.adresse === a && x.topic === t0);
    if (!lp) continue;
    const jeton = lp.jeton(l).toLowerCase();
    if (vus.has(jeton)) continue;
    vus.add(jeton);
    let nom = lp.nom, indice = null;
    if (lp.id === 'CLANKER') {
      indice = interfaceClanker(l.data);
      if (indice && /bankr/i.test(indice)) nom = 'bankr (Clanker)';
    }
    out.push({ jeton, launchpad: lp.id, nom, createur: lp.createur(l), tx: l.transactionHash,
      bloc: parseInt(l.blockNumber, 16), indice });
  }
  for (const l of logs || []) {
    if (String(l.address || '').toLowerCase() !== B20_FACTORY) continue;
    if (String((l.topics || [])[0] || '').toLowerCase() !== TOPIC_B20_CREATED) continue;
    const jeton = ('0x' + l.topics[1].slice(26)).toLowerCase();
    if (vus.has(jeton)) continue;
    vus.add(jeton);
    out.push({ jeton, launchpad: 'B20_AUTO', nom: 'self-launched B20', createur: null, tx: l.transactionHash,
      bloc: parseInt(l.blockNumber, 16), indice: null });
  }
  return out;
}

/** Regroupe des logs par transaction, puis classe chaque transaction. */
export function classerLogs(logs) {
  const parTx = new Map();
  for (const l of logs || []) {
    const k = l.transactionHash;
    if (!parTx.has(k)) parTx.set(k, []);
    parTx.get(k).push(l);
  }
  return [...parTx.values()].flatMap(classerLogsDeTx);
}

/** Les filtres eth_getLogs a poser sur une fenetre (une requete par adresse, topics fusionnes). */
export function filtresScan() {
  const parAdr = new Map();
  for (const lp of LAUNCHPADS) {
    if (!parAdr.has(lp.adresse)) parAdr.set(lp.adresse, new Set());
    parAdr.get(lp.adresse).add(lp.topic);
  }
  parAdr.set(B20_FACTORY, new Set([TOPIC_B20_CREATED]));
  return [...parAdr.entries()].map(([address, t]) => ({ address, topics: [[...t]] }));
}

/**
 * Scanne [deBloc, aBloc] par fenetres de `pas` blocs (Tenderly public : 1000 max).
 * Affine ensuite : o1 -> front (contractURI), Doppler -> bankr (getAssetData), B20 auto -> TB si `estTb(jeton)`.
 * @returns {{ lancements: object[], fenetres: number, ratees: number, nonAffines: number, parLaunchpad: object }}
 */
export async function scannerLancements({ rpc, deBloc, aBloc, pas = 1000, estTb = null, affiner = true, maxAffinage = Infinity }) {
  const hex = (n) => '0x' + n.toString(16);
  const logs = [];
  let fenetres = 0, ratees = 0;
  for (let a = deBloc; a <= aBloc; a += pas) {
    const b = Math.min(aBloc, a + pas - 1);
    for (const f of filtresScan()) {
      fenetres++;
      try { logs.push(...(await rpc('eth_getLogs', [{ ...f, fromBlock: hex(a), toBlock: hex(b) }]) || [])); }
      catch (_) { ratees++; }
    }
  }
  const lancements = classerLogs(logs);
  let nonAffines = 0, affines = 0;
  if (affiner) {
    for (const x of lancements) {
      if (!['O1_STANDARD', 'O1_TAX', 'DOPPLER', 'B20_AUTO'].includes(x.launchpad)) continue;
      if (affines >= maxAffinage) { x.affinage = 'NON_LU'; nonAffines++; continue; }
      affines++;
      try {
        if (x.launchpad === 'O1_STANDARD' || x.launchpad === 'O1_TAX') {
          const uri = decoderTexte(await rpc('eth_call', [{ to: x.jeton, data: '0xe8a3d485' }, 'latest']));
          const front = frontO1(uri);
          if (front) { x.front = front; x.nom = front + ' (via o1)'; }
        } else if (x.launchpad === 'DOPPLER') {
          const d = String(await rpc('eth_call', [{ to: '0x660eaaedebc968f8f3694354fa8ec0b4c5ba8d12',
            data: SEL_GET_ASSET_DATA + x.jeton.slice(2).padStart(64, '0') }, 'latest']));
          const integ = '0x' + d.slice(2 + 64 * 9 + 24, 2 + 64 * 10);
          x.integrateur = integ;
          if (integ.toLowerCase() === BANKR_INTEGRATEUR) { x.launchpad = 'BANKR'; x.nom = 'bankr (Doppler)'; }
        } else if (x.launchpad === 'B20_AUTO' && estTb && await estTb(x.jeton)) {
          x.launchpad = 'TB'; x.nom = 'TokenizedBlock';
        }
      } catch (_) { x.affinage = 'NON_LU'; }
    }
  }
  const parLaunchpad = {};
  for (const x of lancements) parLaunchpad[x.nom] = (parLaunchpad[x.nom] || 0) + 1;
  /* ⛔ un plafond d affinage est DIT (nonAffines) : un front o1 non lu reste « o1 Launchpad », jamais devine. */
  return { lancements, fenetres, ratees, nonAffines, parLaunchpad };
}

/** Hex -> octets (pour chercher du JSON dans un log ; jamais affiche tel quel). */
function hexEnOctets(h) {
  const x = String(h || '0x').replace(/^0x/, '');
  const o = new Uint8Array(Math.floor(x.length / 2));
  for (let i = 0; i < o.length; i++) o[i] = Number('0x' + x.slice(2 * i, 2 * i + 2));
  return o;
}
function hexEnTexteLache(h) { return new TextDecoder('utf-8', { fatal: false }).decode(hexEnOctets(h)); }

/** Une `string` ABI rendue par eth_call -> texte ('' si illisible). ⛔ Le decodeur CANONIQUE (texte-onchain.js). */
export function decoderTexte(h) { return decoderChaineAbi(h) || ''; }
