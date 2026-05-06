import { useEffect, useState } from 'react'
import LandingPage from './pages/LandingPage.jsx'
import LoginPage from './pages/LoginPage.jsx'
import Register from './pages/Register.jsx'
import DashboardPage from './pages/DashboardPage.jsx'

export default function App() {
  const [pathname, setPathname] = useState(window.location.pathname)

  useEffect(() => {
    function handleRouteChange() {
      setPathname(window.location.pathname)
    }

    window.addEventListener('popstate', handleRouteChange)
    return () => window.removeEventListener('popstate', handleRouteChange)
  }, [])

  function navigateTo(path) {
    if (window.location.pathname === path) return
    window.history.pushState({}, '', path)
    setPathname(path)
  }

  if (pathname === '/login') {
    return <LoginPage onBackToHome={() => navigateTo('/')} onStartTrial={() => navigateTo('/register')} />
  }

  if (pathname === '/register') {
    return <Register onBackToHome={() => navigateTo('/')} onGoToDashboard={() => navigateTo('/dashboard')} />
  }

  if (pathname === '/dashboard') {
    return <DashboardPage onGoHome={() => navigateTo('/')} />
  }

  return (
    <LandingPage onLoginClick={() => navigateTo('/login')} onStartTrialClick={() => navigateTo('/register')} />
  )
}
