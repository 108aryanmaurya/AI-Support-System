/**
 * @param {object} params
 * @param {string} params.text
 * @param {string} params.targetLanguage
 */
export function buildTranslateMessages({ text, targetLanguage }) {
  return [
    {
      role: 'system',
      content: `Translate the following text to ${targetLanguage}. Output only the translation.`,
    },
    { role: 'user', content: text },
  ];
}
