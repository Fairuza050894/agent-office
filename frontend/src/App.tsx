import './App.css'
import './office.css'
import './styles/tokens.css'
import './styles/control-room.css'
import './styles/decision-center.css'
import './styles/office-operating-experience.css'
import './styles/product-cockpit.css'
import './styles/rc1-premium-office.css'
import './styles/target-ui-shell.css'

import { ErrorBoundary } from './components/ErrorBoundary'
import { AppShell } from './layouts/AppShell'
import { Router } from './router/Router'

export interface AppProps {
  initialPath?: string
}

function App({ initialPath }: AppProps) {
  return (
    <ErrorBoundary>
      <Router initialPath={initialPath}>
        <AppShell />
      </Router>
    </ErrorBoundary>
  )
}

export default App
