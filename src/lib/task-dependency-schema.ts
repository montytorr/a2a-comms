import type { DatabaseError as PostgrestError } from '@/lib/db/client';

export function isMissingDependencyTypeColumn(error: PostgrestError | null | undefined) {
  if (!error) return false;
  return error.code === 'PGRST204' || /dependency_type/i.test(error.message || '');
}
