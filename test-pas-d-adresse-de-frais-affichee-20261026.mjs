// test-pas-d-adresse-de-frais-affichee-20261026.mjs — AUCUNE ADRESSE DE FRAIS N EST JAMAIS AFFICHEE (game57 item 10, 2026-10-26).
// ================================================================================================
// ⛔ CE QUI A ETE VU (prod 20261026-game56, onglet Market, section Skins) : « Skin #1 dresses UNIT · Not listed · held by 0x…(abrege) » —
//    l adresse abregee etait celle du wallet de frais. Regle (Phil) : aucune adresse de frais, entiere ou abregee, quelle que soit sa
//    casse, n est rendue dans l interface (texte, title, aria, infobulle). Les constantes restent dans le code (routage on-chain intact).
// CE QUE CE TEST PROUVE :
//   A. la carte Skins (skmLigne d app.html + detenteurCourt de skins-marche.js) RENDUE dans un faux DOM ne montre aucune adresse de frais,
//      ni « held by » / « seller » suivi d elle ; une autre adresse reste montree (pas de masquage aveugle). En LF ET en CRLF.
//   B. les aides de frais-creation.js (estAdresseFrais, courtAffichable, masquerAdressesFrais) masquent toutes les formes et laissent
//      les autres adresses ; les constantes de routage n ont pas bouge.
//   C. les raccourcisseurs reels (court / courtAdr d app.html, nomDe d apercu.js) passent par le masque.
//   D. GARDE STATIQUE sur CHAQUE fichier servi (liste SERVIS de serveur-web.js) : pas d abreviation litterale d une adresse de frais,
//      pas de constante de frais concatenee dans du texte affiche, pas de nouveau raccourcisseur d adresse brut hors liste revue.
import { readFileSync, existsSync } from 'node:fs';

let ok = 0, ko = 0;
const verifier = (cond, quoi) => { if (cond) { ok += 1; console.log('  ok  ' + quoi); } else { ko += 1; console.log('  KO  ' + quoi); } };
const lire = (f) => readFileSync(new URL('./' + f, import.meta.url), 'utf8');

/* les adresses de frais, ici seulement (un test n est pas servi) */
const A6 = '0xa6cf99d35949c6cb911adb910078f4ca46f0f5d4';
const L37 = '0x37eb9b7ce0b51fe12fbf092026e001918128580a';
const AUTRE = '0x1234567890abcdef1234567890abcdef12345678';
/* toute trace visible : l adresse entiere, ses bouts abreges (6, 8, 10 premiers caracteres), sa fin a 4 */
const FUITE = /a6cf99|0xa6cf|f0f5d4|0x37eb|128580a|f5d4\b|580a\b/i;
const sansFuite = (t) => !FUITE.test(String(t));

/* ─────────────────────────────── B. les aides de frais-creation.js ─────────────────────────────── */
console.log('B. frais-creation.js : le masque');
const FC = await import('./frais-creation.js');
verifier(FC.FEE_WALLET.toLowerCase() === A6 && FC.WALLET_TRESOR_SMART.toLowerCase() === A6 && FC.CREATE_ROUTER_FEE_WALLET.toLowerCase() === A6
  && FC.HOOK_FEE_WALLET.toLowerCase() === A6 && FC.FEE_WALLET_LEGACY_37EB.toLowerCase() === L37, 'B0 routage on-chain intact : les constantes de frais n ont pas change');
