/* test-faits-echeance-20261004.mjs — « Checking that stock on chain… » NE RESTE PLUS A L ECRAN SANS LIMITE.
 *
 * LE CONSTAT (QA wallet reel de Grok, 2026-10-04, P1) : « CAKEc reste sur Checking that stock on chain… ». `majPaire`
 *   (app.html) attend `faitsDuBlock` (faits.js) : six lectures a la suite, sans echeance d ensemble. Le `fetch` de l app est
 *   borne a 8 s par tentative depuis le meme jour, mais rien ne bornait la SOMME.
 * CE QUI EST GARDE ICI :
 *   A. faits.js : avec `delaiMax`, un noeud muet rend la main a l echeance ; ce qui n est pas lu est NOMME (jamais invente) ;
 *      passe l echeance on n envoie plus rien et on ne « respire » plus ; sans `delaiMax`, rien ne change.
 *   B. app.html : `majPaire` demande 15 s ; les phrases « non lu » existent et ne sont pas celles du refus.
 *   C. COMPORTEMENT : le vrai texte de `majPaire`, execute dans un bac a sable avec le VRAI `faitsDuBlock` et un noeud muet.
 *   D. MUTANTS.
 * ⛔ BORNES — ce que ce fichier NE prouve PAS :
 *   · aucun noeud reel n est interroge : la duree d une lecture sous 429 / 403 n est PAS mesuree ici, et « 15 s » (le chiffre
 *     du constat) n a ete compare a aucune mesure ;
 *   · la lecture abandonnee n est pas annulee (faits.js ne tient pas le `fetch`) : elle finit ou expire de son cote ;
 *   · apres un « non lu », l ecran ne RELANCE pas seul : il faut re-choisir la paire. Ce correctif borne l attente, c est tout. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { pathToFileURL, fileURLToPath } from 'node:url';
const ICI = path.dirname(fileURLToPath(import.meta.url));
const imp = (f, dir = ICI) => import(pathToFileURL(path.join(dir, f)).href + '?v=' + Math.random());
let n = 0, ko = 0;
const ok = (c, m, vu) => { n += 1; if (c) console.log('ok  ' + m); else { ko += 1; console.log('KO  ' + m + (vu === undefined ? '' : '   vu: ' + String(vu).slice(0, 260))); } };
const lire = (f) => fs.readFileSync(path.join(ICI, f), 'utf8').replace(/\r\n/g, '\n');
/** Le chien de garde du BANC : une promesse qui ne revient pas rend 'PENDU' au lieu de figer le test. */
const avecGarde = (p, ms) => { let t; return Promise.race([p, new Promise((r) => { t = setTimeout(() => r('PENDU'), ms); })]).finally(() => clearTimeout(t)); };
const chrono = async (f) => { const t0 = Date.now(); const r = await f(); return { r, ms: Date.now() - t0 }; };

const Faits = await imp('faits.js');
const P = await imp('paires.js');
const ADR = '0xb2' + '0'.repeat(37) + '1';
const mot = (v) => '0x' + BigInt(v).toString(16).padStart(64, '0');
const JAMAIS = () => new Promise(() => {});
/** Un faux noeud : `muetApres` = nombre de lectures servies avant de ne plus jamais repondre ; `lent` = ms par lecture. */
function noeud({ muetApres = Infinity, lent = 0 } = {}) {
  const appels = [];
  const rpc = async (m, p) => {
    appels.push(m + (p && p[0] && p[0].data ? ':' + String(p[0].data).slice(0, 10) : ''));
    if (appels.length > muetApres) return JAMAIS();
    if (lent) await new Promise((r) => setTimeout(r, lent));
    if (m === 'eth_getCode') return '0xef';
    const data = String((p && p[0] && p[0].data) || '');
    if (data.startsWith('0x313ce567')) return mot(8);              /* decimals() */
    if (data.startsWith('0x18160ddd')) return mot(4114810000n);    /* totalSupply() */
    return mot(0);
  };
  return { rpc, appels };
}

