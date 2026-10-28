export interface SessionUser {
  sessionId: string;
  userId: number;
  glpiUserId: number;
  username: string;
  nome?: string | null;
  role: string;
  ambiente: string;
  glpiUrl: string;
  glpiSessionToken: string;
  csrfToken: string;
}
