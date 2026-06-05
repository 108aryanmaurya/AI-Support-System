import { useState } from 'react';
import {
  MessengerAccordionSection,
  MessengerSavingIndicator,
  MessengerSegmentedControl,
  MessengerSettingsRow,
} from './MessengerSettingsUi.jsx';

const VISITOR_ROWS = [
  {
    key: 'visitorsAllowStartConversation',
    label: 'Let visitors start a conversation',
    showDisplayConditions: true,
  },
  {
    key: 'visitorsPreventMultipleConversations',
    label: 'Prevent visitors from having multiple inbound conversations',
  },
  {
    key: 'visitorsRequireSearchBeforeStart',
    label: 'Require visitors to search before starting a conversation',
    helpText: 'Visitors must search your Help Center before they can message you.',
    comingSoon: true,
  },
  {
    key: 'visitorsAllowStartAfterHelpReaction',
    label: 'Let visitors start a conversation after a ☹️ reaction in Help articles',
    helpText: 'Offer chat when a visitor reacts negatively to a help article.',
    comingSoon: true,
  },
  {
    key: 'visitorsPreventReplyClosedConversations',
    label: 'Prevent visitors replying to closed conversations',
  },
  {
    key: 'visitorsPreventReplyClosedTickets',
    label: 'Prevent visitors replying to closed tickets',
    comingSoon: true,
  },
];

const USER_ROWS = [
  {
    key: 'usersAllowStartConversation',
    label: 'Let users start a conversation',
    showDisplayConditions: true,
  },
  {
    key: 'usersPreventMultipleConversations',
    label: 'Prevent users from having multiple inbound conversations',
  },
  {
    key: 'usersRequireSearchBeforeStart',
    label: 'Require users to search before starting a conversation',
    helpText: 'Users must search your Help Center before they can message you.',
    comingSoon: true,
  },
  {
    key: 'usersAllowStartAfterHelpReaction',
    label: 'Let users start a conversation after a ☹️ reaction in Help articles',
    helpText: 'Offer chat when a user reacts negatively to a help article.',
    comingSoon: true,
  },
  {
    key: 'usersPreventReplyClosedConversations',
    label: 'Prevent users replying to closed conversations',
  },
  {
    key: 'usersPreventReplyClosedTickets',
    label: 'Prevent users replying to closed tickets',
    comingSoon: true,
  },
];

export default function ControlInboundVolumeSection({
  settings,
  onToggle,
  saving = false,
  readOnly = false,
}) {
  const [audience, setAudience] = useState('visitors');
  const rows = audience === 'visitors' ? VISITOR_ROWS : USER_ROWS;

  return (
    <MessengerAccordionSection title="Control inbound volume">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <MessengerSegmentedControl
          value={audience}
          onChange={setAudience}
          options={[
            { id: 'visitors', label: 'Visitors' },
            { id: 'users', label: 'Users' },
          ]}
        />
        <MessengerSavingIndicator saving={saving} />
      </div>

      <div>
        {rows.map((row) => (
          <MessengerSettingsRow
            key={row.key}
            label={row.label}
            checked={Boolean(settings?.[row.key])}
            onChange={(next) => onToggle(row.key, next)}
            disabled={readOnly}
            helpText={row.helpText}
            comingSoon={row.comingSoon}
          >
            {row.showDisplayConditions && settings?.[row.key] && !row.comingSoon ? (
              <button
                type="button"
                className="mt-2 text-sm font-medium text-[#ff7a59] hover:underline"
                onClick={() => {
                  // Display conditions UI — future sprint
                }}
              >
                + Add display conditions
              </button>
            ) : null}
          </MessengerSettingsRow>
        ))}
      </div>
    </MessengerAccordionSection>
  );
}
