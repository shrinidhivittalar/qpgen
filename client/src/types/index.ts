export type Role = 'teacher' | 'hod' | 'principal' | 'student';

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  department?: string | null;
}

export interface AuthResponse {
  user: User;
  accessToken: string;
}

export interface RegisterData {
  name: string;
  email: string;
  password: string;
  role: Role;
  department?: string;
}
