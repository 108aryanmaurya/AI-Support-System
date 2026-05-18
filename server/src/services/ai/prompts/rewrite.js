/**
 * @param {object} params
 * @param {string} params.text
 * @param {string} params.tone
 */
export function buildRewriteMessages({ text, tone }) {
  return [
    {
      role: 'system',
      content: `Rewrite the following support message in a ${tone} tone. Keep the meaning. Output only the rewritten text.`,
    },
    { role: 'user', content: text },
  ];
}
