import { useNavigate } from 'react-router-dom'
import { Button } from '../components/Button.jsx'
import { Logo } from '../components/Logo.jsx'

const features = [
  {
    title: 'AI-Powered Ticket Replies',
    description:
      'Generate context-aware responses instantly so your team can resolve tickets with confidence and speed.',
    icon: '🤖',
  },
  {
    title: 'Multi-Platform Support',
    description:
      'Manage email, live chat, and WhatsApp conversations from one streamlined workspace.',
    icon: '🌐',
  },
  {
    title: 'Smart Escalation',
    description:
      'Detect complexity and sentiment, then route conversations to human agents exactly when needed.',
    icon: '🧠',
  },
  {
    title: 'Real-Time Analytics',
    description:
      'Track response times, CSAT trends, and deflection rates with instant visibility for your team.',
    icon: '📈',
  },
]

const steps = [
  'Connect your support channels',
  'Train AI on your data',
  'Automate and scale support',
]

const testimonials = [
  {
    quote:
      'ResolveAI cut our response times by 72% in under three weeks. Our support team now focuses on high-impact cases.',
    name: 'Maya Richardson',
    role: 'Head of Support',
    company: 'Northstar SaaS',
  },
  {
    quote:
      'The AI replies feel natural and accurate, and escalation flows are smooth. It feels like adding a full second shift.',
    name: 'Omar Patel',
    role: 'Customer Experience Lead',
    company: 'FlowCommerce',
  },
  {
    quote:
      'We finally have one view across chat, email, and WhatsApp. ResolveAI made our support ops measurable and scalable.',
    name: 'Lena Becker',
    role: 'COO',
    company: 'BrightDesk',
  },
]

const plans = [
  { name: 'Starter', price: '$49/mo', description: 'For growing teams launching AI support.' },
  { name: 'Pro', price: '$149/mo', description: 'Advanced automation and analytics at scale.' },
]

