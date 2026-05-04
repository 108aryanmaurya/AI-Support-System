export function aiHealth(req, res) {
  res.json({ ok: true, scope: 'ai' });
}

export function aiAssist(req, res) {
  res.json({
    message: 'AI assist placeholder — wire to your model / RAG pipeline',
    userId: req.user?.id,
    prompt: req.body?.prompt ?? null,
  });
}
