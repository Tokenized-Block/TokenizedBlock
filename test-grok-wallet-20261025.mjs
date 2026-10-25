/* test-grok-wallet-20261025.mjs — CE QUE LE WALLET ET LA BANK MONTRENT APRES UN RECU (rapport Grok du 2026-10-25, prod game44).
 *
 * Les cas du rapport (wallet test 0x31e0, tx verifiees status 1 par le lead) :
 *   (4) SNDKc achete (0x5ed69934…e86f) : absent du Wallet et de « You pay » jusqu au rechargement ;
 *   (5) Withdraw complet a la Bank (0xe599f033…b9e5) : le Wallet disait encore « you lent 0.099999 USDC » jusqu au rechargement ;
 *   (6) Bank a 375 px : le panneau recouvrait la carte Bank du Wallet ; un actif « ? » a cote de IB022 ;
 *   (7) seul le hash final (« Done — 0x… ») etait affiche, jamais celui des approbations.
 *
 * CE QUE CE BANC EXECUTE (fonctions extraites d app.html, globales remplacees par des doublures ; jamais le fichier modifie) :
 *   A. bcOpMaj(op, 'done', hash) relit le Wallet ET lui passe le jeton RECU (lu dans le recu : un Transfer vers ce compte n est
 *      qu un INDICE de quel jeton relire — le solde est lu par balanceOf, jamais pris dans l evenement) ;
 *   B. majWallet({ recus }) liste ce jeton, avec son solde LU, meme quand /api/avoirs (cache serveur 30 s) ne le montre pas encore ;
 *   C. un block cree venu de l index serveur (/api/blocks-de, sans symbole) porte son symbole LU sur la chaine — jamais « ? » ;
 *   D. bcApresOperation relit la position Morpho SUR LA CHAINE (position + market) : l API Morpho en retard ne fait plus revivre
 *      un pret retire ; un retrait partiel montre le reste exact ;
 *   E. bcSigner dit le hash de CHAQUE etape confirmee (approbations comprises) ;
 *   F. « Open the Bank » sous 761 px : la vue Bank est en haut du panneau et la carte Bank du Wallet finit au-dessus de la feuille ;
 *   G. chaque regle tue son mutant (copies EN MEMOIRE du texte).
 *
 * ⚠️ CE QU IL NE PROUVE PAS : un wallet reel (rien n est signe), le rendu navigateur (mesure a part, a 375 px), que l API Morpho
 *   rattrape la chaine, ni qu un noeud reponde au moment du recu (une lecture ratee laisse la relecture d ouverture d onglet).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const { selecteur } = await import(pathToFileURL(path.join(ICI, 'encodeur.js')).href);
const { MORPHO_BLUE } = await import(pathToFileURL(path.join(ICI, 'banque-morpho.js')).href);
const { symboleDepuisReponse } = await import(pathToFileURL(path.join(ICI, 'texte-onchain.js')).href);
const brut = fs.readFileSync(process.env.TB_APP || path.join(ICI, 'app.html'), 'utf8').replace(/\r\n/g, '\n');

const MOI = '0x31e0' + 'a'.repeat(36);
const AUTRE = '0x' + 'c'.repeat(40);
/* adresses copiees du depot : SNDKc (paires.js), USDC (DEVISES_BASE) */
const SNDK = '0xb200000000000000000000397293cb8cda9a10c5';
const USDC = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913';
const UNITB = '0xb2000000000000000000007afa7ed748b0874f27'; /* le block cree par 0x31e0 (/api/blocks-de en prod, 2026-10-25) */
const TRANSFER = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const mot = (x) => BigInt(x).toString(16).padStart(64, '0');
const motA = (a) => '0x' + String(a).slice(2).toLowerCase().padStart(64, '0');
const abiTexte = (s) => { const h = Buffer.from(s, 'utf8').toString('hex'); return '0x' + mot(32) + mot(h.length / 2) + h.padEnd(64, '0'); };
const tick = async (n = 30) => { for (let i = 0; i < n; i += 1) await new Promise((ok) => setImmediate(ok)); };

