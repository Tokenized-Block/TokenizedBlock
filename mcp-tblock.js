/* mcp-tblock.js — LE MCP DE TOKENIZEDBLOCK : le protocole (JSON-RPC 2.0, transport HTTP sans session), rien d autre.
 *
 * ⛔⛔ POURQUOI (Phil, 2026-10-04) : les agents creent des blocks ailleurs et on n y gagne rien. Un agent branche sur ce MCP
 *   obtient les appels NON SIGNES d une naissance par NOTRE chemin (createPaid + hook de naissance : 0,001 ETH de frais), ceux
 *   d un echange par nos rails, la liste des devises, et la sortie du minimum du createur. Son wallet signe ; ce serveur ne
 *   signe rien, ne tient rien, n envoie rien.
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
  + 'A plan is simulated when it is built, not executed: read `etat` (PRET, APPROBATIONS, REFUSE, NON_MESURE) and `pourquoi` before signing.';

const ADRESSE = { type: 'string', pattern: '^0x[0-9a-fA-F]{40}$' };
const JETON = { type: 'string', pattern: '^(?:[eE][tT][hH]|0x[0-9a-fA-F]{40})$' };
export const OUTILS = Object.freeze([
  { name: 'tblock_pairs', title: 'Currencies a block can be born against',
    description: 'Lists the currencies a new block can be paired with at birth on TokenizedBlock (ETH, USDC, cbBTC, OUSD and Coinbase tokenized stocks), '
      + 'with the creator minimum floor of each. Read-only, no input.',
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
      + 'or ETH/USDC to a Coinbase tokenized stock and back. `amount` is in raw units of the token paid. APPROBATIONS means: sign the approvals, then ask again.',
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
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false } },
  { name: 'tblock_command', title: 'Send a command to the control panel',
    description: 'Proposes one command to an open control panel. type = select (show a block), show (switch tab: market, trade, brain, chat), '
      + 'trade (side buy|sell, block, amount in raw units, optional `with` token), task (a brain task: trade_tblock, launch_wake, feed_trusted, record_memory, offer_food, '
      + 'export_snapshot, read_agent_catalog, decision_receipts), birth (name, symbol, optional pair) or say (a short text shown in the chat). '
      + 'Nothing is signed by this call: the panel shows the proposal with buttons, and the user decides. One command per second.',
    inputSchema: { type: 'object', required: ['session', 'type'], additionalProperties: false, properties: {
      session: { type: 'string', pattern: '^[0-9a-f]{32}$', description: 'The session returned by tblock_panel_open.' },
      type: { type: 'string', pattern: '^(select|show|trade|task|birth|say)$', description: 'select | show | trade | task | birth | say' },
      block: { ...ADRESSE, description: 'For select, trade, task: the block address.' },
      tab: { type: 'string', pattern: '^(market|trade|brain|chat)$', description: 'For show.' },
      side: { type: 'string', pattern: '^(buy|sell)$', description: 'For trade.' },
      amount: { type: 'string', pattern: '^[1-9][0-9]{0,40}$', description: 'For trade: raw units of the token paid (buy) or of the block (sell).' },
      with: { ...JETON, description: 'For trade: the token paid (buy) or received (sell); default: the block’s own quote token.' },
      task: { type: 'string', maxLength: 40, description: 'For task: the brain task id.' },
      name: { type: 'string', maxLength: 32, description: 'For birth.' },
      symbol: { type: 'string', maxLength: 32, description: 'For birth.' },
      pair: { ...JETON, description: 'For birth: ETH (default) or a currency from tblock_pairs.' },
      text: { type: 'string', maxLength: 500, description: 'For say.' } } },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false } },
  { name: 'tblock_panel_state', title: 'Read what happened in the control panel',
    description: 'Returns the events reported by the control panel since `since`: whether the panel is open, the brain’s verdict on each command, plans built, '
      + 'and what the user signed (transaction hash) or declined.',
    inputSchema: { type: 'object', required: ['session'], additionalProperties: false, properties: {
      session: { type: 'string', pattern: '^[0-9a-f]{32}$', description: 'The session returned by tblock_panel_open.' },
      since: { type: 'string', pattern: '^[0-9]{1,9}$', description: 'Optional: only events after this event number.' } } },
    annotations: { readOnlyHint: true, openWorldHint: false } },
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
      capabilities: { tools: { listChanged: false } },
      serverInfo: { ...MCP_SERVEUR, version: String((deps && deps.version) || '0') }, instructions: MCP_INSTRUCTIONS });
  }
  if (method === 'tools/list') return resultat(id, { tools: OUTILS });
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
