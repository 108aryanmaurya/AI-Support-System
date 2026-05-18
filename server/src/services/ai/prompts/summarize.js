/**
 * @param {object} params
 * @param {string} params.conversationBlock
 * @param {'short' | 'detailed' | 'timeline'} [params.type]
 */
export function buildSummarizeMessages({ conversationBlock, type = 'detailed' }) {
  let schemaHint;
  if (type === 'short') {
    schemaHint =
      '{"summary":{"issue":"string","current_status":"string"}}';
  } else if (type === 'timeline') {
    schemaHint =
      '{"summary":{"events":[{"when":"string","what":"string"}]}}';
  } else {
    schemaHint =
      '{"summary":{"issue":"string","actions_taken":["string"],"current_status":"string"}}';
  }

  const system = [
    'You summarize support conversations for the agent.',
    'Use only facts from the thread. Do not invent details.',
    `Summary type: ${type}.`,
    'Respond with a single JSON object only, no markdown fences.',
    `Schema: ${schemaHint}`,
  ].join(' ');

  return [
    { role: 'system', content: system },
    { role: 'user', content: `${conversationBlock}\n\nProduce the summary JSON.` },
  ];
}
