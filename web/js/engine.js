/* myMarket — silnik obliczeń portfela (czyste funkcje, bez DOM)
 *
 * compute(payload, opts) → pozycje otwarte, zamknięte, gotówka, sumy, ostrzeżenia
 * view(result, state)    → elementy wykresu/listy wg aktualnych przełączników
 *
 * Metoda kosztu (v1): średnia ważona. Prowizja kupna zwiększa koszt,
 * prowizja sprzedaży zmniejsza wynik zrealizowany.
 * Otwarte pozycje z częściową sprzedażą uwzględniają w wyniku łącznym (pnl)
 * także wynik zrealizowany na tym tickerze (procent liczony od całego kosztu zakupów).
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
        p = {
          ticker: t.ticker, txAssetClass: t.assetClass,
          qty: 0, cost: 0, realized: 0, fees: 0,
          totalBoughtQty: 0, totalBoughtCost: 0,
          totalSoldQty: 0, totalSoldProceeds: 0,
          buys: 0, sells: 0,
          firstDate: t.tradeDate, lastDate: t.tradeDate
        };
        map.set(t.ticker, p);
      }
      p.lastDate = t.tradeDate || p.lastDate;
      p.fees += t.fee || 0;

      if (t.currency && t.currency !== base && !currencyWarned.has(t.ticker)) {
        currencyWarned.add(t.ticker);
        warnings.push({ level: 'warn', where: `${t.source} — ${t.ticker}`, message: `Waluta ${t.currency} ≠ ${base}. Wersja 1 liczy wszystko w ${base} — wynik może być niepoprawny.` });
      }

      if (t.type === 'BUY') {
        const buyCost = t.quantity * t.price + (t.fee || 0);
        p.qty += t.quantity;
        p.cost += buyCost;
        p.totalBoughtQty += t.quantity;
        p.totalBoughtCost += buyCost;
        p.buys++;
      } else {
        let q = t.quantity;
        if (q > p.qty + EPS) {
          warnings.push({ level: 'warn', where: `${t.source} — wiersz ${t.row}`, message: `Sprzedaż ${t.quantity} ${t.ticker} przekracza posiadaną ilość (${+p.qty.toFixed(8)}). Uwzględniono tylko posiadaną ilość.` });
          q = p.qty;
        }
        if (p.qty > EPS && q > 0) {
          const avg = p.cost / p.qty;
          const proceeds = q * t.price - (t.fee || 0);
          const r = proceeds - avg * q;
          p.realized += r;
          p.totalSoldQty += q;
          p.totalSoldProceeds += proceeds;
          realizedTotal += r;
          p.cost -= avg * q;
          p.qty -= q;
        }
        if (p.qty < EPS) { p.qty = 0; p.cost = 0; }
        p.sells++;
      }
    });

    // --- 2. Wycena otwartych i budowa zamkniętych pozycji ---
    const quotes = payload.quotes || {};
    const earningsMap = payload.earnings || {};
    const todayMid = new Date();
    todayMid.setHours(0, 0, 0, 0);
    const parseEarnings = raw => {
      if (!raw || !raw.date || !/^\d{4}-\d{2}-\d{2}$/.test(raw.date)) return null;
      const [y, m, d] = raw.date.split('-').map(Number);
      const dt = new Date(y, m - 1, d);
      const daysUntil = Math.round((dt.getTime() - todayMid.getTime()) / 86400000);
      if (daysUntil < 0) return null;
      return { date: raw.date, estimate: !!raw.estimate, daysUntil, source: raw.source || null };
    };
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
      const assetClass = meta ? meta.assetClass : (p.txAssetClass || 'STOCK');
      const isCrypto = assetClass === 'CRYPTO';
      const T = (k, v) => (MM.i18n ? MM.i18n.t(k, v) : k);
      const category = (meta && meta.category) || (isCrypto ? T('cryptoCategory') : T('uncategorized'));

      if (p.qty <= EPS) {
        closed.push({
          ticker: p.ticker,
          name: meta ? meta.name : p.ticker,
          category, assetClass, isCrypto,
          color: (meta && meta.color) || null,
          cost: p.totalBoughtCost,
          proceeds: p.totalSoldProceeds,
          pnl: p.realized,
          realized: p.realized,
          pnlPct: p.totalBoughtCost > 0 ? (p.realized / p.totalBoughtCost) * 100 : null,
          totalBoughtQty: p.totalBoughtQty,
          totalSoldQty: p.totalSoldQty,
          avgBuyPrice: p.totalBoughtQty > 0 ? p.totalBoughtCost / p.totalBoughtQty : null,
          avgSellPrice: p.totalSoldQty > 0 ? p.totalSoldProceeds / p.totalSoldQty : null,
          buys: p.buys, sells: p.sells,
          fees: p.fees,
          firstDate: p.firstDate, lastDate: p.lastDate
        });
        return;
      }

      if (!meta) {
        warnings.push({ level: 'info', where: 'Instrumenty', message: `Brak ${p.ticker} w zakładce „Instrumenty” — użyto domyślnej nazwy i kategorii.` });
      }
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
      const unrealizedPnl = value - p.cost;
      const unrealizedPct = p.cost > 0 ? (unrealizedPnl / p.cost) * 100 : null;
      const hasPartialSales = p.sells > 0 && p.totalSoldQty > EPS;
      const totalPnl = unrealizedPnl + p.realized;
      const totalCost = p.totalBoughtCost > 0 ? p.totalBoughtCost : p.cost;
      const totalPnlPct = totalCost > 0 ? (totalPnl / totalCost) * 100 : null;

      const prevClose = q && MM.fmt.isNum(q.previousClose) ? q.previousClose : null;
      const daily = prevClose !== null && priceSource !== 'none' ? p.qty * (price - prevClose) : null;
      const dailyPct = prevClose ? (price / prevClose - 1) * 100 : null;

      positions.push({
        ticker: p.ticker,
        name: meta ? meta.name : p.ticker,
        category, assetClass, isCrypto, symbol,
        color: (meta && meta.color) || null,
        quantity: p.qty,
        avgCost,
        cost: p.cost,
        totalCost,
        price, priceSource, priceTime,
        regularPrice: q ? q.regular : null,
        previousClose: prevClose,
        extended: ext,
        earnings: parseEarnings(earningsMap[symbol] || earningsMap[p.ticker]),
        marketState: q ? q.marketState : null,
        value,
        unrealizedPnl, unrealizedPct,
        realized: p.realized,
        hasPartialSales,
        totalSoldQty: p.totalSoldQty,
        totalSoldProceeds: p.totalSoldProceeds,
        pnl: totalPnl,
        pnlPct: totalPnlPct,
        daily, dailyPct,
        buys: p.buys, sells: p.sells,
        fees: p.fees,
        firstDate: p.firstDate, lastDate: p.lastDate
      });
    });

    positions.sort((a, b) => b.value - a.value);
    positions.forEach(p => { if (!p.color) p.color = nextColor(); });
    closed.sort((a, b) => String(b.lastDate || '').localeCompare(String(a.lastDate || '')) || b.pnl - a.pnl);
    closed.forEach(c => { if (!c.color) c.color = nextColor(); });

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

    // --- 4. Watchlist ---
    const openTickers = new Set(positions.map(p => p.ticker));
    const watchlist = (payload.watchlist || []).map(w => {
      const meta = instr[w.ticker] || null;
      const isCrypto = w.ticker.includes('-USD') || (meta ? meta.assetClass === 'CRYPTO' : false);
      const symbol = w.ticker.includes('-') ? w.ticker : ((meta && meta.symbol) || (isCrypto ? `${w.ticker}-USD` : w.ticker));
      const q = quotes[symbol] || quotes[w.ticker] || null;

      let price = null, priceSource = 'none';
      if (q && MM.fmt.isNum(q.regular)) {
        price = q.regular;
        priceSource = q.source === 'googlefinance' ? 'delayed' : 'regular';
      }
      let ext = null;
      if (q && MM.fmt.isNum(q.post)) ext = { type: 'post', price: q.post, time: q.postTime };
      else if (q && MM.fmt.isNum(q.pre)) ext = { type: 'pre', price: q.pre, time: q.preTime };
      if (ext && MM.fmt.isNum(q.regular)) ext.changePct = (ext.price / q.regular - 1) * 100;
      if (usePrePost && ext) { price = ext.price; priceSource = ext.type; }

      const prevClose = q && MM.fmt.isNum(q.previousClose) ? q.previousClose : null;
      const dailyPct = price !== null && prevClose ? (price / prevClose - 1) * 100 : null;

      const buyTarget = MM.fmt.isNum(w.buyTarget) ? w.buyTarget : null;
      const sellTarget = MM.fmt.isNum(w.sellTarget) ? w.sellTarget : null;
      const buyHit = price !== null && buyTarget !== null && price <= buyTarget;
      const sellHit = price !== null && sellTarget !== null && price >= sellTarget;
      const buyDistUsd = price !== null && buyTarget !== null ? buyTarget - price : null;
      const buyDistPct = price !== null && buyTarget !== null && price > 0 ? ((buyTarget - price) / price) * 100 : null;
      const sellDistUsd = price !== null && sellTarget !== null ? sellTarget - price : null;
      const sellDistPct = price !== null && sellTarget !== null && price > 0 ? ((sellTarget - price) / price) * 100 : null;

      // Aktywny najbliższy cel (do sortowania i wyświetlania dystansu)
      let primarySide = null, primaryTarget = null, primaryDistPct = null, primaryDistUsd = null;
      if (buyHit) {
        primarySide = 'buy'; primaryTarget = buyTarget; primaryDistPct = buyDistPct; primaryDistUsd = buyDistUsd;
      } else if (sellHit) {
        primarySide = 'sell'; primaryTarget = sellTarget; primaryDistPct = sellDistPct; primaryDistUsd = sellDistUsd;
      } else if (buyTarget !== null && sellTarget !== null && buyDistPct !== null && sellDistPct !== null) {
        if (Math.abs(buyDistPct) <= Math.abs(sellDistPct)) {
          primarySide = 'buy'; primaryTarget = buyTarget; primaryDistPct = buyDistPct; primaryDistUsd = buyDistUsd;
        } else {
          primarySide = 'sell'; primaryTarget = sellTarget; primaryDistPct = sellDistPct; primaryDistUsd = sellDistUsd;
        }
      } else if (buyTarget !== null) {
        primarySide = 'buy'; primaryTarget = buyTarget; primaryDistPct = buyDistPct; primaryDistUsd = buyDistUsd;
      } else if (sellTarget !== null) {
        primarySide = 'sell'; primaryTarget = sellTarget; primaryDistPct = sellDistPct; primaryDistUsd = sellDistUsd;
      }

      let status = 'watching'; // 'buy-hit' | 'sell-hit' | 'near' | 'watching'
      let rank = 2;
      if (buyHit) { status = 'buy-hit'; rank = 0; }
      else if (sellHit) { status = 'sell-hit'; rank = 0; }
      else if (primaryDistPct !== null && Math.abs(primaryDistPct) <= 5) { status = 'near'; rank = 1; }

      const T = (k, v) => (MM.i18n ? MM.i18n.t(k, v) : k);
      return {
        id: 'WATCH:' + w.ticker,
        ticker: w.ticker,
        name: w.name || (meta && meta.name) || w.ticker,
        category: w.category || (meta && meta.category) || (isCrypto ? T('cryptoCategory') : null),
        isCrypto, symbol,
        inPortfolio: openTickers.has(w.ticker),
        price, priceSource,
        regularPrice: q ? q.regular : null,
        previousClose: prevClose,
        extended: ext,
        dailyPct,
        buyTarget, sellTarget, buyHit, sellHit,
        buyDistUsd, buyDistPct, sellDistUsd, sellDistPct,
        primarySide, primaryTarget, primaryDistPct, primaryDistUsd,
        status, rank,
        note: w.note || '',
        earnings: !isCrypto ? parseEarnings(earningsMap[symbol] || earningsMap[w.ticker]) : null
      };
    });
    const watchlistHits = watchlist.filter(w => w.rank === 0).length;
    const watchlistAnyExtended = watchlist.some(w => w.extended);

    // --- 5. Sumy ---
    const sum = (arr, f) => arr.reduce((s, x) => s + (f(x) || 0), 0);
    const stocks = positions.filter(p => !p.isCrypto);
    const crypto = positions.filter(p => p.isCrypto);
    const closedCrypto = closed.filter(c => c.isCrypto);

    // --- 6. Stan rynku / czas kursów ---
    const stockQuotes = stocks.map(p => quotes[p.symbol]).filter(Boolean);
    const allQuotes = Object.values(quotes);
    const fetchedAt = allQuotes.reduce((m, q) => Math.max(m, q.fetchedAt || 0), 0) || null;
    const marketState = stockQuotes.length ? stockQuotes[0].marketState : (allQuotes[0] ? allQuotes[0].marketState : null);
    const anyExtended = positions.some(p => p.extended);

    return {
      base,
      portfolioName: (payload.portfolio && payload.portfolio.name) || 'Mój portfel',
      positions, closed, watchlist, watchlistHits, watchlistAnyExtended,
      cash: { value: cashValue, entries: cashEntries, color: CASH_COLOR },
      catColors,
      totals: {
        stocksValue: sum(stocks, p => p.value),
        cryptoValue: sum(crypto, p => p.value),
        cashValue,
        investedCost: sum(positions, p => p.cost),
        openTotalCost: sum(positions, p => p.totalCost),
        openPnl: sum(positions, p => p.pnl),
        openUnrealizedPnl: sum(positions, p => p.unrealizedPnl),
        openPartialRealized: sum(positions, p => p.realized),
        closedCost: sum(closed, c => c.cost),
        closedProceeds: sum(closed, c => c.proceeds),
        closedPnl: sum(closed, c => c.pnl),
        realized: realizedTotal
      },
      hasCrypto: crypto.length > 0 || closedCrypto.length > 0,
      hasStocks: stocks.length > 0,
      hasClosed: closed.length > 0,
      anyExtended,
      market: { state: marketState, fetchedAt, source: allQuotes[0] ? allQuotes[0].source : null },
      warnings,
      generatedAt: payload.generatedAt
    };
  }

  function sortItems(items, sort) {
    const loc = (MM.i18n && MM.i18n.getLang()) || 'en';
    const by = {
      value: (a, b) => b.value - a.value,
      pnlPct: (a, b) => (b.pnlPct ?? -Infinity) - (a.pnlPct ?? -Infinity),
      dailyPct: (a, b) => (b.dailyPct ?? -Infinity) - (a.dailyPct ?? -Infinity),
      name: (a, b) => a.label.localeCompare(b.label, loc)
    }[sort] || ((a, b) => b.value - a.value);
    return items.sort(by);
  }

  function sortClosedItems(items, sort) {
    const loc = (MM.i18n && MM.i18n.getLang()) || 'en';
    const by = {
      pnlPct: (a, b) => (b.pnlPct ?? -Infinity) - (a.pnlPct ?? -Infinity),
      name: (a, b) => a.label.localeCompare(b.label, loc),
      value: (a, b) => (b.pnl - a.pnl) || (b.cost - a.cost),
      dailyPct: (a, b) => (b.pnl - a.pnl) || (b.cost - a.cost)
    }[sort] || ((a, b) => b.pnl - a.pnl);
    return items.sort(by);
  }

  function view(result, st) {
    const scope = st.scope || 'open'; // 'open' | 'all' | 'closed'
    const pos = result.positions.filter(p => st.includeCrypto || !p.isCrypto);
    const closedPos = result.closed.filter(c => st.includeCrypto || !c.isCrypto);

    // --- Otwarte elementy (wykres + lista otwartych) ---
    let items;
    if (st.mode === 'stocks') {
      items = pos.map(p => ({
        kind: 'position', id: p.ticker, label: p.ticker, subtitle: p.name, color: p.color,
        value: p.value, cost: p.cost, totalCost: p.totalCost,
        unrealizedPnl: p.unrealizedPnl, realized: p.realized, hasPartialSales: p.hasPartialSales,
        pnl: p.pnl, pnlPct: p.pnlPct, daily: p.daily, dailyPct: p.dailyPct,
        position: p
      }));
    } else {
      const groups = new Map();
      pos.forEach(p => {
        let g = groups.get(p.category);
        if (!g) {
          g = {
            kind: 'category', id: 'CAT:' + p.category, label: p.category,
            color: result.catColors[p.category] || p.color,
            value: 0, cost: 0, totalCost: 0, unrealizedPnl: 0, realized: 0,
            hasPartialSales: false, pnl: 0, daily: 0, hasDaily: false, positions: []
          };
          groups.set(p.category, g);
        }
        g.value += p.value; g.cost += p.cost; g.totalCost += p.totalCost;
        g.unrealizedPnl += p.unrealizedPnl; g.realized += p.realized;
        if (p.hasPartialSales) g.hasPartialSales = true;
        g.pnl += p.pnl;
        if (p.daily !== null) { g.daily += p.daily; g.hasDaily = true; }
        g.positions.push(p);
      });
      items = Array.from(groups.values()).map(g => ({
        ...g,
        subtitle: g.positions.map(p => p.ticker).join(', '),
        pnlPct: g.totalCost > 0 ? (g.pnl / g.totalCost) * 100 : null,
        daily: g.hasDaily ? g.daily : null,
        dailyPct: g.hasDaily && g.value - g.daily > 0 ? (g.daily / (g.value - g.daily)) * 100 : null
      }));
    }

    sortItems(items, st.sort);

    const T = (k, v) => (MM.i18n ? MM.i18n.t(k, v) : k);

    if (st.includeCash && result.cash.value > 0) {
      items.push({
        kind: 'cash', id: 'CASH', label: T('cashLabel'), color: result.cash.color,
        subtitle: result.cash.entries.map(e => e.label).filter(Boolean).join(', ') || T('cashDefaultSubtitle'),
        value: result.cash.value, cost: null, totalCost: null,
        pnl: null, pnlPct: null, daily: null, dailyPct: null,
        entries: result.cash.entries
      });
    }

    const total = items.reduce((s, i) => s + i.value, 0);
    items.forEach(i => { i.sharePct = total > 0 ? (i.value / total) * 100 : 0; });

    // --- Całkowicie zamknięte elementy ---
    let closedItems;
    if (st.mode === 'stocks') {
      closedItems = closedPos.map(c => ({
        kind: 'closed-position', id: 'CLOSED:' + c.ticker, label: c.ticker, subtitle: c.name, color: c.color,
        value: null, sharePct: null,
        cost: c.cost, proceeds: c.proceeds, pnl: c.pnl, pnlPct: c.pnlPct,
        daily: null, dailyPct: null,
        closed: c
      }));
    } else {
      const cGroups = new Map();
      closedPos.forEach(c => {
        let g = cGroups.get(c.category);
        if (!g) {
          g = {
            kind: 'closed-category', id: 'CLOSED_CAT:' + c.category, label: c.category,
            color: result.catColors[c.category] || c.color,
            value: null, sharePct: null,
            cost: 0, proceeds: 0, pnl: 0, daily: null, dailyPct: null,
            positions: []
          };
          cGroups.set(c.category, g);
        }
        g.cost += c.cost; g.proceeds += c.proceeds; g.pnl += c.pnl;
        g.positions.push(c);
      });
      closedItems = Array.from(cGroups.values()).map(g => ({
        ...g,
        subtitle: g.positions.map(c => c.ticker).join(', '),
        pnlPct: g.cost > 0 ? (g.pnl / g.cost) * 100 : null
      }));
    }
    sortClosedItems(closedItems, st.sort);

    // --- Podsumowania ---
    const sum = (arr, f) => arr.reduce((s, x) => s + (f(x) || 0), 0);
    const openValue = sum(pos, p => p.value);
    const openCost = sum(pos, p => p.cost);
    const openTotalCost = sum(pos, p => p.totalCost);
    const openUnrealizedPnl = sum(pos, p => p.unrealizedPnl);
    const openPartialRealized = sum(pos, p => p.realized);
    const openPnl = openUnrealizedPnl + openPartialRealized;
    const openPnlPct = openTotalCost > 0 ? (openPnl / openTotalCost) * 100 : null;

    const closedCost = sum(closedPos, c => c.cost);
    const closedProceeds = sum(closedPos, c => c.proceeds);
    const closedPnl = sum(closedPos, c => c.pnl);
    const closedPnlPct = closedCost > 0 ? (closedPnl / closedCost) * 100 : null;
    const closedWins = closedPos.filter(c => c.pnl > 0.005).length;
    const closedLosses = closedPos.filter(c => c.pnl < -0.005).length;

    const allCost = openTotalCost + closedCost;
    const allPnl = openPnl + closedPnl;
    const allPnlPct = allCost > 0 ? (allPnl / allCost) * 100 : null;

    const dailyItems = pos.filter(p => p.daily !== null);
    const daily = dailyItems.length ? sum(dailyItems, p => p.daily) : null;
    const dailyPct = daily !== null && openValue - daily > 0 ? (daily / (openValue - daily)) * 100 : null;

    let eyebrow = result.hasStocks ? T('eyebrowStocks') : T('eyebrowAssets');
    if (st.includeCrypto && pos.some(p => p.isCrypto) && pos.some(p => !p.isCrypto)) eyebrow = T('eyebrowStocksCrypto');
    if (st.includeCash && result.cash.value > 0) eyebrow = T('eyebrowFull');
    if (scope === 'all') eyebrow = st.includeCash && result.cash.value > 0 ? T('eyebrowFullAll') : T('eyebrowPortfolioAll');

    const selectableItems = scope === 'closed'
      ? closedItems
      : (scope === 'all' ? items.concat(closedItems) : items);

    return {
      scope, items, closedItems, selectableItems, total, eyebrow,
      summary: {
        value: openValue,
        cost: openCost,
        openTotalCost,
        openUnrealizedPnl,
        openPartialRealized,
        hasPartialSales: pos.some(p => p.hasPartialSales),
        pnl: openPnl,
        pnlPct: openPnlPct,
        closedCost, closedProceeds, closedPnl, closedPnlPct,
        closedCount: closedPos.length, closedWins, closedLosses,
        allCost, allPnl, allPnlPct,
        daily, dailyPct
      }
    };
  }

  function sortWatchlist(list, sort) {
    const loc = (MM.i18n && MM.i18n.getLang()) || 'en';
    const dist = w => (w.rank === 0 ? -1000 : (w.primaryDistPct !== null ? Math.abs(w.primaryDistPct) : 1e9));
    const by = {
      status: (a, b) => (a.rank - b.rank) || (dist(a) - dist(b)) || a.ticker.localeCompare(b.ticker, loc),
      distance: (a, b) => (dist(a) - dist(b)) || a.ticker.localeCompare(b.ticker, loc),
      dailyPct: (a, b) => (b.dailyPct ?? -Infinity) - (a.dailyPct ?? -Infinity),
      name: (a, b) => a.ticker.localeCompare(b.ticker, loc)
    }[sort] || ((a, b) => (a.rank - b.rank) || (dist(a) - dist(b)));
    return list.slice().sort(by);
  }

  MM.engine = { compute, view, sortWatchlist, PALETTE };
})(window.MM = window.MM || {});
