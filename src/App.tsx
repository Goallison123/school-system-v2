import React, { Suspense, useEffect, useState } from "react";
import {
  Routes,
  Route,
  useNavigate,
  useLocation,
  NavLink,
} from "react-router-dom";
import JSZip from "jszip";
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
  Menu,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import type {
  View,
  Contact,
  Campaign,
  Content,
  Inquiry,
  WorkspaceSettings,
} from "@/types";
import { SCHOOL_NAME, AUTH_KEY } from "@/lib/constants";
import { downloadBlob } from "@/utils/helpers";
import Campaigns from "@/pages/Campaigns";
import Contacts from "@/pages/Contacts";
import ContentManager from "@/pages/ContentManager";
import Inquiries from "@/pages/Inquiries";
import Students from "@/pages/Students";
import TeacherStudentRegister from "@/pages/TeacherStudentRegister";
import HeadmasterOverview from "@/pages/HeadmasterOverview";
import UserManagement from "@/pages/UserManagement";
import NotificationModal from "@/components/modals/NotificationModal";
import ContentModal from "@/components/modals/ContentModal";
import SettingsModal from "@/components/modals/SettingsModal";
import HelpModal from "@/components/modals/HelpModal";
import LoginScreen from "@/components/auth/LoginScreen";
import TeacherOverview from "@/pages/TeacherOverview";
import ReportNotFound from "@/pages/ReportNotFound";
import MaintenanceBanner, {
  MAINTENANCE_MODE,
} from "./layout/MaintenanceBanner";
import ForgotPassword from "@/components/auth/ForgotPassword";

// false = hides News + Gallery + Inquiries

const ENABLE_CONTENT_PAGES = false;

const MidTermEngine = React.lazy(() => import("@/pages/MidTermEngine"));

function mapStudentToParentContact(row: Record<string, unknown>): Contact {
  return {
    id: String(row.id),
    parent_name: String(row.parent_name ?? ""),
    student_name: String(row.full_name ?? ""),
    class_name: String(row.class_name ?? ""),
    phone: String(row.phone ?? ""),
    email: String(row.email ?? ""),
    preferred_channel: "SMS",
    status: "Active",
    created_at: String(row.created_at ?? ""),
    fee_amount: Number(row.fee_amount ?? 0),
  };
}

type SchoolRole =
  | "dean_of_studies"
  | "headteacher"
  | "teacher"
  | "it"
  | "unknown";

function schoolRoleLabel(role: SchoolRole) {
  if (role === "dean_of_studies") return "Dean of Studies";
  if (role === "headteacher") return "Headteacher";
  if (role === "teacher") return "Teacher";
  if (role === "it") return "IT Administrator";
  return "School staff";
}

function parseSchoolRole(value: unknown): SchoolRole {
  if (typeof value !== "string") return "unknown";
  const role = value.trim().toLowerCase().replace(/[ -]+/g, "_");
  if (["dean_of_studies", "headteacher", "teacher", "it"].includes(role))
    return role as SchoolRole;
  return "unknown";
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
        <div className="grid h-12 w-12 place-items-center rounded-full bg-amber-50 text-amber-800">
          <LockKeyhole size={22} />
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-amber-800">
            {isUnknownPage ? "Page not found" : "Access restricted"}
          </p>
          <h1 className="mt-1 text-xl font-bold text-stone-900 sm:text-2xl">
            {isUnknownPage ? "Page not found" : "Access restricted"}
          </h1>
          <p className="mt-2 text-sm leading-6 text-stone-600">
            {isUnknownPage
              ? "This page does not exist. Please use your available pages."
              : `This page is not available for ${roleName}. Continue from your home page.`}
          </p>
        </div>
      </div>
      <div className="mt-6 flex flex-wrap gap-3">
        <NavLink
          to={homePath}
          className="inline-flex items-center gap-2 rounded-lg bg-[#3b2314] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#4a2c19]"
        >
          <LayoutDashboard size={16} /> Go to home
        </NavLink>
        {availablePages
          .filter((p) => p.path !== homePath)
          .map((p) => (
            <NavLink
              key={p.path}
              to={p.path}
              className="inline-flex items-center gap-2 rounded-lg border border-stone-300 px-4 py-2.5 text-sm font-semibold text-stone-700 hover:bg-stone-50"
            >
              {p.label} <ArrowRight size={15} />
            </NavLink>
          ))}
      </div>
    </section>
  );
}