const aides = ['estAdresseFrais', 'courtAffichable', 'masquerAdressesFrais', 'libelleAdresseFrais'].filter((k) => typeof FC[k] === 'function');
verifier(aides.length === 4, 'B1 frais-creation.js exporte estAdresseFrais, courtAffichable, masquerAdressesFrais, libelleAdresseFrais (' + aides.join(', ') + ')');
if (aides.length === 4) {
  const formes = [A6, A6.toUpperCase().replace('0X', '0x'), '0xa6cF99D35949c6cB911adB910078F4Ca46F0f5d4', L37, L37.toUpperCase().replace('0X', '0x')];
  verifier(formes.every((a) => FC.estAdresseFrais(a)) && !FC.estAdresseFrais(AUTRE) && !FC.estAdresseFrais('') && !FC.estAdresseFrais(null), 'B2 estAdresseFrais : toutes casses, les deux wallets ; pas une autre adresse');
  verifier(formes.every((a) => sansFuite(FC.courtAffichable(a)) && FC.courtAffichable(a).length > 0), 'B3 courtAffichable(adresse de frais) ne montre rien d elle : « ' + FC.courtAffichable(A6) + ' » / « ' + FC.courtAffichable(L37) + ' »');
  verifier(FC.courtAffichable(AUTRE) === '0x1234…5678', 'B4 courtAffichable(autre) = 0x1234…5678 (pas de masquage aveugle)');
  const phrase = 'to ' + formes.join(' and ') + ' then ' + AUTRE;
  const m = FC.masquerAdressesFrais(phrase);
  verifier(sansFuite(m) && m.includes(AUTRE), 'B5 masquerAdressesFrais retire les 5 formes et garde l autre : « ' + m.slice(0, 120) + '… »');
  verifier(FC.libelleAdresseFrais(AUTRE) === null && sansFuite(FC.libelleAdresseFrais(A6)) && !!FC.libelleAdresseFrais(A6), 'B6 libelleAdresseFrais : un nom pour un wallet de frais, null sinon');
}

/* ─────────────────────────────── A. la carte Skins rendue ─────────────────────────────── */
console.log('A. la carte Skins (onglet Market) rendue dans un faux DOM');
class Txt { constructor(t) { this.t = String(t); } get textContent() { return this.t; } }
class El {
  constructor(tag) { this.tag = tag; this.kids = []; this.attrs = {}; this.dataset = {}; this.className = ''; this.value = ''; this.classList = { add() {}, remove() {} }; }
  set textContent(v) { this.kids = [new Txt(v)]; }
  get textContent() { return this.kids.map((k) => k.textContent).join(''); }
  append(...k) { this.kids.push(...k.map((x) => (typeof x === 'string' ? new Txt(x) : x))); }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  addEventListener() {}
  querySelector() { return null; }
  after() {}
}
/* tout ce qu un humain peut lire : le texte, et les attributs title / aria-label / placeholder / value */
const visible = (n) => (n instanceof Txt ? n.t : [n.textContent, ...['title', 'aria-label', 'placeholder'].map((k) => n.attrs[k] || ''), n.value || '']
  .concat(n.kids.filter((k) => k instanceof El).map(visible)).join(' | '));
const bcEl = (tag, opts = {}, kids = []) => {
  const e = new El(tag);
  for (const [k, v] of Object.entries(opts || {})) { if (k === 'cls') e.className = v; else if (k === 'text') e.textContent = v; else e.setAttribute(k, v); }
  e.append(...kids);
  return e;
};
const fauxDocument = { createElementNS: (ns, t) => new El(t), createTextNode: (t) => new Txt(t) };
const SM = await import('./skins-marche.js');
const BS = await import('./blockskins.js');

