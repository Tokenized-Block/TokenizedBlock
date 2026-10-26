/* test-eurc-banni-20261026.mjs — EURC EST BANNI (decision de Phil, 2026-10-26 : « banni EURC pour l instant ») ; AUDF le remplace comme
 *   devise pivot a 6 decimales (mesure-stables-fiat-20261026.mjs : le seul stablecoin hors USD/EUR qui passe la regle des actions sur la
 *   factory de notre routeur).
 * CE QUE CE BANC TIENT (hors reseau ; les modules de TB_DIR_TEST, sinon ce dossier) :
 *   A. plan-franchissement.js : EURC n est plus dans POOLS_PIVOTS_AERODROME ni DEVISES_VIA_USDC_AERODROME ; DEVISES_BANNIES le porte, et
 *      phraseDeviseBannie le nomme ; AUDF est une devise pivot (pool et espacement de la mesure).
 *   B. entree-vers-bloc.js : EURC ne paie aucun block (meme un block qui serait cote en EURC) ; « Pay with » (devisesPivotVersBloc) ne
 *      l offre jamais, AUDF oui ; le refus de la route 1 ne cite pas EURC.
 *   C. rails-api.js planRail : EURC en entree OU en sortie (USDC, ETH, UNIT, une action de la table) = REFUSE nomme, rien a signer,
 *      AUCUNE lecture (le refus precede tout appel au noeud).
 *   D. app.html : le Swap du Wallet (« You pay ») n offre pas EURC meme detenu — la VRAIE fonction wsPeindreDe executee dans un `vm` ;
 *      DEVISES_BANNIES est importe par la page (sans l import, wsPeindreDe jetterait une ReferenceError dans le navigateur).
 *   E. l onramp et la verification de paiement n acceptent que ETH et USDC (EURC n y est pas).
 *   M. chaque regle tue son mutant — mutants sur une COPIE du dossier (os.tmpdir), jamais sur les fichiers suivis.
 * Rejouer sur une autre version : TB_DIR_TEST=<dossier> node test-eurc-banni-20261026.mjs (le rouge d avant : `git archive 8b15140`).
 * NE PROUVE PAS : une execution (banc-pivot-audf-unit-fork-20261026.mjs le fait sur fork) ni le rendu navigateur ; Send garde EURC
 *   (ce sont les fonds de la personne) — c est voulu, et dit.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { spawnSync } from 'node:child_process';
import { pathToFileURL, fileURLToPath } from 'node:url';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const EURC = '0x60a3e35cc302bfa44cb288bc5a4f316fdb1adb42';
/* AUDF : la ligne de la mesure (mesures/stables-fiat-20261026.json), relue ici dans le JSON, jamais recopiee de memoire */
const MESURE = JSON.parse(fs.readFileSync(path.join(ICI, 'mesures', 'stables-fiat-20261026.json'), 'utf8'));
const LIGNE_AUDF = MESURE.lignes.find((l) => l.symbole === 'AUDF' && l.verdict === 'PASSE_ROUTEUR');
const COMPTE = '0x00000000000000000000000000000000c0ffee77';

