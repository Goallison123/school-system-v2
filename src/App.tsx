import React, { Suspense, useEffect, useState } from 'react';
import { Routes, Route, useNavigate, useLocation, NavLink } from 'react-router-dom';
import JSZip from 'jszip';
import {
  ArrowRight,
  Bell,
  Check,
  ClipboardList,
  Download,
  GalleryHorizontal,
  GraduationCap,
  Inbox,
  LayoutDashboard,
  LogOut,
  Megaphone,
  Settings,
  Users,
  UserCog,
  X,
  LockKeyhole,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { View, Contact, Campaign, Content, Inquiry, WorkspaceSettings } from '@/types';
import { SCHOOL_NAME, AUTH_KEY } from '@/lib/constants';
import { downloadBlob } from '@/utils/helpers';
import Campaigns from '@/pages/Campaigns';
import Contacts from '@/pages/Contacts';
import ContentManager from '@/pages/ContentManager';
import Inquiries from '@/pages/Inquiries';
import Students from '@/pages/Students';
import TeacherStudentRegister from '@/pages/TeacherStudentRegister';
import HeadmasterOverview from '@/pages/HeadmasterOverview';
import UserManagement from '@/pages/UserManagement';
import NotificationModal from '@/components/modals/NotificationModal';
import ContentModal from '@/components/modals/ContentModal';
import SettingsModal from '@/components/modals/SettingsModal';
import HelpModal from '@/components/modals/HelpModal';
import LoginScreen from '@/components/LoginScreen';
import TeacherOverview from '@/pages/TeacherOverview';

const MidTermEngine = React.lazy(() => import('@/pages/MidTermEngine'));

function mapStudentToParentContact(row: Record<string, unknown>): Contact {
  return {
    id: String(row.id),
    parent_name: String(row.parent_name ?? ''),
    student_name: String(row.full_name ?? ''),
    class_name: String(row.class_name ?? ''),
    phone: String(row.phone ?? ''),
    email: String(row.email ?? ''),
    preferred_channel: 'SMS',
    status: 'Active',
    created_at: String(row.created_at ?? ''),
  };
}

type SchoolRole = 'dean_of_studies' | 'headteacher' | 'teacher' | 'it' | 'unknown';

function schoolRoleLabel(role: SchoolRole) {
  return role === 'dean_of_studies' ? 'Dean of Studies'
    : role === 'headteacher' ? 'Headteacher'
      : role === 'teacher' ? 'Teacher'
        : role === 'it' ? 'IT administrator' : 'School staff';
}

function parseSchoolRole(value: unknown): SchoolRole {
  if (typeof value !== 'string') return 'unknown';
  const role = value.trim().toLowerCase().replace(/[ -]+/g, '_');
  return role === 'dean_of_studies' ? 'dean_of_studies'
    : role === 'headteacher' ? 'headteacher'
      : role === 'teacher' ? 'teacher'
        : role === 'it' ? 'it' : 'unknown';
}

function AccessNotice({
  roleName,
  homePath,
  availablePages,
  isUnknownPage = false,
}: {
  roleName: string;
  homePath: string;
  availablePages: { label: string; path: string }[];
  isUnknownPage?: boolean;
}) {
  return (
    <section className="mx-auto max-w-3xl rounded-2xl border border-stone-200 bg-white p-6 shadow-sm sm:p-8">
      <div className="flex items-start gap-4">
        <div className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-amber-50 text-amber-800">
          <LockKeyhole size={22} />
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-amber-800">{isUnknownPage ? 'Page not found' : 'This page isn’t available'}</p>
          <h1 className="mt-1 text-xl font-bold text-stone-900 sm:text-2xl">{isUnknownPage ? 'We couldn’t find that page' : 'Let’s get you to the right place'}</h1>
          <p className="mt-2 text-sm leading-6 text-stone-600">
            {isUnknownPage
              ? 'The page may have moved. Choose one of your available pages below.'
              : `This page isn’t part of your ${roleName} access. You can continue from your home page or choose one of your available pages below.`}
          </p>
        </div>
      </div>
      <div className="mt-6 flex flex-wrap gap-3">
        <NavLink to={homePath} className="inline-flex items-center gap-2 rounded-lg bg-[#3b2314] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#4a2c19]">
          <LayoutDashboard size={16} /> Go to my home
        </NavLink>
        {availablePages.filter((page) => page.path !== homePath).map((page) => (
          <NavLink key={page.path} to={page.path} className="inline-flex items-center gap-2 rounded-lg border border-stone-300 px-4 py-2.5 text-sm font-semibold text-stone-700 hover:bg-stone-50">
            {page.label} <ArrowRight size={15} />
          </NavLink>
        ))}
      </div>
    </section>
  );
}

// initial data is loaded from Supabase at runtime; remove hard-coded seeds so the
// application uses the canonical database source of truth

function App() {
  const [authed, setAuthed] = useState(() => sessionStorage.getItem(AUTH_KEY) === 'true');
  const [user, setUser] = useState<{ id?: string; email?: string | null; full_name?: string | null; role?: string | null } | null>(null);
  const [settings, setSettings] = useState<WorkspaceSettings | null>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [content, setContent] = useState<Content[]>([]);
  const [editingContent, setEditingContent] = useState<Content | null>(null);
  const [inquiries, setInquiries] = useState<Inquiry[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNotification, setShowNotification] = useState(false);
  const [showContentForm, setShowContentForm] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [toast, setToast] = useState('');

  useEffect(() => {
    async function loadData() {
      if (!authed || !user?.role) return;
      if (!supabase) {
        setLoading(false);
        return;
      }
      const deanRole = ['dean_of_studies', 'it'].includes(user.role);
      const headteacherRole = user.role === 'headteacher';
      setLoading(true);
      setContacts([]);
      const [studentsResult, campaignsResult, galleryResult, newsResult, inquiriesResult, settingsResult] = await Promise.all([
        deanRole || headteacherRole
          ? supabase.from('school_students').select('id, parent_name, full_name, class_name, phone, email, created_at').order('created_at', { ascending: false }).limit(5000)
          : Promise.resolve({ data: [] }),
        deanRole || headteacherRole ? supabase.from('notification_campaigns').select('*').order('created_at', { ascending: false }).limit(50) : Promise.resolve({ data: [] }),
        deanRole ? supabase.from('gallery_items').select('*').order('updated_at', { ascending: false }).limit(50) : Promise.resolve({ data: [] }),
        deanRole ? supabase.from('news_items').select('*').order('published_at', { ascending: false }).limit(50) : Promise.resolve({ data: [] }),
        deanRole ? supabase.from('school_inquiries').select('*').order('created_at', { ascending: false }).limit(50) : Promise.resolve({ data: [] }),
        deanRole ? supabase.from('workspace_settings').select('*').limit(1) : Promise.resolve({ data: [] }),
      ]).catch((err) => {
        console.error('Failed to load initial data', err);
        return [ { data: [] }, { data: [] }, { data: [] }, { data: [] }, { data: [] }, { data: [] } ];
      });
      if (deanRole || headteacherRole) setContacts((studentsResult?.data ?? []).map((row) => mapStudentToParentContact(row as unknown as Record<string, unknown>)));
      if (campaignsResult?.data) setCampaigns(campaignsResult.data as Campaign[]);
      if (galleryResult?.data && newsResult?.data) setContent([...(galleryResult.data as Content[]), ...(newsResult.data as Content[])]);
      if (inquiriesResult?.data) setInquiries(inquiriesResult.data as Inquiry[]);
      if (settingsResult?.data?.length) setSettings(settingsResult.data[0] as WorkspaceSettings);
      setLoading(false);
    }
    void loadData();
  }, [authed, user?.role]);

  useEffect(() => {
    if (!supabase || !['dean_of_studies', 'it'].includes(user?.role ?? '')) return;
    const client = supabase;
    const channel = client
      .channel('student-registry-parent-contacts')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'school_students' }, async () => {
        const { data, error } = await client
          .from('school_students')
          .select('id, parent_name, full_name, class_name, phone, email, created_at')
          .order('created_at', { ascending: false })
          .limit(5000);
        if (error) {
          console.error('Failed to refresh parent contacts from student registry', error);
          return;
        }
        setContacts((data ?? []).map((row) => mapStudentToParentContact(row as unknown as Record<string, unknown>)));
      })
      .subscribe();
    return () => { void client.removeChannel(channel); };
  }, [user?.role]);

  useEffect(() => {
    if (!supabase || !['dean_of_studies', 'headteacher', 'it'].includes(user?.role ?? '') || !['/contacts', '/campaigns'].includes(location.pathname)) return;
    let cancelled = false;
    async function refreshRegistryContacts() {
      const { data, error } = await supabase!
        .from('school_students')
        .select('id, parent_name, full_name, class_name, phone, email, created_at')
        .order('created_at', { ascending: false })
        .limit(5000);
      if (cancelled) return;
      if (error) {
        console.error('Failed to refresh contacts from the student registry', error);
        return;
      }
      setContacts((data ?? []).map((row) => mapStudentToParentContact(row as unknown as Record<string, unknown>)));
    }
    void refreshRegistryContacts();
    return () => { cancelled = true; };
  }, [location.pathname, user?.role]);

  function notify(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(''), 2600);
  }

  function LoadingScreen() {
    return (
      <div className="loading-screen">
        <div className="loading-spinner" />
        <p className="loading-label">Loading workspace...</p>
      </div>
    );
  }

  async function saveCampaign(campaign: Omit<Campaign, 'id' | 'created_at'>, dispatch: { fingerprint: string; recipientIds: string[] }) {
    if (!supabase) {
      notify('We couldn’t save this message right now. Please try again later.');
      return;
    }
    if (!(isDean || role === 'headteacher')) {
      notify('Only the Dean or Headteacher can create SMS messages.');
      return;
    }
    const { data: ledger, error: ledgerError } = await supabase.from('sms_campaign_dispatches')
      .insert({ fingerprint: dispatch.fingerprint, recipient_ids: dispatch.recipientIds, created_by: user?.id ?? null })
      .select('id').maybeSingle();
    if (ledgerError || !ledger) {
      if (ledgerError?.code === '23505') {
        notify('This message has already been saved for these parents.');
      } else {
        console.error('Could not save message recipient list', ledgerError);
        notify('We couldn’t save this message. Please try again.');
      }
      return;
    }
    const { data, error } = await supabase.from('notification_campaigns').insert(campaign).select().maybeSingle();
    if (error || !data) {
      console.error('Failed to save campaign', error);
      await supabase.from('sms_campaign_dispatches').delete().eq('id', ledger.id);
      notify('Failed to save notification.');
      return;
    }
    await supabase.from('sms_campaign_dispatches').update({ campaign_id: data.id }).eq('id', ledger.id);
    setCampaigns((items) => [data as Campaign, ...items]);
    setShowNotification(false);
    notify(campaign.status === 'Scheduled' ? 'Message scheduled.' : 'Draft saved. It hasn’t been sent.');
  }

  async function deleteCampaign(id: string) {
    if (!supabase) {
      notify('We couldn’t remove this message right now. Please try again later.');
      return;
    }
    const { error } = await supabase.from('notification_campaigns').delete().eq('id', id).throwOnError();
    if (error) {
      console.error('Failed to delete campaign', error);
      notify('We couldn’t remove this message. Please try again.');
      return;
    }
    setCampaigns((items) => items.filter((item) => item.id !== id));
    notify('Message removed.');
  }

  async function saveContent(item: Omit<Content, 'id' | 'created_at'> & Partial<Pick<Content, 'id'>>) {
    if (!supabase) {
      notify('We couldn’t save this update right now. Please try again later.');
      return;
    }

    const adminName = settings?.admin_name || user?.full_name || user?.email || 'Administrator';
    const payload = {
      ...item,
      author: item.author || adminName,
      image_url: item.image_url || item.image,
      src: item.src || item.image_url || item.image,
      status: item.status ?? 'Draft',
      published_at: item.published_at,
      updated_at: new Date().toISOString(),
    };

    const targetTable = item.content_type === 'Gallery' ? 'gallery_items' : 'news_items';
    const dbData: Record<string, unknown> = item.id
      ? {
          title: payload.title,
          category: payload.category,
          description: payload.description,
          status: payload.status,
          src: payload.src,
          image_url: payload.image_url,
          date: payload.date,
          summary: payload.summary,
          content: payload.content || [],
          author: payload.author,
          read_time: payload.read_time,
          published_at: payload.published_at,
          updated_at: payload.updated_at,
        }
      : item.content_type === 'Gallery'
        ? {
            src: payload.src,
            title: payload.title,
            category: payload.category,
            description: payload.description,
            status: payload.status,
            order: 0,
          }
        : {
            title: payload.title,
            date: payload.date,
            category: payload.category,
            summary: payload.summary,
            content: payload.content || [],
            author: payload.author,
            read_time: payload.read_time,
            image_url: payload.image_url,
            status: payload.status,
            published_at: payload.published_at,
          };

    const query = supabase.from(targetTable);
    const response = item.id
      ? await query.update(dbData).eq('id', item.id).select().maybeSingle()
      : await query.insert(dbData).select().maybeSingle();

    const { data, error } = response;
    if (error || !data) {
      console.error('Failed to save content', error);
      notify('Failed to save content.');
      return;
    }

    setContent((items) => item.id
      ? items.map((existing) => existing.id === item.id ? data as Content : existing)
      : [data as Content, ...items]);
    setEditingContent(null);
    setShowContentForm(false);
    notify(item.id ? 'Website update saved.' : 'Website update added.');
  }

  async function saveSettings(values: { admin_name: string; default_notification_channel: string }) {
    if (!supabase) {
      notify('We couldn’t save your settings right now. Please try again later.');
      return;
    }

    const payload = {
      id: '00000000-0000-0000-0000-000000000001',
      admin_name: values.admin_name,
      default_notification_channel: values.default_notification_channel,
    };
    const { data, error } = await supabase.from('workspace_settings').upsert(payload, { onConflict: 'id' }).select().maybeSingle();
    if (error || !data) {
      console.error('Failed to save settings', error);
      notify('Failed to save settings.');
      return;
    }
    setSettings(data as WorkspaceSettings);
    notify('Settings saved.');
  }

  async function deleteContent(id: string) {
    if (!supabase) {
      notify('We couldn’t remove this update right now. Please try again later.');
      return;
    }

    const galleryDelete = await supabase.from('gallery_items').delete().eq('id', id);
    const newsDelete = await supabase.from('news_items').delete().eq('id', id);
    const error = galleryDelete.error || newsDelete.error;

    if (error) {
      console.error('Failed to delete content', error);
      notify('We couldn’t remove this update. Please try again.');
      return;
    }
    setContent((items) => items.filter((item) => item.id !== id));
    notify('Website update removed.');
  }

  async function publishContent(id: string) {
    if (!supabase) {
      notify('We couldn’t publish this update right now. Please try again later.');
      return;
    }
    const published_at = new Date().toISOString();

    const galleryUpdate = await supabase.from('gallery_items').update({ status: 'Published', updated_at: published_at }).eq('id', id).select().maybeSingle();
    const newsUpdate = await supabase.from('news_items').update({ status: 'Published', published_at }).eq('id', id).select().maybeSingle();
    const data = galleryUpdate.data || newsUpdate.data;
    const error = galleryUpdate.error || newsUpdate.error;

    if (error || !data) {
      console.error('Failed to publish content', error);
      notify('We couldn’t publish this update. Please try again.');
      return;
    }
    setContent((items) => items.map((c) => c.id === id ? data as Content : c));
    notify('Website update published.');
  }

  async function exportContacts(format: 'xls' | 'ods') {
    const headers = ['Parent name', 'Student name', 'Class', 'Phone', 'Email'];
    const rows = contacts.map((contact) => [contact.parent_name, contact.student_name, contact.class_name, contact.phone, contact.email]);
    if (format === 'xls') {
      const table = `<table><tr>${headers.map((header) => `<th>${header}</th>`).join('')}</tr>${rows.map((row) => `<tr>${row.map((value) => `<td>${value}</td>`).join('')}</tr>`).join('')}</table>`;
      downloadBlob(new Blob([`<html><meta charset="utf-8"><body>${table}</body></html>`], { type: 'application/vnd.ms-excel' }), 'gacuba-contacts.xls');
    } else {
      const zip = new JSZip();
      zip.file('mimetype', 'application/vnd.oasis.opendocument.spreadsheet');
      zip.file('content.xml', `<?xml version="1.0" encoding="UTF-8"?><office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"><office:body><office:spreadsheet><table:table table:name="Contacts"><table:table-row>${headers.map((header) => `<table:table-cell office:value-type="string"><text:p>${header}</text:p></table:table-cell>`).join('')}</table:table-row>${rows.map((row) => `<table:table-row>${row.map((value) => `<table:table-cell office:value-type="string"><text:p>${value}</text:p></table:table-cell>`).join('')}</table:table-row>`).join('')}</table:table></office:spreadsheet></office:body></office:document-content>`);
      zip.file('styles.xml', '<?xml version="1.0" encoding="UTF-8"?><office:document-styles xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"><office:styles/></office:document-styles>');
      zip.file('meta.xml', '<?xml version="1.0" encoding="UTF-8"?><office:document-meta xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"/>');
      zip.file('settings.xml', '<?xml version="1.0" encoding="UTF-8"?><office:document-settings xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"/>');
      zip.file('META-INF/manifest.xml', '<?xml version="1.0" encoding="UTF-8"?><manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0"><manifest:file-entry manifest:media-type="application/vnd.oasis.opendocument.spreadsheet" manifest:full-path="/"/><manifest:file-entry manifest:media-type="text/xml" manifest:full-path="content.xml"/></manifest:manifest>');
      downloadBlob(await zip.generateAsync({ type: 'blob' }), 'gacuba-contacts.ods');
    }
    notify(`Contacts exported as ${format.toUpperCase()}.`);
  }

  const navItems: { id: View; label: string; icon: typeof LayoutDashboard; path: string }[] = [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard, path: '/overview' },
    { id: 'students', label: 'Students', icon: GraduationCap, path: '/students' },
    { id: 'midterm', label: 'Mid-term marks', icon: ClipboardList, path: '/midterm' },
    { id: 'users', label: 'Staff roles', icon: UserCog, path: '/users' },
    { id: 'campaigns', label: 'Parent notices', icon: Megaphone, path: '/campaigns' },
    { id: 'contacts', label: 'Parent contacts', icon: Users, path: '/contacts' },
    { id: 'content', label: 'School news', icon: GalleryHorizontal, path: '/content' },
    { id: 'inquiries', label: 'Inquiries', icon: Inbox, path: '/inquiries' },
  ];

  const role = parseSchoolRole(user?.role);
  const isDean = ['dean_of_studies', 'it'].includes(role);
  const allowedPaths = role === 'teacher'
    ? ['/overview', '/midterm', '/students']
    : role === 'headteacher'
      ? ['/overview', '/midterm', '/campaigns']
      : role === 'dean_of_studies'
        ? navItems.filter((item) => item.path !== '/users').map((item) => item.path)
        : role === 'it'
          ? navItems.map((item) => item.path)
        : [];
  const visibleNavItems = navItems.filter((item) => allowedPaths.includes(item.path));
  const homePath = allowedPaths.includes('/overview') ? '/overview' : '/midterm';
  const roleName = schoolRoleLabel(role);
  const restrictedPage = <AccessNotice
    roleName={roleName}
    homePath={homePath}
    availablePages={visibleNavItems.map((item) => ({ label: item.label, path: item.path }))}
  />;

  const overviewElement = role === 'teacher'
    ? <TeacherOverview teacherName={user?.full_name || user?.email || 'Teacher'} onNavigate={(path) => navigate(path)} />
    : <HeadmasterOverview
        contacts={contacts}
        campaigns={campaigns}
        content={content}
        inquiries={inquiries}
        adminName={user?.full_name || settings?.admin_name || user?.email || 'School staff'}
        adminRole={role}
        onNavigate={(view) => navigate(navItems.find((item) => item.id === view)?.path ?? '/overview')}
      />;
  const roleAwareOverview = allowedPaths.includes('/overview') ? overviewElement : restrictedPage;

  async function handleLogin(email: string, password: string): Promise<string | null> {
    if (!supabase) return 'Sign-in is unavailable right now. Please try again later.';
    try {
      const resp = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
      if (resp.error || !resp.data?.user) {
        console.error('Login failed', resp.error);
        return resp.error?.message ?? 'Incorrect email or password. Please try again.';
      }
      sessionStorage.setItem(AUTH_KEY, 'true');
      setAuthed(true);
      const userInfo = resp.data.user;
      const { data: profile, error: profileError } = await supabase.from('users').select('role, full_name').eq('id', userInfo.id).maybeSingle();
      if (profileError || !profile) {
        await supabase.auth.signOut();
        sessionStorage.removeItem(AUTH_KEY);
        setAuthed(false);
        return 'We couldn’t find your school account details. Please ask the school administrator for help.';
      }
      const role = parseSchoolRole(profile.role);
      setUser({
        id: userInfo.id,
        email: userInfo.email ?? undefined,
        full_name: profile.full_name || (typeof userInfo.user_metadata?.full_name === 'string' ? userInfo.user_metadata.full_name : undefined),
        role,
      });
      navigate('/overview');
      return null;
    } catch (err) {
      console.error('Login error', err);
      return 'We couldn’t sign you in. Check your details and try again.';
    }
  }

  function handleLogout() {
    if (supabase) {
      void supabase.auth.signOut().catch((e) => console.warn('Sign out error', e));
    }
    sessionStorage.removeItem(AUTH_KEY);
    setAuthed(false);
    setUser(null);
    navigate('/overview');
  }

  useEffect(() => {
    // if we have an auth session stored, try to restore user info from Supabase
    async function restoreUser() {
      if (!supabase) return;
      try {
        const { data } = await supabase.auth.getUser();
        if (data?.user) {
          const { data: profile } = await supabase.from('users').select('role, full_name').eq('id', data.user.id).maybeSingle();
          if (!profile) {
            sessionStorage.removeItem(AUTH_KEY);
            setAuthed(false);
            return;
          }
          setUser({
            id: data.user.id,
            email: data.user.email ?? undefined,
            full_name: profile.full_name || (typeof data.user.user_metadata?.full_name === 'string' ? data.user.user_metadata.full_name : undefined),
            role: parseSchoolRole(profile.role),
          });
        } else {
          sessionStorage.removeItem(AUTH_KEY);
          setAuthed(false);
        }
      } catch {
        sessionStorage.removeItem(AUTH_KEY);
        setAuthed(false);
      }
    }
    if (sessionStorage.getItem(AUTH_KEY) === 'true') {
      void restoreUser();
    }
  }, []);

  if (!authed) return <LoginScreen onLogin={handleLogin} />;

  if (loading) return <LoadingScreen />;

  const currentNavItem = navItems.find((item) => item.path === (location.pathname === '/' ? '/overview' : location.pathname));
  const currentNavLabel = currentNavItem?.label ?? 'Home';
  const isHomePage = location.pathname === '/' || location.pathname === homePath;

  return (
    <div className="system-shell">
      {/* 1. Top Utility Strip */}
      <div className="top-utility-strip">
        <div className="user-welcome">
          <span>Welcome, <strong>{user?.full_name || user?.email || 'School staff'}</strong> ({SCHOOL_NAME})</span>
        </div>
        <div className="utility-actions">
          {isDean && (
            <button
              type="button"
              onClick={() => exportContacts('xls')}
              className="util-badge-btn util-badge-purple"
              title="Download Excel parent contact list"
            >
              <Download size={12} /> Export Excel
            </button>
          )}
          {(role === 'headteacher' || isDean) && (
            <button
              type="button"
              onClick={() => setShowNotification(true)}
              className="util-badge-btn util-badge-green"
            >
              <Megaphone size={12} /> Send notice
            </button>
          )}
          <button
            type="button"
            onClick={() => setShowNotifications((s) => !s)}
            className="util-badge-btn util-badge-amber"
          >
            <Bell size={12} /> Updates
          </button>
          {isDean && (
            <button
              type="button"
              onClick={() => setShowSettings(true)}
              className="util-badge-btn util-badge-slate"
            >
              <Settings size={12} /> Settings
            </button>
          )}
          <div className="h-4 w-px bg-slate-300 mx-1" />
          <div className="flex items-center gap-1.5 text-xs text-slate-700 font-medium">
            <span className="w-6 h-6 rounded-full bg-[#ffedd5] text-[#ea580c] grid place-items-center font-bold text-[10px]">
              {(user?.full_name || user?.email || 'A')[0].toUpperCase()}
            </span>
            <span>{user?.full_name ?? user?.email ?? 'Administrator'}</span>
            <span className="text-[10px] bg-[#f0f9ff] text-[#0369a1] px-1.5 py-0.5 rounded font-mono">
              {roleName}
            </span>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            className="text-slate-500 hover:text-red-700 ml-2 p-1"
            title="Sign out of portal"
          >
            <LogOut size={15} />
          </button>
        </div>
      </div>

      {/* 2. Institutional Brand Header */}
      <header className="institution-brand-bar">
        <div className="brand-emblem-lockup">
          <img className="brand-crest" src="/assets/school-community.jpg" alt="Students learning together" />
          <div className="brand-titles">
            <h1>{SCHOOL_NAME}</h1>
            <p>School community · Rubavu District, Rwanda</p>
          </div>
        </div>

        <div className="brand-right-tools">
          {allowedPaths.includes('/students') && (
            <button type="button" onClick={() => navigate('/students')} className="ebm-quick-btn">
              <GraduationCap size={15} /> Class register
            </button>
          )}
          {allowedPaths.includes('/inquiries') && (
            <button
              type="button"
              onClick={() => navigate('/inquiries')}
              className="message-counter-badge"
              title="Visitor questions"
            >
              <span>{inquiries.filter((i) => i.status === 'New').length}</span>
              <Inbox size={14} />
            </button>
          )}
        </div>
      </header>

      {/* 3. Primary System Horizontal Navigation Bar (Screenshot 2 Institutional Green) */}
      <nav className="system-nav-bar" aria-label="System navigation">
        {visibleNavItems.map(({ id, label, icon: Icon, path }) => (
          <NavLink
            key={id}
            to={path}
            className={({ isActive }) => `system-nav-tab ${isActive ? 'active' : ''}`}
          >
            <Icon size={15} />
            <span>{label}</span>
            {id === 'inquiries' && inquiries.filter((i) => i.status === 'New').length > 0 && (
              <span className="nav-tab-counter">
                {inquiries.filter((i) => i.status === 'New').length}
              </span>
            )}
          </NavLink>
        ))}
      </nav>

      {/* 4. Breadcrumb navigation */}
      <div className="system-breadcrumb-row">
        <div className="breadcrumb-trail">
          <NavLink to={homePath} className="breadcrumb-home">
            Home
          </NavLink>
          {!isHomePage && (
            <>
              <ArrowRight size={14} className="text-slate-400" aria-hidden="true" />
              <span className="breadcrumb-active">{currentNavLabel}</span>
            </>
          )}
        </div>
      </div>

      {/* 5. Main Content Viewport */}
      <main className="system-viewport">
        <Routes>
          <Route path="/" element={roleAwareOverview} />
          <Route path="/overview" element={roleAwareOverview} />
          <Route path="/students" element={allowedPaths.includes('/students') ? role === 'teacher' ? <TeacherStudentRegister /> : <Students /> : restrictedPage} />
          <Route path="/midterm" element={allowedPaths.includes('/midterm') ? <Suspense fallback={<LoadingScreen />}><MidTermEngine role={role} userId={user?.id} notify={notify} /></Suspense> : restrictedPage} />
          <Route path="/users" element={allowedPaths.includes('/users') ? <UserManagement /> : restrictedPage} />
          <Route path="/campaigns" element={allowedPaths.includes('/campaigns') ? <Campaigns campaigns={campaigns} contacts={contacts} onCompose={() => setShowNotification(true)} onDelete={isDean ? deleteCampaign : () => notify('Only the Dean of Studies can delete past notices.')} notify={notify} /> : restrictedPage} />
          <Route path="/contacts" element={allowedPaths.includes('/contacts') ? <Contacts contacts={contacts} onExport={exportContacts} /> : restrictedPage} />
          <Route path="/content" element={allowedPaths.includes('/content') ? <ContentManager content={content} onAdd={() => { setEditingContent(null); setShowContentForm(true); }} onEdit={(item) => { setEditingContent(item); setShowContentForm(true); }} onDelete={deleteContent} onPublish={publishContent} /> : restrictedPage} />
          <Route path="/inquiries" element={allowedPaths.includes('/inquiries') ? <Inquiries inquiries={inquiries} setInquiries={setInquiries} notify={notify} /> : restrictedPage} />
          <Route path="*" element={<AccessNotice roleName={roleName} homePath={homePath} availablePages={visibleNavItems.map((item) => ({ label: item.label, path: item.path }))} isUnknownPage />} />
        </Routes>
      </main>

      {/* 6. Modals & Notifications */}
      {showNotifications && (
        <div className="modal-overlay" onClick={() => setShowNotifications(false)}>
          <div className="modal-dialog-box max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header-bar">
              <h2>School updates</h2>
              <button type="button" onClick={() => setShowNotifications(false)} className="modal-close-btn">
                <X size={16} />
              </button>
            </div>
            <div className="p-4">
              {campaigns.length ? (
                <ul className="divide-y divide-stone-100">
                  {campaigns.slice(0, 4).map((campaign) => (
                    <li key={campaign.id} className="py-3 first:pt-0 last:pb-0">
                      <strong className="block text-sm text-stone-800">{campaign.title}</strong>
                      <span className="mt-1 block text-xs text-stone-600">{campaign.message}</span>
                      <span className="mt-1 block text-[11px] text-stone-500">{campaign.status}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-stone-600">No updates to show right now.</p>
              )}
            </div>
            <div className="modal-footer-bar">
              <button type="button" onClick={() => setShowNotifications(false)} className="btn-enterprise-cancel">
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {showNotification && (role === 'headteacher' || isDean) && (
        <NotificationModal onClose={() => setShowNotification(false)} onSave={saveCampaign} contacts={contacts} allowReports={isDean} />
      )}
      {showContentForm && (
        <ContentModal initialContent={editingContent ?? undefined} onClose={() => { setShowContentForm(false); setEditingContent(null); }} onSave={saveContent} />
      )}
      {showSettings && (
        <SettingsModal onClose={() => setShowSettings(false)} notify={notify} adminName={settings?.admin_name ?? user?.full_name} defaultChannel={settings?.default_notification_channel} onSave={saveSettings} />
      )}
      {showHelp && <HelpModal onClose={() => setShowHelp(false)} />}

      {/* 7. System Toast */}
      {toast && (
        <div className="system-toast">
          <Check size={16} className="text-emerald-400" />
          <span>{toast}</span>
        </div>
      )}

      {/* 8. Quiet Institutional Footer (Screenshot 1) */}
      <footer className="system-footer">
        All Rights Reserved by G.S Gacuba 2A · Ministry of Education (MINEDUC), Republic of Rwanda.
      </footer>
    </div>
  );
}

export default App;
