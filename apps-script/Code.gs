/**
 * myMarket — backend (Google Apps Script)
 * ---------------------------------------------------------------------------
 * Setup: Google Sheets → Extensions → Apps Script → paste this ENTIRE file
 * into Code.gs → Save → reload Sheet → menu "myMarket" → "1. Setup sheet".
 * Details: docs/SETUP.md
 *
 * Principle: backend returns RAW sheet data + quotes + earnings.
 * All calculations (positions, averages, P/L, shares) run on the frontend.
 */

const API_VERSION = 1;
const APP_VERSION = '1.5.0';

const SHEETS = {
  START: 'Start',
  STOCKS: 'Stocks',
  CRYPTO: 'Crypto',
  WATCHLIST: 'Watchlist',
  INSTRUMENTS: 'Instruments',
  CATEGORIES: 'Categories',
  CASH: 'Cash',
  SETTINGS: 'Settings',
  QUOTES: '_Quotes'
};

const LEGACY_SHEETS = {
  Stocks: 'Akcje',
  Crypto: 'Krypto',
  Instruments: 'Instrumenty',
  Categories: 'Kategorie',
  Cash: 'Gotówka',
  Settings: 'Ustawienia',
  _Quotes: '_Kursy'
};

const TX_HEADERS = ['Trade Date', 'Settle Date', 'Type', 'Ticker', 'Quantity', 'Price', 'Currency', 'Fee', 'FX PLN (auto)', 'Note'];
const TX_FIELDS = {
  tradedate: 'tradeDate', datatransakcji: 'tradeDate',
  settledate: 'settleDate', datarozliczenia: 'settleDate',
  type: 'type', typ: 'type',
  ticker: 'ticker',
  quantity: 'quantity', ilosc: 'quantity',
  price: 'price', cena: 'price',
  currency: 'currency', waluta: 'currency',
  fee: 'fee', prowizja: 'fee',
  fxplnauto: 'fxPln', fxpln: 'fxPln', kursplnauto: 'fxPln', kurspln: 'fxPln',
  note: 'note', notatka: 'note'
};
const TX_CANONICAL = {
  tradeDate: 'Trade Date', settleDate: 'Settle Date', type: 'Type', ticker: 'Ticker',
  quantity: 'Quantity', price: 'Price', currency: 'Currency', fee: 'Fee', fxPln: 'FX PLN (auto)', note: 'Note'
};

const INSTR_HEADERS = ['Ticker', 'Name', 'Category', 'Asset Class', 'Quote Symbol', 'Currency', 'Color'];
const INSTR_FIELDS = {
  ticker: 'ticker',
  name: 'name', nazwa: 'name',
  category: 'category', kategoria: 'category',
  assetclass: 'assetClass', klasaaktywa: 'assetClass',
  quotesymbol: 'symbol', symbolnotowan: 'symbol',
  currency: 'currency', waluta: 'currency',
  color: 'color', kolor: 'color'
};
const INSTR_CANONICAL = {
  ticker: 'Ticker', name: 'Name', category: 'Category', assetClass: 'Asset Class',
  symbol: 'Quote Symbol', currency: 'Currency', color: 'Color'
};

const CAT_HEADERS = ['Category', 'Color'];
const CAT_FIELDS = { category: 'name', kategoria: 'name', color: 'color', kolor: 'color' };
const CAT_CANONICAL = { name: 'Category', color: 'Color' };

const CASH_HEADERS = ['Currency', 'Balance', 'Description'];
const CASH_FIELDS = { currency: 'currency', waluta: 'currency', balance: 'amount', saldo: 'amount', description: 'label', opis: 'label' };
const CASH_CANONICAL = { currency: 'Currency', amount: 'Balance', label: 'Description' };

const WATCH_HEADERS = ['Ticker', 'Buy ≤', 'Sell ≥', 'Note'];
const WATCH_FIELDS = {
  ticker: 'ticker',
  buy: 'buyTarget', kup: 'buyTarget', kupno: 'buyTarget', cenadocelowa: 'buyTarget',
  sell: 'sellTarget', sprzedaj: 'sellTarget', sprzedaz: 'sellTarget',
  note: 'note', notatka: 'note'
};
const WATCH_CANONICAL = { ticker: 'Ticker', buyTarget: 'Buy ≤', sellTarget: 'Sell ≥', note: 'Note' };

const SETTINGS_HEADERS = ['Setting', 'Value', 'Description'];
const SETTINGS_FIELDS = { setting: 'key', ustawienie: 'key', value: 'val', wartosc: 'val', description: 'desc', opis: 'desc' };
const SETTINGS_CANONICAL = { key: 'Setting', val: 'Value', desc: 'Description' };

const SETTING_KEYS = {
  NAME: 'Portfolio Name',
  BASE: 'Base Currency',
  FRONTEND: 'App URL (Frontend)',
  API: 'API URL (Web App)'
};

const LEGACY_SETTING_KEYS = {
  'Nazwa portfela': SETTING_KEYS.NAME,
  'Waluta bazowa': SETTING_KEYS.BASE,
  'Adres aplikacji (frontend)': SETTING_KEYS.FRONTEND,
  'Adres API (Web App)': SETTING_KEYS.API
};

const PROP_TOKEN = 'API_TOKEN';

// ===========================================================================
// 1. API (Web App)
// ===========================================================================

