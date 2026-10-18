/* mcp-tblock.js — LE MCP DE TOKENIZEDBLOCK : le protocole (JSON-RPC 2.0, transport HTTP sans session), rien d autre.
 *
 * ⛔⛔ POURQUOI (Phil, 2026-10-04) : les agents creent des blocks ailleurs et on n y gagne rien. Un agent branche sur ce MCP
 *   obtient les appels NON SIGNES d une naissance par NOTRE chemin (createPaid + hook de naissance : 0,001 ETH de frais), ceux
 *   d un echange par nos rails, la liste des devises, et la sortie du minimum du createur. Son wallet signe ; ce serveur ne
 *   signe rien, ne tient rien, n envoie rien.
 * 2026-10-18 (Phil 09:00) : LE GAME aussi — l etat du jeu, le roll classique (0,50 USDC, 10 au plus par lot), le settle, une mission,
 *   le tableau des missions : 12 outils. Les planificateurs du jeu vivent dans jeu-agent.js (serveur) ; ici, toujours rien.
 * ⛔ CE QUE CE FICHIER EST : un traducteur. Il valide la forme de la requete, appelle l outil INJECTE (`deps`), et rend la
 *   reponse dans la forme MCP. Les planificateurs (naissance-api.js, rails-api.js, caution-createur.js) decident ; ici rien.
 * ⛔ SANS ETAT : pas de session, pas de flux SSE, pas de lot. Une requete POST = une reponse JSON. Une notification (pas d `id`)
 *   ne recoit rien (le serveur HTTP rend 202).
 * ⛔ UN REFUS N EST PAS UNE ERREUR D OUTIL : `etat: REFUSE` (fonds manquants, paire non offerte) est une REPONSE, rendue avec
 *   isError = false pour que l agent lise la raison. isError = true : arguments invalides, serveur occupe, chaine illisible. */
export const MCP_VERSIONS = Object.freeze(['2025-06-18', '2025-03-26', '2024-11-05']);
export const MCP_SERVEUR = Object.freeze({ name: 'tokenizedblock', title: 'TokenizedBlock' });
export const MCP_INSTRUCTIONS = 'TokenizedBlock on Base mainnet. The planning tools are read-only: they return UNSIGNED calls for the user’s own wallet to sign, in order '
  + '(a wallet batch such as wallet_sendCalls makes a birth one signature). The panel tools open a visual control panel for the user and PROPOSE commands to it; '
  + 'the block’s brain accepts or refuses each task and only the user’s wallet signs. Nothing is signed, held or sent by this server. '
  + 'Birth fee: 0.001 ETH (0.0007 at creation + 0.0003 at registration), paid inside those calls. On top, the creator deposits a minimum '
  + '(about $1 of the paired currency) that stays theirs and earns 0.03% of each trade. Amounts are raw integer units. '
  + 'A plan is simulated when it is built, not executed: read `etat` (PRET, APPROBATIONS, REFUSE, NON_MESURE) and `pourquoi` before signing. '
  + 'The Game (tblock_game_state, tblock_plan_roll, tblock_plan_settle, tblock_plan_task, tblock_missions): the classic roll is 0.50 USDC a roll, up to 10 in one batch, '
  + 'paid in USDC on the BlockRolls contract when one is served; without it the game is practice (free, nothing to sign) and the roll tools answer REFUSE with that state. '
  + 'Game plans are NOT simulated.';

/* ── LE WIDGET (MCP Apps, 2026-10-04) : une carte affichee DANS le chat par les clients qui savent le faire. Lu dans le paquet
 *   officiel @modelcontextprotocol/ext-apps 2.0.3 (server/index.js) : l outil porte `_meta.ui.resourceUri` ET l ancienne cle
 *   `_meta["ui/resourceUri"]` ; la ressource est servie en `text/html;profile=mcp-app`. Un client sans cette surface ignore
 *   `_meta` et lit le texte de l outil comme avant — rien ne depend du widget. */
