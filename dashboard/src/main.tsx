import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './style.css';

type Suggestion = {
  id: string;
  user_id: string;
  category: string;
  content: string;
  status: string;
  created_at: string;
  upvotes: number;
  downvotes: number;
  total_votes: number;
};

type Stats = {
  total: number;
  pending: number;
  under_review: number;
  approved: number;
  rejected: number;
  implemented: number;
};

const STATUSES = [
  'Pending',
  'Under Review',
  'Approved',
  'Rejected',
  'Implemented'
];

const SETTINGS_FIELDS: Record<string, { title: string; description: string; fields: { key: string; label: string; placeholder: string }[] }> = {
  general: {
    title: 'General Configuration',
    description: 'Basic identity and activity settings for Hollow Studios.',
    fields: [
      { key: 'botName', label: 'Bot Display Name', placeholder: 'Hollow Studios' },
      { key: 'activity', label: 'Activity Text', placeholder: 'Your community activity' },
      { key: 'activityType', label: 'Activity Type', placeholder: 'WATCHING / PLAYING / LISTENING' }
    ]
  },
  welcome: {
    title: 'Welcome System',
    description: 'Configure welcome messages, channels and automatic roles.',
    fields: [
      { key: 'channelId', label: 'Welcome Channel ID', placeholder: 'Discord channel ID' },
      { key: 'autoRoleId', label: 'Auto Role ID', placeholder: 'Discord role ID' },
      { key: 'message', label: 'Welcome Message', placeholder: 'Welcome to Hollow Studios!' }
    ]
  },
  moderation: {
    title: 'Moderation',
    description: 'Configure moderation logs and staff settings.',
    fields: [
      { key: 'logChannelId', label: 'Moderation Log Channel ID', placeholder: 'Discord channel ID' },
      { key: 'staffRoleId', label: 'Staff Role ID', placeholder: 'Discord role ID' },
      { key: 'defaultTimeoutMinutes', label: 'Default Timeout (minutes)', placeholder: '60' }
    ]
  },
  tickets: {
    title: 'Ticket System',
    description: 'Configure ticket categories and support permissions.',
    fields: [
      { key: 'categoryId', label: 'Ticket Category ID', placeholder: 'Discord category ID' },
      { key: 'supportRoleId', label: 'Support Role ID', placeholder: 'Discord role ID' },
      { key: 'transcriptChannelId', label: 'Transcript Channel ID', placeholder: 'Discord channel ID' }
    ]
  },
  roblox: {
    title: 'Roblox Verification',
    description: 'Configure Roblox group verification and role assignment.',
    fields: [
      { key: 'verifiedRoleId', label: 'Verified Role ID', placeholder: 'Hollow Guy role ID' },
      { key: 'groupId', label: 'Roblox Group ID', placeholder: 'Roblox group ID' },
      { key: 'syncIntervalMinutes', label: 'Sync Interval (minutes)', placeholder: '30' }
    ]
  },
  suggestions: {
    title: 'Suggestions Configuration',
    description: 'Configure the community suggestion system.',
    fields: [
      { key: 'channelId', label: 'Suggestion Channel ID', placeholder: 'Discord channel ID' },
      { key: 'reviewRoleId', label: 'Review Staff Role ID', placeholder: 'Discord role ID' },
      { key: 'allowVoting', label: 'Voting Enabled', placeholder: 'true or false' }
    ]
  }
};

const SETTINGS_NAV = [
  ['general', 'General'],
  ['welcome', 'Welcome System'],
  ['moderation', 'Moderation'],
  ['tickets', 'Tickets'],
  ['roblox', 'Roblox Verification'],
  ['suggestions', 'Suggestions']
];

async function api(path: string, options: RequestInit = {}) {
  const response = await fetch(`/api${path}`, {
    ...options,
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers
    }
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || 'Request failed.');
  }

  return data;
}

