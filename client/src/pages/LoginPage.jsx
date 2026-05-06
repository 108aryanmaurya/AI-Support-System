import { Button } from '../components/Button.jsx'
import { Logo } from '../components/Logo.jsx'
import loginBg from '../assets/loginbg.jpg'

export default function LoginPage({ onBackToHome = () => {}, onStartTrial = () => {} }) {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-950 px-6 py-10">
      <img src={loginBg} alt="" className="absolute inset-0 h-full w-full object-cover" aria-hidden="true" />
      <div className="absolute inset-0 bg-black/95" aria-hidden="true" />
      <div
        className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(62,207,142,0.18),transparent_50%)]"
        aria-hidden="true"
      />

      <div className="relative z-10 w-full max-w-md rounded-3xl border border-[#3ECF8E]/30 bg-white p-7 shadow-[0_25px_80px_rgba(0,0,0,0.45)] sm:p-8">
        <div className="flex items-center justify-center">
          <Logo />
        </div>

        <h1 className="mt-7 text-center text-3xl font-bold tracking-tight text-slate-900">Welcome back</h1>
        <p className="mt-2 text-center text-sm text-slate-600">
          Login to continue managing your AI support operations.
        </p>

        <form className="mt-6 space-y-4">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">Email</span>
            <input
              type="email"
              placeholder="you@company.com"
              className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm text-slate-900 outline-none transition focus:border-[#3ECF8E] focus:ring-2 focus:ring-[#3ECF8E]/35"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">Password</span>
            <input
              type="password"
              placeholder="Enter your password"
              className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm text-slate-900 outline-none transition focus:border-[#3ECF8E] focus:ring-2 focus:ring-[#3ECF8E]/35"
            />
          </label>

          <Button className="mt-1 w-full py-3">Login</Button>
        </form>

        <p className="mt-6 text-center text-sm text-slate-600">
          New here?{' '}
          <button
            type="button"
            onClick={onStartTrial}
            className="font-semibold text-[#1f8d5f] transition hover:text-[#166c46]"
          >
            Start free trial
          </button>
        </p>

        <button
          type="button"
          onClick={onBackToHome}
          className="mt-4 w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:border-[#3ECF8E] hover:text-[#1f8d5f]"
        >
          Back to landing page
        </button>
      </div>
    </div>
  )
}
