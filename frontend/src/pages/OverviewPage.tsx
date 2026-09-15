import { PageHeader } from '../components/PageHeader'
import { EmptyState } from '../components/EmptyState'
import { TableShell } from '../components/TableShell'

export function OverviewPage() {
  return (
    <div className="page-view overview-view">
      <PageHeader
        eyebrow="WORK"
        title="Overview"
        description="Real-time status of active runs, attention items, and control plane resources."
      />

      <div className="overview-grid">
        {/* Needs Attention Section (IA Section 5) */}
        <section className="dashboard-section" aria-labelledby="heading-needs-attention">
          <div className="section-header">
            <h2 id="heading-needs-attention" className="section-title">
              Needs Attention
            </h2>
            <span className="section-meta">0 actionable blockers</span>
          </div>
          <div className="section-body">
            <EmptyState
              title="No items requiring attention"
              message="Blocked runs, approval requests, and workspace conflicts will appear here."
            />
          </div>
        </section>

        {/* Active Runs Section (IA Section 4) */}
        <section className="dashboard-section" aria-labelledby="heading-active-runs">
          <div className="section-header">
            <h2 id="heading-active-runs" className="section-title">
              Active Runs
            </h2>
            <span className="section-meta">0 running</span>
          </div>
          <div className="section-body">
            <TableShell
              columns={[
                'Run',
                'Project',
                'Task',
                'Stage',
                'Active Agents',
                'Executor',
                'State',
                'Started',
              ]}
              caption="Active execution runs"
              emptyTitle="No active runs in progress"
              emptyMessage="Active workflow execution runs will appear here once started."
            />
          </div>
        </section>

        <div className="overview-split">
          {/* Executor Status Section (IA Section 4 & 34) */}
          <section className="dashboard-section" aria-labelledby="heading-executors">
            <div className="section-header">
              <h2 id="heading-executors" className="section-title">
                Executor Status
              </h2>
            </div>
            <div className="section-body">
              <EmptyState
                title="Executor information will be available after backend integration"
                message="Runtime availability and health checks for ReferenceExecutor and provider adapters will be reported here."
              />
            </div>
          </section>

          {/* Recent Activity Section (IA Section 4 & 43) */}
          <section className="dashboard-section" aria-labelledby="heading-activity">
            <div className="section-header">
              <h2 id="heading-activity" className="section-title">
                Recent Activity
              </h2>
            </div>
            <div className="section-body">
              <EmptyState
                title="No recent events recorded"
                message="Normalized lifecycle and audit events will appear here during execution."
              />
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
