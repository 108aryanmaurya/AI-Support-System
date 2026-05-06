import { Button } from '../components/Button.jsx'
import { Logo } from '../components/Logo.jsx'

export default function DashboardPage({ onGoHome = () => {} }) {
  return (
    <main className="min-h-screen bg-gradient-to-b from-white via-[#f7fff9] to-white px-6 py-10">
      <div className="mx-auto w-full max-w-5xl">
        <div className="mb-8 flex items-center justify-between">
          <Logo />
          <Button variant="outline" onClick={onGoHome}>
            Back to landing
          </Button>
        </div>
        <section className="rounded-3xl border border-[#3ECF8E]/30 bg-white p-8 shadow-sm">
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">Dashboard</h1>
          <p className="mt-3 text-slate-600">
            Registration and onboarding are complete. You can now continue with your workspace setup.
          </p>
        </section>
      </div>
    </main>
  )
}
