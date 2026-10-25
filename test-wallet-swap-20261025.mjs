/* test-wallet-swap-20261025.mjs — LE SWAP DU WALLET REUTILISE LE CHEMIN DU CHAT, OCTET POUR OCTET.
 *
 * Phil, 2026-10-25 : dans l onglet Bridge, la carte « Swap via Bridge » (vendre un block par son propre marche) —
 *   « remove that, and add a Swap button in Wallet next to Send and Paired; clean that up too ».
 *
 * CE QUE CE BANC GARDE :
 *   A. la rangee du Wallet porte Send / Receive / Swap / Paired with, meme classe, et elle passe a 2 colonnes sous 360 px ;
 *   B. le Bridge ne porte plus la vente (ni onglets Fund/Swap, ni carte, ni bouton) ; Fund reste, avec son bouton ;
 *   C. le Swap du Wallet n ecrit AUCUN echange : il ecrit une commande que la barre du Chat accepte, et l analyseur du Chat
 *      (commandes-panel.js) la lit EXACTEMENT comme la meme commande tapee a la main — donc tout ce qui suit (porte du cerveau,
 *      /api/rails/plan, devis, wallet) est le meme code avec la meme entree ;
 *   D. ce code-la (bcSigner, bcModeEnvoi, bcDeuxTrades) est OCTET POUR OCTET celui de la prod d07afc5 (empreintes
 *      sha256, fins de ligne normalisees) ; bcExecuterTexte est epingle sur integ9 (2026-10-25) : diff relu = 3 lignes AJOUTEES,
 *      l action suivante apres « show » et les commandes spin / settle_spin (bcCommandeSpin / bcCommandeSettleSpin -> slotsAgir,
 *      les fonctions de la carte Draws) ; la branche swap est inchangee et D2 la garde ;
 *      bcProposerSwap est epingle sur integ11 (2026-10-25, chantier liquidite relu PASS) : diff relu = AVANT la signature, la ligne
 *      du meilleur lieu de vente (p.vente.texte) ; une vente loin sous la reference (p.vente.loin) n ouvre plus le wallet toute
 *      seule ; le libelle du bouton passe par bcLibelleSigner (« Sell anyway » jamais sur une approbation). signer() inchange ;
 *   E. chaque regle ci-dessus tue son mutant (copies EN MEMOIRE du texte, jamais le fichier).
 *
 * ⚠️ CE QU IL NE PROUVE PAS : qu un echange aboutisse sur la chaine (rien n est signe ici), ni le rendu reel a 375 px (la
 *   regle CSS est lue, la mesure navigateur est a part), ni que /api/rails/plan sache router chaque paire proposee.
 * ⚠️ LES EMPREINTES D (pin) : si bcProposerSwap & co changent EXPRES, ce banc rougit — c est voulu ; on relit le diff, puis
 *   on met a jour les empreintes ET la phrase « octet pour octet » ci-dessus, jamais l un sans l autre.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const { analyserCommande } = await import(pathToFileURL(path.join(ICI, 'commandes-panel.js')).href);
const brut = fs.readFileSync(path.join(ICI, 'app.html'), 'utf8').replace(/\r\n/g, '\n');

const EMPREINTES_PROD_D07AFC5 = {
  /* integ9 2026-10-25 (d07afc5 : 9df99397…d300) : + show -> bcTerminer, + spin / settle_spin, voir l en-tete D */
  'async function bcExecuterTexte(': '13b33a98e03a9419a6bf59bbb77e84159cf04b82c819c25f84a0814c2656a027',
  /* integ11 2026-10-25 (d07afc5 : cd36ee9d…84db) : + ligne de vente avant signature, venteLoin, bcLibelleSigner — voir l en-tete D */
  'async function bcProposerSwap(': 'ef52c7fae386f0dd1b019f951ad44f820c4ace9c329bfe373c8d9fd25e40b5a3',
  'function bcModeEnvoi(': 'b2cbcf62fe2fb7ca3ff4ad4087c0fabf9bd6641502f8e30a5e2e4e7936ce7420',
  'function bcDeuxTrades(': '4680c774049c0119139b1a3ed7a1c7a03d3c196478424df2e4e3fc7d7a8198e9',
  'async function bcSigner(': '989eaf4d831e9d373872191c72b93a0fe7070896f3c59ca0ecc2281a18e0e29e',
};
const BLOCK = '0x' + 'b2'.padEnd(40, '0').slice(0, 38) + 'e7';
const USDC = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913';
const NVDA = '0x' + '1'.repeat(40);

