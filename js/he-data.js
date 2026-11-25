// Data access: seed JSON offline, Supabase when configured.

window.HEData = (function () {
  const state = {
    source: 'seed',
    campuses: [],
    enrollment: [],
    completions: [],
    ready: false,
  };

  async function fetchJson(path) {
    const res = await fetch(path);
    if (!res.ok) throw new Error(`Failed to load ${path}: ${res.status}`);
    return res.json();
  }

  async function loadSeed() {
    const cfg = window.HE_CONFIG.seedPaths;
    const [campuses, enrollment, completions] = await Promise.all([
      fetchJson(cfg.campuses),
      fetchJson(cfg.enrollment),
      fetchJson(cfg.completions),
    ]);
    state.campuses = campuses;
    state.enrollment = enrollment;
    state.completions = completions;
    state.source = 'seed';
    state.ready = true;
    return state;
  }

  async function loadFromSupabase(client) {
    const t = window.HE_CONFIG.tables;
    const [dir, fall, comps] = await Promise.all([
      client.from(t.campusDirectory).select('*').order('inst_name'),
      client.from(t.enrollmentFall).select('*'),
      client.from(t.completions).select('*'),
    ]);
    if (dir.error || fall.error || comps.error) {
      throw dir.error || fall.error || comps.error;
    }

    // Prefer latest year directory row per unitid for filter roster.
    const byUnit = new Map();
    for (const row of dir.data || []) {
      const prev = byUnit.get(row.unitid);
      if (!prev || row.year > prev.year) byUnit.set(row.unitid, row);
    }
    state.campuses = [...byUnit.values()].map((r) => ({
      unitid: r.unitid,
      opeid: r.opeid,
      inst_name: r.inst_name,
      system_name: r.system_name,
      sector: r.sector,
      control: r.control,
      state: r.state_code,
      city: r.city,
      latitude: r.latitude != null ? Number(r.latitude) : null,
      longitude: r.longitude != null ? Number(r.longitude) : null,
      ccc_district: r.ccc_district,
      ccc_college_code: r.ccc_college_code,
      parent_unitid: r.parent_unitid,
      is_branch: r.is_branch,
      enabled: true,
    }));
    state.enrollment = (fall.data || []).map((e) => ({
      unitid: e.unitid,
      year: e.year,
      headcount_total: e.headcount_total,
      headcount_ug: e.headcount_ug,
      headcount_grad: e.headcount_grad,
      headcount_ft: e.headcount_ft,
      headcount_pt: e.headcount_pt,
    }));
    state.completions = (comps.data || []).map((c) => ({
      unitid: c.unitid,
      year: c.year,
      cip6: c.cip6,
      cip_title: c.cip_title,
      award_level: c.award_level,
      awards: c.awards,
    }));
    state.source = 'supabase';
    state.ready = true;
    return state;
  }

  async function init(client) {
    if (client && window.isSupabaseConfigured()) {
      try {
        await loadFromSupabase(client);
        if (state.campuses.length) return state;
      } catch (err) {
        console.warn('Supabase load failed; falling back to seed', err);
      }
    }
    return loadSeed();
  }

  function getState() {
    return state;
  }

  function campusesFiltered({ stateCode, system, unitid }) {
    return state.campuses.filter((c) => {
      if (stateCode && c.state !== stateCode) return false;
      if (system && c.system_name !== system) return false;
      if (unitid && c.unitid !== unitid) return false;
      return true;
    });
  }

  function enrollmentFor(unitids, year) {
    const set = new Set(unitids);
    return state.enrollment.filter((e) => set.has(e.unitid) && (year == null || e.year === year));
  }

  function completionsFor(unitids, year) {
    const set = new Set(unitids);
    return state.completions.filter((c) => set.has(c.unitid) && (year == null || c.year === year));
  }

  function yoy(unitids, year) {
    const cur = enrollmentFor(unitids, year);
    const prev = enrollmentFor(unitids, year - 1);
    const sum = (rows) => rows.reduce((a, r) => a + (Number(r.headcount_total) || 0), 0);
    const current = sum(cur);
    const previous = sum(prev);
    const delta = previous ? ((current - previous) / previous) * 100 : null;
    return { current, previous, delta };
  }

  return {
    init,
    getState,
    campusesFiltered,
    enrollmentFor,
    completionsFor,
    yoy,
  };
})();