async function verifier(html) {
  const ko = [];
  const exige = (c, m) => { if (!c) ko.push(m); };
  /* une fonction de premier niveau : jusqu a `}` seul en colonne 0 ; une fonction d UNE ligne : sa ligne */
  const corps = (sig) => {
    const i = html.indexOf(sig); if (i < 0) return null;
    const finLigne = html.indexOf('\n', i), ligne = html.slice(i, finLigne);
    if (/\}\s*(\/\*.*\*\/)?\s*$/.test(ligne) && (ligne.match(/\{/g) || []).length === (ligne.match(/\}/g) || []).length) return ligne;
    const m = /\n\}\n/.exec(html.slice(i)); return m ? html.slice(i, i + m.index + 2) : null;
  };
  const ou = (sig) => corps(sig) || '';

  /* ── A. bcOpMaj -> relecture du Wallet avec le jeton recu ── */
  {
    const src = ou('function bcOpMaj(') + '\n' + ou('function jetonsRecusDuRecu(') + '\n' + ou('async function bcApresConfirme(');
    const appels = [];
    const recu = { status: '0x1', from: MOI, logs: [
      { address: SNDK, topics: [TRANSFER, motA('0x' + '9'.repeat(40)), motA(MOI)], data: '0x' + mot(3970) },
      { address: USDC, topics: [TRANSFER, motA(MOI), motA('0x' + '9'.repeat(40))], data: '0x' + mot(50000) }, /* sortie : pas un recu */
      { address: '0x' + 'd'.repeat(40), topics: [TRANSFER, motA(AUTRE), motA(AUTRE)], data: '0x' + mot(1) }, /* pour un autre */
      { address: '0x' + 'e'.repeat(40), topics: [TRANSFER, motA(AUTRE), motA(MOI), mot(7)], data: '0x' }, /* ERC-721 : 4 sujets */
    ] };
    const bc = { soldesLus: 5, actionsDetenues: { compte: MOI, t: Date.now(), liste: [] } };
    let rpcVu = null;
    try {
      const f = new Function('bc', 'BC_ETATS', 'bcSauverOps', 'majWallet', 'rpc', 'compte', src + '\nreturn bcOpMaj;');
      const bcOpMaj = f(bc, { done: 1, signing: 1 }, () => {}, async (o) => { appels.push(o); },
        async (m, p) => { rpcVu = [m, p]; return m === 'eth_getTransactionReceipt' ? recu : null; }, MOI);
      bcOpMaj({ etat: 'signing' }, 'signing', null);
      await tick();
      exige(appels.length === 0, 'A0 une etape NON confirmee relit deja le Wallet');
      bcOpMaj({ etat: 'signing' }, 'done', '0x' + '5e'.repeat(32));
      await tick();
    } catch (e) { exige(false, 'A0 bcOpMaj a leve : ' + e.message); }
    exige(appels.length === 1, 'A1 apres un recu confirme, le Wallet n est pas relu (majWallet appele ' + appels.length + ' fois)');
    const r = appels[0] && appels[0].recus;
    exige(Array.isArray(r) && r.length === 1 && r[0] === SNDK, 'A2 le jeton RECU (SNDKc) n est pas passe a la relecture : ' + JSON.stringify(r));
    exige(rpcVu && rpcVu[0] === 'eth_getTransactionReceipt', 'A3 le recu n est pas lu');
    exige(bc.soldesLus === 0 && bc.actionsDetenues.t === 0, 'A4 les soldes du Trade (« You hold », actions detenues) ne sont pas marques a relire');
  }

  /* ── B / C. majWallet : le jeton recu entre dans la liste ; un block de l index porte son symbole LU ── */
  const lancerWallet = async ({ recus, avoirs, gardees }) => {
    const src = ou('async function majWallet(') + '\n' + ou('async function nomJetonWallet(');
    const el = () => ({ hidden: false, textContent: '', title: '', innerHTML: '' });
    const els = new Map(); const $ = (s) => { if (!els.has(s)) els.set(s, el()); return els.get(s); };
    const soldes = { [USDC]: 300000n, [SNDK]: 3967n, [UNITB]: 10n ** 21n };
    const lireJeton = async (adr) => { const a = String(adr).toLowerCase(); if (!(a in soldes)) throw new Error('no balance'); return { decimales: a === USDC ? 6 : 6, solde: soldes[a], multiplicateur: null, multiplicateurUi: null }; };
    const rpc = async (m, p) => {
      if (m === 'eth_getBalance') return '0x10';
      if (m === 'eth_call' && p[0].data === '0x95d89b41' && String(p[0].to).toLowerCase() === UNITB) return abiTexte('UNIT');
      throw new Error('rpc ' + m);
    };
    const fetch = async () => ({ json: async () => ({ ok: true, etat: 'LU', avoirs }) });
    const reg = new Map([[USDC, 'USDC'], [SNDK, 'SNDKc']]);
    const bcResoudre = (a) => ({ ok: true, adr: String(a).toLowerCase(), sym: reg.get(String(a).toLowerCase()) || (String(a).slice(0, 6) + '…' + String(a).slice(-4)) });
    const f = new Function('$', 'compte', 'CHAINE', 'RESEAUX', 'rpc', 'abrege', 'formaterUnites', 'peindreActifs', 'remplirChoixActif', 'JETONS_CONNUS', 'dormir',
      'lireJeton', 'fetch', 'mesCreations', 'mesFrappes', 'creationsLues', 'SYMBOLES_GENESE', 'court', 'texteAbi', 'bcResoudre', 'ACTIONS_PAR_ADR', 'DEVISES_BASE',
      'let actifs = [], jetonLecture = 0, walletLuA = 0;\n' + src + '\nreturn async (o) => { await majWallet(o); return actifs; };');
    const run = f($, MOI, 8453, { 8453: { nom: 'Base' } }, rpc, (x) => x, (b) => String(b), () => {}, () => {},
      { 8453: [{ adr: USDC, nom: 'USDC', ic: '$' }] }, async () => {}, lireJeton, fetch,
      async () => ({ r: { fenetresRatees: [] }, gardees: gardees || [], nonResolues: [] }), async () => ({ blocks: [] }), [], {},
      (a) => a.slice(0, 6) + '…' + a.slice(-4), (h) => symboleDepuisReponse(h) || '', bcResoudre, new Set([SNDK]), [{ adr: USDC, symbole: 'USDC' }]);
    return run(recus === undefined ? undefined : { recus });
  };
  try {
    /* /api/avoirs encore « d avant l achat » (cache serveur 30 s) : USDC seul */
    const actifs = await lancerWallet({ recus: [SNDK], avoirs: [{ adr: USDC, solde: '350000', decimales: 6, symbole: 'USDC', action: false }] });
    const s = actifs.filter((a) => String(a.adr || '').toLowerCase() === SNDK);
    exige(s.length === 1, 'B1 le jeton recu (SNDKc) n est pas dans le Wallet apres le recu : ' + JSON.stringify(actifs.map((a) => a.nom)));
    exige(s[0] && s[0].etat === 'LU' && s[0].solde === 3967n && s[0].nom === 'SNDKc', 'B2 SNDKc sans son solde LU ou sans son nom : ' + JSON.stringify(s[0], (k, v) => (typeof v === 'bigint' ? String(v) : v)));
    exige(s[0] && /tokenized stock/.test(s[0].sous || ''), 'B3 SNDKc n est pas dit « tokenized stock »');
    exige(actifs.filter((a) => String(a.adr || '').toLowerCase() === USDC).length === 1, 'B4 USDC liste deux fois');
    /* aucun recu : la liste d avant, inchangee */
    const sans = await lancerWallet({ avoirs: [{ adr: USDC, solde: '350000', decimales: 6, symbole: 'USDC', action: false }] });
    exige(!sans.some((a) => String(a.adr || '').toLowerCase() === SNDK), 'B5 sans recu, SNDKc apparait quand meme (invente)');
    /* recu deja liste par /api/avoirs : une seule ligne */
    const deux = await lancerWallet({ recus: [SNDK], avoirs: [{ adr: SNDK, solde: '3967', decimales: 6, symbole: 'SNDKc', action: true }] });
    exige(deux.filter((a) => String(a.adr || '').toLowerCase() === SNDK).length === 1, 'B6 SNDKc liste deux fois (recu + avoirs)');
    /* C. le block cree de l index serveur (sans symbole) */
    const c = await lancerWallet({ avoirs: [], gardees: [{ jeton: UNITB, createur: MOI, depuisIndex: true }] });
    const u = c.find((a) => String(a.adr || '').toLowerCase() === UNITB);
    exige(u && u.nom === 'UNIT', 'C1 le block cree de l index est nomme « ' + (u && u.nom) + ' » au lieu de son symbole lu (UNIT)');
    exige(!c.some((a) => a.nom === '?'), 'C2 un actif s appelle encore « ? »');
  } catch (e) { exige(false, 'B0 majWallet a leve : ' + e.message); }

  /* ── D. la Bank relit la position SUR LA CHAINE apres le recu ── */
  {
    const ID = '0x' + '6a'.repeat(32);
    const src = ['function bcApresOperation(', 'async function bcBanqueDonneesPourToi(', 'async function bcBanqueLirePositions(', 'async function bcBanqueLireAvoirs(',
      'async function bcBanqueRelireSurChaine(', 'function bcBanqueAvecChaine('].map(ou).join('\n')
      + '\n' + ((/\nconst BC_MORPHO_BLUE = [^\n]*/.exec(html) || [''])[0]) + '\n' + ((/\nconst BC_CHAINE_VAUT_MS = [^\n]*/.exec(html) || [''])[0]);
    const cst = (/const BC_MORPHO_BLUE = '(0x[0-9a-f]{40})';/.exec(html) || [])[1];
    exige(cst === MORPHO_BLUE, 'D0 l adresse Morpho Blue du panneau n est pas celle de banque-morpho.js : ' + cst);
    const cas = async (supplyShares) => {
      const posApi = { id: ID, garantie: { adr: '0x' + 'b2'.padEnd(40, '1'), symbole: 'GOOGLc', decimales: 6 }, pret: { symbole: 'USDC', decimales: 6 },
        garantieBrute: '0', garantieUsd: null, preteBrut: '99999', preteUsd: 0.1, detteBrute: '0', detteUsd: null, sante: null, versLiquidation: null };
      const fetch = async (u) => ({ json: async () => (/positions/.test(u) ? { ok: true, positions: [posApi] } : { ok: true, etat: 'LU', avoirs: [] }) });
      const bcBanque = { marches: [], pourToi: null, positionsDe: 'x' };
      const lus = [];
      const rpc = async (m, p) => {
        const d = String(p[0].data); lus.push(d.slice(0, 10));
        if (String(p[0].to).toLowerCase() !== MORPHO_BLUE) throw new Error('not morpho');
        if (d.startsWith('0x' + selecteur('position(bytes32,address)'))) return '0x' + mot(supplyShares) + mot(0) + mot(0);
        if (d.startsWith('0x' + selecteur('market(bytes32)'))) return '0x' + mot(1000000) + mot(2000000) + mot(0) + mot(0) + mot(0) + mot(0);
        throw new Error('selector');
      };
      try {
        const f = new Function('bcBanque', 'compte', 'fetch', 'rpc', 'selecteur', 'setTimeout', 'bcBanquePositions', 'bcBanquePourToi', 'tbBanquePeindre',
          src + '\nreturn { bcApresOperation, bcBanqueDonneesPourToi };');
        const o = f(bcBanque, MOI, fetch, rpc, selecteur, () => 0, async () => {}, async () => {}, async () => {});
        await o.bcBanqueDonneesPourToi(true); /* la carte telle qu avant le recu : l API dit « lent 0.099999 » */
        o.bcApresOperation();
        await tick(60);
        return { p: bcBanque.pourToi, lus };
      } catch (e) { return { err: e.message }; }
    };
    const plein = await cas(0n);
    exige(!plein.err, 'D1 la relecture a leve : ' + plein.err);
    const ps = plein.p && plein.p.pos && plein.p.pos.ok ? plein.p.pos.positions : null;
    exige(ps && !ps.some((x) => x.id === ID), 'D2 apres un retrait COMPLET, la position « lent 0.099999 USDC » de l API (en retard) est encore montree');
    exige(plein.lus && plein.lus.includes('0x' + selecteur('position(bytes32,address)')), 'D3 la position n est pas relue sur la chaine apres le recu');
    const moitie = await cas(1000000n); /* 1e6 parts sur 2e6, 1e6 actifs : 500000 */
    const pm = moitie.p && moitie.p.pos && moitie.p.pos.ok ? moitie.p.pos.positions.find((x) => x.id === ID) : null;
    exige(pm && pm.preteBrut === '500000' && pm.preteUsd === null, 'D4 retrait partiel : le reste lu sur la chaine n est pas montre (ou un montant USD perime reste) : ' + JSON.stringify(pm));
  }

  /* ── E. le hash de chaque etape confirmee ── */
  {
    const src = ou("async function bcSigner(m, appels, ligne = 'autre') {");
    const etapes = [];
    try {
      const f = new Function('bcEtape', 'envoyerDepuisWallet', 'window', 'rpc', 'CHAINE', 'compte', 'estRefusWallet', 'aEteDiffusee', 'signalerPaye', 'lieuTicketPaye', src + '\nreturn bcSigner;');
      const h = ['0xd9265fc7' + '1'.repeat(48) + '00005aa7', '0x5ed69934' + '2'.repeat(48) + '0000e86f'];
      let k = 0;
      const signer = f((m, t) => etapes.push(t), async () => ({ etat: 'CONFIRME', hash: h[k++] }), { ethereum: {} }, null, 8453, MOI, () => false, () => false, () => {}, () => {});
      const s = await signer({}, [{ to: USDC, nom: 'approve' }, { to: '0x' + '7'.repeat(40), nom: 'swap' }], 'swap_action');
      exige(s.ok && s.hash === h[1], 'E0 bcSigner ne rend plus le dernier hash');
      const conf = etapes.filter((t) => /^Confirmed/.test(t));
      exige(conf.length === 2 && conf[0].includes('0xd9265fc7') && conf[0].includes('5aa7') && conf[1].includes('0x5ed69934'),
        'E1 le hash de chaque etape confirmee (approbation comprise) n est pas dit : ' + JSON.stringify(conf));
    } catch (e) { exige(false, 'E0 bcSigner a leve : ' + e.message); }
  }

  /* ── F. Open the Bank sous 761 px ── */
  {
    const src = ou('function bcMontrerSousLaFeuille(');
    const go = /\$\('#tbOuvrirBank'\)\.addEventListener\('click', \(\) => \{([^\n]*)\}\);/.exec(html);
    exige(go && /bcMontrerSousLaFeuille\(\$\('#wBankCarte'\), \$\('#bc-bank'\)\)/.test(go[1]), 'F1 « Open the Bank » ne place ni la vue Bank ni la carte du Wallet');
    try {
      const boite = { scrollTop: 0, getBoundingClientRect: () => ({ top: 250 }) };
      const poignee = { scrollTop: 0, getBoundingClientRect: () => ({ top: 253 }) };
      const pop = { open: true, firstElementChild: poignee, getBoundingClientRect: () => ({ top: 253, bottom: 746 }) };
      const vue = { getBoundingClientRect: () => ({ top: 700 }) };
      const carte = { getBoundingClientRect: () => ({ top: -176, bottom: 449, height: 625 }) };
      const vus = [];
      const win = { matchMedia: (q) => ({ matches: /max-width:\s*760px/.test(q) }), scrollBy: (x, y) => vus.push(y) };
      const f = new Function('$', 'window', 'setTimeout', src + '\nreturn bcMontrerSousLaFeuille;');
      f((s) => (s === '#bcPop' ? pop : s === '#bcPanneau' ? boite : null), win, (fn) => fn())(carte, vue);
      exige(boite.scrollTop === 450, 'F2 la vue Bank n est pas amenee en haut du panneau (scrollTop ' + boite.scrollTop + ', attendu 450)');
      exige(vus.length === 1 && vus[0] === 449 - 253 + 8, 'F3 la carte Bank du Wallet reste sous la feuille : defilement ' + JSON.stringify(vus) + ' (attendu ' + (449 - 253 + 8) + ')');
      const vus2 = []; const large = { matchMedia: () => ({ matches: false }), scrollBy: (x, y) => vus2.push(y) };
      boite.scrollTop = 0;
      f((s) => (s === '#bcPop' ? pop : s === '#bcPanneau' ? boite : null), large, (fn) => fn())(carte, vue);
      exige(vus2.length === 0 && boite.scrollTop === 0, 'F4 au-dessus de 760 px (panneau de cote), la page defile quand meme');
    } catch (e) { exige(false, 'F0 bcMontrerSousLaFeuille a leve : ' + e.message); }
  }
  return ko;
}

