/* eslint-disable @typescript-eslint/no-explicit-any */
import { hash } from 'bcryptjs';
import { admin, pool } from '@/lib/db/client';
import { sessionUser } from '@/lib/auth/session';

type NewUser = {
  email: string;
  password: string;
  email_confirm?: boolean;
  user_metadata?: Record<string, unknown>;
};

const authAdmin = {
  async getUserById(id: string): Promise<{ data: { user: any }; error: Error | null }> {
    const { rows } = await pool().query(
      'select id, email, created_at, updated_at from app_users where id = $1 and deleted_at is null limit 1',
      [id],
    );
    return { data: { user: rows[0] ?? null }, error: null };
  },
  async createUser(input: NewUser) {
    try {
      const encrypted = await hash(input.password, 12);
      const { rows } = await pool().query(
        `insert into app_users (email, encrypted_password, raw_user_meta_data)
         values ($1, $2, $3) returning id, email, created_at, updated_at`,
        [input.email.trim().toLowerCase(), encrypted, input.user_metadata ?? {}],
      );
      return { data: { user: rows[0] }, error: null };
    } catch (error) {
      return { data: { user: null }, error: error as Error };
    }
  },
  async deleteUser(id: string) {
    try {
      await pool().query('delete from app_users where id = $1', [id]);
      return { data: {}, error: null };
    } catch (error) {
      return { data: null, error: error as Error };
    }
  },
};

export function createServerClient() {
  return Object.assign(admin(), { auth: { admin: authAdmin } });
}

export function createAuthClient() {
  return {
    auth: {
      async getUser() {
        return { data: { user: await sessionUser() }, error: null };
      },
    },
  };
}
