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
 * REVUE DE cba742b (2026-10-25) — les survivants X1..X8 de la revue sont repris dans G et tues :
 *   S. la carte Swap ouverte est repeinte a la relecture (X1) ; le « You pay » choisi survit a la reconstruction (X2) ;
 *   C3/C4. un symbole qui cache des caracteres est nettoye (X5) ; un avoir sans symbole porte son symbole lu, jamais « ? » ;
 *   B7. un solde recu non lu reste NON_LU (X7) ; D5. la dette s arrondit vers le haut (X8) ; D6-D8. la lecture de chaine expire (X4)
 *     et ne vaut que pour son compte (X3) ; A5. le compte change pendant le recu : rien n est relu pour l autre (X6) ;
 *   P. le jeton recu est GARDE d une relecture a l autre jusqu a ce que le serveur le montre (ou un zero lu > 1 min apres) ;
 *   H. « Sign the buy » (Market) relit le recu apres la confirmation, l envoi inchange ; F. la carte Bank : calee par son HAUT quand
 *     elle ne tient pas, placement REJOUE quand le contenu change de taille, arrete par un geste ou la feuille fermee.
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
/* 2026-10-26 : wsPeindreDe lit DEVISES_BANNIES (EURC banni) — le VRAI module, importe par la page */
const { DEVISES_BANNIES } = await import(pathToFileURL(path.join(ICI, 'plan-franchissement.js')).href);
const brut = fs.readFileSync(process.env.TB_APP || path.join(ICI, 'app.html'), 'utf8').replace(/\r\n/g, '\n');

