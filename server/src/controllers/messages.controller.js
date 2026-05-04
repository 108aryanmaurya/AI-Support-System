export function listMessages(req, res) {
  res.json({
    message: 'Messages API placeholder',
    ticketId: req.params.ticketId,
    messages: [],
    userId: req.user?.id,
  });
}

export function createMessage(req, res) {
  res.status(201).json({
    message: 'Create message placeholder',
    ticketId: req.params.ticketId,
    userId: req.user?.id,
    body: req.body,
  });
}
