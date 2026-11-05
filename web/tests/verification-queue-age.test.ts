import { it, expect } from 'vitest';
import { verificationQueueAge } from '@/features/moderation/queue-age';

const submitted = '2026-10-23T00:00:00.000Z';
for (const [label, now, expected] of [
  ['new request', submitted, { waitingHours: 0, overdue: false }],
  ['partial hour', '2026-10-23T00:59:59.999Z', { waitingHours: 0, overdue: false }],
  ['one whole hour', '2026-10-23T01:00:00.000Z', { waitingHours: 1, overdue: false }],
  ['just under 36 hours', '2026-10-24T11:59:59.999Z', { waitingHours: 35, overdue: false }],
  ['exactly 36 hours is not overdue', '2026-10-24T12:00:00.000Z', { waitingHours: 36, overdue: false }],
  ['one millisecond over 36 hours', '2026-10-24T12:00:00.001Z', { waitingHours: 36, overdue: true }],
  ['several days', '2026-10-26T08:30:00.000Z', { waitingHours: 80, overdue: true }],
  ['future submission clamps to zero', '2026-10-22T23:59:59.999Z', { waitingHours: 0, overdue: false }],
] as const) {
  it(label, () => expect(verificationQueueAge(submitted, now)).toEqual(expected));
}
it('invalid timestamps fail visibly instead of showing a false age', () => {
  expect(() => verificationQueueAge('invalid', submitted)).toThrow();
  expect(() => verificationQueueAge(submitted, 'invalid')).toThrow();
});
