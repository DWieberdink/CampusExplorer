// Campus Explorer UI — cascade filters, KPIs, Chart.js trends, map, compare, data sources.

(function () {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => window.heEscape(s);
  let trendChart = null;
  let cipChart = null;
  let sortKey = 'headcount_ft';
  let sortDir = -1;

  function selectedFilters() {
    return {
      stateCode: $('filter-state').value || null,
      system: $('filter-system').value || null,
      unitid: $('filter-campus').value || null,
      cip2: $('filter-program').value || null,
      year: Number($('filter-year').value) || window.HE_CONFIG.defaultYear,
    };
  }

  function fillSelect(el, options, { blankLabel, selected } = {}) {
    const html = [];
    if (blankLabel != null) html.push(`<option value="">${esc(blankLabel)}</option>`);
    for (const opt of options) {
      const sel = opt.value === selected ? ' selected' : '';
      html.push(`<option value="${esc(opt.value)}"${sel}>${esc(opt.label)}</option>`);
    }
    el.innerHTML = html.join('');
  }

  function refreshFilterOptions() {
    const data = window.HEData.getState();
    const stateSel = $('filter-state').value;
    const systemSel = $('filter-system').value;
    const programSel = $('filter-program').value;
    const yearSel = $('filter-year').value || String(window.HE_CONFIG.defaultYear);

    fillSelect(
      $('filter-year'),
      window.HE_CONFIG.years.map((y) => ({ value: String(y), label: String(y) })),
      { selected: yearSel }
    );
    const year = Number($('filter-year').value);

    const states = [...new Set(data.campuses.map((c) => c.state))].sort();
    fillSelect(
      $('filter-state'),
      states.map((s) => ({ value: s, label: window.heStateLabel(s) })),
      { blankLabel: 'All states', selected: stateSel || window.HE_CONFIG.defaultState || '' }
    );

    const inState = window.HEData.campusesFiltered({ stateCode: $('filter-state').value || null });
    const systems = [...new Set(inState.map((c) => c.system_name).filter(Boolean))].sort((a, b) =>
      window.heSystemLabel(a).localeCompare(window.heSystemLabel(b))
    );
    fillSelect(
      $('filter-system'),
      systems.map((s) => ({ value: s, label: window.heSystemLabel(s) })),
      { blankLabel: 'All systems', selected: systemSel || window.HE_CONFIG.defaultSystem || '' }
    );

    const scope = window.HEData.campusesFiltered({
      stateCode: $('filter-state').value || null,
      system: $('filter-system').value || null,
    });
    const scopeIds = new Set(scope.map((c) => c.unitid));
    const cy = window.HEData.completionsYear(year);
    const famCounts = new Map();
    for (const r of data.completions) {
      if (r.year !== cy || !scopeIds.has(r.unitid) || !r.awards) continue;
      famCounts.set(r.cip2, (famCounts.get(r.cip2) || new Set()).add(r.unitid));
    }
    const fams = [...famCounts.entries()]
      .map(([cip2, set]) => ({ cip2, n: set.size }))
      .sort((a, b) => window.HEData.cipFamilyLabel(a.cip2).localeCompare(window.HEData.cipFamilyLabel(b.cip2)));
    fillSelect(
      $('filter-program'),
      fams.map((f) => ({ value: f.cip2, label: `${window.HEData.cipFamilyLabel(f.cip2)} (${f.n})` })),
      { blankLabel: 'All programs', selected: programSel }
    );

    const campuses = window.HEData.campusesFiltered({
      stateCode: $('filter-state').value || null,
      system: $('filter-system').value || null,
      cip2: $('filter-program').value || null,
      year,
    });
    const campusSel = $('filter-campus').value;
    fillSelect(
      $('filter-campus'),
      campuses
        .slice()
        .sort((a, b) => a.inst_name.localeCompare(b.inst_name))
        .map((c) => ({ value: c.unitid, label: c.inst_name })),
      { blankLabel: `All campuses (${campuses.length})`, selected: campusSel }
    );

    const allOpts = data.campuses
      .slice()
      .sort((a, b) => a.inst_name.localeCompare(b.inst_name))
      .map((c) => ({ value: c.unitid, label: `${c.inst_name} (${c.state})` }));
    const ca = $('compare-a').value;
    const cb = $('compare-b').value;
    fillSelect($('compare-a'), allOpts, { blankLabel: 'Campus A', selected: ca });
    fillSelect($('compare-b'), allOpts, { blankLabel: 'Campus B', selected: cb });
  }

  function activeCampuses() {
    const f = selectedFilters();
    return window.HEData.campusesFiltered(f);
  }

  function renderChips() {
    const f = selectedFilters();
    const el = $('active-filter-chips');
    if (!f.cip2) {
      el.hidden = true;
      el.innerHTML = '';
      return;
    }
    el.hidden = false;
    el.innerHTML = `<span class="he-filter-chip">Program: <b>${esc(window.HEData.cipFamilyLabel(f.cip2))}</b>
      <button type="button" id="clear-program" aria-label="Clear program filter">×</button></span>`;
    $('clear-program').addEventListener('click', () => setProgram(''));
  }

  function setProgram(cip2) {
    $('filter-program').value = cip2;
    $('filter-campus').value = '';
    refreshFilterOptions();
    $('filter-program').value = cip2;
    refresh();
  }

  function renderKpis() {
    const f = selectedFilters();
    const campuses = activeCampuses();
    const ids = campuses.map((c) => c.unitid);
    const yoy = window.HEData.yoy(ids, f.year);
    const fte = window.HEData.enrollmentFor(ids, f.year).reduce((a, r) => a + (Number(r.fte_12mo) || 0), 0);
    const cy = window.HEData.completionsYear(f.year);
    const awards = window.HEData.completionsFor(ids, cy)
      .filter((r) => !f.cip2 || r.cip2 === f.cip2)
      .reduce((a, r) => a + (Number(r.awards) || 0), 0);

    $('kpi-campuses').textContent = window.formatNumber(campuses.length);
    $('kpi-enrollment').textContent = window.formatNumber(yoy.current);
    $('kpi-ftes').textContent = window.formatNumber(fte || null);
    $('kpi-awards').textContent = window.formatNumber(awards);
    $('kpi-awards-year').textContent = `${cy}-${String(cy + 1).slice(2)}${f.cip2 ? ' · selected program' : ' · all programs'}`;

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
    const ids = activeCampuses().map((c) => c.unitid);
    const years = window.HE_CONFIG.years;
    const sumBy = (key) =>
      years.map((y) => window.HEData.enrollmentFor(ids, y).reduce((a, r) => a + (Number(r[key]) || 0), 0) || null);

    if (trendChart) trendChart.destroy();
    trendChart = new Chart($('chart-trend').getContext('2d'), {
      type: 'line',
      data: {
        labels: years.map(String),
        datasets: [
          {
            label: 'Fall headcount',
            data: sumBy('headcount_total'),
            borderColor: '#0f4c81',
            backgroundColor: 'rgba(15, 76, 129, 0.12)',
            fill: true,
            tension: 0.25,
          },
          {
            label: '12-month FTE',
            data: sumBy('fte_12mo'),
            borderColor: '#0a6b4a',
            borderDash: [5, 4],
            fill: false,
            tension: 0.25,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: true, position: 'bottom' } },
        scales: { y: { beginAtZero: false, ticks: { callback: (v) => Number(v).toLocaleString() } } },
      },
    });
  }

  function renderPrograms() {
    const f = selectedFilters();
    const ids = window.HEData.campusesFiltered({ ...f, cip2: null }).map((c) => c.unitid);
    const cy = window.HEData.completionsYear(f.year);
    const byCip = new Map();
    for (const r of window.HEData.completionsFor(ids, cy)) {
      byCip.set(r.cip2, (byCip.get(r.cip2) || 0) + (Number(r.awards) || 0));
    }
    const ranked = [...byCip.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);
    $('cip-hint').textContent = `Awards ${cy}-${String(cy + 1).slice(2)} · click a bar to filter campuses offering that program family`;

    if (cipChart) cipChart.destroy();
    cipChart = new Chart($('chart-cip').getContext('2d'), {
      type: 'bar',
      data: {
        labels: ranked.map(([k]) => window.HEData.cipFamilyLabel(k)),
        datasets: [
          {
            label: 'Awards',
            data: ranked.map(([, v]) => v),
            backgroundColor: ranked.map(([k]) => (f.cip2 && k !== f.cip2 ? 'rgba(10,107,74,0.25)' : '#0a6b4a')),
          },
        ],
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: { ticks: { autoSkip: false, callback(v) { const l = this.getLabelForValue(v); return l.length > 34 ? `${l.slice(0, 32)}…` : l; } } },
          x: { ticks: { callback: (v) => Number(v).toLocaleString() } },
        },
        onHover: (e, els) => {
          e.native.target.style.cursor = els.length ? 'pointer' : 'default';
        },
        onClick: (e, els) => {
          if (!els.length) return;
          const cip2 = ranked[els[0].index][0];
          // Defer: setProgram destroys this chart, which Chart.js can't do mid-event.
          setTimeout(() => setProgram(f.cip2 === cip2 ? '' : cip2), 0);
        },
      },
    });
  }

  function renderDirectory() {
    const campuses = activeCampuses().slice();
    const val = (c, k) => (k in c ? c[k] : c.metrics?.[k]);
    campuses.sort((a, b) => {
      const va = val(a, sortKey);
      const vb = val(b, sortKey);
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      return (typeof va === 'string' ? va.localeCompare(vb) : va - vb) * sortDir;
    });
    document.querySelectorAll('.he-sortable th').forEach((th) => {
      th.classList.toggle('sorted', th.dataset.sort === sortKey);
      th.dataset.dir = th.dataset.sort === sortKey ? (sortDir > 0 ? '▲' : '▼') : '';
    });
    const pctCell = (v) => {
      if (v == null) return '<td class="num">—</td>';
      return `<td class="num ${v >= 0 ? 'pos' : 'neg'}">${window.formatPct(v)}</td>`;
    };
    $('table-directory').innerHTML = campuses
      .map((c) => {
        const m = c.metrics || {};
        return `<tr>
          <td><a class="he-link" href="${window.campusUrl(c.unitid)}">${esc(c.inst_name)}</a></td>
          <td><span class="dot" style="background:${window.heSystemColor(c.system_name)}"></span>${esc(c.system_name)}</td>
          <td>${esc(c.state)}</td>
          <td class="num">${window.formatNumber(m.headcount_ft)}</td>
          ${pctCell(m.chg_5yr_pct)}
          <td class="num">${window.formatNumber(m.fte_12mo)}</td>
          <td class="num">${m.pct_online != null ? `${m.pct_online}%` : '—'}</td>
          <td class="num">${m.age_of_plant_yrs ?? '—'}</td>
          <td class="num">${window.formatMoney(m.om_per_fte)}</td>
        </tr>`;
      })
      .join('');
  }

  function renderLegend() {
    const counts = new Map();
    for (const c of activeCampuses()) counts.set(c.system_name, (counts.get(c.system_name) || 0) + 1);
    const items = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    $('he-map-legend').innerHTML = items
      .map(
        ([code, n]) => `<button type="button" class="he-legend-item" data-system="${esc(code)}" title="Filter to ${esc(window.heSystemLabel(code))}">
          <span class="dot" style="background:${window.heSystemColor(code)}"></span>${esc(window.heSystemLabel(code))} <span class="n">${n}</span></button>`
      )
      .join('');
    $('he-map-legend').querySelectorAll('.he-legend-item').forEach((b) =>
      b.addEventListener('click', () => {
        const sys = b.dataset.system;
        $('filter-system').value = $('filter-system').value === sys ? '' : sys;
        $('filter-campus').value = '';
        refreshFilterOptions();
        refresh();
      })
    );
  }

  function renderCompare() {
    const a = $('compare-a').value;
    const b = $('compare-b').value;
    const out = $('compare-result');
    if (!a || !b) {
      out.innerHTML = '<p class="hint">Pick two campuses to compare.</p>';
      return;
    }
    const data = window.HEData.getState();
    const ca = data.campuses.find((c) => c.unitid === a);
    const cb = data.campuses.find((c) => c.unitid === b);
    const ma = ca?.metrics || {};
    const mb = cb?.metrics || {};
    const cy = window.HEData.completionsYear(window.HE_CONFIG.defaultYear);
    const aw = (id) => window.HEData.completionsFor([id], cy).reduce((s, r) => s + (r.awards || 0), 0);
    const fam = (id) => new Set(window.HEData.completionsFor([id], cy).map((r) => r.cip2)).size;
    const rows = [
      ['System', window.heSystemLabel(ca?.system_name), window.heSystemLabel(cb?.system_name)],
      ['Location', `${ca?.city}, ${ca?.state}`, `${cb?.city}, ${cb?.state}`],
      [`Fall headcount (${ma.latest_year || ''})`, window.formatNumber(ma.headcount), window.formatNumber(mb.headcount)],
      ['5-yr enrollment change', window.formatPct(ma.chg_5yr_pct), window.formatPct(mb.chg_5yr_pct)],
      ['10-yr enrollment change', window.formatPct(ma.chg_10yr_pct), window.formatPct(mb.chg_10yr_pct)],
      ['12-month FTE', window.formatNumber(ma.fte_12mo), window.formatNumber(mb.fte_12mo)],
      ['% fully online', ma.pct_online != null ? `${ma.pct_online}%` : '—', mb.pct_online != null ? `${mb.pct_online}%` : '—'],
      [`Awards ${cy}-${String(cy + 1).slice(2)}`, window.formatNumber(aw(a)), window.formatNumber(aw(b))],
      ['Program families offered', fam(a), fam(b)],
      ['Age of plant (yrs)', ma.age_of_plant_yrs ?? '—', mb.age_of_plant_yrs ?? '—'],
      ['O&M $ per FTE', window.formatMoney(ma.om_per_fte), window.formatMoney(mb.om_per_fte)],
      ['Housing beds', window.formatNumber(ma.housing_beds), window.formatNumber(mb.housing_beds)],
      ['Gross sq ft', window.formatNumber(ma.gross_sq_ft), window.formatNumber(mb.gross_sq_ft)],
      ['Buildings', window.formatNumber(ma.building_count), window.formatNumber(mb.building_count)],
    ];
    out.innerHTML = `
      <table class="he-table">
        <thead><tr><th>Metric</th>
          <th><a class="he-link" href="${window.campusUrl(a)}">${esc(ca?.inst_name || a)}</a></th>
          <th><a class="he-link" href="${window.campusUrl(b)}">${esc(cb?.inst_name || b)}</a></th></tr></thead>
        <tbody>${rows.map(([k, x, y]) => `<tr><td>${esc(k)}</td><td class="num">${esc(x)}</td><td class="num">${esc(y)}</td></tr>`).join('')}</tbody>
      </table>`;
  }

  function renderSources() {
    const S = window.HE_SOURCES;
    const badge = (s) =>
      ({ loaded: '<span class="he-badge ok">Loaded</span>', partial: '<span class="he-badge partial">Partial</span>' }[s] ||
        '<span class="he-badge no">Not loaded</span>');
    $('table-sources').innerHTML = S.datasets
      .map(
        (d) => `<tr>
          <td>${esc(d.element)}</td>
          <td>${d.url ? `<a class="he-link" href="${esc(d.url)}" target="_blank" rel="noopener">${esc(d.source)}</a>` : esc(d.source)}</td>
          <td><code>${esc(d.file)}</code></td>
          <td>${esc(d.vintage)}</td>
          <td>${esc(d.coverage)}</td>
          <td>${badge(d.status)}</td>
        </tr>`
      )
      .join('');
    $('table-facility-sources').innerHTML = S.facilities
      .map(
        (f) => `<tr>
          <td>${f.systems.map((s) => (s === '*' ? 'All' : `<span class="dot" style="background:${window.heSystemColor(s)}"></span>${esc(s)}`)).join(' ')}</td>
          <td><a class="he-link" href="${esc(f.url)}" target="_blank" rel="noopener">${esc(f.source)}</a></td>
          <td>${esc(f.detail)}</td>
          <td>${esc(f.access)}</td>
        </tr>`
      )
      .join('');
  }

  function refreshMap() {
    window.HEMap.update(activeCampuses());
    renderLegend();
  }

  function refresh() {
    renderChips();
    renderKpis();
    renderTrend();
    renderPrograms();
    renderDirectory();
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
        history.replaceState(null, '', `#${btn.dataset.panel}`);
      });
    });
    const hash = location.hash.replace('#', '');
    if (hash) document.querySelector(`.he-tab[data-panel="${hash}"]`)?.click();
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
    $('filter-program').addEventListener('change', () => setProgram($('filter-program').value));
    $('filter-campus').addEventListener('change', refresh);
    $('filter-year').addEventListener('change', () => {
      refreshFilterOptions();
      refresh();
    });
    $('compare-run').addEventListener('click', renderCompare);
    document.querySelectorAll('.he-sortable th[data-sort]').forEach((th) =>
      th.addEventListener('click', () => {
        const k = th.dataset.sort;
        sortDir = sortKey === k ? -sortDir : ['inst_name', 'system_name', 'state'].includes(k) ? 1 : -1;
        sortKey = k;
        renderDirectory();
      })
    );
  }

  async function boot() {
    const sourceChip = $('data-source-chip');
    let client = null;

    if (window.isSupabaseConfigured() && window.supabase) {
      client = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
    }

    await window.HEData.init(client);
    const src = window.HEData.getState().source;
    sourceChip.textContent = src === 'supabase' ? 'Supabase' : 'IPEDS seed';
    sourceChip.className = `he-chip ${src === 'supabase' ? 'live' : 'seed'}`;

    const params = new URLSearchParams(location.search);
    refreshFilterOptions();
    if (params.get('system')) $('filter-system').value = params.get('system');
    if (params.get('program')) $('filter-program').value = params.get('program');
    if (params.get('system') || params.get('program')) refreshFilterOptions();

    renderSources();
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
