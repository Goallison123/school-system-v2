export type View = 'overview' | 'students' | 'midterm' | 'users' | 'campaigns' | 'contacts' | 'content' | 'inquiries';

export type Contact = {
  id: string;
  parent_name: string;
  student_name: string;
  class_name: string;
  phone: string;
  email: string;
  preferred_channel: string;
  status: string;
  created_at: string;
};

export type Campaign = {
  id: string;
  title: string;
  message: string;
  channels: string[];
  recipient_count: number;
  status: string;
  category: string;
  scheduled_for?: string;
  created_at: string;
};

export type WorkspaceSettings = {
  id: string;
  admin_name: string;
  default_notification_channel: string;
  created_at?: string;
  updated_at?: string;
};

export type BannerAlert = {
  id: string;
  title: string;
  message: string;
  severity: 'info' | 'warning' | 'critical';
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type Content = {
  id: string;
  title: string;
  content_type: 'News' | 'Announcement' | 'Gallery';
  excerpt: string;
  image_url?: string;
  src?: string;
  date?: string;
  category?: string;
  description?: string;
  summary?: string;
  content?: string[];
  author?: string;
  read_time?: string;
  image?: string;
  status: string;
  published_at?: string;
  updated_at?: string;
  created_at: string;
};

export type Inquiry = {
  id: string;
  visitor_name: string;
  email: string;
  phone?: string;
  topic?: string;
  message: string;
  status: string;
  created_at: string;
};
