/* test-dex-embed-etat-20261010.mjs — LA FENETRE DEXSCREENER D UN PROFIL EST REGARDEE AVANT D ETRE CHARGEE.
 *
 * Capture de Phil (2026-10-10) : le cadre « Live pair window on DexScreener » affichait « 503 Service Unavailable — No server is
 *   available to handle this request », la page d erreur BRUTE de leur repartiteur de charge. MESURE (10:27 UTC, embed de DJTc) :
 *   1er essai delai depasse (30 s), puis 200 deux fois — panne passagere chez DexScreener.
 * Ce banc EXECUTE etatEmbedDex (serveur-web.js, de `const ID_PAIRE_DEX` a `function traiterRequete`) contre un faux fetch :
 *   E  etats : 2xx -> OK ; 5xx -> EN_PANNE ; delai -> EN_PANNE ; 403 / 3xx / 4xx / reseau -> INCONNU (l iframe comme avant) ;
 *   S  anti-SSRF : seule https://dexscreener.com/base/<id>?embed=1, redirect manual, corps annule ; l id est filtre par la route ;
 *   C  cache 60 s, une lecture en vol par paire, au plus 30 verifications par minute (au-dela : INCONNU sans requete) ;
 *   A  app.html : l iframe n est plus chargee directement ; la carte « en panne » est masquee au depart, remise a zero d un block a
 *      l autre, et garde « Load the chart anyway ».
 *   Puis chaque MUTANT doit rougir (temoin : le code livre est vert).
 * ⛔ BORNE : ni DexScreener ni un navigateur ne sont exerces ici (le rendu se verifie a l ecran apres deploiement).
 * ⛔ PORTABLE LF/CRLF : motifs sur une ligne. */
import { readFileSync } from 'node:fs';

const SRV = readFileSync(new URL('./serveur-web.js', import.meta.url), 'utf8');
const APP = readFileSync(new URL('./app.html', import.meta.url), 'utf8');
const ID40 = '0xa606a9db777ec40ae05a6c5dfffa8dde7fa89249';
const ID64 = '0x08357c323c3b3f635c16df4a9f850e4582e0470fca4d59a8f563116e8ecd27f0';

function monter(source, reponse) {
  const i = source.indexOf('const ID_PAIRE_DEX'), f = source.indexOf('function traiterRequete', i);
  if (!(i > 0 && f > i)) throw new Error('bloc etatEmbedDex introuvable');
  const appels = [];
  const fauxFetch = async (url, opts) => {
    appels.push({ url, opts });
    const r = await reponse(url, opts, appels.length);
    return { status: r, body: { cancel: async () => { appels[appels.length - 1].annule = true; } } };
  };
  const M = new Function('fetch', 'AbortSignal', source.slice(i, f) + '\n; return { etatEmbedDex, ID_PAIRE_DEX, embedDexCache };')(fauxFetch, { timeout: (ms) => ({ ms }) });
  return { ...M, appels };
}
const delai = () => { const e = new Error('The operation was aborted due to timeout'); e.name = 'TimeoutError'; throw e; };
const reseau = () => { throw new TypeError('fetch failed'); };