let n = 0;
const ko = await verifier(brut);
for (const k of ko) console.log('  KO   ' + k);
if (ko.length) { console.log('ROUGE grok-wallet : ' + ko.length + ' violation(s)'); process.exit(1); }

/* ── G. MUTANTS (copies en memoire) ── */
const MUTANTS = [
  ['M1 bcOpMaj ne relit plus le Wallet', (h) => h.replace("if (etat === 'done') { bc.soldesLus = 0;", "if (etat === 'xdone') { bc.soldesLus = 0;")],
  ['M2 le recu ne donne plus le jeton recu', (h) => h.replace("String(l.topics[2]).toLowerCase() === pour", "String(l.topics[1]).toLowerCase() === pour")],
  ['M3 majWallet ignore les jetons recus', (h) => h.replace('for (const adrR of recus.slice(0, 8)) {', 'for (const adrR of [].slice(0, 8)) {')],
  ['M4 le block de l index retombe sur « ? »', (h) => h.replace("nom: await nomJetonWallet(c.jeton, c.symbole),", "nom: String(c.symbole || '?').slice(0, 12),")],
  ['M5 la Bank ne relit plus la chaine', (h) => h.replace('try { await bcBanqueRelireSurChaine(); } catch (_) { /* l API seule, comme avant */ }', '')],
  ['M6 la position soldee sur la chaine reste montree', (h) => h.replace('if (v.g === 0n && v.d === 0n && v.pr === 0n) { if (i >= 0) liste.splice(i, 1); continue; }', 'if (v.g === 0n && v.d === 0n && v.pr === 0n) { continue; }')],
  ['M7 le hash de l etape n est plus dit', (h) => h.replace("bcEtape(m, r.hash ? 'Confirmed — ' + String(r.hash).slice(0, 10) + '…' + String(r.hash).slice(-4) + '.' : 'Confirmed.', 'oui');", "bcEtape(m, 'Confirmed.', 'oui');")],
  ['M8 la carte reste sous la feuille', (h) => h.replace('if (d > 0) window.scrollBy(0, d);', '')],
  ['M9 Open the Bank ne place plus rien', (h) => h.replace(" bcMontrerSousLaFeuille($('#wBankCarte'), $('#bc-bank'));", '')],
  ['M10 un ERC-721 (4 sujets) serait pris pour un solde a relire', (h) => h.replace("l.topics.length === 3 && String(l.topics[2])", "l.topics.length >= 3 && String(l.topics[2])")],
  ['M11 un Transfer vers un AUTRE compte serait relu', (h) => h.replace("String(l.topics[2]).toLowerCase() === pour", "String(l.topics[2]).toLowerCase() !== '0x'")],
];
let tues = 0;
for (const [nom, muter] of MUTANTS) {
  const m = muter(brut);
  if (m === brut) { console.log('  KO   ' + nom + ' : le motif a muter est introuvable (le banc ne tient plus ce code)'); process.exit(1); }
  const k = await verifier(m);
  if (k.length) { tues += 1; console.log('  ok   ' + nom + ' -> tue (' + k[0].slice(0, 90) + ')'); } else { console.log('  KO   ' + nom + ' : SURVIT'); process.exit(1); }
}
n = MUTANTS.length;
console.log('ok grok-wallet - A..F verts, ' + tues + '/' + n + ' mutants tues ; NE PROUVE PAS un wallet reel ni le rendu navigateur');