/* extraction : la fonction ENTIERE (jusqu a la fonction suivante), et la ligne `const court` d app.html — trouvees, sinon KO */
const extraire = (src) => {
  const m = src.match(/\r?\nfunction skmLigne\(s, moi, t\) \{/);
  const reste = m ? src.slice(m.index + m[0].indexOf('function')) : '';
  const f = reste.search(/\r?\n\}\r?\n/);
  const corps = f < 0 ? '' : reste.slice(0, f) + '\n}';
  const court = (src.match(/^const court = [^\r\n]+/m) || [''])[0];
  return { corps, court };
};
const rendre = (src, s, moi, etiquette) => {
  const { corps, court } = extraire(src);
  const trouve = /^function skmLigne\(s, moi, t\) \{/.test(corps) && /return li;\s*\}$/.test(corps) && /detenteurCourt\(s, moi\)/.test(corps) && /^const court = \(a\) =>/.test(court);
  verifier(trouve, etiquette + ' : skmLigne (' + corps.length + ' car.) et const court extraits d app.html');
  if (!trouve) return null;
  const params = ['document', 'bcEl', 'apercuSkinFormes', 'statutSkin', 'detenteurCourt', 'gestesSkin', 'tempsRestant', 'offreMinimale', 'montantOffre', 'brutVersTexteSkin',
    'bcMontantSkin', 'bcResoudre', 'bcDevisesSkin', 'bcActionMarche', 'bcFormVendreSkin', 'montantVersBrut', 'UNIT_APP', 'courtAffichable', 'estAdresseFrais', 'libelleAdresseFrais'];
  const fab = new Function(...params, court + '\n' + corps + '\nreturn skmLigne;');
  const skmLigne = fab(fauxDocument, bcEl, SM.apercuSkinFormes, SM.statutSkin, SM.detenteurCourt, SM.gestesSkin, SM.tempsRestant, BS.offreMinimale, SM.montantOffre, SM.brutVersTexte,
    (brut) => String(brut) + ' USDC', () => ({ sym: null }), () => ({}), () => {}, () => new El('form'), (x) => BigInt(x), '0xb2000000000000000000007afa7ed748b0874f27',
    FC.courtAffichable, FC.estAdresseFrais, FC.libelleAdresseFrais);
  try { return visible(skmLigne(s, moi, 1000)); } catch (e) { verifier(false, etiquette + ' : skmLigne a leve ' + e.message); return null; }
};
const UNIT = '0xb2000000000000000000007afa7ed748b0874f27';
const recette = { teintes: [10, 20, 30, 40, 50, 60, 70] };
const skin = (o) => ({ tokenId: 1n, block: UNIT, recette, enVente: false, enchere: false, prix: 0n, offre: 0n, fin: 0, devise: FC.USDC_BASE.toLowerCase(), ...o });
const appLF = lire('app.html').replace(/\r\n/g, '\n');
const appCRLF = appLF.replace(/\n/g, '\r\n');
for (const [src, eol] of [[appLF, 'LF'], [appCRLF, 'CRLF']]) {
  const libre = rendre(src, skin({ detenteur: A6 }), null, 'A1 ' + eol);
  if (libre !== null) {
    verifier(sansFuite(libre), 'A2 ' + eol + ' skin non listee detenue par le wallet de frais : aucune trace de son adresse — « ' + libre.replace(/\s+/g, ' ').slice(0, 140) + ' »');
    verifier(!/held by/i.test(libre) && /Not listed/.test(libre), 'A3 ' + eol + ' « Not listed » sans « held by » quand le detenteur est le wallet de frais');
  }
  const majuscules = rendre(src, skin({ detenteur: '0xa6cF99D35949c6cB911adB910078F4Ca46F0f5d4' }), null, 'A4 ' + eol);
  if (majuscules !== null) verifier(sansFuite(majuscules) && !/held by/i.test(majuscules), 'A5 ' + eol + ' meme chose avec l adresse en casse mixte (checksum)');
  const vieux = rendre(src, skin({ detenteur: L37 }), null, 'A6 ' + eol);
  if (vieux !== null) verifier(sansFuite(vieux) && !/held by/i.test(vieux), 'A7 ' + eol + ' meme chose avec l ancien wallet de frais (37eb)');
  const vente = rendre(src, skin({ detenteur: A6, enVente: true, prix: 5000000n }), null, 'A8 ' + eol);
  if (vente !== null) verifier(sansFuite(vente) && !/seller/i.test(vente) && /For sale/.test(vente), 'A9 ' + eol + ' en vente par le wallet de frais : « For sale · … » sans « seller » ni adresse');
  const ench = rendre(src, skin({ detenteur: A6, enVente: true, enchere: true, prix: 5000000n, fin: 99999 }), null, 'A10 ' + eol);
  if (ench !== null) verifier(sansFuite(ench) && !/seller/i.test(ench) && /Auction/.test(ench), 'A11 ' + eol + ' enchere du wallet de frais : sans « seller » ni adresse');
  const autre = rendre(src, skin({ detenteur: AUTRE }), null, 'A12 ' + eol);
  if (autre !== null) verifier(/Not listed · held by 0x1234…5678/.test(autre), 'A13 ' + eol + ' une autre adresse reste dite : « held by 0x1234…5678 »');
  const moi = rendre(src, skin({ detenteur: AUTRE }), AUTRE, 'A14 ' + eol);
  if (moi !== null) verifier(/held by you/.test(moi), 'A15 ' + eol + ' la sienne : « held by you »');
}
verifier(SM.detenteurCourt(skin({ detenteur: A6 }), null) === null && SM.detenteurCourt(skin({ detenteur: AUTRE }), null) === '0x1234…5678',
  'A16 detenteurCourt : null pour un wallet de frais (rien a dire), l adresse courte sinon');