async function suite(src, app) {
  const res = [];
  const cas = async (id, f) => { try { await f(); res.push({ id, ok: true }); } catch (e) { res.push({ id, ok: false, err: String(e && e.message || e).slice(0, 200) }); } };
  const eq = (a, b, m) => { if (a !== b) throw new Error(m + ' : ' + JSON.stringify(a) + ' au lieu de ' + JSON.stringify(b)); };

  for (const [s, attendu] of [[200, 'OK'], [204, 'OK'], [503, 'EN_PANNE'], [502, 'EN_PANNE'], [500, 'EN_PANNE'], [403, 'INCONNU'], [404, 'INCONNU'], [301, 'INCONNU'], [302, 'INCONNU']]) {
    await cas('E ' + s + ' -> ' + attendu, async () => { const m = monter(src, () => s); const r = await m.etatEmbedDex(ID40); eq(r.etat, attendu, 'etat'); eq(r.status, s, 'status'); eq(r.ok, true, 'ok'); });
  }
  await cas('E delai depasse -> EN_PANNE (dit « no answer »)', async () => { const m = monter(src, delai); const r = await m.etatEmbedDex(ID40); eq(r.etat, 'EN_PANNE', 'etat'); if (!/no answer/.test(r.pourquoi)) throw new Error('raison : ' + r.pourquoi); });
  await cas('E reseau coupe cote serveur -> INCONNU (l iframe comme avant)', async () => { const m = monter(src, reseau); const r = await m.etatEmbedDex(ID40); eq(r.etat, 'INCONNU', 'etat'); });

  await cas('S une seule URL : dexscreener.com/base/<id>?embed=1, redirect manual, corps annule', async () => {
    const m = monter(src, () => 200); await m.etatEmbedDex(ID64);
    eq(m.appels.length, 1, 'appels'); eq(m.appels[0].url, 'https://dexscreener.com/base/' + ID64 + '?embed=1', 'url');
    eq(m.appels[0].opts.redirect, 'manual', 'redirect'); eq(m.appels[0].annule, true, 'corps annule');
  });
  await cas('S filtre d id : 40 ou 64 hexa minuscules seulement', async () => {
    const m = monter(src, () => 200);
    for (const ok of [ID40, ID64]) if (!m.ID_PAIRE_DEX.test(ok)) throw new Error('refuse ' + ok);
    for (const ko of ['', '0x', ID40 + 'a', ID40.slice(0, -1), ID40 + '/../x', ID40 + '?a=b', 'https://evil.example/', '0x' + 'g'.repeat(40), ID40.toUpperCase().replace('0X', '0x') + 'z', ID64 + '00'])
      if (m.ID_PAIRE_DEX.test(ko)) throw new Error('admet ' + ko);
  });
  await cas('S la route passe par le filtre et met l id en minuscules', async () => {
    if (!src.includes("const id = String(new URL(req.url, 'http://x').searchParams.get('pair') || '').toLowerCase();")) throw new Error('id non normalise');
    if (!src.includes("if (!ID_PAIRE_DEX.test(id)) { repondre({ ok: false, pourquoi: 'not a Base pair id' }); return; }")) throw new Error('route sans filtre');
  });

  await cas('C cache 60 s : la 2e demande ne refait pas de requete', async () => { const m = monter(src, () => 503); await m.etatEmbedDex(ID40); await m.etatEmbedDex(ID40); eq(m.appels.length, 1, 'appels'); });
  await cas('C une lecture en vol par paire (5 demandes simultanees -> 1 requete)', async () => {
    let lacher; const porte = new Promise((ok) => { lacher = ok; });
    const m = monter(src, async () => { await porte; return 200; });
    const ps = [1, 2, 3, 4, 5].map(() => m.etatEmbedDex(ID40)); lacher(); const rs = await Promise.all(ps);
    eq(m.appels.length, 1, 'appels'); eq(rs.every((r) => r.etat === 'OK'), true, 'tous OK');
  });
  await cas('C au plus 30 verifications par minute : la 31e rend INCONNU sans requete', async () => {
    const m = monter(src, () => 200);
    for (let k = 0; k < 30; k++) await m.etatEmbedDex('0x' + k.toString(16).padStart(40, '0'));
    const r = await m.etatEmbedDex('0x' + 'f'.repeat(40));
    eq(m.appels.length, 30, 'appels'); eq(r.etat, 'INCONNU', 'etat au-dela du budget');
  });
  await cas('C cache borne (500)', async () => { if (!src.includes('if (embedDexCache.size >= 500) embedDexCache.delete(embedDexCache.keys().next().value);')) throw new Error('cache non borne'); });

  await cas('A l iframe n est plus chargee directement : montrerEmbedDex regarde d abord', async () => {
    if (/dexFrame\.src = base \+ '\?embed=1/.test(app)) throw new Error('chargement direct revenu');
    if (!app.includes("void montrerEmbedDex({ base, src: base + '?embed=1&")) throw new Error('montrerEmbedDex non appele');
    if (!app.includes("e = await fetch('/api/dex-embed-etat?pair=' + id.toLowerCase()")) throw new Error('pas de verification serveur');
  });
  await cas('A seul EN_PANNE montre la carte ; OK, INCONNU ou verification illisible -> l iframe', async () => {
    if (!app.includes("if (!e || e.ok !== true || e.etat !== 'EN_PANNE') { charger(); return; }")) throw new Error('regle de bascule absente');
  });
  await cas('A la carte est masquee au depart et remise a zero d un block a l autre ; « Load the chart anyway » existe', async () => {
    if (!/<div id="pPnlDexPanne" hidden /.test(app)) throw new Error('carte visible au depart');
    if (!app.includes("{ const pa = $('#pPnlDexPanne'); if (pa) pa.hidden = true; if (dexEmbed) dexEmbed.style.aspectRatio = '16/10'; }")) throw new Error('pas de remise a zero');
    if (!app.includes('id="pPnlDexQuandMeme"') || !app.includes("$('#pPnlDexQuandMeme')?.addEventListener('click'")) throw new Error('pas de « charger quand meme »');
  });
  await cas('A une reponse arrivee apres un changement de block ne touche pas le nouveau', async () => {
    if (!app.includes('if (dexEmbedCourant !== jeton || (perime && perime())) return;')) throw new Error('garde de fraicheur absente');
  });
  /* revue adverse du 2026-10-10 (executee) : carte coupee a 375 px, « Try again » inerte 60 s, course avec « Load anyway » */
  await cas('A telephone : la carte rend au cadre sa hauteur libre ; Try again relit (frais) ; Load anyway annule la verification en vol', async () => {
    if (!app.includes("frame.removeAttribute('src'); frame.hidden = true; if (cadre) cadre.style.aspectRatio = 'auto';")) throw new Error('la carte reste coupee dans le cadre 16/10');
    if (!/<div id="pPnlDexPanne" hidden role="status" aria-live="polite" style="display:flex;/.test(app)) throw new Error('carte a hauteur fixe ou sans role status');
    if (!app.includes('void montrerEmbedDex(dexEmbedCourant, { frais: true });')) throw new Error('Try again ne relit pas');
    if (!app.includes('dexEmbedCourant = { ...c };')) throw new Error('Load anyway n annule pas la verification en vol');
  });
  await cas('C « Try again » (frais) relit une PANNE tout de suite ; jamais un OK ; une panne ne se garde que 15 s', async () => {
    const m = monter(src, (u, o, k) => (k === 1 ? 503 : 200));
    eq((await m.etatEmbedDex(ID40)).etat, 'EN_PANNE', '1re lecture');
    eq((await m.etatEmbedDex(ID40)).etat, 'EN_PANNE', 'sans frais : la panne en cache');
    eq((await m.etatEmbedDex(ID40, true)).etat, 'OK', 'frais : relue'); eq(m.appels.length, 2, 'appels');
    const m2 = monter(src, () => 200); await m2.etatEmbedDex(ID40); await m2.etatEmbedDex(ID40, true);
    eq(m2.appels.length, 1, 'frais ne relit pas un OK');
    if (!src.includes('EMBED_DEX_TTL_PANNE_MS = 15000')) throw new Error('panne gardee plus de 15 s');
    if (!src.includes("void etatEmbedDex(id, new URL(req.url, 'http://x').searchParams.get('frais') === '1')")) throw new Error('la route ne passe pas frais');
  });
  return res;
}

let n = 0, ko = 0;
const ok = (c, m) => { n += 1; if (!c) { ko += 1; console.log('  KO ' + m); } };
const base = await suite(SRV, APP);
for (const r of base) ok(r.ok, 'code livre : ' + r.id + (r.err ? ' — ' + r.err : ''));
console.log('code livre : ' + base.length + ' cas, ' + base.filter((r) => !r.ok).length + ' KO');

const MUTANTS = [
  ['d1 un 5xx compte comme INCONNU', 'srv', "s >= 500 ? 'EN_PANNE' : 'INCONNU'", "'INCONNU'", /^E 503 /],
  ['d2 un 403 cache le graphique', 'srv', "s >= 200 && s < 300 ? 'OK' : s >= 500", "s >= 200 && s < 300 ? 'OK' : s >= 400", /^E 403 /],
  ['d3 le delai ne compte pas comme panne', 'srv', "etat: delai ? 'EN_PANNE' : 'INCONNU'", "etat: 'INCONNU'", /^E delai /],
  ['d4 les redirections sont suivies', 'srv', "{ redirect: 'manual', signal:", '{ signal:', /^S une seule URL/],
  ['d5 le corps est lu', 'srv', 'try { await x.body?.cancel(); }', 'try { }', /^S une seule URL/],
  ['d6 filtre d id relache', 'srv', 'const ID_PAIRE_DEX = /^0x(?:[0-9a-f]{40}|[0-9a-f]{64})$/;', 'const ID_PAIRE_DEX = /^0x[0-9a-z\\/.?=]+/;', /^S filtre/],
  ['d7 pas de cache', 'srv', 'if (c && Date.now() - c.t < ttl) return Promise.resolve(c.r);', '', /^C cache 60/],
  ['d14 frais ignore', 'srv', '(frais ? 0 : EMBED_DEX_TTL_PANNE_MS)', 'EMBED_DEX_TTL_PANNE_MS', /^C « Try again »/],
  ['d15 carte coupee au telephone', 'app', "frame.hidden = true; if (cadre) cadre.style.aspectRatio = 'auto';", 'frame.hidden = true;', /^A telephone/],
  ['d16 Load anyway n annule pas', 'app', 'dexEmbedCourant = { ...c };', '', /^A telephone/],
  ['d8 pas de dedoublonnage en vol', 'srv', 'if (embedDexEnVol.has(id)) return embedDexEnVol.get(id);', '', /^C une lecture en vol/],
  ['d9 pas de budget par minute', 'srv', "if (embedDexFenetre.n >= EMBED_DEX_PAR_MINUTE) return Promise.resolve(", 'if (false) return Promise.resolve(', /^C au plus 30/],
  ['d10 chargement direct de l iframe', 'app', 'void montrerEmbedDex({ base, src: base +', "dexFrame.src = base + '?embed=1&x'; void ({ base, src: base +", /^A l iframe/],
  ['d11 toute verification rate = carte', 'app', "if (!e || e.ok !== true || e.etat !== 'EN_PANNE') { charger(); return; }", "if (e && e.etat === 'OK') { charger(); return; }", /^A seul EN_PANNE/],
  ['d12 carte pas remise a zero', 'app', "{ const pa = $('#pPnlDexPanne'); if (pa) pa.hidden = true; if (dexEmbed) dexEmbed.style.aspectRatio = '16/10'; }", '{ }', /^A la carte/],
  ['d13 reponse perimee appliquee', 'app', 'if (dexEmbedCourant !== jeton || (perime && perime())) return;', '', /^A une reponse/],
];
let tues = 0;
for (const [nom, cible, de, vers, casse] of MUTANTS) {
  const src = cible === 'srv' ? SRV : APP;
  const fois = src.split(de).length - 1;
  ok(fois === 1, 'mutant ' + nom + ' : motif trouve ' + fois + ' fois (attendu 1)');
  if (fois !== 1) continue;
  const mute = src.replace(de, vers);
  let r;
  try { r = await suite(cible === 'srv' ? mute : SRV, cible === 'app' ? mute : APP); } catch (e) { r = [{ id: 'montage', ok: false, err: String(e) }]; }
  const rouges = r.filter((x) => !x.ok).map((x) => x.id);
  if (rouges.length) tues += 1;
  ok(rouges.some((id) => casse.test(id)), 'mutant ' + nom + ' : doit casser ' + casse + ' (rouges : ' + rouges.join(' | ').slice(0, 160) + ')');
}
console.log('mutants tues : ' + tues + '/' + MUTANTS.length);
console.log(n + ' assertions, ' + ko + ' KO');
if (n === 0) { console.log('⛔ aucune assertion executee'); process.exit(1); }
process.exit(ko ? 1 : 0);