function doGet(e) {
  const p = (e && e.parameter) || {};
  try {
    if (!checkToken_(p.token)) {
      return json_({ error: 'UNAUTHORIZED', message: 'Invalid or missing token. Generate a link in menu myMarket → 2. Connect app.' });
    }
    const action = p.action || 'portfolio';
    if (action === 'ping') return json_({ ok: true, apiVersion: API_VERSION, appVersion: APP_VERSION });
    if (action === 'portfolio') return json_(buildPortfolio_({ fresh: p.fresh === '1' }));
    return json_({ error: 'UNKNOWN_ACTION', message: 'Unknown action: ' + action });
  } catch (err) {
    return json_({ error: 'SERVER_ERROR', message: String((err && err.message) || err) });
  }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function checkToken_(token) {
  const expected = PropertiesService.getScriptProperties().getProperty(PROP_TOKEN);
  return !!expected && !!token && String(token) === expected;
}

function getSheetAny_(ss, name) {
  return ss.getSheetByName(name) || (LEGACY_SHEETS[name] ? ss.getSheetByName(LEGACY_SHEETS[name]) : null);
}

function buildPortfolio_(opts) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const tz = ss.getSpreadsheetTimeZone();
  const warnings = [];

  const settings = readSettings_(ss);
  const instruments = readInstruments_(ss, warnings);
  const transactions = readTransactions_(ss, SHEETS.STOCKS, 'STOCK', tz, warnings)
    .concat(readTransactions_(ss, SHEETS.CRYPTO, 'CRYPTO', tz, warnings));
  const cash = readCash_(ss, warnings);
  const categories = readCategories_(ss);
  const watchlist = readWatchlist_(ss);

  // Symbols to quote: open positions (net qty > 0) + Watchlist (deduplicated)
  const net = {};
  transactions.forEach(function (t) {
    net[t.ticker] = (net[t.ticker] || 0) + (t.type === 'BUY' ? t.quantity : -t.quantity);
  });
  const instrByTicker = {};
  instruments.forEach(function (i) { instrByTicker[i.ticker] = i; });

  const symbols = [];
  const stockSymbols = [];
  Object.keys(net).forEach(function (ticker) {
    if (net[ticker] <= 1e-9) return;
    const instr = instrByTicker[ticker];
    const sym = quoteSymbol_(instr, ticker, transactions);
    if (symbols.indexOf(sym) === -1) symbols.push(sym);
    const cls = instr ? instr.assetClass : (transactions.some(function (t) { return t.ticker === ticker && t.assetClass === 'CRYPTO'; }) ? 'CRYPTO' : 'STOCK');
    if (cls === 'STOCK' && stockSymbols.indexOf(sym) === -1) stockSymbols.push(sym);
  });

  watchlist.forEach(function (w) {
    const instr = instrByTicker[w.ticker];
    const isCrypto = (w.ticker.indexOf('-USD') !== -1) || (instr && instr.assetClass === 'CRYPTO');
    const sym = w.ticker.indexOf('-') !== -1 ? w.ticker : ((instr && instr.symbol) || (isCrypto ? w.ticker + '-USD' : w.ticker));
    if (symbols.indexOf(sym) === -1) symbols.push(sym);
    if (!isCrypto && (!instr || instr.assetClass === 'STOCK') && stockSymbols.indexOf(sym) === -1) stockSymbols.push(sym);
  });

  const quotes = symbols.length ? getQuotes_(symbols, !!(opts && opts.fresh)) : {};
  symbols.forEach(function (s) {
    if (!quotes[s]) warnings.push({ level: 'warn', where: SHEETS.INSTRUMENTS, message: 'No quote found for symbol ' + s + ' — check Quote Symbol or ticker.' });
  });

  const earnings = stockSymbols.length ? getEarnings_(stockSymbols, !!(opts && opts.fresh)) : {};

  return {
    apiVersion: API_VERSION,
    appVersion: APP_VERSION,
    generatedAt: new Date().toISOString(),
    portfolio: {
      name: settings[SETTING_KEYS.NAME] || 'My Portfolio',
      baseCurrency: String(settings[SETTING_KEYS.BASE] || 'USD').toUpperCase()
    },
    instruments: instruments,
    transactions: transactions,
    cash: cash,
    categories: categories,
    watchlist: watchlist,
    quotes: quotes,
    earnings: earnings,
    warnings: warnings
  };
}

function quoteSymbol_(instr, ticker, transactions) {
  if (instr && instr.symbol) return instr.symbol;
  const isCrypto = (instr && instr.assetClass === 'CRYPTO') ||
    transactions.some(function (t) { return t.ticker === ticker && t.assetClass === 'CRYPTO'; });
  return isCrypto ? ticker + '-USD' : ticker;
}

// ===========================================================================
// 2. READING SHEET DATA
// ===========================================================================

