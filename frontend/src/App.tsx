import './App.css'

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
