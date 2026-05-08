import { useEffect, useState } from 'react'
import LandingPage from './pages/LandingPage.jsx'
import LoginPage from './pages/LoginPage.jsx'
import Register from './pages/Register.jsx'
import DashboardPage from './pages/DashboardPage.jsx'
import GettingStartedPage from './pages/GettingStartedPage.jsx'
import InboxPage from './pages/InboxPage.jsx'
import TestSendMessagePage from './pages/TestSendMessagePage.jsx'
import { HoverSidebar } from './components/HoverSidebar.jsx'

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

  function withHoverSidebar(page) {
    const excluded = ['/', '/login', '/register', '/getting-started']
    if (excluded.includes(pathname)) return page
    return (
      <>
        <HoverSidebar />
        <div className="pl-[72px] md:ml-0">
          {page}
        </div>
      </>
    )
  }

  if (pathname === '/login') {
    return (
      <LoginPage
        onBackToHome={() => navigateTo('/')}
        onStartTrial={() => navigateTo('/register')}
        onLoginSuccess={() => navigateTo('/getting-started')}
      />
    )
  }

  if (pathname === '/register') {
    return <Register onBackToHome={() => navigateTo('/')} onGoToDashboard={() => navigateTo('/getting-started')} />
  }

  if (pathname === '/getting-started') {
    return <GettingStartedPage />
  }

  if (pathname === '/dashboard') {
    return withHoverSidebar(<DashboardPage onGoHome={() => navigateTo('/')} />)
  }

  if (pathname === '/inbox') {
    return withHoverSidebar(<InboxPage onGoHome={() => navigateTo('/')} />)
  }

  if (pathname === '/test/send-message') {
    return <TestSendMessagePage />
  }

  return (
    <LandingPage onLoginClick={() => navigateTo('/login')} onStartTrialClick={() => navigateTo('/register')} />
  )
}