async function verifier(DIR) {
  const ko = [];
  const exige = (c, m) => { if (!c) ko.push(m); };
  const imp = (f) => import(pathToFileURL(path.join(DIR, f)).href + '?v=' + Math.random());
  const PF = await imp('plan-franchissement.js');
  const EV = await imp('entree-vers-bloc.js');
  const R = await imp('rails-api.js');
  const { POOLS_ACTIONS_AERODROME } = await imp('pools-actions-aerodrome.js');
  const { USDC_BASE } = await imp('frais-creation.js');
  const USDC = USDC_BASE.toLowerCase(), ETH = '0x0000000000000000000000000000000000000000';
  const html = fs.readFileSync(path.join(DIR, 'app.html'), 'utf8');
  const UNIT = (html.match(/const UNIT_APP = '(0x[0-9a-f]{40})'/) || [])[1];
  const AMZ = [...POOLS_ACTIONS_AERODROME].find(([, v]) => v.symbole === 'AMZNc')[0];

  /* A */
  exige(![...PF.POOLS_PIVOTS_AERODROME.keys()].some((k) => k.split('|').includes(EURC)), 'A EURC est encore dans POOLS_PIVOTS_AERODROME');
  exige(!PF.DEVISES_VIA_USDC_AERODROME.has(EURC), 'A EURC est encore dans DEVISES_VIA_USDC_AERODROME');
  exige(PF.DEVISES_BANNIES instanceof Map && PF.DEVISES_BANNIES.get(EURC) === 'EURC', 'A DEVISES_BANNIES ne porte pas EURC');
  exige(typeof PF.phraseDeviseBannie === 'function' && /^EURC is not offered for now/.test(String(PF.phraseDeviseBannie(EURC.toUpperCase().replace('0X', '0x')))),
    'A phraseDeviseBannie ne nomme pas EURC (adresse en casse mixte)');
  const kA = [USDC, LIGNE_AUDF.adr].sort().join('|'), tA = PF.POOLS_PIVOTS_AERODROME.get(kA);
  const pA = LIGNE_AUDF.venues['aero-old'];
  exige(!!tA && tA.symbole === 'USDC/AUDF' && tA.pool === pA.pool && tA.tickSpacing === pA.tickSpacing && PF.DEVISES_VIA_USDC_AERODROME.has(LIGNE_AUDF.adr),
    'A AUDF n est pas la devise pivot de la mesure (pool ' + pA.pool + ', ts ' + pA.tickSpacing + ')');
  /* B */
  for (const q of [ETH, USDC, EURC]) exige(EV.entreeVersBloc({ de: EURC, quote: q }) === 'REFUS', 'B EURC paie un block cote en ' + q.slice(0, 8) + ' : ' + EV.entreeVersBloc({ de: EURC, quote: q }));
  exige(EV.entreeVersBloc({ de: USDC, quote: EURC }) === 'REFUS', 'B USDC paie un block cote en EURC');
  for (const q of [ETH, USDC]) {
    const l = EV.devisesPivotVersBloc(q);
    exige(!l.some((p) => p.adr === EURC || p.symbole === 'EURC'), 'B « Pay with » offre EURC pour un block cote en ' + q.slice(0, 8));
    exige(l.some((p) => p.adr === LIGNE_AUDF.adr && p.symbole === 'AUDF'), 'B « Pay with » n offre pas AUDF pour un block cote en ' + q.slice(0, 8));
    exige(EV.entreeVersBloc({ de: LIGNE_AUDF.adr, quote: q }) === 'PIVOT_AERODROME', 'B AUDF ne paie pas un block cote en ' + q.slice(0, 8));
    const ph = R.phraseRefusEntreeBloc(q);
    exige(!/EURC/.test(ph) && /AUDF/.test(ph), 'B le refus de la route 1 : « ' + ph + ' »');
  }
  /* C */
  for (const [de, vers] of [[EURC, USDC], [USDC, EURC], [EURC, 'ETH'], ['ETH', EURC], [EURC, UNIT], [UNIT, EURC], [EURC, AMZ], [AMZ, EURC], [EURC.toUpperCase().replace('0X', '0x'), UNIT]]) {
    let lu = 0;
    const rpc = async (m) => { lu += 1; return m === 'eth_blockNumber' ? '0x1' : '0x' + '0'.repeat(64 * 8); };
    const r = await R.planRail({ de, vers, montant: '5000000', compte: COMPTE }, { rpc, clesDe: async () => { lu += 1; return []; } });
    exige(r.etat === 'REFUSE' && /EURC is not offered for now/.test(String(r.pourquoi)) && r.aSigner.length === 0 && lu === 0,
      'C ' + String(de).slice(0, 8) + ' > ' + String(vers).slice(0, 8) + ' : ' + r.etat + ' — ' + r.pourquoi + ' (' + lu + ' lectures, ' + r.aSigner.length + ' a signer)');
  }
  /* D */
  exige(/import \{[^}]*\bDEVISES_BANNIES\b[^}]*\} from '\.\/plan-franchissement\.js';/.test(html), 'D app.html n importe pas DEVISES_BANNIES de plan-franchissement.js');
  const i = html.indexOf('function wsPeindreDe() {');
  const fin = i < 0 ? null : /\r?\n\}\r?\n/.exec(html.slice(i));
  exige(i >= 0 && !!fin, 'D wsPeindreDe introuvable dans app.html');
  if (i >= 0 && fin) {
    const corps = html.slice(i, i + fin.index + fin[0].length);
    const sel = (v = '') => ({ dataset: {}, value: v, options: [], replaceChildren(...o) { this.options = o; this.value = o[0] ? o[0].value : ''; } });
    const els = { '#wsDe': sel() };
    const ctx = {
      $: (q) => els[q], abrege: (x) => x, formaterUnites: () => '1', wsPeindreVers: () => {}, DEVISES_BANNIES: PF.DEVISES_BANNIES,
      Option: class { constructor(t, v) { this.text = t; this.value = v; } },
      actifs: [
        { id: 'ETH', nom: 'ETH', adr: null, etat: 'LU', solde: 1n, decimales: 18 },
        { id: USDC, nom: 'USDC', adr: USDC, etat: 'LU', solde: 5000000n, decimales: 6 },
        { id: EURC, nom: 'EURC', adr: EURC, etat: 'LU', solde: 5000000n, decimales: 6 },
        { id: LIGNE_AUDF.adr, nom: 'AUDF', adr: LIGNE_AUDF.adr, etat: 'LU', solde: 5000000n, decimales: 6 },
      ],
    };
    try {
      vm.runInNewContext(corps + '\nwsPeindreDe();', ctx);
      const vals = els['#wsDe'].options.map((o) => o.value);
      exige(!vals.includes(EURC) && vals.includes(USDC) && vals.includes('ETH'), 'D « You pay » du Wallet : ' + JSON.stringify(vals));
    } catch (e) { exige(false, 'D wsPeindreDe a jete : ' + String(e.message).slice(0, 120)); }
  }
  /* E */
  const { ACTIFS_ONRAMP } = await imp('onramp-session.js');
  const { ACTIFS_PAIEMENT } = await imp('verif-paiement.js');
  exige(JSON.stringify([...ACTIFS_ONRAMP]) === '["ETH","USDC"]' && JSON.stringify([...ACTIFS_PAIEMENT]) === '["ETH","USDC"]', 'E onramp / paiement : ' + ACTIFS_ONRAMP + ' / ' + ACTIFS_PAIEMENT);
  return ko;
}