function App() {
  const [authed, setAuthed] = useState(
    () => sessionStorage.getItem(AUTH_KEY) === "true",
  );
  const [user, setUser] = useState<{
    id?: string;
    email?: string | null;
    full_name?: string | null;
    role?: string | null;
  } | null>(null);
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
  const [toast, setToast] = useState("");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    async function loadData() {
      if (!authed || !user?.role || !supabase) {
        setLoading(false);
        return;
      }
      const deanRole = ["dean_of_studies", "it"].includes(user.role);
      const headRole = user.role === "headteacher";
      setLoading(true);
      try {
        const [
          studentsResult,
          campaignsResult,
          galleryResult,
          newsResult,
          inquiriesResult,
          settingsResult,
        ] = await Promise.all([
          deanRole || headRole
            ? supabase
                .from("school_students")
                .select(
                  "id, parent_name, full_name, class_name, phone, email, fee_amount, created_at",
                )
                .order("created_at", { ascending: false })
                .limit(5000)
            : { data: [] },
          deanRole || headRole
            ? supabase
                .from("notification_campaigns")
                .select("*")
                .order("created_at", { ascending: false })
                .limit(100)
            : { data: [] },
          ENABLE_CONTENT_PAGES && deanRole
            ? supabase
                .from("gallery_items")
                .select("*")
                .order("updated_at", { ascending: false })
                .limit(50)
            : { data: [] },
          ENABLE_CONTENT_PAGES && deanRole
            ? supabase
                .from("news_items")
                .select("*")
                .order("published_at", { ascending: false })
                .limit(50)
            : { data: [] },
          ENABLE_CONTENT_PAGES && deanRole
            ? supabase
                .from("school_inquiries")
                .select("*")
                .order("created_at", { ascending: false })
                .limit(50)
            : { data: [] },
          deanRole
            ? supabase.from("workspace_settings").select("*").limit(1)
            : { data: [] },
        ]);
        if (deanRole || headRole)
          setContacts(
            (studentsResult?.data ?? []).map((r) =>
              mapStudentToParentContact(r as any),
            ),
          );
        if (campaignsResult?.data)
          setCampaigns(campaignsResult.data as Campaign[]);
        if (galleryResult?.data && newsResult?.data)
          setContent([
            ...(galleryResult.data as Content[]),
            ...(newsResult.data as Content[]),
          ]);
        if (inquiriesResult?.data)
          setInquiries(inquiriesResult.data as Inquiry[]);
        if (settingsResult?.data?.length)
          setSettings(settingsResult.data[0] as WorkspaceSettings);
      } catch (err) {
        console.error("Load failed", err);
      } finally {
        setLoading(false);
      }
    }
    void loadData();
  }, [authed, user?.role]);

  useEffect(() => {
    if (!supabase || !["dean_of_studies", "it"].includes(user?.role ?? ""))
      return;
    const channel = supabase
      .channel("student-registry")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "school_students" },
        async () => {
          const { data } = await supabase!
            .from("school_students")
            .select(
              "id, parent_name, full_name, class_name, phone, email, fee_amount, created_at",
            )
            .order("created_at", { ascending: false })
            .limit(5000);
          setContacts(
            (data ?? []).map((r) => mapStudentToParentContact(r as any)),
          );
        },
      )
      .subscribe();
    return () => {
      void supabase!.removeChannel(channel);
    };
  }, [user?.role]);

  function notify(msg: string) {
    setToast(msg);
    window.setTimeout(() => setToast(""), 3000);
  }

  function LoadingScreen() {
    return (
      <div className="loading-screen">
        <div className="loading-spinner" />
        <p className="loading-label">Loading workspace...</p>
      </div>
    );
  }

  async function saveCampaign(
    campaign: Omit<Campaign, "id" | "created_at">,
    dispatch: { fingerprint: string; recipientIds: string[] },
  ) {
    if (!supabase) return notify("Service unavailable");
    if (!(isDean || role === "headteacher")) return notify("Unauthorized");
    try {
      const { data: existing } = await supabase
        .from("sms_campaign_dispatches")
        .select("id")
        .eq("fingerprint", dispatch.fingerprint)
        .maybeSingle();
      if (existing) {
        notify("This broadcast already exists");
        return;
      }
      const sample = dispatch.recipientIds.slice(0, 20);
      const { data: ledger, error: ledgerError } = await supabase
        .from("sms_campaign_dispatches")
        .insert({
          fingerprint: dispatch.fingerprint,
          recipient_ids: sample,
          created_by: user?.id ?? null,
        })
        .select("id")
        .maybeSingle();
      if (ledgerError) {
        if (ledgerError.code === "23505")
          return notify("Broadcast already recorded");
        throw ledgerError;
      }
      const { data, error } = await supabase
        .from("notification_campaigns")
        .insert({
          ...campaign,
          recipient_count: dispatch.recipientIds.length,
          channels: campaign.channels?.length ? campaign.channels : ["SMS"],
        })
        .select()
        .maybeSingle();
      if (error || !data) {
        if (ledger)
          await supabase
            .from("sms_campaign_dispatches")
            .delete()
            .eq("id", ledger.id);
        return notify("Failed to save broadcast");
      }
      if (ledger)
        await supabase
          .from("sms_campaign_dispatches")
          .update({ campaign_id: data.id })
          .eq("id", ledger.id);
      setCampaigns((prev) => [data as Campaign, ...prev]);
      setShowNotification(false);
      notify(
        campaign.status === "Sent" || campaign.status === "Partially Sent"
          ? `SMS broadcast recorded: ${dispatch.recipientIds.length} recipients`
          : `Draft saved`,
      );
    } catch (e) {
      console.error(e);
      notify("Could not save broadcast");
    }
  }

  async function deleteCampaign(id: string) {
    if (!supabase) return;
    await supabase.from("notification_campaigns").delete().eq("id", id);
    setCampaigns((items) => items.filter((i) => i.id !== id));
    notify("Broadcast removed");
  }

  async function saveContent(item: any) {
    if (!supabase) return;
    const adminName = settings?.admin_name || user?.full_name || "Admin";
    const table =
      item.content_type === "Gallery" ? "gallery_items" : "news_items";
    const payload = {
      ...item,
      author: item.author || adminName,
      updated_at: new Date().toISOString(),
    };
    const q = supabase.from(table);
    const res = item.id
      ? await q.update(payload).eq("id", item.id).select().maybeSingle()
      : await q.insert(payload).select().maybeSingle();
    if (res.data) {
      setContent((prev) =>
        item.id
          ? prev.map((c) => (c.id === item.id ? (res.data as Content) : c))
          : [res.data as Content, ...prev],
      );
      setShowContentForm(false);
      setEditingContent(null);
      notify("Content saved");
    }
  }

  async function deleteContent(id: string) {
    if (!supabase) return;
    await supabase.from("gallery_items").delete().eq("id", id);
    await supabase.from("news_items").delete().eq("id", id);
    setContent((prev) => prev.filter((c) => c.id !== id));
  }

  async function publishContent(id: string) {
    if (!supabase) return;
    const now = new Date().toISOString();
    const g = await supabase
      .from("gallery_items")
      .update({ status: "Published", updated_at: now })
      .eq("id", id)
      .select()
      .maybeSingle();
    const n = await supabase
      .from("news_items")
      .update({ status: "Published", published_at: now })
      .eq("id", id)
      .select()
      .maybeSingle();
    const data = g.data || n.data;
    if (data)
      setContent((prev) =>
        prev.map((c) => (c.id === id ? (data as Content) : c)),
      );
  }

  async function saveSettings(values: any) {
    if (!supabase) return;
    const { data } = await supabase
      .from("workspace_settings")
      .upsert(
        { id: "00000000-0000-0000-0000-000000000001", ...values },
        { onConflict: "id" },
      )
      .select()
      .maybeSingle();
    if (data) setSettings(data as WorkspaceSettings);
    notify("Settings saved");
  }

  async function exportContacts(format: "xls" | "ods") {
    const headers = ["Parent name", "Student name", "Class", "Phone", "Email"];
    const rows = contacts.map((c) => [
      c.parent_name,
      c.student_name,
      c.class_name,
      c.phone,
      c.email,
    ]);
    if (format === "xls") {
      const table = `<table><tr>${headers.map((h) => `<th>${h}</th>`).join("")}</tr>${rows.map((r) => `<tr>${r.map((v) => `<td>${v}</td>`).join("")}</tr>`).join("")}</table>`;
      downloadBlob(
        new Blob([table], { type: "application/vnd.ms-excel" }),
        "gacuba-contacts.xls",
      );
    } else {
      const zip = new JSZip();
      zip.file("content.xml", headers.join(","));
      downloadBlob(
        await zip.generateAsync({ type: "blob" }),
        "gacuba-contacts.ods",
      );
    }
    notify(`Exported ${format.toUpperCase()}`);
  }

  const navItems = [
    {
      id: "overview",
      label: "Overview",
      icon: LayoutDashboard,
      path: "/overview",
    },
    {
      id: "students",
      label: "Students",
      icon: GraduationCap,
      path: "/students",
    },
    { id: "midterm", label: "Mid-term", icon: ClipboardList, path: "/midterm" },
    { id: "users", label: "Staff", icon: UserCog, path: "/users" },
    {
      id: "campaigns",
      label: "Broadcasts",
      icon: Megaphone,
      path: "/campaigns",
    },
    { id: "contacts", label: "Contacts", icon: Users, path: "/contacts" },
    ...(ENABLE_CONTENT_PAGES
      ? [
          {
            id: "content",
            label: "News",
            icon: GalleryHorizontal,
            path: "/content",
          } as const,
        ]
      : []),
    ...(ENABLE_CONTENT_PAGES
      ? [
          {
            id: "inquiries",
            label: "Inquiries",
            icon: Inbox,
            path: "/inquiries",
          } as const,
        ]
      : []),
  ] as const;

  const role = parseSchoolRole(user?.role);
  const isDean = ["dean_of_studies", "it"].includes(role);

  // UPDATED: Dean can now access Staff page for class assignments
  const rawAllowedPaths =
    role === "teacher"
      ? ["/overview", "/midterm", "/students"]
      : role === "headteacher"
        ? ["/overview", "/midterm", "/campaigns"]
        : role === "dean_of_studies"
          ? [
              "/overview",
              "/students",
              "/midterm",
              "/users",
              "/campaigns",
              "/contacts",
              "/content",
              "/inquiries",
            ]
          : role === "it"
            ? [
                "/overview",
                "/students",
                "/midterm",
                "/users",
                "/campaigns",
                "/contacts",
                "/content",
                "/inquiries",
              ]
            : [];

  const allowedPaths = rawAllowedPaths.filter((p) => {
    if (!ENABLE_CONTENT_PAGES && p === "/content") return false;
    if (!ENABLE_CONTENT_PAGES && p === "/inquiries") return false;
    return true;
  });

  const visibleNavItems = navItems.filter((i) => allowedPaths.includes(i.path));
  const homePath = allowedPaths.includes("/overview")
    ? "/overview"
    : "/midterm";
  const roleName = schoolRoleLabel(role);
  const restrictedPage = (
    <AccessNotice
      roleName={roleName}
      homePath={homePath}
      availablePages={visibleNavItems.map((i) => ({
        label: i.label,
        path: i.path,
      }))}
    />
  );
  const overviewElement =
    role === "teacher" ? (
      <TeacherOverview
        teacherName={user?.full_name || "Teacher"}
        onNavigate={(p) => navigate(p)}
      />
    ) : (
      <HeadmasterOverview
        contacts={contacts}
        campaigns={campaigns}
        content={content}
        inquiries={inquiries}
        adminName={user?.full_name || settings?.admin_name || "Staff"}
        adminRole={role}
        onNavigate={(v) =>
          navigate(navItems.find((i) => i.id === v)?.path ?? "/overview")
        }
      />
    );
  const roleAwareOverview = allowedPaths.includes("/overview")
    ? overviewElement
    : restrictedPage;

  async function handleLogin(email: string, password: string) {
    if (!supabase) return "Service unavailable";
    const resp = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });
    if (resp.error) return resp.error.message;
    sessionStorage.setItem(AUTH_KEY, "true");
    setAuthed(true);
    const { data: profile } = await supabase
      .from("users")
      .select("role, full_name")
      .eq("id", resp.data.user.id)
      .maybeSingle();
    if (!profile) return "No school account";
    setUser({
      id: resp.data.user.id,
      email: resp.data.user.email,
      full_name: profile.full_name,
      role: parseSchoolRole(profile.role),
    });
    navigate("/overview");
    return null;
  }
  async function handleRequestReset(email: string) {
    if (!supabase) return "Service unavailable";
    const { error } = await supabase.auth.resetPasswordForEmail(
      email.trim().toLowerCase(),
      {
        redirectTo: `${window.location.origin}/reset-password`,
      },
    );
    return error ? error.message : null;
  }

  function handleLogout() {
    supabase?.auth.signOut();
    sessionStorage.removeItem(AUTH_KEY);
    setAuthed(false);
    setUser(null);
    navigate("/overview");
  }

  useEffect(() => {
    async function restore() {
      if (!supabase || sessionStorage.getItem(AUTH_KEY) !== "true") return;
      const { data } = await supabase.auth.getUser();
      if (!data?.user) return setAuthed(false);
      const { data: profile } = await supabase
        .from("users")
        .select("role, full_name")
        .eq("id", data.user.id)
        .maybeSingle();
      if (!profile) return setAuthed(false);
      setUser({
        id: data.user.id,
        email: data.user.email,
        full_name: profile.full_name,
        role: parseSchoolRole(profile.role),
      });
    }
    void restore();
  }, []);

  if (location.pathname === "/report-not-found") return <ReportNotFound />;
  if (location.pathname === "/report-not-found") return <ReportNotFound />;

  if (!authed && location.pathname === "/forgot-password") {
    return (
      <ForgotPassword
        onRequestReset={handleRequestReset}
        onBack={() => navigate("/")}
      />
    );
  }

  if (!authed)
    return (
      <LoginScreen
        onLogin={handleLogin}
        onForgotPassword={() => navigate("/forgot-password")}
      />
    );
  if (loading) return <LoadingScreen />;

  const currentNav = navItems.find(
    (i) =>
      i.path === (location.pathname === "/" ? "/overview" : location.pathname),
  );
  const isHome = location.pathname === "/" || location.pathname === homePath;

  return (
    <div className={`system-shell ${MAINTENANCE_MODE ? "pt-[40px]" : ""}`}>
      <MaintenanceBanner />
      <div className="top-utility-strip">
        <div className="user-welcome">
          <span>
            Welcome, <strong>{user?.full_name || user?.email}</strong>
          </span>
          <span className="hidden sm:inline"> ({SCHOOL_NAME})</span>
        </div>
        <div className="utility-actions">
          {isDean && (
            <button
              onClick={() => exportContacts("xls")}
              className="util-badge-btn util-badge-purple"
            >
              <Download size={12} />{" "}
              <span className="hidden sm:inline">Export</span>
            </button>
          )}
          {(role === "headteacher" || isDean) && (
            <button
              onClick={() => setShowNotification(true)}
              className="util-badge-btn util-badge-green"
            >
              <Megaphone size={12} />{" "}
              <span className="hidden sm:inline">Broadcast</span>
            </button>
          )}
          <button
            onClick={() => setShowNotifications((s) => !s)}
            className="util-badge-btn util-badge-amber"
          >
            <Bell size={12} /> <span className="hidden sm:inline">History</span>
          </button>
          {isDean && (
            <button
              onClick={() => setShowSettings(true)}
              className="util-badge-btn util-badge-slate"
            >
              <Settings size={12} />{" "}
              <span className="hidden sm:inline">Settings</span>
            </button>
          )}
          <div className="flex items-center gap-1.5 text-xs pl-1">
            <span className="w-6 h-6 rounded-full bg-[#ffedd5] text-[#78350f] grid place-items-center font-bold text-[11px]">
              {(user?.full_name || "A")[0]}
            </span>
            <span className="hidden md:inline font-medium">{roleName}</span>
          </div>
          <button
            onClick={handleLogout}
            className="text-slate-500 hover:text-red-700 ml-1 p-1"
          >
            <LogOut size={14} />
          </button>
        </div>
      </div>

      <header className="institution-brand-bar">
        <div className="brand-emblem-lockup">
          <img
            className="brand-crest"
            src="/assets/school-community.jpg"
            alt=""
          />
          <div className="brand-titles">
            <h1>{SCHOOL_NAME}</h1>
            <p>EXCELLENCE · SYSTEMATIZED</p>
          </div>
        </div>
        <div className="brand-right-tools flex items-center gap-2">
          {ENABLE_CONTENT_PAGES && allowedPaths.includes("/inquiries") && (
            <button
              onClick={() => navigate("/inquiries")}
              className="message-counter-badge"
            >
              <span>{inquiries.filter((i) => i.status === "New").length}</span>
              <Inbox size={14} />
            </button>
          )}
          <button
            type="button"
            onClick={() => setMobileMenuOpen((prev) => !prev)}
            className="mobile-nav-toggle-btn border border-stone-200"
          >
            {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </header>

      <nav className={`system-nav-bar ${mobileMenuOpen ? "mobile-open" : ""}`}>
        {visibleNavItems.map(({ id, label, icon: Icon, path }) => (
          <NavLink
            key={id}
            to={path}
            className={({ isActive }) =>
              `system-nav-tab ${isActive ? "active" : ""}`
            }
            onClick={() => setMobileMenuOpen(false)}
          >
            <Icon size={15} />
            <span>{label}</span>
            {id === "inquiries" &&
              inquiries.filter((i) => i.status === "New").length > 0 && (
                <span className="nav-tab-counter">
                  {inquiries.filter((i) => i.status === "New").length}
                </span>
              )}
          </NavLink>
        ))}
      </nav>

      <div className="system-breadcrumb-row">
        <div className="breadcrumb-trail">
          <NavLink to={homePath} className="breadcrumb-home">
            Home
          </NavLink>
          {!isHome && (
            <>
              <ArrowRight size={14} className="text-slate-400" />
              <span className="breadcrumb-active">
                {currentNav?.label ?? "Home"}
              </span>
            </>
          )}
        </div>
      </div>

      <main className="system-viewport">
        <Routes>
          <Route path="/" element={roleAwareOverview} />
          <Route path="/overview" element={roleAwareOverview} />
          <Route
            path="/students"
            element={
              allowedPaths.includes("/students") ? (
                role === "teacher" ? (
                  <TeacherStudentRegister />
                ) : (
                  <Students />
                )
              ) : (
                restrictedPage
              )
            }
          />
          <Route
            path="/midterm"
            element={
              allowedPaths.includes("/midterm") ? (
                <Suspense fallback={<LoadingScreen />}>
                  <MidTermEngine
                    role={role}
                    userId={user?.id}
                    notify={notify}
                  />
                </Suspense>
              ) : (
                restrictedPage
              )
            }
          />
          {/* UPDATED: Dean can access but UserManagement will limit her to teacher class assignments only */}
          <Route
            path="/users"
            element={
              allowedPaths.includes("/users") ? (
                <UserManagement currentRole={role} currentUserId={user?.id} />
              ) : (
                restrictedPage
              )
            }
          />
          <Route
            path="/campaigns"
            element={
              allowedPaths.includes("/campaigns") ? (
                <Campaigns
                  campaigns={campaigns}
                  contacts={contacts}
                  onCompose={() => setShowNotification(true)}
                  onDelete={
                    isDean
                      ? deleteCampaign
                      : () => notify("Only Dean can delete")
                  }
                  notify={notify}
                />
              ) : (
                restrictedPage
              )
            }
          />
          <Route
            path="/contacts"
            element={
              allowedPaths.includes("/contacts") ? (
                <Contacts contacts={contacts} onExport={exportContacts} />
              ) : (
                restrictedPage
              )
            }
          />
          <Route
            path="/content"
            element={
              allowedPaths.includes("/content") ? (
                <ContentManager
                  content={content}
                  onAdd={() => {
                    setEditingContent(null);
                    setShowContentForm(true);
                  }}
                  onEdit={(item) => {
                    setEditingContent(item);
                    setShowContentForm(true);
                  }}
                  onDelete={deleteContent}
                  onPublish={publishContent}
                />
              ) : (
                restrictedPage
              )
            }
          />
          <Route
            path="/inquiries"
            element={
              allowedPaths.includes("/inquiries") ? (
                <Inquiries
                  inquiries={inquiries}
                  setInquiries={setInquiries}
                  notify={notify}
                />
              ) : (
                restrictedPage
              )
            }
          />
          <Route
            path="*"
            element={
              <AccessNotice
                roleName={roleName}
                homePath={homePath}
                availablePages={visibleNavItems.map((i) => ({
                  label: i.label,
                  path: i.path,
                }))}
                isUnknownPage
              />
            }
          />
        </Routes>
      </main>

      {showNotifications && (
        <div
          className="modal-overlay"
          onClick={() => setShowNotifications(false)}
        >
          <div
            className="modal-dialog-box max-w-md"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header-bar">
              <h2>Broadcast history</h2>
              <button
                onClick={() => setShowNotifications(false)}
                className="modal-close-btn"
              >
                <X size={16} />
              </button>
            </div>
            <div className="p-4">
              {campaigns.length ? (
                <ul className="divide-y divide-stone-100">
                  {campaigns.slice(0, 10).map((c) => (
                    <li key={c.id} className="py-3">
                      <strong className="block text-sm">{c.title}</strong>
                      <span className="text-xs text-stone-600 line-clamp-2">
                        {c.message}
                      </span>
                      <span className="mt-1 flex gap-2 text-[11px]">
                        <span className="bg-stone-100 px-1.5 py-0.5 rounded">
                          {c.status}
                        </span>
                        <span>{c.channels?.join(", ")}</span>
                        <span>{c.recipient_count} recipients</span>
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-stone-600">No broadcasts yet</p>
              )}
            </div>
          </div>
        </div>
      )}

      {showNotification && (role === "headteacher" || isDean) && (
        <NotificationModal
          onClose={() => setShowNotification(false)}
          onSave={saveCampaign}
          contacts={contacts}
          allowReports={isDean}
        />
      )}
      {showContentForm && (
        <ContentModal
          initialContent={editingContent ?? undefined}
          onClose={() => {
            setShowContentForm(false);
            setEditingContent(null);
          }}
          onSave={saveContent}
        />
      )}
      {showSettings && (
        <SettingsModal
          onClose={() => setShowSettings(false)}
          notify={notify}
          adminName={settings?.admin_name ?? user?.full_name}
          defaultChannel={settings?.default_notification_channel}
          onSave={saveSettings}
        />
      )}
      {showHelp && <HelpModal onClose={() => setShowHelp(false)} />}

      {toast && (
        <div className="system-toast">
          <Check size={16} className="text-emerald-400" />
          <span>{toast}</span>
        </div>
      )}

      <footer className="system-footer">
        All Rights Reserved by G.S Gacuba 2A
      </footer>
    </div>
  );
}

export default App;
