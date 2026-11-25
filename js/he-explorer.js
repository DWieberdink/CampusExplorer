// Campus Explorer UI — cascade filters, KPIs, Chart.js trends, compare stub.

(function () {
  const $ = (id) => document.getElementById(id);
  let trendChart = null;
  let cipChart = null;

  function selectedFilters() {
    return {
      stateCode: $('filter-state').value || null,
      system: $('filter-system').value || null,
      unitid: $('filter-campus').value || null,
      year: Number($('filter-year').value),
    };
  }

  function fillSelect(el, options, { blankLabel, selected } = {}) {
    const html = [];
    if (blankLabel != null) {
      html.push(`<option value="">${blankLabel}</option>`);
    }
    for (const opt of options) {
      const sel = opt.value === selected ? ' selected' : '';
      html.push(`<option value="${opt.value}"${sel}>${opt.label}</option>`);
    }
    el.innerHTML = html.join('');
  }

  function refreshFilterOptions() {
    const data = window.HEData.getState();
    const stateSel = $('filter-state').value;
    const systemSel = $('filter-system').value;

    const states = [...new Set(data.campuses.map((c) => c.state))].sort();
    fillSelect(
      $('filter-state'),
      states.map((s) => ({ value: s, label: window.heStateLabel(s) })),
      {
        blankLabel: 'All states',
        selected: stateSel || window.HE_CONFIG.defaultState || '',
      }
    );

    const inState = window.HEData.campusesFiltered({
      stateCode: $('filter-state').value || null,
    });
    const systems = [...new Set(inState.map((c) => c.system_name).filter(Boolean))].sort();
    fillSelect(
      $('filter-system'),
      systems.map((s) => ({ value: s, label: window.heSystemLabel(s) })),
      {
        blankLabel: 'All systems / sectors',
        selected: systemSel || window.HE_CONFIG.defaultSystem || '',
      }
    );

    const campuses = window.HEData.campusesFiltered({
      stateCode: $('filter-state').value || null,
      system: $('filter-system').value || null,
    });
    const campusSel = $('filter-campus').value;
    fillSelect(
      $('filter-campus'),
      campuses.map((c) => ({ value: c.unitid, label: c.inst_name })),
      { blankLabel: 'All campuses', selected: campusSel }
    );

    fillSelect(
      $('filter-year'),
      window.HE_CONFIG.years.map((y) => ({ value: String(y), label: String(y) })),
      { selected: String($('filter-year').value || window.HE_CONFIG.defaultYear) }
    );

    // Compare dropdowns
    const allOpts = data.campuses.map((c) => ({ value: c.unitid, label: c.inst_name }));
    fillSelect($('compare-a'), allOpts, { blankLabel: 'Campus A' });
    fillSelect($('compare-b'), allOpts, { blankLabel: 'Campus B' });
  }

  function activeCampuses() {
    const f = selectedFilters();
    return window.HEData.campusesFiltered({
      stateCode: f.stateCode,
      system: f.system,
      unitid: f.unitid,
    });
  }

  function renderKpis() {
    const f = selectedFilters();
    const campuses = activeCampuses();
    const ids = campuses.map((c) => c.unitid);
    const yoy = window.HEData.yoy(ids, f.year);
    const enroll = window.HEData.enrollmentFor(ids, f.year);
    const ftes = enroll.reduce((a, r) => a + (Number(r.ftes) || 0), 0);
    // ftes lives on seed enrollment rows; supabase activity table may differ
    const seedState = window.HEData.getState();
    const ftesSum = seedState.enrollment
      .filter((e) => ids.includes(e.unitid) && e.year === f.year)
      .reduce((a, e) => a + (Number(e.ftes) || 0), 0);
    const awards = window.HEData.completionsFor(ids, f.year).reduce(
      (a, r) => a + (Number(r.awards) || 0),
      0
    );

    $('kpi-campuses').textContent = window.formatNumber(campuses.length);
    $('kpi-enrollment').textContent = window.formatNumber(yoy.current);
    $('kpi-ftes').textContent = window.formatNumber(ftesSum || ftes || null);
    $('kpi-awards').textContent = window.formatNumber(awards);

    const deltaEl = $('kpi-enrollment-delta');
    if (yoy.delta == null) {
      deltaEl.textContent = 'YoY unavailable';
      deltaEl.className = 'delta';
    } else {
      deltaEl.textContent = `${window.formatPct(yoy.delta)} vs ${f.year - 1}`;
      deltaEl.className = `delta ${yoy.delta >= 0 ? 'up' : 'down'}`;
    }
  }

  function renderTrend() {
    const f = selectedFilters();
    const campuses = activeCampuses();
    const ids = campuses.map((c) => c.unitid);
    const years = window.HE_CONFIG.years;
    const totals = years.map((y) => {
      const rows = window.HEData.enrollmentFor(ids, y);
      return rows.reduce((a, r) => a + (Number(r.headcount_total) || 0), 0);
    });

    const ctx = $('chart-trend').getContext('2d');
    if (trendChart) trendChart.destroy();
    trendChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: years.map(String),
        datasets: [
          {
            label: 'Fall headcount',
            data: totals,
            borderColor: '#0f4c81',
            backgroundColor: 'rgba(15, 76, 129, 0.12)',
            fill: true,
            tension: 0.25,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: { beginAtZero: false, ticks: { callback: (v) => Number(v).toLocaleString() } },
        },
      },
    });
  }

  function renderCompletions() {
    const f = selectedFilters();
    const campuses = activeCampuses();
    const ids = campuses.map((c) => c.unitid);
    const rows = window.HEData.completionsFor(ids, f.year);
    const byCip = new Map();
    for (const r of rows) {
      const key = r.cip_title || r.cip6;
      byCip.set(key, (byCip.get(key) || 0) + (Number(r.awards) || 0));
    }
    const ranked = [...byCip.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);

    const ctx = $('chart-cip').getContext('2d');
    if (cipChart) cipChart.destroy();
    cipChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: ranked.map(([k]) => k),
        datasets: [
          {
            label: 'Awards',
            data: ranked.map(([, v]) => v),
            backgroundColor: '#0a6b4a',
          },
        ],
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
      },
    });

    const tbody = $('table-directory');
    tbody.innerHTML = campuses
      .map((c) => {
        const e = window.HEData.enrollmentFor([c.unitid], f.year)[0];
        return `<tr>
          <td>${c.inst_name}</td>
          <td>${window.heSystemLabel(c.system_name)}</td>
          <td>${c.city || '—'}</td>
          <td class="num">${window.formatNumber(e?.headcount_total)}</td>
          <td class="num">${c.unitid}</td>
        </tr>`;
      })
      .join('');
  }

  function renderCompare() {
    const a = $('compare-a').value;
    const b = $('compare-b').value;
    const year = selectedFilters().year;
    const out = $('compare-result');
    if (!a || !b) {
      out.innerHTML = '<p class="hint">Pick two campuses to compare enrollment and awards.</p>';
      return;
    }
    const data = window.HEData.getState();
    const ca = data.campuses.find((c) => c.unitid === a);
    const cb = data.campuses.find((c) => c.unitid === b);
    const ea = window.HEData.enrollmentFor([a], year)[0];
    const eb = window.HEData.enrollmentFor([b], year)[0];
    const ya = window.HEData.yoy([a], year);
    const yb = window.HEData.yoy([b], year);
    const awa = window.HEData.completionsFor([a], year).reduce((s, r) => s + (r.awards || 0), 0);
    const awb = window.HEData.completionsFor([b], year).reduce((s, r) => s + (r.awards || 0), 0);

    out.innerHTML = `
      <table class="he-table">
        <thead>
          <tr><th>Metric (${year})</th><th>${ca?.inst_name || a}</th><th>${cb?.inst_name || b}</th></tr>
        </thead>
        <tbody>
          <tr><td>System</td><td>${window.heSystemLabel(ca?.system_name)}</td><td>${window.heSystemLabel(cb?.system_name)}</td></tr>
          <tr><td>Fall headcount</td><td class="num">${window.formatNumber(ea?.headcount_total)}</td><td class="num">${window.formatNumber(eb?.headcount_total)}</td></tr>
          <tr><td>YoY change</td><td class="num">${window.formatPct(ya.delta)}</td><td class="num">${window.formatPct(yb.delta)}</td></tr>
          <tr><td>Awards (CIP seed)</td><td class="num">${window.formatNumber(awa)}</td><td class="num">${window.formatNumber(awb)}</td></tr>
          <tr><td>UNITID</td><td class="num">${a}</td><td class="num">${b}</td></tr>
        </tbody>
      </table>
      <p class="hint" style="margin-top:12px">Compare stub — peer sets and Scorecard outcomes can extend this view later.</p>
    `;
  }

  function refreshMap() {
    window.HEMap.update(activeCampuses());
  }

  function refresh() {
    const campuses = activeCampuses();
    renderKpis();
    renderTrend();
    renderCompletions();
    refreshMap();
  }

  function bindTabs() {
    document.querySelectorAll('.he-tab').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.he-tab').forEach((b) => b.classList.remove('active'));
        document.querySelectorAll('.he-panel').forEach((p) => p.classList.remove('active'));
        btn.classList.add('active');
        $(`panel-${btn.dataset.panel}`).classList.add('active');
        if (btn.dataset.panel === 'map') {
          // Panel was display:none — re-apply points and force GL layout after show.
          refreshMap();
          window.HEMap.resize();
        }
      });
    });
  }

  function bindFilters() {
    $('filter-state').addEventListener('change', () => {
      $('filter-system').value = '';
      $('filter-campus').value = '';
      refreshFilterOptions();
      refresh();
    });
    $('filter-system').addEventListener('change', () => {
      $('filter-campus').value = '';
      refreshFilterOptions();
      refresh();
    });
    $('filter-campus').addEventListener('change', refresh);
    $('filter-year').addEventListener('change', refresh);
    $('compare-run').addEventListener('click', renderCompare);
  }

  async function boot() {
    const sourceChip = $('data-source-chip');
    let client = null;

    if (window.isSupabaseConfigured() && window.supabase) {
      client = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
    }

    await window.HEData.init(client);
    const src = window.HEData.getState().source;
    sourceChip.textContent = src === 'supabase' ? 'Supabase' : 'Seed JSON';
    sourceChip.className = `he-chip ${src === 'supabase' ? 'live' : 'seed'}`;

    refreshFilterOptions();
    bindFilters();
    bindTabs();
    // Always init the map before the first update (refresh → HEMap.update).
    window.HEMap.init('he-map');
    refresh();
    // Re-apply after data load in case the first update raced a late GL ready state.
    refreshMap();
  }

  document.addEventListener('DOMContentLoaded', boot);
})();
