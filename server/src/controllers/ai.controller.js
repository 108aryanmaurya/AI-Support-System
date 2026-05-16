export function aiHealth(req, res) {
  res.json({ ok: true, scope: 'ai' });
}

export function aiAssist(req, res) {
  const organizationId = req.orgId ?? req.organizationId ?? req.params?.orgId ?? null;
  res.json({
    message: 'AI assist placeholder — wire to your model / RAG pipeline',
    userId: req.user?.id,
    organizationId,
    prompt: req.body?.prompt ?? null,
  });
}