function normKey_(s) {
  return String(s || '').toLowerCase().replace(/ł/g, 'l')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

function readTable_(ss, name, fieldMap) {
  const sh = getSheetAny_(ss, name);
  if (!sh) return null;
  const values = sh.getDataRange().getValues();
  if (values.length < 2) return [];
  const header = values[0].map(function (h) { return fieldMap[normKey_(h)] || null; });
  const rows = [];
  for (let r = 1; r < values.length; r++) {
    const row = values[r];
    if (row.every(function (v) { return v === '' || v === null; })) continue;
    const obj = { _row: r + 1 };
    header.forEach(function (f, i) { if (f && obj[f] === undefined) obj[f] = row[i]; });
    rows.push(obj);
  }
  return rows;
}

function num_(v) {
  if (typeof v === 'number') return isFinite(v) ? v : null;
  if (v === null || v === undefined || v === '') return null;
  const s = String(v).replace(/[\s\u00A0]/g, '').replace(',', '.').replace(/[^0-9.\-]/g, '');
  const n = parseFloat(s);
  return isFinite(n) ? n : null;
}

function date_(v, tz) {
  if (v instanceof Date && !isNaN(v.getTime())) return Utilities.formatDate(v, tz, 'yyyy-MM-dd');
  if (v === null || v === undefined || v === '') return null;
  return String(v).trim();
}

function txType_(v) {
  const k = normKey_(v);
  if (['buy', 'kupno', 'kup', 'k', 'b'].indexOf(k) !== -1) return 'BUY';
  if (['sell', 'sprzedaz', 'sprzedam', 's'].indexOf(k) !== -1) return 'SELL';
  return null;
}

function assetClass_(v) {
  const k = normKey_(v);
  if (k === 'etf') return 'ETF';
  if (k === 'crypto' || k === 'krypto' || k === 'kryptowaluta') return 'CRYPTO';
  return 'STOCK';
}

function readTransactions_(ss, sheetName, assetClass, tz, warnings) {
  const rows = readTable_(ss, sheetName, TX_FIELDS);
  if (rows === null) return [];
  const out = [];
  rows.forEach(function (r) {
    const ticker = String(r.ticker || '').trim().toUpperCase();
    const type = txType_(r.type);
    const quantity = num_(r.quantity);
    const price = num_(r.price);
    const missing = [];
    if (!ticker) missing.push('Ticker');
    if (!type) missing.push('Type (BUY/SELL)');
    if (!(quantity > 0)) missing.push('Quantity');
    if (price === null || price < 0) missing.push('Price');
    if (missing.length) {
      warnings.push({ level: 'warn', where: sheetName + ' — row ' + r._row, message: 'Skipped row, missing/invalid: ' + missing.join(', ') });
      return;
    }
    out.push({
      source: sheetName,
      row: r._row,
      assetClass: assetClass,
      tradeDate: date_(r.tradeDate, tz),
      settleDate: date_(r.settleDate, tz),
      type: type,
      ticker: ticker,
      quantity: quantity,
      price: price,
      currency: String(r.currency || '').trim().toUpperCase() || null,
      fee: num_(r.fee) || 0,
      fxPln: num_(r.fxPln),
      note: r.note ? String(r.note) : ''
    });
  });
  return out;
}

function readInstruments_(ss, warnings) {
  const rows = readTable_(ss, SHEETS.INSTRUMENTS, INSTR_FIELDS) || [];
  const seen = {};
  const out = [];
  rows.forEach(function (r) {
    const ticker = String(r.ticker || '').trim().toUpperCase();
    if (!ticker) return;
    if (seen[ticker]) {
      warnings.push({ level: 'info', where: SHEETS.INSTRUMENTS + ' — row ' + r._row, message: 'Duplicate ticker ' + ticker + ' — first entry used.' });
      return;
    }
    seen[ticker] = true;
    out.push({
      ticker: ticker,
      name: String(r.name || '').trim() || ticker,
      category: String(r.category || '').trim() || null,
      assetClass: assetClass_(r.assetClass),
      symbol: String(r.symbol || '').trim().toUpperCase() || null,
      currency: String(r.currency || '').trim().toUpperCase() || null,
      color: normColor_(r.color),
      active: true
    });
  });
  return out;
}

function readCategories_(ss) {
  const rows = readTable_(ss, SHEETS.CATEGORIES, CAT_FIELDS) || [];
  return rows
    .filter(function (r) { return String(r.name || '').trim(); })
    .map(function (r) { return { name: String(r.name).trim(), color: normColor_(r.color) }; });
}

function readCash_(ss, warnings) {
  const rows = readTable_(ss, SHEETS.CASH, CASH_FIELDS) || [];
  const out = [];
  rows.forEach(function (r) {
    const amount = num_(r.amount);
    if (amount === null) return;
    out.push({
      currency: String(r.currency || 'USD').trim().toUpperCase(),
      amount: amount,
      label: String(r.label || '').trim()
    });
  });
  return out;
}

function readWatchlist_(ss) {
  const rows = readTable_(ss, SHEETS.WATCHLIST, WATCH_FIELDS);
  if (!rows) return [];
  const seen = {};
  const out = [];
  rows.forEach(function (r) {
    const ticker = String(r.ticker || '').trim().toUpperCase();
    if (!ticker || seen[ticker]) return;
    seen[ticker] = true;
    const buyTarget = num_(r.buyTarget);
    const sellTarget = num_(r.sellTarget);
    out.push({
      row: r._row,
      ticker: ticker,
      buyTarget: buyTarget !== null && buyTarget > 0 ? buyTarget : null,
      sellTarget: sellTarget !== null && sellTarget > 0 ? sellTarget : null,
      note: String(r.note || '').trim()
    });
  });
  return out;
}

function readSettings_(ss) {
  const sh = getSheetAny_(ss, SHEETS.SETTINGS);
  const out = {};
  if (!sh) return out;
  const values = sh.getDataRange().getValues();
  for (let r = 1; r < values.length; r++) {
    const rawKey = String(values[r][0] || '').trim();
    if (!rawKey) continue;
    const key = LEGACY_SETTING_KEYS[rawKey] || rawKey;
    out[key] = values[r][1];
  }
  return out;
}

function normColor_(v) {
  const s = String(v || '').trim();
  if (/^#?[0-9a-fA-F]{6}$/.test(s)) return (s[0] === '#' ? s : '#' + s).toUpperCase();
  return null;
}

// ===========================================================================
// 3. QUOTES (Yahoo Finance → fallback GOOGLEFINANCE) + cache
// ===========================================================================

function getQuotes_(symbols, fresh) {
  const cache = CacheService.getScriptCache();
  const result = {};
  let missing = [];

  if (!fresh) {
    const cached = cache.getAll(symbols.map(function (s) { return 'q_' + s; }));
    symbols.forEach(function (s) {
      const c = cached['q_' + s];
      if (c) result[s] = JSON.parse(c); else missing.push(s);
    });
  } else {
    missing = symbols.slice();
  }

  if (missing.length) {
    const fetched = fetchYahoo_(missing);
    const toCache = {};
    let anyOpen = false;
    missing.forEach(function (s) {
      const q = fetched[s];
      if (!q) return;
      result[s] = q;
      toCache['q_' + s] = JSON.stringify(q);
      if (q.marketState !== 'CLOSED') anyOpen = true;
    });
    if (Object.keys(toCache).length) cache.putAll(toCache, anyOpen ? 60 : 900);

    const still = missing.filter(function (s) { return !result[s]; });
    if (still.length) {
      const gf = fetchGoogleFinance_(still);
      still.forEach(function (s) { if (gf[s]) result[s] = gf[s]; });
    }
  }
  return result;
}

function fetchYahoo_(symbols) {
  const out = {};
  const reqs = symbols.map(function (s) {
    return {
      url: 'https://query1.finance.yahoo.com/v8/finance/chart/' + encodeURIComponent(s) +
        '?range=1d&interval=5m&includePrePost=true',
      muteHttpExceptions: true,
      headers: { 'User-Agent': 'Mozilla/5.0 (myMarket portfolio dashboard)' }
    };
  });
  let responses;
  try {
    responses = UrlFetchApp.fetchAll(reqs);
  } catch (e) {
    return out;
  }
  responses.forEach(function (res, i) {
    try {
      if (res.getResponseCode() !== 200) return;
      const data = JSON.parse(res.getContentText());
      const r = data && data.chart && data.chart.result && data.chart.result[0];
      if (r && r.meta && typeof r.meta.regularMarketPrice === 'number') out[symbols[i]] = parseYahooChart_(r);
    } catch (e) { /* skip single symbol */ }
  });
  return out;
}

function round_(v, d) {
  if (typeof v !== 'number' || !isFinite(v)) return null;
  const f = Math.pow(10, d);
  return Math.round(v * f) / f;
}

function first_() {
  for (let i = 0; i < arguments.length; i++) {
    if (arguments[i] !== undefined && arguments[i] !== null) return arguments[i];
  }
  return null;
}

function parseYahooChart_(r) {
  const m = r.meta || {};
  const now = Math.floor(Date.now() / 1000);
  const isCrypto = m.instrumentType === 'CRYPTOCURRENCY';
  const q = {
    symbol: m.symbol,
    currency: m.currency || null,
    regular: round_(m.regularMarketPrice, 6),
    regularTime: m.regularMarketTime || null,
    previousClose: round_(first_(m.chartPreviousClose, m.previousClose), 6),
    pre: null, preTime: null,
    post: null, postTime: null,
    marketState: isCrypto ? 'OPEN_24H' : 'CLOSED',
    source: 'yahoo',
    fetchedAt: now
  };

  if (!isCrypto) {
    const ts = r.timestamp || [];
    const quote = (r.indicators && r.indicators.quote && r.indicators.quote[0]) || {};
    const closes = quote.close || [];
    let i = ts.length - 1;
    while (i >= 0 && (closes[i] === null || closes[i] === undefined)) i--;
    if (i >= 0 && q.regularTime && ts[i] > q.regularTime + 60) {
      const off = m.gmtoffset || 0;
      const dayOf = function (t) { return Math.floor((t + off) / 86400); };
      if (dayOf(ts[i]) === dayOf(q.regularTime)) {
        q.post = round_(closes[i], 6); q.postTime = ts[i];
      } else {
        q.pre = round_(closes[i], 6); q.preTime = ts[i];
      }
    }
    const p = m.currentTradingPeriod;
    if (p && p.pre && p.regular && p.post) {
      if (now >= p.pre.start && now < p.pre.end) q.marketState = 'PRE';
      else if (now >= p.regular.start && now < p.regular.end) q.marketState = 'REGULAR';
      else if (now >= p.post.start && now < p.post.end) q.marketState = 'POST';
    }
  }
  return q;
}

function fetchGoogleFinance_(symbols) {
  const out = {};
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = getSheetAny_(ss, SHEETS.QUOTES);
  if (!sh) {
    sh = ss.insertSheet(SHEETS.QUOTES);
    sh.getRange(1, 1, 1, 4).setValues([['Symbol', 'GOOGLEFINANCE Symbol', 'Price', 'Prev Close']]).setFontWeight('bold');
    sh.hideSheet();
  }
  let data = sh.getDataRange().getValues();
  const index = {};
  for (let r = 1; r < data.length; r++) if (data[r][0]) index[data[r][0]] = r + 1;

  let added = false;
  symbols.forEach(function (s) {
    if (index[s]) return;
    const row = Math.max(sh.getLastRow(), 1) + 1;
    sh.getRange(row, 1, 1, 2).setValues([[s, gfSymbol_(s)]]);
    sh.getRange(row, 3, 1, 2).setFormulas([[
      '=IFERROR(GOOGLEFINANCE(B' + row + ',"price"),"")',
      '=IFERROR(GOOGLEFINANCE(B' + row + ',"closeyest"),"")'
    ]]);
    index[s] = row;
    added = true;
  });
  if (added) {
    SpreadsheetApp.flush();
    Utilities.sleep(2000);
  }
  data = sh.getDataRange().getValues();
  const now = Math.floor(Date.now() / 1000);
  symbols.forEach(function (s) {
    const row = data[index[s] - 1];
    if (!row) return;
    const price = num_(row[2]);
    if (price === null) return;
    out[s] = {
      symbol: s, currency: null, regular: price, regularTime: now,
      previousClose: num_(row[3]), pre: null, preTime: null, post: null, postTime: null,
      marketState: 'UNKNOWN', source: 'googlefinance', fetchedAt: now
    };
  });
  return out;
}

function gfSymbol_(s) {
  const m = /^([A-Z]+)-([A-Z]{3})$/.exec(s);
  return m ? 'CURRENCY:' + m[1] + m[2] : s;
}

// ===========================================================================
// 3b. UPCOMING EARNINGS DATES (Yahoo Finance quote, 6h cache)
// ===========================================================================

function getEarnings_(symbols, fresh) {
  const result = {};
  try {
    const cache = CacheService.getScriptCache();
    let missing = [];

    if (!fresh) {
      const cached = cache.getAll(symbols.map(function (s) { return 'e_' + s; }));
      symbols.forEach(function (s) {
        const c = cached['e_' + s];
        if (c !== undefined && c !== null) {
          const parsed = JSON.parse(c);
          if (parsed) result[s] = parsed;
        } else {
          missing.push(s);
        }
      });
    } else {
      missing = symbols.slice();
    }

    if (missing.length) {
      const fetched = fetchYahooEarnings_(missing);
      const toCache = {};
      missing.forEach(function (s) {
        const item = fetched[s] || null;
        if (item) result[s] = item;
        toCache['e_' + s] = JSON.stringify(item);
      });
      if (Object.keys(toCache).length) cache.putAll(toCache, 21600); // 6h (CacheService max TTL)
    }
  } catch (e) {
    // Missing earnings never block main API response
  }
  return result;
}

function getYahooSession_() {
  const cache = CacheService.getScriptCache();
  const cached = cache.get('yf_session');
  if (cached) {
    try { return JSON.parse(cached); } catch (e) { /* refresh */ }
  }
  const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
  const r1 = UrlFetchApp.fetch('https://fc.yahoo.com', {
    muteHttpExceptions: true,
    followRedirects: false,
    headers: { 'User-Agent': ua }
  });
  const hdrs = r1.getAllHeaders();
  const rawCookies = hdrs['Set-Cookie'] || hdrs['set-cookie'];
  if (!rawCookies) return null;
  const arr = Array.isArray(rawCookies) ? rawCookies : [rawCookies];
  const cookie = arr.map(function (c) { return String(c).split(';')[0]; }).join('; ');
  if (!cookie) return null;

  const r2 = UrlFetchApp.fetch('https://query1.finance.yahoo.com/v1/test/getcrumb', {
    muteHttpExceptions: true,
    headers: { 'User-Agent': ua, 'Cookie': cookie }
  });
  if (r2.getResponseCode() !== 200) return null;
  const crumb = r2.getContentText().trim();
  if (!crumb || crumb.length > 40) return null;

  const sess = { cookie: cookie, crumb: crumb, ua: ua };
  cache.put('yf_session', JSON.stringify(sess), 21600);
  return sess;
}

function fetchYahooEarnings_(symbols) {
  const out = {};
  const sess = getYahooSession_();
  if (!sess) return out;
  const url = 'https://query1.finance.yahoo.com/v7/finance/quote?symbols=' +
    encodeURIComponent(symbols.join(',')) +
    '&fields=earningsTimestamp,earningsTimestampStart,earningsTimestampEnd,isEarningsDateEstimate&crumb=' +
    encodeURIComponent(sess.crumb);
  const res = UrlFetchApp.fetch(url, {
    muteHttpExceptions: true,
    headers: { 'User-Agent': sess.ua, 'Cookie': sess.cookie }
  });
  if (res.getResponseCode() !== 200) return out;
  const data = JSON.parse(res.getContentText());
  const list = (data && data.quoteResponse && data.quoteResponse.result) || [];
  const cutoff = Math.floor(Date.now() / 1000) - 86400;

  list.forEach(function (q) {
    const candidates = [q.earningsTimestamp, q.earningsTimestampStart, q.earningsTimestampEnd]
      .filter(function (t) { return typeof t === 'number' && isFinite(t) && t >= cutoff; })
      .sort(function (a, b) { return a - b; });
    if (!candidates.length) return;
    const d = new Date(candidates[0] * 1000);
    out[q.symbol] = {
      date: Utilities.formatDate(d, 'America/New_York', 'yyyy-MM-dd'),
      estimate: !!q.isEarningsDateEstimate,
      source: 'yahoo'
    };
  });
  return out;
}

// ===========================================================================
// 4. MENU & SELECTIVE SHEET MIGRATION / SETUP
// ===========================================================================

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('myMarket')
    .addItem('1. Setup sheet', 'setupSpreadsheet')
    .addItem('2. Connect app (link + QR)', 'showAppLink')
    .addSeparator()
    .addItem('Test quotes', 'testQuotes')
    .addItem('Regenerate token (invalidates old links)', 'regenerateToken')
    .addToUi();
}

function ensureToken_() {
  const props = PropertiesService.getScriptProperties();
  let t = props.getProperty(PROP_TOKEN);
  if (!t) {
    t = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '').slice(0, 8);
    props.setProperty(PROP_TOKEN, t);
  }
  return t;
}

