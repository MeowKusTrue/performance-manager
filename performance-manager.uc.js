// ==UserScript==
// @name Performance Manager
// @include main
// ==/UserScript==
(() => {
  'use strict';
  const PREFIX = 'sine.performance-manager.';
  const DEFAULT_EXCLUSIONS = 'mail.google.com, drive.google.com, chatgpt.com, web.telegram.org, discord.com, reduxhub.ru, github.com, localhost, 127.0.0.1';
  function domains(value) {
    return String(value).toLowerCase().split(/[\s,;]+/).map(x => x.replace(/^\*?\./, '').replace(/\.$/, '')).filter(Boolean);
  }
  function matches(host, list) {
    host = String(host).toLowerCase().replace(/\.$/, '');
    return list.some(x => host === x || host.endsWith('.' + x));
  }
  function eligible(t, opts, now, mediaSafe) {
    try {
      const b = t.linkedBrowser;
      if (!b || !b.isConnected || !b.isRemoteBrowser || t.closing || t.selected || t.pinned || t.hidden || t.multiselected || t.undiscardable || t.soundPlaying || t.pictureinpicture) return false;
      if (['pending','discarded','busy','sharing','soundplaying','soundplaying-scheduledremoval','pictureinpicture','activemedia-blocked','undiscardable','multiselected'].some(a => t.hasAttribute(a))) return false;
      if (!Number.isFinite(t.lastAccessed) || t.lastAccessed <= 0 || now - t.lastAccessed < opts.minutes * 60000) return false;
      const uri = b.currentURI;
      if (!uri || !['http','https'].includes(uri.scheme)) return false;
      const host = uri.asciiHost || uri.host;
      if (!host || matches(host, opts.exclusions) || (opts.allowOnly && !matches(host, opts.allowed))) return false;
      if (b.webProgress?.isLoadingDocument) return false;
      return mediaSafe(b) === true;
    } catch (_) { return false; }
  }
  function memoryBytes(root) {
    const seen = new Set();
    let total = 0;
    function visit(p) {
      if (!p || !Number.isFinite(p.pid) || seen.has(p.pid)) return;
      seen.add(p.pid);
      if (Number.isFinite(p.memory) && p.memory >= 0) total += p.memory;
      for (const child of p.children || []) visit(child);
    }
    visit(root);
    return total || null;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { domains, matches, eligible, memoryBytes };
    return;
  }
  if (typeof window === 'undefined' || !window.document || window.location.href !== 'chrome://browser/content/browser.xhtml') return;
  const w = window;
  const d = w.document;
  const S = Services;
  const prefs = S.prefs;
  const KEY = '__sinePerformanceManager';
  w[KEY]?.destroy();
  const getBool = (k, fallback) => prefs.getBoolPref(PREFIX + k, fallback);
  const getStr = (k, fallback) => prefs.getStringPref(PREFIX + k, fallback);
  const setBool = (k, v) => prefs.setBoolPref(PREFIX + k, v);
  function options() {
    const game = getBool('game', false);
    const minutes = Number(getStr('minutes', '15'));
    return { minutes: game ? 3 : (Number.isFinite(minutes) ? Math.max(3, Math.min(120, minutes)) : 15),
      exclusions: domains(getStr('exclusions', DEFAULT_EXCLUSIONS)), allowOnly: getBool('allow-only', true),
      allowed: domains(getStr('allowed', 'youtube.com')) };
  }
  let rtc, privateUtils;
  try {
    rtc = ChromeUtils.importESModule('resource:///modules/webrtcUI.sys.mjs').webrtcUI;
    privateUtils = ChromeUtils.importESModule('resource://gre/modules/PrivateBrowsingUtils.sys.mjs').PrivateBrowsingUtils;
  } catch (e) { console.warn('[Performance Manager] Safety APIs unavailable', e); }
  function mediaSafe(b) {
    if (!rtc || !privateUtils || privateUtils.isBrowserPrivate(b)) return false;
    const wg = b.browsingContext?.currentWindowGlobal;
    return !!wg && typeof wg.hasActivePeerConnections === 'function' && !rtc.browserHasStreams(b) && !wg.hasActivePeerConnections();
  }
  let disposed = false, timer = null, button = null, popup = null, running = false, sampling = false, memoryBusy = false, last = 'Ready', readyObserver = null;
  const retryTimers = new Set();
  const callbacks = new Map();
  function later(fn, ms) {
    const id = w.setTimeout(() => { retryTimers.delete(id); if (!disposed) fn(); }, ms);
    retryTimers.add(id); return id;
  }
  const supported = () => typeof w.gBrowser?.prepareDiscardBrowser === 'function' && typeof w.gBrowser?.discardBrowser === 'function' && !!rtc && !!privateUtils;
  function status(s) { last = s; if (callbacks.has('status')) callbacks.get('status').setAttribute('label', s); }
  function check(t, opts) { return eligible(t, opts, Date.now(), mediaSafe); }
  async function sweep(manual = false) {
    if (disposed || running || (!manual && !getBool('enabled', false))) return;
    if (!supported()) { status('Tab unloading API unavailable'); return; }
    running = true;
    let count = 0;
    try {
      const gb = w.gBrowser;
      const initial = options();
      const candidates = [...gb.tabs].filter(t => check(t, initial)).sort((a,b) => a.lastAccessed - b.lastAccessed);
      for (const t of candidates.slice(0, manual ? 8 : 3)) {
        if (disposed || (!manual && !getBool('enabled', false))) break;
        if (!check(t, options())) continue;
        const uri = t.linkedBrowser.currentURI.spec;
        let timeout;
        try {
          const ok = await Promise.race([
            Promise.resolve(gb.prepareDiscardBrowser(t)).then(() => true),
            new Promise(resolve => { timeout = w.setTimeout(() => resolve(false), 5000); })
          ]);
          if (!ok || disposed || (!manual && !getBool('enabled', false)) || !check(t, options()) || t.linkedBrowser.currentURI.spec !== uri) continue;
          // Never force discard or bypass Firefox's permitUnload checks.
          if (await gb.discardBrowser(t, { forceDiscard: false, renderDiscarded: true })) count++;
        } catch (e) { console.warn('[Performance Manager] Skip tab', e); }
        finally { if (timeout !== undefined) w.clearTimeout(timeout); }
      }
      status(`Unloaded: ${count} | ${new Date().toLocaleTimeString()}`);
      if (manual || count) await sample();
    } catch (e) { console.error('[Performance Manager]', e); status('Error; see Browser Console'); }
    finally { running = false; }
  }
  async function sample() {
    if (disposed || sampling || !button) return;
    sampling = true;
    try {
      if (typeof ChromeUtils.requestProcInfo !== 'function') throw Error('No process API');
      const n = memoryBytes(await ChromeUtils.requestProcInfo());
      if (disposed || !button) return;
      button.setAttribute('label', n ? `RAM ${(n / 1073741824).toFixed(1)} GiB` : 'RAM —');
      button.setAttribute('tooltiptext', 'Approximate Firefox process memory; shared memory may be counted more than once.');
    } catch (e) { if (!disposed && button) button.setAttribute('label', 'RAM —'); }
    finally { sampling = false; }
  }
  function minimize() {
    if (disposed || memoryBusy) return;
    try {
      memoryBusy = true; status('Minimizing memory…');
      const mgr = Cc['@mozilla.org/memory-reporter-manager;1'].getService(Ci.nsIMemoryReporterManager);
      S.obs.notifyObservers(null, 'child-mmu-request');
      mgr.minimizeMemoryUsage(() => { memoryBusy = false; if (!disposed) { status('Memory cleanup completed'); void sample(); } });
    } catch (e) { memoryBusy = false; status('Memory cleanup unavailable'); console.error(e); }
  }
  function sync() {
    if (!button || disposed) return;
    const on = getBool('enabled', false);
    const game = getBool('game', false);
    callbacks.get('auto').setAttribute('checked', String(on));
    callbacks.get('game').setAttribute('checked', String(game));
    callbacks.get('scope').setAttribute('label', `Scope: ${getBool('allow-only', true) ? 'allowlist' : 'all except exclusions'}`);
    callbacks.get('timer').setAttribute('label', `Idle timeout: ${options().minutes} min`);
    if (timer !== null) w.clearInterval(timer);
    timer = (on || getBool('monitor', false)) ? w.setInterval(() => {
      if (getBool('enabled', false)) void sweep();
      if (getBool('monitor', false)) void sample();
    }, 60000) : null;
    if (!getBool('monitor', false)) button.setAttribute('label', 'RAM');
    else void sample();
  }
  function menuItem(id, label, action, checkbox = false) {
    const item = d.createXULElement('menuitem');
    item.setAttribute('label', label);
    if (checkbox) { item.setAttribute('type', 'checkbox'); item.setAttribute('autocheck', 'false'); }
    if (action) item.addEventListener('command', action);
    else item.setAttribute('disabled', 'true');
    callbacks.set(id, item); popup.appendChild(item); return item;
  }
  function openPage(url) { w.openTrustedLinkIn(url, 'tab'); }
  function mount() {
    if (disposed || button) return;
    if (!w.gBrowser || !d.getElementById('nav-bar-customization-target')) { later(mount, 1000); return; }
    button = d.createXULElement('toolbarbutton');
    button.id = 'sine-performance-manager-button';
    button.setAttribute('class', 'toolbarbutton-1 chromeclass-toolbar-additional');
    button.setAttribute('type', 'menu');
    button.setAttribute('label', 'RAM');
    button.setAttribute('tooltiptext', 'Performance Manager');
    button.style.setProperty('min-width', '54px');
    // Firefox toolbars normally hide labels; explicitly expose ours.
    button.style.setProperty('list-style-image', 'none');
    popup = d.createXULElement('menupopup');
    button.appendChild(popup);
    menuItem('status', last, null);
    menuItem('auto', 'Automatic tab unloading', () => setBool('enabled', !getBool('enabled', false)), true);
    menuItem('game', 'Game mode (3 min)', () => setBool('game', !getBool('game', false)), true);
    menuItem('scope', '', null); menuItem('timer', '', null);
    popup.appendChild(d.createXULElement('menuseparator'));
    menuItem('sweep', 'Unload eligible idle tabs now', () => void sweep(true));
    menuItem('minimize', 'Minimize memory usage', minimize);
    menuItem('refresh', 'Refresh RAM reading', () => void sample());
    menuItem('processes', 'Process manager', () => openPage('about:processes'));
    menuItem('unloads', 'Firefox tab unloading', () => openPage('about:unloads'));
    menuItem('prefs', 'Sine settings', () => openPage('about:preferences'));
    popup.addEventListener('popupshowing', e => { if (e.target === popup) void sample(); });
    d.getElementById('nav-bar-customization-target').appendChild(button);
    const style = d.createElementNS('http://www.w3.org/1999/xhtml', 'style');
    style.id = 'sine-performance-manager-style';
    style.textContent = '#sine-performance-manager-button > .toolbarbutton-text { display: flex !important; visibility: visible !important; } #sine-performance-manager-button > .toolbarbutton-icon { display: none !important; }';
    d.documentElement.appendChild(style);
    prefs.addObserver(PREFIX, prefObserver);
    sync();
    if (!supported()) status('Tab unloading API unavailable');
  }
  const prefObserver = { observe() { sync(); } };
  function destroy() {
    if (disposed) return;
    disposed = true;
    if (timer !== null) w.clearInterval(timer);
    for (const id of retryTimers) w.clearTimeout(id);
    retryTimers.clear();
    if (readyObserver) S.obs.removeObserver(readyObserver, 'browser-delayed-startup-finished');
    try { prefs.removeObserver(PREFIX, prefObserver); } catch (_) {}
    w.removeEventListener('unload', destroy);
    button?.remove(); d.getElementById('sine-performance-manager-style')?.remove();
    callbacks.clear();
    if (w[KEY]?.destroy === destroy) delete w[KEY];
  }
  w[KEY] = { destroy, sweep, sample, minimize };
  w.addEventListener('unload', destroy, { once: true });
  if (typeof w.addUnloadListener === 'function') w.addUnloadListener(destroy);
  else if (typeof addUnloadListener === 'function') addUnloadListener(destroy);
  if (w.gBrowserInit?.delayedStartupFinished) mount();
  else {
    readyObserver = { observe(subject) { if (subject === w) { S.obs.removeObserver(readyObserver, 'browser-delayed-startup-finished'); readyObserver = null; mount(); } } };
    S.obs.addObserver(readyObserver, 'browser-delayed-startup-finished');
  }
})();