/* ─────────────────────────────── C. les raccourcisseurs reels ─────────────────────────────── */
console.log('C. les raccourcisseurs d adresse reels passent par le masque');
if (aides.length === 4) {
  for (const nom of ['court', 'courtAdr']) {
    const l = (appLF.match(new RegExp('^const ' + nom + ' = [^\\r\\n]+', 'm')) || [''])[0];
    verifier(!!l, 'C0 app.html : const ' + nom + ' trouvee');
    if (!l) continue;
    const f = new Function('courtAffichable', 'estAdresseFrais', 'libelleAdresseFrais', l + '\nreturn ' + nom + ';')(FC.courtAffichable, FC.estAdresseFrais, FC.libelleAdresseFrais);
    verifier(sansFuite(f(A6)) && sansFuite(f(L37)) && f(AUTRE) === '0x1234…5678', 'C1 app.html ' + nom + ' : « ' + f(A6) + ' », autre = ' + f(AUTRE));
  }
  const AP = await import('./apercu.js');
  const n = AP.nomDe(A6, { chaine: 8453 }), n2 = AP.nomDe(AUTRE, { chaine: 8453 });
  verifier(sansFuite(n) && /fee wallet/i.test(n) && n2 === '0x1234…5678', 'C2 apercu.js nomDe(wallet de frais) = « ' + n + ' » (avant signature : nomme, sans adresse) ; autre = ' + n2);
}

