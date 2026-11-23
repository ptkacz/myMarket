/* myMarket — eksport stanu portfela dla AI (Markdown / JSON, EN / PL) */
(function (MM) {
  'use strict';
  const F = () => MM.fmt;
  const T = (k, v) => (MM.i18n ? MM.i18n.t(k, v) : k);

  function classLabel(cls) {
    return { STOCK: T('classStock'), ETF: T('classEtf'), CRYPTO: T('classCrypto') }[cls] || cls;
  }

  function sourceLabel(src) {
    return { regular: T('srcRegular'), pre: T('srcPre'), post: T('srcPost'), delayed: T('srcDelayed'), none: T('srcNone') }[src] || src;
  }

  function nowLabel() {
    const loc = (MM.i18n && MM.i18n.getLang() === 'pl') ? 'pl-PL' : 'en-GB';
    return new Date().toLocaleString(loc, { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
  }

  /** Udziały liczone od CAŁOŚCI (akcje + krypto + gotówka) — niezależnie od przełączników na wykresie. */
  function snapshot(result, { usePrePost }) {
    const total = result.positions.reduce((s, p) => s + p.value, 0) + result.cash.value;
    const share = v => (total > 0 ? (v / total) * 100 : 0);
    const categories = new Map();
    result.positions.forEach(p => {
      const c = categories.get(p.category) || { name: p.category, value: 0, totalCost: 0, pnl: 0 };
      c.value += p.value; c.totalCost += p.totalCost; c.pnl += p.pnl;
      categories.set(p.category, c);
    });
    return {
      total, share,
      categories: Array.from(categories.values()).sort((a, b) => b.value - a.value),
      priceMode: usePrePost ? T('aiModeExt') : T('aiModeReg')
    };
  }

  function markdown(result, opts) {
    const f = F(), cur = result.base, hide = !!opts.hideAmounts;
    const s = snapshot(result, opts);
    const t = result.totals;
    const openPnlPct = t.openTotalCost > 0 ? (t.openPnl / t.openTotalCost) * 100 : null;
    const allCost = t.openTotalCost + t.closedCost;
    const allPnl = t.openPnl + t.closedPnl;
    const allPnlPct = allCost > 0 ? (allPnl / allCost) * 100 : null;
    const closedPnlPct = t.closedCost > 0 ? (t.closedPnl / t.closedCost) * 100 : null;
    const daily = result.positions.filter(p => p.daily !== null).reduce((a, p) => a + p.daily, 0);
    const amt = v => (hide ? '•••' : f.money(v, cur));
    const pnlPair = (val, pct) => (hide ? f.signedPct(pct) : `${f.signedMoney(val, cur)} / ${f.signedPct(pct)}`);
    const L = [];

    L.push(T('aiHeading', { date: nowLabel() }));
    L.push('');
    const asOf = result.market.fetchedAt ? T('aiQuotesAsOf', { dt: f.dateTime(result.market.fetchedAt) }) : '';
    L.push(T('aiMeta', { cur, mode: s.priceMode, asOf }));
    L.push('');
    L.push(T('aiSecSummary'));
    if (result.hasStocks) L.push(T('aiStocksLine', { v: amt(t.stocksValue), pct: f.pct(s.share(t.stocksValue)) }));
    if (result.hasCrypto) L.push(T('aiCryptoLine', { v: amt(t.cryptoValue), pct: f.pct(s.share(t.cryptoValue)) }));
    L.push(T('aiCashLine', { v: amt(t.cashValue), pct: f.pct(s.share(t.cashValue)) }));
    if (!hide) L.push(T('aiTotalLine', { v: f.money(s.total, cur) }));
    const openBreakdown = !hide && Math.abs(t.openPartialRealized) > 0.005
      ? T('aiOpenBreakdown', { u: f.signedMoney(t.openUnrealizedPnl, cur), r: f.signedMoney(t.openPartialRealized, cur) })
      : '';
    L.push(T('aiOpenPnlLine', { v: pnlPair(t.openPnl, openPnlPct), breakdown: openBreakdown }));
    if (result.closed.length) {
      L.push(T('aiClosedPnlLine', { n: result.closed.length, v: pnlPair(t.closedPnl, closedPnlPct) }));
      L.push(T('aiAllPnlLine', { v: pnlPair(allPnl, allPnlPct) }));
    }
    if (!hide) L.push(T('aiDailyLine', { v: f.signedMoney(daily, cur) }));
    L.push('');
    L.push(T('aiSecOpen'));
    const head = hide
      ? [T('aiColTicker'), T('aiColName'), T('aiColCat'), T('aiColClass'), T('aiColAvgBuy'), T('aiColPrice'), T('aiColShare'), T('aiColPnlPct'), T('aiColDailyPct')]
      : [T('aiColTicker'), T('aiColName'), T('aiColCat'), T('aiColClass'), T('aiColQty'), T('aiColAvgBuy'), T('aiColPrice'), T('aiColValue'), T('aiColShare'), T('aiColPnl'), T('aiColPnlPct'), T('aiColDailyPct')];
    L.push(`| ${head.join(' | ')} |`);
    L.push(`|${head.map(() => '---').join('|')}|`);
    result.positions.forEach(p => {
      const kurs = `${f.price(p.price, cur)}${p.priceSource !== 'regular' ? ` (${sourceLabel(p.priceSource)})` : ''}`;
      const row = hide
        ? [p.ticker, p.name, p.category, classLabel(p.assetClass), f.price(p.avgCost, cur), kurs, f.pct(s.share(p.value)), f.signedPct(p.pnlPct), f.signedPct(p.dailyPct)]
        : [p.ticker, p.name, p.category, classLabel(p.assetClass), f.qty(p.quantity), f.price(p.avgCost, cur), kurs, f.money(p.value, cur), f.pct(s.share(p.value)), f.signedMoney(p.pnl, cur), f.signedPct(p.pnlPct), f.signedPct(p.dailyPct)];
      L.push(`| ${row.map(x => String(x).replace(/\|/g, '/')).join(' | ')} |`);
    });
    if (result.closed.length) {
      L.push('');
      L.push(T('aiSecClosed'));
      const cHead = hide
        ? [T('aiColTicker'), T('aiColName'), T('aiColCat'), T('aiColAvgBuy'), T('aiColAvgSell'), T('aiColPnlPct'), T('aiColClosedAt')]
        : [T('aiColTicker'), T('aiColName'), T('aiColCat'), T('aiColCost'), T('aiColProceeds'), T('aiColPnl'), T('aiColPnlPct'), T('aiColClosedAt')];
      L.push(`| ${cHead.join(' | ')} |`);
      L.push(`|${cHead.map(() => '---').join('|')}|`);
      result.closed.forEach(c => {
        const row = hide
          ? [c.ticker, c.name, c.category, f.price(c.avgBuyPrice, cur), f.price(c.avgSellPrice, cur), f.signedPct(c.pnlPct), c.lastDate || '—']
          : [c.ticker, c.name, c.category, f.money(c.cost, cur), f.money(c.proceeds, cur), f.signedMoney(c.pnl, cur), f.signedPct(c.pnlPct), c.lastDate || '—'];
        L.push(`| ${row.map(x => String(x).replace(/\|/g, '/')).join(' | ')} |`);
      });
    }
    L.push('');
    const upcoming = result.positions
      .filter(p => p.earnings)
      .sort((a, b) => a.earnings.daysUntil - b.earnings.daysUntil);
    if (upcoming.length) {
      L.push(`- ${T('lblEarnings')}: ${upcoming.map(p => `${p.ticker} ${p.earnings.date}${p.earnings.estimate ? ` (${T('earningsEst')})` : ''}`).join(', ')}`);
      L.push('');
    }
    L.push(T('aiSecCat'));
    L.push(`| ${T('aiColCat')} | ${T('aiColShare')} | ${T('aiColPnlPct')} |`);
    L.push('|---|---|---|');
    s.categories.forEach(c => L.push(`| ${c.name} | ${f.pct(s.share(c.value))} | ${f.signedPct(c.totalCost > 0 ? (c.pnl / c.totalCost) * 100 : null)} |`));
    if (result.cash.value > 0) L.push(`| ${T('cashLabel')} | ${f.pct(s.share(result.cash.value))} | — |`);
    L.push('');
    L.push(T('aiFootnote'));
    if (opts.withPrompt) {
      L.push('');
      L.push('---');
      L.push(T('aiPromptText'));
      L.push('');
    }
    return L.join('\n');
  }

  function json(result, opts) {
    const s = snapshot(result, opts);
    const hide = !!opts.hideAmounts;
    const t = result.totals;
    const r2 = v => (MM.fmt.isNum(v) ? Math.round(v * 100) / 100 : null);
    return JSON.stringify({
      asOf: new Date().toISOString(),
      currency: result.base,
      priceMode: s.priceMode,
      totals: hide ? undefined : {
        total: r2(s.total), stocks: r2(t.stocksValue), crypto: r2(t.cryptoValue),
        cash: r2(t.cashValue), openCost: r2(t.investedCost),
        openPnl: r2(t.openPnl), openUnrealizedPnl: r2(t.openUnrealizedPnl), openPartialRealized: r2(t.openPartialRealized),
        closedPnl: r2(t.closedPnl), allPnl: r2(t.openPnl + t.closedPnl)
      },
      positions: result.positions.map(p => ({
        ticker: p.ticker, name: p.name, category: p.category, assetClass: p.assetClass,
        quantity: hide ? undefined : p.quantity,
        avgCost: r2(p.avgCost), price: r2(p.price), priceSource: p.priceSource,
        value: hide ? undefined : r2(p.value),
        sharePct: r2(s.share(p.value)),
        pnl: hide ? undefined : r2(p.pnl),
        unrealizedPnl: hide || !p.hasPartialSales ? undefined : r2(p.unrealizedPnl),
        partialRealizedPnl: hide || !p.hasPartialSales ? undefined : r2(p.realized),
        pnlPct: r2(p.pnlPct), dailyPct: r2(p.dailyPct),
        nextEarnings: p.earnings ? { date: p.earnings.date, estimate: p.earnings.estimate } : undefined
      })),
      closedPositions: result.closed.map(c => ({
        ticker: c.ticker, name: c.name, category: c.category, assetClass: c.assetClass,
        cost: hide ? undefined : r2(c.cost),
        proceeds: hide ? undefined : r2(c.proceeds),
        pnl: hide ? undefined : r2(c.pnl),
        pnlPct: r2(c.pnlPct),
        closedAt: c.lastDate || null
      })),
      cashSharePct: r2(s.share(result.cash.value))
    }, null, 2);
  }

  MM.ai = { markdown, json };
})(window.MM = window.MM || {});
