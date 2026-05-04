export const API_PREFIX: string;

/** Ticket entity shared between client and API */
export interface Ticket {
  id: string;
  subject: string;
  status: 'open' | 'pending' | 'resolved' | 'closed';
  created_at: string;
  updated_at: string;
  user_id: string;
}

export interface Message {
  id: string;
  ticket_id: string;
  body: string;
  author_id: string;
  created_at: string;
  role: 'user' | 'agent' | 'system';
}
