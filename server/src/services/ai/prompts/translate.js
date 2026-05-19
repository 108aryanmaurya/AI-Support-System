import { PROMPT_INJECTION_SYSTEM_RULES, wrapUntrustedContext } from '../utils/promptInjection.js';

/**
 * @param {object} params
 * @param {string} params.text
 * @param {string} params.targetLanguage
 */
export function buildTranslateMessages({ text, targetLanguage }) {
  const wrapped = wrapUntrustedContext('agent_draft', text);

  return [
    {
      role: 'system',
      content: [
        `Translate the text inside UNTRUSTED_CONTEXT to ${targetLanguage}.`,
        'Output only the translation — no preamble.',
        'Do not add refund promises or speak as the company.',
        PROMPT_INJECTION_SYSTEM_RULES,
      ].join(' '),
    },
    {
      role: 'user',
      content: `${wrapped}\n\nTask: Output only the translation.`,
    },
  ];
}
