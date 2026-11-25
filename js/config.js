// Supabase Dashboard → Project Settings → API
// Leave placeholders until a CampusExplorer Supabase project is provisioned.
window.SUPABASE_URL = 'https://YOUR_PROJECT_REF.supabase.co';

// Publishable anon key (safe for browser). Do NOT use the service role key here.
window.SUPABASE_ANON_KEY = 'YOUR_ANON_KEY_HERE';

// Only this email can approve sign-ups (update when provisioning).
window.ADMIN_EMAIL = 'higher.ed@perkinseastman.com';

window.TITLE_OPTIONS = [
  { value: 'untitled', label: 'Untitled' },
  { value: 'associate', label: 'Associate' },
  { value: 'senior associate', label: 'Senior Associate' },
  { value: 'associate principal', label: 'Associate Principal' },
  { value: 'principal', label: 'Principal' },
];

window.ROLE_OPTIONS = ['Viewer', 'Editor', 'Admin'];

window.titleOptionsHtml = function (selected) {
  const blank = `<option value="">Select a title</option>`;
  const opts = window.TITLE_OPTIONS.map(
    (t) =>
      `<option value="${t.value}"${t.value === selected ? ' selected' : ''}>${t.label}</option>`
  ).join('');
  return blank + opts;
};

window.roleOptionsHtml = function (selected, includeBlank) {
  const blank = includeBlank ? '<option value="">Select a role</option>' : '';
  const opts = window.ROLE_OPTIONS.map(
    (r) => `<option value="${r}"${r === selected ? ' selected' : ''}>${r}</option>`
  ).join('');
  return blank + opts;
};

// Public hosted origin for auth emails (signup confirm + password reset).
// Set after enabling GitHub Pages on this repo.
window.APP_BASE_URL = 'https://dwieberdink.github.io/CampusExplorer';

window.getAppUrl = function (page) {
  const file = (page && String(page).trim()) || 'index.html';
  const base = (window.APP_BASE_URL || '').replace(/\/$/, '');
  if (base && !base.includes('YOUR_')) return `${base}/${file.replace(/^\//, '')}`;
  if (window.location.protocol === 'file:') {
    return `http://localhost:5500/${file}`;
  }
  const originBase = window.location.href.replace(/[^/]*$/, '');
  return originBase + file;
};

window.getAuthRedirectUrl = function (page) {
  return window.getAppUrl(page || 'index.html');
};

window.isSupabaseConfigured = function () {
  return (
    window.SUPABASE_URL &&
    window.SUPABASE_ANON_KEY &&
    !String(window.SUPABASE_URL).includes('YOUR_PROJECT_REF') &&
    window.SUPABASE_ANON_KEY !== 'YOUR_ANON_KEY_HERE' &&
    (window.SUPABASE_ANON_KEY.startsWith('eyJ') ||
      window.SUPABASE_ANON_KEY.startsWith('sb_publishable_'))
  );
};
