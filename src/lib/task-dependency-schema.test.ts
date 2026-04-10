import test from 'node:test';
import assert from 'node:assert/strict';
import type { PostgrestError } from '@supabase/supabase-js';
import { isMissingDependencyTypeColumn } from './task-dependency-schema';

test('isMissingDependencyTypeColumn detects schema-cache misses for dependency_type', () => {
  assert.equal(
    isMissingDependencyTypeColumn({ code: 'PGRST204', message: "Could not find the 'dependency_type' column of 'task_dependencies' in the schema cache", details: '', hint: '' } as PostgrestError),
    true
  );

  assert.equal(
    isMissingDependencyTypeColumn({ code: '42703', message: 'column "dependency_type" does not exist', details: '', hint: '' } as PostgrestError),
    true
  );

  assert.equal(
    isMissingDependencyTypeColumn({ code: '23505', message: 'duplicate key value violates unique constraint', details: '', hint: '' } as PostgrestError),
    false
  );

  assert.equal(isMissingDependencyTypeColumn(null), false);
});
