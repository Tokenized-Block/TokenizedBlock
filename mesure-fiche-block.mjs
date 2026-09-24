/* mesure-fiche-block.mjs — TOUT CE QU ON PEUT LIRE D UN BLOCK, ET RIEN D AUTRE.
 *
 * usage : node mesure-fiche-block.mjs 0x<40 hex>
 *
 * ⛔ AUCUN SELECTEUR TAPE DE MEMOIRE : tous sont calcules par `keccak.js` du depot. Un selecteur
 *   recite de tete qui tombe a cote rend `0x` — indiscernable d une fonction absente.
 * ⛔ AUCUNE ADRESSE COMPLETEE : l adresse arrive entiere en argument ou la sonde refuse.
 * ⛔ TROIS ETATS PARTOUT : lu · absent · LECTURE ECHOUEE. Confondre les deux derniers ferait ecrire
 *   « ce block n a pas de marche » sur un noeud sature.
 */
import { selecteur } from './keccak.js';

const RPC = 'https://mainnet.base.org';
const API = 'https://tokenizedblock.space';
const A6CF = '0xa6cf99d35949c6cb911adb910078f4ca46f0f5d4';
const JETON = (process.argv[2] || '').toLowerCase();

if (!/^0x[0-9a-f]{40}$/.test(JETON)) {
  console.log('usage : node mesure-fiche-block.mjs 0x<40 hex>');
  console.log('⛔ adresse entiere exigee — jamais completee de memoire.');
  process.exitCode = 2;
} else {
  async function rpc(m, p) {
    for (let e = 0; e < 4; e++) {
      try {
        const r = await fetch(RPC, { method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: m, params: p }) });
        if (r.status === 429) { await new Promise((k) => setTimeout(k, 700 * 2 ** e)); continue; }
        const j = await r.json();
        if (j.error) return { erreur: j.error.message };
        return { ok: j.result };
      } catch (err) { if (e === 3) return { erreur: String(err.message || err) }; }
    }
    return { erreur: 'illisible apres 4 essais' };
  }
  const appel = (sig, args = '') => rpc('eth_call', [{ to: JETON, data: selecteur(sig) + args }, 'latest']);
  const motAdr = (a) => a.slice(2).toLowerCase().padStart(64, '0');
  function texteAbi(hex) {
    try {
      const d = hex.slice(2);
      if (d.length < 128) return null;
      const len = parseInt(d.slice(64, 128), 16);
      if (!Number.isFinite(len) || len === 0 || len > 128) return null;
      const s = Buffer.from(d.slice(128, 128 + len * 2), 'hex').toString('utf8');
      return /^[\x20-\x7e]+$/.test(s) ? s : null;
    } catch (_) { return null; }
  }
  const dire = (nom, r, rendu) => {
    if (r.erreur) { console.log('  ' + nom.padEnd(16) + '⛔ LECTURE ECHOUEE (' + r.erreur.slice(0, 50) + ')'); return null; }
    if (!r.ok || r.ok === '0x') { console.log('  ' + nom.padEnd(16) + '— absent (lecture reussie)'); return null; }
    const v = rendu(r.ok);
    console.log('  ' + nom.padEnd(16) + (v === null ? '— illisible' : v));
    return v;
  };

  console.log('═══ FICHE DU BLOCK ' + JETON + ' ═══\n');

  /* ── l identite ───────────────────────────────────────────────────────────────────────────── */
  console.log('IDENTITE');
  const nom = dire('name', await appel('name()'), texteAbi);
  const sym = dire('symbol', await appel('symbol()'), texteAbi);
  const dec = dire('decimals', await appel('decimals()'), (h) => Number(BigInt(h)));
  const sup = dire('totalSupply', await appel('totalSupply()'), (h) => BigInt(h).toString());
  if (sup && dec !== null) {
    console.log('  ' + 'supply lisible'.padEnd(16) + (Number(BigInt(sup)) / 10 ** dec).toLocaleString('fr-FR'));
  }

  /* ── le marqueur B20 ──────────────────────────────────────────────────────────────────────── */
  console.log('\nMARQUEUR B20');
  const code = await rpc('eth_getCode', [JETON, 'latest']);
  if (code.erreur) console.log('  ⛔ LECTURE ECHOUEE (' + code.erreur.slice(0, 50) + ') — rien conclu');
  else if (!code.ok) console.log('  ⛔ reponse vide — rien conclu');
  else {
    /* ⛔ LE MARQUEUR EST EXACTEMENT `0xef`, ET RIEN D AUTRE. EIP-3541 interdit qu un contrat
     *   DEPLOYE commence par 0xEF : ce prefixe ne peut donc pas etre imite par un contrat ordinaire.
     *   Un `startsWith('0xef')` accepterait un contrat entier commencant par ces deux caracteres —
     *   la garde doit etre l EGALITE stricte. */
    const exact = code.ok.toLowerCase() === '0xef';
    console.log('  eth_getCode    ' + code.ok.slice(0, 20) + (code.ok.length > 20 ? '… (' + ((code.ok.length - 2) / 2) + ' octets)' : ''));
    console.log('  ' + (exact ? '✅ marqueur B20 EXACT (0xef)' : '⛔ ce n est PAS le marqueur B20 exact'));
  }

  /* ── qui detient ──────────────────────────────────────────────────────────────────────────── */
  console.log('\nDETENTION');
  const bal = await appel('balanceOf(address)', motAdr(A6CF));
  const solde = dire('a6cf detient', bal, (h) => {
    const v = BigInt(h);
    return v.toString() + (dec !== null ? '  (' + (Number(v) / 10 ** dec).toLocaleString('fr-FR') + ')' : '');
  });
  if (solde && sup) {
    const part = (Number(BigInt(solde.split('  ')[0])) / Number(BigInt(sup))) * 100;
    console.log('  ' + 'part de a6cf'.padEnd(16) + part.toFixed(4) + ' % de la supply');
    if (part > 99) {
      console.log('  ⛔⛔ a6cf detient la QUASI-TOTALITE. Ce n est pas un frais : quelqu un a envoye');
      console.log('      tout le jeton ici. A regarder avant d appeler ca un revenu.');
    }
  }

  /* ── les roles ────────────────────────────────────────────────────────────────────────────── */
  console.log('\nROLES (un block sans admin ne peut etre ni frappe ni brule par personne)');
  for (const f of ['owner()', 'admin()', 'DEFAULT_ADMIN_ROLE()']) {
    const r = await appel(f);
    if (r.erreur) console.log('  ' + f.padEnd(22) + '⛔ lecture echouee');
    else if (!r.ok || r.ok === '0x') console.log('  ' + f.padEnd(22) + '— la fonction n existe pas');
    else console.log('  ' + f.padEnd(22) + r.ok.slice(0, 66));
  }

  /* ── la face gravee et le post ────────────────────────────────────────────────────────────── */
  console.log('\nFACE GRAVEE ET POST (lus par /api/face, qui lit la chaine)');
  try {
    const j = await (await fetch(API + '/api/face/' + JETON, { cache: 'no-store' })).json();
    if (!j || j.ok !== true) console.log('  ⛔ ' + JSON.stringify(j).slice(0, 120));
    else {
      console.log('  etat           ' + j.etat + (j.role ? '  · role grave : ' + j.role : ''));
      const f = j.face || {};
      const post = typeof f.tweet === 'string' ? f.tweet : null;
      console.log('  post grave     ' + (post || '— aucun'));
      if (post) {
        console.log('     ⛔ RESERVE : on n a JAMAIS ouvert ce lien. Rien ici ne verifie que le post');
        console.log('        existe, ni qu il appartient a qui a grave le block. Le lien est grave,');
        console.log('        c est tout ce qui est prouve.');
      }
      const autres = Object.keys(f).filter((k) => k !== 'tweet');
      console.log('  apparence      ' + autres.map((k) => k + '=' + f[k]).join(' · '));
    }
  } catch (e) { console.log('  ⛔ LECTURE ECHOUEE (' + String(e.message).slice(0, 50) + ') — rien conclu'); }

  /* ── le marche ────────────────────────────────────────────────────────────────────────────── */
  console.log('\nMARCHE');
  try {
    const t = await (await fetch(API + '/api/trending', { cache: 'no-store' })).json();
    const suivi = JSON.stringify(t).toLowerCase().includes(JETON);
    const ratees = Number(t.fenetresRatees);
    console.log('  suivi par /api/trending : ' + (suivi ? 'OUI' : 'NON')
      + '  (' + (t.blocksAvecPaire ?? '?') + ' blocks ont une paire vivante sur ' + (t.blocksSuivis ?? '?') + ')');
    if (Number.isFinite(ratees) && ratees > 0) {
      console.log('  ⛔ ' + ratees + ' fenetre(s) ratee(s) dans ce scan : « NON » veut dire « absent de ce');
      console.log('     que le scan a pu lire », pas « n a pas de marche ».');
    } else if (!suivi) {
      console.log('  ⇒ aucun marche suivi : ce jeton ne se vend pas, quel que soit le solde affiche.');
      console.log('     C est aussi pour ca qu il n apparait pas sur la carte (elle ne garde que ce qui vit).');
    }
  } catch (e) { console.log('  ⛔ LECTURE ECHOUEE (' + String(e.message).slice(0, 50) + ') — rien conclu'); }

  console.log('\n⛔ CE QUE CETTE FICHE NE DIT PAS : qui a cree ce block, ni quand. Il faudrait balayer');
  console.log('   les logs de frappe depuis la naissance du projet — une autre mesure, pas une');
  console.log('   supposition. Et aucun prix : sans marche, il n y a pas de prix a lire.');
}