/* ─────────────────────────────── D. la garde statique sur chaque fichier servi ─────────────────────────────── */
console.log('D. garde statique : chaque fichier servi');
const srv = lire('serveur-web.js');
const bloc = (srv.match(/const SERVIS = \[([\s\S]*?)\r?\n\];/) || [])[1] || '';
const servis = [...new Set([...bloc.replace(/\/\*[\s\S]*?\*\//g, ' ').matchAll(/'([^'\s]+\.(?:html|js|mjs|json|txt|css|svg))'/g)].map((m) => m[1]))];
verifier(servis.length > 100 && servis.includes('app.html') && servis.includes('skins-marche.js'), 'D0 liste SERVIS lue dans serveur-web.js : ' + servis.length + ' fichiers (app.html, skins-marche.js inclus)');
/* commentaires retires EN GARDANT les numeros de ligne ; // retire hors des URL (https://) */
const nu = (s) => s.replace(/<!--[\s\S]*?-->/g, (m) => m.replace(/[^\r\n]/g, ' ')).replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\r\n]/g, ' '))
  .split(/\r?\n/).map((l) => l.replace(/(^|[^:'"\\])\/\/.*$/, '$1'));
const ABREGE = /0x(?:a6cf|37eb)[0-9a-f]{0,36}(?:…|\.\.\.|\\u2026)/i;
const ID = '(?:FEE_WALLET|WALLET_TRESOR_SMART|CREATE_ROUTER_FEE_WALLET|HOOK_FEE_WALLET|FEE_WALLET_LEGACY_37EB|OPERATEUR|WALLET_FRAIS|feeWallet|walletDesFrais|devWallet|operateur)';
/* une constante de frais en position d AFFICHAGE : concatenee a du texte, passee a un echappeur/createTextNode, ou affectee a un sink */
const AFFICHE = new RegExp('(?:\\+\\s*(?:String\\()?\\s*(?:[\\w.]+\\.)?' + ID + '\\b(?!\\s*(?:===|!==|\\.toLowerCase\\(\\)\\s*(?:===|!==))))'
  + '|(?:\\b' + ID + '\\b(?:\\.slice\\([^)]*\\))?\\s*\\+)'
  + '|(?:(?:txt|enTexte|esc|createTextNode)\\(\\s*(?:[\\w.]+\\.)?' + ID + '\\b)'
  + '|(?:(?:textContent|innerHTML|innerText|title|ariaLabel)\\s*\\+?=\\s*(?:[\\w.]+\\.)?' + ID + '\\b)');
const MASQUE = /masquerAdressesFrais|courtAffichable|libelleAdresseFrais/;
/* les usages NON affiches, revus un par un : une URL d explorateur (href), du calldata (pad / slice(2)) */
const PAS_AFFICHE = /'\/address\/' \+ (?:[\w.]+\.)?FEE_WALLET;?$|\.slice\(2\)|padStart|pad\(/;
const RACCOURCI = /([\w.$()[\]]+)\.slice\(0, ?\d+\) ?\+ ?'(?:…|\.\.\.)' ?\+ ?\1\.slice\(-\d+\)/;
/* les raccourcisseurs BRUTS qui restent, revus : chacun abrege un JETON, un CONTRAT ou un block — jamais un wallet. Un nouveau
 *   raccourcisseur d adresse doit passer par courtAffichable (frais-creation.js), sinon ce test rougit. */
const REVUS = [
  ['app.html', "return a.slice(0, 6) + '…' + a.slice(-4);\n}", 'symbole de jeton (devise inconnue)'],
  ['app.html', "' (' + a.slice(0, 6) + '…' + a.slice(-4) + ')'", 'routeur du swap (routeurCourt)'],
  ['app.html', "tp.contrat.slice(0, 6) + '…' + tp.contrat.slice(-4)", 'contrat TicketPot'],
  ['app.html', "t.slice(0, 6) + '…' + t.slice(-4);", 'jeton d un duel (symDuel)'],
  ['app.html', "String(j).slice(0, 6) + '…' + String(j).slice(-4)", 'jeton (post on X)'],
  ['app.html', "saved.slice(0, 6) + '…' + saved.slice(-4)", 'block du hub (x2)'],
  ['app.html', "m[0].slice(0, 6) + '…' + m[0].slice(-4)", 'block du hub'],
  ['app.html', "j.slice(0, 6) + '…' + j.slice(-4)", 'block du hub'],
  ['app.html', "sel.value.slice(0, 6) + '…' + sel.value.slice(-4)", 'block du hub (x2)'],
  ['app.html', "|| b.slice(0, 6) + '…' + b.slice(-4)) + '</option>'", 'block cree par ce wallet (liste /api/blocks-de)'],
  ['app.html', "s.length > 14 ? s.slice(0, 8) + '…' + s.slice(-4) : s;", 'bvCourt : block voisin ou empreinte (Brain vision)'],
  ['brain-os.js', "a.slice(0, 6) + '…' + a.slice(-4)", 'symbole de jeton'],
  ['paires.js', "p.adr.slice(0, 6) + '…' + p.adr.slice(-4)", 'paire B20'],
  ['pont-de-liquidite.js', "String(a).slice(0, 6) + '…' + String(a).slice(-4)", 'jeton du pont'],
  ['route-multi-factory.js', "String(a).slice(0, 6) + '…' + String(a).slice(-4)", 'jeton de la route'],
  ['app.html', "String(r.hash).slice(0, 10) + '…' + String", 'hash de transaction'],
  ['index.html', "hash.slice(0, 10) + '…' + hash.slice(-6)", 'hash de transaction (x2)'],
  ['index.html', "a.block.slice(0, 10) + '…' + a.block.slice(-4)", 'block du marche'],
];
let lignesLues = 0;
const fuites = [];
for (const f of servis) {
  if (!/\.(html|js|mjs)$/.test(f) || !existsSync(new URL('./' + f, import.meta.url))) continue;
  const src = lire(f), lignes = nu(src.replace(/\r\n/g, '\n'));
  lignes.forEach((l, i) => {
    lignesLues += 1;
    const ou = f + ':' + (i + 1);
    if (ABREGE.test(l)) fuites.push(ou + ' abreviation litterale d une adresse de frais');
    if (AFFICHE.test(l) && !MASQUE.test(l) && !PAS_AFFICHE.test(l.trim())) fuites.push(ou + ' constante de frais affichee : ' + l.trim().slice(0, 110));
    if (RACCOURCI.test(l) && !MASQUE.test(l) && !REVUS.some(([rf, bout]) => rf === f && (l.includes(bout) || (bout.includes('\n') && (l + '\n' + (lignes[i + 1] || '')).includes(bout)))))
      fuites.push(ou + ' raccourcisseur d adresse brut (passer par courtAffichable) : ' + l.trim().slice(0, 110));
  });
}
verifier(lignesLues > 50000, 'D1 lignes de code servi lues : ' + lignesLues);
for (const x of fuites) console.log('      ' + x);
verifier(fuites.length === 0, 'D2 aucune adresse de frais affichable dans le code servi (' + fuites.length + ' fuite(s))');

/* les sinks reparees qu aucun motif generique ne voit (valeur lue sur la chaine ou parametre de constructeur) : epinglees */
const EPINGLES = [
  ...['deploy-v4.html', 'deploy-v5.html', 'deploy-v6.html', 'deploy-v7.html', 'deploy-v8.html', 'deploy-7030.html'].flatMap((f) => [
    [f, /\$\('#fee'\)\.textContent = /], [f, /' fee wallet: ' \+ /]]),
  ['deploy-pot.html', /\$\('#fee'\)\.textContent = /], ['deploy-pot.html', /' operator: ' \+ /],
  ['deployer-blockskins.html', /\$\('#dFrais'\)\.textContent = /], ['deployer-blockskins.html', /\$\('#rLu'\)\.textContent = /], ['deployer-blockskins.html', /'Connected: ' \+ /],
  ...['deployer-blockrolls.html', 'deployer-duels.html', 'deployer-duels-v2.html', 'deployer-missions.html', 'deployer-slots.html', 'deployer-ticketpot.html'].flatMap((f) => [
    [f, /\$\('#dParams'\)\.innerHTML = /], [f, /\$\('#rLu'\)\.textContent = /], [f, /'Connected: ' \+ /]]),
  ['pot.html', /\$\('#connecter'\)\.textContent = compte/], ['pot.html', /<tr><td><code>' \+ txt\(/],
  ['reclamer.html', /\$\('#connecter'\)\.textContent = compte/], ['reclamer.html', /compte = c\[0\]; \$\('#connecter'\)\.textContent = /],
  ['frais.html', /\$\('#compteTxt'\)\.textContent = 'Connected: /],
  ['index.html', /function raccourciAdr\(a\) \{[\s\S]{0,200}?return /],
  ['app.html', /\$\('#pCompte'\)\.textContent = /], ['app.html', /'Switch to the verifier wallet[ (]*' \+ /], ['app.html', /drawn: ' \+ \(dd\.winner === moi \? 'you won ' : /],
  ['brain-jeu.js', /wait for the verifier wallet[ (]*' \+ /],
  ['brain-os.js', /^const ligne = \(texte, classe = ''\) => /m],
];
for (const [f, re] of EPINGLES) {
  const src = lire(f).replace(/\r\n/g, '\n');
  const m = src.match(new RegExp(re.source + '[^\\n]*(?:\\n[^\\n]*){0,2}', re.flags));
  const vu = !!m && MASQUE.test(m[0].split('\n').slice(0, /raccourciAdr/.test(re.source) ? 6 : /#connecter/.test(re.source) ? 2 : 1).join('\n'));
  verifier(vu, 'D3 ' + f + ' ' + re.source.slice(0, 60) + ' : ' + (m ? (vu ? 'passe par le masque' : 'AFFICHE SANS MASQUE — « ' + m[0].split('\n')[0].trim().slice(0, 90) + ' »') : 'sink introuvable'));
}

console.log('\n' + ok + ' ok, ' + ko + ' KO');
process.exit(ko ? 1 : 0);
