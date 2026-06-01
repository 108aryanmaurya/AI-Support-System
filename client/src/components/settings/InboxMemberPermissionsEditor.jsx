import {
  BarChart3,
  BookOpen,
  Bot,
  ChevronDown,
  ChevronRight,
  Grid3x3,
  Inbox,
  Lock,
  MessageSquare,
  Send,
  Settings,
  Zap,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { ConversationAccessSection } from './ConversationAccessSection.jsx'
import {
  INBOX_PERMISSION_FIELD_LABELS,
  INBOX_PERMISSION_INBOX_GROUPS,
  INBOX_PERMISSION_REPORTS_TREE,
  INBOX_PERMISSION_UI_SECTIONS,
  inboxPermissionSectionSummary,
  allowAllInboxMemberPermissions,
  isInboxMemberPermissionsRestricted,
  mergeInboxMemberPermissions,
  restrictAllInboxMemberPermissions,
} from '@ai-support/shared'

const SECTION_ICONS = {
  copilot: Bot,
  conversationAccess: MessageSquare,
  settings: Settings,
  dataAndSecurity: Lock,
  appsAndIntegrations: Grid3x3,
  knowledge: BookOpen,
  automation: Zap,
  outbound: Send,
  inbox: Inbox,
  reports: BarChart3,
}

/**
 * @param {object} props
 * @param {object} props.permissions
 * @param {(next: object) => void} props.onChange
 * @param {boolean} [props.readOnly]
 * @param {string} [props.orgId] — loads team inboxes for conversation access picker
 */
export function InboxMemberPermissionsEditor({ permissions, onChange, readOnly = false, orgId }) {
  const merged = useMemo(() => mergeInboxMemberPermissions(permissions), [permissions])
  const [expandedId, setExpandedId] = useState('copilot')

  const setPermissions = (patch) => {
    if (readOnly) return
    onChange(mergeInboxMemberPermissions({ ...merged, ...patch }))
  }

  const setBoolSection = (sectionId, key, value) => {
    setPermissions({
      [sectionId]: { ...merged[sectionId], [key]: value },
    })
  }

  const setAllInSection = (sectionId, value) => {
    const labels = INBOX_PERMISSION_FIELD_LABELS[sectionId]
    const next = { ...merged[sectionId] }
    for (const key of Object.keys(labels)) {
      next[key] = value
    }
    setPermissions({ [sectionId]: next })
  }

  const allCheckedInSection = (sectionId) => {
    const section = merged[sectionId]
    const keys = Object.keys(INBOX_PERMISSION_FIELD_LABELS[sectionId] ?? {})
    return keys.length > 0 && keys.every((k) => section[k] === true)
  }

  return (
    <div className="space-y-3">
      {INBOX_PERMISSION_UI_SECTIONS.map((section) => {
        const Icon = SECTION_ICONS[section.id] ?? Settings
        const isOpen = expandedId === section.id
        const summary = inboxPermissionSectionSummary(section.id, merged)

        const overflowClass =
          section.id === 'conversationAccess' && isOpen ? 'overflow-visible' : 'overflow-hidden'

        return (
          <div
            key={section.id}
            className={`${overflowClass} rounded-xl border border-[#2b3858] bg-[#12192c] ${
              section.id === 'conversationAccess' && isOpen ? 'relative z-20' : ''
            }`}
          >
            <button
              type="button"
              onClick={() => setExpandedId(isOpen ? '' : section.id)}
              className="flex w-full items-center gap-3 px-4 py-4 text-left hover:bg-[#151b2e]"
            >
              <Icon className="h-5 w-5 shrink-0 text-slate-400" aria-hidden />
              <span className="flex-1 text-sm font-semibold text-white">{section.title}</span>
              <span className="rounded-full bg-sky-500/15 px-2.5 py-0.5 text-xs font-medium text-sky-300">
                {summary}
              </span>
              <ChevronDown
                className={`h-4 w-4 text-slate-500 transition ${isOpen ? 'rotate-180' : ''}`}
              />
            </button>

            {isOpen ? (
              <div className="border-t border-[#2b3858] px-4 py-4">
                {section.type === 'copilot' ? (
                  <RadioGroup
                    name="copilot-usage"
                    readOnly={readOnly}
                    value={merged.copilot.usage}
                    onChange={(usage) => setPermissions({ copilot: { usage } })}
                    options={[
                      { value: 'off', label: 'Off' },
                      { value: 'included', label: 'Included usage' },
                      { value: 'unlimited', label: 'Unlimited usage' },
                    ]}
                  />
                ) : null}

                {section.type === 'conversationAccess' ? (
                  <ConversationAccessSection
                    conversationAccess={merged.conversationAccess}
                    readOnly={readOnly}
                    orgId={orgId}
                    onChange={(next) =>
                      setPermissions({ conversationAccess: { ...merged.conversationAccess, ...next } })
                    }
                  />
                ) : null}

                {section.type === 'booleans' ? (
                  <BooleanSection
                    sectionId={section.id}
                    merged={merged}
                    readOnly={readOnly}
                    allChecked={allCheckedInSection(section.id)}
                    onSelectAll={(v) => setAllInSection(section.id, v)}
                    onToggle={setBoolSection}
                  />
                ) : null}

                {section.type === 'inbox' ? (
                  <div className="space-y-5">
                    {INBOX_PERMISSION_INBOX_GROUPS.map((group) => (
                      <div key={group.title}>
                        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
                          {group.title}
                        </p>
                        <CheckboxList
                          keys={group.keys}
                          sectionId="inbox"
                          merged={merged}
                          readOnly={readOnly}
                          onToggle={setBoolSection}
                          indentMacros={group.title === 'Macros'}
                        />
                      </div>
                    ))}
                  </div>
                ) : null}

                {section.type === 'reports' ? (
                  <ReportsTree merged={merged} readOnly={readOnly} onToggle={setBoolSection} />
                ) : null}
              </div>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}

export function InboxMemberPermissionsToolbar({ permissions, onChange, readOnly = false }) {
  const restricted = isInboxMemberPermissionsRestricted(permissions)

  function handleToggleAll() {
    if (readOnly) return
    const next = restricted
      ? allowAllInboxMemberPermissions(permissions)
      : restrictAllInboxMemberPermissions(permissions)
    onChange(next)
  }

  return (
    <div className="mb-6 flex flex-wrap items-center justify-end gap-4">
      <button
        type="button"
        disabled={readOnly}
        onClick={handleToggleAll}
        className="inline-flex items-center gap-1 rounded-lg border border-[#2b3858] px-3 py-2 text-sm text-slate-300 hover:bg-[#151b2e] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {restricted ? 'Allow all' : 'Restrict all'}
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  )
}

function BooleanSection({ sectionId, merged, allChecked, onSelectAll, onToggle, readOnly = false }) {
  const labels = INBOX_PERMISSION_FIELD_LABELS[sectionId]
  return (
    <div>
      <label className="mb-3 flex cursor-pointer items-center gap-2 text-sm text-white">
        <input
          type="checkbox"
          checked={allChecked}
          disabled={readOnly}
          onChange={(e) => onSelectAll(e.target.checked)}
          className="rounded border-slate-600 disabled:cursor-not-allowed disabled:opacity-60"
        />
        Select all
      </label>
      <CheckboxList
        keys={Object.keys(labels)}
        sectionId={sectionId}
        merged={merged}
        readOnly={readOnly}
        onToggle={onToggle}
      />
    </div>
  )
}

function CheckboxList({ keys, sectionId, merged, onToggle, indentMacros = false, readOnly = false }) {
  const labels = INBOX_PERMISSION_FIELD_LABELS[sectionId]
  const macroChildKeys = new Set(['createMacros', 'editMacros', 'deleteMacros'])

  return (
    <ul className="space-y-2">
      {keys.map((key) => (
        <li
          key={key}
          className={indentMacros && macroChildKeys.has(key) ? 'ml-6 border-l border-[#2b3858] pl-4' : ''}
        >
          <label className="flex cursor-pointer items-start gap-2 text-sm text-slate-300">
            <input
              type="checkbox"
              checked={Boolean(merged[sectionId][key])}
              disabled={readOnly}
              onChange={(e) => onToggle(sectionId, key, e.target.checked)}
              className="mt-0.5 rounded border-slate-600 disabled:cursor-not-allowed disabled:opacity-60"
            />
            <span>{labels[key]}</span>
          </label>
        </li>
      ))}
    </ul>
  )
}

function ReportsTree({ merged, onToggle, readOnly = false }) {
  const labels = INBOX_PERMISSION_FIELD_LABELS.reports
  const tree = INBOX_PERMISSION_REPORTS_TREE[0]

  return (
    <ul className="space-y-2">
      <li>
        <label className="flex cursor-pointer items-start gap-2 text-sm text-slate-300">
          <input
            type="checkbox"
            checked={Boolean(merged.reports[tree.key])}
            disabled={readOnly}
            onChange={(e) => onToggle('reports', tree.key, e.target.checked)}
            className="mt-0.5 rounded border-slate-600 disabled:cursor-not-allowed disabled:opacity-60"
          />
          <span>{labels[tree.key]}</span>
        </label>
        <ul className="ml-6 mt-2 space-y-2 border-l border-[#2b3858] pl-4">
          {tree.children.map((childKey) => (
            <li key={childKey}>
              <label className="flex cursor-pointer items-start gap-2 text-sm text-slate-300">
                <input
                  type="checkbox"
                  checked={Boolean(merged.reports[childKey])}
                  onChange={(e) => onToggle('reports', childKey, e.target.checked)}
                  className="mt-0.5 rounded border-slate-600 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={readOnly || !merged.reports[tree.key]}
                />
                <span>{labels[childKey]}</span>
              </label>
            </li>
          ))}
        </ul>
      </li>
    </ul>
  )
}

function RadioGroup({ name, value, onChange, options, readOnly = false }) {
  return (
    <ul className="space-y-3">
      {options.map((opt) => (
        <li key={opt.value}>
          <label
            className={`flex cursor-pointer items-start gap-3 text-sm ${
              opt.disabled || readOnly ? 'cursor-not-allowed text-slate-600' : 'text-slate-300'
            }`}
          >
            <input
              type="radio"
              name={name}
              value={opt.value}
              checked={value === opt.value}
              disabled={opt.disabled || readOnly}
              onChange={() => !opt.disabled && !readOnly && onChange(opt.value)}
              className="mt-1 disabled:cursor-not-allowed disabled:opacity-60"
            />
            <span>
              {opt.label}
              {opt.hint ? (
                <span className="mt-1 block text-xs text-[#6eb5ff]">{opt.hint}</span>
              ) : null}
            </span>
          </label>
        </li>
      ))}
    </ul>
  )
}

export {
  mergeInboxMemberPermissions,
  restrictAllInboxMemberPermissions,
  allowAllInboxMemberPermissions,
  isInboxMemberPermissionsRestricted,
}
