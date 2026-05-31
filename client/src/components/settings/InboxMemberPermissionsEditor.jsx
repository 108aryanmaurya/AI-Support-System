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
 */
export function InboxMemberPermissionsEditor({ permissions, onChange }) {
  const merged = useMemo(() => mergeInboxMemberPermissions(permissions), [permissions])
  const [expandedId, setExpandedId] = useState('copilot')

  const setPermissions = (patch) => onChange(mergeInboxMemberPermissions({ ...merged, ...patch }))

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

        return (
          <div
            key={section.id}
            className="overflow-hidden rounded-xl border border-[#2b3858] bg-[#12192c]"
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
                  <RadioGroup
                    name="conversation-access"
                    value={merged.conversationAccess.mode}
                    onChange={(mode) =>
                      setPermissions({ conversationAccess: { ...merged.conversationAccess, mode } })
                    }
                    options={[
                      { value: 'all', label: 'All conversations' },
                      { value: 'assigned_to_me', label: 'Conversations assigned to them only' },
                      { value: 'assigned_to_my_teams', label: 'Conversations assigned to their teams only' },
                      {
                        value: 'all_except_teams',
                        label: 'All conversations except assigned to',
                        hint: 'Select teams',
                      },
                      {
                        value: 'mentions_only',
                        label: 'Conversations accessed via @ mentions or URL links only',
                        disabled: true,
                      },
                    ]}
                  />
                ) : null}

                {section.type === 'booleans' ? (
                  <BooleanSection
                    sectionId={section.id}
                    merged={merged}
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
                          onToggle={setBoolSection}
                          indentMacros={group.title === 'Macros'}
                        />
                      </div>
                    ))}
                  </div>
                ) : null}

                {section.type === 'reports' ? (
                  <ReportsTree merged={merged} onToggle={setBoolSection} />
                ) : null}
              </div>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}

export function InboxMemberPermissionsToolbar({ permissions, onChange, role, onRoleChange }) {
  const restricted = isInboxMemberPermissionsRestricted(permissions)

  function handleToggleAll() {
    const next = restricted
      ? allowAllInboxMemberPermissions(permissions)
      : restrictAllInboxMemberPermissions(permissions)
    onChange(next)
    onRoleChange(next.role ?? 'member')
  }

  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <label className="text-sm font-medium text-slate-300">Role</label>
        <select
          value={role}
          onChange={(e) => {
            const r = e.target.value
            onRoleChange(r)
            onChange(mergeInboxMemberPermissions({ ...permissions, role: r }))
          }}
          className="mt-1 block min-w-[200px] rounded-lg border border-[#2b3858] bg-[#111827] px-3 py-2 text-sm text-white"
        >
          <option value="none">No role</option>
          <option value="member">Member</option>
          <option value="lead">Lead</option>
        </select>
      </div>
      <button
        type="button"
        onClick={handleToggleAll}
        className="inline-flex items-center gap-1 rounded-lg border border-[#2b3858] px-3 py-2 text-sm text-slate-300 hover:bg-[#151b2e]"
      >
        {restricted ? 'Allow all' : 'Restrict all'}
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  )
}

function BooleanSection({ sectionId, merged, allChecked, onSelectAll, onToggle }) {
  const labels = INBOX_PERMISSION_FIELD_LABELS[sectionId]
  return (
    <div>
      <label className="mb-3 flex cursor-pointer items-center gap-2 text-sm text-white">
        <input
          type="checkbox"
          checked={allChecked}
          onChange={(e) => onSelectAll(e.target.checked)}
          className="rounded border-slate-600"
        />
        Select all
      </label>
      <CheckboxList
        keys={Object.keys(labels)}
        sectionId={sectionId}
        merged={merged}
        onToggle={onToggle}
      />
    </div>
  )
}

function CheckboxList({ keys, sectionId, merged, onToggle, indentMacros = false }) {
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
              onChange={(e) => onToggle(sectionId, key, e.target.checked)}
              className="mt-0.5 rounded border-slate-600"
            />
            <span>{labels[key]}</span>
          </label>
        </li>
      ))}
    </ul>
  )
}

function ReportsTree({ merged, onToggle }) {
  const labels = INBOX_PERMISSION_FIELD_LABELS.reports
  const tree = INBOX_PERMISSION_REPORTS_TREE[0]

  return (
    <ul className="space-y-2">
      <li>
        <label className="flex cursor-pointer items-start gap-2 text-sm text-slate-300">
          <input
            type="checkbox"
            checked={Boolean(merged.reports[tree.key])}
            onChange={(e) => onToggle('reports', tree.key, e.target.checked)}
            className="mt-0.5 rounded border-slate-600"
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
                  className="mt-0.5 rounded border-slate-600"
                  disabled={!merged.reports[tree.key]}
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

function RadioGroup({ name, value, onChange, options }) {
  return (
    <ul className="space-y-3">
      {options.map((opt) => (
        <li key={opt.value}>
          <label
            className={`flex cursor-pointer items-start gap-3 text-sm ${
              opt.disabled ? 'cursor-not-allowed text-slate-600' : 'text-slate-300'
            }`}
          >
            <input
              type="radio"
              name={name}
              value={opt.value}
              checked={value === opt.value}
              disabled={opt.disabled}
              onChange={() => !opt.disabled && onChange(opt.value)}
              className="mt-1"
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
