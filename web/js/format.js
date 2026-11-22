/* myMarket — formatowanie (standard polski: spacja tysięcy, przecinek dziesiętny) */
(function (MM) {
  'use strict';
  const NBSP = '\u00A0';

  function isNum(n) { return typeof n === 'number' && isFinite(n); }

  function num(n, d = 2) {
    if (!isNum(n)) return '—';
    const fixed = Math.abs(n).toFixed(d);
    const [i, f] = fixed.split('.');
    const int = i.replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
    const neg = n < 0 && Number(fixed) !== 0;
    return (neg ? '-' : '') + int + (f !== undefined ? ',' + f : '');
  }

  function sign(n, d) { return isNum(n) && Number(n.toFixed(d)) > 0 ? '+' : ''; }

  function money(n, cur = 'USD', d = 2) { return isNum(n) ? `${num(n, d)}${NBSP}${cur}` : '—'; }
  function signedMoney(n, cur = 'USD', d = 2) { return isNum(n) ? sign(n, d) + money(n, cur, d) : '—'; }
  function pct(n, d = 2) { return isNum(n) ? `${num(n, d)}%` : '—'; }
  function signedPct(n, d = 2) { return isNum(n) ? sign(n, d) + pct(n, d) : '—'; }

  /** Cena: małe wartości z większą precyzją */
  function price(n, cur = 'USD') {
    if (!isNum(n)) return '—';
    const d = Math.abs(n) < 1 ? 4 : 2;
    return money(n, cur, d);
  }

  /** Ilość: liczby całkowite bez miejsc po przecinku, ułamki do 8 miejsc */
  function qty(n) {
    if (!isNum(n)) return '—';
    if (Math.abs(n - Math.round(n)) < 1e-9) return num(Math.round(n), 0);
    const s = n.toFixed(8).replace(/0+$/, '').replace(/\.$/, '');
    const [i, f] = s.split('.');
    return num(Number(i), 0) + (f ? ',' + f : '');
  }

  function dateTime(tsSec) {
    if (!tsSec) return '—';
    const d = new Date(tsSec * 1000);
    return d.toLocaleString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  function time(tsSec) {
    if (!tsSec) return '—';
    return new Date(tsSec * 1000).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });
  }

  function esc(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function gainClass(n, dark = false) {
    if (!isNum(n) || Math.abs(n) < 0.005) return dark ? 'text-slate-300' : 'text-slate-600';
    return n > 0 ? (dark ? 'text-emerald-400' : 'text-emerald-600') : (dark ? 'text-rose-400' : 'text-rose-600');
  }

  function gainBadgeClass(n) {
    if (!isNum(n) || Math.abs(n) < 0.005) return 'bg-slate-50 text-slate-600 border-slate-200/70';
    return n > 0 ? 'bg-emerald-50 text-emerald-700 border-emerald-200/70' : 'bg-rose-50 text-rose-700 border-rose-200/70';
  }

  MM.fmt = { isNum, num, money, signedMoney, pct, signedPct, price, qty, dateTime, time, esc, gainClass, gainBadgeClass };
})(window.MM = window.MM || {});
