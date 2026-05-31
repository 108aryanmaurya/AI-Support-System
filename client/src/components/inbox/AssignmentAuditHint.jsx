import { Info } from 'lucide-react'
import { Link } from 'react-router-dom'

const REASON_LABELS = {
  auto_route: 'Auto-assigned',
  reassign: 'Reassigned',
  workflow: 'Workflow rule',
  manual: 'Manual assignment',
  system: 'System',
  unassign: 'Unassigned',
}

/**
 * @param {object} props
 * @param {object | null} props.log
 * @param {boolean} props.isAdmin
 * @param {string} props.orgId
 */
export default function AssignmentAuditHint({ log, isAdmin, orgId }) {
  if (!log?.reason) return null

  const label = REASON_LABELS[log.reason] ?? log.reason.replace(/_/g, ' ')
  const strategy = typeof log.strategy === 'string' ? log.strategy : null
  const sticky = log.scoreSnapshot?.sticky === true
  const titleParts = [label]
  if (strategy) titleParts.push(`Strategy: ${strategy.replace(/_/g, ' ')}`)
  if (sticky) titleParts.push('Sticky customer match')

  return (
    <div
      className="flex flex-wrap items-center gap-2 rounded-md border border-[#2b3858] bg-[#12192c]/80 px-2.5 py-1.5 text-[11px] text-slate-300"
      title={titleParts.join(' · ')}
    >
      <Info className="h-3.5 w-3.5 shrink-0 text-emerald-400/90" aria-hidden />
      <span className="font-medium text-emerald-100/90">{label}</span>
      {strategy && isAdmin ? (
        <Link
          to={`/org/${orgId}/settings/inboxes`}
          className="text-[#3ECF8E] hover:underline"
          title="View team inbox assignment settings"
        >
          {strategy.replace(/_/g, ' ')}
        </Link>
      ) : strategy ? (
        <span className="text-slate-500">{strategy.replace(/_/g, ' ')}</span>
      ) : null}
    </div>
  )
}
