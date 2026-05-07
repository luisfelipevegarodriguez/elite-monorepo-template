export type User = {
  id: string;
  email: string;
  name: string | null;
  createdAt: Date;
};

export type Session = {
  id: string;
  userId: string;
  token: string;
  expiresAt: Date;
};
