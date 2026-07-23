const assert = require('node:assert/strict');

(async () => {
  const { buildMailPayload, DEFAULT_FROM_EMAIL } = await import('../js/mail-utils.mjs');
  const reminder = {
    title: 'Polisa OC',
    categoryName: 'Samochody',
    primaryEmail: 'user@example.com',
    secondaryEmail: '   ',
    expiryDate: new Date('2026-08-10T00:00:00.000Z'),
    notes: 'Do uzupełnienia'
  };

  const payload = buildMailPayload(reminder);

  assert.equal(payload.to[0], 'user@example.com');
  assert.equal(payload.message.from, DEFAULT_FROM_EMAIL);
  assert.equal(payload.message.replyTo, DEFAULT_FROM_EMAIL);
  assert.match(payload.message.subject, /Polisa OC/);
  assert.match(payload.message.html, /TaskAlert/);
  console.log('mail-utils test passed');
})();
