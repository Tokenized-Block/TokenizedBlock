/* mesure-registre-emetteur.mjs — COMBIEN D ACTIONS TOKENISEES EXISTENT, ET COMBIEN ATTENDENT UNE POOL.
 *
 * ⛔⛔ POURQUOI CE FICHIER EXISTE : le concurrent `thestonks.exchange` a publie le 2026-09-30 a 11:38
 *     « Base had 10 tokenized stocks. It now has 50 MORE WAITING FOR LIQUIDITY. » Un chiffre annonce
 *     par un concurrent n est pas une mesure. Celui-ci lit la liste de l EMETTEUR lui-meme, puis
 *     verifie chaque adresse SUR LA CHAINE.
 *
 * ⛔⛔ LA SOURCE : `https://api.coinbase.com/v1/tokenized-stocks` — trouvee dans le README public de
 *     `haardikk21/based-stonks`, puis SONDEE avant d etre codee contre (HTTP 200, 40 entrees). On ne
 *     code jamais contre une API qu on n a pas vue repondre.
 *
 * ⛔⛔⛔ CE QUE CE FICHIER NE FAIT PAS : il n AJOUTE rien au registre de l app. Admettre une action
 *      comme devise de paire demande les cinq preuves de `STOCKS_BASE_REGISTRY` (code `0xef`,
 *      `symbol()` concordant, `decimals()==8`, `totalSupply()>0`, pool prouvee). Ce fichier MESURE
 *      lesquelles les passent. La liste de l emetteur est une source, pas une autorisation :
 *      une entree sans une seule unite en circulation ouvrirait une pool contre du VIDE.
 *
 * ⚠️ BORNE : « pas de marche » ici veut dire « DexScreener n en connait pas », pas « il n en existe
 *    aucun ». Et une entree absente de la liste de l emetteur n est pas prouvee inexistante — c est
 *    prouve absent DE CETTE LISTE. Absence de preuve n est pas preuve d absence.
 *
 * Usage : node mesure-registre-emetteur.mjs
 */
const RPC = 'https://mainnet.base.org';
const API_EMETTEUR = 'https://api.coinbase.com/v1/tokenized-stocks';
const DEX = 'https://api.dexscreener.com/latest/dex/tokens/';

/* ⛔ Les selecteurs, calcules une fois et ecrits en clair : un selecteur rappele de memoire est un
 *   defaut connu de ce depot. `symbol()` 0x95d89b41 · `decimals()` 0x313ce567 · `totalSupply()` 0x18160ddd */
const SEL = { symbol: '0x95d89b41', decimals: '0x313ce567', totalSupply: '0x18160ddd' };

const dors = (ms) => new Promise((r) => setTimeout(r, ms));

/** ⛔ `mainnet.base.org` SAIT lire mais rend `429 over rate limit` : on ATTEND. Basculer vers
 *  publicnode rendrait `403 Archive requests require a personal token` — la pire reponse possible.
 *  Mesure de ce depot, 2026-09-29. */
async function rpc(methode, params, essais = 6) {
  for (let i = 0; i < essais; i += 1) {
    try {
      const r = await fetch(RPC, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-ms-monitor': '1' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: methode, params }),
      });
      if (r.status === 429) { await dors(1200 * (i + 1)); continue; }
      const j = await r.json();
      if (j.error) return { ok: false, err: j.error.message || 'erreur rpc' };
      return { ok: true, val: j.result };
    } catch (e) { await dors(800 * (i + 1)); }
  }
  return { ok: false, err: 'NON_MESURE apres ' + essais + ' essais' };
}

/** ⛔ `"0x"` N EST PAS UN ECHEC DE LECTURE : c est un retour VIDE. Les confondre ferait passer une
 *   absence pour une panne. `BigInt('0x')` leve — on ne l appelle jamais sur du vide. */
const estVide = (h) => !h || h === '0x' || h === '0x0';

function motDecode(hex) {
  if (estVide(hex)) return null;
  try { return BigInt(hex.length > 66 ? '0x' + hex.slice(2, 66) : hex); } catch (_) { return null; }
}

/** Decode un `string` ABI (offset, longueur, octets) OU un bytes32 court. */
function chaineDecode(hex) {
  if (estVide(hex)) return null;
  const b = hex.slice(2);
  try {
    if (b.length >= 128) {
      const lg = Number(BigInt('0x' + b.slice(64, 128)));
      if (lg > 0 && lg <= 64) {
        return Buffer.from(b.slice(128, 128 + lg * 2), 'hex').toString('utf8').replace(/\0+$/, '') || null;
      }
    }
    return Buffer.from(b.slice(0, 64), 'hex').toString('utf8').replace(/\0+/g, '') || null;
  } catch (_) { return null; }
}

