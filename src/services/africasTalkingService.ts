import { supabase } from '@/lib/supabase';

export type SMStatus = 'Success' | 'Queued' | 'Failed';

export interface SMSRecipientResult {
  number: string;
  status: SMStatus;
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

interface SendSmsResponse extends SMSDispatchResult {}

// Rwanda: 078, 079, 072, 073 -> +250
const RW_LOCAL_PREFIX = /^(78|79|72|73)/;
const RW_PREFIXES = ['250', '0'];

export function formatRwandaPhone(raw: string): string {
  if (!raw) return '';
  
  const input = raw.trim();
  const digits = input.replace(/\D/g, '');

  if (!digits) return '';

  if (digits.startsWith('250') && digits.length === 12) {
    return `+${digits}`;
  }

  if (digits.startsWith('0') && digits.length === 10) {
    return `+250${digits.slice(1)}`;
  }

  if (digits.length === 9 && RW_LOCAL_PREFIX.test(digits)) {
    return `+250${digits}`;
  }

  if (input.startsWith('+')) return input;

  return `+${digits}`;
}

export function calculateSMSCost(recipientCount: number, messageLength: number) {
  const segments = Math.max(1, Math.ceil(messageLength / 160));
  const costPerSegment = 12;

  return {
    segments,
    estimatedCostRwf: recipientCount * segments * costPerSegment,
  };
}

export async function sendAfricasTalkingBulkSMS(options: {
  to: string[];
  message: string;
  campaignId?: string;
}): Promise<SMSDispatchResult> {
  if (!supabase) {
    throw new Error('Supabase client not initialized');
  }

  const numbers = [...new Set(
    options.to.map(formatRwandaPhone).filter((n) => /^\+250\d{9}$/.test(n))
  )];

  if (numbers.length === 0) {
    throw new Error('No valid recipients');
  }

  const message = options.message.trim();

  if (!message) {
    throw new Error('Message body required');
  }

  if (message.length > 1600) {
    throw new Error('Message exceeds 1600 characters');
  }

  const { data, error } = await supabase.functions.invoke<SendSmsResponse>('send-sms', {
    body: {
      to: numbers,
      message,
      campaign_id: options.campaignId,
    },
  });

  if (error) {
    let message = error.message;

    if (error.context instanceof Response) {
      try {
        const body = (await error.context.json()) as { error?: string };
        if (body.error) message = body.error;
      } catch {
        // ignore json parse error
      }
    }

    throw new Error(message);
  }

  if (!data) {
    throw new Error('Empty response from SMS provider');
  }

  if (!data.success) {
    const failed = data.recipients.filter((r) => r.status === 'Failed').length;
    throw new Error(failed > 0 ? `Delivery failed for ${failed} recipient(s)` : data.message);
  }

  return {
    success: data.success,
    message: data.message,
    totalCost: data.totalCost,
    recipients: data.recipients,
  };
}