console.log('— A. faits.js : une echeance pour l ensemble des lectures');
/* les juges du module : vrai / faux sur un module donne — ils servent au vert ET aux mutants */
const jugesMod = {
  async muetRendLaMain(F) {
    const nd = noeud({ muetApres: 0 });
    const { r, ms } = await chrono(() => avecGarde(F.faitsDuBlock({ rpc: nd.rpc, jeton: ADR, delaiMax: 120 }), 2500));
    return r !== 'PENDU' && ms >= 100 && ms < 1500 && r.estB20 === null && r.code === null && r.supply === null && r.decimales === null
      && r.mintFerme === null && ['code', 'symbol', 'name', 'decimals', 'totalSupply', 'supplyCap'].every((x) => r.manques.includes(x));
  },
  async plusRienApresLEcheance(F) {
    const nd = noeud({ muetApres: 1 });
    const r = await avecGarde(F.faitsDuBlock({ rpc: nd.rpc, jeton: ADR, delaiMax: 120 }), 2500);
    /* le code est lu ; `symbol()` part et reste sans reponse jusqu a l echeance ; les quatre lectures suivantes ne partent PAS */
    return r !== 'PENDU' && r.estB20 === true && r.supply === null && nd.appels.length === 2 && !r.manques.includes('code')
      && ['symbol', 'name', 'decimals', 'totalSupply', 'supplyCap'].every((x) => r.manques.includes(x));
  },
  async onNeRespirePlusApres(F) {
    const nd = noeud({ muetApres: 0 });
    const { r, ms } = await chrono(() => avecGarde(F.faitsDuBlock({ rpc: nd.rpc, jeton: ADR, pause: 300, delaiMax: 120 }), 4000));
    /* avec les cinq pauses de 300 ms attendues APRES l echeance, la reponse arriverait a ~1,6 s */
    return r !== 'PENDU' && ms < 900;
  },
  async noeudSainPasCoupe(F) {
    const nd = noeud({ lent: 15 });
    const r = await avecGarde(F.faitsDuBlock({ rpc: nd.rpc, jeton: ADR, pause: 5, delaiMax: 5000 }), 6000);
    return r !== 'PENDU' && r.estB20 === true && r.supply === 4114810000n && r.decimales === 8 && nd.appels.length === 6
      && !r.manques.includes('totalSupply') && !r.manques.includes('decimals') && !r.manques.includes('code');
  },
  async sansDelaiRienNeChange(F) {
    const sain = noeud(), muet = noeud({ muetApres: 0 });
    const r = await avecGarde(F.faitsDuBlock({ rpc: sain.rpc, jeton: ADR }), 2500);
    /* ⛔ le defaut reste « aucune echeance » : un appelant qui ne demande rien attend comme avant (c est le defaut d origine,
     *   garde ici pour que personne ne change le comportement des QUATRE autres appelants sans le decider) */
    const pendu = await avecGarde(F.faitsDuBlock({ rpc: muet.rpc, jeton: ADR }), 400);
    return r !== 'PENDU' && r.estB20 === true && r.supply === 4114810000n && sain.appels.length === 6 && pendu === 'PENDU';
  },
};
const LIB_MOD = {
  muetRendLaMain: 'A un noeud MUET rend la main a l echeance : rien d invente, `estB20` null, les six lectures nommees dans `manques`',
  plusRienApresLEcheance: 'A le code lu puis un noeud muet : `estB20` vrai, supply NON LUE (null, pas 0), et plus aucune lecture envoyee apres l echeance (2 appels)',
  onNeRespirePlusApres: 'A passe l echeance, les pauses entre lectures ne sont plus attendues',
  noeudSainPasCoupe: 'A un noeud qui repond (15 ms par lecture) n est pas coupe : les six lectures aboutissent',
  sansDelaiRienNeChange: 'A sans `delaiMax` : memes lectures qu avant, et aucune echeance (le defaut des autres appelants est intact)',
};
for (const k of Object.keys(jugesMod)) {
  let v; try { v = await jugesMod[k](Faits); } catch (err) { v = 'a jete : ' + (err && err.message); }
  ok(v === true, LIB_MOD[k], v);
}

