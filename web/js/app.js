/* myMarket — główny kontroler UI */
(function (MM) {
  'use strict';

  const APP_VERSION = '1.0.0';
  const KEY_PREFS = 'mm.prefs';
  const AUTO_REFRESH_MS = 60_000;

  const $ = id => document.getElementById(id);
  const F = () => MM.fmt;

  // =========================================================================
  // 1. STAN APLIKACJI
  // =========================================================================
  const defaultPrefs = {
    mode: 'stocks',        // 'stocks' | 'categories'
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
        mode: state.mode,
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
    chipCash: $('chip-cash'),
    chipCrypto: $('chip-crypto'),
    chipPrePost: $('chip-prepost'),
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

  // =========================================================================
  // 2. POBIERANIE DANYCH I CYKL ŻYCIA
  // =========================================================================
  function setLoading(on) {
    state.loading = on;
    el.btnRefresh.disabled = on;
    el.refreshIcon.classList.toggle('spinning', on);
  }

  function showSkeleton() {
    el.statusLine.textContent = 'Pobieranie danych z arkusza…';
    el.legendList.innerHTML = Array.from({ length: 5 }, () =>
      '<div class="skeleton h-[68px] w-full"></div>'
    ).join('');
    el.centerEyebrow.textContent = 'Ładowanie';
    el.centerPrimary.textContent = '…';
    el.centerSecondary.textContent = '';
    el.centerTertiary.textContent = '';
    el.detailContent.textContent = 'Pobieranie pozycji i aktualnych kursów…';
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
      state.error = err.message || 'Nie udało się pobrać danych.';
      if (state.payload) {
        recomputeAndRender();
      } else {
        renderNotice();
        el.statusLine.textContent = 'Błąd połączenia';
        el.legendList.innerHTML = '';
        el.detailContent.textContent = 'Sprawdź ustawienia połączenia z arkuszem.';
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

    const items = state.viewData.items;
    if (state.lockedId && !items.some(i => i.id === state.lockedId)) state.lockedId = null;
    if (state.hoveredId && !items.some(i => i.id === state.hoveredId)) state.hoveredId = null;

    renderHeader();
    renderNotice();
    renderControls();
    renderChart();
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
      parts.push(`<span>Kursy: <strong class="font-medium text-slate-700">${f.time(r.market.fetchedAt)}</strong></span>`);
    }
    if (state.usePrePost && r.anyExtended) {
      parts.push('<span class="px-1.5 py-0.5 rounded-md bg-amber-50 text-amber-700 border border-amber-200/80 text-[11px] font-semibold">z Pre/Post</span>');
    }
    if (r.market.source === 'googlefinance') {
      parts.push('<span class="text-amber-700">(fallback Google Finance, opóźnione)</span>');
    }
    el.statusLine.innerHTML = parts.join('<span class="text-slate-300">·</span>');
  }

  function marketBadge(r) {
    if (state.isDemo) {
      return '<span class="inline-flex items-center gap-1.5"><span class="w-2 h-2 rounded-full bg-amber-400"></span>Dane przykładowe</span>';
    }
    const map = {
      REGULAR: ['bg-emerald-500', 'Sesja otwarta'],
      PRE: ['bg-amber-500', 'Pre-market'],
      POST: ['bg-indigo-500', 'After-hours'],
      OPEN_24H: ['bg-emerald-500', 'Rynek 24/7'],
      CLOSED: ['bg-slate-400', 'Rynek zamknięty']
    };
    const [dot, label] = map[r.market.state] || ['bg-slate-400', 'Kursy pobrane'];
    return `<span class="inline-flex items-center gap-1.5"><span class="w-2 h-2 rounded-full ${dot}"></span>${label}</span>`;
  }

  function renderNotice() {
    const f = F();
    if (state.error) {
      el.notice.className = 'mb-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs sm:text-sm text-rose-800 flex items-center justify-between gap-3 flex-wrap';
      el.notice.innerHTML = `
        <span><strong>Błąd:</strong> ${f.esc(state.error)}${state.payload ? ' (wyświetlane są ostatnio zapisane dane)' : ''}</span>
        <div class="flex gap-2">
          <button id="notice-retry" type="button" class="px-3 py-1 rounded-lg bg-rose-700 text-white text-xs font-semibold">Ponów</button>
          <button id="notice-settings" type="button" class="px-3 py-1 rounded-lg bg-white border border-rose-200 text-rose-700 text-xs font-semibold">Ustawienia</button>
        </div>`;
      $('notice-retry').addEventListener('click', () => refresh({ fresh: true }));
      $('notice-settings').addEventListener('click', openSettings);
      return;
    }
    if (state.isDemo) {
      el.notice.className = 'mb-4 rounded-2xl border border-blue-200/80 bg-blue-50/80 px-4 py-3 text-xs sm:text-sm text-blue-900 flex items-center justify-between gap-3 flex-wrap';
      el.notice.innerHTML = `
        <span><strong>Tryb demo.</strong> Podłącz swój Arkusz Google, aby zobaczyć własny portfel i aktualne kursy.</span>
        <button id="notice-connect" type="button" class="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-semibold">Połącz arkusz</button>`;
      $('notice-connect').addEventListener('click', openSettings);
      return;
    }
    el.notice.className = 'hidden mb-4';
    el.notice.innerHTML = '';
  }

  function renderControls() {
    const r = state.computed;
    el.tabStocks.setAttribute('aria-selected', state.mode === 'stocks' ? 'true' : 'false');
    el.tabCategories.setAttribute('aria-selected', state.mode === 'categories' ? 'true' : 'false');

    el.chipCash.classList.toggle('hidden', !(r.cash.value > 0));
    el.chipCash.setAttribute('aria-pressed', state.includeCash ? 'true' : 'false');

    el.chipCrypto.classList.toggle('hidden', !r.hasCrypto);
    el.chipCrypto.setAttribute('aria-pressed', state.includeCrypto ? 'true' : 'false');

    el.chipPrePost.classList.toggle('hidden', !r.anyExtended);
    el.chipPrePost.setAttribute('aria-pressed', state.usePrePost ? 'true' : 'false');

    el.sortSelect.value = state.sort;
    el.donutCenter.style.opacity = state.chartStyle === 'donut' ? '1' : '0';
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

  function renderLegend() {
    const f = F();
    const r = state.computed;
    const { items, total } = state.viewData;
    const cur = r.base;

    const countLabel = items.length;
    el.legendHeading.textContent = state.mode === 'stocks'
      ? `Pozycje (${countLabel})`
      : `Kategorie (${countLabel})`;

    if (!items.length) {
      el.legendList.innerHTML = '<div class="rounded-2xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-400">Brak pozycji do wyświetlenia. Dodaj transakcje w zakładce „Akcje” lub „Krypto”.</div>';
      el.footerTotal.textContent = '';
      return;
    }

    el.legendList.innerHTML = '';
    items.forEach(item => {
      const row = document.createElement('div');
      row.className = 'legend-row rounded-2xl border border-slate-200/80 bg-white hover:border-slate-300 transition-all cursor-pointer';
      row.dataset.id = item.id;
      row.setAttribute('role', 'button');
      row.setAttribute('tabindex', '0');

      const badge = item.kind === 'cash'
        ? '<span class="text-[11px] font-medium px-2 py-0.5 rounded-md bg-slate-100 text-slate-600">Rezerwa</span>'
        : `<span class="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] font-semibold border tabular-nums ${f.gainBadgeClass(item.pnlPct)}">${f.signedPct(item.pnlPct)}</span>`;

      const qtyBadge = item.kind === 'position'
        ? `<span class="text-[11px] font-medium text-slate-400 shrink-0 tabular-nums">${f.qty(item.position.quantity)} szt.</span>`
        : (item.kind === 'category' ? `<span class="text-[11px] font-medium text-slate-400 shrink-0">${item.positions.length} poz.</span>` : '');

      const extTag = item.kind === 'position' && item.position.extended && state.usePrePost
        ? `<span class="text-[10px] font-semibold uppercase px-1 py-0.5 rounded bg-amber-50 text-amber-700">${item.position.extended.type}</span>`
        : '';

      const dailyLine = item.dailyPct !== null
        ? `<span class="text-[11px] tabular-nums ${f.gainClass(item.dailyPct)}">dziś ${f.signedPct(item.dailyPct)}</span>`
        : '';

      row.innerHTML = `
        <div class="flex items-center justify-between gap-3 p-3">
          <div class="flex items-center gap-3 min-w-0">
            <span class="w-3.5 h-3.5 rounded-full shrink-0 shadow-sm ring-2 ring-white" style="background-color:${f.esc(item.color)}"></span>
            <div class="min-w-0">
              <div class="flex items-center gap-1.5">
                <span class="font-bold text-sm text-slate-900 truncate">${f.esc(item.label)}</span>
                ${qtyBadge}${extTag}
              </div>
              <div class="text-xs text-slate-500 truncate">${f.esc(item.subtitle)}</div>
            </div>
          </div>
          <div class="text-right shrink-0">
            <div class="font-bold text-sm text-slate-900 tabular-nums">${f.money(item.value, cur)}</div>
            <div class="flex items-center justify-end gap-1.5 mt-0.5">
              <span class="text-xs font-semibold text-slate-600 tabular-nums">${f.pct(item.sharePct)}</span>
              ${badge}
            </div>
            ${dailyLine ? `<div class="mt-0.5">${dailyLine}</div>` : ''}
          </div>
        </div>
        <div class="row-extra hidden px-3 pb-3 pt-2 border-t border-slate-100 text-xs"></div>`;

      row.addEventListener('mouseenter', () => { state.hoveredId = item.id; applyHighlight(); });
      row.addEventListener('mouseleave', () => { state.hoveredId = null; applyHighlight(); });
      row.addEventListener('click', e => {
        e.stopPropagation();
        state.lockedId = state.lockedId === item.id ? null : item.id;
        applyHighlight();
      });
      row.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          state.lockedId = state.lockedId === item.id ? null : item.id;
          applyHighlight();
        }
      });

      el.legendList.appendChild(row);
    });

    el.footerTotal.textContent = `Łącznie: ${f.money(total, cur)} (100,00%)`;
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
        <summary class="font-semibold cursor-pointer select-none">Uwagi z arkusza (${list.length})</summary>
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
    const activeItem = activeId ? state.viewData.items.find(i => i.id === activeId) : null;

    MM.chart.highlight(el.svg, activeId);

    // Wiersze legendy + rozwijanie zablokowanego wiersza (wygodne na telefonie)
    el.legendList.querySelectorAll('.legend-row').forEach(row => {
      const id = row.dataset.id;
      const isAct = id === activeId;
      const isLocked = id === state.lockedId;
      row.dataset.active = isAct ? 'true' : 'false';
      row.dataset.dim = activeId && !isAct ? 'true' : 'false';
      const extra = row.querySelector('.row-extra');
      if (isLocked) {
        const it = state.viewData.items.find(x => x.id === id);
        extra.innerHTML = it ? rowExtraHtml(it, cur) : '';
        extra.classList.remove('hidden');
      } else {
        extra.classList.add('hidden');
      }
    });

    // Środek pierścienia
    if (activeItem) {
      el.centerEyebrow.textContent = activeItem.kind === 'category' ? 'Kategoria' : (activeItem.kind === 'cash' ? 'Rezerwa' : activeItem.label);
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
      if (s.cost > 0) {
        el.centerSecondary.textContent = `${f.signedMoney(s.pnl, cur)} (${f.signedPct(s.pnlPct)})`;
        el.centerSecondary.className = `text-xs font-semibold mt-1 tabular-nums ${f.gainClass(s.pnl)}`;
      } else {
        el.centerSecondary.textContent = '';
      }
      if (s.daily !== null) {
        el.centerTertiary.textContent = `Dziś: ${f.signedMoney(s.daily, cur)} (${f.signedPct(s.dailyPct)})`;
        el.centerTertiary.className = `text-[11px] font-medium mt-0.5 tabular-nums ${f.gainClass(s.daily)}`;
      } else {
        el.centerTertiary.textContent = '';
      }
    }

    renderDetailBanner(activeItem, cur);
  }

  function extendedInfo(p, cur) {
    if (!p.extended) return '';
    const f = F();
    const label = p.extended.type === 'pre' ? 'Pre-market' : 'After-hours';
    const diff = p.extended.changePct !== undefined ? ` (${f.signedPct(p.extended.changePct)})` : '';
    return `${label}: ${f.price(p.extended.price, cur)}${diff}`;
  }

  function rowExtraHtml(item, cur) {
    const f = F();
    if (item.kind === 'cash') {
      return item.entries.map(e =>
        `<div class="flex justify-between py-0.5"><span class="text-slate-500">${f.esc(e.label || 'Gotówka')}</span><span class="font-semibold tabular-nums">${f.money(e.amount, e.currency)}</span></div>`
      ).join('');
    }
    if (item.kind === 'category') {
      return `
        <div class="grid grid-cols-3 gap-2">
          <div><span class="text-slate-400 block">Koszt</span><span class="font-semibold tabular-nums">${f.money(item.cost, cur)}</span></div>
          <div><span class="text-slate-400 block">Wynik</span><span class="font-bold tabular-nums ${f.gainClass(item.pnl)}">${f.signedMoney(item.pnl, cur)}</span></div>
          <div><span class="text-slate-400 block">Dziś</span><span class="font-semibold tabular-nums ${f.gainClass(item.daily)}">${item.daily !== null ? f.signedMoney(item.daily, cur) : '—'}</span></div>
        </div>`;
    }
    const p = item.position;
    const ext = extendedInfo(p, cur);
    return `
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <div><span class="text-slate-400 block">Śr. zakup</span><span class="font-semibold tabular-nums">${f.price(p.avgCost, cur)}</span></div>
        <div><span class="text-slate-400 block">Kurs${p.priceSource === 'pre' ? ' (pre)' : p.priceSource === 'post' ? ' (post)' : ''}</span><span class="font-semibold tabular-nums">${f.price(p.price, cur)}</span></div>
        <div><span class="text-slate-400 block">Koszt</span><span class="font-semibold tabular-nums">${f.money(p.cost, cur)}</span></div>
        <div><span class="text-slate-400 block">Wynik</span><span class="font-bold tabular-nums ${f.gainClass(p.pnl)}">${f.signedMoney(p.pnl, cur)}</span></div>
      </div>
      <div class="flex flex-wrap justify-between gap-2 mt-2 pt-2 border-t border-slate-100 text-[11px] text-slate-500">
        <span>Kategoria: <strong class="font-medium text-slate-700">${f.esc(p.category)}</strong></span>
        ${ext ? `<span class="font-medium text-amber-700 tabular-nums">${f.esc(ext)}</span>` : ''}
      </div>`;
  }

  function renderDetailBanner(item, cur) {
    const f = F();
    if (!item) {
      el.detailBanner.className = 'w-full mt-4 rounded-2xl border border-slate-200/90 bg-slate-50/80 p-4 transition-all';
      el.detailContent.innerHTML = '<div class="text-center text-xs text-slate-500">Najedź lub dotknij segment wykresu albo pozycję z listy, aby sprawdzić szczegóły.</div>';
      return;
    }
    el.detailBanner.className = 'w-full mt-4 rounded-2xl border border-slate-300/90 bg-white p-4 shadow-sm transition-all';
    const header = `
      <div class="flex items-center justify-between gap-2 mb-2">
        <div class="flex items-center gap-2 min-w-0">
          <span class="w-3 h-3 rounded-full shrink-0" style="background-color:${f.esc(item.color)}"></span>
          <span class="font-bold text-sm text-slate-900 truncate">${f.esc(item.label)}</span>
          ${item.kind === 'position' ? `<span class="text-xs text-slate-500 truncate">${f.esc(item.subtitle)}</span>` : ''}
        </div>
        <span class="text-xs font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded-md shrink-0 tabular-nums">${f.pct(item.sharePct)}</span>
      </div>`;
    el.detailContent.innerHTML = header + `<div class="pt-2 border-t border-slate-100 text-xs">${rowExtraHtml(item, cur)}</div>`;
  }

  function showTooltip(item, event) {
    const f = F();
    const cur = state.computed.base;
    let body = '';
    if (item.kind === 'cash') {
      body = `<div class="flex justify-between"><span class="text-slate-400">Kwota:</span><span class="font-semibold tabular-nums">${f.money(item.value, cur)}</span></div>`;
    } else if (item.kind === 'category') {
      body = `
        <div class="flex justify-between"><span class="text-slate-400">Wartość:</span><span class="font-semibold tabular-nums">${f.money(item.value, cur)}</span></div>
        <div class="flex justify-between"><span class="text-slate-400">Pozycje:</span><span class="text-slate-200 text-right">${f.esc(item.subtitle)}</span></div>
        <div class="flex justify-between pt-1.5 mt-1 border-t border-slate-800"><span class="text-slate-400">Wynik:</span><span class="font-bold tabular-nums ${f.gainClass(item.pnl, true)}">${f.signedMoney(item.pnl, cur)} (${f.signedPct(item.pnlPct)})</span></div>`;
    } else {
      const p = item.position;
      const ext = extendedInfo(p, cur);
      body = `
        <div class="flex justify-between"><span class="text-slate-400">Wartość:</span><span class="font-semibold tabular-nums">${f.money(p.value, cur)}</span></div>
        <div class="flex justify-between"><span class="text-slate-400">Ilość:</span><span class="tabular-nums">${f.qty(p.quantity)} szt.</span></div>
        <div class="flex justify-between"><span class="text-slate-400">Śr. zakup:</span><span class="tabular-nums">${f.price(p.avgCost, cur)}</span></div>
        <div class="flex justify-between"><span class="text-slate-400">Kurs (sesja):</span><span class="tabular-nums">${f.price(p.regularPrice ?? p.price, cur)}</span></div>
        ${ext ? `<div class="flex justify-between text-amber-300"><span>Poza sesją:</span><span class="tabular-nums">${f.esc(ext.replace(/^[^:]+:\s*/, ''))}</span></div>` : ''}
        <div class="flex justify-between"><span class="text-slate-400">Kategoria:</span><span class="text-slate-300 text-right">${f.esc(p.category)}</span></div>
        <div class="flex justify-between pt-1.5 mt-1 border-t border-slate-800"><span class="text-slate-400">Wynik:</span><span class="font-bold tabular-nums ${f.gainClass(p.pnl, true)}">${f.signedMoney(p.pnl, cur)} (${f.signedPct(p.pnlPct)})</span></div>`;
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
    el.btnDisconnect.classList.toggle('hidden', !cfg);
    el.dlgSettings.showModal();
  }

  function syncStyleButtons() {
    el.btnStyleDonut.setAttribute('aria-selected', state.chartStyle === 'donut' ? 'true' : 'false');
    el.btnStylePie.setAttribute('aria-selected', state.chartStyle === 'pie' ? 'true' : 'false');
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
    el.btnAiCopy.textContent = 'Kopiuj';
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
  function bindEvents() {
    el.tabStocks.addEventListener('click', () => { state.mode = 'stocks'; state.lockedId = null; savePrefs(); recomputeAndRender(); });
    el.tabCategories.addEventListener('click', () => { state.mode = 'categories'; state.lockedId = null; savePrefs(); recomputeAndRender(); });

    el.chipCash.addEventListener('click', () => { state.includeCash = !state.includeCash; savePrefs(); recomputeAndRender(); });
    el.chipCrypto.addEventListener('click', () => { state.includeCrypto = !state.includeCrypto; savePrefs(); recomputeAndRender(); });
    el.chipPrePost.addEventListener('click', () => { state.usePrePost = !state.usePrePost; savePrefs(); recomputeAndRender(); });
    el.sortSelect.addEventListener('change', () => { state.sort = el.sortSelect.value; savePrefs(); recomputeAndRender(); });

    el.btnRefresh.addEventListener('click', () => refresh({ fresh: true }));
    el.btnSettings.addEventListener('click', openSettings);
    el.btnAi.addEventListener('click', openAi);

    el.btnStyleDonut.addEventListener('click', () => { state.chartStyle = 'donut'; savePrefs(); syncStyleButtons(); recomputeAndRender(); });
    el.btnStylePie.addEventListener('click', () => { state.chartStyle = 'pie'; savePrefs(); syncStyleButtons(); recomputeAndRender(); });

    el.inApi.addEventListener('input', () => {
      const m = /#connect\?(.*)$/.exec(el.inApi.value.trim());
      if (!m) return;
      const p = new URLSearchParams(m[1]);
      if (p.get('api') && p.get('token')) {
        el.inApi.value = p.get('api');
        el.inToken.value = p.get('token');
      }
    });

    el.btnSaveConfig.addEventListener('click', () => {
      let api = el.inApi.value.trim();
      let token = el.inToken.value.trim();
      const m = /#connect\?(.*)$/.exec(api);
      if (m) {
        const p = new URLSearchParams(m[1]);
        if (p.get('api')) api = p.get('api').trim();
        if (p.get('token')) token = p.get('token').trim();
      }
      if (!api || !token) { alert('Podaj adres API i token (albo wklej cały link z Arkusza).'); return; }
      MM.api.saveConfig(api, token);
      state.payload = null;
      el.dlgSettings.close();
      refresh({ fresh: true });
    });

    el.btnDemo.addEventListener('click', () => { el.dlgSettings.close(); enterDemo(); });
    el.btnDisconnect.addEventListener('click', () => {
      if (!confirm('Odłączyć arkusz od tej przeglądarki? (Dane w arkuszu pozostają nienaruszone.)')) return;
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
      el.btnAiCopy.textContent = 'Skopiowano ✓';
      setTimeout(() => { el.btnAiCopy.textContent = 'Kopiuj'; }, 1800);
    });
    el.btnAiShare.addEventListener('click', () => {
      navigator.share({ title: `${state.computed.portfolioName} — podsumowanie`, text: el.aiText.value }).catch(() => {});
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