function regenerateToken() {
  const ui = SpreadsheetApp.getUi();
  if (ui.alert('myMarket', 'Generating a new token will invalidate all existing app links. Continue?', ui.ButtonSet.YES_NO) !== ui.Button.YES) return;
  PropertiesService.getScriptProperties().deleteProperty(PROP_TOKEN);
  ensureToken_();
  ui.alert('New token generated. Use "2. Connect app" to get the new link.');
}

function setupSpreadsheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ui = SpreadsheetApp.getUi();
  const hasExisting = !!(getSheetAny_(ss, SHEETS.STOCKS) || getSheetAny_(ss, SHEETS.INSTRUMENTS));
  let sample = false;
  if (!hasExisting) {
    const addSample = ui.alert('myMarket — Sheet Setup',
      'I will create the sheets (Stocks, Crypto, Watchlist, Instruments, Categories, Cash, Settings).\n\nAdd sample data? (You can edit or delete it later.)',
      ui.ButtonSet.YES_NO_CANCEL);
    if (addSample === ui.Button.CANCEL || addSample === ui.Button.CLOSE) return;
    sample = addSample === ui.Button.YES;
  }

  const changes = [];
  // 1. Rename legacy Polish tabs to English (100% non-destructive)
  Object.keys(LEGACY_SHEETS).forEach(function (enName) {
    renameLegacySheet_(ss, LEGACY_SHEETS[enName], enName, changes);
  });

  setupStartSheet_(ss);

  // 2. Ensure tabs exist, translate legacy headers, append missing columns
  const stocks = ensureSheet_(ss, SHEETS.STOCKS, TX_HEADERS, '#2563EB', changes, TX_FIELDS, TX_CANONICAL);
  const crypto = ensureSheet_(ss, SHEETS.CRYPTO, TX_HEADERS, '#F7931A', changes, TX_FIELDS, TX_CANONICAL);
  const watch = ensureSheet_(ss, SHEETS.WATCHLIST, WATCH_HEADERS, '#0EA5E9', changes, WATCH_FIELDS, WATCH_CANONICAL);
  const instr = ensureSheet_(ss, SHEETS.INSTRUMENTS, INSTR_HEADERS, '#10B981', changes, INSTR_FIELDS, INSTR_CANONICAL);
  const cats = ensureSheet_(ss, SHEETS.CATEGORIES, CAT_HEADERS, '#7C3AED', changes, CAT_FIELDS, CAT_CANONICAL);
  const cash = ensureSheet_(ss, SHEETS.CASH, CASH_HEADERS, '#64748B', changes, CASH_FIELDS, CASH_CANONICAL);
  const settings = ensureSheet_(ss, SHEETS.SETTINGS, SETTINGS_HEADERS, '#0F172A', changes, SETTINGS_FIELDS, SETTINGS_CANONICAL);

  // 3. Remove obsolete columns selectively
  removeUnusedColumns_(watch, ['nazwa', 'name', 'kategoria', 'category'], changes);
  removeUnusedColumns_(instr, ['aktywny', 'active'], changes);

  // 4. Migrate legacy Polish enum values in data rows (non-destructive)
  migrateColumnValues_(stocks, 3, { kupno: 'BUY', sprzedaz: 'SELL' }, changes);
  migrateColumnValues_(crypto, 3, { kupno: 'BUY', sprzedaz: 'SELL' }, changes);
  migrateColumnValues_(instr, 4, { akcja: 'Stock', krypto: 'Crypto' }, changes);
  migrateSettingsKeys_(settings, changes);

  // 5. Apply formatting and dropdown validations
  [stocks, crypto].forEach(formatTxSheet_);
  formatWatchlistSheet_(watch);
  formatCategoriesSheet_(cats);
  formatInstrumentsSheet_(instr);
  cash.getRange('B2:B').setNumberFormat('#,##0.00');

  if (settings.getLastRow() < 2) {
    settings.getRange(2, 1, 4, 3).setValues([
      [SETTING_KEYS.NAME, 'My Portfolio', 'Displayed in exports and browser title'],
      [SETTING_KEYS.BASE, 'USD', 'Base valuation currency (v1: USD)'],
      [SETTING_KEYS.FRONTEND, '', 'e.g. https://your-login.github.io/myMarket/'],
      [SETTING_KEYS.API, '', 'Paste deployed Web App URL ending in /exec']
    ]);
    settings.setColumnWidth(1, 200); settings.setColumnWidth(2, 380); settings.setColumnWidth(3, 420);
  }

  if (sample) insertSampleData_(stocks, crypto, instr, cats, cash);

  // Remove default empty sheet if present
  ['Arkusz1', 'Sheet1'].forEach(function (n) {
    const sh = ss.getSheetByName(n);
    if (sh && sh.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(sh);
  });

  ensureToken_();
  if (!hasExisting) {
    ss.setActiveSheet(ss.getSheetByName(SHEETS.START));
    ui.alert('Done!', 'Your sheet is ready. Next step: deploy Apps Script as a Web App (see "Start" tab), then run myMarket → "2. Connect app".', ui.ButtonSet.OK);
  } else {
    const msg = changes.length
      ? 'Sheet updated selectively (all your data stayed intact):\n• ' + changes.join('\n• ')
      : 'Sheet is already up to date — all tabs, headers, and dropdowns are ready.';
    ui.alert('Done!', msg, ui.ButtonSet.OK);
  }
}

