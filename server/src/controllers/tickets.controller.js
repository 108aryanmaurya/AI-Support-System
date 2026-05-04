export function listTickets(req, res) {
  res.json({
    message: 'Tickets API placeholder',
    tickets: [],
    userId: req.user?.id,
  });
}

export function getTicket(req, res) {
  res.json({
    message: 'Get ticket placeholder',
    id: req.params.id,
    userId: req.user?.id,
  });
}

export function createTicket(req, res) {
  res.status(201).json({
    message: 'Create ticket placeholder',
    userId: req.user?.id,
    body: req.body,
  });
}
