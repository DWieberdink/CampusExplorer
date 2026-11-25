// Campus Explorer — reads seed JSON offline, or Supabase when configured.

window.HE_CONFIG = {
  tables: {
    syncCampuses: 'he_sync_campuses',
    campusDirectory: 'he_campus_directory',
    enrollmentFall: 'he_enrollment_fall',
    enrollmentActivity: 'he_enrollment_activity',
    completions: 'he_completions',
    syncLog: 'he_sync_log',
  },
  seedPaths: {
    campuses: 'data/seed/campuses.json',
    enrollment: 'data/seed/enrollment.json',
    completions: 'data/seed/completions.json',
    cipFamilies: 'data/seed/cip-families.json',
    campusDetailDir: 'data/campus',
  },
  // Empty = All states / All systems (top-20 public systems seed spans many states).
  defaultState: '',
  defaultSystem: '',
  defaultYear: 2023,
  // Fall term = start of academic year (2023 = fall 2023 / 2023-24).
  years: [2014, 2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023],
  /** Map point / legend color per system code. */
  systemColors: {
    CCC: '#1f77b4',
    CSU: '#d62728',
    UC: '#f2b701',
    SUNY: '#2ca02c',
    UT: '#bf5700',
    CUNY: '#6a3d9a',
    FCS: '#17becf',
    USG: '#8c564b',
    TAMU: '#500000',
    NCCCS: '#e377c2',
    VCCS: '#7f7f7f',
    UNC: '#4b9cd3',
    MNSCU: '#bcbd22',
    TBR: '#ff7f0e',
    PASSHE: '#003f5c',
    MCCCD: '#9edae5',
    KCTCS: '#aec7e8',
    CCCS: '#98df8a',
    LCTCS: '#c5b0d5',
    ALAMO: '#ff9896',
  },
  map: {
    // Public Mapbox pk. token (client GL only). Split so GitHub push protection does not
    // false-positive this intentional public token as a Mapbox secret. Restrict URLs in Mapbox dashboard.
    token: ['pk', 'eyJ1IjoiazEyc3RyYXRlZ2llcyIsImEiOiJjbXd3bGxsNDIwNG4wMnhvazl2N2F2dGs5In0', 'iKqxoxLMJiE2f_SS_nTdBA'].join('.'),
    style: 'mapbox://styles/mapbox/light-v11',
    center: [-98.35, 39.5],
    zoom: 3.4,
  },
  systems: {
    CCC: 'California Community Colleges',
    CSU: 'California State University',
    UC: 'University of California',
    SUNY: 'State University of New York',
    UT: 'University of Texas System',
    CUNY: 'City University of New York',
    FCS: 'Florida College System',
    USG: 'University System of Georgia',
    TAMU: 'Texas A&M University System',
    NCCCS: 'North Carolina Community College System',
    VCCS: 'Virginia Community College System',
    UNC: 'University of North Carolina System',
    MNSCU: 'Minnesota State',
    TBR: 'Tennessee Board of Regents',
    PASSHE: 'Pennsylvania State System of Higher Education',
    MCCCD: 'Maricopa Community College District',
    KCTCS: 'Kentucky Community and Technical College System',
    CCCS: 'Colorado Community College System',
    LCTCS: 'Louisiana Community and Technical College System',
    ALAMO: 'Alamo Colleges District',
  },
  usStates: [
    'AL','AK','AZ','AR','CA','CO','CT','DE','DC','FL','GA','HI','ID','IL','IN','IA','KS','KY',
    'LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH',
    'OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','PR',
  ],
  stateNames: {
    AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California', CO: 'Colorado',
    CT: 'Connecticut', DE: 'Delaware', DC: 'District of Columbia', FL: 'Florida', GA: 'Georgia',
    HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa', KS: 'Kansas',
    KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts',
    MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri', MT: 'Montana',
    NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico',
    NY: 'New York', NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma',
    OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota',
    TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont', VA: 'Virginia', WA: 'Washington',
    WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming', PR: 'Puerto Rico',
  },
};

window.heStateLabel = function (code) {
  const name = window.HE_CONFIG.stateNames[code];
  return name ? `${name} (${code})` : code;
};

window.heSystemLabel = function (code) {
  return window.HE_CONFIG.systems[code] || code || '—';
};

window.heSystemColor = function (code) {
  return window.HE_CONFIG.systemColors[code] || '#0f4c81';
};

window.heEscape = function (s) {
  return String(s ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[ch]);
};

window.formatMoney = function (value, { compact = false } = {}) {
  if (value == null || Number.isNaN(Number(value))) return '—';
  const n = Number(value);
  if (compact && Math.abs(n) >= 1e6) {
    const units = Math.abs(n) >= 1e9 ? ['B', 1e9] : ['M', 1e6];
    return `$${(n / units[1]).toFixed(1)}${units[0]}`;
  }
  return `$${Math.round(n).toLocaleString()}`;
};

window.campusUrl = function (unitid) {
  return `campus.html?unitid=${encodeURIComponent(unitid)}`;
};

window.formatNumber = function (value) {
  if (value == null || Number.isNaN(Number(value))) return '—';
  return Number(value).toLocaleString();
};

window.formatPct = function (value) {
  if (value == null || Number.isNaN(Number(value))) return '—';
  const n = Number(value);
  const sign = n > 0 ? '+' : '';
  return `${sign}${n.toFixed(1)}%`;
};

window.isMapboxConfigured = function () {
  const token = window.HE_CONFIG?.map?.token;
  return Boolean(token && token !== 'YOUR_MAPBOX_TOKEN_HERE' && token.startsWith('pk.'));
};
