/* myMarket — dane demonstracyjne (ten sam format co odpowiedź API v1) */
(function (MM) {
  'use strict';

  function payload() {
    const now = Math.floor(Date.now() / 1000);
    const closeTs = now - 3600 * 20;
    const q = (regular, previousClose, post) => ({
      symbol: null, currency: 'USD', regular, regularTime: closeTs, previousClose,
      pre: null, preTime: null, post: post ?? null, postTime: post ? closeTs + 3 * 3600 : null,
      marketState: 'CLOSED', source: 'demo', fetchedAt: now
    });

    const tx = (source, row, assetClass, tradeDate, type, ticker, quantity, price, note = '') => ({
      source, row, assetClass, tradeDate, settleDate: tradeDate, type, ticker, quantity, price,
      currency: 'USD', fee: 0, fxPln: null, note
    });

    const addDays = n => {
      const d = new Date();
      d.setDate(d.getDate() + n);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    };

    return {
      apiVersion: 1,
      appVersion: 'demo',
      generatedAt: new Date().toISOString(),
      portfolio: { name: (MM.i18n && MM.i18n.t('demoPortfolioName')) || 'Demo portfolio', baseCurrency: 'USD' },
      instruments: [
        { ticker: 'META', name: 'Meta Platforms, Inc.', category: 'Platformy / Reklama AI', assetClass: 'STOCK', symbol: null, currency: 'USD', color: '#2563EB', active: true },
        { ticker: 'NVDA', name: 'NVIDIA Corporation', category: 'Półprzewodniki i sprzęt AI', assetClass: 'STOCK', symbol: null, currency: 'USD', color: '#10B981', active: true },
        { ticker: 'AVGO', name: 'Broadcom Inc.', category: 'Półprzewodniki i sprzęt AI', assetClass: 'STOCK', symbol: null, currency: 'USD', color: '#E11D48', active: true },
        { ticker: 'ORCL', name: 'Oracle Corporation', category: 'Chmura / Infrastruktura AI', assetClass: 'STOCK', symbol: null, currency: 'USD', color: '#F97316', active: true },
        { ticker: 'MKSI', name: 'MKS Inc.', category: 'Półprzewodniki i sprzęt AI', assetClass: 'STOCK', symbol: null, currency: 'USD', color: '#7C3AED', active: true },
        { ticker: 'NOW', name: 'ServiceNow, Inc.', category: 'Oprogramowanie / SaaS AI', assetClass: 'STOCK', symbol: null, currency: 'USD', color: '#06B6D4', active: true },
        { ticker: 'BTC', name: 'Bitcoin', category: 'Kryptowaluty', assetClass: 'CRYPTO', symbol: 'BTC-USD', currency: 'USD', color: '#F7931A', active: true },
        { ticker: 'AAPL', name: 'Apple Inc.', category: 'Platformy / Reklama AI', assetClass: 'STOCK', symbol: null, currency: 'USD', color: '#4F46E5', active: true },
        { ticker: 'INTC', name: 'Intel Corporation', category: 'Półprzewodniki i sprzęt AI', assetClass: 'STOCK', symbol: null, currency: 'USD', color: '#0EA5E9', active: true }
      ],
      transactions: [
        tx('Akcje', 2, 'STOCK', '2026-02-10', 'BUY', 'META', 7, 549.95),
        tx('Akcje', 3, 'STOCK', '2026-09-12', 'SELL', 'META', 2, 590.00, 'częściowa realizacja zysku'),
        tx('Akcje', 4, 'STOCK', '2026-03-04', 'BUY', 'NVDA', 10, 180.10),
        tx('Akcje', 5, 'STOCK', '2026-05-20', 'BUY', 'NVDA', 5, 189.55),
        tx('Akcje', 6, 'STOCK', '2026-04-15', 'BUY', 'AVGO', 6, 324.47),
        tx('Akcje', 7, 'STOCK', '2026-06-02', 'BUY', 'ORCL', 15, 127.44),
        tx('Akcje', 8, 'STOCK', '2026-07-08', 'BUY', 'MKSI', 5, 212.00),
        tx('Akcje', 9, 'STOCK', '2026-08-19', 'BUY', 'NOW', 10, 92.60, 'po splicie'),
        tx('Akcje', 10, 'STOCK', '2026-01-20', 'BUY', 'AAPL', 10, 210.00),
        tx('Akcje', 11, 'STOCK', '2026-07-15', 'SELL', 'AAPL', 10, 248.50, 'zamknięcie pozycji'),
        tx('Akcje', 12, 'STOCK', '2026-02-05', 'BUY', 'INTC', 30, 26.00),
        tx('Akcje', 13, 'STOCK', '2026-06-18', 'SELL', 'INTC', 30, 22.50, 'stop loss'),
        tx('Krypto', 2, 'CRYPTO', '2026-01-15', 'BUY', 'BTC', 0.01, 95000)
      ],
      cash: [{ currency: 'USD', amount: 1180, label: 'Wolne środki u brokera' }],
      categories: [
        { name: 'Półprzewodniki i sprzęt AI', color: '#10B981' },
        { name: 'Platformy / Reklama AI', color: '#2563EB' },
        { name: 'Chmura / Infrastruktura AI', color: '#F97316' },
        { name: 'Oprogramowanie / SaaS AI', color: '#06B6D4' },
        { name: 'Kryptowaluty', color: '#F7931A' }
      ],
      quotes: {
        META: q(596.22, 589.40, 598.10),
        NVDA: q(145.98, 148.20, 145.10),
        AVGO: q(346.65, 341.00, 347.90),
        ORCL: q(110.57, 112.30),
        MKSI: q(205.08, 203.90),
        NOW: q(88.87, 89.50, 89.20),
        'BTC-USD': Object.assign(q(91250, 89900), { marketState: 'OPEN_24H', regularTime: now - 120 })
      },
      earnings: {
        META: { date: addDays(66), estimate: true, source: 'demo' },
        NVDA: { date: addDays(95), estimate: true, source: 'demo' },
        AVGO: { date: addDays(11), estimate: false, source: 'demo' },
        ORCL: { date: addDays(16), estimate: false, source: 'demo' },
        NOW: { date: addDays(64), estimate: true, source: 'demo' }
      },
      warnings: []
    };
  }

  MM.demo = { payload };
})(window.MM = window.MM || {});
