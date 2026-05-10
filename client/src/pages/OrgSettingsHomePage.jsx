import {
  AlertTriangle,
  BarChart3,
  Clock,
  CreditCard,
  Gift,
  Languages,
  Layers,
  LayoutGrid,
  List,
  Mail,
  MessageSquare,
  Phone,
  ShieldCheck,
  Users,
} from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { useOrganizationContext } from '../context/OrganizationContext.jsx'

function SettingsCard({ to, icon: Icon, iconClass, title, description, badge, titleExtra }) {
  const className =
    'flex w-full flex-col items-start rounded-xl border border-[#2b3858] bg-[#12192c] p-4 text-left transition hover:border-[#3ECF8E]/35 hover:bg-[#151b2e]'
  const inner = (
    <>
      <div className={`mb-3 flex h-10 w-10 items-center justify-center rounded-lg ${iconClass}`}>
        <Icon className="h-5 w-5 text-white" strokeWidth={1.75} />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold text-white">{title}</h3>
        {titleExtra}
        {badge ? (
          <span className="rounded-md bg-[#3ECF8E]/20 px-2 py-0.5 text-[11px] font-semibold text-[#7ee8b5]">
            {badge}
          </span>
        ) : null}
      </div>
      <p className="mt-1.5 text-sm leading-snug text-slate-400">{description}</p>
    </>
  )

  if (to) {
    return (
      <Link to={to} className={className}>
        {inner}
      </Link>
    )
  }

  return (
    <button type="button" className={className}>
      {inner}
    </button>
  )
}

export default function OrgSettingsHomePage() {
  const { orgId } = useParams()
  const { organizations } = useOrganizationContext()
  const current = organizations.find((o) => o.orgId === orgId)

  return (
    <main className="h-full min-h-0 overflow-y-auto px-4 py-6 sm:px-8 lg:px-10">
      <div className="mx-auto max-w-5xl">
        <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-md border border-[#2b3858] bg-[#151b2e] text-slate-300">
              <LayoutGrid className="h-4 w-4" />
            </span>
            <h1 className="text-xl font-semibold text-white">Home</h1>
          </div>
          <Link
            to={`/org/${orgId}/inbox`}
            className="rounded-xl border border-[#2b3858] px-4 py-2 text-sm font-medium text-slate-200 transition hover:border-[#3ECF8E]/40"
          >
            Back to inbox
          </Link>
        </div>

        <p className="mb-8 text-sm text-slate-500">
          Workspace: <span className="font-medium text-slate-300">{current?.name ?? 'Organization'}</span>
          {current?.role ? (
            <span className="text-slate-600">
              {' '}
              · You are <span className="text-slate-400">{current.role.toLowerCase()}</span>
            </span>
          ) : null}
        </p>

        <section className="mb-10">
          <h2 className="mb-4 text-xs font-semibold uppercase tracking-wider text-slate-500">Workspace</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <SettingsCard
              icon={List}
              iconClass="bg-violet-600"
              title="General"
              description="Set your workspace name, time zone, languages, and more."
            />
            <SettingsCard
              to={`/org/${orgId}/settings/teammates`}
              icon={Users}
              iconClass="bg-violet-600"
              title="Teammates"
              description="Manage or invite teammates and see all activity logs."
            />
            <SettingsCard
              icon={Clock}
              iconClass="bg-violet-600"
              title="Office hours"
              description="Choose your office hours to manage customer expectations."
            />
            <div className="opacity-75">
              <SettingsCard
                icon={Gift}
                iconClass="bg-violet-600"
                title="Referrals"
                badge="Earn $100"
                description="Get credit when you refer a business to ResolveAI."
              />
            </div>
            <SettingsCard
              icon={Layers}
              iconClass="bg-violet-600"
              title="Brands"
              description="Set up and manage your brands."
            />
            <SettingsCard
              icon={ShieldCheck}
              iconClass="bg-violet-600"
              title="Security"
              titleExtra={
                <AlertTriangle className="h-4 w-4 text-amber-400" aria-label="Review recommended" />
              }
              description="Configure all security settings for your workspace and data."
            />
            <SettingsCard
              icon={Languages}
              iconClass="bg-violet-600"
              title="Multilingual"
              description="Set up and manage your multilingual settings."
            />
          </div>
        </section>

        <section className="mb-10">
          <h2 className="mb-4 text-xs font-semibold uppercase tracking-wider text-slate-500">Subscription</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <SettingsCard
              icon={CreditCard}
              iconClass="bg-emerald-700"
              title="Billing"
              description="Manage your subscription and payment details."
            />
            <SettingsCard
              icon={BarChart3}
              iconClass="bg-emerald-700"
              title="Usage"
              description="View your billed usage and set usage alerts and limits."
            />
          </div>
        </section>

        <section>
          <h2 className="mb-4 text-xs font-semibold uppercase tracking-wider text-slate-500">Channels</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <SettingsCard
              icon={Mail}
              iconClass="bg-violet-600"
              title="Email"
              description="Connect support inboxes and manage signatures and routing."
            />
            <SettingsCard
              icon={MessageSquare}
              iconClass="bg-violet-600"
              title="Chat & social"
              description="Messenger, WhatsApp, and other messaging channels."
            />
            <SettingsCard
              icon={Phone}
              iconClass="bg-violet-600"
              title="Phone & SMS"
              description="Voice and text conversations in one place."
            />
          </div>
        </section>
      </div>
    </main>
  )
}