/** Toutes les regles, sur un texte donne : rend la liste des violations (vide = vert). Le MEME code juge la page et les mutants. */
async function verifier(html) {
  const ko = [];
  const exige = (c, m) => { if (!c) ko.push(m); };
  /* fin de fonction de premier niveau : `}` seul en colonne 0 (\r?\n des deux cotes — le texte est deja normalise en LF) */
  const corps = (sig) => { const i = html.indexOf(sig); if (i < 0) return null; const m = /\r?\n\}\r?\n/.exec(html.slice(i)); return m ? html.slice(i, i + m.index + 2) : null; };
  const visible = html.replace(/<!--[\s\S]*?-->/g, ' ');

  /* ── A. la rangee du Wallet ── */
  const rangee = (/<div class="wActions wActions4">([\s\S]*?)<\/div>/.exec(visible) || [])[1] || '';
  const boutons = [...rangee.matchAll(/<button class="([^"]+)" id="([^"]+)"[^>]*>(?:<b>[^<]*<\/b>)?([^<]*)<\/button>/g)].map((m) => [m[2], m[3].trim(), m[1]]);
  exige(JSON.stringify(boutons.map((b) => [b[0], b[1]])) === JSON.stringify([['bSend', 'Send'], ['bReceive', 'Receive'], ['bWalletSwap', 'Swap'], ['bSwap', 'Paired with']]),
    'A1 la rangee du Wallet n est pas Send / Receive / Swap / Paired with : ' + JSON.stringify(boutons));
  exige(boutons.length === 4 && boutons.every((b) => b[2] === 'bouton sec wAct'), 'A2 les quatre boutons n ont pas le meme style (bouton sec wAct)');
  exige(/\.wActions4\{grid-template-columns:repeat\(4,minmax\(0,1fr\)\)\}/.test(html), 'A3 la rangee n a plus 4 colonnes retrecissables');
  exige(/@media \(max-width:360px\)\{\.wActions4\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)\}\}/.test(html), 'A4 la rangee ne passe plus a 2 colonnes sous 360 px');
  exige(/\.wActions4 \.wAct\{min-width:0;/.test(html), 'A5 un bouton peut deborder sa colonne (min-width:0 absent)');
  exige(/id="wSwapCarte" hidden/.test(visible) && /id="wsDe"/.test(visible) && /id="wsVers"/.test(visible) && /id="wsMontant"/.test(visible),
    'A6 la carte du Swap (You pay / Amount / You get) est incomplete');
  exige(/id="wsFrais"[^>]*>Fee: shown in the quote, taken inside the same transaction\.</.test(visible), 'A7 la ligne du frais du Swap a change ou disparu');

  /* ── B. le Bridge ── */
  const d = visible.indexOf('id="v-bridge"'), f = visible.indexOf('</section>', d);
  const bridge = d > 0 && f > d ? visible.slice(d, f) : '';
  exige(bridge.length > 500, 'B0 TEMOIN : section Bridge introuvable');
  exige(!/brSwapCarte|brConfirm|brAmount|brModeSwap|brModeFund|data-brmode|Swap via Bridge|How many blocks to sell/.test(bridge),
    'B1 la vente du Bridge (ou ses onglets) est revenue');
  exige(/id="brFundCarte"/.test(bridge) && /id="brFundWallet"/.test(bridge), 'B2 Fund a disparu du Bridge');

  /* ── C. le gestionnaire du Swap du Wallet, EXECUTE ── */
  const srcCmd = corps('function wsCommande(');
  const cst = (/const WS_SON_MARCHE = '([^']+)';/.exec(html) || [])[1];
  const mGo = /\$\('#wsGo'\)\.addEventListener\('click', async \(\) => \{([\s\S]*?)\n\}\);/.exec(html);
  exige(!!srcCmd && !!cst && !!mGo, 'C0 TEMOIN : wsCommande / WS_SON_MARCHE / gestionnaire #wsGo introuvables');
  if (srcCmd && cst && mGo) {
    const wsCommande = new Function('WS_SON_MARCHE', srcCmd + '\nreturn wsCommande;')(cst);
    const interdit = (nom) => () => { throw new Error('primitive d argent appelee directement par le Wallet : ' + nom); };
    const lancer = async ({ de, vers, n, compte = '0x' + 'a'.repeat(40) }) => {
      const els = { '#wsEtat': { className: '', textContent: '' }, '#wsDe': { value: de }, '#wsVers': { value: vers }, '#wsMontant': { value: n } };
      const appels = [], pops = [];
      const f = new Function('$', 'compte', 'bcOuvrirPop', 'bcExecuterTexte', 'wsCommande',
        'bcProposerSwap', 'planEchange', 'envoyerDepuisWallet', 'envoyerLotAtomique', 'bcSigner', 'fetch',
        'return (async () => {' + mGo[1] + '\n})();');
      await f((s) => els[s], compte, (o) => pops.push(o), async (t, note) => { appels.push([t, note === els['#wsEtat']]); return true; }, wsCommande,
        interdit('bcProposerSwap'), interdit('planEchange'), interdit('envoyerDepuisWallet'), interdit('envoyerLotAtomique'), interdit('bcSigner'), interdit('fetch'));
      return { appels, pops, etat: els['#wsEtat'] };
    };
    /* [ce que le Wallet choisit] -> [ce que la personne taperait dans la barre du Chat pour le meme geste] */
    const CAS = [
      [{ de: 'ETH', vers: 'USDC', n: '0.002' }, 'swap 0.002 ETH to USDC'],
      [{ de: USDC, vers: NVDA, n: '5' }, 'swap 5 ' + USDC + ' to ' + NVDA],
      [{ de: BLOCK, vers: cst, n: '1000' }, 'sell 1000 ' + BLOCK],
      [{ de: BLOCK, vers: 'ETH', n: '0,5' }, 'swap 0,5 ' + BLOCK + ' to ETH'],
    ];
    for (const [choix, tape] of CAS) {
      let r;
      try { r = await lancer(choix); } catch (e) { exige(false, 'C1 ' + JSON.stringify(choix) + ' a leve : ' + e.message); continue; }
      exige(r.appels.length === 1, 'C1 ' + JSON.stringify(choix) + ' : bcExecuterTexte appele ' + r.appels.length + ' fois (attendu 1)');
      if (r.appels.length !== 1) continue;
      const [texte, noteDuWallet] = r.appels[0];
      exige(noteDuWallet, 'C2 le refus ne s ecrit plus dans la note du Wallet (#wsEtat)');
      const a = analyserCommande(texte), b = analyserCommande(tape);
      exige(a.ok && b.ok && JSON.stringify(a) === JSON.stringify(b),
        'C3 « ' + texte + ' » n est pas lu comme « ' + tape + ' » : ' + JSON.stringify(a) + ' vs ' + JSON.stringify(b));
      exige(a.ok && a.commande.type === 'swap', 'C4 la commande ecrite n est pas un echange : ' + JSON.stringify(a));
      exige(r.pops.length === 1 && r.pops[0].vue === 'chat' && r.pops[0].sansBasculer === true, 'C5 le panneau ne s ouvre pas sur son Chat, sur place');
    }
    /* les refus : AUCUNE commande ecrite */
    for (const [choix, raison] of [[{ de: 'ETH', vers: 'USDC', n: '0.1', compte: null }, 'sans wallet'], [{ de: 'ETH', vers: 'USDC', n: 'abc' }, 'montant illisible'],
      [{ de: 'ETH', vers: 'USDC', n: '0' }, 'montant nul'], [{ de: '', vers: 'USDC', n: '1' }, 'rien a payer'], [{ de: 'ETH', vers: '', n: '1' }, 'rien a recevoir']]) {
      let r; try { r = await lancer(choix); } catch (e) { exige(false, 'C6 ' + raison + ' a leve : ' + e.message); continue; }
      exige(r.appels.length === 0 && /wKo/.test(r.etat.className) && r.etat.textContent.length > 5, 'C6 ' + raison + ' : une commande est partie, ou le refus n est pas dit');
    }
  }
  exige(mGo && !/envoyer\w*\(|planEchange\(|\/api\/rails|aSigner|bcProposerSwap\(/.test(mGo[1]), 'C7 le gestionnaire #wsGo contient une primitive d argent');

  /* ── D. le chemin du Chat, octet pour octet celui de la prod d07afc5 ── */
  for (const [sig, h] of Object.entries(EMPREINTES_PROD_D07AFC5)) {
    const c = corps(sig);
    exige(!!c && crypto.createHash('sha256').update(c).digest('hex') === h, 'D ' + sig + ' n est plus octet pour octet celui de d07afc5');
  }
  exige(/if \(c\.type === 'swap'\) \{[\s\S]{0,1600}void bcProposerSwap\('You', '', \{ de, vers, montant: brut\.toString\(\) \}, null\);/.test(corps('async function bcExecuterTexte(') || ''),
    'D2 la commande swap du Chat ne mene plus a bcProposerSwap(\'You\', …)');
  return ko;
}

let n = 0, ko = 0;
const ok = (c, m) => { n += 1; if (c) console.log('ok  ' + m); else { ko += 1; console.log('KO  ' + m); } };

const vraie = await verifier(brut);
ok(vraie.length === 0, 'la page : toutes les regles A-D tiennent' + (vraie.length ? '\n      ' + vraie.join('\n      ') : ''));

/* ── E. MUTANTS : chaque copie EN MEMOIRE doit faire rougir au moins une regle ── */
const remplace = (de, vers) => (h) => { if (!h.includes(de)) throw new Error('cible du mutant absente : ' + de.slice(0, 60)); return h.replace(de, vers); };
const MUTANTS = [
  ['M1 de et vers inverses dans la commande', remplace("'swap ' + n + ' ' + de + ' to ' + vers", "'swap ' + n + ' ' + vers + ' to ' + de")],
  ['M2 la vente par son marche ecrit « buy »', remplace("? 'sell ' + n + ' ' + de", "? 'buy ' + n + ' ' + de")],
  ['M3 le Wallet appelle bcProposerSwap lui-meme', remplace('if (await bcExecuterTexte(wsCommande(de, vers, n), etat)) {', "void bcProposerSwap('You', '', { de, vers, montant: n }, null); if (true) {")],
  ['M4 plus de garde « sans wallet »', remplace("if (!compte) return dire('Connect your wallet first.');", '')],
  /* (ancre UNIQUE : la meme garde existe dans le ticket Trade, plus haut — un mutant qui la frapperait ne muterait pas le Wallet) */
  ['M5 plus de garde de montant', remplace("try again in a moment.');\n  if (!/^\\d+([.,]\\d+)?$/.test(n) || !(Number(n.replace(',', '.')) > 0)) return dire(", "try again in a moment.');\n  if (false) return dire(")],
  ['M6 le bouton Swap retire de la rangee', remplace('<button class="bouton sec wAct" id="bWalletSwap" type="button" aria-controls="wSwapCarte"><b>⇄</b>Swap</button>', '')],
  ['M7 plus de repli a 2 colonnes sous 360 px', remplace('@media (max-width:360px){.wActions4{grid-template-columns:repeat(2,minmax(0,1fr))}}', '')],
  ['M8 la vente revient dans le Bridge', remplace('<div class="carte" id="brFundCarte">', '<div class="carte" id="brSwapCarte" hidden><button id="brConfirm">Sell</button></div><div class="carte" id="brFundCarte">')],
  ['M9 bcProposerSwap modifie (etiquette du paiement)', remplace("bcSigner(m, p.aSigner, 'swap_action')", "bcSigner(m, p.aSigner, 'swap_wallet')")],
  ['M10 le Chat ne mene plus a bcProposerSwap', remplace("void bcProposerSwap('You', '', { de, vers, montant: brut.toString() }, null);", 'void 0;')],
  ['M11 le refus s ecrit dans la note du Chat', remplace('bcExecuterTexte(wsCommande(de, vers, n), etat)', 'bcExecuterTexte(wsCommande(de, vers, n))')],
];
for (const [nom, muter] of MUTANTS) {
  let copie;
  try { copie = muter(brut); } catch (e) { ok(false, nom + ' — ' + e.message); continue; }
  const v = await verifier(copie);
  ok(v.length > 0, nom + ' : tue (' + (v[0] || 'SURVIT').slice(0, 90) + ')');
}

console.log(n + ' assertions, ' + ko + ' KO — ' + MUTANTS.length + ' mutants');
console.log('⚠️ NE PROUVE PAS qu un echange aboutisse (rien n est signe), ni le rendu a 375 px (mesure navigateur a part).');
process.exit(ko ? 1 : 0);
