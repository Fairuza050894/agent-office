import { Router } from './router/Router'
import { AppShell } from './layouts/AppShell'
import './App.css'

export interface AppProps {
  initialPath?: string
}

function App({ initialPath }: AppProps) {
  return (
    <Router initialPath={initialPath}>
      <AppShell />
    </Router>
  )
}

export default App