console.log('— B. le cablage dans app.html');
const HTML = lire('app.html');
function extraire(src, entete) {
  const i = src.indexOf(entete);
  if (i < 0) return null;
  const m = /\n\}\n/.exec(src.slice(i));
  return m ? src.slice(i, i + m.index + 2) : null;
}
const srcMaj = extraire(HTML, 'async function majPaire() {');
ok(!!srcMaj && /majFraisEtRecap\(\);\n\}$/.test(srcMaj), 'B TEMOIN `majPaire` est extraite jusqu a sa derniere ligne');
ok((srcMaj.match(/faitsDuBlock\(/g) || []).length === 1
  && /try \{ f = await faitsDuBlock\(\{ rpc, jeton: q\.paire\.adr, pause: 200, delaiMax: 15000 \}\); \} catch \(e\) \{ f = null; \}/.test(srcMaj),
'B `majPaire` lit les faits de la paire UNE fois, avec une echeance de 15 s');
ok(/'We could not check that stock yet — the node did not answer\. Pairing stays closed until it does\.'/.test(srcMaj)
  && /'We could not read how many units exist yet — the node did not answer\. Pairing stays closed until it does\.'/.test(srcMaj)
  && /'That stock is not a native block on chain, so it cannot be paired here\. Pick another one\.'/.test(srcMaj),
'B trois phrases distinctes : « ce n en est pas un », « pas pu verifier », « supply non lue »');

console.log('— C. comportement : le vrai `majPaire` + le vrai `faitsDuBlock`, noeud muet, dans un bac a sable');
const NVDA = P.pairesProposees(8453).find((p) => p.symbole === 'NVDAc');
ok(!!NVDA && /^0x[0-9a-fA-F]{40}$/.test(NVDA.adr), 'C TEMOIN l action d essai (NVDAc) est lue dans le registre du depot');
/** Joue `majPaire` sur une action du registre. `delai` remplace les 15 s dans le TEXTE extrait, pour que le banc dure < 1 s. */
async function jouerPaire(html, F, { rpc, delai = 150, garde = 3000 }) {
  const src = extraire(html, 'async function majPaire() {');
  const court = src.split('delaiMax: 15000').join('delaiMax: ' + delai);
  const el = (v = '') => ({ value: v, hidden: false, className: '', textContent: '', disabled: false, title: '' });
  const dom = { '#cPaire': el(NVDA.adr), '#cPaireAutre': el(''), '#cPaireAutreRang': el(), '#cPaireNote': el(), '#cPaireChip': el() };
  const relances = [];
  const ctx = vm.createContext({
    $: (q) => dom[q] || el(), CHAINE: 8453, AUTRE_PAIRE: '__autre__', majPaireSeq: 0, paireChoisie: null, motifRefusPaire: null,
    /* 2026-10-09 : les relances programmees sont NOTEES, jamais executees (le banc juge la decision, pas un minuteur) */
    majPaireRelances: null, setTimeout: (f, ms) => { relances.push(ms); return 0; },
    String, Number, Boolean, Promise,
    qualifierPaire: P.qualifierPaire, refusPrixNouveauBlock: P.refusPrixNouveauBlock, libellePuceCreation: P.libellePuceCreation,
    hookDeLancementPour: P.hookDeLancementPour, OPTIONS_LANCEMENT: { v9: false }, paireVa7030: () => false,
    transactionsDepuisEth: () => ({ tx: 2, chemin: [], directe: false }), prixUsdDevise: async () => null,
    deviseDeSecoursPour: () => null, symbolesLancables: () => [],
    faitsDuBlock: (o) => F.faitsDuBlock(o), rpc,
    majResumePaire() {}, majFraisEtRecap() {}, peindrePaireChips() {}, majFundWalletPourPaire() {},
  });
  vm.runInContext(court, ctx);
  const t0 = Date.now();
  const p = vm.runInContext('majPaire()', ctx);
  const pendant = dom['#cPaireNote'].textContent;      /* ce que l ecran dit PENDANT la lecture (avant tout `await` resolu) */
  const fin = await avecGarde(p, garde);
  return { pendu: fin === 'PENDU', ms: Date.now() - t0, pendant, note: dom['#cPaireNote'].textContent, classe: dom['#cPaireNote'].className,
    paire: vm.runInContext('paireChoisie', ctx), remplace: court !== src, relances };
}
const jugesApp = {
  async muetDitNonLu(html, F) {
    const r = await jouerPaire(html, F, { rpc: noeud({ muetApres: 0 }).rpc });
    return r.remplace && !r.pendu && r.ms < 1500 && /^Checking that stock on chain/.test(r.pendant) && r.paire === null && r.classe === 'note wKo'
      && r.note === 'We could not check that stock yet — the node did not answer. Pairing stays closed until it does. Checking again in 10 s.';
  },
  /* 2026-10-09 (decision deleguee) : une lecture NON LUE programme UNE relance a 10 s ; un refus definitif n en programme aucune */
  async muetRelance(html, F) {
    const r = await jouerPaire(html, F, { rpc: noeud({ muetApres: 0 }).rpc });
    return r.relances.length === 1 && r.relances[0] === 10000 && r.paire === null;
  },
  async codeLuPuisMuet(html, F) {
    const r = await jouerPaire(html, F, { rpc: noeud({ muetApres: 1 }).rpc });
    return !r.pendu && r.paire === null
      && r.note === 'We could not read how many units exist yet — the node did not answer. Pairing stays closed until it does.';
  },
  async sainEstAccepte(html, F) {
    const r = await jouerPaire(html, F, { rpc: noeud({ lent: 5 }).rpc, delai: 4000, garde: 6000 });
    return !r.pendu && !!r.paire && r.paire.type === 'ACTION' && r.paire.supply === 4114810000n && r.classe === 'note';
  },
};
const LIB_APP = {
  muetDitNonLu: 'C noeud muet : « Checking that stock… » pendant la lecture, puis « We could not check that stock yet… » a l echeance — aucune paire acceptee',
  codeLuPuisMuet: 'C code lu puis noeud muet : « We could not read how many units exist yet… » (non lu), jamais « no units in circulation » (zero)',
  sainEstAccepte: 'C TEMOIN noeud sain : la paire est acceptee avec sa supply — l echeance ne refuse pas une lecture qui aboutit',
  muetRelance: 'C (2026-10-09) une verification NON LUE programme une relance a 10 s, la paire restant fermee',
};
for (const k of Object.keys(jugesApp)) {
  let v; try { v = await jugesApp[k](HTML, Faits); } catch (err) { v = 'a jete : ' + (err && err.message); }
  ok(v === true, LIB_APP[k], v);
}

console.log('— D. mutants');
const tueMod = async (k, F) => { try { return (await jugesMod[k](F)) !== true; } catch (_) { return true; } };
const tueApp = async (k, html, F) => { try { return (await jugesApp[k](html, F)) !== true; } catch (_) { return true; } };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tb-echeance-'));
const srcFaits = lire('faits.js');
const copie = () => { const dir = fs.mkdtempSync(path.join(tmp, 'm-')); for (const f of fs.readdirSync(ICI)) if (/\.js$/.test(f) && !/^(serveur-web|vendor|mcp-ext-apps)/.test(f)) fs.copyFileSync(path.join(ICI, f), path.join(dir, f)); return dir; };
const faitsMute = async (de, vers) => {
  if (srcFaits.split(de).length !== 2) return null;
  const dir = copie();
  fs.writeFileSync(path.join(dir, 'faits.js'), srcFaits.replace(de, vers));
  return imp('faits.js', dir);
};
{
  const Fm = await faitsMute('if (echeance === null) return rpc(methode, params);', 'return rpc(methode, params);');
  ok(Fm !== null && await tueMod('muetRendLaMain', Fm) && await tueApp('muetDitNonLu', HTML, Fm) && !(await tueMod('noeudSainPasCoupe', Fm)),
    'D mutant « plus d echeance dans faits.js » : ROUGE (le module ET l ecran restent pendus) — un noeud sain, lui, ne voit rien');
}
{
  const Fm = await faitsMute("if (reste <= 0) return Promise.reject(new Error('read timed out'));", 'if (reste <= 0) return rpc(methode, params);');
  ok(Fm !== null && await tueMod('plusRienApresLEcheance', Fm), 'D mutant « les lectures partent encore apres l echeance » : ROUGE');
}
{
  const Fm = await faitsMute('? () => (echeance !== null && Date.now() >= echeance ? Promise.resolve() : new Promise((r) => setTimeout(r, pause)))', '? () => new Promise((r) => setTimeout(r, pause))');
  ok(Fm !== null && await tueMod('onNeRespirePlusApres', Fm) && !(await tueMod('muetRendLaMain', Fm)), 'D mutant « les pauses sont encore attendues apres l echeance » : ROUGE');
}
{
  const m = HTML.split(', pause: 200, delaiMax: 15000 })').length === 2 ? HTML.replace(', pause: 200, delaiMax: 15000 })', ', pause: 200 })') : null;
  /* sans `delaiMax` dans l appel, le remplacement du banc ne trouve rien et la lecture n a plus d echeance : l ecran reste pendu */
  const r = m && await jouerPaire(m, Faits, { rpc: noeud({ muetApres: 0 }).rpc, garde: 700 });
  ok(m !== null && r.pendu === true && r.remplace === false && /^Checking that stock on chain/.test(r.note),
    'D mutant « majPaire ne demande plus d echeance » : ROUGE (l ecran reste sur « Checking that stock on chain… »)');
}
fs.rmSync(tmp, { recursive: true, force: true });

console.log('\n' + (n - ko) + ' ok / ' + ko + ' KO (' + n + ' assertions)');
console.log('⚠️ NE PROUVE PAS la duree d une lecture sur un vrai noeud limite, ni que 15 s est le bon chiffre ; la relance (10/20/30 s) est jugee sur sa PROGRAMMATION, pas executee.');
if (n !== 17) { console.log('KO  compte d assertions inattendu : ' + n + ' (attendu 17) — un cas a ete retire ou ajoute sans le dire'); process.exit(1); }
process.exit(ko ? 1 : 0);