export const WIDGET_URI = 'ui://tokenizedblock/panel.html';
export const WIDGET_MIME = 'text/html;profile=mcp-app';
const META_WIDGET = Object.freeze({ ui: Object.freeze({ resourceUri: WIDGET_URI }), 'ui/resourceUri': WIDGET_URI });
const ADRESSE = { type: 'string', pattern: '^0x[0-9a-fA-F]{40}$' };
const JETON = { type: 'string', pattern: '^(?:[eE][tT][hH]|0x[0-9a-fA-F]{40})$' };
export const OUTILS = Object.freeze([
  { name: 'tblock_pairs', title: 'Currencies a block can be born against',
    description: 'Lists the currencies a new block can be paired with at birth on TokenizedBlock (ETH, USDC, cbBTC, OUSD and Coinbase tokenized stocks), '
      + 'with the creator minimum floor of each, and in `echanges` the currency swaps tblock_plan_swap builds (both ways). Read-only, no input.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, openWorldHint: true } },
  { name: 'tblock_plan_birth', title: 'Plan the birth of a block',
    description: 'Returns the unsigned calls that create a block (a B20 token with an engraved face and a brain) AND open its market, paired with ETH or with one of '
      + 'the currencies from tblock_pairs: createPaid, approvals, registration, market opening — to be signed in order by `account`. '
      + 'Fee: 0.001 ETH. The response lists every cost (`cout`), the block address, and the result of simulating the whole sequence from that wallet. '
      + 'For a non-ETH pair the wallet must already hold the creator minimum in that currency.',
    inputSchema: { type: 'object', required: ['name', 'symbol', 'account'], additionalProperties: false, properties: {
      name: { type: 'string', minLength: 1, maxLength: 32, description: 'Block name (at most 32 bytes).' },
      symbol: { type: 'string', minLength: 1, maxLength: 32, description: 'Ticker (at most 32 bytes); stored upper-case.' },
      account: { ...ADRESSE, description: 'The wallet that will sign; it receives the whole supply and becomes the creator.' },
      pair: { ...JETON, description: 'ETH (default) or the address of a currency from tblock_pairs.' },
      salt: { type: 'string', maxLength: 64, description: 'Optional free text that fixes the block address. Generated when absent; send it again to get the same plan.' } } },
    annotations: { readOnlyHint: true, openWorldHint: true } },
  { name: 'tblock_plan_swap', title: 'Plan a swap on TokenizedBlock rails',
    description: 'Returns the unsigned calls for a swap routed by TokenizedBlock: a block against its quote token, block to block, block to a tokenized stock, '
      + 'or ETH/USDC to a Coinbase tokenized stock and back, ETH to USDC and back, and OUSD to USDC and back (OUSD trades against USDC only: '
      + 'ETH <-> OUSD is refused, swap through USDC in two trades). `amount` is in raw units of the token paid. APPROBATIONS means: sign the approvals, then ask again.',
    inputSchema: { type: 'object', required: ['from', 'to', 'amount', 'account'], additionalProperties: false, properties: {
      from: { ...JETON, description: 'Token paid: ETH or an address.' },
      to: { ...JETON, description: 'Token received: ETH or an address.' },
      amount: { type: 'string', pattern: '^[1-9][0-9]{0,40}$', description: 'Raw integer units of the token paid.' },
      account: { ...ADRESSE, description: 'The wallet that will sign.' } } },
    annotations: { readOnlyHint: true, openWorldHint: true } },
  { name: 'tblock_creator_minimum', title: 'Read or exit the creator minimum of a block',
    description: 'Reads the creator minimum deposited for a block’s market (who deposited, how much, whether the 0.03% creator share is flowing) and, when `account` '
      + 'is that creator, returns the unsigned call for the next exit step: a request (the share stops at once), then, 7 days later, the withdrawal.',
    inputSchema: { type: 'object', required: ['block'], additionalProperties: false, properties: {
      block: { ...ADRESSE, description: 'The block (token) address.' },
      pair: { ...JETON, description: 'The currency it was paired with at birth: ETH (default) or an address.' },
      account: { ...ADRESSE, description: 'Optional: the wallet that would sign the exit.' } } },
    annotations: { readOnlyHint: true, openWorldHint: true } },
  /* ── LA TELECOMMANDE (panel-sessions.js) : l agent PROPOSE, le panneau montre, le cerveau du block juge, l humain signe ── */
  { name: 'tblock_panel_open', title: 'Open the block control panel',
    description: 'Opens a remote-control session and returns the link of the TokenizedBlock control panel: a visual dashboard (the block in the centre; Market, Trade, Brain and Chat tabs) '
      + 'for the user to open in their browser with their wallet. Give the link to the user. Then send commands with tblock_command and read what happened with tblock_panel_state. '
      + 'Commands are proposals: the block’s brain accepts or refuses each task, and only the user’s wallet signs.',
    inputSchema: { type: 'object', properties: { block: { ...ADRESSE, description: 'Optional: the block to show first.' } }, additionalProperties: false },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false }, _meta: META_WIDGET },
  { name: 'tblock_command', title: 'Send a command to the control panel',
    description: 'Proposes one command to an open control panel. type = select (show a block), show (switch tab: market, trade, brain, chat), '
      + 'trade (side buy|sell, block, amount in raw units, optional `with` token), swap (from, to, amount in raw units of `from` — e.g. USDC to a Coinbase tokenized stock), '
      + 'send (token, amount in raw units, recipient: a transfer the user must confirm twice), task (a brain task: trade_tblock, launch_wake, feed_trusted, record_memory, offer_food, '
      + 'export_snapshot, read_agent_catalog, decision_receipts), birth (name, symbol, optional pair) or say (a short text shown in the chat). '
      + 'Nothing is signed by this call: the panel shows the proposal with buttons, and the user decides. One command per second.',
    inputSchema: { type: 'object', required: ['session', 'type'], additionalProperties: false, properties: {
      session: { type: 'string', pattern: '^[0-9a-f]{32}$', description: 'The session returned by tblock_panel_open.' },
      type: { type: 'string', pattern: '^(select|show|trade|swap|send|task|birth|say)$', description: 'select | show | trade | swap | send | task | birth | say' },
      from: { ...JETON, description: 'For swap: the token paid (ETH or an address).' },
      to: { ...JETON, description: 'For swap: the token received (ETH or an address).' },
      token: { ...JETON, description: 'For send: the token sent (ETH or an address).' },
      recipient: { ...ADRESSE, description: 'For send: the whole address that receives. Never abbreviated.' },
      block: { ...ADRESSE, description: 'For select, trade, task: the block address.' },
      tab: { type: 'string', pattern: '^(market|trade|brain|chat)$', description: 'For show.' },
      side: { type: 'string', pattern: '^(buy|sell)$', description: 'For trade.' },
      amount: { type: 'string', pattern: '^[1-9][0-9]{0,40}$', description: 'For trade, swap, send: raw integer units (trade: of the token paid for a buy, of the block for a sell; swap: of `from`; send: of `token`).' },
      with: { ...JETON, description: 'For trade: the token paid (buy) or received (sell); default: the block’s own quote token.' },
      task: { type: 'string', maxLength: 40, description: 'For task: the brain task id.' },
      name: { type: 'string', maxLength: 32, description: 'For birth.' },
      symbol: { type: 'string', maxLength: 32, description: 'For birth.' },
      pair: { ...JETON, description: 'For birth: ETH (default) or a currency from tblock_pairs.' },
      text: { type: 'string', maxLength: 500, description: 'For say.' } } },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false } },
  { name: 'tblock_panel_state', title: 'Read the brain and what happened in the control panel',
    description: 'Reads the control panel, which is wired to the block’s brain: `cerveau` is the brain as the panel sees it (block, mood, beat, market read, and the tasks it accepts '
      + 'or refuses right now), and `evenements` are the events since `since` — the brain’s verdict on each command, plans built, and what the user signed (transaction hash) or declined.',
    inputSchema: { type: 'object', required: ['session'], additionalProperties: false, properties: {
      session: { type: 'string', pattern: '^[0-9a-f]{32}$', description: 'The session returned by tblock_panel_open.' },
      since: { type: 'string', pattern: '^[0-9]{1,9}$', description: 'Optional: only events after this event number.' } } },
    annotations: { readOnlyHint: true, openWorldHint: false }, _meta: META_WIDGET },
  /* ── LE GAME (2026-10-18, Phil 09:00 : « le MCP du brain et le brain lui-meme, qui par une commande peut avoir acces au game ») : l etat
   *   du jeu, et les appels NON SIGNES d un roll (<= 10 par lot, 0,50 USDC chacun), d un settle, d une mission. Meme doctrine : lecture
   *   seule, le wallet signe. Sans contrat servi (fiche non signee) le roll et le settle sont REFUSES avec l etat — jamais un plan invente. */
  { name: 'tblock_game_state', title: 'Read the Game: today\'s draw, your ticket, the rolls',
    description: 'Reads the Game tab as the server serves it (GET /api/tirage): today\'s draw (tickets, closing time, practice or paid mode), the live preview face '
      + '(the face the latest Base block would draw), yesterday\'s revealed day, the BlockRolls contract when one is served (prices, prizes, pot) or null (practice: free rolls, '
      + 'nothing to sign), and the recent off-chain practice rolls (GET /api/jeu/rolls). With `wallet`: that wallet\'s ticket (held or not, verified volume, skin pass), its '
      + 'ticket face as the 5-trait guess tblock_plan_roll uses by default, and its entries in this week\'s and month\'s draws. Read-only.',
    inputSchema: { type: 'object', properties: { wallet: { ...ADRESSE, description: 'Optional: the wallet whose ticket and progress to read.' } }, additionalProperties: false },
    annotations: { readOnlyHint: true, openWorldHint: true } },
  { name: 'tblock_plan_roll', title: 'Plan the classic roll: 0.50 USDC a roll, up to 10 in one batch',
    description: 'Returns the unsigned calls for `rolls` (1 to 10, default 1) BlockRolls rolls on one guess, for ONE wallet_sendCalls batch signed by `wallet`: '
      + 'one approve of EXACTLY rolls x 0.50 USDC, then one roll(guess) per roll — or, when that wallet holds an active day pass on the contract, rollWithPass x rolls with no payment. '
      + 'The block 2 blocks after the roll decides; the roll is scored against the guess (traits in common out of 5), a fixed prize from 3/5. `guess` defaults to the face of the wallet\'s '
      + 'ticket of the day (SHA-256(wallet|day), the same face the Game tab shows). REFUSED with the state when no contract is served (practice mode, 0 USDC): then nothing is to be signed.',
    inputSchema: { type: 'object', required: ['wallet'], additionalProperties: false, properties: {
      wallet: { ...ADRESSE, description: 'The wallet that will sign and play.' },
      guess: { type: 'string', pattern: '^[0-9]{1,2}(,[0-9]{1,2}){4}$', description: 'Optional: 5 traits "colorBand,orbit,facet,material,ornament" (0..5, 0..9, 0..18, 0..8, 0..7). Default: the wallet\'s ticket face.' },
      rolls: { type: 'string', pattern: '^(10|[1-9])$', description: 'Optional: how many rolls in the batch, 1 to 10 (default 1).' } } },
    annotations: { readOnlyHint: true, openWorldHint: true } },
  { name: 'tblock_plan_settle', title: 'Plan the settle of rolls (reveal and pay)',
    description: 'Reads settleableUntil(id) for each roll and the head block, says the state of each (TROP_TOT: wait `blocsAvant` blocks; REGLABLE; PERDU: the 256-block window passed; '
      + 'PAS_EN_ATTENTE: already settled or expired), and returns one unsigned settleMany call for the settleable ones. Anyone may send it: the prize always goes to the player. '
      + 'REFUSED when no contract is served.',
    inputSchema: { type: 'object', required: ['rollIds'], additionalProperties: false, properties: {
      rollIds: { type: 'string', pattern: '^[0-9]{1,20}(,[0-9]{1,20}){0,49}$', description: 'The roll numbers (from the Rolled events), comma-separated, 1 to 50.' } } },
    annotations: { readOnlyHint: true, openWorldHint: true } },
  { name: 'tblock_plan_task', title: 'Plan a mission: "trade my block", reward escrowed',
    description: 'Returns the unsigned calls that post a mission on the Block Missions board for a block: approve EXACTLY reward x maxDone (raw units of the block), then postTask. '
      + 'The task is "trade my block on its TokenizedBlock pool" (a v4 Swap on the block\'s pool on our hook, the only pool a mission may name), held `hold` raw units for 24 h, '
      + 'open 7 days, one completion per wallet. The block creator\'s wallet signs. REFUSED while the board\'s contract is not deployed, or when the block has no pool on a TokenizedBlock hook.',
    inputSchema: { type: 'object', required: ['block', 'reward', 'maxDone', 'hold'], additionalProperties: false, properties: {
      block: { ...ADRESSE, description: 'The block (B20 token) the mission is about; its units pay the reward.' },
      reward: { type: 'string', pattern: '^[1-9][0-9]{0,40}$', description: 'Reward per player, raw units of the block (18 decimals).' },
      maxDone: { type: 'string', pattern: '^[1-9][0-9]{0,4}$', description: 'How many players can complete it, 1 to 10000.' },
      hold: { type: 'string', pattern: '^[1-9][0-9]{0,40}$', description: 'Minimum holding of the block during the 24 h window, raw units.' } } },
    annotations: { readOnlyHint: true, openWorldHint: true } },
  { name: 'tblock_missions', title: 'Read the mission board',
    description: 'Reads the Block Missions board as the server serves it (GET /api/missions): the contract and each mission (id, reward token and amount, done/maxDone, holding, state). '
      + 'REFUSED with tableau = PAS_OUVERT while the board\'s contract is not deployed. Read-only, no input.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, openWorldHint: true } },
]);

