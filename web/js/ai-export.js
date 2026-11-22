/* myMarket — eksport stanu portfela dla AI (Markdown / JSON) */
(function (MM) {
  'use strict';
  const F = () => MM.fmt;

  const CLASS_LABEL = { STOCK: 'Akcja', ETF: 'ETF', CRYPTO: 'Krypto' };
  const SOURCE_LABEL = { regular: 'sesja', pre: 'pre-market', post: 'after-hours', delayed: 'opóźniony', none: 'brak kursu' };

  function nowLabel() {
    return new Date().toLocaleString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  /** Udziały liczone od CAŁOŚCI (akcje + krypto + gotówka) — niezależnie od przełączników na wykresie. */
  function snapshot(result, { usePrePost }) {
    const total = result.positions.reduce((s, p) => s + p.value, 0) + result.cash.value;
    const share = v => (total > 0 ? (v / total) * 100 : 0);
    const categories = new Map();
    result.positions.forEach(p => {
      const c = categories.get(p.category) || { name: p.category, value: 0, cost: 0 };
      c.value += p.value; c.cost += p.cost;
      categories.set(p.category, c);
    });
    return {
      total, share,
      categories: Array.from(categories.values()).sort((a, b) => b.value - a.value),
      priceMode: usePrePost ? 'z uwzględnieniem pre-market/after-hours' : 'kurs z sesji regularnej'
    };
  }

  function markdown(result, opts) {
    const f = F(), cur = result.base, hide = !!opts.hideAmounts;
    const s = snapshot(result, opts);
    const t = result.totals;
    const invested = t.stocksValue + t.cryptoValue;
    const pnl = invested - t.investedCost;
    const pnlPct = t.investedCost > 0 ? (pnl / t.investedCost) * 100 : null;
    const daily = result.positions.filter(p => p.daily !== null).reduce((a, p) => a + p.daily, 0);
    const amt = v => (hide ? '•••' : f.money(v, cur));
    const L = [];

    L.push(`# Mój portfel inwestycyjny — stan na ${nowLabel()}`);
    L.push('');
    L.push(`Waluta: ${cur} · Wycena: ${s.priceMode}${result.market.fetchedAt ? ` (kursy z ${f.dateTime(result.market.fetchedAt)})` : ''}.`);
    L.push('');
    L.push('## Podsumowanie');
    if (result.hasStocks) L.push(`- Akcje/ETF: ${amt(t.stocksValue)} (${f.pct(s.share(t.stocksValue))} portfela)`);
    if (result.hasCrypto) L.push(`- Krypto: ${amt(t.cryptoValue)} (${f.pct(s.share(t.cryptoValue))} portfela)`);
    L.push(`- Gotówka: ${amt(t.cashValue)} (${f.pct(s.share(t.cashValue))} portfela)`);
    if (!hide) L.push(`- Razem: ${f.money(s.total, cur)}`);
    L.push(`- Wynik niezrealizowany (akcje + krypto): ${hide ? '' : f.signedMoney(pnl, cur) + ' / '}${f.signedPct(pnlPct)}`);
    if (Math.abs(t.realized) > 0.005) L.push(`- Wynik zrealizowany (sprzedane pozycje): ${hide ? (t.realized >= 0 ? 'zysk' : 'strata') : f.signedMoney(t.realized, cur)}`);
    if (!hide) L.push(`- Zmiana dzienna: ${f.signedMoney(daily, cur)}`);
    L.push('');
    L.push('## Pozycje');
    const head = hide
      ? ['Ticker', 'Nazwa', 'Kategoria', 'Klasa', 'Śr. cena zakupu', 'Kurs', 'Udział', 'Wynik %', 'Dziś %']
      : ['Ticker', 'Nazwa', 'Kategoria', 'Klasa', 'Ilość', 'Śr. cena zakupu', 'Kurs', 'Wartość', 'Udział', 'Wynik', 'Wynik %', 'Dziś %'];
    L.push(`| ${head.join(' | ')} |`);
    L.push(`|${head.map(() => '---').join('|')}|`);
    result.positions.forEach(p => {
      const kurs = `${f.price(p.price, cur)}${p.priceSource !== 'regular' ? ` (${SOURCE_LABEL[p.priceSource] || p.priceSource})` : ''}`;
      const row = hide
        ? [p.ticker, p.name, p.category, CLASS_LABEL[p.assetClass] || p.assetClass, f.price(p.avgCost, cur), kurs, f.pct(s.share(p.value)), f.signedPct(p.pnlPct), f.signedPct(p.dailyPct)]
        : [p.ticker, p.name, p.category, CLASS_LABEL[p.assetClass] || p.assetClass, f.qty(p.quantity), f.price(p.avgCost, cur), kurs, f.money(p.value, cur), f.pct(s.share(p.value)), f.signedMoney(p.pnl, cur), f.signedPct(p.pnlPct), f.signedPct(p.dailyPct)];
      L.push(`| ${row.map(x => String(x).replace(/\|/g, '/')).join(' | ')} |`);
    });
    L.push('');
    L.push('## Struktura wg kategorii');
    L.push('| Kategoria | Udział | Wynik % |');
    L.push('|---|---|---|');
    s.categories.forEach(c => L.push(`| ${c.name} | ${f.pct(s.share(c.value))} | ${f.signedPct(c.cost > 0 ? ((c.value - c.cost) / c.cost) * 100 : null)} |`));
    if (result.cash.value > 0) L.push(`| Gotówka | ${f.pct(s.share(result.cash.value))} | — |`);
    L.push('');
    L.push('_Udziały liczone od całego portfela (akcje + krypto + gotówka). Średnia cena zakupu = średnia ważona z prowizjami._');
    if (opts.withPrompt) {
      L.push('');
      L.push('---');
      L.push('Jesteś doświadczonym analitykiem inwestycyjnym. Na podstawie powyższego portfela pomóż mi podjąć decyzję. Zwróć uwagę na dywersyfikację, koncentrację ryzyka i wycenę. Moje pytanie:');
      L.push('');
    }
    return L.join('\n');
  }

  function json(result, opts) {
    const s = snapshot(result, opts);
    const hide = !!opts.hideAmounts;
    const r2 = v => (MM.fmt.isNum(v) ? Math.round(v * 100) / 100 : null);
    return JSON.stringify({
      asOf: new Date().toISOString(),
      currency: result.base,
      priceMode: s.priceMode,
      totals: hide ? undefined : {
        total: r2(s.total), stocks: r2(result.totals.stocksValue), crypto: r2(result.totals.cryptoValue),
        cash: r2(result.totals.cashValue), investedCost: r2(result.totals.investedCost), realized: r2(result.totals.realized)
      },
      positions: result.positions.map(p => ({
        ticker: p.ticker, name: p.name, category: p.category, assetClass: p.assetClass,
        quantity: hide ? undefined : p.quantity,
        avgCost: r2(p.avgCost), price: r2(p.price), priceSource: p.priceSource,
        value: hide ? undefined : r2(p.value),
        sharePct: r2(s.share(p.value)),
        pnl: hide ? undefined : r2(p.pnl),
        pnlPct: r2(p.pnlPct), dailyPct: r2(p.dailyPct)
      })),
      cashSharePct: r2(s.share(result.cash.value))
    }, null, 2);
  }

  MM.ai = { markdown, json };
})(window.MM = window.MM || {});
