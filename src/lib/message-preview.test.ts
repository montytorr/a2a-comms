import test from 'node:test';
import assert from 'node:assert/strict';
import { extractMessagePreview } from './message-preview';

test('message previews use authored Markdown instead of generic field labels', () => {
  assert.equal(
    extractMessagePreview({ markdown: '## Review withheld\\n\\nTwo actionable findings.' }),
    '## Review withheld\n\nTwo actionable findings.',
  );
});