if (process.env.TB_DIR_TEST) {
  const ko = await verifier(process.env.TB_DIR_TEST);
  for (const k of ko) console.log('KO  ' + k);
  console.log(ko.length ? 'ROUGE : ' + ko.length + ' regle(s)' : 'VERT');
  process.exit(ko.length ? 1 : 0);
}

let echecs = 0;
const ko0 = await verifier(ICI);
for (const k of ko0) console.log('KO  ' + k);
if (ko0.length) echecs += 1; else console.log('ok  A-E sur ce dossier : EURC banni partout, AUDF devise pivot, 0 lecture avant le refus');

/* ── M. les mutants, sur une COPIE ── */
const COPIE = fs.mkdtempSync(path.join(os.tmpdir(), 'eurc-banni-'));
const suivis = fs.readdirSync(ICI).filter((f) => /\.js$/.test(f) || f === 'app.html');
for (const f of suivis) fs.copyFileSync(path.join(ICI, f), path.join(COPIE, f));
fs.mkdirSync(path.join(COPIE, 'mesures'));
fs.copyFileSync(path.join(ICI, 'mesures', 'stables-fiat-20261026.json'), path.join(COPIE, 'mesures', 'stables-fiat-20261026.json'));
/* ⛔ motifs en \r?\n : la copie garde la fin de ligne du checkout (test-tests-portables) */
const MUTANTS = [
  ['le refus nomme du serveur retire', 'rails-api.js', (s) => s.replace(/\{ const ban = phraseDeviseBannie\(de\) \|\| phraseDeviseBannie\(vers\);[^\r\n]*/, '')],
  ['EURC remis dans la table pivot', 'plan-franchissement.js', (s) => s.replace("  [[bas(USDC_BASE), '0xd2a5", "  [[bas(USDC_BASE), '" + EURC + "'].sort().join('|'), { symbole: 'USDC/EURC', pool: '0xf39b7c34be147f5dc1bc374f27af2e9f03ad3113', tickSpacing: 1, usdcMesure: 1 }], [[bas(USDC_BASE), '0xd2a5")],
  ['DEVISES_BANNIES vide', 'plan-franchissement.js', (s) => s.replace("['" + EURC + "', 'EURC'],", '')],
  ['garde de entreeVersBloc retiree', 'entree-vers-bloc.js', (s) => s.replace("if (DEVISES_BANNIES.has(d) || DEVISES_BANNIES.has(q)) return 'REFUS';", '')],
  ['filtre du Swap du Wallet retire', 'app.html', (s) => s.replace(/\r?\n {4}&& !DEVISES_BANNIES\.has\(String\(a\.adr \|\| ''\)\.toLowerCase\(\)\)\);/, ');')],
  ['import de DEVISES_BANNIES retire de la page', 'app.html', (s) => s.replace("import { planFranchissement, DEVISES_BANNIES } from './plan-franchissement.js';", "import { planFranchissement } from './plan-franchissement.js';")],
  ['AUDF retire de la table pivot', 'plan-franchissement.js', (s) => s.replace(/ {2}\[\[bas\(USDC_BASE\), '0xd2a5[^\r\n]*/, '')],
];
for (const [nom, f, muter] of MUTANTS) {
  const orig = fs.readFileSync(path.join(COPIE, f), 'utf8');
  const m = muter(orig);
  if (m === orig) { console.log('KO  mutant « ' + nom + ' » : le motif ne s applique plus (le mutant ne mute rien)'); echecs += 1; continue; }
  fs.writeFileSync(path.join(COPIE, f), m);
  const r = spawnSync(process.execPath, [fileURLToPath(import.meta.url)], { env: { ...process.env, TB_DIR_TEST: COPIE }, encoding: 'utf8', timeout: 120000 });
  fs.writeFileSync(path.join(COPIE, f), orig);
  const tue = r.status === 1 && /ROUGE/.test(r.stdout);
  const premier = (r.stdout.split('\n').find((l) => l.startsWith('KO')) || r.stderr.split('\n')[0] || '').slice(0, 160);
  console.log((tue ? 'ok  mutant « ' + nom + ' » TUE — ' : 'KO  mutant « ' + nom + ' » SURVIT — ') + premier);
  if (!tue) echecs += 1;
}
fs.rmSync(COPIE, { recursive: true, force: true });
console.log(echecs ? 'ROUGE : ' + echecs : 'VERT : A-E + ' + MUTANTS.length + ' mutants tues');
process.exit(echecs ? 1 : 0);