const erreur = (id, code, message) => ({ jsonrpc: '2.0', id: id === undefined ? null : id, error: { code, message } });
const resultat = (id, result) => ({ jsonrpc: '2.0', id, result });

/** Valide `args` contre le schema de l outil — le sous-ensemble qu on utilise (type objet, required, string + pattern + longueurs). */
export function validerArguments(outil, args) {
  const s = outil.inputSchema, a = args === undefined || args === null ? {} : args;
  if (typeof a !== 'object' || Array.isArray(a)) return 'arguments must be an object';
  for (const k of Object.keys(a)) if (!Object.prototype.hasOwnProperty.call(s.properties, k)) return 'unknown argument: ' + String(k).slice(0, 40);
  for (const k of s.required || []) if (a[k] === undefined || a[k] === null || a[k] === '') return 'missing argument: ' + k;
  for (const [k, v] of Object.entries(a)) {
    const p = s.properties[k];
    if (typeof v !== 'string') return k + ' must be a string';
    if (p.minLength !== undefined && v.length < p.minLength) return k + ' is too short';
    if (p.maxLength !== undefined && v.length > p.maxLength) return k + ' is too long';
    if (p.pattern && !new RegExp(p.pattern).test(v)) return k + ' has the wrong form' + (k === 'amount' ? ' (a positive integer, raw units)'
      : p.pattern === ADRESSE.pattern ? ' (a whole address)' : p.pattern === JETON.pattern ? ' (a whole address or ETH)' : ' (' + String(p.description || 'see the tool schema').slice(0, 80) + ')');
  }
  return null;
}

