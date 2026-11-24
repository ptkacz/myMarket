/* myMarket — główny kontroler UI */
(function (MM) {
  'use strict';

  const APP_VERSION = '1.3.5';
  const KEY_PREFS = 'mm.prefs';
  const AUTO_REFRESH_MS = 60_000;

  const $ = id => document.getElementById(id);
  const F = () => MM.fmt;
  const T = (k, v) => MM.i18n.t(k, v);

  // =========================================================================
  // 1. STAN APLIKACJI
  // =========================================================================
  const defaultPrefs = {
    lang: 'en',            // 'en' | 'pl'
    mode: 'stocks',        // 'stocks' | 'categories'
    scope: 'open',         // 'open' | 'all' | 'closed'
    includeCash: false,
    includeCrypto: true,
    usePrePost: false,
    chartStyle: 'donut',   // 'donut' | 'pie'
    sort: 'value'
  };

  function loadPrefs() {
    try {
      const p = JSON.parse(localStorage.getItem(KEY_PREFS) || '{}');
      return { ...defaultPrefs, ...p };
    } catch (e) { return { ...defaultPrefs }; }
  }

  function savePrefs() {
    try {
      localStorage.setItem(KEY_PREFS, JSON.stringify({
        lang: state.lang,
        mode: state.mode,
        scope: state.scope,
        includeCash: state.includeCash,
        includeCrypto: state.includeCrypto,
        usePrePost: state.usePrePost,
        chartStyle: state.chartStyle,
        sort: state.sort
      }));
    } catch (e) { /* ignorujemy */ }
  }

  const state = {
    ...loadPrefs(),
    payload: null,
    computed: null,
    viewData: null,
    isDemo: false,
    loading: false,
    error: null,
    lastFetchAt: 0,
    hoveredId: null,
    lockedId: null,
    ai: { format: 'md', hideAmounts: false, withPrompt: true }
  };

  MM.i18n.setLang(state.lang);

  // Referencje DOM
  const el = {
    portfolioName: $('portfolio-name'),
    statusLine: $('status-line'),
    notice: $('notice'),
    btnAi: $('btn-ai'),
    btnRefresh: $('btn-refresh'),
    refreshIcon: $('refresh-icon'),
    btnSettings: $('btn-settings'),
    tabStocks: $('tab-stocks'),
    tabCategories: $('tab-categories'),
    scopeOpen: $('scope-open'),
    scopeAll: $('scope-all'),
    scopeClosed: $('scope-closed'),
    chipCash: $('chip-cash'),
    chipCrypto: $('chip-crypto'),
    chipPrePost: $('chip-prepost'),
    chartWrap: $('chart-wrap'),
    closedSummary: $('closed-summary'),
    svg: $('portfolio-svg'),
    donutCenter: $('donut-center'),
    centerEyebrow: $('center-eyebrow'),
    centerPrimary: $('center-primary'),
    centerSecondary: $('center-secondary'),
    centerTertiary: $('center-tertiary'),
    detailBanner: $('detail-banner'),
    detailContent: $('detail-content'),
    legendHeading: $('legend-heading'),
    sortSelect: $('sort-select'),
    legendList: $('legend-list'),
    closedSection: $('closed-section'),
    closedHeading: $('closed-heading'),
    closedList: $('closed-list'),
    warnings: $('warnings'),
    footerNote: $('footer-note'),
    footerTotal: $('footer-total'),
    appVersion: $('app-version'),
    tooltip: $('floating-tooltip'),
    dlgSettings: $('dlg-settings'),
    inApi: $('in-api'),
    inToken: $('in-token'),
    btnStyleDonut: $('btn-style-donut'),
    btnStylePie: $('btn-style-pie'),
    btnLangEn: $('btn-lang-en'),
    btnLangPl: $('btn-lang-pl'),
    btnSaveConfig: $('btn-save-config'),
    btnDemo: $('btn-demo'),
    btnDisconnect: $('btn-disconnect'),
    dlgAi: $('dlg-ai'),
    btnAiClose: $('btn-ai-close'),
    aiFmtMd: $('ai-fmt-md'),
    aiFmtJson: $('ai-fmt-json'),
    aiHide: $('ai-hide'),
    aiPrompt: $('ai-prompt'),
    aiText: $('ai-text'),
    btnAiCopy: $('btn-ai-copy'),
    btnAiShare: $('btn-ai-share')
  };

  function applyStaticTranslations() {
    document.querySelectorAll('[data-i18n]').forEach(n => {
      n.textContent = T(n.dataset.i18n);
    });
    document.querySelectorAll('[data-i18n-html]').forEach(n => {
      n.innerHTML = T(n.dataset.i18nHtml);
    });
    document.querySelectorAll('[data-i18n-title]').forEach(n => {
      const txt = T(n.dataset.i18nTitle);
      n.title = txt;
      if (n.hasAttribute('aria-label')) n.setAttribute('aria-label', txt);
    });
  }

  // =========================================================================
  // 2. POBIERANIE DANYCH I CYKL ŻYCIA
  // =========================================================================
  function setLoading(on) {
    state.loading = on;
    el.btnRefresh.disabled = on;
    el.refreshIcon.classList.toggle('spinning', on);
  }

  function showSkeleton() {
    el.statusLine.textContent = T('loadingData');
    el.legendList.innerHTML = Array.from({ length: 5 }, () =>
      '<div class="p-2.5"><div class="skeleton h-[34px] w-full"></div></div>'
    ).join('');
    el.closedSection.classList.add('hidden');
    el.centerEyebrow.textContent = T('loading');
    el.centerPrimary.textContent = '…';
    el.centerSecondary.textContent = '';
    el.centerTertiary.textContent = '';
    el.detailContent.textContent = T('loadingDetail');
  }

  async function refresh({ fresh = false } = {}) {
    const cfg = MM.api.getConfig();
    if (!cfg) {
      enterDemo();
      return;
    }
    state.isDemo = false;
    state.error = null;
    setLoading(true);
    if (!state.payload) showSkeleton();
    else renderNotice();

    try {
      const data = await MM.api.fetchPortfolio(cfg, { fresh });
      state.payload = data;
      state.lastFetchAt = Date.now();
      state.error = null;
      recomputeAndRender();
    } catch (err) {
      state.error = err.message || T('connError');
      if (state.payload) {
        recomputeAndRender();
      } else {
        renderNotice();
        el.statusLine.textContent = T('connError');
        el.legendList.innerHTML = '';
        el.detailContent.textContent = T('checkSettings');
      }
    } finally {
      setLoading(false);
    }
  }

  function enterDemo() {
    state.isDemo = true;
    state.error = null;
    state.payload = MM.demo.payload();
    state.lockedId = null;
    state.hoveredId = null;
    recomputeAndRender();
  }

  // =========================================================================
  // 3. PRZELICZANIE I RENDEROWANIE
  // =========================================================================
  function recomputeAndRender() {
    if (!state.payload) return;
    state.computed = MM.engine.compute(state.payload, { usePrePost: state.usePrePost });
    state.viewData = MM.engine.view(state.computed, state);

    const sel = state.viewData.selectableItems;
    if (state.lockedId && !sel.some(i => i.id === state.lockedId)) state.lockedId = null;
    if (state.hoveredId && !sel.some(i => i.id === state.hoveredId)) state.hoveredId = null;

    renderHeader();
    renderNotice();
    renderControls();
    renderLeftPanel();
    renderLegend();
    renderWarnings();
    applyHighlight();
  }

  function renderHeader() {
    const r = state.computed;
    const f = F();
    el.portfolioName.textContent = r.portfolioName;
    document.title = `${r.portfolioName} — myMarket`;

    const badge = marketBadge(r);
    const parts = [badge];
    if (r.market.fetchedAt && !state.isDemo) {
      parts.push(`<span>${f.esc(T('quotesAt'))} <strong class="font-medium text-slate-700">${f.time(r.market.fetchedAt)}</strong></span>`);
    }
    if (state.usePrePost && r.anyExtended && state.scope !== 'closed') {
      parts.push(`<span class="px-1.5 py-0.5 rounded-md bg-amber-50 text-amber-700 border border-amber-200/80 text-[11px] font-semibold">${f.esc(T('withPrePost'))}</span>`);
    }
    if (r.market.source === 'googlefinance') {
      parts.push(`<span class="text-amber-700">${f.esc(T('gfFallback'))}</span>`);
    }
    el.statusLine.innerHTML = parts.join('<span class="text-slate-300">·</span>');
  }

  function marketBadge(r) {
    const f = F();
    if (state.isDemo) {
      return `<span class="inline-flex items-center gap-1.5"><span class="w-2 h-2 rounded-full bg-amber-400"></span>${f.esc(T('demoData'))}</span>`;
    }
    const map = {
      REGULAR: ['bg-emerald-500', T('marketRegular')],
      PRE: ['bg-amber-500', T('marketPre')],
      POST: ['bg-indigo-500', T('marketPost')],
      OPEN_24H: ['bg-emerald-500', T('market24h')],
      CLOSED: ['bg-slate-400', T('marketClosed')]
    };
    const [dot, label] = map[r.market.state] || ['bg-slate-400', T('marketLoaded')];
    return `<span class="inline-flex items-center gap-1.5"><span class="w-2 h-2 rounded-full ${dot}"></span>${f.esc(label)}</span>`;
  }

  function renderNotice() {
    const f = F();
    if (state.error) {
      el.notice.className = 'mb-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs sm:text-sm text-rose-800 flex items-center justify-between gap-3 flex-wrap';
      el.notice.innerHTML = `
        <span><strong>${f.esc(T('errorLabel'))}</strong> ${f.esc(state.error)}${state.payload ? f.esc(T('showingCached')) : ''}</span>
        <div class="flex gap-2">
          <button id="notice-retry" type="button" class="px-3 py-1 rounded-lg bg-rose-700 text-white text-xs font-semibold">${f.esc(T('retry'))}</button>
          <button id="notice-settings" type="button" class="px-3 py-1 rounded-lg bg-white border border-rose-200 text-rose-700 text-xs font-semibold">${f.esc(T('settings'))}</button>
        </div>`;
      $('notice-retry').addEventListener('click', () => refresh({ fresh: true }));
      $('notice-settings').addEventListener('click', openSettings);
      return;
    }
    if (state.isDemo) {
      el.notice.className = 'mb-4 rounded-2xl border border-blue-200/80 bg-blue-50/80 px-4 py-3 text-xs sm:text-sm text-blue-900 flex items-center justify-between gap-3 flex-wrap';
      el.notice.innerHTML = `
        <span><strong>${f.esc(T('demoBannerTitle'))}</strong> ${f.esc(T('demoBannerText'))}</span>
        <button id="notice-connect" type="button" class="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-semibold">${f.esc(T('connectSheet'))}</button>`;
      $('notice-connect').addEventListener('click', openSettings);
      return;
    }
    el.notice.className = 'hidden mb-4';
    el.notice.innerHTML = '';
  }

  function renderControls() {
    const r = state.computed;
    const isClosed = state.scope === 'closed';

    el.tabStocks.setAttribute('aria-selected', state.mode === 'stocks' ? 'true' : 'false');
    el.tabCategories.setAttribute('aria-selected', state.mode === 'categories' ? 'true' : 'false');

    el.scopeOpen.setAttribute('aria-selected', state.scope === 'open' ? 'true' : 'false');
    el.scopeAll.setAttribute('aria-selected', state.scope === 'all' ? 'true' : 'false');
    el.scopeClosed.setAttribute('aria-selected', isClosed ? 'true' : 'false');

    el.chipCash.classList.toggle('hidden', isClosed || !(r.cash.value > 0));
    el.chipCash.setAttribute('aria-pressed', state.includeCash ? 'true' : 'false');

    el.chipCrypto.classList.toggle('hidden', !r.hasCrypto);
    el.chipCrypto.setAttribute('aria-pressed', state.includeCrypto ? 'true' : 'false');

    el.chipPrePost.classList.toggle('hidden', isClosed || !r.anyExtended);
    el.chipPrePost.setAttribute('aria-pressed', state.usePrePost ? 'true' : 'false');

    const optVal = el.sortSelect.querySelector('option[value="value"]');
    const optDaily = el.sortSelect.querySelector('option[value="dailyPct"]');
    if (optVal) optVal.textContent = isClosed ? T('sortPnlUsd') : T('sortValue');
    if (optDaily) optDaily.hidden = isClosed;
    if (isClosed && state.sort === 'dailyPct') state.sort = 'value';
    el.sortSelect.value = state.sort;

    el.donutCenter.style.opacity = state.chartStyle === 'donut' ? '1' : '0';
  }

  function renderLeftPanel() {
    if (state.scope === 'closed') {
      el.chartWrap.classList.add('hidden');
      el.closedSummary.classList.remove('hidden');
      renderClosedSummary();
    } else {
      el.chartWrap.classList.remove('hidden');
      el.closedSummary.classList.add('hidden');
      renderChart();
    }
  }

  function renderClosedSummary() {
    const f = F();
    const cur = state.computed.base;
    const s = state.viewData.summary;

    if (!s.closedCount) {
      el.closedSummary.innerHTML = `
        <div class="py-6">
          <div class="text-xs font-semibold uppercase tracking-wider text-slate-400">${f.esc(T('closedPositions'))}</div>
          <div class="text-sm text-slate-500 mt-2">${f.esc(T('closedEmpty'))}</div>
        </div>`;
      return;
    }

    const balance = T('recordBalance', { w: s.closedWins, l: s.closedLosses });
    el.closedSummary.innerHTML = `
      <div class="text-[11px] font-semibold uppercase tracking-wider text-slate-400">${f.esc(T('realizedTitle', { n: s.closedCount }))}</div>
      <div class="flex items-center justify-center gap-2 mt-1.5 flex-wrap">
        <span class="text-2xl sm:text-3xl font-extrabold tracking-tight tabular-nums ${f.gainClass(s.closedPnl)}">${f.signedMoney(s.closedPnl, cur)}</span>
        <span class="inline-flex items-center px-2 py-0.5 rounded-lg text-xs font-bold border tabular-nums ${f.gainBadgeClass(s.closedPnlPct)}">${f.signedPct(s.closedPnlPct)}</span>
      </div>
      <div class="grid grid-cols-3 gap-2 mt-4 pt-4 border-t border-slate-200/80 text-xs">
        <div>
          <span class="text-slate-400 block">${f.esc(T('invested'))}</span>
          <span class="font-semibold text-slate-800 tabular-nums">${f.money(s.closedCost, cur)}</span>
        </div>
        <div>
          <span class="text-slate-400 block">${f.esc(T('proceeds'))}</span>
          <span class="font-semibold text-slate-800 tabular-nums">${f.money(s.closedProceeds, cur)}</span>
        </div>
        <div>
          <span class="text-slate-400 block">${f.esc(T('record'))}</span>
          <span class="font-semibold text-slate-800 tabular-nums">${f.esc(balance)}</span>
        </div>
      </div>`;
  }

  function renderChart() {
    MM.chart.render(el.svg, state.viewData.items, state.viewData.total, {
      style: state.chartStyle,
      showTickers: state.mode === 'stocks',
      onEnter: (item, e) => { state.hoveredId = item.id; applyHighlight(); showTooltip(item, e); },
      onMove: e => positionTooltip(e),
      onLeave: () => { state.hoveredId = null; applyHighlight(); hideTooltip(); },
      onSelect: item => {
        state.lockedId = state.lockedId === item.id ? null : item.id;
        applyHighlight();
      }
    });
  }

  function isClosedItem(item) {
    return item.kind === 'closed-position' || item.kind === 'closed-category';
  }

  function itemHeaderHtml(item, cur) {
    const f = F();
    if (isClosedItem(item)) {
      const tag = item.kind === 'closed-position'
        ? `<span class="text-[10px] font-semibold uppercase px-1.5 py-0 rounded bg-slate-100 text-slate-500 shrink-0">${f.esc(T('closedTag'))}</span>`
        : `<span class="text-[11px] font-medium text-slate-400 shrink-0">${f.esc(T('posCount', { n: item.positions.length }))}</span>`;
      const badge = `<span class="inline-flex items-center px-1.5 py-0 leading-[18px] rounded text-[11px] font-semibold border tabular-nums ${f.gainBadgeClass(item.pnlPct)}">${f.signedPct(item.pnlPct)}</span>`;
      return `
        <div class="space-y-0.5">
          <div class="flex items-center justify-between gap-2">
            <div class="flex items-center gap-2 min-w-0">
              <span class="w-2.5 h-2.5 rounded-full shrink-0 opacity-80" style="background-color:${f.esc(item.color)}"></span>
              <span class="font-bold text-[13.5px] text-slate-900 truncate">${f.esc(item.label)}</span>
              ${tag}
            </div>
            <div class="flex items-center gap-1.5 shrink-0">
              <span class="font-bold text-[13.5px] tabular-nums ${f.gainClass(item.pnl)}">${f.signedMoney(item.pnl, cur)}</span>
              ${badge}
            </div>
          </div>
          <div class="flex items-center justify-between gap-2 pl-[18px]">
            <span class="text-[11.5px] text-slate-500 truncate">${f.esc(item.subtitle)}</span>
            <span class="text-[11px] text-slate-400 shrink-0 tabular-nums">${f.esc(T('costPrefix'))} ${f.money(item.cost, cur)}</span>
          </div>
        </div>`;
    }

    const badge = item.kind === 'cash'
      ? `<span class="text-[10.5px] font-medium px-1.5 py-0 leading-[18px] rounded bg-slate-100 text-slate-600">${f.esc(T('reserveBadge'))}</span>`
      : `<span class="inline-flex items-center px-1.5 py-0 leading-[18px] rounded text-[11px] font-semibold border tabular-nums ${f.gainBadgeClass(item.pnlPct)}">${f.signedPct(item.pnlPct)}</span>`;

    const qtyBadge = item.kind === 'position'
      ? `<span class="text-[11px] font-medium text-slate-400 shrink-0 tabular-nums">${f.esc(T('qtyUnit', { n: f.qty(item.position.quantity) }))}</span>`
      : (item.kind === 'category' ? `<span class="text-[11px] font-medium text-slate-400 shrink-0">${f.esc(T('posCount', { n: item.positions.length }))}</span>` : '');

    const extTag = item.kind === 'position' && item.position.extended && state.usePrePost
      ? `<span class="text-[10px] font-semibold uppercase px-1 py-0 leading-[16px] rounded bg-amber-50 text-amber-700 shrink-0">${item.position.extended.type}</span>`
      : '';

    const dailyLine = item.dailyPct !== null
      ? `<span class="text-[11px] tabular-nums ${f.gainClass(item.dailyPct)}">${f.esc(T('todayShort'))} ${f.signedPct(item.dailyPct)}</span>`
      : '';

    return `
      <div class="space-y-0.5">
        <div class="flex items-center justify-between gap-2">
          <div class="flex items-center gap-2 min-w-0">
            <span class="w-2.5 h-2.5 rounded-full shrink-0" style="background-color:${f.esc(item.color)}"></span>
            <span class="font-bold text-[13.5px] text-slate-900 truncate">${f.esc(item.label)}</span>
            ${qtyBadge}${extTag}
          </div>
          <div class="flex items-baseline gap-1.5 shrink-0 tabular-nums">
            <span class="font-bold text-[13.5px] text-slate-900">${f.money(item.value, cur)}</span>
            <span class="text-[11.5px] font-semibold text-slate-500">${f.pct(item.sharePct, 1)}</span>
          </div>
        </div>
        <div class="flex items-center justify-between gap-2 pl-[18px]">
          <span class="text-[11.5px] text-slate-500 truncate">${f.esc(item.subtitle)}</span>
          <div class="flex items-center gap-1.5 shrink-0">
            ${badge}${dailyLine}
          </div>
        </div>
      </div>`;
  }

  function scrollToDetailIfHidden() {
    const r = el.detailBanner.getBoundingClientRect();
    if (r.top < 12 || r.bottom > window.innerHeight - 12) {
      el.detailBanner.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  function createRowElement(item, cur) {
    const row = document.createElement('div');
    row.className = 'legend-row hover:bg-slate-50/80 transition-colors cursor-pointer px-3 py-2 focus:outline-none focus-visible:bg-blue-50/50';
    row.dataset.id = item.id;
    row.setAttribute('role', 'button');
    row.setAttribute('tabindex', '0');
    row.innerHTML = itemHeaderHtml(item, cur);

    const toggleSelect = () => {
      const locking = state.lockedId !== item.id;
      state.lockedId = locking ? item.id : null;
      applyHighlight();
      if (locking) scrollToDetailIfHidden();
    };

    row.addEventListener('mouseenter', () => { state.hoveredId = item.id; applyHighlight(); });
    row.addEventListener('mouseleave', () => { state.hoveredId = null; applyHighlight(); });
    row.addEventListener('click', e => { e.stopPropagation(); toggleSelect(); });
    row.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleSelect(); }
    });
    return row;
  }

  function renderLegend() {
    const f = F();
    const cur = state.computed.base;
    const { items, closedItems, total, summary: s } = state.viewData;

    el.legendList.innerHTML = '';
    el.closedList.innerHTML = '';

    if (state.scope === 'closed') {
      el.closedSection.classList.add('hidden');
      el.legendHeading.textContent = state.mode === 'stocks'
        ? T('headingClosedPositions', { n: closedItems.length })
        : T('headingClosedCategories', { n: closedItems.length });

      if (!closedItems.length) {
        el.legendList.innerHTML = `<div class="p-6 text-center text-sm text-slate-400">${f.esc(T('emptyClosed'))}</div>`;
        el.footerTotal.textContent = '';
        return;
      }
      closedItems.forEach(item => el.legendList.appendChild(createRowElement(item, cur)));
      el.footerTotal.textContent = T('footerClosed', { p: f.signedMoney(s.closedPnl, cur), pct: f.signedPct(s.closedPnlPct) });
      return;
    }

    el.legendHeading.textContent = state.mode === 'stocks'
      ? T('headingPositions', { n: items.length })
      : T('headingCategories', { n: items.length });

    if (!items.length) {
      el.legendList.innerHTML = `<div class="p-6 text-center text-sm text-slate-400">${f.esc(T('emptyOpen'))}</div>`;
    } else {
      items.forEach(item => el.legendList.appendChild(createRowElement(item, cur)));
    }

    if (state.scope === 'all' && closedItems.length) {
      el.closedSection.classList.remove('hidden');
      el.closedHeading.textContent = state.mode === 'stocks'
        ? T('headingClosedPositions', { n: closedItems.length })
        : T('headingClosedCategories', { n: closedItems.length });
      closedItems.forEach(item => el.closedList.appendChild(createRowElement(item, cur)));
      el.footerTotal.textContent = T('footerAll', { v: f.money(total, cur), p: f.signedMoney(s.allPnl, cur) });
    } else {
      el.closedSection.classList.add('hidden');
      el.footerTotal.textContent = items.length ? T('footerTotal', { v: f.money(total, cur) }) : '';
    }
  }

  function renderWarnings() {
    const f = F();
    const list = state.computed.warnings || [];
    if (!list.length) {
      el.warnings.className = 'hidden mt-4';
      el.warnings.innerHTML = '';
      return;
    }
    el.warnings.className = 'mt-4 rounded-2xl border border-amber-200/80 bg-amber-50/70 p-3 text-xs text-amber-900';
    el.warnings.innerHTML = `
      <details>
        <summary class="font-semibold cursor-pointer select-none">${f.esc(T('sheetWarnings', { n: list.length }))}</summary>
        <ul class="mt-2 space-y-1 list-disc list-inside text-amber-800">
          ${list.map(w => `<li><span class="font-medium">${f.esc(w.where)}:</span> ${f.esc(w.message)}</li>`).join('')}
        </ul>
      </details>`;
  }

  // =========================================================================
  // 4. PODŚWIETLANIE, ŚRODEK PIERŚCIENIA, SZCZEGÓŁY, TOOLTIP
  // =========================================================================
  function applyHighlight() {
    if (!state.viewData) return;
    const f = F();
    const cur = state.computed.base;
    const activeId = state.hoveredId || state.lockedId;
    const activeItem = activeId ? state.viewData.selectableItems.find(i => i.id === activeId) : null;

    if (state.scope !== 'closed') MM.chart.highlight(el.svg, activeId);

    [el.legendList, el.closedList].forEach(container => {
      container.querySelectorAll('.legend-row').forEach(row => {
        const id = row.dataset.id;
        const isAct = id === activeId;
        row.dataset.active = isAct ? 'true' : 'false';
        row.dataset.dim = activeId && !isAct ? 'true' : 'false';
      });
    });

    if (state.scope !== 'closed') {
      if (activeItem && isClosedItem(activeItem)) {
        el.centerEyebrow.textContent = activeItem.kind === 'closed-category' ? T('eyebrowClosedCat') : `${activeItem.label} · ${T('eyebrowClosedSuffix')}`;
        el.centerPrimary.textContent = f.signedPct(activeItem.pnlPct);
        el.centerSecondary.textContent = f.signedMoney(activeItem.pnl, cur);
        el.centerSecondary.className = `text-xs font-semibold mt-1 tabular-nums ${f.gainClass(activeItem.pnl)}`;
        el.centerTertiary.textContent = `${T('costPrefix')}: ${f.money(activeItem.cost, cur)}`;
        el.centerTertiary.className = 'text-[11px] font-medium text-slate-500 mt-0.5 tabular-nums';
      } else if (activeItem) {
        el.centerEyebrow.textContent = activeItem.kind === 'category' ? T('eyebrowCategory') : (activeItem.kind === 'cash' ? T('eyebrowReserve') : activeItem.label);
        el.centerPrimary.textContent = f.pct(activeItem.sharePct);
        el.centerSecondary.textContent = f.money(activeItem.value, cur);
        el.centerSecondary.className = 'text-xs font-semibold text-slate-600 mt-1 tabular-nums';
        if (activeItem.pnl !== null) {
          el.centerTertiary.textContent = `${f.signedMoney(activeItem.pnl, cur)} (${f.signedPct(activeItem.pnlPct)})`;
          el.centerTertiary.className = `text-[11px] font-semibold mt-0.5 tabular-nums ${f.gainClass(activeItem.pnl)}`;
        } else {
          el.centerTertiary.textContent = '';
        }
      } else {
        const s = state.viewData.summary;
        el.centerEyebrow.textContent = state.viewData.eyebrow;
        el.centerPrimary.textContent = f.money(state.viewData.total, cur);

        const renderTodayBlock = () => {
          el.centerTertiary.innerHTML =
            `<span class="block text-[10px] font-semibold uppercase tracking-wider text-slate-400">${f.esc(T('lblToday'))}</span>` +
            `<span class="block font-semibold ${f.gainClass(s.daily)}">${f.signedMoney(s.daily, cur)} (${f.signedPct(s.dailyPct)})</span>`;
          el.centerTertiary.className = 'text-[11px] mt-1.5 tabular-nums leading-tight space-y-0.5';
        };

        if (state.scope === 'all') {
          if (s.allCost > 0) {
            el.centerSecondary.textContent = `${f.signedMoney(s.allPnl, cur)} (${f.signedPct(s.allPnlPct)})`;
            el.centerSecondary.className = `text-xs font-semibold mt-1 tabular-nums ${f.gainClass(s.allPnl)}`;
          } else {
            el.centerSecondary.textContent = '';
          }
          if (s.closedCount > 0) {
            el.centerTertiary.innerHTML =
              `<span class="block">${f.esc(T('openShort'))} <strong class="font-semibold ${f.gainClass(s.pnl)}">${f.signedMoney(s.pnl, cur)}</strong></span>` +
              `<span class="block">${f.esc(T('closedShort'))} <strong class="font-semibold ${f.gainClass(s.closedPnl)}">${f.signedMoney(s.closedPnl, cur)}</strong></span>`;
            el.centerTertiary.className = 'text-[10.5px] sm:text-[11px] font-medium text-slate-400 mt-1.5 tabular-nums leading-tight space-y-0.5';
          } else if (s.daily !== null) {
            renderTodayBlock();
          } else {
            el.centerTertiary.textContent = '';
          }
        } else {
          if (s.openTotalCost > 0) {
            el.centerSecondary.textContent = `${f.signedMoney(s.pnl, cur)} (${f.signedPct(s.pnlPct)})`;
            el.centerSecondary.className = `text-xs font-semibold mt-1 tabular-nums ${f.gainClass(s.pnl)}`;
          } else {
            el.centerSecondary.textContent = '';
          }
          if (s.daily !== null) {
            renderTodayBlock();
          } else {
            el.centerTertiary.textContent = '';
          }
        }
      }
    }

    renderDetailBanner(activeItem, cur);
  }

  function extendedInfo(p, cur) {
    if (!p.extended) return '';
    const f = F();
    const label = p.extended.type === 'pre' ? T('preMarket') : T('afterHours');
    const diff = p.extended.changePct !== undefined ? ` (${f.signedPct(p.extended.changePct)})` : '';
    return `${label}: ${f.price(p.extended.price, cur)}${diff}`;
  }

  function earningsText(e) {
    if (!e) return '';
    const f = F();
    const rel = e.daysUntil === 0
      ? T('earningsToday')
      : (e.daysUntil === 1 ? T('earningsTomorrow') : T('earningsInDays', { n: e.daysUntil }));
    const est = e.estimate ? `, ${T('earningsEst')}` : '';
    return `${e.estimate ? '~' : ''}${f.shortDate(e.date)} (${rel}${est})`;
  }

  function rowExtraHtml(item, cur) {
    const f = F();
    if (item.kind === 'cash') {
      return item.entries.map(e =>
        `<div class="flex justify-between py-0.5"><span class="text-slate-500">${f.esc(e.label || T('cashLabel'))}</span><span class="font-semibold tabular-nums">${f.money(e.amount, e.currency)}</span></div>`
      ).join('');
    }
    if (item.kind === 'closed-position') {
      const c = item.closed;
      const period = c.firstDate && c.lastDate ? (c.firstDate === c.lastDate ? c.lastDate : `${c.firstDate} → ${c.lastDate}`) : (c.lastDate || '—');
      return `
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <div><span class="text-slate-400 block">${f.esc(T('lblCost'))}</span><span class="font-semibold tabular-nums">${f.money(c.cost, cur)}</span></div>
          <div><span class="text-slate-400 block">${f.esc(T('lblProceeds'))}</span><span class="font-semibold tabular-nums">${f.money(c.proceeds, cur)}</span></div>
          <div><span class="text-slate-400 block">${f.esc(T('lblAvgBuy'))}</span><span class="font-semibold tabular-nums">${f.price(c.avgBuyPrice, cur)}</span></div>
          <div><span class="text-slate-400 block">${f.esc(T('lblAvgSell'))}</span><span class="font-semibold tabular-nums">${f.price(c.avgSellPrice, cur)}</span></div>
        </div>
        <div class="flex flex-wrap justify-between gap-2 mt-2 pt-2 border-t border-slate-100 text-[11px] text-slate-500">
          <span>${f.esc(T('lblCategory'))}: <strong class="font-medium text-slate-700">${f.esc(c.category)}</strong></span>
          <span class="tabular-nums">${f.esc(T('lblPeriod'))}: ${f.esc(period)}${c.fees > 0 ? ` · ${f.esc(T('lblFees'))}: ${f.money(c.fees, cur)}` : ''}</span>
        </div>`;
    }
    if (item.kind === 'closed-category') {
      return `
        <div class="grid grid-cols-3 gap-2">
          <div><span class="text-slate-400 block">${f.esc(T('lblCost'))}</span><span class="font-semibold tabular-nums">${f.money(item.cost, cur)}</span></div>
          <div><span class="text-slate-400 block">${f.esc(T('lblProceeds'))}</span><span class="font-semibold tabular-nums">${f.money(item.proceeds, cur)}</span></div>
          <div><span class="text-slate-400 block">${f.esc(T('lblRealized'))}</span><span class="font-bold tabular-nums ${f.gainClass(item.pnl)}">${f.signedMoney(item.pnl, cur)}</span></div>
        </div>`;
    }
    if (item.kind === 'category') {
      const partialVal = item.hasPartialSales
        ? `<strong class="${f.gainClass(item.realized)}">${f.signedMoney(item.realized, cur)}</strong>`
        : '<strong class="font-medium text-slate-400">—</strong>';
      return `
        <div class="grid grid-cols-3 gap-2">
          <div><span class="text-slate-400 block">${f.esc(T('lblCost'))}</span><span class="font-semibold tabular-nums">${f.money(item.cost, cur)}</span></div>
          <div><span class="text-slate-400 block">${f.esc(T('lblPnl'))}</span><span class="font-bold tabular-nums ${f.gainClass(item.pnl)}">${f.signedMoney(item.pnl, cur)}</span></div>
          <div><span class="text-slate-400 block">${f.esc(T('lblToday'))}</span><span class="font-semibold tabular-nums ${f.gainClass(item.daily)}">${item.daily !== null ? f.signedMoney(item.daily, cur) : '—'}</span></div>
        </div>
        <div class="grid grid-cols-2 gap-x-4 mt-2 pt-2 border-t border-slate-100 text-[11px] text-slate-500 tabular-nums">
          <span class="truncate">${f.esc(T('lblOpenPnl'))}: <strong class="${f.gainClass(item.unrealizedPnl)}">${f.signedMoney(item.unrealizedPnl, cur)}</strong></span>
          <span class="truncate text-right">${f.esc(T('lblPartialRealizedCat'))}: ${partialVal}</span>
        </div>`;
    }
    const p = item.position;
    const ext = extendedInfo(p, cur);
    const earn = !p.isCrypto ? earningsText(p.earnings) : '';
    const earnCls = p.earnings && p.earnings.daysUntil <= 14 ? 'font-semibold text-blue-700' : 'font-medium text-slate-700';
    const earnVal = earn
      ? `<strong class="${earnCls}">${f.esc(earn)}</strong>`
      : '<strong class="font-medium text-slate-400">—</strong>';
    const realizedHtml = p.hasPartialSales
      ? `${f.esc(T('lblPartialRealized', { qty: f.qty(p.totalSoldQty) }))}: <strong class="${f.gainClass(p.realized)}">${f.signedMoney(p.realized, cur)}</strong>`
      : `${f.esc(T('lblRealized'))}: <strong class="font-medium text-slate-400">—</strong>`;
    const extHtml = ext
      ? `<span class="font-medium text-amber-700 tabular-nums truncate">${f.esc(ext)}</span>`
      : `<span class="text-slate-500 truncate">${f.esc(T('chipPrePost'))}: <strong class="font-medium text-slate-400">—</strong></span>`;
    return `
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <div><span class="text-slate-400 block">${f.esc(T('lblAvgBuy'))}</span><span class="font-semibold tabular-nums">${f.price(p.avgCost, cur)}</span></div>
        <div><span class="text-slate-400 block">${f.esc(T('lblPrice'))}${p.priceSource === 'pre' ? ' (pre)' : p.priceSource === 'post' ? ' (post)' : ''}</span><span class="font-semibold tabular-nums">${f.price(p.price, cur)}</span></div>
        <div><span class="text-slate-400 block">${f.esc(T('lblCost'))}</span><span class="font-semibold tabular-nums">${f.money(p.cost, cur)}</span></div>
        <div><span class="text-slate-400 block">${f.esc(T('lblPnl'))}</span><span class="font-bold tabular-nums ${f.gainClass(p.pnl)}">${f.signedMoney(p.pnl, cur)}</span></div>
      </div>
      <div class="grid grid-cols-2 gap-x-4 mt-2 pt-2 border-t border-slate-100 text-[11px] text-slate-500 tabular-nums">
        <span class="truncate">${f.esc(T('lblOpenPnl'))}: <strong class="${f.gainClass(p.unrealizedPnl)}">${f.signedMoney(p.unrealizedPnl, cur)}</strong></span>
        <span class="truncate text-right">${realizedHtml}</span>
      </div>
      <div class="mt-2 pt-2 border-t border-slate-100 text-[11px] text-slate-500 space-y-1">
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1">
          <span class="truncate">${f.esc(T('lblCategory'))}: <strong class="font-medium text-slate-700">${f.esc(p.category)}</strong></span>
          <span class="truncate sm:text-right tabular-nums">${f.esc(T('lblEarnings'))}: ${earnVal}</span>
        </div>
        <div class="flex items-center justify-between">${extHtml}</div>
      </div>`;
  }

  function renderDetailBanner(item, cur) {
    const f = F();
    if (!item) {
      el.detailBanner.className = 'w-full mt-4 rounded-2xl border border-slate-200/90 bg-slate-50/80 p-4 transition-all';
      const hint = state.scope === 'closed' ? T('hintClosed') : T('hintDefault');
      el.detailContent.className = 'text-center text-xs text-slate-500';
      el.detailContent.innerHTML = f.esc(hint);
      return;
    }
    el.detailBanner.className = 'w-full mt-4 rounded-2xl ring-2 ring-slate-900 bg-white p-3.5 sm:p-4 shadow-sm transition-all';
    el.detailContent.className = '';
    el.detailContent.innerHTML = `
      ${itemHeaderHtml(item, cur)}
      <div class="mt-2.5 pt-2.5 border-t border-slate-100 text-xs">${rowExtraHtml(item, cur)}</div>`;
  }

  function showTooltip(item, event) {
    const f = F();
    const cur = state.computed.base;
    let body = '';
    if (item.kind === 'cash') {
      body = `<div class="flex justify-between"><span class="text-slate-400">${f.esc(T('ttAmount'))}</span><span class="font-semibold tabular-nums">${f.money(item.value, cur)}</span></div>`;
    } else if (item.kind === 'category') {
      body = `
        <div class="flex justify-between"><span class="text-slate-400">${f.esc(T('ttValue'))}</span><span class="font-semibold tabular-nums">${f.money(item.value, cur)}</span></div>
        <div class="flex justify-between"><span class="text-slate-400">${f.esc(T('ttPositions'))}</span><span class="text-slate-200 text-right">${f.esc(item.subtitle)}</span></div>
        <div class="flex justify-between pt-1.5 mt-1 border-t border-slate-800"><span class="text-slate-400">${f.esc(T('ttPnl'))}</span><span class="font-bold tabular-nums ${f.gainClass(item.pnl, true)}">${f.signedMoney(item.pnl, cur)} (${f.signedPct(item.pnlPct)})</span></div>`;
    } else {
      const p = item.position;
      const ext = extendedInfo(p, cur);
      const earn = earningsText(p.earnings);
      body = `
        <div class="flex justify-between"><span class="text-slate-400">${f.esc(T('ttValue'))}</span><span class="font-semibold tabular-nums">${f.money(p.value, cur)}</span></div>
        <div class="flex justify-between"><span class="text-slate-400">${f.esc(T('ttQty'))}</span><span class="tabular-nums">${f.esc(T('qtyUnit', { n: f.qty(p.quantity) }))}</span></div>
        <div class="flex justify-between"><span class="text-slate-400">${f.esc(T('ttAvgBuy'))}</span><span class="tabular-nums">${f.price(p.avgCost, cur)}</span></div>
        <div class="flex justify-between"><span class="text-slate-400">${f.esc(T('ttSessionPrice'))}</span><span class="tabular-nums">${f.price(p.regularPrice ?? p.price, cur)}</span></div>
        ${ext ? `<div class="flex justify-between text-amber-300"><span>${f.esc(T('ttExtended'))}</span><span class="tabular-nums">${f.esc(ext.replace(/^[^:]+:\s*/, ''))}</span></div>` : ''}
        ${earn ? `<div class="flex justify-between text-sky-300"><span>${f.esc(T('ttEarnings'))}</span><span class="tabular-nums text-right">${f.esc(earn)}</span></div>` : ''}
        <div class="flex justify-between"><span class="text-slate-400">${f.esc(T('ttCategory'))}</span><span class="text-slate-300 text-right">${f.esc(p.category)}</span></div>
        <div class="flex justify-between pt-1.5 mt-1 border-t border-slate-800"><span class="text-slate-400">${f.esc(T('ttPnl'))}</span><span class="font-bold tabular-nums ${f.gainClass(p.pnl, true)}">${f.signedMoney(p.pnl, cur)} (${f.signedPct(p.pnlPct)})</span></div>`;
    }
    el.tooltip.innerHTML = `
      <div class="flex items-center justify-between gap-2 pb-2 mb-2 border-b border-slate-700/80">
        <div class="flex items-center gap-2 min-w-0">
          <span class="w-2.5 h-2.5 rounded-full shrink-0" style="background-color:${f.esc(item.color)}"></span>
          <span class="font-bold truncate">${f.esc(item.label)}</span>
        </div>
        <span class="text-xs font-bold px-2 py-0.5 rounded bg-slate-800 shrink-0 tabular-nums">${f.pct(item.sharePct)}</span>
      </div>
      <div class="space-y-1.5 text-xs">${body}</div>`;
    el.tooltip.style.opacity = '1';
    positionTooltip(event);
  }

  function positionTooltip(e) {
    const off = 16;
    const r = el.tooltip.getBoundingClientRect();
    let left = e.clientX + off;
    let top = e.clientY + off;
    if (left + r.width > window.innerWidth - 12) left = e.clientX - r.width - off;
    if (top + r.height > window.innerHeight - 12) top = e.clientY - r.height - off;
    el.tooltip.style.left = `${Math.max(12, left)}px`;
    el.tooltip.style.top = `${Math.max(12, top)}px`;
  }

  function hideTooltip() { el.tooltip.style.opacity = '0'; }

  // =========================================================================
  // 5. DIALOGI (USTAWIENIA I EKSPORT DLA AI)
  // =========================================================================
  function openSettings() {
    const cfg = MM.api.getConfig();
    el.inApi.value = cfg ? cfg.api : '';
    el.inToken.value = cfg ? cfg.token : '';
    syncStyleButtons();
    syncLangButtons();
    el.btnDisconnect.classList.toggle('hidden', !cfg);
    el.dlgSettings.showModal();
  }

  function syncStyleButtons() {
    el.btnStyleDonut.setAttribute('aria-selected', state.chartStyle === 'donut' ? 'true' : 'false');
    el.btnStylePie.setAttribute('aria-selected', state.chartStyle === 'pie' ? 'true' : 'false');
  }

  function syncLangButtons() {
    el.btnLangEn.setAttribute('aria-selected', state.lang === 'en' ? 'true' : 'false');
    el.btnLangPl.setAttribute('aria-selected', state.lang === 'pl' ? 'true' : 'false');
  }

  function setLanguage(lang) {
    state.lang = MM.i18n.setLang(lang);
    savePrefs();
    applyStaticTranslations();
    syncLangButtons();
    if (state.isDemo) state.payload = MM.demo.payload();
    recomputeAndRender();
  }

  function updateAiText() {
    if (!state.computed) return;
    const isMd = state.ai.format === 'md';
    el.aiFmtMd.setAttribute('aria-selected', isMd ? 'true' : 'false');
    el.aiFmtJson.setAttribute('aria-selected', !isMd ? 'true' : 'false');
    el.aiHide.setAttribute('aria-pressed', state.ai.hideAmounts ? 'true' : 'false');
    el.aiPrompt.setAttribute('aria-pressed', state.ai.withPrompt ? 'true' : 'false');
    el.aiPrompt.classList.toggle('hidden', !isMd);
    const opts = { usePrePost: state.usePrePost, hideAmounts: state.ai.hideAmounts, withPrompt: state.ai.withPrompt };
    el.aiText.value = isMd ? MM.ai.markdown(state.computed, opts) : MM.ai.json(state.computed, opts);
  }

  function openAi() {
    if (!state.computed) return;
    updateAiText();
    el.btnAiShare.classList.toggle('hidden', !navigator.share);
    el.btnAiCopy.textContent = T('btnCopy');
    el.dlgAi.showModal();
  }

  async function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
      el.aiText.select();
      document.execCommand('copy');
    }
  }

  // =========================================================================
  // 6. ZDARZENIA I START
  // =========================================================================
  function setScope(newScope) {
    state.scope = newScope;
    state.lockedId = null;
    state.hoveredId = null;
    savePrefs();
    recomputeAndRender();
  }

  function bindEvents() {
    el.tabStocks.addEventListener('click', () => { state.mode = 'stocks'; state.lockedId = null; savePrefs(); recomputeAndRender(); });
    el.tabCategories.addEventListener('click', () => { state.mode = 'categories'; state.lockedId = null; savePrefs(); recomputeAndRender(); });

    el.scopeOpen.addEventListener('click', () => setScope('open'));
    el.scopeAll.addEventListener('click', () => setScope('all'));
    el.scopeClosed.addEventListener('click', () => setScope('closed'));

    el.chipCash.addEventListener('click', () => { state.includeCash = !state.includeCash; savePrefs(); recomputeAndRender(); });
    el.chipCrypto.addEventListener('click', () => { state.includeCrypto = !state.includeCrypto; savePrefs(); recomputeAndRender(); });
    el.chipPrePost.addEventListener('click', () => { state.usePrePost = !state.usePrePost; savePrefs(); recomputeAndRender(); });
    el.sortSelect.addEventListener('change', () => { state.sort = el.sortSelect.value; savePrefs(); recomputeAndRender(); });

    el.btnRefresh.addEventListener('click', () => refresh({ fresh: true }));
    el.btnSettings.addEventListener('click', openSettings);
    el.btnAi.addEventListener('click', openAi);

    el.btnStyleDonut.addEventListener('click', () => { state.chartStyle = 'donut'; savePrefs(); syncStyleButtons(); recomputeAndRender(); });
    el.btnStylePie.addEventListener('click', () => { state.chartStyle = 'pie'; savePrefs(); syncStyleButtons(); recomputeAndRender(); });
    el.btnLangEn.addEventListener('click', () => setLanguage('en'));
    el.btnLangPl.addEventListener('click', () => setLanguage('pl'));

    function parseConnectInput(raw) {
      const s = String(raw || '').trim();
      const idx = s.indexOf('?');
      if (idx === -1) return null;
      const p = new URLSearchParams(s.slice(idx + 1));
      const api = p.get('api');
      const token = p.get('token');
      return api && token ? { api: api.trim(), token: token.trim() } : null;
    }

    function trySplitConnectInput() {
      const parsed = parseConnectInput(el.inApi.value);
      if (parsed) {
        el.inApi.value = parsed.api;
        el.inToken.value = parsed.token;
      }
    }

    el.inApi.addEventListener('input', trySplitConnectInput);
    el.inApi.addEventListener('paste', () => setTimeout(trySplitConnectInput, 0));

    el.btnSaveConfig.addEventListener('click', () => {
      trySplitConnectInput();
      const api = el.inApi.value.trim();
      const token = el.inToken.value.trim();
      if (!api || !token) { alert(T('alertMissingCreds')); return; }
      MM.api.saveConfig(api, token);
      state.payload = null;
      el.dlgSettings.close();
      refresh({ fresh: true });
    });

    el.btnDemo.addEventListener('click', () => { el.dlgSettings.close(); enterDemo(); });
    el.btnDisconnect.addEventListener('click', () => {
      if (!confirm(T('confirmDisconnect'))) return;
      MM.api.clearConfig();
      el.dlgSettings.close();
      enterDemo();
    });

    el.btnAiClose.addEventListener('click', () => el.dlgAi.close());
    el.aiFmtMd.addEventListener('click', () => { state.ai.format = 'md'; updateAiText(); });
    el.aiFmtJson.addEventListener('click', () => { state.ai.format = 'json'; updateAiText(); });
    el.aiHide.addEventListener('click', () => { state.ai.hideAmounts = !state.ai.hideAmounts; updateAiText(); });
    el.aiPrompt.addEventListener('click', () => { state.ai.withPrompt = !state.ai.withPrompt; updateAiText(); });
    el.btnAiCopy.addEventListener('click', async () => {
      await copyText(el.aiText.value);
      el.btnAiCopy.textContent = T('btnCopied');
      setTimeout(() => { el.btnAiCopy.textContent = T('btnCopy'); }, 1800);
    });
    el.btnAiShare.addEventListener('click', () => {
      navigator.share({ title: T('aiShareTitle', { name: state.computed.portfolioName }), text: el.aiText.value }).catch(() => {});
    });

    // Kliknięcie poza wykresem/listą zdejmuje zaznaczenie
    el.detailBanner.addEventListener('click', e => e.stopPropagation());
    document.addEventListener('click', () => {
      if (state.lockedId) { state.lockedId = null; applyHighlight(); }
    });
    [el.dlgSettings, el.dlgAi].forEach(d => d.addEventListener('click', e => {
      if (e.target === d) d.close();
    }));

    // Auto-odświeżanie gdy otwarte w godzinach notowań
    setInterval(() => {
      if (document.visibilityState !== 'visible' || state.isDemo || state.loading) return;
      const ms = state.computed && state.computed.market.state;
      if (ms && ms !== 'CLOSED') refresh({ fresh: false });
    }, AUTO_REFRESH_MS);

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && !state.isDemo && !state.loading &&
        Date.now() - state.lastFetchAt > AUTO_REFRESH_MS) {
        refresh({ fresh: false });
      }
    });
  }

  function init() {
    el.appVersion.textContent = APP_VERSION;
    applyStaticTranslations();
    bindEvents();

    // Jednorazowe podłączenie z linku QR (#connect?api=...&token=...)
    const fromHash = MM.api.configFromHash();
    if (fromHash) {
      MM.api.saveConfig(fromHash.api, fromHash.token);
      history.replaceState(null, '', location.pathname + location.search);
      refresh({ fresh: true });
      return;
    }

    const cfg = MM.api.getConfig();
    if (!cfg) {
      enterDemo();
      return;
    }

    // Natychmiastowy widok z cache, potem aktualizacja w tle
    const cached = MM.api.getCached();
    if (cached) {
      state.payload = cached;
      recomputeAndRender();
    }
    refresh({ fresh: false });
  }

  init();
})(window.MM = window.MM || {});
