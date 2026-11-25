// Campus profile page — enrollment history, programs, facilities indicators, decision signals.

(function () {
  const esc = (s) => window.heEscape(s);
  const fmt = window.formatNumber;
  const money = window.formatMoney;
  const pct = (v) => (v == null ? '—' : `${v}%`);
  const ay = (y) => `${y}-${String(y + 1).slice(2)}`;

  async function fetchJson(path) {
    const res = await fetch(path);
    if (!res.ok) throw new Error(`${path}: ${res.status}`);
    return res.json();
  }

  function median(values) {
    const v = values.filter((x) => x != null && !Number.isNaN(x)).sort((a, b) => a - b);
    if (!v.length) return null;
    const m = Math.floor(v.length / 2);
    return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
  }

  function systemMedians(campuses, system) {
    const peers = campuses.filter((c) => c.system_name === system);
    const keys = ['headcount', 'chg_5yr_pct', 'fte_12mo', 'pct_online', 'age_of_plant_yrs', 'om_per_fte', 'gross_sq_ft', 'building_count'];
    const out = { n: peers.length };
    for (const k of keys) out[k] = median(peers.map((c) => c.metrics?.[k]));
    out.gsf_per_fte = median(
      peers.map((c) => (c.metrics?.gross_sq_ft && c.metrics?.fte_12mo ? c.metrics.gross_sq_ft / c.metrics.fte_12mo : null))
    );
    return out;
  }

  function signals(d, med) {
    const m = d.metrics;
    const f = d.facilities;
    const out = [];
    if (m.chg_5yr_pct != null) {
      if (m.chg_5yr_pct <= -10) {
        out.push(['warn', `Fall headcount is down ${Math.abs(m.chg_5yr_pct)}% over 5 years. Space demand is likely falling, so review utilization, consolidation, or repurposing.`]);
      } else if (m.chg_5yr_pct >= 10) {
        out.push(['good', `Fall headcount is up ${m.chg_5yr_pct}% over 5 years. Check whether classroom, lab, and support space is keeping pace.`]);
      } else {
        out.push(['info', `Fall headcount is roughly stable (${window.formatPct(m.chg_5yr_pct)} over 5 years).`]);
      }
    }
    if (m.pct_online != null && m.pct_online >= 25) {
      out.push(['info', `${m.pct_online}% of students are fully online, so on-campus space need is lower than headcount alone suggests.`]);
    }
    if (m.headcount && m.fte_12mo && m.fte_12mo / m.headcount < 0.6) {
      out.push(['info', `12-month FTE is ${Math.round((m.fte_12mo / m.headcount) * 100)}% of fall headcount, which indicates a mostly part-time population. Peak-hour scheduling drives space need more than headcount does.`]);
    }
    if (f.age_of_plant_yrs != null) {
      if (f.age_of_plant_yrs >= 20) {
        out.push(['warn', `Age of plant is ${f.age_of_plant_yrs} years (system median ${med.age_of_plant_yrs ?? '—'}). Older facilities point to reinvestment or renewal need.`]);
      } else if (f.age_of_plant_yrs <= 12) {
        out.push(['good', `Age of plant is ${f.age_of_plant_yrs} years, a relatively new or recently renewed plant (system median ${med.age_of_plant_yrs ?? '—'}).`]);
      }
    }
    if (f.om_per_fte != null && med.om_per_fte) {
      const r = f.om_per_fte / med.om_per_fte;
      if (r >= 1.25) {
        out.push(['warn', `O&M spending per FTE (${money(f.om_per_fte)}) is ${Math.round((r - 1) * 100)}% above the system median, which may indicate excess or inefficient space.`]);
      } else if (r <= 0.75) {
        out.push(['info', `O&M spending per FTE (${money(f.om_per_fte)}) is ${Math.round((1 - r) * 100)}% below the system median. Check for deferred maintenance.`]);
      }
    }
    if (f.construction_in_progress && f.construction_in_progress > 1e6) {
      out.push(['info', `${money(f.construction_in_progress, { compact: true })} in construction in progress (FY ${ay(f.finance_year)}), meaning capital projects are underway.`]);
    }
    const inv = f.inventory;
    if (inv?.gross_sq_ft && m.fte_12mo) {
      const g = inv.gross_sq_ft / m.fte_12mo;
      const gm = med.gsf_per_fte;
      out.push([gm && g > gm * 1.2 ? 'warn' : 'info', `${Math.round(g)} gross sq ft per FTE${gm ? ` (system median ${Math.round(gm)})` : ''}.`]);
    }
    if (!out.length) out.push(['info', 'Not enough data to compute indicators for this campus yet.']);
    return out;
  }

  function kv(rows) {
    return `<dl class="cp-kv">${rows
      .map(([k, v, vs]) => `<dt>${esc(k)}</dt><dd>${v}${vs ? `<span class="vs">${vs}</span>` : ''}</dd>`)
      .join('')}</dl>`;
  }

  function facilitySourcesFor(system) {
    return window.HE_SOURCES.facilities.filter((s) => s.systems.includes(system));
  }

  const LEADERSHIP_ROLES = [
    ['president', 'President / chancellor'],
    ['provost', 'Provost / chief academic officer'],
    ['cfo', 'Chief financial officer'],
    ['coo', 'Chief operating officer'],
  ];

  function leadershipCard(code, lead) {
    const sys = lead?.systems?.[code];
    if (!sys) return '';
    const rows = LEADERSHIP_ROLES.map(([key, label]) => {
      const r = sys.roles[key];
      if (!r || !r.name) {
        return `<tr><td>${label}</td><td colspan="2" class="cp-muted">${esc(r?.note || 'No system-level equivalent')}</td></tr>`;
      }
      const phoneHref = r.phone ? r.phone.replace(/[^\d+]/g, '') : '';
      const contact = [
        r.email && `<a class="he-link" href="mailto:${esc(r.email)}">${esc(r.email)}</a>`,
        r.phone && `<a class="he-link" href="tel:${esc(phoneHref)}">${esc(r.phone)}</a>`,
      ].filter(Boolean).join('<br>') || `<a class="he-link" href="${esc(sys.leadership_url)}" target="_blank" rel="noopener">System leadership page ↗</a>`;
      const match = r.match === 'closest' ? ' <span class="cp-match">closest title</span>' : '';
      const title = r.title ? `<div class="cp-muted">${esc(r.title)}</div>` : '';
      const note = r.note ? `<div class="cp-muted">${esc(r.note)}</div>` : '';
      return `<tr><td>${label}</td><td><b>${esc(r.name)}</b>${match}${title}${note}</td><td>${contact}</td></tr>`;
    }).join('');
    const office = sys.office && (sys.office.address || sys.office.phone || sys.office.email)
      ? `<p class="hint">System office: ${esc([sys.office.address, sys.office.phone, sys.office.email].filter(Boolean).join(' · '))}</p>`
      : '';
    return `
      <section class="he-card" style="min-height:auto;">
        <h2>System leadership · ${esc(sys.name)}</h2>
        <p class="hint">Checked ${esc(lead.as_of)} from system websites and staff directories. “Closest title” means the system uses a different title for that job. Confirm before external use.</p>
        ${office}
        <div style="overflow-x:auto;">
          <table class="he-table cp-leadership">
            <thead><tr><th>Role</th><th>Name &amp; title</th><th>Contact</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </section>`;
  }

  function render(d, campuses, families, leadership) {
    const dir = d.directory;
    const m = d.metrics;
    const f = d.facilities;
    const med = systemMedians(campuses, dir.system_code);
    const color = window.heSystemColor(dir.system_code);
    const fam = (c) => families[c] || `CIP ${c}`;
    document.title = `${dir.inst_name} · Campus Explorer`;

    const inv = f.inventory;
    const sqftPerBldg = inv?.gross_sq_ft && inv?.building_count ? Math.round(inv.gross_sq_ft / inv.building_count) : null;
    const gsfPerFte = inv?.gross_sq_ft && m.fte_12mo ? Math.round(inv.gross_sq_ft / m.fte_12mo) : null;
    const facSrc = facilitySourcesFor(dir.system_code);
    const vsMed = (v, medV, fmtFn = (x) => x) => (medV != null ? `system median ${fmtFn(Math.round(medV * 10) / 10)}` : '');

    const tags = [dir.sector, dir.carnegie, dir.locale, dir.size_band && `Size: ${dir.size_band}`, dir.land_grant && 'Land-grant', dir.hbcu && 'HBCU']
      .filter(Boolean)
      .map((t) => `<span class="cp-tag">${esc(t)}</span>`)
      .join('');

    const latestEnroll = d.enrollment.filter((e) => e.headcount_total != null).slice(-1)[0] || {};

    document.getElementById('cp-root').innerHTML = `
      <section class="he-card" style="min-height:auto;">
        <div class="cp-header">
          <div>
            <h1>${esc(dir.inst_name)}</h1>
            <div class="cp-sub">
              <span class="dot" style="background:${color}"></span>
              <a class="he-link" href="explorer.html?system=${encodeURIComponent(dir.system_code)}">${esc(window.heSystemLabel(dir.system_code))}</a>
              · ${esc(dir.address || '')}${dir.address ? ', ' : ''}${esc(dir.city)}, ${esc(dir.state)} ${esc(dir.zip || '')}
              ${dir.county ? ` · ${esc(dir.county)}` : ''}
            </div>
            <div class="cp-tags">${tags}</div>
          </div>
          <div style="text-align:right; font-size:0.85rem; color:var(--he-muted);">
            UNITID ${esc(d.unitid)}<br>
            ${dir.website ? `<a class="he-link" href="${esc(/^https?:/.test(dir.website) ? dir.website : `https://${dir.website}`)}" target="_blank" rel="noopener">Website ↗</a><br>` : ''}
            ${dir.chief ? `${esc(dir.chief)}${dir.chief_title ? `, ${esc(dir.chief_title)}` : ''}` : ''}
          </div>
        </div>
      </section>

      <section class="he-kpis" style="grid-template-columns: repeat(6, minmax(0, 1fr)); margin:0;">
        <div class="he-kpi"><div class="label">Full-time students ${m.latest_year || ''}</div><div class="value">${fmt(latestEnroll.headcount_ft ?? m.headcount_ft)}</div>
          <div class="delta ${m.chg_5yr_pct >= 0 ? 'up' : 'down'}">${window.formatPct(m.chg_5yr_pct)} 5-yr · ${window.formatPct(m.chg_10yr_pct)} 10-yr</div></div>
        <div class="he-kpi"><div class="label">Part-time students ${m.latest_year || ''}</div><div class="value">${fmt(latestEnroll.headcount_pt)}</div>
          <div class="delta">${latestEnroll.headcount_pt != null && m.headcount ? `${Math.round((latestEnroll.headcount_pt / m.headcount) * 100)}% of ${fmt(m.headcount)} total` : '—'}</div></div>
        <div class="he-kpi"><div class="label">Fully online</div><div class="value">${pct(m.pct_online)}</div><div class="delta">${vsMed(m.pct_online, med.pct_online, (x) => `${x}%`)}</div></div>
        <div class="he-kpi"><div class="label">Age of plant</div><div class="value">${f.age_of_plant_yrs != null ? `${f.age_of_plant_yrs} yrs` : '—'}</div><div class="delta">${f.age_of_plant_yrs != null ? vsMed(f.age_of_plant_yrs, med.age_of_plant_yrs) : 'Not reported for this campus'}</div></div>
        <div class="he-kpi"><div class="label">O&amp;M $ / FTE</div><div class="value">${money(f.om_per_fte)}</div><div class="delta">${vsMed(f.om_per_fte, med.om_per_fte, money)}</div></div>
        <div class="he-kpi"><div class="label">Gross sq ft</div><div class="value">${fmt(inv?.gross_sq_ft)}</div><div class="delta">${inv ? `${fmt(inv.building_count)} buildings` : 'Inventory not loaded'}</div></div>
      </section>

      <section class="he-card" style="min-height:auto;">
        <h2>Facilities decision indicators</h2>
        <p class="hint">Rule-based flags from the data below. Treat them as prompts for analysis, not conclusions. Thresholds are listed on the Data sources tab.</p>
        <div class="cp-signals">${signals(d, med)
          .map(([k, t]) => `<div class="cp-signal ${k}"><span class="ico">${k === 'warn' ? '!' : k === 'good' ? '✓' : 'i'}</span><span>${esc(t)}</span></div>`)
          .join('')}</div>
      </section>

      <section class="he-grid-2">
        <div class="he-card">
          <h2>Enrollment history</h2>
          <p class="hint">Fall headcount by level, plus 12-month FTE (IPEDS EF / EFIA)</p>
          <div class="he-chart-wrap he-chart-tall"><canvas id="cp-enroll"></canvas></div>
        </div>
        <div class="he-card">
          <h2>Enrollment mix</h2>
          <p class="hint">Full-time vs part-time fall headcount</p>
          <div class="he-chart-wrap he-chart-tall"><canvas id="cp-ftpt"></canvas></div>
        </div>
      </section>

      <section class="cp-grid-3">
        <div class="he-card">
          <h2>Space &amp; buildings</h2>
          <p class="hint">${inv ? `Source: ${esc(inv.source || 'facilities.csv')}${inv.as_of ? ` (${esc(inv.as_of)})` : ''}` : 'No public national dataset. See sources below.'}</p>
          ${inv
            ? kv([
                ['Gross square feet', fmt(inv.gross_sq_ft)],
                ['Assignable square feet', fmt(inv.assignable_sq_ft)],
                ['Number of buildings', fmt(inv.building_count)],
                ['Sq ft per building', fmt(sqftPerBldg)],
                ['Gross sq ft per FTE', fmt(gsfPerFte), med.gsf_per_fte ? `system median ${Math.round(med.gsf_per_fte)}` : ''],
                ['Average building age', inv.avg_building_age != null ? `${inv.avg_building_age} yrs` : '—'],
                ['Facility condition index', inv.fci != null ? inv.fci : '—'],
              ])
            : `<p class="cp-missing">Square footage, building count, and sq ft per building are not loaded for this campus yet.</p>
               <p style="font-size:0.85rem;margin:8px 0 4px;"><b>Where to get it for ${esc(dir.system_code)}:</b></p>
               <ul style="margin:0;padding-left:18px;font-size:0.85rem;line-height:1.5;">${facSrc
                 .map((s) => `<li><a class="he-link" href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.source)}</a>. ${esc(s.detail)} <i>(${esc(s.access)})</i></li>`)
                 .join('') || '<li>See the Data sources tab.</li>'}</ul>`}
        </div>
        <div class="he-card">
          <h2>Facilities finance</h2>
          <p class="hint">IPEDS Finance F1A · FY ${ay(f.finance_year)}</p>
          ${kv([
            ['Buildings (book value)', money(f.buildings_book_value, { compact: true })],
            ['Accumulated depreciation', money(f.accumulated_depreciation, { compact: true })],
            ['Annual depreciation', money(f.depreciation_expense, { compact: true })],
            ['Age of plant', f.age_of_plant_yrs != null ? `${f.age_of_plant_yrs} yrs` : '—', vsMed(f.age_of_plant_yrs, med.age_of_plant_yrs)],
            ['Construction in progress', money(f.construction_in_progress, { compact: true })],
            ['Plant, property & equipment', money(f.ppe_total, { compact: true })],
            ['O&M of plant expense', money(f.om_expense, { compact: true })],
            ['O&M per FTE', money(f.om_per_fte), vsMed(f.om_per_fte, med.om_per_fte, money)],
            ['Capital appropriations', money(f.capital_appropriations, { compact: true })],
            ['Capital grants & gifts', money(f.capital_grants_gifts, { compact: true })],
          ])}
        </div>
        <div class="he-card">
          <h2>Students, staff &amp; finance</h2>
          <p class="hint">IPEDS DRVEF ${d.students.year} · DRVHR ${d.staff.year} · DRVF FY ${ay(d.finance.year)}</p>
          ${kv([
            ['Undergraduate / graduate', `${fmt(latestEnroll.headcount_ug)} / ${fmt(latestEnroll.headcount_grad)}`],
            ['Fully online / some online', `${pct(d.students.pct_exclusively_online)} / ${pct(d.students.pct_some_online)}`],
            ['Student–faculty ratio', d.students.student_faculty_ratio != null ? `${d.students.student_faculty_ratio}:1` : '—'],
            ['First-year retention (FT)', pct(d.students.retention_ft_pct)],
            ['Housing beds', fmt(d.students.housing_beds)],
            ['Staff FTE / instructional', `${fmt(d.staff.staff_fte_total)} / ${fmt(d.staff.instructional_fte)}`],
            ['Core revenue', money(d.finance.core_revenue, { compact: true })],
            ['Core expense', money(d.finance.core_expense, { compact: true })],
            ['Instruction $ per FTE', money(d.finance.instruction_per_fte)],
            ['Tuition / state approp. share', `${pct(d.finance.tuition_pct_core_rev)} / ${pct(d.finance.state_approp_pct_core_rev)}`],
          ])}
        </div>
      </section>

      ${leadershipCard(dir.system_code, leadership)}

      <section class="he-grid-2">
        <div class="he-card">
          <h2>Program families ${ay(d.programs.year)}</h2>
          <p class="hint">Awards by 2-digit CIP. Click a bar to see every campus offering that program family.</p>
          <div class="he-chart-wrap" style="height:${Math.max(240, Math.min(d.programs.families.length, 15) * 24)}px"><canvas id="cp-fams"></canvas></div>
        </div>
        <div class="he-card">
          <h2>Total awards trend</h2>
          <p class="hint">All programs, first majors (IPEDS C)</p>
          <div class="he-chart-wrap he-chart-tall"><canvas id="cp-awards"></canvas></div>
        </div>
      </section>

      <section class="he-card" style="min-height:auto;">
        <h2>Programs offered (${d.programs.detail.length})</h2>
        <p class="hint">6-digit CIP programs with awards in ${ay(d.programs.year)}, by award level</p>
        <input id="cp-prog-search" type="search" placeholder="Search programs…" style="padding:8px 10px;border:1px solid var(--he-line);border-radius:8px;width:280px;margin-bottom:10px;">
        <div style="overflow-x:auto; max-height:460px;">
          <table class="he-table cp-programs-table">
            <thead><tr><th>Program</th><th>CIP</th><th>Family</th><th>Award levels</th><th class="num">Awards</th></tr></thead>
            <tbody id="cp-prog-body"></tbody>
          </table>
        </div>
      </section>

      <section class="he-card" style="min-height:auto;">
        <h2>Enrollment by year</h2>
        <div style="overflow-x:auto;">
          <table class="he-table">
            <thead><tr><th>Fall</th><th class="num">Headcount</th><th class="num">Undergrad</th><th class="num">Graduate</th><th class="num">Full-time</th><th class="num">Part-time</th><th class="num">12-mo FTE</th><th class="num">YoY</th></tr></thead>
            <tbody>${d.enrollment
              .map((e, i, arr) => {
                const prev = arr[i - 1]?.headcount_total;
                const yoy = prev && e.headcount_total != null ? ((e.headcount_total - prev) / prev) * 100 : null;
                return `<tr><td>${e.year}</td><td class="num">${fmt(e.headcount_total)}</td><td class="num">${fmt(e.headcount_ug)}</td><td class="num">${fmt(e.headcount_grad)}</td><td class="num">${fmt(e.headcount_ft)}</td><td class="num">${fmt(e.headcount_pt)}</td><td class="num">${fmt(e.fte_12mo)}</td><td class="num ${yoy == null ? '' : yoy >= 0 ? 'pos' : 'neg'}">${window.formatPct(yoy)}</td></tr>`;
              })
              .reverse()
              .join('')}</tbody>
          </table>
        </div>
      </section>

      <section class="he-card cp-foot" style="min-height:auto;">
        <b>Sources.</b> IPEDS HD2023 (directory), EF2014A–EF2023A (fall enrollment), EFIA (12-month FTE), DRVEF (online share, retention, ratio),
        C2019_A–C2024_A (completions, first majors), CIP 2020 (titles), IC2023 (housing), F2223_F1A (facilities finance), DRVF2023, DRVHR2023.
        Year = fall term / start of academic year. Age of plant = accumulated depreciation ÷ annual depreciation. System medians compare against ${med.n} ${esc(dir.system_code)} campuses.
        <a class="he-link" href="explorer.html#sources">Full source list →</a>
      </section>
    `;

    const years = d.enrollment.map((e) => e.year);
    new Chart(document.getElementById('cp-enroll'), {
      type: 'bar',
      data: {
        labels: years,
        datasets: [
          { type: 'bar', label: 'Undergraduate', data: d.enrollment.map((e) => e.headcount_ug ?? null), backgroundColor: color, stack: 'hc' },
          { type: 'bar', label: 'Graduate', data: d.enrollment.map((e) => e.headcount_grad ?? null), backgroundColor: '#9fb7cf', stack: 'hc' },
          { type: 'line', label: '12-month FTE', data: d.enrollment.map((e) => e.fte_12mo ?? null), borderColor: '#152033', borderDash: [5, 4], fill: false, tension: 0.25 },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: 'bottom' } },
        scales: { x: { stacked: true }, y: { stacked: true, ticks: { callback: (v) => Number(v).toLocaleString() } } },
      },
    });

    new Chart(document.getElementById('cp-ftpt'), {
      type: 'line',
      data: {
        labels: years,
        datasets: [
          { label: 'Full-time', data: d.enrollment.map((e) => e.headcount_ft ?? null), borderColor: '#0f4c81', backgroundColor: 'rgba(15,76,129,0.15)', fill: true, tension: 0.25 },
          { label: 'Part-time', data: d.enrollment.map((e) => e.headcount_pt ?? null), borderColor: '#b45309', backgroundColor: 'rgba(180,83,9,0.12)', fill: true, tension: 0.25 },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: 'bottom' } },
        scales: { y: { ticks: { callback: (v) => Number(v).toLocaleString() } } },
      },
    });

    const famRows = d.programs.families.slice(0, 15);
    new Chart(document.getElementById('cp-fams'), {
      type: 'bar',
      data: {
        labels: famRows.map((r) => fam(r.cip2)),
        datasets: [{ label: 'Awards', data: famRows.map((r) => r.awards), backgroundColor: '#0a6b4a' }],
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: { y: { ticks: { autoSkip: false, callback(v) { const l = this.getLabelForValue(v); return l.length > 36 ? `${l.slice(0, 34)}…` : l; } } } },
        onHover: (e, els) => { e.native.target.style.cursor = els.length ? 'pointer' : 'default'; },
        onClick: (e, els) => {
          if (els.length) location.href = `explorer.html?program=${encodeURIComponent(famRows[els[0].index].cip2)}#overview`;
        },
      },
    });

    new Chart(document.getElementById('cp-awards'), {
      type: 'line',
      data: {
        labels: d.programs.awards_trend.map((r) => ay(r.year)),
        datasets: [{ label: 'Awards', data: d.programs.awards_trend.map((r) => r.awards || null), borderColor: '#0a6b4a', backgroundColor: 'rgba(10,107,74,0.12)', fill: true, tension: 0.25 }],
      },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } },
    });

    const body = document.getElementById('cp-prog-body');
    const renderProgs = (q) => {
      const ql = (q || '').toLowerCase();
      body.innerHTML = d.programs.detail
        .filter((p) => !ql || p.title.toLowerCase().includes(ql) || p.cip.includes(ql) || fam(p.cip2).toLowerCase().includes(ql))
        .map(
          (p) => `<tr>
            <td>${esc(p.title)}</td>
            <td><code>${esc(p.cip)}</code></td>
            <td><a class="he-link" href="explorer.html?program=${encodeURIComponent(p.cip2)}#overview" title="All campuses offering this family">${esc(fam(p.cip2))}</a></td>
            <td style="font-size:0.8rem;">${Object.entries(p.levels).map(([k, v]) => `${esc(k)}: ${fmt(v)}`).join(' · ')}</td>
            <td class="num">${fmt(p.awards)}</td>
          </tr>`
        )
        .join('') || '<tr><td colspan="5" class="cp-missing">No matching programs</td></tr>';
    };
    renderProgs('');
    document.getElementById('cp-prog-search').addEventListener('input', (e) => renderProgs(e.target.value));
  }

  async function boot() {
    const root = document.getElementById('cp-root');
    const unitid = new URLSearchParams(location.search).get('unitid');
    if (!unitid || !/^\d+$/.test(unitid)) {
      root.innerHTML = '<div class="he-card" style="min-height:auto;"><p>Missing or invalid <code>unitid</code>. <a class="he-link" href="explorer.html">Back to explorer</a></p></div>';
      return;
    }
    try {
      const cfg = window.HE_CONFIG.seedPaths;
      const [detail, campuses, families, leadership] = await Promise.all([
        fetchJson(`${cfg.campusDetailDir}/${unitid}.json`),
        fetchJson(cfg.campuses),
        fetchJson(cfg.cipFamilies).catch(() => ({})),
        fetchJson(cfg.systemLeadership).catch(() => null),
      ]);
      render(detail, campuses, families, leadership);
    } catch (err) {
      console.error(err);
      root.innerHTML = `<div class="he-card" style="min-height:auto;"><p>Could not load campus ${esc(unitid)}. <a class="he-link" href="explorer.html">Back to explorer</a></p></div>`;
    }
  }

  document.addEventListener('DOMContentLoaded', boot);
})();
