import { PROMPT_INJECTION_SYSTEM_RULES, wrapUntrustedContext } from '../utils/promptInjection.js';

/**
 * @param {object} params
 * @param {string} params.text
 * @param {string} params.tone
 */
export function buildRewriteMessages({ text, tone }) {
  const wrapped = wrapUntrustedContext('agent_draft', text);

  return [
    {
      role: 'system',
      content: [
        `Rewrite the message inside UNTRUSTED_CONTEXT in a ${tone} tone.`,
        'Keep the meaning. Output only the rewritten text.',
        'Do not promise refunds or speak as the company.',
        PROMPT_INJECTION_SYSTEM_RULES,
      ].join(' '),
    },
    {
      role: 'user',
      content: `${wrapped}\n\nTask: Output only the rewritten text.`,
    },
  ];
}
