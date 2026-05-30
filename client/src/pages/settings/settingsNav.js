/** Settings sidebar entries; `permission` hides link when capability is false. */
export const settingsNav = [
  { id: 'home', label: 'Home', chevron: false },
  { id: 'workspace', label: 'Workspace', chevron: true },
  { id: 'subscription', label: 'Subscription', chevron: true },
  { id: 'channels', label: 'Channels', path: 'email', chevron: true, permission: 'channels.manage_email' },
  { id: 'inbox', label: 'Inbox', path: 'inboxes', chevron: true, permission: 'inboxes.manage' },
  { id: 'lifecycle', label: 'Conversation lifecycle', path: 'lifecycle', chevron: true, permission: 'ai.manage_settings' },
  { id: 'tags', label: 'Conversation tags', path: 'tags', chevron: true, permission: 'ai.manage_settings' },
  { id: 'assignment', label: 'Assignment', path: 'assignment', chevron: true, permission: 'automation.manage_assignment' },
  { id: 'ai', label: 'AI & Automation', path: 'ai', chevron: true, permission: 'ai.manage_settings' },
  { id: 'integrations', label: 'Integrations', chevron: true },
  { id: 'data', label: 'Data', chevron: true },
  { id: 'help', label: 'Help Center', chevron: true },
  { id: 'outbound', label: 'Outbound', chevron: true },
  { id: 'personal', label: 'Personal', chevron: true },
]
