import { Megaphone, CalendarClock, CreditCard, GraduationCap, Siren } from 'lucide-react';

export const SCHOOL_NAME = 'G.S Gacuba 2A';
export const SCHOOL_INITIAL = 'G';
export const AUTH_KEY = 'gacuba_admin_auth';

export const galleryImages = [
  'https://images.pexels.com/photos/37898351/pexels-photo-37898351.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
  'https://images.pexels.com/photos/34211747/pexels-photo-34211747.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
  'https://images.pexels.com/photos/7396387/pexels-photo-7396387.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
];

export const CATEGORIES = [
  { id: 'Parent notification', label: 'Parent notification', icon: Megaphone, tone: 'sky' },
  { id: 'Attendance alert', label: 'Attendance alert', icon: CalendarClock, tone: 'brown' },
  { id: 'Fee reminder', label: 'Fee reminder', icon: CreditCard, tone: 'brown' },
  { id: 'Examination result', label: 'Examination result', icon: GraduationCap, tone: 'sky' },
  { id: 'Emergency announcement', label: 'Emergency announcement', icon: Siren, tone: 'red' },
] as const;

export function categoryMeta(id: string) {
  return CATEGORIES.find((c) => c.id === id) ?? CATEGORIES[0];
}