function renameLegacySheet_(ss, legacyName, newName, changes) {
  const oldSh = ss.getSheetByName(legacyName);
  if (oldSh && !ss.getSheetByName(newName)) {
    oldSh.setName(newName);
    if (changes) changes.push('Renamed tab: ' + legacyName + ' → ' + newName);
  }
}

function ensureSheet_(ss, name, headers, tabColor, changes, fieldMap, canonicalMap) {
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    if (changes) changes.push('Added tab: ' + name);
  }
  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, headers.length).setValues([headers]);
  } else {
    const lastCol = sh.getLastColumn();
    const row1 = sh.getRange(1, 1, 1, lastCol).getValues()[0];
    let translated = false;
    if (fieldMap && canonicalMap) {
      const updated = row1.map(function (h) {
        const field = fieldMap[normKey_(h)];
        const canon = field && canonicalMap[field];
        if (canon && String(h).trim() !== canon) {
          translated = true;
          return canon;
        }
        return h;
      });
      if (translated) {
        sh.getRange(1, 1, 1, lastCol).setValues([updated]);
        if (changes) changes.push(name + ' — updated headers to English');
      }
    }
    const existing = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(normKey_);
    const missing = headers.filter(function (h) { return existing.indexOf(normKey_(h)) === -1; });
    if (missing.length) {
      sh.getRange(1, lastCol + 1, 1, missing.length).setValues([missing]);
      if (changes) changes.push(name + ' — added columns: ' + missing.join(', '));
    }
  }
  sh.getRange(1, 1, 1, sh.getLastColumn() || headers.length)
    .setFontWeight('bold').setBackground('#F1F5F9').setFontColor('#0F172A');
  sh.setFrozenRows(1);
  if (tabColor) sh.setTabColor(tabColor);
  return sh;
}