function App() {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loading, setLoading] = useState(false);

  const [stats, setStats] = useState<Stats | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [categories, setCategories] = useState<string[]>([]);

  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [status, setStatus] = useState('');
  const [sort, setSort] = useState('newest');
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [selected, setSelected] = useState<Suggestion | null>(null);
  const [error, setError] = useState('');
  const [activePage, setActivePage] = useState('suggestions');
  const [monitor, setMonitor] = useState<{
    databaseOnline: boolean;
    botOnline: boolean;
    uptimeSeconds: number;
    discordPing: number;
    guildCount: number;
    memberCount: number;
    lastHeartbeat: string | null;
  } | null>(null);
  const [monitorError, setMonitorError] = useState('');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [settingsSection, setSettingsSection] = useState('general');
  const [botSettings, setBotSettings] = useState<Record<string, Record<string, string>>>({});
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsMessage, setSettingsMessage] = useState('');

  useEffect(() => {
    api('/auth/me')
      .then(data => setAuthenticated(data.authenticated))
      .catch(() => setAuthenticated(false));
  }, []);

  useEffect(() => {
    if (!authenticated || activePage !== 'monitor') return;

    let mounted = true;

    const loadMonitor = async () => {
      try {
        const response = await fetch('/api/dashboard/monitor', {
          credentials: 'include'
        });
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || 'Monitor request failed.');
        }

        if (mounted) {
          setMonitor(data);
          setMonitorError('');
        }
      } catch (error) {
        if (mounted) {
          setMonitorError(
            error instanceof Error ? error.message : 'Could not load monitor.'
          );
        }
      }
    };

    void loadMonitor();
    const timer = window.setInterval(() => void loadMonitor(), 5000);

    return () => {
      mounted = false;
      window.clearInterval(timer);
    };
  }, [authenticated, activePage]);

  async function login(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setLoginError('');

    try {
      await api('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ password })
      });

      setPassword('');
      setAuthenticated(true);
    } catch (err) {
      setLoginError(err instanceof Error ? err.message : 'Login failed.');
    } finally {
      setLoading(false);
    }
  }

  async function logout() {
    await api('/auth/logout', { method: 'POST' });
    setAuthenticated(false);
    setStats(null);
    setSuggestions([]);
  }

  async function loadDashboard() {
    try {
      setError('');

      const [statsData, listData, categoryData] = await Promise.all([
        api('/dashboard/stats'),
        api(`/dashboard/suggestions?page=${page}&search=${encodeURIComponent(search)}&category=${encodeURIComponent(category)}&status=${encodeURIComponent(status)}&sort=${encodeURIComponent(sort)}`),
        api('/dashboard/categories')
      ]);

      setStats(statsData);
      setSuggestions(listData.suggestions);
      setPages(Math.max(1, listData.pagination.pages));
      setCategories(categoryData.categories);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load dashboard.');
    }
  }

  useEffect(() => {
    if (authenticated) loadDashboard();
  }, [authenticated, page, search, category, status, sort]);

  useEffect(() => {
    if (authenticated) loadBotSettings();
  }, [authenticated]);


  async function loadBotSettings() {
    setSettingsLoading(true);
    try {
      const data = await api('/dashboard/settings');
      setBotSettings(data.settings || {});
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load bot settings.');
    } finally {
      setSettingsLoading(false);
    }
  }

  async function saveBotSettings() {
    setSettingsSaving(true);
    setSettingsMessage('');
    try {
      await api(`/dashboard/settings/${settingsSection}`, {
        method: 'PUT',
        body: JSON.stringify({
          settings: botSettings[settingsSection] || {}
        })
      });
      setSettingsMessage('Settings saved successfully.');
    } catch (err) {
      setSettingsMessage(err instanceof Error ? err.message : 'Could not save settings.');
    } finally {
      setSettingsSaving(false);
    }
  }

  function updateSetting(key: string, value: string) {
    setBotSettings(current => ({
      ...current,
      [settingsSection]: {
        ...(current[settingsSection] || {}),
        [key]: value
      }
    }));
  }

  async function updateStatus(id: string, newStatus: string) {
    try {
      await api(`/dashboard/suggestions/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: newStatus })
      });

      setSelected(current =>
        current?.id === id ? { ...current, status: newStatus } : current
      );

      await loadDashboard();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Status update failed.');
    }
  }

  if (authenticated === null) {
    return <div className="loading-screen">INITIALIZING HOLLOW SYSTEM...</div>;
  }

  if (!authenticated) {
    return (
      <main className="login-screen">
        <form className="login-card" onSubmit={login}>
          <div className="brand-mark">H</div>
          <p className="eyebrow">HOLLOW STUDIOS</p>
          <h1>CONTROL CENTER</h1>
          <p className="muted">Authorized staff access only.</p>

          <label htmlFor="password">ACCESS PASSWORD</label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={event => setPassword(event.target.value)}
            placeholder="Enter dashboard password"
            autoComplete="current-password"
            required
          />

          {loginError && <p className="error-message">{loginError}</p>}

          <button className="primary-button" disabled={loading}>
            {loading ? 'AUTHENTICATING...' : 'ACCESS DASHBOARD'}
          </button>

          <p className="login-footer">HOLLOW STUDIOS · PRIVATE NETWORK</p>
        </form>
      </main>
    );
  }

  return (
    <main className="dashboard">
      <header className="topbar">
        <button
          className="mobile-menu-button"
          onClick={() => setMobileMenuOpen(open => !open)}
          aria-label={mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
          aria-expanded={mobileMenuOpen}
        >
          <span></span>
          <span></span>
          <span></span>
        </button>
        <div className="brand">
          <div className="brand-mark small">H</div>
          <div>
            <strong>HOLLOW STUDIOS</strong>
            <span> SUGGESTIONS MANAGER</span>
          </div>
        </div>

        <div className="topbar-right">
          <span className="live-indicator">SYSTEM ONLINE</span>
          <button className="logout-button" onClick={logout}>LOG OUT</button>
        </div>
      </header>

      {mobileMenuOpen && (
        <button
          className="mobile-menu-backdrop"
          onClick={() => setMobileMenuOpen(false)}
          aria-label="Close navigation menu"
        />
      )}

      <aside className={`control-sidebar ${mobileMenuOpen ? 'mobile-open' : ''}`}>
        <p className="eyebrow">CONTROL CENTER</p>
        <button className={activePage === 'overview' ? 'active' : ''} onClick={() => { setActivePage('overview'); setMobileMenuOpen(false); }}>◈ Overview</button>
        <button className={activePage === 'suggestions' ? 'active' : ''} onClick={() => { setActivePage('suggestions'); setMobileMenuOpen(false); }}>✦ Suggestions</button>
        <p className="sidebar-label">BOT CONFIGURATION</p>
        <button className={activePage === 'settings' ? 'active' : ''} onClick={() => { setActivePage('settings'); setMobileMenuOpen(false); }}>⚙ Bot Settings</button>
        <button className={activePage === 'monitor' ? 'active' : ''} onClick={() => { setActivePage('monitor'); setMobileMenuOpen(false); }}>◉ System Monitor</button>
        <button className={activePage === 'logs' ? 'active' : ''} onClick={() => { setActivePage('logs'); setMobileMenuOpen(false); }}>≡ Activity Logs</button>
      </aside>

      {activePage === 'settings' && (
        <section className="settings-page">
          <div className="settings-heading">
            <div>
              <p className="eyebrow">HOLLOW STUDIOS / CONFIGURATION</p>
              <h1>Bot <span>Settings</span></h1>
              <p className="muted">Manage your bot configuration from one central place.</p>
            </div>
            <span className="live-indicator">CONFIGURATION</span>
          </div>

          <div className="settings-layout">
            <nav className="settings-nav">
              {SETTINGS_NAV.map(([key, label]) => (
                <button
                  key={key}
                  className={settingsSection === key ? 'active' : ''}
                  onClick={() => {
                    setSettingsSection(key);
                    setSettingsMessage('');
                  }}
                >
                  {label}
                </button>
              ))}
            </nav>

            <section className="settings-card">
              {settingsLoading ? (
                <p className="muted">Loading configuration...</p>
              ) : (
                <>
                  <div className="panel-heading">
                    <div>
                      <p className="eyebrow">BOT CONFIGURATION</p>
                      <h2>{SETTINGS_FIELDS[settingsSection].title}</h2>
                      <p className="muted">{SETTINGS_FIELDS[settingsSection].description}</p>
                    </div>
                  </div>

                  <div className="settings-fields">
                    {SETTINGS_FIELDS[settingsSection].fields.map(field => (
                      <label className="settings-field" key={field.key}>
                        <span>{field.label}</span>
                        <input
                          value={botSettings[settingsSection]?.[field.key] || ''}
                          onChange={event => updateSetting(field.key, event.target.value)}
                          placeholder={field.placeholder}
                        />
                      </label>
                    ))}
                  </div>

                  <div className="settings-actions">
                    <span className="settings-message">{settingsMessage}</span>
                    <button className="primary-button" onClick={saveBotSettings} disabled={settingsSaving}>
                      {settingsSaving ? 'SAVING...' : 'SAVE CONFIGURATION'}
                    </button>
                  </div>
                  <p className="muted settings-note">Saved values are stored in PostgreSQL. Existing bot features will use these values after their configuration integration is implemented.</p>
                </>
              )}
            </section>
          </div>
        </section>
      )}

      {activePage === 'overview' && (
        <section className="settings-page">
          <p className="eyebrow">HOLLOW STUDIOS / OVERVIEW</p>
          <h1>Control Center <span>Overview</span></h1>
          <div className="settings-card">
            <h2>System Overview</h2>
            <p className="muted">Suggestions are available now. Bot configuration is managed in Bot Settings.</p>
            <button className="primary-button" onClick={() => setActivePage('settings')}>OPEN BOT SETTINGS</button>
          </div>
        </section>
      )}

      {activePage === 'monitor' && (
        <section className="settings-page">
          <p className="eyebrow">HOLLOW STUDIOS / MONITOR</p>
          <h1>System <span>Monitor</span></h1>

          {monitorError && (
            <div className="settings-card">
              <p className="error-message">{monitorError}</p>
            </div>
          )}

          {!monitor && !monitorError && (
            <div className="settings-card">
              <p className="muted">Connecting to system telemetry...</p>
            </div>
          )}

          {monitor && (
            <>
              <div className="settings-fields monitor-grid">
                <div className="settings-card monitor-card">
                  <p className="eyebrow">DISCORD BOT</p>
                  <h2 style={{ color: monitor.botOnline ? '#75d69a' : '#e16b79' }}>
                    {monitor.botOnline ? 'ONLINE' : 'OFFLINE'}
                  </h2>
                  <p className="muted">
                    {monitor.botOnline ? 'Heartbeat received' : 'No recent heartbeat'}
                  </p>
                </div>

                <div className="settings-card monitor-card">
                  <p className="eyebrow">BOT UPTIME</p>
                  <h2>
                    {monitor.botOnline
                      ? `${Math.floor(monitor.uptimeSeconds / 86400)}d ${Math.floor((monitor.uptimeSeconds % 86400) / 3600)}h ${Math.floor((monitor.uptimeSeconds % 3600) / 60)}m`
                      : '—'}
                  </h2>
                  <p className="muted">Since last bot startup</p>
                </div>

                <div className="settings-card monitor-card">
                  <p className="eyebrow">WEBSOCKET PING</p>
                  <h2>{monitor.botOnline && monitor.discordPing >= 0 ? `${monitor.discordPing} ms` : '—'}</h2>
                  <p className="muted">Discord gateway latency</p>
                </div>

                <div className="settings-card monitor-card">
                  <p className="eyebrow">DISCORD SERVERS</p>
                  <h2>{monitor.guildCount.toLocaleString()}</h2>
                  <p className="muted">Connected guilds</p>
                </div>

                <div className="settings-card monitor-card">
                  <p className="eyebrow">TOTAL MEMBERS</p>
                  <h2>{monitor.memberCount.toLocaleString()}</h2>
                  <p className="muted">Cached guild member counts</p>
                </div>

                <div className="settings-card monitor-card">
                  <p className="eyebrow">POSTGRESQL</p>
                  <h2 style={{ color: monitor.databaseOnline ? '#75d69a' : '#e16b79' }}>
                    {monitor.databaseOnline ? 'CONNECTED' : 'OFFLINE'}
                  </h2>
                  <p className="muted">Database connection</p>
                </div>
              </div>

              <div className="settings-card" style={{ marginTop: 22 }}>
                <h2>Heartbeat</h2>
                <p className="muted">
                  Last update: {monitor.lastHeartbeat
                    ? new Date(monitor.lastHeartbeat).toLocaleString()
                    : 'No heartbeat received'}
                </p>
                <p className="muted">Automatic refresh every 5 seconds · Bot heartbeat every 15 seconds</p>
              </div>
            </>
          )}
        </section>
      )}

      {activePage === 'logs' && (
        <section className="settings-page">
          <p className="eyebrow">HOLLOW STUDIOS / AUDIT</p>
          <h1>Activity <span>Logs</span></h1>
          <div className="settings-card">
            <h2>Activity logging</h2>
            <p className="muted">Dashboard configuration changes are saved in PostgreSQL. A full audit history will be added in a later step.</p>
          </div>
        </section>
      )}

      <div style={{ display: activePage === 'suggestions' ? 'contents' : 'none' }}>
      <section className="welcome">
        <div>
          <p className="eyebrow">STAFF CONTROL PANEL</p>
          <h1>Suggestions <span>Overview</span></h1>
          <p className="muted">Manage community feedback and review submissions.</p>
        </div>
        <div className="total-counter">
          <span>TOTAL SUBMISSIONS</span>
          <strong>{stats?.total ?? '—'}</strong>
        </div>
      </section>

      <section className="stats-grid">
        {[
          ['PENDING', stats?.pending, 'pending'],
          ['UNDER REVIEW', stats?.under_review, 'review'],
          ['APPROVED', stats?.approved, 'approved'],
          ['REJECTED', stats?.rejected, 'rejected'],
          ['IMPLEMENTED', stats?.implemented, 'implemented']
        ].map(([label, value, style]) => (
          <article className={`stat-card ${style}`} key={String(label)}>
            <span>{label}</span>
            <strong>{value ?? '—'}</strong>
          </article>
        ))}
      </section>

      <section className="content-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">COMMUNITY DATABASE</p>
            <h2>All Suggestions</h2>
          </div>
          <span className="result-count">{suggestions.length} RESULTS</span>
        </div>

        <div className="filters">
          <input
            value={search}
            onChange={event => {
              setSearch(event.target.value);
              setPage(1);
            }}
            placeholder="Search suggestions or user ID..."
          />

          <select
            value={category}
            onChange={event => {
              setCategory(event.target.value);
              setPage(1);
            }}
          >
            <option value="">All categories</option>
            {categories.map(item => <option key={item}>{item}</option>)}
          </select>

          <select
            value={status}
            onChange={event => {
              setStatus(event.target.value);
              setPage(1);
            }}
          >
            <option value="">All statuses</option>
            {STATUSES.map(item => <option key={item}>{item}</option>)}
          </select>

          <select
            value={sort}
            onChange={event => {
              setSort(event.target.value);
              setPage(1);
            }}
          >
            <option value="newest">Newest</option>
            <option value="upvotes">Most Upvoted</option>
            <option value="downvotes">Most Downvoted</option>
            <option value="votes">Most Votes</option>
          </select>
        </div>

        {error && <p className="error-message">{error}</p>}

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>SUGGESTION</th>
                <th>CATEGORY</th>
                <th>STATUS</th>
                <th>UPVOTES</th>
                <th>DOWNVOTES</th>
                <th>TOTAL VOTES</th>
                <th>DATE</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {suggestions.map(item => (
                <tr key={item.id}>
                  <td className="id-cell">#{item.id}</td>
                  <td className="suggestion-cell">
                    <strong>{item.content}</strong>
                    <span>User: {item.user_id}</span>
                  </td>
                  <td>{item.category}</td>
                  <td>
                    <span className="vote-count positive">{item.upvotes}</span>
                  </td>
                  <td>
                    <span className="vote-count negative">{item.downvotes}</span>
                  </td>
                  <td>
                    <strong>{item.total_votes}</strong>
                  </td>
                  <td>
                    <span className={`status status-${item.status.toLowerCase().replaceAll(' ', '-')}`}>
                      {item.status}
                    </span>
                  </td>
                  <td>{new Date(item.created_at).toLocaleDateString()}</td>
                  <td>
                    <button className="view-button" onClick={() => setSelected(item)}>
                      VIEW
                    </button>
                  </td>
                </tr>
              ))}

              {suggestions.length === 0 && (
                <tr>
                  <td colSpan={9} className="empty-state">No suggestions found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="pagination">
          <span>PAGE {page} OF {pages}</span>
          <div>
            <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
              PREVIOUS
            </button>
            <button disabled={page >= pages} onClick={() => setPage(p => p + 1)}>
              NEXT
            </button>
          </div>
        </div>
      </section>

      {selected && (
        <div className="modal-backdrop" onClick={() => setSelected(null)}>
          <section className="details-modal" onClick={event => event.stopPropagation()}>
            <div className="modal-heading">
              <div>
                <p className="eyebrow">SUBMISSION #{selected.id}</p>
                <h2>Suggestion Details</h2>
              </div>
              <button className="close-button" onClick={() => setSelected(null)}>×</button>
            </div>

            <div className="detail-meta">
              <span>USER ID: {selected.user_id}</span>
              <span>CATEGORY: {selected.category}</span>
              <span>DATE: {new Date(selected.created_at).toLocaleString()}</span>
              <span>UPVOTES: {selected.upvotes}</span>
              <span>DOWNVOTES: {selected.downvotes}</span>
              <span>TOTAL VOTES: {selected.total_votes}</span>
            </div>

            <div className="suggestion-content">{selected.content}</div>

            <label htmlFor="status-select">UPDATE STATUS</label>
            <select
              id="status-select"
              value={selected.status}
              onChange={event => updateStatus(selected.id, event.target.value)}
            >
              {STATUSES.map(item => <option key={item}>{item}</option>)}
            </select>
          </section>
        </div>
      )}
      </div>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
