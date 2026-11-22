/* myMarket — klient API (Apps Script Web App) + konfiguracja i cache lokalny */
(function (MM) {
  'use strict';

  const KEY_CONFIG = 'mm.config';
  const KEY_CACHE = 'mm.cache';
  const SUPPORTED_API = 1;

  function getConfig() {
    try {
      const c = JSON.parse(localStorage.getItem(KEY_CONFIG) || 'null');
      return c && c.api && c.token ? c : null;
    } catch (e) { return null; }
  }

  function saveConfig(api, token) {
    const cfg = { api: String(api).trim(), token: String(token).trim() };
    localStorage.setItem(KEY_CONFIG, JSON.stringify(cfg));
    return cfg;
  }

  function clearConfig() {
    localStorage.removeItem(KEY_CONFIG);
    localStorage.removeItem(KEY_CACHE);
  }

  /** Odczyt konfiguracji z linku: …/#connect?api=…&token=… */
  function configFromHash() {
    const h = location.hash || '';
    const m = /^#connect\?(.*)$/.exec(h);
    if (!m) return null;
    const p = new URLSearchParams(m[1]);
    const api = p.get('api');
    const token = p.get('token');
    return api && token ? { api, token } : null;
  }

  function getCached() {
    try { return JSON.parse(localStorage.getItem(KEY_CACHE) || 'null'); } catch (e) { return null; }
  }

  function setCached(payload) {
    try { localStorage.setItem(KEY_CACHE, JSON.stringify(payload)); } catch (e) { /* brak miejsca — ignorujemy */ }
  }

  async function fetchPortfolio(cfg, { fresh = false } = {}) {
    const url = new URL(cfg.api);
    url.searchParams.set('action', 'portfolio');
    url.searchParams.set('token', cfg.token);
    if (fresh) url.searchParams.set('fresh', '1');
    url.searchParams.set('_', Date.now().toString());

    let res;
    try {
      res = await fetch(url.toString(), { method: 'GET', redirect: 'follow', cache: 'no-store' });
    } catch (e) {
      throw new Error('Brak połączenia z API. Sprawdź internet lub adres Web App.');
    }
    if (!res.ok) throw new Error(`API zwróciło błąd HTTP ${res.status}.`);

    let data;
    try { data = await res.json(); } catch (e) {
      throw new Error('API nie zwróciło JSON. Upewnij się, że wdrożenie ma dostęp „Każdy” i URL kończy się na /exec.');
    }
    if (data.error) throw new Error(data.message || data.error);
    if (data.apiVersion > SUPPORTED_API) {
      console.warn('Nowsza wersja API niż obsługiwana przez frontend:', data.apiVersion);
    }
    setCached(data);
    return data;
  }

  MM.api = { getConfig, saveConfig, clearConfig, configFromHash, getCached, setCached, fetchPortfolio };
})(window.MM = window.MM || {});
