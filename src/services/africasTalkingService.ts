import { supabase } from '@/lib/supabase';

export interface SMSRecipientResult {
  number: string;
  status: 'Success' | 'Queued' | 'Failed';
  statusCode: number;
  cost: string;
  messageId: string;
}

export interface SMSDispatchResult {
  success: boolean;
  message: string;
  totalCost: string;
  recipients: SMSRecipientResult[];
}

interface SendSmsResponse {
  success: boolean;
  message: string;
  totalCost: string;
  recipients: SMSRecipientResult[];
}

/**
 * Normalizes Rwandan phone numbers to international format (+2507...).
 */
export function formatRwandaPhone(raw: string): string {
  if (!raw) return '';
  const clean = raw.trim();
  const digits = clean.replace(/\D/g, '');

  if (digits.startsWith('250') && digits.length === 12) return `+${digits}`;
  if (digits.startsWith('0') && digits.length === 10) return `+250${digits.slice(1)}`;
  if (digits.length === 9 && /^(78|79|72|73)/.test(digits)) return `+250${digits}`;
  if (clean.startsWith('+')) return clean;
  return digits ? `+${digits}` : '';
}

/**
 * Calculate an estimated SMS cost in RWF (about 12 RWF per 160-character segment).
 */
export function calculateSMSCost(recipientCount: number, messageLength: number): {
  segments: number;
  estimatedCostRwf: number;
} {
  const segments = Math.max(1, Math.ceil(messageLength / 160));
  return {
    segments,
    estimatedCostRwf: recipientCount * segments * 12,
  };
}

export async function sendAfricasTalkingBulkSMS(options: {
  to: string[];
  message: string;
}): Promise<SMSDispatchResult> {
  if (!supabase) {
    throw new Error('SMS sending is unavailable until the school server is connected.');
  }

  const formattedNumbers = [...new Set(options.to.map(formatRwandaPhone).filter((phone) => phone.length >= 10))];
  if (formattedNumbers.length === 0) {
    throw new Error('Add at least one valid phone number, including its country code.');
  }
  if (!options.message.trim()) {
    throw new Error('Write a message before sending.');
  }

  const { data, error } = await supabase.functions.invoke<SendSmsResponse>('send-sms', {
    body: { to: formattedNumbers, message: options.message.trim() },
  });

  if (error) {
    let errorMessage = error.message;
    if (error.context instanceof Response) {
      try {
        const responseBody = await error.context.json() as { error?: string };
        errorMessage = responseBody.error || errorMessage;
      } catch {
        // Keep the function client's error message when the response has no JSON body.
      }
    }
    throw new Error(errorMessage || 'We couldn’t send the text message. Please try again.');
  }

  if (!data) {
    throw new Error('The school server returned no delivery result. Please try again.');
  }
  if (!data.success) {
    const failedCount = data.recipients.filter((recipient) => recipient.status === 'Failed').length;
    throw new Error(`${data.message || 'The SMS service could not send all messages.'} ${failedCount} recipient(s) were not accepted.`);
  }

  return data;
}