const MOI = '0x31e0' + 'a'.repeat(36);
const AUTRE = '0x' + 'c'.repeat(40);
/* adresses copiees du depot : SNDKc (paires.js), USDC (DEVISES_BASE) */
const SNDK = '0xb200000000000000000000397293cb8cda9a10c5';
const USDC = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913';
const UNITB = '0xb2000000000000000000007afa7ed748b0874f27'; /* le block cree par 0x31e0 (/api/blocks-de en prod, 2026-10-25) */
const ZWB = '0x' + 'ab'.repeat(20); /* un block dont symbol() porte une largeur nulle (U+200B) et un retournement bidi (U+202E) */
const CACHE_ZWB = 'ZW' + String.fromCharCode(0x200b) + 'B' + String.fromCharCode(0x202e);
const SANSSYM = '0x' + 'cd'.repeat(20); /* un avoir de /api/avoirs SANS symbole ; symbol() sur la chaine = FOO */
const TRANSFER ='0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
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
    /* A5. le compte change pendant la lecture du recu : le Wallet de l AUTRE compte ne recoit pas les jetons du premier */
    try {
      const vus = []; let poser = null;
      const g = new Function('majWallet', 'rpc', 'let compte = ' + JSON.stringify(MOI) + ';\n' + ou('function jetonsRecusDuRecu(') + '\n' + ou('async function bcApresConfirme(')
        + '\nreturn { bcApresConfirme, poser: (v) => { compte = v; } };');
      const o = g(async (x) => { vus.push(x); }, async () => { poser(AUTRE); return recu; });
      poser = o.poser;
      await o.bcApresConfirme('0x' + '5e'.repeat(32));
      exige(vus.length === 0, 'A5 le compte a change pendant la lecture du recu, et le Wallet est quand meme relu avec ses jetons : ' + JSON.stringify(vus));
    } catch (e) { exige(false, 'A5 bcApresConfirme a leve : ' + e.message); }
  }

  /* ── B / C. majWallet : le jeton recu entre dans la liste ; un block de l index porte son symbole LU ── */
  /* une instance du Wallet (memes globales d une relecture a l autre : walletRecus survit) ; avoirs, soldes et horloge reglables */
  const instanceWallet = ({ avoirs, gardees } = {}) => {
    const src = ou('async function majWallet(') + '\n' + ou('async function nomJetonWallet(') + '\n' + ou('function texteAbi(')
      + '\n' + ((/\nconst walletRecus = [^\n]*/.exec(html) || [''])[0]) + '\n' + ((/\nconst WALLET_RECU_ATTENTE_MS = [^\n]*/.exec(html) || [''])[0]);
    const el = () => ({ hidden: false, textContent: '', title: '', innerHTML: '' });
    const els = new Map(); const $ = (s) => { if (!els.has(s)) els.set(s, el()); return els.get(s); };
    const etat = { avoirs: avoirs || [], t: 1e12, soldes: { [USDC]: 300000n, [SNDK]: 3967n, [UNITB]: 10n ** 21n, [ZWB]: 5n, [SANSSYM]: 7n } };
    const lireJeton = async (adr) => { const a = String(adr).toLowerCase(); if (!(a in etat.soldes)) throw new Error('no balance'); return { decimales: 6, solde: etat.soldes[a], multiplicateur: null, multiplicateurUi: null }; };
    const rpc = async (m, p) => {
      if (m === 'eth_getBalance') return '0x10';
      if (m === 'eth_call' && p[0].data === '0x95d89b41' && String(p[0].to).toLowerCase() === UNITB) return abiTexte('UNIT');
      if (m === 'eth_call' && p[0].data === '0x95d89b41' && String(p[0].to).toLowerCase() === ZWB) return abiTexte(CACHE_ZWB);
      if (m === 'eth_call' && p[0].data === '0x95d89b41' && String(p[0].to).toLowerCase() === SANSSYM) return abiTexte('FOO');
      throw new Error('rpc ' + m);
    };
    const fetch = async () => ({ json: async () => ({ ok: true, etat: 'LU', avoirs: etat.avoirs }) });
    const reg = new Map([[USDC, 'USDC'], [SNDK, 'SNDKc']]);
    const bcResoudre = (a) => ({ ok: true, adr: String(a).toLowerCase(), sym: reg.get(String(a).toLowerCase()) || (String(a).slice(0, 6) + '…' + String(a).slice(-4)) });
    const f = new Function('$', 'compte', 'CHAINE', 'RESEAUX', 'rpc', 'abrege', 'formaterUnites', 'peindreActifs', 'remplirChoixActif', 'JETONS_CONNUS', 'dormir',
      'lireJeton', 'fetch', 'mesCreations', 'mesFrappes', 'creationsLues', 'SYMBOLES_GENESE', 'court', 'symboleDepuisReponse', 'bcResoudre', 'ACTIONS_PAR_ADR', 'DEVISES_BASE', 'Date',
      'let actifs = [], jetonLecture = 0, walletLuA = 0;\n' + src + '\nreturn async (o) => { await majWallet(o); return actifs; };');
    const run = f($, MOI, 8453, { 8453: { nom: 'Base' } }, rpc, (x) => x, (b) => String(b), () => {}, () => {},
      { 8453: [{ adr: USDC, nom: 'USDC', ic: '$' }] }, async () => {}, lireJeton, fetch,
      async () => ({ r: { fenetresRatees: [] }, gardees: gardees || [], nonResolues: [] }), async () => ({ blocks: [] }), [], {},
      (a) => a.slice(0, 6) + '…' + a.slice(-4), symboleDepuisReponse, bcResoudre, new Set([SNDK]), [{ adr: USDC, symbole: 'USDC' }], { now: () => etat.t });
    return { run, etat };
  };
  const lancerWallet = async ({ recus, avoirs, gardees }) => instanceWallet({ avoirs, gardees }).run(recus === undefined ? undefined : { recus });
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
    /* C3. un symbole lu qui CACHE des caracteres : nettoye (ni largeur nulle ni retournement bidi a l ecran) */
    const z = (await lancerWallet({ avoirs: [], gardees: [{ jeton: ZWB, createur: MOI, depuisIndex: true }] })).find((a) => String(a.adr || '').toLowerCase() === ZWB);
    exige(z && z.nom === 'ZWB', 'C3 le symbole lu n est pas nettoye (caractere cache) : ' + JSON.stringify(z && z.nom));
    /* C4. un avoir de /api/avoirs SANS symbole : son symbole lu, jamais « ? » */
    const sv = (await lancerWallet({ avoirs: [{ adr: SANSSYM, solde: '7', decimales: 6, action: false }] })).find((a) => String(a.adr || '').toLowerCase() === SANSSYM);
    exige(sv && sv.nom === 'FOO', 'C4 un avoir sans symbole est nomme « ' + (sv && sv.nom) + ' » au lieu de son symbole lu (FOO)');
    /* B7. un solde recu qui ne se lit PAS est dit illisible, jamais « lu » */
    const nl = (await lancerWallet({ recus: ['0x' + 'ef'.repeat(20)], avoirs: [] })).find((a) => String(a.adr || '').toLowerCase() === '0x' + 'ef'.repeat(20));
    exige(nl && nl.etat === 'NON_LU', 'B7 un solde recu NON lu est marque ' + (nl && nl.etat));
    /* P. le jeton recu est GARDE d une relecture a l autre, tant que le serveur (cache 30 s) ne le montre pas */
    const avant = [{ adr: USDC, solde: '350000', decimales: 6, symbole: 'USDC', action: false }];
    const w = instanceWallet({ avoirs: avant });
    await w.run({ recus: [SNDK] });
    w.etat.t += 15000;
    const p1 = await w.run(); /* relecture ordinaire (onglet rouvert), serveur encore d avant */
    exige(p1.some((a) => String(a.adr || '').toLowerCase() === SNDK && a.etat === 'LU' && a.solde === 3967n), 'P1 une relecture ordinaire perd le jeton recu tant que /api/avoirs est perime');
    w.etat.avoirs = [...avant, { adr: SNDK, solde: '3967', decimales: 6, symbole: 'SNDKc', action: true }];
    const p2 = await w.run(); /* le serveur a rattrape */
    exige(p2.filter((a) => String(a.adr || '').toLowerCase() === SNDK).length === 1, 'P2 SNDKc liste ' + p2.filter((a) => String(a.adr || '').toLowerCase() === SNDK).length + ' fois quand le serveur le montre');
    w.etat.avoirs = avant;
    const p3 = await w.run();
    exige(!p3.some((a) => String(a.adr || '').toLowerCase() === SNDK), 'P3 le jeton recu reste garde apres que le serveur l a montre (sa liste fait foi)');
    /* P4 / P5. un zero LU : juste apres le recu (noeud en retard) il reste garde ; plus d une minute apres, il ne l est plus */
    const w2 = instanceWallet({ avoirs: avant });
    w2.etat.soldes[SNDK] = 0n;
    await w2.run({ recus: [SNDK] });
    w2.etat.t += 10000;
    await w2.run();
    w2.etat.soldes[SNDK] = 3967n;
    const p4 = await w2.run();
    exige(p4.some((a) => String(a.adr || '').toLowerCase() === SNDK && a.solde === 3967n), 'P4 un zero lu 10 s apres le recu (noeud en retard) fait oublier le jeton recu');
    w2.etat.soldes[SNDK] = 0n; w2.etat.t += 61000;
    const p5 = await w2.run();
    w2.etat.soldes[SNDK] = 3967n;
    const p6 = await w2.run();
    exige(!p5.some((a) => String(a.adr || '').toLowerCase() === SNDK) && !p6.some((a) => String(a.adr || '').toLowerCase() === SNDK),
      'P5 un zero lu plus d une minute apres le recu (vendu) reste montre ou garde');
  } catch (e) { exige(false, 'B0 majWallet a leve : ' + e.message); }

  /* ── D. la Bank relit la position SUR LA CHAINE apres le recu ── */
  {
    const ID = '0x' + '6a'.repeat(32);
    const src = ['function bcApresOperation(', 'async function bcBanqueDonneesPourToi(', 'async function bcBanqueLirePositions(', 'async function bcBanqueLireAvoirs(',
      'async function bcBanqueRelireSurChaine(', 'function bcBanqueAvecChaine('].map(ou).join('\n')
      + '\n' + ((/\nconst BC_MORPHO_BLUE = [^\n]*/.exec(html) || [''])[0]) + '\n' + ((/\nconst BC_CHAINE_VAUT_MS = [^\n]*/.exec(html) || [''])[0]);
    const cst = (/const BC_MORPHO_BLUE = '(0x[0-9a-f]{40})';/.exec(html) || [])[1];
    exige(cst === MORPHO_BLUE, 'D0 l adresse Morpho Blue du panneau n est pas celle de banque-morpho.js : ' + cst);
    const cas = async (supplyShares, { parts = 0n, marche = [1000000n, 2000000n, 0n, 0n] } = {}) => {
      const posApi = { id: ID, garantie: { adr: '0x' + 'b2'.padEnd(40, '1'), symbole: 'GOOGLc', decimales: 6 }, pret: { symbole: 'USDC', decimales: 6 },
        garantieBrute: '0', garantieUsd: null, preteBrut: '99999', preteUsd: 0.1, detteBrute: '0', detteUsd: null, sante: null, versLiquidation: null };
      const fetch = async (u) => ({ json: async () => (/positions/.test(u) ? { ok: true, positions: [posApi] } : { ok: true, etat: 'LU', avoirs: [] }) });
      const bcBanque = { marches: [], pourToi: null, positionsDe: 'x' };
      const lus = [];
      const rpc = async (m, p) => {
        const d = String(p[0].data); lus.push(d.slice(0, 10));
        if (String(p[0].to).toLowerCase() !== MORPHO_BLUE) throw new Error('not morpho');
        if (d.startsWith('0x' + selecteur('position(bytes32,address)'))) return '0x' + mot(supplyShares) + mot(parts) + mot(0);
        if (d.startsWith('0x' + selecteur('market(bytes32)'))) return '0x' + marche.map(mot).join('') + mot(0) + mot(0);
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
    /* D5. une dette s arrondit TOUJOURS vers le HAUT (1 part sur 3, 10 actifs : 10/3 = 3,33 -> 4 ; jamais 3, qui dirait moins que du) */
    const dette = await cas(0n, { parts: 1n, marche: [0n, 0n, 10n, 3n] });
    const pd = dette.p && dette.p.pos && dette.p.pos.ok ? dette.p.pos.positions.find((x) => x.id === ID) : null;
    exige(pd && pd.detteBrute === '4', 'D5 la dette lue n est pas arrondie vers le haut : ' + JSON.stringify(pd && pd.detteBrute) + ' (attendu "4")');
    /* D6. une lecture de chaine de plus de 5 min ne vaut plus : l API reprend, la lecture est oubliee */
    try {
      const f = new Function('bcBanque', 'Date', ou('function bcBanqueAvecChaine(') + '\n' + ((/\nconst BC_CHAINE_VAUT_MS = [^\n]*/.exec(html) || [''])[0]) + '\nreturn bcBanqueAvecChaine;');
      const T = 2e12, posApi = { id: ID, preteBrut: '99999', preteUsd: 0.1 };
      const sur = new Map([[ID, { de: MOI, t: T - 300001, g: 0n, d: 0n, pr: 0n }]]);
      const r = f({ surChaine: sur, marches: [] }, { now: () => T })(MOI, [posApi]);
      exige(r.length === 1 && r[0].preteBrut === '99999' && !sur.has(ID), 'D6 une lecture de chaine de plus de 5 min passe encore devant l API (ou n est pas oubliee)');
      const frais = new Map([[ID, { de: MOI, t: T - 1000, g: 0n, d: 0n, pr: 0n }]]);
      const r2 = f({ surChaine: frais, marches: [] }, { now: () => T })(MOI, [posApi]);
      exige(r2.length === 0, 'D7 une lecture de chaine fraiche (soldee) ne retire pas la position');
      const autre = new Map([[ID, { de: AUTRE, t: T - 1000, g: 0n, d: 0n, pr: 0n }]]);
      const r3 = f({ surChaine: autre, marches: [] }, { now: () => T })(MOI, [posApi]);
      exige(r3.length === 1 && r3[0].preteBrut === '99999', 'D8 la lecture de chaine d un AUTRE compte corrige les positions de celui-ci');
    } catch (e) { exige(false, 'D6 bcBanqueAvecChaine a leve : ' + e.message); }
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

  /* ── S. la carte Swap ouverte suit la relecture ; le « You pay » choisi survit a la reconstruction ── */
  {
    try {
      const wsAppels = [];
      const swap = { hidden: false };
      const els = { '#wSwapCarte': swap, '#wActifs': { innerHTML: '' }, '#profil': { hidden: true } };
      const f = new Function('$', 'actifs', 'remplirChoixActif', 'wsPeindreDe', 'peindreChoixParler', 'dessin', 'enTexte',
        ou('function peindreActifs(') + '\nreturn peindreActifs;');
      const peindre = f((s) => els[s] || null, [], () => {}, () => wsAppels.push(1), () => {}, () => '', (x) => String(x));
      peindre();
      exige(wsAppels.length === 1, 'S1 la carte Swap OUVERTE n est pas repeinte a la relecture du Wallet (« You pay » sans le jeton recu)');
      swap.hidden = true; peindre();
      exige(wsAppels.length === 1, 'S2 la carte Swap FERMEE est repeinte quand meme');
    } catch (e) { exige(false, 'S0 peindreActifs a leve : ' + e.message); }
    try {
      /* un <select> : replaceChildren remet la valeur sur la premiere option, comme le DOM */
      const sel = { dataset: {}, options: [], value: '', replaceChildren(...o) { this.options = o; this.value = o.length ? o[0].value : ''; } };
      Object.defineProperty(sel, 'value', { get() { return this._v; }, set(v) { this._v = this.options.some((o) => o.value === v) ? v : (this.options[0] ? this.options[0].value : ''); }, configurable: true });
      sel.value = '';
      const Option = function (t, v) { this.text = t; this.value = v; };
      const liste = { a: [] };
      const f = new Function('$', 'actifs', 'Option', 'abrege', 'formaterUnites', 'wsPeindreVers', 'DEVISES_BANNIES', ou('function wsPeindreDe(') + '\nreturn (a) => { actifs.length = 0; actifs.push(...a); wsPeindreDe(); };');
      const actifsS = [];
      const peindreDe = f((s) => (s === '#wsDe' ? sel : null), actifsS, Option, (x) => x, (b) => String(b), () => {}, DEVISES_BANNIES);
      const eth = { id: 'ETH', nom: 'ETH', adr: null, etat: 'LU', solde: 1n, decimales: 18 };
      const sndk = { id: SNDK, nom: 'SNDKc', adr: SNDK, etat: 'LU', solde: 3967n, decimales: 6 };
      peindreDe([eth, sndk]);
      sel.value = SNDK; sel.dataset.voulu = SNDK; /* la personne choisit SNDKc (le gestionnaire « change » le retient) */
      peindreDe([eth]); /* la relecture repart de zero : SNDKc pas encore relu */
      peindreDe([eth, sndk]); /* SNDKc relu */
      exige(sel.value === SNDK, 'S3 le « You pay » choisi (SNDKc) est perdu quand la liste se reconstruit : ' + sel.value);
      void liste;
    } catch (e) { exige(false, 'S0 wsPeindreDe a leve : ' + e.message); }
    exige(/\$\('#wsDe'\)\.addEventListener\('change', \(\) => \{ \$\('#wsDe'\)\.dataset\.voulu = \$\('#wsDe'\)\.value;/.test(html), 'S4 le choix « You pay » n est plus retenu au changement');
  }

  /* ── H. le chemin d achat du Market (« Sign the buy ») relit le recu, apres la confirmation, sans rien changer a l envoi ── */
  {
    try {
      const src = ou('async function signerEchange(');
      const vus = [], envois = [];
      const el = () => ({ className: '', textContent: '', innerHTML: '', dataset: { block: SNDK } });
      const els = new Map(); const $ = (s) => { if (!els.has(s)) els.set(s, el()); return els.get(s); };
      const f = new Function('$', 'etape', 'envoyerDepuisWallet', 'window', 'rpc', 'CHAINE', 'compte', 'RESEAUX', 'enTexte', 'aEteDiffusee', 'estRefusWallet',
        'TEXTE_REFUS_WALLET', 'preparerEchange', 'signalerPaye', 'lieuTicketPaye', 'peindreMesAvoirsProfil', 'bcApresConfirme',
        'let echangeEnCours = false, echangeCourant = 1, walletLuA = 5;\n' + src + '\nreturn signerEchange;');
      const H = '0x5ed69934' + '3'.repeat(48) + '0000e86f';
      const signer = f($, () => {}, async (o) => { envois.push(o); return { etat: 'CONFIRME', hash: H }; }, { ethereum: {} }, null, 8453, MOI,
        { 8453: { explorateur: 'https://basescan.org' } }, (x) => String(x), () => false, () => false, '', async () => {}, () => {}, () => {}, async () => {}, (h) => vus.push(h));
      await signer({ to: '0x' + '7'.repeat(40), data: '0xabcd', value: '0x0' }, 'ACHAT', false);
      exige(envois.length === 1 && envois[0].to === '0x' + '7'.repeat(40) && envois[0].data === '0xabcd', 'H0 l envoi du Market a change');
      exige(vus.length === 1 && vus[0] === H, 'H1 « Sign the buy » ne relit pas le recu (jeton recu absent du Wallet pendant le cache serveur) : ' + JSON.stringify(vus));
      vus.length = 0;
      const refus = f($, () => {}, async () => ({ etat: 'REFUSE_PAR_UTILISATEUR' }), { ethereum: {} }, null, 8453, MOI, { 8453: { explorateur: '' } }, (x) => String(x),
        () => false, () => true, 'declined', async () => {}, () => {}, () => {}, async () => {}, (h) => vus.push(h));
      await refus({ to: '0x' + '7'.repeat(40), data: '0x' }, 'ACHAT', false);
      exige(vus.length === 0, 'H2 un achat REFUSE relit le recu');
    } catch (e) { exige(false, 'H0 signerEchange a leve : ' + e.message); }
  }

  /* ── F. Open the Bank sous 761 px ── */
  {
    const src = ou('function bcMontrerSousLaFeuille(') + '\n' + ((/\nconst BC_PLACER_MS = [^\n]*/.exec(html) || [''])[0]);
    const go = /\$\('#tbOuvrirBank'\)\.addEventListener\('click', \(\) => \{([^\n]*)\}\);/.exec(html);
    exige(go && /bcMontrerSousLaFeuille\(\$\('#wBankCarte'\), \$\('#bc-bank'\), \$\('#tbChoix'\)\)/.test(go[1]), 'F1 « Open the Bank » ne place ni la vue Bank ni la carte du Wallet (ni ses choix Borrow / Lend)');
    try {
      const monter = (rect, { large = false, sansRO = false } = {}) => {
        const fiche = { id: 'fiche du block, au-dessus de la vue' };
        const boite = { scrollTop: 0, children: [fiche], getBoundingClientRect: () => ({ top: 250 }) };
        const pop = { open: true, getBoundingClientRect: () => ({ top: 253, bottom: 746 }) };
        const vue = { parentElement: {}, getBoundingClientRect: () => ({ top: 700 - boite.scrollTop }) };
        const r = { ...rect };
        const carte = { parentElement: {}, getBoundingClientRect: () => ({ ...r }) };
        const ancre = { getBoundingClientRect: () => ({ top: r.top + 116, bottom: r.top + 453 }) }; /* #tbChoix mesure : 116 px sous le haut, 337 px */
        const vus = [], minuteries = [], ecoute = new Map(), observes = [];
        let rappel = null, coupe = false;
        const win = { matchMedia: (q) => ({ matches: !large && /max-width:\s*760px/.test(q) }),
          scrollBy: (x, y) => { vus.push(y); r.top -= y; r.bottom -= y; },
          addEventListener: (g, fn) => ecoute.set(g, fn), removeEventListener: (g) => ecoute.delete(g) };
        function RO(fn) { rappel = fn; this.observe = (el) => observes.push(el); this.disconnect = () => { coupe = true; }; }
        const f = new Function('$', 'window', 'setTimeout', 'ResizeObserver', 'setInterval', 'clearInterval', src + '\nreturn bcMontrerSousLaFeuille;');
        const intervalles = [];
        f((s) => (s === '#bcPop' ? pop : s === '#bcPanneau' ? boite : null), win, (fn, ms) => { if (ms === 250) fn(); else minuteries.push([fn, ms]); }, sansRO ? undefined : RO,
          (fn, ms) => { intervalles.push({ fn, ms, actif: true }); return intervalles.length; }, (id) => { if (intervalles[id - 1]) intervalles[id - 1].actif = false; })(carte, vue, ancre);
        minuteries.intervalles = intervalles;
        return { boite, vus, r, rappel: () => rappel && rappel(), grandir: (dy) => { r.top += dy; r.bottom += dy; }, ecoute, minuteries, observes, coupe: () => coupe, pop };
      };
      /* la carte mesuree a 375 px : 581 px de haut, 253 px libres au-dessus de la feuille -> elle ne tient pas : ses CHOIX en haut de l ecran */
      const g = monter({ top: 300, bottom: 881, height: 581 });
      exige(g.boite.scrollTop === 450, 'F2 la vue Bank n est pas amenee en haut du panneau (scrollTop ' + g.boite.scrollTop + ', attendu 450)');
      exige(g.vus.length === 1 && g.vus[0] === 300 + 116 - 8, 'F3 une carte plus haute que la place libre n a pas ses choix Borrow / Lend en haut de l ecran : ' + JSON.stringify(g.vus) + ' (attendu ' + (300 + 116 - 8) + ')');
      /* le contenu au-dessus grandit (actifs, taux) : la carte descend de 32 px -> le placement est REJOUE */
      g.grandir(32); g.rappel();
      exige(g.vus.length === 2 && g.vus[1] === 32 && g.r.top + 116 === 8, 'F5 le placement n est pas rejoue quand le contenu change de taille : ' + JSON.stringify(g.vus) + ' haut des choix ' + (g.r.top + 116));
      exige(g.observes.length >= 2 && g.minuteries.some(([, ms]) => ms > 250), 'F6 rien n observe la carte et son parent, ou aucune fin n est prevue');
      exige(g.observes.some((x) => x && x.id === 'fiche du block, au-dessus de la vue'), 'F6b ce qui est AU-DESSUS de la vue Bank dans le panneau n est pas observe (le panneau a une hauteur fixe : sa taille ne bouge jamais)');
      /* la personne fait defiler : on ne lui reprend plus la page */
      const wh = g.ecoute.get('wheel') || g.ecoute.get('touchstart');
      exige(typeof wh === 'function', 'F7 le geste de la personne n est pas ecoute');
      if (wh) wh();
      g.grandir(40); g.rappel();
      exige(g.vus.length === 2 && g.coupe(), 'F7 apres un geste de la personne, la page est encore deplacee : ' + JSON.stringify(g.vus));
      exige(g.minuteries.intervalles.length === 1 && g.minuteries.intervalles.every((x) => !x.actif), 'F7b apres un geste de la personne, le rejeu periodique tourne encore');
      /* une carte qui TIENT : elle finit au-dessus de la feuille */
      const p = monter({ top: 100, bottom: 330, height: 230 });
      exige(p.vus.length === 1 && p.vus[0] === 330 - 253 + 8, 'F8 une carte qui tient ne finit pas au-dessus de la feuille : ' + JSON.stringify(p.vus) + ' (attendu ' + (330 - 253 + 8) + ')');
      /* feuille fermee : le rejeu s arrete */
      p.pop.open = false; p.grandir(50); p.rappel();
      exige(p.vus.length === 1 && p.coupe(), 'F9 feuille fermee : la page est encore deplacee');
      /* F10. onglet non peint (aucun rappel de ResizeObserver) : les rejeux a heures fixes rattrapent le contenu arrive en retard */
      const n = monter({ top: 300, bottom: 881, height: 581 }, { sansRO: true });
      n.grandir(71);
      const iv = n.minuteries.intervalles.filter((x) => x.actif && x.ms > 0 && x.ms <= 2000);
      for (let k = 0; k < 3; k += 1) for (const x of iv) if (x.actif) x.fn();
      exige(iv.length === 1 && n.vus.length === 2 && n.r.top + 116 === 8, 'F10 sans rappel de ResizeObserver, le contenu arrive en retard laisse les choix deplaces : ' + JSON.stringify(n.vus) + ' haut des choix ' + (n.r.top + 116));
      const l = monter({ top: 300, bottom: 881, height: 581 }, { large: true });
      exige(l.vus.length === 0 && l.boite.scrollTop === 0, 'F4 au-dessus de 760 px (panneau de cote), la page defile quand meme');
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
  ['M3 majWallet ignore les jetons recus', (h) => h.replace('if (compte) for (const adrR of recus) {', 'if (compte) for (const adrR of []) {')],
  ['M4 le block de l index retombe sur « ? »', (h) => h.replace("nom: await nomJetonWallet(c.jeton, c.symbole),", "nom: String(c.symbole || '?').slice(0, 12),")],
  ['M5 la Bank ne relit plus la chaine', (h) => h.replace('try { await bcBanqueRelireSurChaine(); } catch (_) { /* l API seule, comme avant */ }', '')],
  ['M6 la position soldee sur la chaine reste montree', (h) => h.replace('if (v.g === 0n && v.d === 0n && v.pr === 0n) { if (i >= 0) liste.splice(i, 1); continue; }', 'if (v.g === 0n && v.d === 0n && v.pr === 0n) { continue; }')],
  ['M7 le hash de l etape n est plus dit', (h) => h.replace("bcEtape(m, r.hash ? 'Confirmed — ' + String(r.hash).slice(0, 10) + '…' + String(r.hash).slice(-4) + '.' : 'Confirmed.', 'oui');", "bcEtape(m, 'Confirmed.', 'oui');")],
  ['M8 la carte reste sous la feuille', (h) => h.replace('if (Math.abs(d) >= 1) window.scrollBy(0, d);', '')],
  ['M9 Open the Bank ne place plus rien', (h) => h.replace(" bcMontrerSousLaFeuille($('#wBankCarte'), $('#bc-bank'), $('#tbChoix'));", '')],
  ['M22 les choix Borrow / Lend ne sont plus l ancre (le titre de la carte a leur place)', (h) => h.replace('(ancre ? ancre.getBoundingClientRect().top : r.top) - 8', 'r.top - 8')],
  ['M10 un ERC-721 (4 sujets) serait pris pour un solde a relire', (h) => h.replace("l.topics.length === 3 && String(l.topics[2])", "l.topics.length >= 3 && String(l.topics[2])")],
  ['M11 un Transfer vers un AUTRE compte serait relu', (h) => h.replace("String(l.topics[2]).toLowerCase() === pour", "String(l.topics[2]).toLowerCase() !== '0x'")],
  /* les survivants de la revue de cba742b (X1..X8, mutants.mjs), repris ici a l identique */
  ['X1 la carte Swap ouverte n est plus repeinte', (h) => h.replace("try { const w = $('#wSwapCarte'); if (w && !w.hidden) wsPeindreDe(); } catch (_) { /* carte pas encore construite */ }", '')],
  ['X2 le choix « You pay » n est plus garde', (h) => h.replace('avant = s.dataset.voulu || s.value;', 'avant = s.value;')],
  ['X3 une lecture de chaine d un AUTRE compte appliquee', (h) => h.replace('    if (v.de !== c) continue;\n', '')],
  ['X4 la lecture de chaine n expire jamais', (h) => h.replace('if (Date.now() - v.t > BC_CHAINE_VAUT_MS) { sur.delete(id); continue; }', '')],
  ['X5 le symbole n est plus lu ni nettoye', (h) => h.replace("nom = texteAbi(String(await rpc('eth_call', [{ to: a, data: '0x95d89b41' }, 'latest'])));", "nom = 'UNIT';")],
  ['X5b le symbole lu est decode brut (sans nettoyage)', (h) => h.replace("nom = texteAbi(String(await rpc('eth_call', [{ to: a, data: '0x95d89b41' }, 'latest'])));",
    "{ const x = String(await rpc('eth_call', [{ to: a, data: '0x95d89b41' }, 'latest'])).slice(2); const n = parseInt(x.slice(64, 128), 16); nom = Buffer.from(x.slice(128, 128 + n * 2), 'hex').toString('utf8'); }")],
  ['X6 la garde de changement de compte de bcApresConfirme retiree', (h) => h.replace('  if (!compte || String(compte).toLowerCase() !== moi) return;\n  try { await majWallet({ recus }); }', '  try { await majWallet({ recus }); }')],
  ['X7 un solde recu NON lu marque lu', (h) => h.replace("try { Object.assign(a, await lireJeton(aR, compte)); a.etat = 'LU'; } catch { a.etat = 'NON_LU'; }", "try { Object.assign(a, await lireJeton(aR, compte)); } catch { } a.etat = 'LU';")],
  ['X8 la dette arrondie vers le bas', (h) => h.replace('(pb * bA + bS - 1n) / bS', '(pb * bA) / bS')],
  /* les regles de ce commit */
  ['M12 le jeton recu n est plus garde (une seule relecture)', (h) => h.replace('for (const [aR, garde] of gardesRecus()) {', 'for (const [aR, garde] of gardesRecus().filter(([k]) => recus.map((x) => String(x).toLowerCase()).includes(k))) {')],
  ['M13 la reponse du serveur ne libere plus le jeton garde', (h) => h.replace('      walletRecus.delete(adrV); /* le serveur le montre', '      /* le serveur le montre')],
  ['M14 un zero lu longtemps apres le recu reste garde', (h) => h.replace('if (a.etat === \'LU\' && a.solde === 0n && Date.now() - garde.t > WALLET_RECU_ATTENTE_MS) { walletRecus.delete(aR); continue; }', '')],
  ['M15 un zero lu juste apres le recu fait oublier le jeton', (h) => h.replace('a.solde === 0n && Date.now() - garde.t > WALLET_RECU_ATTENTE_MS)', 'a.solde === 0n)')],
  ['M16 un avoir sans symbole retombe sur « ? »', (h) => h.replace('nom: await nomJetonWallet(adrV, v.symbole),', "nom: String(v.symbole || '?').slice(0, 12),")],
  ['M17 « Sign the buy » ne relit plus le recu', (h) => h.replace('  void bcApresConfirme(r.hash);\n}', '}')],
  ['M18 la carte calee par le bas meme quand elle ne tient pas', (h) => h.replace('const d = r.height + 16 <= haut ? r.bottom - haut + 8 : (ancre ? ancre.getBoundingClientRect().top : r.top) - 8;', 'const d = r.bottom - haut + 8;')],
  ['M19 le placement n est plus rejoue', (h) => h.replace('new ResizeObserver(rejouer)', 'new ResizeObserver(() => {})')],
  ['M24 le placement n est plus rejoue a heures fixes (onglet non peint)', (h) => h.replace('tic = setInterval(rejouer, BC_REPLACER_MS);', '')],
  ['M25 l arret ne coupe plus le rejeu periodique', (h) => h.replace('clearInterval(tic);', '')],
  ['M20 le geste de la personne n arrete plus le rejeu', (h) => h.replace("const gestes = ['wheel', 'touchstart', 'pointerdown', 'keydown'];", 'const gestes = [];')],
  ['M23 les enfants du panneau ne sont plus observes', (h) => h.replace('vue, ...(boite && boite.children ? [...boite.children] : [])]', 'vue, vue && vue.parentElement]')],
  ['M21 la feuille fermee n arrete plus le rejeu', (h) => h.replace('if (!fini && !placer()) arreter();', 'if (!fini) placer();')],
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
