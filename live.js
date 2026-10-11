// live.js - LA PAGE /live : ce que TokenizedBlock a VRAIMENT encaisse, lisible par un humain ET par un lecteur de liens
// (Phil, 2026-10-11 : « que les tx puissent etre captees via X pour que Grok sur X puisse lire aussi en live »).
// ⛔ CE MODULE NE LIT RIEN SUR LE RESEAU : la route (serveur-web.js) lui passe ce qu elle a lu ; ici on assemble et on rend.
// ⛔ RENDU COTE SERVEUR, SANS JAVASCRIPT : un robot qui suit un lien (Grok, un apercu de post) lit le texte tel quel.
// ⛔ CHAQUE CHIFFRE PORTE SON ETAT (LU / EN_COURS / NON_LU) - jamais un 0 a la place d une lecture ratee.
// ⛔ RIEN N EST PUBLIE SUR X D ICI : la page se LIT ; poster reste un geste humain.
import { FEE_WALLET, USDC_BASE } from './frais-creation.js';

const EXPLORATEUR = 'https://basescan.org';
const ETH = '0x0000000000000000000000000000000000000000';
const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Un montant brut en texte lisible : ETH (18), USDC (6), sinon « unites brutes » + la devise (on n invente pas de decimales). */
export function montantLisible(montant, devise) {
  let m;
  try { m = BigInt(montant); } catch (_) { return 'unreadable amount'; }
  const d = String(devise || '').toLowerCase();
  const fmt = (v, dec, sym) => {
    const ent = v / 10n ** BigInt(dec), frac = (v % 10n ** BigInt(dec)).toString().padStart(dec, '0').replace(/0+$/, '');
    return ent.toString() + (frac ? '.' + frac : '') + ' ' + sym;
  };
  if (d === 'eth' || d === ETH) return fmt(m, 18, 'ETH');
  if (d === USDC_BASE.toLowerCase() || d === 'usdc') return fmt(m, 6, 'USDC');
  return m.toString() + ' raw units of ' + (/^0x[0-9a-f]{40}$/.test(d) ? d : 'an unread token');
}

/**
 * L etat de la page. `frais` = ce que la route a obtenu du calcul en fond des frais (fraisRecents) :
 *   { etat: 'LU', heures, derniers:[{tx,bloc,devise,montant,etat}], parDevise:[{devise,n,total}], nonVerifies, complet, fenetresRatees, ageS }
 *   | { etat: 'EN_COURS' } | { etat: 'NON_LU', pourquoi }.
 * `soldes` = { eth: bigint|null, usdc: bigint|null } (null = non lu). `sondes` = /sante.sondes. `build` = le tampon servi.
 */
export function etatLive({ frais, soldes = {}, sondes = {}, build = null, maintenant }) {
  const f = frais && typeof frais === 'object' ? frais : { etat: 'NON_LU', pourquoi: 'not read' };
  const lu = (v) => (typeof v === 'bigint' ? { etat: 'LU', brut: v.toString() } : { etat: 'NON_LU' });
  return {
    page: 'TokenizedBlock live',
    lu: new Date(maintenant).toISOString(),
    build,
    walletDeFrais: FEE_WALLET,
    soldes: { eth: lu(soldes.eth), usdc: lu(soldes.usdc) },
    sondes: { naissance: sondes.naissance || 'NON_LU', marche: (sondes.marche && sondes.marche.etat) || 'NON_LU',
      echange: (sondes.echange && sondes.echange.etat) || 'NON_LU', cerveau: (sondes.cerveau && sondes.cerveau.etat) || 'NON_LU' },
    frais: f.etat === 'LU'
      ? { etat: 'LU', heures: f.heures, ageS: f.ageS ?? null, complet: f.complet === true, fenetresRatees: (f.fenetresRatees || []).length,
        nonVerifies: f.nonVerifies || 0,
        parDevise: (f.parDevise || []).map((d) => ({ devise: d.devise, n: d.n, total: String(d.total) })),
        derniers: (f.derniers || []).slice(-25).reverse().map((e) => ({ tx: e.tx, bloc: e.bloc, devise: e.devise, montant: String(e.montant), etat: e.etat })) }
      : { etat: f.etat === 'EN_COURS' ? 'EN_COURS' : 'NON_LU', pourquoi: f.pourquoi || (f.etat === 'EN_COURS' ? 'reading the chain in the background — refresh in a minute' : 'not read') },
    borne: 'Fees from TokenizedBlock market hooks (births and trades) over the window, each checked against the fee wallet balance: '
      + 'ARRIVE = the balance moved by that amount. Bank service fees (0.1 % of a Morpho borrow, paid in USDC) are not listed one by one '
      + 'yet: they show in the fee wallet USDC balance. NON_LU means not read — never zero. Nothing here is a forecast or a promise.',
  };
}