function removeUnusedColumns_(sh, obsoleteKeys, changes) {
  if (sh.getLastRow() === 0) return;
  const lastCol = sh.getLastColumn();
  if (lastCol === 0) return;
  const headers = sh.getRange(1, 1, 1, lastCol).getValues()[0];
  const removed = [];
  for (let c = headers.length; c >= 1; c--) {
    if (obsoleteKeys.indexOf(normKey_(headers[c - 1])) !== -1) {
      removed.push(String(headers[c - 1]));
      sh.deleteColumn(c);
    }
  }
  if (removed.length && changes) {
    changes.push(sh.getName() + ' — removed unused columns: ' + removed.reverse().join(', '));
  }
}

function migrateColumnValues_(sh, colIndex, mapByNorm, changes) {
  const lastRow = sh.getLastRow();
  if (lastRow < 2) return;
  const rng = sh.getRange(2, colIndex, lastRow - 1, 1);
  const vals = rng.getValues();
  let count = 0;
  for (let i = 0; i < vals.length; i++) {
    const k = normKey_(vals[i][0]);
    if (mapByNorm[k]) {
      vals[i][0] = mapByNorm[k];
      count++;
    }
  }
  if (count > 0) {
    // Clear old validation temporarily so new English values write cleanly
    rng.clearDataValidations();
    rng.setValues(vals);
    if (changes) changes.push(sh.getName() + ' — migrated ' + count + ' values to English');
  }
}

const SETTING_DESCRIPTIONS = {};
SETTING_DESCRIPTIONS[SETTING_KEYS.NAME] = 'Displayed in exports and browser title';
SETTING_DESCRIPTIONS[SETTING_KEYS.BASE] = 'Base valuation currency (v1: USD)';
SETTING_DESCRIPTIONS[SETTING_KEYS.FRONTEND] = 'e.g. https://your-login.github.io/myMarket/';
SETTING_DESCRIPTIONS[SETTING_KEYS.API] = 'Paste deployed Web App URL ending in /exec';

function migrateSettingsKeys_(sh, changes) {
  const lastRow = sh.getLastRow();
  if (lastRow < 2) return;
  const keyRng = sh.getRange(2, 1, lastRow - 1, 1);
  const descRng = sh.getRange(2, 3, lastRow - 1, 1);
  const keys = keyRng.getValues();
  const descs = descRng.getValues();
  let keyCount = 0;
  let descCount = 0;
  for (let i = 0; i < keys.length; i++) {
    const raw = String(keys[i][0] || '').trim();
    const mapped = LEGACY_SETTING_KEYS[raw] || raw;
    if (LEGACY_SETTING_KEYS[raw]) {
      keys[i][0] = mapped;
      keyCount++;
    }
    if (SETTING_DESCRIPTIONS[mapped] && String(descs[i][0] || '').trim() !== SETTING_DESCRIPTIONS[mapped]) {
      descs[i][0] = SETTING_DESCRIPTIONS[mapped];
      descCount++;
    }
  }
  if (keyCount > 0) keyRng.setValues(keys);
  if (descCount > 0) descRng.setValues(descs);
  if ((keyCount > 0 || descCount > 0) && changes) {
    changes.push(sh.getName() + ' — updated setting labels & descriptions to English');
  }
}

