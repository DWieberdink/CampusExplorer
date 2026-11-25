// Light client-side demo gate (not real security). Intentional shared password for PE static demos.
(function (global) {
  var STORAGE_KEY = 'campusExplorerDemoGate';
  var EXPECTED = 'CUAdvice';
  // Persist across visits (localStorage) so the demo password is not re-entered every session.
  var store = global.localStorage;
  var sessionStore = global.sessionStorage;

  function readFlag(s) {
    try {
      return s && s.getItem(STORAGE_KEY) === '1';
    } catch (err) {
      return false;
    }
  }

  function isUnlocked() {
    if (readFlag(store)) return true;
    // Migrate a prior session-only unlock into localStorage.
    if (readFlag(sessionStore)) {
      unlock();
      try {
        sessionStore.removeItem(STORAGE_KEY);
      } catch (err) {
        /* ignore */
      }
      return true;
    }
    return false;
  }

  function unlock() {
    try {
      store.setItem(STORAGE_KEY, '1');
    } catch (err) {
      /* private mode / blocked storage — fall back to session */
      try {
        sessionStore.setItem(STORAGE_KEY, '1');
      } catch (err2) {
        /* ignore */
      }
    }
  }

  function checkPassword(value) {
    return String(value) === EXPECTED;
  }

  /**
   * Call from protected pages. Redirects to the gate when locked.
   * @returns {boolean} true if unlocked
   */
  function requireUnlock(gatePage) {
    if (isUnlocked()) return true;
    var dest = gatePage || 'index.html';
    global.location.replace(dest);
    return false;
  }

  global.CampusExplorerGate = {
    isUnlocked: isUnlocked,
    unlock: unlock,
    checkPassword: checkPassword,
    requireUnlock: requireUnlock,
  };
})(typeof window !== 'undefined' ? window : this);