async function main() {
  /* ── 1. la liste de l emetteur ─────────────────────────────────────────────────────────── */
  const rep = await fetch(API_EMETTEUR, { headers: { 'x-ms-monitor': '1' } });
  if (!rep.ok) { console.log('⛔ NON_MESURE — la liste de l emetteur rend HTTP ' + rep.status); process.exit(1); }
  const liste = (await rep.json()).tokens || [];
  console.log('═'.repeat(94));
  console.log('LISTE DE L EMETTEUR (api.coinbase.com) : ' + liste.length + ' entrees');

  /* ⛔ `nav_price` n est pas decoratif : c est le prix de reference publie. Les entrees qui en ont
   *   sont celles que l emetteur cote activement — et c est exactement le « 10 » du concurrent. */
  const avecNav = liste.filter((x) => x.nav_price !== undefined && x.nav_price !== null);
  console.log('  dont cotees par l emetteur (nav_price) : ' + avecNav.length
    + '  [' + avecNav.map((x) => x.symbol).join(' ') + ']');
  const sansSupply = liste.filter((x) => !(Number(x.total_supply) > 0));
  console.log('  dont supply absente ou nulle          : ' + sansSupply.length
    + '  [' + (sansSupply.map((x) => x.symbol).join(' ') || '—') + ']');
  console.log('═'.repeat(94));

  /* ── 2. chaque adresse, sur la chaine ──────────────────────────────────────────────────── */
  const lignes = [];
  for (const t of liste) {
    const adr = t.contract_address;
    const code = await rpc('eth_getCode', [adr, 'latest']);
    const sym = await rpc('eth_call', [{ to: adr, data: SEL.symbol }, 'latest']);
    const dec = await rpc('eth_call', [{ to: adr, data: SEL.decimals }, 'latest']);
    const sup = await rpc('eth_call', [{ to: adr, data: SEL.totalSupply }, 'latest']);

    const codeVu = code.ok ? code.val : null;
    const symVu = sym.ok ? chaineDecode(sym.val) : null;
    const decVu = dec.ok ? motDecode(dec.val) : null;
    const supVu = sup.ok ? motDecode(sup.val) : null;

    /* ⛔ `0xef` EXACTEMENT — le marqueur B20. Un prefixe d adresse `0xb2` ne prouve RIEN : une
     *   adresse se choisit. Seul le code fait foi. */
    const b20 = codeVu === '0xef';
    const symOk = symVu !== null && symVu === t.symbol;
    const decOk = decVu === 8n;
    const supOk = supVu !== null && supVu > 0n;
    const nonMesure = !code.ok || !sym.ok || !dec.ok || !sup.ok;

    lignes.push({ sym: t.symbol, adr, b20, symOk, decOk, supOk, nonMesure,
      codeVu, symVu, decVu, supVu, nav: t.nav_price ?? null, mult: t.multiplier });
    const etat = nonMesure ? 'NON_MESURE' : (b20 && symOk && decOk && supOk) ? 'OK' : 'REFUS';
    console.log((etat === 'OK' ? '✓' : etat === 'REFUS' ? '✗' : '?') + ' '
      + t.symbol.padEnd(8) + etat.padEnd(11)
      + 'code=' + String(codeVu).slice(0, 10).padEnd(11)
      + 'symbol=' + String(symVu).padEnd(9)
      + 'dec=' + String(decVu).padEnd(5)
      + 'supply=' + String(supVu));
  }

  /* ── 3. laquelle a un marche ───────────────────────────────────────────────────────────── */
  console.log('═'.repeat(94));
  const admissibles = lignes.filter((l) => l.b20 && l.symOk && l.decOk && l.supOk);
  let avecMarche = 0; let sansMarche = 0; let marcheNonMesure = 0;
  const attente = [];
  for (const l of admissibles) {
    let m = null;
    try {
      const r = await fetch(DEX + l.adr, { headers: { 'x-ms-monitor': '1' } });
      if (r.ok) m = (await r.json()).pairs || [];
    } catch (_) { m = null; }
    if (m === null) { marcheNonMesure += 1; l.marche = 'NON_MESURE'; continue; }
    const liq = m.reduce((s, p) => s + (Number(p?.liquidity?.usd) || 0), 0);
    const vol = m.reduce((s, p) => s + (Number(p?.volume?.h24) || 0), 0);
    if (m.length > 0 && liq > 0) { avecMarche += 1; l.marche = 'OUI'; l.liq = liq; l.vol = vol; }
    else { sansMarche += 1; l.marche = 'NON'; attente.push(l.sym); }
    await dors(160);
  }

  const refus = lignes.filter((l) => !l.nonMesure && !(l.b20 && l.symOk && l.decOk && l.supOk));
  console.log('VERDICT, ET LES RATES AVEC LES PRISES');
  console.log('  liste de l emetteur              : ' + liste.length);
  console.log('  passent les 4 preuves on-chain   : ' + admissibles.length);
  console.log('  REFUSEES (une preuve manque)     : ' + refus.length
    + '  [' + (refus.map((l) => l.sym).join(' ') || '—') + ']');
  console.log('  NON MESUREES (lecture echouee)   : ' + lignes.filter((l) => l.nonMesure).length);
  console.log('  ── parmi les admissibles :');
  console.log('     ont un marche (liq > 0)       : ' + avecMarche);
  console.log('     ATTENDENT UNE POOL            : ' + sansMarche
    + '  [' + (attente.join(' ') || '—') + ']');
  console.log('     marche NON MESURE             : ' + marcheNonMesure);
  console.log('═'.repeat(94));
  console.log('⚠️ BORNE : « attend une pool » = DexScreener n en connait pas. Ce n est pas « il n en');
  console.log('   existe aucune ». Et cette liste est celle de l emetteur : une action absente d elle');
  console.log('   est prouvee absente DE CETTE LISTE, pas inexistante.');
}

main().catch((e) => { console.error('⛔ NON_MESURE :', e.message); process.exit(1); });