function formatTxSheet_(sh) {
  sh.getRange('A2:B').setNumberFormat('yyyy-mm-dd');
  sh.getRange('E2:E').setNumberFormat('General');
  sh.getRange('F2:F').setNumberFormat('#,##0.00');
  sh.getRange('H2:H').setNumberFormat('#,##0.00');
  sh.getRange('I2:I').setNumberFormat('0.0000').setBackground('#F8FAFC');
  const rules = [
    { range: 'C2:C', rule: SpreadsheetApp.newDataValidation().requireValueInList(['BUY', 'SELL'], true).setAllowInvalid(false).build() },
    { range: 'G2:G', rule: SpreadsheetApp.newDataValidation().requireValueInList(['USD', 'PLN', 'EUR'], true).build() },
    { range: 'A2:B', rule: SpreadsheetApp.newDataValidation().requireDate().build() }
  ];
  rules.forEach(function (x) { sh.getRange(x.range).setDataValidation(x.rule); });
  const instr = sh.getParent().getSheetByName(SHEETS.INSTRUMENTS);
  if (instr) {
    sh.getRange('D2:D').setDataValidation(
      SpreadsheetApp.newDataValidation().requireValueInRange(instr.getRange('A2:A'), true).setAllowInvalid(true).build());
  }
  [110, 110, 85, 90, 95, 105, 80, 85, 115, 260].forEach(function (w, i) { sh.setColumnWidth(i + 1, w); });
}

function formatWatchlistSheet_(sh) {
  sh.getRange('B2:C').setNumberFormat('#,##0.00');
  const instr = sh.getParent().getSheetByName(SHEETS.INSTRUMENTS);
  if (instr) {
    sh.getRange('A2:A').setDataValidation(
      SpreadsheetApp.newDataValidation().requireValueInRange(instr.getRange('A2:A'), true).setAllowInvalid(true).build());
  }
  [100, 105, 110, 360].forEach(function (w, i) { sh.setColumnWidth(i + 1, w); });
}

function formatCategoriesSheet_(sh) {
  [240, 110].forEach(function (w, i) { sh.setColumnWidth(i + 1, w); });
}

function formatInstrumentsSheet_(sh) {
  const ss = sh.getParent();
  const cats = ss.getSheetByName(SHEETS.CATEGORIES);
  if (cats) {
    sh.getRange('C2:C').setDataValidation(
      SpreadsheetApp.newDataValidation().requireValueInRange(cats.getRange('A2:A'), true).setAllowInvalid(true).build());
  }
  sh.getRange('D2:D').setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(['Stock', 'ETF', 'Crypto'], true).build());
  sh.getRange('F2:F').setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(['USD', 'PLN', 'EUR'], true).build());
  [90, 220, 220, 105, 125, 80, 100].forEach(function (w, i) { sh.setColumnWidth(i + 1, w); });

  // Refresh ticker dropdowns in Stocks, Crypto, and Watchlist
  [SHEETS.STOCKS, SHEETS.CRYPTO].forEach(function (n) {
    const t = ss.getSheetByName(n);
    if (t) t.getRange('D2:D').setDataValidation(
      SpreadsheetApp.newDataValidation().requireValueInRange(sh.getRange('A2:A'), true).setAllowInvalid(true).build());
  });
  const watch = ss.getSheetByName(SHEETS.WATCHLIST);
  if (watch) {
    watch.getRange('A2:A').setDataValidation(
      SpreadsheetApp.newDataValidation().requireValueInRange(sh.getRange('A2:A'), true).setAllowInvalid(true).build());
  }
}

function setupStartSheet_(ss) {
  let sh = ss.getSheetByName(SHEETS.START);
  if (!sh) sh = ss.insertSheet(SHEETS.START, 0);
  sh.clear();
  const lines = [
    ['myMarket — Quick Guide'],
    [''],
    ['TABS'],
    ['• Stocks — stock & ETF trades (BUY / SELL). One trade = one row.'],
    ['• Crypto — crypto trades (e.g. BTC). Same columns as Stocks, fractional quantities supported.'],
    ['• Watchlist — watched tickers (dropdown from Instruments) with Buy ≤ / Sell ≥ price targets and notes.'],
    ['• Instruments — dictionary: Name, Category (dropdown from Categories), Asset Class, optional Quote Symbol & #HEX Color.'],
    ['• Categories — category names and optional #HEX colors for the "By category" view.'],
    ['• Cash — manual cash reserve balance.'],
    ['• Settings — portfolio name, base currency, frontend URL, Web App API URL.'],
    [''],
    ['DEPLOYMENT (one-time)'],
    ['1. Extensions → Apps Script → Deploy → New deployment.'],
    ['2. Type: Web app. Execute as: Me. Who has access: Anyone. → Deploy → authorize access.'],
    ['3. Copy the Web app URL (ending in /exec) and paste it into Settings → API URL (Web App).'],
    ['4. Enter your frontend URL in Settings → App URL (Frontend).'],
    ['5. Menu myMarket → 2. Connect app → scan QR on iPhone or copy link into Settings inside the PWA icon.'],
    [''],
    ['SECURITY: data access requires the secret token in your link. Never share the link. To revoke: myMarket → Regenerate token.'],
    ['After updating Code.gs: Deploy → Manage deployments → edit → Version: New version → Deploy (URL stays the same).']
  ];
  sh.getRange(1, 1, lines.length, 1).setValues(lines);
  sh.getRange('A1').setFontSize(16).setFontWeight('bold');
  ['A3', 'A12'].forEach(function (a) { sh.getRange(a).setFontWeight('bold').setFontColor('#2563EB'); });
  sh.setColumnWidth(1, 900);
  sh.setTabColor('#94A3B8');
}

