import { AuthProvider } from './context/AuthContext.jsx'
import { Shell } from './components/Shell.jsx'
import HomePage from './pages/HomePage.jsx'
import './App.css'

export default function App() {
  return (
    <AuthProvider>
      <Shell>
        <HomePage />
      </Shell>
    </AuthProvider>
  )
}
