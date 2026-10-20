import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;

if (!url || !key) {
  console.error('Please set SUPABASE_URL and SUPABASE_SERVICE_KEY (or SUPABASE_ANON_KEY)');
  process.exit(1);
}

const supabase = createClient(url, key);

async function seed() {
  console.log('Seeding contacts...');
  await supabase.from('school_contacts').upsert([
    { parent_name: 'Mukamana Grace', student_name: 'Kwizera Grace', class_name: 'P6A', phone: '+250788451289', email: 'grace.mukamana@email.com', preferred_channel: 'WhatsApp', status: 'Active' },
    { parent_name: 'Habimana Daniel', student_name: 'Ishimwe Daniel', class_name: 'S3B', phone: '+250788923440', email: 'daniel.habimana@email.com', preferred_channel: 'SMS', status: 'Active' },
    { parent_name: 'Uwase Amina', student_name: 'Inshuti Amina', class_name: 'P5C', phone: '+250788110568', email: 'amina.uwase@email.com', preferred_channel: 'Email', status: 'Active' },
  ]).then(console.log).catch(console.error);

  console.log('Seeding campaigns...');
  await supabase.from('notification_campaigns').upsert([
    { title: 'PTA General Meeting', message: 'Our PTA meeting is Friday at 4pm.', channels: ['SMS','WhatsApp'], recipient_count: 812, status: 'Sent', category: 'Parent notification' },
    { title: 'Term fees reminder', message: 'Term fees are due on 20 May.', channels: ['SMS','Email'], recipient_count: 812, status: 'Scheduled', category: 'Fee reminder' },
  ]).then(console.log).catch(console.error);

  console.log('Skipping seeded published content to preserve live website content.');

  console.log('Seeding inquiries...');
  await supabase.from('school_inquiries').upsert([
    { visitor_name: 'Sarah Williams', email: 'sarah.williams@gmail.com', phone: '+250789123778', topic: 'Admissions', message: 'I would like to learn more about admissions for P1 next term.', status: 'New' },
  ]).then(console.log).catch(console.error);

  console.log('Seeding complete.');
}

seed().catch((err) => { console.error(err); process.exit(1); });