const contenu = (corps, isError) => ({ content: [{ type: 'text', text: JSON.stringify(corps) }], structuredContent: corps, isError: !!isError });

/**
 * Une requete JSON-RPC -> sa reponse, ou null pour une notification.
 * @param {any} msg  le corps JSON deja parse
 * @param {{ version:string, outils:Record<string,(args:object, ctx:object)=>Promise<object>>, ctx?:object }} deps
 *   outils[nom] rend le corps de la reponse ; il peut LEVER { occupe:true } quand le budget est depasse.
 */
export async function traiterMcp(msg, deps) {
  if (Array.isArray(msg)) return erreur(null, -32600, 'batches are not supported: send one request per POST');
  if (!msg || typeof msg !== 'object' || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') return erreur(msg && msg.id, -32600, 'not a JSON-RPC 2.0 request');
  const { id, method, params } = msg;
  const notification = id === undefined;
  if (method.startsWith('notifications/')) return null;
  if (notification) return null; /* une requete sans id n attend rien */
  if (!(typeof id === 'string' || (typeof id === 'number' && Number.isFinite(id)))) return erreur(null, -32600, 'id must be a string or a number');
  if (method === 'ping') return resultat(id, {});
  if (method === 'initialize') {
    const demandee = params && typeof params.protocolVersion === 'string' ? params.protocolVersion : null;
    return resultat(id, { protocolVersion: MCP_VERSIONS.includes(demandee) ? demandee : MCP_VERSIONS[0],
      capabilities: { tools: { listChanged: false }, resources: { listChanged: false } },
      serverInfo: { ...MCP_SERVEUR, version: String((deps && deps.version) || '0') }, instructions: MCP_INSTRUCTIONS });
  }
  if (method === 'tools/list') return resultat(id, { tools: OUTILS });
  /* les ressources : UNE seule, le widget du panneau (deps.widget() rend son HTML, ou null si le serveur ne l a pas) */
  if (method === 'resources/list') {
    const html = deps && typeof deps.widget === 'function' ? deps.widget() : null;
    return resultat(id, { resources: html ? [{ uri: WIDGET_URI, name: 'tblock-panel', title: 'TokenizedBlock control panel', mimeType: WIDGET_MIME,
      description: 'A card shown in the chat: the link of the control panel, whether it is open, and what the user signed or declined.' }] : [] });
  }
  if (method === 'resources/templates/list') return resultat(id, { resourceTemplates: [] });
  if (method === 'resources/read') {
    const uri = params && params.uri;
    const html = deps && typeof deps.widget === 'function' ? deps.widget() : null;
    if (uri !== WIDGET_URI || !html) return erreur(id, -32002, 'resource not found: ' + String(uri).slice(0, 80));
    return resultat(id, { contents: [{ uri: WIDGET_URI, mimeType: WIDGET_MIME, text: html, _meta: { ui: { prefersBorder: true } } }] });
  }
  if (method === 'tools/call') {
    const nom = params && params.name;
    const outil = OUTILS.find((o) => o.name === nom);
    if (!outil) return erreur(id, -32602, 'unknown tool: ' + String(nom).slice(0, 60));
    const faute = validerArguments(outil, params.arguments);
    if (faute) return resultat(id, contenu({ ok: false, etat: 'REFUSE', pourquoi: faute }, true));
    const f = deps && deps.outils && deps.outils[nom];
    if (typeof f !== 'function') return resultat(id, contenu({ ok: false, etat: 'NON_MESURE', pourquoi: 'this tool is not available on this server' }, true));
    try {
      const corps = await f(params.arguments || {}, (deps && deps.ctx) || {});
      return resultat(id, contenu(corps, corps && corps.etat === 'NON_MESURE'));
    } catch (e) {
      if (e && e.occupe) return resultat(id, contenu({ ok: false, etat: 'NON_MESURE', pourquoi: 'busy: each plan reads the chain on a node shared with the whole site — retry in a minute' }, true));
      return resultat(id, contenu({ ok: false, etat: 'NON_MESURE', pourquoi: String((e && e.message) || e).slice(0, 160) }, true));
    }
  }
  return erreur(id, -32601, 'method not found: ' + method.slice(0, 60));
}