function insertSampleData_(stocks, crypto, instr, cats, cash) {
  if (cats.getLastRow() < 2) {
    cats.getRange(2, 1, 5, 2).setValues([
      ['Semiconductors & AI Hardware', '#10B981'],
      ['Platforms / AI Ads', '#2563EB'],
      ['Cloud / AI Infrastructure', '#F97316'],
      ['Software / AI SaaS', '#06B6D4'],
      ['Crypto', '#F7931A']
    ]);
  }
  if (instr.getLastRow() < 2) {
    instr.getRange(2, 1, 7, 7).setValues([
      ['META', 'Meta Platforms, Inc.', 'Platforms / AI Ads', 'Stock', '', 'USD', '#2563EB'],
      ['NVDA', 'NVIDIA Corporation', 'Semiconductors & AI Hardware', 'Stock', '', 'USD', '#10B981'],
      ['AVGO', 'Broadcom Inc.', 'Semiconductors & AI Hardware', 'Stock', '', 'USD', '#E11D48'],
      ['ORCL', 'Oracle Corporation', 'Cloud / AI Infrastructure', 'Stock', '', 'USD', '#F97316'],
      ['MKSI', 'MKS Inc.', 'Semiconductors & AI Hardware', 'Stock', '', 'USD', '#7C3AED'],
      ['NOW', 'ServiceNow, Inc.', 'Software / AI SaaS', 'Stock', '', 'USD', '#06B6D4'],
      ['BTC', 'Bitcoin', 'Crypto', 'Crypto', 'BTC-USD', 'USD', '#F7931A']
    ]);
  }
  if (stocks.getLastRow() < 2) {
    const d = function (s) { return new Date(s + 'T12:00:00'); };
    stocks.getRange(2, 1, 7, 10).setValues([
      [d('2026-02-10'), d('2026-02-11'), 'BUY', 'META', 5, 549.95, 'USD', 0, '', ''],
      [d('2026-03-04'), d('2026-03-05'), 'BUY', 'NVDA', 10, 180.10, 'USD', 0, '', ''],
      [d('2026-05-20'), d('2026-05-21'), 'BUY', 'NVDA', 5, 189.55, 'USD', 0, '', ''],
      [d('2026-04-15'), d('2026-04-16'), 'BUY', 'AVGO', 6, 324.47, 'USD', 0, '', ''],
      [d('2026-06-02'), d('2026-06-03'), 'BUY', 'ORCL', 15, 127.44, 'USD', 0, '', ''],
      [d('2026-07-08'), d('2026-07-09'), 'BUY', 'MKSI', 5, 212.00, 'USD', 0, '', ''],
      [d('2026-08-19'), d('2026-08-20'), 'BUY', 'NOW', 10, 92.60, 'USD', 0, '', 'post-split']
    ]);
  }
  if (crypto.getLastRow() < 2) {
    crypto.getRange(2, 1, 1, 10).setValues([[new Date('2026-01-15T12:00:00'), new Date('2026-01-15T12:00:00'), 'BUY', 'BTC', 0.01, 95000, 'USD', 0, '', 'sample']]);
  }
  if (cash.getLastRow() < 2) {
    cash.getRange(2, 1, 1, 3).setValues([['USD', 1180, 'Broker cash reserve']]);
  }
}

function getApiUrl_() {
  const s = readSettings_(SpreadsheetApp.getActiveSpreadsheet());
  const fromSettings = String(s[SETTING_KEYS.API] || '').trim();
  if (fromSettings) return fromSettings;
  try { return ScriptApp.getService().getUrl() || ''; } catch (e) { return ''; }
}

function showAppLink() {
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const s = readSettings_(ss);
  const api = getApiUrl_();
  if (!api || !/\/exec$/.test(api)) {
    ui.alert('Missing API URL',
      'First deploy the script as a Web App (Deploy → New deployment → Web app, access: Anyone), ' +
      'then paste the /exec URL into Settings → "' + SETTING_KEYS.API + '".', ui.ButtonSet.OK);
    return;
  }
  let front = String(s[SETTING_KEYS.FRONTEND] || '').trim();
  if (!front) {
    ui.alert('Missing App URL', 'Fill in Settings → "' + SETTING_KEYS.FRONTEND + '" (e.g. https://your-login.github.io/myMarket/).', ui.ButtonSet.OK);
    return;
  }
  const token = ensureToken_();
  const link = front.replace(/#.*$/, '') + '#connect?api=' + encodeURIComponent(api) + '&token=' + encodeURIComponent(token);

  const html = HtmlService.createHtmlOutput(
    '<div style="font-family:Inter,Arial,sans-serif;font-size:13px;color:#0f172a">' +
    '<p style="margin:0 0 8px">Scan the QR code with your iPhone or copy the link. <b>Do not share it</b> — it contains your secret token.</p>' +
    '<div id="qr" style="display:flex;justify-content:center;margin:12px 0"></div>' +
    '<textarea id="l" readonly style="width:100%;height:70px;font-size:11px">' + link.replace(/</g, '&lt;') + '</textarea>' +
    '<div style="display:flex;gap:8px;margin-top:8px">' +
    '<button onclick="var t=document.getElementById(\'l\');t.select();document.execCommand(\'copy\');this.textContent=\'Copied ✓\'">Copy link</button>' +
    '<a href="' + link.replace(/"/g, '&quot;') + '" target="_blank"><button>Open</button></a></div>' +
    '<script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>' +
    '<script>new QRCode(document.getElementById("qr"),{text:document.getElementById("l").value,width:220,height:220,correctLevel:QRCode.CorrectLevel.L});</script>' +
    '</div>'
  ).setWidth(420).setHeight(470);
  ui.showModalDialog(html, 'Connect myMarket app');
}

function testQuotes() {
  const data = buildPortfolio_({ fresh: true });
  const lines = Object.keys(data.quotes).map(function (s) {
    const q = data.quotes[s];
    const e = data.earnings && data.earnings[s];
    let ext = '';
    if (q.pre !== null) ext = ' | pre: ' + q.pre;
    if (q.post !== null) ext = ' | post: ' + q.post;
    const earn = e ? ' | earnings: ' + e.date + (e.estimate ? ' (est.)' : '') : '';
    return s + ': ' + q.regular + ' ' + (q.currency || '') + ext + earn + ' [' + q.source + ', ' + q.marketState + ']';
  });
  const warn = data.warnings.map(function (w) { return '⚠ ' + w.where + ': ' + w.message; });
  SpreadsheetApp.getUi().alert('Test quotes', (lines.join('\n') || 'No open positions or watchlist items.') + (warn.length ? '\n\n' + warn.join('\n') : ''), SpreadsheetApp.getUi().ButtonSet.OK);
}
