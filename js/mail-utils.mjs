export const DEFAULT_FROM_EMAIL = 'no-reply@consulting-ad.com';
export const DEFAULT_REPLY_TO_EMAIL = 'no-reply@consulting-ad.com';

function normalizeEmailValue(value) {
    if (typeof value !== 'string') return '';
    return value.trim();
}

function isValidEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function normalizeRecipients(rawRecipients = []) {
    const recipients = (rawRecipients || [])
        .map(normalizeEmailValue)
        .filter(Boolean)
        .filter(isValidEmail);

    return [...new Set(recipients)];
}

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

export function buildMailPayload(reminder, options = {}) {
    const recipients = normalizeRecipients([
        ...(options.recipients || []),
        reminder?.primaryEmail,
        reminder?.secondaryEmail
    ]);

    if (recipients.length === 0) {
        throw new Error('Brak prawidłowego adresu e-mail odbiorcy w tym przypomnieniu.');
    }

    const fromAddress = options.fromEmail || DEFAULT_FROM_EMAIL;
    const replyToAddress = options.replyToEmail || DEFAULT_REPLY_TO_EMAIL;
    const expiryDateValue = options.expiryDate || reminder?.expiryDate;
    const expiryDate = expiryDateValue instanceof Date
        ? expiryDateValue
        : typeof expiryDateValue?.toDate === 'function'
            ? expiryDateValue.toDate()
            : new Date(expiryDateValue || Date.now());

    const formattedDate = Number.isNaN(expiryDate.getTime())
        ? 'brak danych'
        : expiryDate.toLocaleDateString('pl-PL');

    const title = escapeHtml(reminder?.title || 'TaskAlert');
    const categoryName = escapeHtml(reminder?.categoryName || 'Brak');
    const notes = reminder?.notes ? escapeHtml(reminder.notes) : '';
    const typeLabel = reminder?.subTypeLabel ? escapeHtml(reminder.subTypeLabel) : '';
    const subject = options.subject || `⏰ TaskAlert: ${reminder?.title || 'Przypomnienie'} — termin: ${formattedDate}`;
    const textBody = [
        `${reminder?.title || 'TaskAlert'}`,
        `Termin: ${formattedDate}`,
        `Kategoria: ${reminder?.categoryName || 'Brak'}`,
        reminder?.notes ? `Uwagi: ${reminder.notes}` : ''
    ].filter(Boolean).join('\n');

    const htmlBody = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: linear-gradient(135deg, #4f8cff, #7c3aed); padding: 24px; border-radius: 12px 12px 0 0;">
                <h1 style="color: #fff; margin: 0; font-size: 22px;">🔔 TaskAlert — Przypomnienie</h1>
            </div>
            <div style="background: #f8f9fa; padding: 24px; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 12px 12px;">
                <h2 style="margin: 0 0 8px; color: #1a1f2e;">${title}</h2>
                <p style="color: #64748b; margin: 0 0 16px;">Kategoria: ${categoryName}</p>
                <div style="background: #fff; padding: 16px; border-radius: 8px; border: 1px solid #e2e8f0;">
                    <p style="margin: 0 0 8px; color: #1a1f2e;"><strong>📅 Data wygaśnięcia:</strong> ${formattedDate}</p>
                    ${typeLabel ? `<p style="margin: 0 0 8px; color: #64748b;"><strong>Typ:</strong> ${typeLabel}</p>` : ''}
                    ${notes ? `<p style="margin: 12px 0 0; color: #64748b;">📝 ${notes}</p>` : ''}
                </div>
                <p style="color: #94a3b8; font-size: 12px; margin: 16px 0 0;">Wysłano automatycznie przez system TaskAlert z adresu ${fromAddress}</p>
            </div>
        </div>`;

    return {
        to: recipients,
        message: {
            from: fromAddress,
            replyTo: replyToAddress,
            subject,
            text: textBody,
            html: htmlBody
        }
    };
}