export default function LandingPage() {
  const navigate = useNavigate()

  return (
    <div className="min-h-screen bg-gradient-to-b from-white via-[#f7fff9] to-white text-slate-900">
      <nav className="sticky top-0 z-30 border-b border-slate-200/70 bg-white/85 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-4">
          <Logo />
          <div className="flex items-center gap-3">
            <Button variant="outline" type="button" onClick={() => navigate('/login')}>
              Login
            </Button>
            <Button type="button" onClick={() => navigate('/register')}>
              Start Free Trial
            </Button>
          </div>
        </div>
      </nav>

      <main>
        <section className="mx-auto grid w-full max-w-6xl gap-12 px-6 pb-20 pt-16 md:grid-cols-2 md:items-center">
          <div className="animate-fade-up">
            <p className="mb-4 inline-flex rounded-full border border-[#3ECF8E]/30 bg-[#3ECF8E]/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-[#1f8d5f]">
              AI Customer Support System
            </p>
            <h1 className="text-4xl font-extrabold leading-tight tracking-tight md:text-5xl">
              Resolve Customer Queries 10x Faster with AI
            </h1>
            <p className="mt-5 max-w-xl text-lg text-slate-600">
              Automate support, reduce response time, and delight your users with intelligent AI
              agents.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button className="px-6 py-3" type="button" onClick={() => navigate('/register')}>
                Start Free Trial
              </Button>
              <Button variant="outline" className="px-6 py-3">
                Watch Demo
              </Button>
            </div>
          </div>

          <div className="animate-fade-up rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_20px_60px_rgba(15,23,42,0.08)] md:p-6">
            <div className="rounded-2xl bg-gradient-to-br from-[#f3fff8] to-white p-5">
              <div className="mb-4 flex items-center justify-between">
                <span className="text-sm font-semibold text-slate-700">AI Support Dashboard</span>
                <span className="rounded-full bg-[#3ECF8E]/20 px-2 py-1 text-xs font-semibold text-[#1f8d5f]">
                  Live
                </span>
              </div>
              <div className="space-y-3">
                <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                  <p className="text-xs text-slate-500">Incoming Ticket</p>
                  <p className="mt-1 text-sm font-medium">"My payment failed. Can you help?"</p>
                </div>
                <div className="rounded-xl border border-[#3ECF8E]/40 bg-[#f4fff8] p-3">
                  <p className="text-xs text-[#1f8d5f]">AI Suggested Reply</p>
                  <p className="mt-1 text-sm text-slate-700">
                    "I am sorry about that. I have retried the charge and shared a secure checkout
                    link."
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl border border-slate-200 bg-white p-3 text-sm">
                    <p className="text-slate-500">Avg Response</p>
                    <p className="font-bold text-slate-900">42 sec</p>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-white p-3 text-sm">
                    <p className="text-slate-500">Auto Resolved</p>
                    <p className="font-bold text-slate-900">68%</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto w-full max-w-6xl px-6 py-16">
          <h2 className="text-3xl font-bold tracking-tight">Everything your support team needs</h2>
          <div className="mt-8 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
            {features.map((feature) => (
              <article
                key={feature.title}
                className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-lg"
              >
                <span className="text-2xl" aria-hidden="true">
                  {feature.icon}
                </span>
                <h3 className="mt-3 text-lg font-semibold">{feature.title}</h3>
                <p className="mt-2 text-sm text-slate-600">{feature.description}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="mx-auto w-full max-w-6xl px-6 py-16">
          <h2 className="text-3xl font-bold tracking-tight">How it works</h2>
          <div className="mt-8 grid gap-5 md:grid-cols-3">
            {steps.map((step, index) => (
              <article key={step} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[#3ECF8E]/15 text-sm font-bold text-[#1f8d5f]">
                  {index + 1}
                </span>
                <h3 className="mt-4 text-lg font-semibold">{step}</h3>
              </article>
            ))}
          </div>
        </section>

        <section className="mx-auto w-full max-w-6xl px-6 py-16">
          <h2 className="text-3xl font-bold tracking-tight">Loved by support leaders</h2>
          <div className="mt-8 grid gap-5 md:grid-cols-3">
            {testimonials.map((person) => (
              <article key={person.name} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <p className="text-slate-700">"{person.quote}"</p>
                <p className="mt-5 font-semibold">{person.name}</p>
                <p className="text-sm text-slate-500">
                  {person.role}, {person.company}
                </p>
              </article>
            ))}
          </div>
        </section>

        <section className="mx-auto w-full max-w-6xl px-6 py-16">
          <div className="rounded-3xl border border-[#3ECF8E]/30 bg-gradient-to-br from-[#f6fff9] via-white to-[#f6fff9] p-8">
            <h2 className="text-3xl font-bold tracking-tight">Pricing preview</h2>
            <div className="mt-7 grid gap-5 md:grid-cols-2">
              {plans.map((plan) => (
                <article key={plan.name} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                  <p className="text-sm font-semibold text-slate-500">{plan.name}</p>
                  <p className="mt-2 text-3xl font-extrabold">{plan.price}</p>
                  <p className="mt-2 text-sm text-slate-600">{plan.description}</p>
                </article>
              ))}
            </div>
            <Button className="mt-7">View Full Pricing</Button>
          </div>
        </section>

        <section className="mx-auto w-full max-w-6xl px-6 pb-20 pt-8">
          <div className="rounded-3xl bg-slate-900 p-8 text-white md:flex md:items-center md:justify-between">
            <div>
              <h2 className="text-3xl font-bold tracking-tight">Start resolving smarter today</h2>
              <p className="mt-2 text-slate-300">
                Launch AI support in minutes and scale without sacrificing quality.
              </p>
            </div>
            <Button
              className="mt-6 bg-white text-slate-900 hover:bg-slate-100 md:mt-0"
              type="button"
              onClick={() => navigate('/register')}
            >
              Start Free Trial
            </Button>
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto grid w-full max-w-6xl gap-8 px-6 py-10 md:grid-cols-4">
          <div>
            <Logo />
            <p className="mt-3 text-sm text-slate-500">AI-powered customer support, built for speed.</p>
          </div>
          <div>
            <h3 className="font-semibold">Product</h3>
            <ul className="mt-3 space-y-2 text-sm text-slate-600">
              <li>Features</li>
              <li>Pricing</li>
              <li>Integrations</li>
            </ul>
          </div>
          <div>
            <h3 className="font-semibold">Company</h3>
            <ul className="mt-3 space-y-2 text-sm text-slate-600">
              <li>About</li>
              <li>Blog</li>
              <li>Careers</li>
            </ul>
          </div>
          <div>
            <h3 className="font-semibold">Social</h3>
            <div className="mt-3 flex gap-3 text-sm text-slate-600">
              <span className="rounded-lg border border-slate-300 px-2 py-1">X</span>
              <span className="rounded-lg border border-slate-300 px-2 py-1">in</span>
              <span className="rounded-lg border border-slate-300 px-2 py-1">GH</span>
            </div>
          </div>
        </div>
        <p className="border-t border-slate-200 px-6 py-4 text-center text-sm text-slate-500">
          © {new Date().getFullYear()} ResolveAI. All rights reserved.
        </p>
      </footer>
    </div>
  )
}