/** Le texte brut (une ligne par fait) : ce que lit un robot qui suit le lien, et le corps visible de la page. */
export function texteLive(e) {
  const l = [];
  l.push('TokenizedBlock — live, read on Base at ' + e.lu + (e.build ? ' (build ' + e.build + ')' : ''));
  l.push('Health probes: birth ' + e.sondes.naissance + ' · market ' + e.sondes.marche + ' · trade ' + e.sondes.echange + ' · brain ' + e.sondes.cerveau);
  l.push('Fee wallet ' + e.walletDeFrais + ': ' + (e.soldes.eth.etat === 'LU' ? montantLisible(e.soldes.eth.brut, 'eth') : 'ETH not read')
    + ' · ' + (e.soldes.usdc.etat === 'LU' ? montantLisible(e.soldes.usdc.brut, 'usdc') : 'USDC not read'));
  if (e.frais.etat !== 'LU') {
    l.push('Fees, last 24 h: ' + e.frais.etat + ' — ' + e.frais.pourquoi);
  } else {
    /* « incomplete: 0 window(s) refused » se contredisait (mesure locale 2026-10-11) : sans refus, c est une partie de la plage pas encore lue */
    const manque = e.frais.complet ? '' : e.frais.fenetresRatees > 0
      ? ' (incomplete: ' + e.frais.fenetresRatees + ' chain window(s) refused by the node — not read, not empty)'
      : ' (incomplete: part of the window is not read yet — not read, not empty)';
    l.push('Fees, last ' + e.frais.heures + ' h' + manque
      + ': ' + (e.frais.parDevise.length ? e.frais.parDevise.map((d) => d.n + ' × ' + montantLisible(d.total, d.devise)).join(' · ') : 'none in the windows read'));
    for (const x of e.frais.derniers) l.push('  ' + x.etat + ' · ' + montantLisible(x.montant, x.devise) + ' · block ' + x.bloc + ' · ' + EXPLORATEUR + '/tx/' + x.tx);
    if (e.frais.nonVerifies) l.push('  (' + e.frais.nonVerifies + ' older event(s) not checked against the balance in this read)');
  }
  l.push('What this proves: ' + e.borne);
  return l.join('\n');
}

/** La page HTML : balises d apercu (X, Farcaster), le texte en clair, aucun script. */
export function htmlLive(e) {
  const titre = 'TokenizedBlock — live on Base';
  const desc = e.frais.etat === 'LU'
    ? 'Fees actually received in the last ' + e.frais.heures + ' h, each checked on chain. Read at ' + e.lu + '.'
    : 'What TokenizedBlock actually received, checked on chain. Read at ' + e.lu + '.';
  const url = 'https://tokenizedblock.space/live';
  return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
    + '<title>' + esc(titre) + '</title><link rel="canonical" href="' + url + '"><meta name="description" content="' + esc(desc) + '">'
    + '<meta property="og:type" content="website"><meta property="og:site_name" content="TokenizedBlock"><meta property="og:title" content="' + esc(titre) + '">'
    + '<meta property="og:description" content="' + esc(desc) + '"><meta property="og:url" content="' + url + '"><meta property="og:image" content="https://tokenizedblock.space/embed.png">'
    + '<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="' + esc(titre) + '"><meta name="twitter:description" content="' + esc(desc) + '">'
    + '<meta name="twitter:image" content="https://tokenizedblock.space/embed.png">'
    + '<style>:root{color-scheme:light dark}body{margin:0;padding:16px;font:14px/1.5 ui-monospace,Menlo,Consolas,monospace;background:#0b0b0f;color:#e8e8ef}'
    + 'pre{white-space:pre-wrap;word-break:break-all;max-width:960px}a{color:#8ab4ff}@media (prefers-color-scheme:light){body{background:#fff;color:#111}a{color:#1a56db}}</style>'
    + '</head><body><h1 style="font-size:18px">' + esc(titre) + '</h1><pre>'
    + esc(texteLive(e)).replace(/(https:\/\/basescan\.org\/tx\/0x[0-9a-fA-F]{64})/g, '<a href="$1" rel="noopener">$1</a>')
    + '</pre><p><a href="/api/live">JSON</a> · <a href="/">Open the app</a></p></body></html>';
}
