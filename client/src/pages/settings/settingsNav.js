import {
  BarChart3,
  Bot,
  Clock,
  CreditCard,
  List,
  Mail,
  MessageSquare,
  Phone,
  Tag,
  Ticket,
  Timer,
  Users,
  UserSquare2,
} from 'lucide-react'

/**
 * Settings sidebar: top-level sections with collapsible `children`.
 * Mirrors cards on `OrgSettingsHomePage.jsx`.
 *
 * Child fields:
 * - `path` — route under `/org/:orgId/settings/:path`
 * - `permission` — hidden when denied (`can(permission)` false)
 * - `disabled` — shown dimmed, not linked (coming soon)
 * - `icon` — Lucide component for sub-item row
 */
export const settingsNav = [
  { id: 'home', label: 'Home' },
  {
    id: 'workspace',
    label: 'Workspace',
    children: [
      { id: 'general', label: 'General', path: 'general', icon: List },
      {
        id: 'teammates',
        label: 'Teammates',
        path: 'teammates',
        permission: 'team.invite',
        icon: Users,
      },
      { id: 'office-hours', label: 'Office hours', icon: Clock, disabled: true },
    ],
  },
  {
    id: 'subscription',
    label: 'Subscription',
    children: [
      { id: 'billing', label: 'Billing', icon: CreditCard, disabled: true },
      { id: 'usage', label: 'Usage', icon: BarChart3, disabled: true },
    ],
  },
  {
    id: 'inbox',
    label: 'Inbox',
    children: [
      {
        id: 'inboxes',
        label: 'Team inboxes',
        path: 'inboxes',
        permission: 'inboxes.manage',
        icon: Users,
      },
      {
        id: 'assignment',
        label: 'Assignments',
        path: 'assignment',
        permission: 'automation.manage_assignment',
        icon: UserSquare2,
      },
      { id: 'tickets', label: 'Tickets', icon: Ticket, disabled: true },
      { id: 'slas', label: 'SLAs', icon: Timer, disabled: true },
    ],
  },
  {
    id: 'inbox-configuration',
    label: 'Inbox configuration',
    children: [
      {
        id: 'tags',
        label: 'Conversation tags',
        path: 'tags',
        permission: 'ai.manage_settings',
        icon: Tag,
      },
      {
        id: 'lifecycle',
        label: 'Conversation lifecycle',
        path: 'lifecycle',
        permission: 'ai.manage_settings',
        icon: Clock,
      },
    ],
  },
  {
    id: 'ai',
    label: 'AI & Automation',
    children: [
      {
        id: 'ai-settings',
        label: 'AI & Automation',
        path: 'ai',
        permission: 'ai.manage_settings',
        icon: Bot,
      },
      {
        id: 'workflows',
        label: 'Workflow rules',
        path: 'workflows',
        permission: 'ai.manage_workflows',
        icon: Bot,
      },
    ],
  },
  {
    id: 'channels',
    label: 'Channels',
    children: [
      {
        id: 'email',
        label: 'Email',
        path: 'email',
        permission: 'channels.manage_email',
        icon: Mail,
      },
      {
        id: 'messenger',
        label: 'Messenger',
        path: 'widget',
        permission: 'widget.view',
        icon: MessageSquare,
      },
      { id: 'chat-social', label: 'Chat & social', icon: MessageSquare, disabled: true },
      { id: 'phone-sms', label: 'Phone & SMS', icon: Phone, disabled: true },
    ],
  },
]

/** @param {typeof settingsNav[number]['children'][number]} child */
export function settingsNavChildVisible(child, can) {
  if (child.permission && !can(child.permission)) return false
  return true
}

/** @param {typeof settingsNav[number]} section */
export function settingsNavSectionVisible(section, can) {
  if (!section.children?.length) return true
  return section.children.some((child) => settingsNavChildVisible(child, can))
}

/**
 * @param {typeof settingsNav} nav
 * @param {(perm: string) => boolean} can
 */
export function filterSettingsNav(nav, can) {
  return nav
    .filter((section) => settingsNavSectionVisible(section, can))
    .map((section) => {
      if (!section.children) return section
      return {
        ...section,
        children: section.children.filter((child) => settingsNavChildVisible(child, can)),
      }
    })
}

/**
 * @param {string} orgId
 * @param {string} pathname
 * @param {string} childPath
 */
export function settingsChildPathActive(orgId, pathname, childPath) {
  if (!childPath) return false
  const base = `/org/${orgId}/settings/${childPath}`
  return pathname === base || pathname.startsWith(`${base}/`)
}

/**
 * @param {string} orgId
 * @param {string} pathname
 * @param {typeof settingsNav[number]} section
 */
export function settingsSectionHasActiveChild(orgId, pathname, section) {
  if (!section.children) return false
  return section.children.some(
    (child) => child.path && settingsChildPathActive(orgId, pathname, child.path),
  )
}
