import { Layout } from '../layout';
import { Button } from '../components/button';
import { Avatar } from '../components/avatar';
import { LogoMark } from '../components/logo';
import { SecretRow } from '../components/secretrow';
import { EnvironmentTag } from '../components/environmenttag';

const SECRETS = [
  { name: 'STRIPE_SECRET_KEY', value: 'sk_live_••••••••••••••••', lastSynced: '2m ago' },
  { name: 'DATABASE_URL', value: 'postgres://••••••••••••', lastSynced: '1h ago' },
  { name: 'JWT_SIGNING_KEY', value: '-----BEGIN ••••••••', lastSynced: '3h ago' },
  { name: 'ANTHROPIC_API_KEY', value: 'sk-ant-••••••••••••', lastSynced: 'yesterday' },
];

const ENVIRONMENTS = ['production', 'staging', 'preview-pr-42'];

export const DashboardPage = () => (
  <Layout title="itsasecret — Dashboard">
    <div class="app-shell">
      <aside class="sidebar">
        <div class="sidebar-logo">
          <LogoMark size={24} />
          <span style="font:600 var(--text-md)/var(--leading-snug) var(--font-family-display);color:var(--text-primary)">itsasecret</span>
        </div>

        <nav class="sidebar-nav">
          <a href="/dashboard" class="sidebar-link active">Secrets</a>
          <a href="/dashboard/projects" class="sidebar-link">Projects</a>
          <a href="/dashboard/environments" class="sidebar-link">Environments</a>
          <a href="/dashboard/activity" class="sidebar-link">Activity</a>
          <div class="sidebar-section-label">Org</div>
          <a href="/dashboard/members" class="sidebar-link">Members</a>
          <a href="/dashboard/settings" class="sidebar-link">Settings</a>
        </nav>

        <div class="sidebar-footer">
          <div style="display:flex;align-items:center;gap:10px;padding:8px 12px">
            <Avatar name="Hack R" size="sm" />
            <div style="display:flex;flex-direction:column">
              <span style="font-size:var(--text-sm);font-weight:600;color:var(--text-primary)">hackr</span>
              <span style="font-size:11px;color:var(--text-tertiary)">personal org</span>
            </div>
          </div>
        </div>
      </aside>

      <main class="app-main">
        <div class="app-header">
          <div>
            <h1 style="font:600 var(--text-3xl)/var(--leading-snug) var(--font-family-display);color:var(--text-primary);margin-bottom:4px">
              acme-api
            </h1>
            <span style="font-size:var(--text-sm);color:var(--text-secondary)">
              12 secrets · synced to 3 machines · 3 environments
            </span>
          </div>
          <Button variant="primary" size="md">Add secret</Button>
        </div>

        <div style="display:flex;gap:8px;margin-bottom:24px">
          {ENVIRONMENTS.map((env, i) => (
            <EnvironmentTag name={env} active={i === 0} href={`/dashboard?env=${env}`} />
          ))}
        </div>

        <div style="display:flex;flex-direction:column;gap:12px">
          {SECRETS.map((s) => (
            <SecretRow name={s.name} value={s.value} lastSynced={s.lastSynced} />
          ))}
        </div>
      </main>
    </div>

    <script dangerouslySetInnerHTML={{ __html: REVEAL_SCRIPT }} />
  </Layout>
);

const REVEAL_SCRIPT = `
document.querySelectorAll('[data-secret-reveal]').forEach(function(btn) {
  btn.addEventListener('click', function() {
    var row = btn.closest('[data-secret-row]');
    var container = row.querySelector('[data-secret-value-container]');
    var masked = row.querySelector('[data-secret-masked]');
    var plaintext = row.querySelector('[data-secret-plaintext]');
    var revealed = plaintext.style.display !== 'none';
    if (revealed) {
      plaintext.style.display = 'none';
      masked.style.display = '';
      container.classList.remove('revealed');
      btn.title = 'Reveal value';
      btn.querySelector('svg').innerHTML = '<path d="M3 3l18 18"></path><path d="M10.6 5.2A10.6 10.6 0 0 1 12 5c6.4 0 10 7 10 7a17.6 17.6 0 0 1-3.4 4.3M6.6 6.6C4 8.3 2 12 2 12s3.6 7 10 7c1.4 0 2.6-.3 3.7-.8"></path><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"></path>';
    } else {
      masked.style.display = 'none';
      plaintext.style.display = '';
      container.classList.add('revealed');
      btn.title = 'Hide value';
      btn.querySelector('svg').innerHTML = '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z"></path><circle cx="12" cy="12" r="3"></circle>';
    }
  });
});
document.querySelectorAll('[data-secret-copy]').forEach(function(btn) {
  btn.addEventListener('click', function() {
    var row = btn.closest('[data-secret-row]');
    var plaintext = row.querySelector('[data-secret-plaintext]');
    navigator.clipboard.writeText(plaintext.textContent);
  });
});
`;
