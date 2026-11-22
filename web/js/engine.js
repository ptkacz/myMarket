/* myMarket — silnik obliczeń portfela (czyste funkcje, bez DOM)
 *
 * compute(payload, opts) → pozycje, gotówka, sumy, ostrzeżenia
 * view(result, state)    → elementy wykresu/legendy wg aktualnych przełączników
 *
 * Metoda kosztu (v1): średnia ważona. Prowizja kupna zwiększa koszt,
 * prowizja sprzedaży zmniejsza wynik zrealizowany.
 */
(function (MM) {
  'use strict';

  const PALETTE = ['#2563EB', '#10B981', '#E11D48', '#F97316', '#7C3AED', '#06B6D4',
    '#EAB308', '#DB2777', '#0D9488', '#4F46E5', '#84CC16', '#9333EA', '#0EA5E9', '#B45309'];
  const CASH_COLOR = '#64748B';
  const EPS = 1e-9;

  function compute(payload, opts = {}) {
    const usePrePost = !!opts.usePrePost;
    const base = (payload.portfolio && payload.portfolio.baseCurrency) || 'USD';
    const warnings = (payload.warnings || []).slice();

    const instr = {};
    (payload.instruments || []).forEach(i => { instr[i.ticker] = i; });
    const catColors = {};
    (payload.categories || []).forEach(c => { if (c.color) catColors[c.name] = c.color; });

    // --- 1. Agregacja transakcji ---
    const txs = (payload.transactions || []).slice().sort((a, b) =>
      String(a.tradeDate || '').localeCompare(String(b.tradeDate || '')) ||
      String(a.source).localeCompare(String(b.source)) || (a.row - b.row));

    const map = new Map();
    const currencyWarned = new Set();
    let realizedTotal = 0;

    txs.forEach(t => {
      let p = map.get(t.ticker);
      if (!p) {
        p = { ticker: t.ticker, txAssetClass: t.assetClass, qty: 0, cost: 0, realized: 0, fees: 0, buys: 0, sells: 0, firstDate: t.tradeDate, lastDate: t.tradeDate };
        map.set(t.ticker, p);
      }
      p.lastDate = t.tradeDate || p.lastDate;
      p.fees += t.fee || 0;

      if (t.currency && t.currency !== base && !currencyWarned.has(t.ticker)) {
        currencyWarned.add(t.ticker);
        warnings.push({ level: 'warn', where: `${t.source} — ${t.ticker}`, message: `Waluta ${t.currency} ≠ ${base}. Wersja 1.0 liczy wszystko w ${base} — wynik może być niepoprawny.` });
      }

      if (t.type === 'BUY') {
        p.qty += t.quantity;
        p.cost += t.quantity * t.price + (t.fee || 0);
        p.buys++;
      } else {
        let q = t.quantity;
        if (q > p.qty + EPS) {
          warnings.push({ level: 'warn', where: `${t.source} — wiersz ${t.row}`, message: `Sprzedaż ${t.quantity} ${t.ticker} przekracza posiadaną ilość (${+p.qty.toFixed(8)}). Uwzględniono tylko posiadaną ilość.` });
          q = p.qty;
        }
        if (p.qty > EPS && q > 0) {
          const avg = p.cost / p.qty;
          const r = q * t.price - (t.fee || 0) - avg * q;
          p.realized += r;
          realizedTotal += r;
          p.cost -= avg * q;
          p.qty -= q;
        }
        if (p.qty < EPS) { p.qty = 0; p.cost = 0; }
        p.sells++;
      }
    });

    // --- 2. Wycena otwartych pozycji ---
    const quotes = payload.quotes || {};
    const positions = [];
    const closed = [];
    const usedColors = new Set(Object.values(instr).map(i => i.color).filter(Boolean));
    let paletteIdx = 0;
    const nextColor = () => {
      for (let k = 0; k < PALETTE.length; k++) {
        const c = PALETTE[(paletteIdx + k) % PALETTE.length];
        if (!usedColors.has(c)) { paletteIdx += k + 1; usedColors.add(c); return c; }
      }
      return PALETTE[(paletteIdx++) % PALETTE.length];
    };

    map.forEach(p => {
      const meta = instr[p.ticker];
      if (p.qty <= EPS) {
        closed.push({ ticker: p.ticker, name: meta ? meta.name : p.ticker, realized: p.realized, fees: p.fees, lastDate: p.lastDate });
        return;
      }
      if (!meta) {
        warnings.push({ level: 'info', where: 'Instrumenty', message: `Brak ${p.ticker} w zakładce „Instrumenty” — użyto domyślnej nazwy i kategorii.` });
      }
      const assetClass = meta ? meta.assetClass : (p.txAssetClass || 'STOCK');
      const isCrypto = assetClass === 'CRYPTO';
      const symbol = (meta && meta.symbol) || (isCrypto ? `${p.ticker}-USD` : p.ticker);
      const q = quotes[symbol] || null;
      const avgCost = p.cost / p.qty;

      let price = null, priceSource = 'none', priceTime = null;
      if (q && MM.fmt.isNum(q.regular)) {
        price = q.regular;
        priceSource = q.source === 'googlefinance' ? 'delayed' : 'regular';
        priceTime = q.regularTime;
      }
      let ext = null;
      if (q && MM.fmt.isNum(q.post)) ext = { type: 'post', price: q.post, time: q.postTime };
      else if (q && MM.fmt.isNum(q.pre)) ext = { type: 'pre', price: q.pre, time: q.preTime };
      if (ext && MM.fmt.isNum(q.regular)) ext.changePct = (ext.price / q.regular - 1) * 100;
      if (usePrePost && ext) { price = ext.price; priceSource = ext.type; priceTime = ext.time; }

      if (price === null) {
        price = avgCost;
        priceSource = 'none';
        warnings.push({ level: 'warn', where: p.ticker, message: `Brak aktualnego kursu ${symbol} — wartość liczona po średniej cenie zakupu.` });
      }

      const value = p.qty * price;
      const pnl = value - p.cost;
      const prevClose = q && MM.fmt.isNum(q.previousClose) ? q.previousClose : null;
      const daily = prevClose !== null && priceSource !== 'none' ? p.qty * (price - prevClose) : null;
      const dailyPct = prevClose ? (price / prevClose - 1) * 100 : null;

      positions.push({
        ticker: p.ticker,
        name: meta ? meta.name : p.ticker,
        category: (meta && meta.category) || (isCrypto ? 'Kryptowaluty' : 'Bez kategorii'),
        assetClass, isCrypto, symbol,
        color: (meta && meta.color) || null,
        quantity: p.qty,
        avgCost,
        cost: p.cost,
        price, priceSource, priceTime,
        regularPrice: q ? q.regular : null,
        previousClose: prevClose,
        extended: ext,
        marketState: q ? q.marketState : null,
        value, pnl,
        pnlPct: p.cost > 0 ? (pnl / p.cost) * 100 : null,
        daily, dailyPct,
        realized: p.realized,
        fees: p.fees,
        firstDate: p.firstDate
      });
    });

    positions.sort((a, b) => b.value - a.value);
    positions.forEach(p => { if (!p.color) p.color = nextColor(); });

    // --- 3. Gotówka ---
    const cashEntries = [];
    let cashValue = 0;
    (payload.cash || []).forEach(c => {
      if (c.currency && c.currency !== base) {
        warnings.push({ level: 'info', where: 'Gotówka', message: `Saldo w ${c.currency} pominięte (v1 obsługuje tylko ${base}).` });
        return;
      }
      cashEntries.push(c);
      cashValue += c.amount;
    });

    // --- 4. Sumy ---
    const sum = (arr, f) => arr.reduce((s, x) => s + (f(x) || 0), 0);
    const stocks = positions.filter(p => !p.isCrypto);
    const crypto = positions.filter(p => p.isCrypto);

    // --- 5. Stan rynku / czas kursów ---
    const stockQuotes = stocks.map(p => quotes[p.symbol]).filter(Boolean);
    const allQuotes = Object.values(quotes);
    const fetchedAt = allQuotes.reduce((m, q) => Math.max(m, q.fetchedAt || 0), 0) || null;
    const marketState = stockQuotes.length ? stockQuotes[0].marketState : null;
    const anyExtended = positions.some(p => p.extended);

    return {
      base,
      portfolioName: (payload.portfolio && payload.portfolio.name) || 'Mój portfel',
      positions, closed,
      cash: { value: cashValue, entries: cashEntries, color: CASH_COLOR },
      catColors,
      totals: {
        stocksValue: sum(stocks, p => p.value),
        cryptoValue: sum(crypto, p => p.value),
        cashValue,
        investedCost: sum(positions, p => p.cost),
        realized: realizedTotal
      },
      hasCrypto: crypto.length > 0,
      hasStocks: stocks.length > 0,
      anyExtended,
      market: { state: marketState, fetchedAt, source: allQuotes[0] ? allQuotes[0].source : null },
      warnings,
      generatedAt: payload.generatedAt
    };
  }

  function sortItems(items, sort) {
    const by = {
      value: (a, b) => b.value - a.value,
      pnlPct: (a, b) => (b.pnlPct ?? -Infinity) - (a.pnlPct ?? -Infinity),
      dailyPct: (a, b) => (b.dailyPct ?? -Infinity) - (a.dailyPct ?? -Infinity),
      name: (a, b) => a.label.localeCompare(b.label, 'pl')
    }[sort] || ((a, b) => b.value - a.value);
    return items.sort(by);
  }

  function view(result, st) {
    const pos = result.positions.filter(p => st.includeCrypto || !p.isCrypto);
    let items;

    if (st.mode === 'stocks') {
      items = pos.map(p => ({
        kind: 'position', id: p.ticker, label: p.ticker, subtitle: p.name, color: p.color,
        value: p.value, cost: p.cost, pnl: p.pnl, pnlPct: p.pnlPct, daily: p.daily, dailyPct: p.dailyPct,
        position: p
      }));
    } else {
      const groups = new Map();
      pos.forEach(p => {
        let g = groups.get(p.category);
        if (!g) {
          g = { kind: 'category', id: 'CAT:' + p.category, label: p.category, color: result.catColors[p.category] || p.color,
            value: 0, cost: 0, pnl: 0, daily: 0, hasDaily: false, positions: [] };
          groups.set(p.category, g);
        }
        g.value += p.value; g.cost += p.cost; g.pnl += p.pnl;
        if (p.daily !== null) { g.daily += p.daily; g.hasDaily = true; }
        g.positions.push(p);
      });
      items = Array.from(groups.values()).map(g => ({
        ...g,
        subtitle: g.positions.map(p => p.ticker).join(', '),
        pnlPct: g.cost > 0 ? (g.pnl / g.cost) * 100 : null,
        daily: g.hasDaily ? g.daily : null,
        dailyPct: g.hasDaily && g.value - g.daily > 0 ? (g.daily / (g.value - g.daily)) * 100 : null
      }));
    }

    sortItems(items, st.sort);

    if (st.includeCash && result.cash.value > 0) {
      items.push({
        kind: 'cash', id: 'CASH', label: 'Gotówka', color: result.cash.color,
        subtitle: result.cash.entries.map(e => e.label).filter(Boolean).join(', ') || 'Wolne środki',
        value: result.cash.value, cost: null, pnl: null, pnlPct: null, daily: null, dailyPct: null,
        entries: result.cash.entries
      });
    }

    const total = items.reduce((s, i) => s + i.value, 0);
    items.forEach(i => { i.sharePct = total > 0 ? (i.value / total) * 100 : 0; });

    const invested = items.filter(i => i.kind !== 'cash');
    const value = invested.reduce((s, i) => s + i.value, 0);
    const cost = invested.reduce((s, i) => s + (i.cost || 0), 0);
    const pnl = value - cost;
    const dailyItems = invested.filter(i => i.daily !== null);
    const daily = dailyItems.length ? dailyItems.reduce((s, i) => s + i.daily, 0) : null;

    let eyebrow = result.hasStocks ? 'Wartość akcji' : 'Wartość aktywów';
    if (st.includeCrypto && result.hasCrypto && result.hasStocks) eyebrow = 'Akcje + krypto';
    if (st.includeCash && result.cash.value > 0) eyebrow = 'Cały portfel';

    return {
      items, total, eyebrow,
      summary: {
        value, cost, pnl,
        pnlPct: cost > 0 ? (pnl / cost) * 100 : null,
        daily,
        dailyPct: daily !== null && value - daily > 0 ? (daily / (value - daily)) * 100 : null
      }
    };
  }

  MM.engine = { compute, view, PALETTE };
})(window.MM = window.MM || {});
