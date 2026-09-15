import { PageHeader } from '../components/PageHeader'

export function SettingsPage() {
  return (
    <div className="page-view settings-view">
      <PageHeader
        eyebrow="CONTROL"
        title="Settings"
        description="Local control plane configuration, storage roots, and safety policy."
      />

      <div className="page-content settings-content">
        <div className="settings-notice" role="note">
          <span className="notice-label">Configuration State:</span>
          <span>
            Configuration settings will be synchronized from the backend configuration layer in Phase 1H.
            Baseline architectural defaults are displayed below.
          </span>
        </div>

        <div className="settings-grid">
          {/* General Settings */}
          <section className="settings-section" aria-labelledby="heading-settings-general">
            <h2 id="heading-settings-general" className="settings-section-title">
              General Configuration
            </h2>
            <div className="settings-card">
              <div className="setting-row">
                <div className="setting-info">
                  <span className="setting-name">Network Binding</span>
                  <span className="setting-desc">Local loopback interface only</span>
                </div>
                <div className="setting-value mono">127.0.0.1</div>
              </div>
              <div className="setting-row">
                <div className="setting-info">
                  <span className="setting-name">Control Plane Architecture</span>
                  <span className="setting-desc">Modular monolith local-first control plane</span>
                </div>
                <div className="setting-value">Local Monolith</div>
              </div>
            </div>
          </section>

          {/* Storage Settings */}
          <section className="settings-section" aria-labelledby="heading-settings-storage">
            <h2 id="heading-settings-storage" className="settings-section-title">
              Storage Architecture
            </h2>
            <div className="settings-card">
              <div className="setting-row">
                <div className="setting-info">
                  <span className="setting-name">Primary Persistence</span>
                  <span className="setting-desc">Local transactional state storage</span>
                </div>
                <div className="setting-value mono">SQLite</div>
              </div>
              <div className="setting-row">
                <div className="setting-info">
                  <span className="setting-name">Workspace Containment</span>
                  <span className="setting-desc">Filesystem-bounded worktree isolation</span>
                </div>
                <div className="setting-value">Isolated Root</div>
              </div>
              <div className="setting-row">
                <div className="setting-info">
                  <span className="setting-name">Artifact Storage</span>
                  <span className="setting-desc">Content-addressed evidence outputs</span>
                </div>
                <div className="setting-value">Local Filesystem</div>
              </div>
            </div>
          </section>

          {/* Security Settings */}
          <section className="settings-section" aria-labelledby="heading-settings-security">
            <h2 id="heading-settings-security" className="settings-section-title">
              Safety and Git Policy
            </h2>
            <div className="settings-card">
              <div className="setting-row">
                <div className="setting-info">
                  <span className="setting-name">Main Working Tree Protection</span>
                  <span className="setting-desc">User-owned working tree is preserved without automated destructive actions</span>
                </div>
                <div className="setting-value">Protected</div>
              </div>
              <div className="setting-row">
                <div className="setting-info">
                  <span className="setting-name">Write Isolation</span>
                  <span className="setting-desc">One active autonomous writer per isolated Git worktree</span>
                </div>
                <div className="setting-value">Enforced</div>
              </div>
              <div className="setting-row">
                <div className="setting-info">
                  <span className="setting-name">Command Approval</span>
                  <span className="setting-desc">Restricted and external package commands require explicit approval</span>
                </div>
                <div className="setting-value">Enforced</div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
