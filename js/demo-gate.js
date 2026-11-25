// Light client-side demo gate (not real security). Intentional shared password for PE static demos.
(function (global) {
  var STORAGE_KEY = 'campusExplorerDemoGate';
  var EXPECTED = 'CUAdvice';
  var store = global.sessionStorage;

  function isUnlocked() {
    try {
      return store.getItem(STORAGE_KEY) === '1';
    } catch (err) {
      return false;
    }
  }

  function unlock() {
    try {
      store.setItem(STORAGE_KEY, '1');
    } catch (err) {
      /* private mode / blocked storage */
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
