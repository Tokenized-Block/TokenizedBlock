// pnl-swaps.js — swap-derived market + optional Your PnL from DexScreener / GeckoTerminal.
// ================================================================================================
// ⛔ DATED / MEASURED ONLY. Never invent price, volume, or PnL. Fetch fails → say so.
// ⛔ CLANSY METHODE: never display sum-of-trader paper PnL as cash truth (flattering aggregate).
//    Market card = buys/sells counts + buy/sell USD volumes from the trades SAMPLE WINDOW only.
//    Your PnL = wallet-matched gecko trades only, with paper mark labeled when inventory remains.
// ✅ On-demand per profile open — no poller.
// ✅ Base mainnet token addresses. Best pair = deepest honest quote-side (not Dex inventory mark).
// ⛔ tip 2330 BRAINARM: Dex liquidity.usd / fdv often = tokens_in_pool×price (paper). Prefer ETH quote depth.

const ADRESSE = /^0x[0-9a-fA-F]{40}$/;
const DS_TOKENS = 'https://api.dexscreener.com/latest/dex/tokens/';
const GT_TRADES = (pool) =>
  'https://api.geckoterminal.com/api/v2/networks/base/pools/' + pool + '/trades';

function num(x) {
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

function fmtUsd(n, digits = 2) {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—';
  const abs = Math.abs(n);
  const d = abs >= 1000 ? 0 : abs >= 1 ? 2 : abs >= 0.01 ? 4 : 6;
  return '$' + n.toLocaleString('en-US', { maximumFractionDigits: digits ?? d, minimumFractionDigits: 0 });
}

function fmtPx(n) {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—';
  if (n >= 1) return '$' + n.toLocaleString('en-US', { maximumFractionDigits: 4 });
  return '$' + n.toLocaleString('en-US', { maximumFractionDigits: 8 });
}

function fmtPct(n) {
  if (n === null || n === undefined || !Number.isFinite(n)) return null;
  const sign = n > 0 ? '+' : '';
  return sign + n.toLocaleString('en-US', { maximumFractionDigits: 1 }) + '%';
}

/** Honest quote-side USD from Dex pair (ETH/WETH depth), not inventory mark. */
export function profondeurQuoteUsd(pair) {
  if (!pair || !pair.liquidity) return null;
  const quote = num(pair.liquidity.quote);
  const priceUsd = num(pair.priceUsd);
  const priceNative = num(pair.priceNative);
  if (quote === null || !(quote >= 0)) return null;
  /* Native quote (ETH): convert via priceUsd/priceNative when both set. */
  if (priceUsd !== null && priceNative !== null && priceNative > 0) {
    return quote * (priceUsd / priceNative);
  }
  /* Already USD-ish quotes (USDC): quote amount ≈ USD */
  const qSym = String((pair.quoteToken && pair.quoteToken.symbol) || '').toUpperCase();
  if (qSym === 'USDC' || qSym === 'USDT' || qSym === 'DAI') return quote;
  return null;
}

/** True when Dex liquidity.usd is mostly marked base inventory, not exit depth. */
export function liquiditeInventairePapier(pair) {
  const marked = num(pair && pair.liquidity && pair.liquidity.usd);
  const quoteUsd = profondeurQuoteUsd(pair);
  if (marked === null || quoteUsd === null) return false;
  if (quoteUsd <= 0) return marked > 100; /* any big mark with ~0 quote = paper */
  return marked > Math.max(50, quoteUsd * 20);
}

/** Score for pair pick: prefer real quote depth; demote phantom inventory marks. */
function scorePaire(pair) {
  const quoteUsd = profondeurQuoteUsd(pair) || 0;
  const marked = num(pair && pair.liquidity && pair.liquidity.usd) || 0;
  if (liquiditeInventairePapier(pair)) return quoteUsd; /* ignore flattering mark */
  return Math.max(quoteUsd, marked);
}

/**
 * Pick best Base pair from DexScreener token payload (honest quote depth first).
 * @returns {object|null}
 */
export function choisirPaireBase(pairs, jeton) {
  const want = String(jeton || '').toLowerCase();
  const list = Array.isArray(pairs) ? pairs : [];
  const base = list.filter((p) => {
    if (!p || String(p.chainId || '').toLowerCase() !== 'base') return false;
    const b = p.baseToken && String(p.baseToken.address || '').toLowerCase();
    const q = p.quoteToken && String(p.quoteToken.address || '').toLowerCase();
    return b === want || q === want;
  });
  if (!base.length) return null;
  base.sort((a, b) => scorePaire(b) - scorePaire(a));
  return base[0];
}

/**
 * Aggregate GeckoTerminal trades page into market sample + optional wallet PnL.
 * ⛔ One page only (API sample) — never pretend lifetime census.
 */
export function agregatTrades(trades, { compte, lastPx, jeton } = {}) {
  const rows = Array.isArray(trades) ? trades : [];
  let buys = 0, sells = 0, buyUsd = 0, sellUsd = 0;
  let minTs = null, maxTs = null;
  const want = compte ? String(compte).toLowerCase() : null;
  const tok = jeton ? String(jeton).toLowerCase() : null;
  let wBuyUsd = 0, wSellUsd = 0, wBuyTok = 0, wSellTok = 0, wN = 0;

  for (const t of rows) {
    const a = (t && t.attributes) || t || {};
    const kind = String(a.kind || '').toLowerCase();
    const vol = num(a.volume_in_usd) || 0;
    const ts = a.block_timestamp || null;
    if (ts) {
      if (!minTs || ts < minTs) minTs = ts;
      if (!maxTs || ts > maxTs) maxTs = ts;
    }
    if (kind === 'buy') { buys++; buyUsd += vol; }
    else if (kind === 'sell') { sells++; sellUsd += vol; }

    if (!want) continue;
    const from = String(a.tx_from_address || '').toLowerCase();
    if (from !== want) continue;
    wN++;
    const fromTok = String(a.from_token_address || '').toLowerCase();
    const toTok = String(a.to_token_address || '').toLowerCase();
    if (kind === 'buy') {
      wBuyUsd += vol;
      /* buy: token received is to_token when to matches our jeton (or unknown tok → use to_token_amount) */
      if (!tok || toTok === tok) wBuyTok += num(a.to_token_amount) || 0;
    } else if (kind === 'sell') {
      wSellUsd += vol;
      if (!tok || fromTok === tok) wSellTok += num(a.from_token_amount) || 0;
    }
  }

  const sample = {
    tradeCount: rows.length,
    buys, sells,
    buyUsd: +buyUsd.toFixed(4),
    sellUsd: +sellUsd.toFixed(4),
    minTs, maxTs,
    note: 'GeckoTerminal trades page=1 sample window — not a lifetime census',
  };

  let yourPnL = null;
  if (want) {
    const invTok = wBuyTok - wSellTok;
    const px = num(lastPx);
    const mark = (invTok > 0 && px !== null) ? invTok * px : 0;
    const realized = wSellUsd - wBuyUsd; /* approx: ignores remaining inventory */
    const totalPnL = realized + Math.max(invTok, 0) * (px !== null ? px : 0);
    yourPnL = {
      matchedTrades: wN,
      buyUsd: +wBuyUsd.toFixed(4),
      sellUsd: +wSellUsd.toFixed(4),
      invTok,
      inventoryRemains: invTok > 0,
      realizedApproxUsd: +realized.toFixed(4),
      markUsd: +(mark).toFixed(4),
      totalPnLUsd: +totalPnL.toFixed(4),
      paperMark: invTok > 0,
      note: invTok > 0
        ? 'Includes paper mark on remaining inventory at last DexScreener price — not cash'
        : (wN ? 'Inventory flat in this sample (or fully sold in window)' : 'No matching trades for this wallet in sample'),
    };
  }

  return { sample, yourPnL };
}

/**
 * Fetch DexScreener + optional Gecko trades for a Base token.
 * @param {object} o
 * @param {string} o.jeton          token address
 * @param {string} [o.compte]       wallet for Your PnL
 * @param {string} [o.poolId]       optional known pool (else best DexScreener pair)
 * @param {typeof fetch} [o.fetchFn]
 * @returns {Promise<object>}
 */
export async function lirePnlSwaps({ jeton, compte = null, poolId = null, fetchFn = fetch } = {}) {
  const luA = new Date().toISOString();
  if (!ADRESSE.test(String(jeton || ''))) {
    return { etat: 'REFUSE', pourquoi: 'not a token address', luA, lignes: [], cardHidden: true };
  }

  let ds = null;
  let dsErr = null;
  try {
    const r = await fetchFn(DS_TOKENS + jeton);
    if (!r.ok) dsErr = 'DexScreener HTTP ' + r.status;
    else ds = await r.json();
  } catch (e) {
    dsErr = 'DexScreener fetch failed: ' + (e && e.message ? e.message : 'network');
  }

  if (dsErr) {
    return {
      etat: 'NON_LUE',
      pourquoi: dsErr,
      luA,
      cardHidden: false,
      lignes: ['DexScreener: <b>fetch failed</b> — ' + enTexteSafe(dsErr) + '. No invented numbers.'],
      note: 'Source unread · ' + luA,
      pair: null,
      market: null,
      trades: null,
      yourPnL: null,
    };
  }

  const pair = choisirPaireBase(ds && ds.pairs, jeton);
  if (!pair) {
    return {
      etat: 'NON_TROUVEE',
      pourquoi: 'No DexScreener pair read',
      luA,
      cardHidden: false,
      lignes: ['No DexScreener pair read for this token on Base.'],
      note: 'DexScreener · ' + luA + ' · no pair',
      pair: null,
      market: null,
      trades: null,
      yourPnL: null,
    };
  }

  const priceUsd = num(pair.priceUsd);
  const liqUsd = num(pair.liquidity && pair.liquidity.usd);
  const volH24 = num(pair.volume && pair.volume.h24);
  const volH6 = num(pair.volume && pair.volume.h6);
  const txnsH24 = pair.txns && pair.txns.h24 ? pair.txns.h24 : null;
  const txnsH6 = pair.txns && pair.txns.h6 ? pair.txns.h6 : null;
  const buys = txnsH6 && num(txnsH6.buys) !== null ? num(txnsH6.buys)
    : (txnsH24 ? num(txnsH24.buys) : null);
  const sells = txnsH6 && num(txnsH6.sells) !== null ? num(txnsH6.sells)
    : (txnsH24 ? num(txnsH24.sells) : null);
  const pc = pair.priceChange || {};
  const priceChangeH6 = num(pc.h6);
  const priceChangeH24 = num(pc.h24);
  const pairCreatedAt = pair.pairCreatedAt != null ? Number(pair.pairCreatedAt) : null;
  const pool = poolId || pair.pairAddress || null;
  const sym = (pair.baseToken && pair.baseToken.symbol) || null;
  const dexId = pair.dexId || null;
  const labels = Array.isArray(pair.labels) ? pair.labels.join(' ') : '';

  const quoteUsdPre = profondeurQuoteUsd(pair);
  const paperLiqPre = liquiditeInventairePapier(pair);
  const market = {
    priceUsd, liqUsd, volH24, volH6,
    quoteUsd: quoteUsdPre,
    paperInventoryLiq: paperLiqPre,
    fdv: num(pair.fdv),
    marketCap: num(pair.marketCap),
    buys, sells,
    priceChangeH6, priceChangeH24,
    pairCreatedAt,
    pool, dexId, labels, sym,
    url: pair.url || null,
  };

  /* Optional Gecko trades — failure does not invent; market card still shows DexScreener facts. */
  let trades = null;
  let yourPnL = null;
  let geckoNote = null;
  if (pool) {
    try {
      const r = await fetchFn(GT_TRADES(pool));
      if (!r.ok) {
        geckoNote = 'GeckoTerminal trades: HTTP ' + r.status + ' (sample unread — DexScreener counts kept)';
      } else {
        const gj = await r.json();
        const agg = agregatTrades(gj.data || [], { compte, lastPx: priceUsd, jeton });
        trades = agg.sample;
        yourPnL = agg.yourPnL;
      }
    } catch (e) {
      geckoNote = 'GeckoTerminal trades fetch failed — ' + (e && e.message ? e.message : 'network');
    }
  }

  const lignes = []; /* public */
  const lignesPrivees = []; /* folded — operator detail */
  const quoteUsd = profondeurQuoteUsd(pair);
  const paperLiq = liquiditeInventairePapier(pair);
  const fdv = num(pair.fdv);
  const mcap = num(pair.marketCap);
  const quoteAmt = num(pair.liquidity && pair.liquidity.quote);
  const qSym = String((pair.quoteToken && pair.quoteToken.symbol) || 'ETH');

  /* tip 0013: public = price + exit depth only */
  lignes.push('Price: <b>' + fmtPx(priceUsd) + '</b>'
    + (fmtPct(priceChangeH6) ? ' · h6 ' + fmtPct(priceChangeH6) : ''));
  if (quoteUsd != null) {
    lignes.push('Exit depth: <b>' + fmtUsd(quoteUsd) + '</b>'
      + (quoteAmt != null ? ' · ' + quoteAmt.toLocaleString('en-US', { maximumFractionDigits: 4 }) + ' ' + qSym : ''));
  } else {
    lignes.push('Exit depth: <b>unread</b>');
  }

  if (liqUsd != null) {
    lignesPrivees.push('Dex liquidity mark: <b>' + fmtUsd(liqUsd) + '</b>'
      + (paperLiq ? ' — paper, not exit cash.' : '.'));
  }
  if (fdv != null || mcap != null) {
    lignesPrivees.push('Paper FDV/MC: <b>' + fmtUsd(fdv != null ? fdv : mcap) + '</b> — vanity vs thin quote.');
  }
  if (buys != null || sells != null) {
    lignesPrivees.push('Txns window: ' + (buys != null ? buys : '—') + ' buys / ' + (sells != null ? sells : '—') + ' sells');
  }
  if (volH6 != null) lignesPrivees.push('Vol h6: ' + fmtUsd(volH6));
  if (trades && trades.tradeCount > 0) {
    lignesPrivees.push('Gecko sample: ' + trades.tradeCount + ' trades · buy ' + fmtUsd(trades.buyUsd) + ' / sell ' + fmtUsd(trades.sellUsd));
  } else if (geckoNote) {
    lignesPrivees.push(enTexteSafe(geckoNote));
  }
  if (pairCreatedAt) {
    try {
      lignesPrivees.push('Pair: ' + new Date(pairCreatedAt).toISOString().slice(0, 10)
        + (dexId ? ' · ' + dexId : ''));
    } catch (_) {}
  }
  if (yourPnL) {
    if (yourPnL.matchedTrades === 0) {
      lignesPrivees.push('Your PnL: no matches in sample');
    } else {
      lignesPrivees.push('Your PnL: ' + fmtUsd(yourPnL.totalPnLUsd)
        + (yourPnL.paperMark ? ' (paper)' : '')
        + ' · ' + yourPnL.matchedTrades + ' matched');
    }
  }

  const note = 'measured ' + luA;

  return {
    etat: 'LUE',
    pourquoi: null,
    luA,
    cardHidden: false,
    lignes,
    lignesPrivees,
    note,
    pair: { address: pool, dexId, url: pair.url, sym },
    market,
    trades,
    yourPnL,
    geckoNote,
  };
}

function enTexteSafe(s) {
  return String(s || '').replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));
}

/** Format helpers exported for dig / tests. */
export const _fmt = { fmtUsd, fmtPx, fmtPct };
