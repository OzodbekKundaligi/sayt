import React, { useState, useEffect, useMemo, useRef } from 'react';
import { getAIMentorResponse } from './services/geminiService';
import { convertToBase64, validateImageFile, validateCvFile, formatFileSize } from './utils/fileHelpers';
import { initDatabase, dbOperations, saveDatabase } from './database';
import Logo from './r.png';

const ADMIN_EMAIL = 'mamatovo354@gmail.com';
const ADMIN_PASS = '123@Ozod';
const DEFAULT_CATEGORIES = [
  'Fintex',
  'Edtex',
  "Sun'iy intellekt / ML",
  'Elektron savdo',
  'SaaS',
  'Blokcheyn',
  "Sog'liqni saqlash",
  'Kiberxavfsizlik',
  "O'yin ishlab chiqish",
  'Tarmoqlar',
  'Samaradorlik',
  'Boshqa'
];
const URL_REGEX = /(https?:\/\/[^\s]+)/g;
const FALLBACK_STARTUP_TEMPLATES = [
  {
    key: 'it_mvp',
    name: 'IT MVP',
    segment: 'IT asoschisi + dasturchi',
    description: 'Tez MVP chiqish uchun bazaviy texnik template.',
    specialists: ['Frontend', 'Backend', 'UI/UX', 'QA'],
    default_tasks: []
  },
  {
    key: 'saas_b2b',
    name: 'SaaS B2B',
    segment: 'SaaS',
    description: 'B2B SaaS product va sales pipeline template.',
    specialists: ['Product manager', 'Backend', 'Frontend', 'Sotuv'],
    default_tasks: []
  },
  {
    key: 'ai_product',
    name: 'AI Mahsulot',
    segment: "Sun'iy intellekt / ML",
    description: 'AI mahsulot uchun data va model ish jarayoni template.',
    specialists: ['ML muhandis', 'Backend', 'Frontend', 'Prompt muhandis'],
    default_tasks: []
  }
];

const EMPTY_TASK_DRAFT = {
  title: '',
  description: '',
  assigned_to_id: '',
  deadline: '',
  priority: 'medium',
  estimate_hours: '',
  actual_hours: '',
  calendar_tag: 'backlog'
};

const toDateStart = (value = new Date()) => {
  const d = new Date(value);
  d.setHours(0, 0, 0, 0);
  return d;
};

const getTaskDeadlineState = (task) => {
  if (!task?.deadline) return 'none';
  const deadline = new Date(task.deadline);
  if (Number.isNaN(deadline.getTime())) return 'none';
  const today = toDateStart(new Date());
  const dl = toDateStart(deadline);
  if (task.status !== 'done' && dl < today) return 'overdue';
  if (dl.getTime() === today.getTime()) return 'today';
  const weekEnd = new Date(today.getTime() + 6 * 24 * 60 * 60 * 1000);
  if (dl <= weekEnd) return 'week';
  return 'future';
};

// --- REUSABLE UI COMPONENTS ---
const Badge = ({ children, variant = 'default', size = 'sm', className = "" }) => {
  const styles = {
    default: "bg-gray-50 border-gray-200 text-gray-600",
    active: "bg-gray-900 border-gray-900 text-white",
    success: "bg-emerald-50 border-emerald-200 text-emerald-700",
    danger: "bg-rose-50 border-rose-200 text-rose-700",
  };
  const sizeStyles = size === 'sm' ? "px-2 py-0.5 text-[10px]" : "px-3 py-1 text-[11px]";
  return (
    <span className={`rounded-[6px] border font-semibold uppercase tracking-wider inline-flex items-center ${styles[variant]} ${sizeStyles} ${className}`}>
      {children}
    </span>
  );
};

const Button = ({ children, onClick, variant = 'primary', className = "", disabled = false, loading = false, type = 'button', size = 'md', icon }) => {
  const variants = {
    primary: "bg-gray-900 text-white hover:bg-black border-transparent shadow-sm",
    secondary: "bg-white text-gray-900 border-gray-200 hover:border-gray-900 shadow-sm",
    danger: "bg-white text-rose-600 border-rose-100 hover:border-rose-600",
    ghost: "bg-transparent text-gray-500 hover:bg-gray-50 hover:text-gray-900 border-transparent",
  };
  const sizes = {
    sm: "h-8 px-3 text-[11px]",
    md: "h-10 px-5 text-[13px]",
    lg: "h-12 px-7 text-[14px]",
  };
  return (
    <button
      type={type}
      disabled={disabled || loading}
      onClick={onClick}
      className={`rounded-lg font-semibold transition-all flex items-center justify-center gap-2 active:scale-[0.98] disabled:opacity-40 border select-none ${variants[variant]} ${sizes[size]} ${className}`}
    >
      {loading ? <i className="fa-solid fa-spinner animate-spin"></i> : (
        <>
          {icon && <i className={`fa-solid ${icon}`}></i>}
          {children}
        </>
      )}
    </button>
  );
};

const Input = ({ label, icon, error, helper, ...props }) => (
  <div className="space-y-1.5 w-full">
    {label && <label className="block text-[11px] font-bold text-gray-700 uppercase tracking-widest ml-1">{label}</label>}
    <div className="relative group">
      {icon && <i className={`fa-solid ${icon} absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 text-sm group-focus-within:text-black transition-colors`}></i>}
      <input
        {...props}
        className={`w-full bg-white border ${error ? 'border-rose-300 focus:border-rose-500' : 'border-gray-200 focus:border-black'} rounded-lg ${icon ? 'pl-11' : 'px-4'} py-2.5 text-[14px] text-gray-900 outline-none transition-all placeholder:text-gray-400 shadow-sm`}
      />
    </div>
    {error && <p className="text-[11px] text-rose-600 font-medium ml-1">{error}</p>}
    {helper && !error && <p className="text-[11px] text-gray-500 ml-1">{helper}</p>}
  </div>
);

const TextArea = ({ label, ...props }) => (
  <div className="space-y-1.5 w-full">
    {label && <label className="block text-[11px] font-bold text-gray-700 uppercase tracking-widest ml-1">{label}</label>}
    <textarea
      {...props}
      className="w-full bg-white border border-gray-200 focus:border-black rounded-lg px-4 py-3 text-[14px] text-gray-900 outline-none transition-all min-h-[120px] resize-y placeholder:text-gray-400 shadow-sm"
    />
  </div>
);

const Modal = ({ isOpen, onClose, title, children, size = 'md' }) => {
  if (!isOpen) return null;
  const sizes = { sm: 'max-w-md', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' };
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="absolute inset-0 bg-gray-900/30 backdrop-blur-sm" onClick={onClose} />
      <div className={`relative bg-white w-full ${sizes[size]} rounded-2xl shadow-2xl overflow-hidden animate-in slide-in-from-bottom-8 duration-300 mx-auto`}>
        <div className="flex items-center justify-between p-5 md:p-6 border-b border-gray-100">
          <h3 className="text-lg md:text-xl font-bold tracking-tight">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-black transition-colors p-1"><i className="fa-solid fa-xmark text-lg"></i></button>
        </div>
        <div className="p-6 md:p-8 overflow-y-auto max-h-[80vh] custom-scrollbar">
          {children}
        </div>
      </div>
    </div>
  );
};

const FileUpload = ({ label, onChange, preview, icon = "fa-cloud-arrow-up" }) => {
  const inputRef = useRef(null);
  return (
    <div className="space-y-2">
      <label className="block text-[11px] font-bold text-gray-700 uppercase tracking-widest ml-1">{label}</label>
      <div 
        onClick={() => inputRef.current?.click()}
        className={`relative flex flex-col items-center justify-center p-6 md:p-8 border-2 border-dashed border-gray-200 rounded-xl bg-gray-50/50 cursor-pointer hover:border-black hover:bg-gray-50 transition-all group overflow-hidden`}
      >
        <input type="file" ref={inputRef} onChange={onChange} className="hidden" accept="image/*" />
        {preview ? (
          <div className="relative w-20 h-20 md:w-24 md:h-24 rounded-lg overflow-hidden border border-gray-200 shadow-sm">
            <img src={preview} className="w-full h-full object-cover" alt="Preview" />
            <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all text-white text-[10px] font-bold">O'zgartirish</div>
          </div>
        ) : (
          <>
            <i className={`fa-solid ${icon} text-2xl md:text-3xl text-gray-300 group-hover:text-black mb-2 transition-all`}></i>
            <p className="text-[12px] font-medium text-gray-500 group-hover:text-black">Rasm yuklash</p>
          </>
        )}
      </div>
    </div>
  );
};

const EmptyState = ({ icon, title, subtitle, action }) => (
  <div className="flex flex-col items-center justify-center py-12 md:py-20 px-6 text-center animate-in fade-in">
    <div className="w-14 h-14 md:w-20 md:h-20 bg-gray-50 rounded-full flex items-center justify-center mb-6">
      <i className={`fa-solid ${icon} text-xl md:text-3xl text-gray-300`}></i>
    </div>
    <h3 className="text-base md:text-lg font-bold text-gray-900 tracking-tight mb-2">{title}</h3>
    {subtitle && <p className="text-[13px] md:text-[14px] text-gray-500 max-w-sm mb-6 md:mb-8">{subtitle}</p>}
    {action}
  </div>
);

// --- MAIN APPLICATION ---

const App = () => {
  // --- CORE STATE ---
  const [allUsers, setAllUsers] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [startups, setStartups] = useState([]);
  const [joinRequests, setJoinRequests] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [workspaceContext, setWorkspaceContext] = useState(null);
  const [workspaceLoading, setWorkspaceLoading] = useState(false);
  const [profileReputation, setProfileReputation] = useState(null);
  const [startupChatMessages, setStartupChatMessages] = useState([]);
  const [startupChatText, setStartupChatText] = useState('');
  const [startupChatAttachment, setStartupChatAttachment] = useState(null);
  const [startupChatSending, setStartupChatSending] = useState(false);
  const [memberRecommendations, setMemberRecommendations] = useState([]);
  const [pendingInvitations, setPendingInvitations] = useState([]);

  // --- UI STATE ---
  const [activeTab, setActiveTab] = useState('explore');
  const [selectedStartupId, setSelectedStartupId] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('Hammasi');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authMode, setAuthMode] = useState('login');
  const [showAIMentor, setShowAIMentor] = useState(false);
  const [aiChat, setAiChat] = useState([]);
  const [aiInput, setAiInput] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [activeDetailTab, setActiveDetailTab] = useState('vazifalar');
  const [categories, setCategories] = useState(DEFAULT_CATEGORIES);
  const [startupTemplates, setStartupTemplates] = useState(FALLBACK_STARTUP_TEMPLATES);
  const [selectedTemplateKey, setSelectedTemplateKey] = useState(FALLBACK_STARTUP_TEMPLATES[0].key);
  const [startupSpecialistsInput, setStartupSpecialistsInput] = useState('');
  const [taskDraft, setTaskDraft] = useState(EMPTY_TASK_DRAFT);
  const [taskFilter, setTaskFilter] = useState('all');
  const [taskSearch, setTaskSearch] = useState('');
  const [startupCalendar, setStartupCalendar] = useState(null);
  const [adminTab, setAdminTab] = useState('moderation');
  const [adminStats, setAdminStats] = useState(null);
  const [auditLogs, setAuditLogs] = useState([]);
  const [proConfig, setProConfig] = useState({
    pro_enabled: true,
    plan_name: 'GarajHub Pro',
    price_text: '149 000 UZS / oy',
    startup_limit_free: 1,
    card_holder: '',
    card_number: '',
    bank_name: '',
    receipt_note: 'Chek rasmini yuklang'
  });
  const [adminProConfigDraft, setAdminProConfigDraft] = useState({
    pro_enabled: true,
    plan_name: 'GarajHub Pro',
    price_text: '149 000 UZS / oy',
    startup_limit_free: 1,
    card_holder: '',
    card_number: '',
    bank_name: '',
    receipt_note: 'Chek rasmini yuklang'
  });
  const [proRequests, setProRequests] = useState([]);
  const [showProModal, setShowProModal] = useState(false);
  const [proReceiptBase64, setProReceiptBase64] = useState('');
  const [proRequestDraft, setProRequestDraft] = useState({
    sender_full_name: '',
    sender_card_number: ''
  });
  const [reviewDraft, setReviewDraft] = useState({
    to_user_id: '',
    rating: 5,
    task_delivery: 5,
    collaboration: 5,
    reliability: 5,
    comment: ''
  });
  const [decisionDraft, setDecisionDraft] = useState({ title: '', description: '' });
  const [voteCaseDraft, setVoteCaseDraft] = useState({ target_user_id: '', reason: '' });
  const [equityDraft, setEquityDraft] = useState({
    user_id: '',
    share_percent: '',
    vesting_months: 48,
    cliff_months: 12,
    notes: ''
  });
  const [agreementDraft, setAgreementDraft] = useState({ title: '', body: '', status: 'draft' });
  const [investorDraft, setInvestorDraft] = useState({
    investor_name: '',
    stage: 'seed',
    amount: '',
    status: 'planned',
    notes: ''
  });
  const [registryDraft, setRegistryDraft] = useState({
    lifecycle_status: 'live',
    success_fee_percent: 1.5,
    registry_notes: ''
  });
  
  // Modals & Edit States
  const [isEditProfileModalOpen, setIsEditProfileModalOpen] = useState(false);
  const [editedUser, setEditedUser] = useState({});
  const [editedSkillsText, setEditedSkillsText] = useState('');
  const [tempFileBase64, setTempFileBase64] = useState(null);
  const [tempBannerBase64, setTempBannerBase64] = useState(null);
  const [isUserProfileModalOpen, setIsUserProfileModalOpen] = useState(false);
  const [viewedUser, setViewedUser] = useState(null);
  const [viewedUserReputation, setViewedUserReputation] = useState(null);
  const [isDarkTheme, setIsDarkTheme] = useState(() => localStorage.getItem('garajhub_theme') === 'dark');

  const chatEndRef = useRef(null);
  const startupChatEndRef = useRef(null);
  const startupChatFileRef = useRef(null);

  // --- INITIAL DATA LOAD ---
  useEffect(() => {
    loadInitialData();
  }, []);

  const openAuth = (mode = 'login') => {
    setAuthMode(mode);
    setShowAuthModal(true);
  };

  const parseSkillsInput = (raw) => {
    const value = String(raw || '').trim();
    if (!value) return [];
    if (/[,\n;|]/.test(value)) {
      return value
        .split(/[,\n;|]+/)
        .map((part) => part.trim())
        .filter(Boolean);
    }
    return value
      .split(/\s+/)
      .map((part) => part.trim())
      .filter(Boolean);
  };

  const activeTemplate = useMemo(() => {
    if (!Array.isArray(startupTemplates) || startupTemplates.length === 0) return null;
    return startupTemplates.find((template) => template.key === selectedTemplateKey) || startupTemplates[0];
  }, [startupTemplates, selectedTemplateKey]);

  const openEditProfileModal = () => {
    if (!currentUser) return;
    setEditedUser(currentUser);
    setEditedSkillsText(Array.isArray(currentUser.skills) ? currentUser.skills.join(', ') : String(currentUser.skills || ''));
    setIsEditProfileModalOpen(true);
  };

  const closeEditProfileModal = () => {
    setIsEditProfileModalOpen(false);
    setEditedUser({});
    setEditedSkillsText('');
    setTempFileBase64(null);
    setTempBannerBase64(null);
  };

  const buildDefaultAdminUser = () => ({
    id: 'admin',
    email: ADMIN_EMAIL,
    password: ADMIN_PASS,
    name: 'Ozodbek Mamatov',
    phone: '+998932303410',
    role: 'admin',
    created_at: new Date().toISOString(),
    skills: [],
    languages: [],
    tools: [],
    avatar: `https://ui-avatars.com/api/?name=Ozodbek+Mamatov&background=111&color=fff`,
    banner: '',
    bio: '',
    portfolio_url: '',
    cv_data: '',
    cv_file_name: '',
    cv_mime: '',
    cv_size: 0,
    cv_updated_at: null,
    is_pro: true,
    pro_status: 'pro',
    pro_updated_at: new Date().toISOString()
  });

  const loadInitialData = async () => {
    try {
      setLoading(true);
      
      // Initialize database
      await initDatabase();
      
      // Load data from SQLite
      const [usersData, startupsData, requestsData, proCfg, templateRows] = await Promise.all([
        dbOperations.getUsers(),
        dbOperations.getStartups(),
        dbOperations.getJoinRequests(),
        dbOperations.getProConfig().catch(() => null),
        dbOperations.getStartupTemplates().catch(() => FALLBACK_STARTUP_TEMPLATES)
      ]);

      try {
        const cats = await dbOperations.getCategories();
        if (Array.isArray(cats) && cats.length > 0) {
          setCategories(cats.map(c => c.name));
        }
      } catch (e) {
        setCategories(DEFAULT_CATEGORIES);
      }
      
      setAllUsers(usersData);
      setStartups(startupsData);
      setJoinRequests(requestsData);
      if (Array.isArray(templateRows) && templateRows.length > 0) {
        setStartupTemplates(templateRows);
        if (!templateRows.some((t) => t.key === selectedTemplateKey)) {
          setSelectedTemplateKey(templateRows[0].key);
        }
      } else {
        setStartupTemplates(FALLBACK_STARTUP_TEMPLATES);
      }
      if (proCfg) {
        setProConfig(proCfg);
        setAdminProConfigDraft(proCfg);
      }
      
      // Load current user from localStorage
      const savedUserId = localStorage.getItem('currentUserId');
      let hasValidSession = false;
      if (savedUserId) {
        const user = await dbOperations.getUserById(savedUserId).catch(() => null);
        if (user) {
          hasValidSession = true;
          setCurrentUser(user);
          const userNotifs = await dbOperations.getNotifications(user.id).catch(() => []);
          setNotifications(Array.isArray(userNotifs) ? userNotifs : []);
          if (user.role === 'admin') {
            const pending = await dbOperations.getProRequests({ role: 'admin', status: 'pending' }).catch(() => []);
            setProRequests(Array.isArray(pending) ? pending : []);
          } else {
            const myProRequests = await dbOperations.getProRequests({ userId: user.id }).catch(() => []);
            setProRequests(Array.isArray(myProRequests) ? myProRequests : []);
          }
        } else {
          localStorage.removeItem('currentUserId');
        }
      }
      if (!hasValidSession) {
        const alreadyPrompted = sessionStorage.getItem('authPromptShown');
        if (!alreadyPrompted) {
          openAuth('login');
          sessionStorage.setItem('authPromptShown', '1');
        }
      }
    } catch (error) {
      console.error('Ma\'lumotlarni yuklashda xatolik:', error);
    } finally {
      setLoading(false);
    }
  };

  const reloadStartups = async () => {
    const fresh = await dbOperations.getStartups();
    setStartups(fresh);
  };

  const loadWorkspaceContext = async (startupId) => {
    if (!startupId) return;
    try {
      setWorkspaceLoading(true);
      const startupSnapshot = startups.find((s) => s.id === startupId);
      const canLoadMemberData = !!currentUser && (
        !startupSnapshot ||
        startupSnapshot.egasi_id === currentUser.id ||
        startupSnapshot.a_zolar.some((m) => m.user_id === currentUser.id)
      );
      const [workspace, chatRows, recRows, calendarData] = await Promise.all([
        dbOperations.getStartupWorkspace(startupId),
        canLoadMemberData ? dbOperations.getStartupChat(startupId, currentUser.id).catch(() => []) : Promise.resolve([]),
        canLoadMemberData ? dbOperations.getStartupRecommendations(startupId, currentUser.id).catch(() => []) : Promise.resolve([]),
        canLoadMemberData ? dbOperations.getStartupCalendar(startupId, currentUser.id).catch(() => null) : Promise.resolve(null)
      ]);
      setWorkspaceContext(workspace);
      if (Array.isArray(workspace?.tasks)) {
        setStartups((prev) => prev.map((item) => (
          item.id === startupId
            ? {
              ...item,
              tasks: workspace.tasks,
              lifecycle_status: workspace?.startup?.lifecycle_status || item.lifecycle_status,
              success_fee_percent: workspace?.startup?.success_fee_percent ?? item.success_fee_percent,
              registry_notes: workspace?.startup?.registry_notes ?? item.registry_notes,
              template_key: workspace?.startup?.template_key || item.template_key,
              template_name: workspace?.startup?.template_name || item.template_name
            }
            : item
        )));
      }
      setRegistryDraft({
        lifecycle_status: workspace?.startup?.lifecycle_status || 'live',
        success_fee_percent: workspace?.startup?.success_fee_percent ?? 1.5,
        registry_notes: workspace?.startup?.registry_notes || ''
      });
      setReviewDraft((prev) => ({ ...prev, to_user_id: '' }));
      setStartupChatMessages(Array.isArray(chatRows) ? chatRows : []);
      setMemberRecommendations(Array.isArray(recRows) ? recRows : []);
      setStartupCalendar(calendarData);
      if (currentUser && currentUser.role !== 'admin') {
        const invites = await dbOperations.getInvitations(currentUser.id).catch(() => []);
        setPendingInvitations(Array.isArray(invites) ? invites.filter((i) => i.status === 'pending') : []);
      }
    } catch (error) {
      console.error("Ish maydonini yuklashda xatolik:", error);
      setWorkspaceContext(null);
      setStartupChatMessages([]);
      setMemberRecommendations([]);
      setStartupCalendar(null);
    } finally {
      setWorkspaceLoading(false);
    }
  };

  useEffect(() => {
    if (!activeTemplate) return;
    setStartupSpecialistsInput((activeTemplate.specialists || []).join(', '));
  }, [activeTemplate?.key]);

  useEffect(() => {
    setTaskDraft({
      ...EMPTY_TASK_DRAFT,
      assigned_to_id: currentUser?.id || ''
    });
    setTaskFilter('all');
    setTaskSearch('');
  }, [selectedStartupId, currentUser?.id]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [aiChat]);

  useEffect(() => {
    if (activeDetailTab !== 'chat') return;
    startupChatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [startupChatMessages, activeDetailTab]);

  useEffect(() => {
    localStorage.setItem('garajhub_theme', isDarkTheme ? 'dark' : 'light');
  }, [isDarkTheme]);

  useEffect(() => {
    if (activeTab === 'admin' && currentUser?.role === 'admin') {
      refreshAdminData();
    }
  }, [activeTab, currentUser, adminTab]);

  useEffect(() => {
    if (activeTab === 'details' && selectedStartupId) {
      loadWorkspaceContext(selectedStartupId);
    }
  }, [activeTab, selectedStartupId, currentUser?.id]);

  useEffect(() => {
    const loadProfileReputation = async () => {
      if (!currentUser?.id || currentUser.id === 'admin') {
        setProfileReputation(null);
        return;
      }
      try {
        const rep = await dbOperations.getUserReputation(currentUser.id);
        setProfileReputation(rep);
      } catch {
        setProfileReputation(null);
      }
    };
    loadProfileReputation();
  }, [currentUser, startups]);

  useEffect(() => {
    const loadProSideData = async () => {
      const cfg = await dbOperations.getProConfig().catch(() => null);
      if (cfg) {
        setProConfig(cfg);
        if (currentUser?.role === 'admin') setAdminProConfigDraft(cfg);
      }
      if (!currentUser) {
        setProRequests([]);
        return;
      }
      if (currentUser.role === 'admin') {
        const pending = await dbOperations.getProRequests({ role: 'admin', status: 'pending' }).catch(() => []);
        setProRequests(Array.isArray(pending) ? pending : []);
      } else {
        const mine = await dbOperations.getProRequests({ userId: currentUser.id }).catch(() => []);
        setProRequests(Array.isArray(mine) ? mine : []);
      }
    };
    loadProSideData();
  }, [currentUser]);

  useEffect(() => {
    const syncCurrentUser = async () => {
      if (!currentUser) return;
      const fresh = await dbOperations.getUserById(currentUser.id).catch(() => null);
      if (!fresh) return;
      setCurrentUser(fresh);
      setAllUsers((prev) => prev.map((u) => (u.id === fresh.id ? fresh : u)));
    };
    syncCurrentUser();
  }, [notifications.length]);

  useEffect(() => {
    if (!currentUser) {
      setPendingInvitations([]);
      return undefined;
    }
    const refreshLoop = async () => {
      const [userNotifs, latestJoinRequests] = await Promise.all([
        dbOperations.getNotifications(currentUser.id).catch(() => []),
        dbOperations.getJoinRequests().catch(() => [])
      ]);
      if (Array.isArray(userNotifs)) setNotifications(userNotifs);
      if (Array.isArray(latestJoinRequests)) setJoinRequests(latestJoinRequests);

      const freshUser = await dbOperations.getUserById(currentUser.id).catch(() => null);
      if (freshUser) {
        setCurrentUser(freshUser);
        setAllUsers((prev) => prev.map((u) => (u.id === freshUser.id ? freshUser : u)));
      }

      if (currentUser.role !== 'admin') {
        const invites = await dbOperations.getInvitations(currentUser.id).catch(() => []);
        if (Array.isArray(invites)) {
          setPendingInvitations(invites.filter((i) => i.status === 'pending'));
        }
      } else {
        const pending = await dbOperations.getProRequests({ role: 'admin', status: 'pending' }).catch(() => []);
        if (Array.isArray(pending)) setProRequests(pending);
      }

      if (activeTab === 'details' && selectedStartupId) {
        const chatRows = await dbOperations.getStartupChat(selectedStartupId, currentUser.id).catch(() => []);
        if (Array.isArray(chatRows)) setStartupChatMessages(chatRows);
      }
    };
    refreshLoop();
    const interval = setInterval(refreshLoop, 20000);
    return () => clearInterval(interval);
  }, [currentUser?.id, currentUser?.role, activeTab, selectedStartupId]);

  // --- HANDLERS ---

  const addNotification = async (userId, title, text, type = 'info', meta = null) => {
    const n = { 
      id: `n_${Date.now()}`, 
      user_id: userId, 
      title, 
      text, 
      type, 
      is_read: false, 
      meta,
      created_at: new Date().toISOString() 
    };
    
    await dbOperations.createNotification(n);
    
    if (currentUser && (userId === currentUser.id || userId === 'admin')) {
      setNotifications(prev => [n, ...prev]);
    }
  };

  const refreshAdminData = async () => {
    try {
      const [stats, logs, cats, cfg, pendingProRequests] = await Promise.all([
        dbOperations.getStats(),
        dbOperations.getAuditLogs(80),
        dbOperations.getCategories(),
        dbOperations.getProConfig().catch(() => null),
        dbOperations.getProRequests({ role: 'admin', status: 'pending' }).catch(() => [])
      ]);
      setAdminStats(stats);
      setAuditLogs(logs || []);
      if (cfg) {
        setProConfig(cfg);
        setAdminProConfigDraft(cfg);
      }
      setProRequests(Array.isArray(pendingProRequests) ? pendingProRequests : []);
      if (Array.isArray(cats) && cats.length > 0) {
        setCategories(cats.map(c => c.name));
      }
    } catch (e) {
      console.error('Admin ma\'lumotlarini yuklashda xatolik:', e);
    }
  };

  const handleAuth = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const email = fd.get('email');
    const pass = fd.get('password');

    if (authMode === 'login') {
      let user = await dbOperations.getUserByEmail(email).catch(() => null);

      if (!user && email === ADMIN_EMAIL && pass === ADMIN_PASS) {
        const existingAdmin = await dbOperations.getUserById('admin').catch(() => null);
        if (existingAdmin) {
          user = existingAdmin;
        } else {
          const createdAdmin = await dbOperations.createUser(buildDefaultAdminUser()).catch(() => null);
          if (createdAdmin) {
            user = createdAdmin;
            setAllUsers((prev) => [createdAdmin, ...prev.filter((u) => u.id !== createdAdmin.id)]);
          }
        }
      }

      if (user && user.banned) {
        alert('Sizning profilingiz vaqtincha bloklangan.');
        return;
      }

      if (user && user.password === pass) {
        setCurrentUser(user);
        localStorage.setItem('currentUserId', user.id);
        const userNotifs = await dbOperations.getNotifications(user.id).catch(() => []);
        setNotifications(Array.isArray(userNotifs) ? userNotifs : []);
        navigateTo(user.role === 'admin' ? 'admin' : 'explore');
      } else {
        alert('Xato email yoki parol');
      }
    } else {
      // Register
      const existingUser = await dbOperations.getUserByEmail(email);
      if (existingUser) {
        alert('Bu email allaqachon ro\'yxatdan o\'tgan');
        return;
      }

      const u = { 
        id: `u_${Date.now()}`, 
        email, 
        password: pass,
        name: fd.get('name'), 
        phone: fd.get('phone') || '', 
        role: 'user', 
        created_at: new Date().toISOString(), 
        skills: [], 
        languages: [], 
        tools: [],
        avatar: tempFileBase64 || `https://ui-avatars.com/api/?name=${encodeURIComponent(fd.get('name'))}&background=111&color=fff`,
        banner: '',
        cv_data: '',
        cv_file_name: '',
        cv_mime: '',
        cv_size: 0,
        cv_updated_at: null,
        is_pro: false,
        pro_status: 'free'
      };
      
      await dbOperations.createUser(u);
      setAllUsers(prev => [...prev, u]);
      setCurrentUser(u);
      localStorage.setItem('currentUserId', u.id);
      navigateTo('profile');
    }
    setShowAuthModal(false);
    setTempFileBase64(null);
  };

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (file) {
      const validation = validateImageFile(file);
      if (!validation.valid) return alert(validation.error);
      const base64 = await convertToBase64(file);
      setTempFileBase64(base64);
      if (isEditProfileModalOpen) setEditedUser(prev => ({ ...prev, avatar: base64 }));
    }
  };

  const handleBannerChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const validation = validateImageFile(file);
    if (!validation.valid) return alert(validation.error);
    const base64 = await convertToBase64(file);
    setTempBannerBase64(base64);
    setEditedUser((prev) => ({ ...prev, banner: base64 }));
  };

  const handleCvFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const validation = validateCvFile(file);
    if (!validation.valid) return alert(validation.error);
    const base64 = await convertToBase64(file);
    const ext = String(file.name || '').split('.').pop()?.toLowerCase();
    const mimeByExt = {
      pdf: 'application/pdf',
      doc: 'application/msword',
      docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    };
    const detectedMime = file.type || mimeByExt[ext] || 'application/pdf';
    setEditedUser((prev) => ({
      ...prev,
      cv_data: base64,
      cv_file_name: file.name,
      cv_mime: detectedMime,
      cv_size: Number(file.size || 0),
      cv_updated_at: new Date().toISOString()
    }));
  };

  const handleRemoveCv = () => {
    setEditedUser((prev) => ({
      ...prev,
      cv_data: '',
      cv_file_name: '',
      cv_mime: '',
      cv_size: 0,
      cv_updated_at: null
    }));
  };

  const handleOpenCv = (user) => {
    if (!user?.cv_data) return;
    const link = document.createElement('a');
    link.href = user.cv_data;
    link.target = '_blank';
    link.rel = 'noreferrer';
    link.click();
  };

  const handleDownloadCv = (user) => {
    if (!user?.cv_data) return;
    const link = document.createElement('a');
    link.href = user.cv_data;
    link.download = user.cv_file_name || 'cv';
    link.rel = 'noreferrer';
    link.click();
  };

  const handleProReceiptChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const validation = validateImageFile(file);
    if (!validation.valid) return alert(validation.error);
    const base64 = await convertToBase64(file);
    setProReceiptBase64(base64);
  };

  const navigateTo = (tab, id = null) => {
    setActiveTab(tab);
    if (id) {
      setSelectedStartupId(id);
      setActiveDetailTab('vazifalar');
    }
    setIsMobileMenuOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleJoinRequest = async (s) => {
    if (!currentUser) return openAuth('login');
    if (s.egasi_id === currentUser.id) return alert('O\'z loyihangizga qo\'shila olmaysiz.');
    if (s.a_zolar.some(m => m.user_id === currentUser.id)) return alert('Siz allaqachon jamoa a\'zosisiz.');
    
    const specialty = prompt('Mutaxassisligingiz (masalan: dizayner, backend dasturchi):');
    if (!specialty) return;

    const req = {
      id: `req_${Date.now()}`,
      startup_id: s.id,
      startup_name: s.nomi,
      user_id: currentUser.id,
      user_name: currentUser.name,
      user_phone: currentUser.phone,
      specialty,
      comment: 'Hamkorlik qilish istagi.',
      status: 'pending',
      created_at: new Date().toISOString()
    };

    const createdRequest = await dbOperations.createJoinRequest(req);
    setJoinRequests(prev => [createdRequest, ...prev.filter((x) => x.id !== createdRequest.id)]);
    
    await addNotification(
      s.egasi_id,
      'Yangi qo\'shilish so\'rovi',
      `"${currentUser.name}" "${s.nomi}" startupiga qo'shilmoqchi.`,
      'info',
      {
        type: 'join_request',
        join_request_id: createdRequest.id,
        startup_id: s.id,
        startup_name: s.nomi,
        requester_id: currentUser.id,
        requester_name: currentUser.name,
        requester_avatar: currentUser.avatar || '',
        requester_phone: currentUser.phone || '',
        specialty,
        comment: createdRequest.comment || ''
      }
    );
    alert('So\'rovingiz muvaffaqiyatli yuborildi!');
  };

  const handleRequestAction = async (id, action, options = {}) => {
    const { notificationId = null, requestPayload = null } = options;
    let r = joinRequests.find(x => x.id === id) || requestPayload || null;
    if (!r) {
      const latest = await dbOperations.getJoinRequests().catch(() => []);
      if (Array.isArray(latest)) {
        setJoinRequests(latest);
        r = latest.find((x) => x.id === id) || requestPayload || null;
      }
    }
    if (!r) {
      if (notificationId) {
        await handleMarkAsRead(notificationId).catch(() => null);
      }
      return alert('Bu so\'rov allaqachon ko\'rib chiqilgan yoki topilmadi.');
    }
    
    if (action === 'accept') {
      let startup = startups.find(s => s.id === r.startup_id);
      if (!startup) {
        const latestStartups = await dbOperations.getStartups().catch(() => []);
        if (Array.isArray(latestStartups)) {
          setStartups(latestStartups);
          startup = latestStartups.find((s) => s.id === r.startup_id);
        }
      }
      if (!startup) return alert('Startup topilmadi.');

      const newMember = { 
        user_id: r.user_id, 
        name: r.user_name, 
        role: r.specialty, 
        joined_at: new Date().toISOString() 
      };
      
      const memberAlreadyExists = startup.a_zolar.some((m) => m.user_id === r.user_id);
      const updatedAZolar = memberAlreadyExists ? startup.a_zolar : [...startup.a_zolar, newMember];
      if (!memberAlreadyExists) {
        await dbOperations.updateStartup(r.startup_id, { a_zolar: updatedAZolar });
        await dbOperations.logWorkspaceActivity(r.startup_id, {
          user_id: currentUser?.id || 'system',
          activity_type: 'member_joined',
          payload: { user_id: r.user_id, user_name: r.user_name, role: r.specialty },
          hours_spent: 0
        });
      }
      
      setStartups(prev => prev.map(s => 
        s.id === r.startup_id ? { ...s, a_zolar: updatedAZolar } : s
      ));
      
      await addNotification(r.user_id, 'Tabriklaymiz!', `Siz "${r.startup_name}" jamoasiga qabul qilindingiz.`, 'success');
    } else {
      await addNotification(
        r.user_id,
        'Qo\'shilish so\'rovi rad etildi',
        `"${r.startup_name}" jamoasi so'rovingizni rad etdi.`,
        'danger'
      );
    }
    
    await dbOperations.deleteRequest(id);
    setJoinRequests(prev => prev.filter(x => x.id !== id));
    if (notificationId) {
      await handleMarkAsRead(notificationId).catch(() => null);
    }
  };

  const handleAdminModeration = async (id, action) => {
    const reason = action === 'rejected' ? prompt('Rad etish sababi:') : undefined;
    if (action === 'rejected' && !reason) return;

    await dbOperations.updateStartup(id, { 
      status: action, 
      rejection_reason: reason 
    });
    
    setStartups(prev => prev.map(s => 
      s.id === id ? { ...s, status: action, rejection_reason: reason } : s
    ));
    
    const s = startups.find(x => x.id === id);
    if (s) {
      await addNotification(
        s.egasi_id, 
        action === 'approved' ? 'Loyiha tasdiqlandi' : 'Loyiha rad etildi', 
        action === 'approved' 
          ? `"${s.nomi}" loyihasi tasdiqlandi va platformada ko'rinadi.` 
          : `"${s.nomi}" loyihasi rad etildi. Sabab: ${reason}`, 
        action === 'approved' ? 'success' : 'danger'
      );
    }
  };

  const handleAdminUserRole = async (userId, role) => {
    try {
      const updated = await dbOperations.updateUserRole(userId, role, currentUser?.id);
      setAllUsers(prev => prev.map(u => u.id === userId ? updated : u));
      await refreshAdminData();
    } catch (e) {
      alert('Rolni o\'zgartirishda xatolik');
    }
  };

  const handleAdminUserBan = async (userId, banned) => {
    try {
      const updated = await dbOperations.setUserBanned(userId, banned, currentUser?.id);
      setAllUsers(prev => prev.map(u => u.id === userId ? updated : u));
      await refreshAdminData();
    } catch (e) {
      alert('Bloklashda xatolik');
    }
  };

  const handleAdminUserDelete = async (userId) => {
    if (!confirm('Foydalanuvchini o\'chirmoqchimisiz?')) return;
    try {
      await dbOperations.deleteUser(userId, currentUser?.id);
      setAllUsers(prev => prev.filter(u => u.id !== userId));
      await refreshAdminData();
    } catch (e) {
      alert('O\'chirishda xatolik');
    }
  };

  const handleAdminUserPro = async (userId, isPro) => {
    try {
      const updated = await dbOperations.setUserPro(userId, isPro, currentUser?.id);
      setAllUsers(prev => prev.map(u => u.id === userId ? updated : u));
      await refreshAdminData();
    } catch (e) {
      alert('Pro holatini o\'zgartirishda xatolik');
    }
  };

  const handleSaveProConfig = async () => {
    try {
      const updated = await dbOperations.updateProConfig({
        ...adminProConfigDraft,
        actor_id: currentUser?.id,
        actor_role: currentUser?.role
      });
      setProConfig(updated);
      setAdminProConfigDraft(updated);
      await refreshAdminData();
      alert('Pro sozlamalari saqlandi.');
    } catch (e) {
      alert('Pro sozlamalarini saqlashda xatolik.');
    }
  };

  const handleSubmitProRequest = async () => {
    if (!currentUser) return openAuth('login');
    if (!proRequestDraft.sender_full_name.trim() || !proRequestDraft.sender_card_number.trim()) {
      return alert('Karta egasi va karta raqamini kiriting.');
    }
    if (!proReceiptBase64) return alert('Chek rasmini yuklang.');
    try {
      const created = await dbOperations.submitProRequest({
        user_id: currentUser.id,
        user_name: currentUser.name,
        sender_full_name: proRequestDraft.sender_full_name,
        sender_card_number: proRequestDraft.sender_card_number,
        receipt_image: proReceiptBase64
      });
      setProRequests((prev) => [created, ...prev]);
      setShowProModal(false);
      setProReceiptBase64('');
      setProRequestDraft({ sender_full_name: '', sender_card_number: '' });
      alert('Pro so\'rov yuborildi. Admin tasdiqlashini kuting.');
    } catch (e) {
      alert(e?.message || 'Pro so\'rov yuborishda xatolik.');
    }
  };

  const handleReviewProRequest = async (requestId, action) => {
    if (currentUser?.role !== 'admin') return;
    const note = action === 'reject' ? prompt('Rad etish sababi (ixtiyoriy):') : '';
    try {
      await dbOperations.reviewProRequest(requestId, {
        action,
        admin_note: note || '',
        actor_id: currentUser.id,
        actor_role: currentUser.role
      });
      await Promise.all([
        refreshAdminData(),
        dbOperations.getUsers().then(setAllUsers)
      ]);
    } catch (e) {
      alert('Pro so\'rovni ko\'rib chiqishda xatolik.');
    }
  };

  const handleAdminStartupStatus = async (startupId, status) => {
    const reason = status === 'rejected' ? prompt('Rad etish sababi:') : null;
    if (status === 'rejected' && !reason) return;
    try {
      const updated = await dbOperations.updateStartupStatus(startupId, status, reason, currentUser?.id);
      setStartups(prev => prev.map(s => s.id === startupId ? updated : s));
      if (status === 'approved' || status === 'rejected') {
        const s = startups.find(x => x.id === startupId);
        if (s) {
          await addNotification(
            s.egasi_id,
            status === 'approved' ? 'Loyiha tasdiqlandi' : 'Loyiha rad etildi',
            status === 'approved'
              ? `"${s.nomi}" loyihasi tasdiqlandi va platformada ko'rinadi.`
              : `"${s.nomi}" loyihasi rad etildi. Sabab: ${reason}`,
            status === 'approved' ? 'success' : 'danger'
          );
        }
      }
      await refreshAdminData();
    } catch (e) {
      alert('Statusni o\'zgartirishda xatolik');
    }
  };

  const handleAdminStartupDelete = async (startupId) => {
    if (!confirm('Loyihani o\'chirmoqchimisiz?')) return;
    try {
      await dbOperations.deleteStartup(startupId, currentUser?.id);
      setStartups(prev => prev.filter(s => s.id !== startupId));
      await refreshAdminData();
    } catch (e) {
      alert('Loyihani o\'chirishda xatolik');
    }
  };

  const handleAddCategory = async () => {
    const name = prompt('Yangi kategoriya nomi:');
    if (!name) return;
    try {
      await dbOperations.createCategory(name, currentUser?.id);
      const cats = await dbOperations.getCategories();
      setCategories(cats.map(c => c.name));
      await refreshAdminData();
    } catch (e) {
      alert('Kategoriya qo\'shishda xatolik');
    }
  };

  const handleDeleteCategory = async (categoryName) => {
    if (!confirm(`"${categoryName}" kategoriyasini o'chirmoqchimisiz?`)) return;
    try {
      const cats = await dbOperations.getCategories();
      const cat = cats.find(c => c.name === categoryName);
      if (!cat) return;
      await dbOperations.deleteCategory(cat.id, currentUser?.id);
      const next = await dbOperations.getCategories();
      setCategories(next.map(c => c.name));
      await refreshAdminData();
    } catch (e) {
      alert('Kategoriya o\'chirishda xatolik');
    }
  };

  const handleCreateStartup = async (e) => {
    e.preventDefault();
    if (!currentUser) return;
    if (!canCreateStartup) {
      setShowProModal(true);
      return alert(`Bepul rejimda faqat ${freeStartupLimit} ta startup yaratish mumkin.`);
    }
    const fd = new FormData(e.currentTarget);
    const selectedTemplate = startupTemplates.find((template) => template.key === (fd.get('template_key') || selectedTemplateKey)) || activeTemplate;
    const specialistsRaw = String(fd.get('specialists') || '').trim();
    const specialists = specialistsRaw
      ? parseSkillsInput(specialistsRaw)
      : (selectedTemplate?.specialists || []);
    if (specialists.length === 0) {
      return alert("Kerakli mutaxassislarni kiriting.");
    }
    const s = {
      id: `s_${Date.now()}`,
      nomi: fd.get('nomi'),
      tavsif: fd.get('tavsif'),
      category: fd.get('category'),
      kerakli_mutaxassislar: specialists,
      logo: tempFileBase64 || 'https://via.placeholder.com/150/111/fff?text=Loyiha',
      egasi_id: currentUser.id,
      egasi_name: currentUser.name,
      status: 'pending_admin',
      yaratilgan_vaqt: new Date().toISOString(),
      a_zolar: [{ user_id: currentUser.id, name: currentUser.name, role: 'Asoschi', joined_at: new Date().toISOString() }],
      tasks: [],
      views: 0,
      github_url: fd.get('github_url') || '',
      website_url: fd.get('website_url') || '',
      template_key: selectedTemplate?.key || '',
      template_name: selectedTemplate?.name || '',
      segment: selectedTemplate?.segment || 'IT asoschisi + dasturchi',
      lifecycle_status: 'live',
      success_fee_percent: 1.5,
      registry_notes: ''
    };
    
    try {
      const createdStartup = await dbOperations.createStartup(s);
      setStartups(prev => [createdStartup, ...prev]);
      await addNotification('admin', 'Yangi ariza', `"${createdStartup.nomi}" loyihasi moderatsiya uchun yuborildi.`, 'info');
    } catch (error) {
      const message = String(error?.message || '');
      if (message.toLowerCase().includes('pro')) {
        setShowProModal(true);
      }
      return alert(message || 'Startup yaratishda xatolik.');
    }
    
    navigateTo('my-projects');
    setTempFileBase64(null);
    setStartupSpecialistsInput((selectedTemplate?.specialists || []).join(', '));
    alert('Loyiha muvaffaqiyatli yaratildi! Moderatsiyadan o\'tishini kuting.');
  };

  const handleUpdateProfile = async () => {
    if (!currentUser) return;
    const profileUpdates = {
      name: String(editedUser.name ?? currentUser.name ?? '').trim(),
      phone: String(editedUser.phone ?? currentUser.phone ?? '').trim(),
      bio: String(editedUser.bio ?? currentUser.bio ?? ''),
      avatar: editedUser.avatar ?? currentUser.avatar ?? '',
      banner: editedUser.banner ?? currentUser.banner ?? '',
      portfolio_url: String(editedUser.portfolio_url ?? currentUser.portfolio_url ?? '').trim(),
      skills: parseSkillsInput(editedSkillsText)
    };
    if (!profileUpdates.name) {
      return alert("Ism bo'sh bo'lmasligi kerak.");
    }

    const currentCv = {
      cv_data: String(currentUser.cv_data || ''),
      cv_file_name: String(currentUser.cv_file_name || ''),
      cv_mime: String(currentUser.cv_mime || ''),
      cv_size: Number(currentUser.cv_size || 0)
    };
    const nextCv = {
      cv_data: String(editedUser.cv_data ?? currentUser.cv_data ?? ''),
      cv_file_name: String(editedUser.cv_file_name ?? currentUser.cv_file_name ?? ''),
      cv_mime: String(editedUser.cv_mime ?? currentUser.cv_mime ?? ''),
      cv_size: Number(editedUser.cv_size ?? currentUser.cv_size ?? 0)
    };
    const cvChanged =
      nextCv.cv_data !== currentCv.cv_data ||
      nextCv.cv_file_name !== currentCv.cv_file_name ||
      nextCv.cv_mime !== currentCv.cv_mime ||
      nextCv.cv_size !== currentCv.cv_size;

    try {
      let savedUser = await dbOperations.updateUser(currentUser.id, profileUpdates);
      if (!savedUser) throw new Error('Profil saqlanmadi');

      if (cvChanged) {
        if (nextCv.cv_data) {
          savedUser = await dbOperations.uploadUserCv(currentUser.id, {
            actor_id: currentUser.id,
            actor_role: currentUser.role || '',
            ...nextCv
          });
        } else if (currentCv.cv_data) {
          savedUser = await dbOperations.deleteUserCv(
            currentUser.id,
            currentUser.id,
            currentUser.role || ''
          );
        }
      }

      setAllUsers(prev => prev.map(u => u.id === currentUser.id ? savedUser : u));
      setCurrentUser(savedUser);

      closeEditProfileModal();
      alert('Profil muvaffaqiyatli yangilandi!');
    } catch (e) {
      alert(e?.message || "Profilni saqlashda xatolik bo'ldi. Qayta urinib ko'ring.");
    }
  };

  const handleOpenUserProfile = async (userId) => {
    if (!userId) return;
    try {
      const user = allUsers.find((u) => u.id === userId) || await dbOperations.getUserById(userId);
      if (!user) return alert('Foydalanuvchi topilmadi.');
      setViewedUser(user);
      setIsUserProfileModalOpen(true);
      if (userId !== 'admin') {
        const rep = await dbOperations.getUserReputation(userId).catch(() => null);
        setViewedUserReputation(rep);
      } else {
        setViewedUserReputation(null);
      }
    } catch (e) {
      alert("Profilni ochishda xatolik bo'ldi.");
    }
  };

  const handleAddTask = async (startupId) => {
    if (!currentUser) return;
    const startup = startups.find((item) => item.id === startupId);
    if (!startup) return;
    const isMember = startup.egasi_id === currentUser.id || startup.a_zolar.some((member) => member.user_id === currentUser.id);
    if (!isMember) return alert("Vazifa qo'shish uchun startup a'zosi bo'lish kerak.");

    const title = String(taskDraft.title || '').trim();
    if (!title) return alert("Vazifa nomini kiriting.");
    if (taskDraft.deadline && Number.isNaN(new Date(taskDraft.deadline).getTime())) {
      return alert("Muddat formati noto'g'ri. YYYY-MM-DD ko'rinishida kiriting.");
    }

    const assignedToId = taskDraft.assigned_to_id || currentUser.id;
    const assignedMember = startup.a_zolar.find((member) => member.user_id === assignedToId);
    const newTask = {
      id: `t_${Date.now()}`,
      startup_id: startupId,
      title,
      description: taskDraft.description || '',
      assigned_to_id: assignedToId,
      assigned_to_name: assignedMember?.name || currentUser?.name || 'Belgilanmagan',
      deadline: taskDraft.deadline || '',
      priority: taskDraft.priority || 'medium',
      estimate_hours: Number(taskDraft.estimate_hours || 0),
      actual_hours: Number(taskDraft.actual_hours || 0),
      calendar_tag: taskDraft.calendar_tag || 'backlog',
      created_by: currentUser.id,
      actor_id: currentUser.id,
      status: 'todo'
    };

    try {
      await dbOperations.createTask(newTask);
      await refreshWorkspaceAndStartup(startupId);
      setTaskDraft({
        ...EMPTY_TASK_DRAFT,
        assigned_to_id: currentUser.id
      });
      alert("Vazifa muvaffaqiyatli qo'shildi!");
    } catch (e) {
      alert(e?.message || "Vazifa qo'shishda xatolik.");
    }
  };

  const handleMoveTask = async (startupId, taskId, newStatus) => {
    try {
      await dbOperations.updateTaskStatus(taskId, newStatus, currentUser?.id || '');
      await refreshWorkspaceAndStartup(startupId);
    } catch (e) {
      alert(e?.message || "Vazifa statusini o'zgartirishda xatolik.");
    }
  };

  const handleDeleteTask = async (startupId, taskId) => {
    if (!confirm('Vazifani o\'chirmoqchimisiz?')) return;
    try {
      await dbOperations.deleteTask(taskId, currentUser?.id || '');
      await refreshWorkspaceAndStartup(startupId);
      alert("Vazifa o'chirildi!");
    } catch (e) {
      alert(e?.message || "Vazifani o'chirishda xatolik.");
    }
  };

  const handleDeleteStartup = async (startupId) => {
    if (!confirm('Loyihani butunlay o\'chirmoqchimisiz? Bu harakatni qaytarib bo\'lmaydi!')) return;
    
    await dbOperations.deleteStartup(startupId);
    setStartups(prev => prev.filter(s => s.id !== startupId));
    navigateTo('my-projects');
    alert('Loyiha o\'chirildi!');
  };

  const handleSendAIMessage = async () => {
    if (!aiInput.trim() || aiLoading) return;
    const userMsg = { 
      id: `m_${Date.now()}`, 
      text: aiInput, 
      sender: 'user', 
      timestamp: new Date().toISOString() 
    };
    setAiChat(prev => [...prev, userMsg]);
    const promptText = aiInput;
    setAiInput('');
    setAiLoading(true);
    try {
      const history = aiChat.map(m => ({ 
        text: m.text, 
        role: m.sender === 'user' ? 'user' : 'model'
      }));
      const responseText = await getAIMentorResponse(history, promptText);
      const aiMsg = { 
        id: `ai_${Date.now()}`, 
        text: responseText, 
        sender: 'ai', 
        timestamp: new Date().toISOString() 
      };
      setAiChat(prev => [...prev, aiMsg]);
    } catch (e) {
      const errMsg = { 
        id: 'err', 
        text: "Hozirda AI bilan bog'lana olmayapman. Gemini API kalitini tekshiring.", 
        sender: 'ai', 
        timestamp: new Date().toISOString() 
      };
      setAiChat(prev => [...prev, errMsg]);
    } finally {
      setAiLoading(false);
    }
  };

  const handleLogout = () => {
    setCurrentUser(null);
    setProRequests([]);
    localStorage.removeItem('currentUserId');
    navigateTo('explore');
    alert('Tizimdan muvaffaqiyatli chiqdingiz!');
  };

  const handleMarkAllAsRead = async () => {
    if (!currentUser) return;
    
    await dbOperations.markAllNotificationsAsRead(currentUser.id);
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
  };

  const handleMarkAsRead = async (notifId) => {
    await dbOperations.markNotificationAsRead(notifId);
    setNotifications(prev => prev.map(n => n.id === notifId ? { ...n, is_read: true } : n));
  };

  const handleStartupChatFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) {
      alert("Fayl hajmi 8MB dan oshmasligi kerak.");
      e.target.value = '';
      return;
    }
    try {
      const base64 = await convertToBase64(file);
      setStartupChatAttachment({
        name: file.name,
        type: file.type || 'application/octet-stream',
        url: base64
      });
    } catch {
      alert("Faylni o'qishda xatolik.");
    } finally {
      e.target.value = '';
    }
  };

  const handleSendStartupMessage = async () => {
    if (!selectedStartup || !currentUser || startupChatSending) return;
    const text = startupChatText.trim();
    if (!text && !startupChatAttachment) return;

    const messageType = startupChatAttachment
      ? (startupChatAttachment.type.startsWith('image/') ? 'image' : 'file')
      : 'text';

    setStartupChatSending(true);
    try {
      const created = await dbOperations.sendStartupChat(selectedStartup.id, {
        user_id: currentUser.id,
        message_type: messageType,
        content: text,
        file_name: startupChatAttachment?.name || '',
        file_url: startupChatAttachment?.url || ''
      });
      setStartupChatMessages((prev) => [...prev, created]);
      setStartupChatText('');
      setStartupChatAttachment(null);
    } catch (e) {
      alert(e?.message || "Xabar yuborishda xatolik.");
    } finally {
      setStartupChatSending(false);
    }
  };

  const handleSendStartupInvite = async (candidate) => {
    if (!selectedStartup || !currentUser) return;
    try {
      await dbOperations.sendStartupInvitation(selectedStartup.id, {
        inviter_id: currentUser.id,
        invitee_id: candidate.id,
        role_hint: (candidate?.matched_specialties || [])[0] || "Mutaxassis"
      });
      alert('Taklif yuborildi.');
      const recRows = await dbOperations.getStartupRecommendations(selectedStartup.id, currentUser.id).catch(() => []);
      if (Array.isArray(recRows)) setMemberRecommendations(recRows);
    } catch (e) {
      alert(e?.message || "Taklif yuborishda xatolik.");
    }
  };

  const handleRespondInvitation = async (invitationId, action, notificationId = null) => {
    if (!currentUser) return;
    try {
      await dbOperations.respondInvitation(invitationId, {
        user_id: currentUser.id,
        action
      });
      if (notificationId) {
        await dbOperations.markNotificationAsRead(notificationId).catch(() => null);
      }
      const [nextNotifs, nextInvites] = await Promise.all([
        dbOperations.getNotifications(currentUser.id).catch(() => []),
        dbOperations.getInvitations(currentUser.id).catch(() => [])
      ]);
      if (Array.isArray(nextNotifs)) setNotifications(nextNotifs);
      if (Array.isArray(nextInvites)) setPendingInvitations(nextInvites.filter((i) => i.status === 'pending'));
      await reloadStartups();
      if (selectedStartupId) await loadWorkspaceContext(selectedStartupId);
    } catch (e) {
      alert(e?.message || 'Taklifga javob berishda xatolik.');
    }
  };

  const renderLinkifiedText = (text) => {
    const value = String(text || '');
    const parts = value.split(URL_REGEX);
    return parts.map((part, index) => {
      const isLink = /^https?:\/\//i.test(part);
      if (!isLink) return <React.Fragment key={`${part}-${index}`}>{part}</React.Fragment>;
      return (
        <a
          key={`${part}-${index}`}
          href={part}
          target="_blank"
          rel="noreferrer"
          className="underline break-all font-semibold"
        >
          {part}
        </a>
      );
    });
  };

  const refreshWorkspaceAndStartup = async (startupId = selectedStartupId) => {
    if (!startupId) return;
    await Promise.all([loadWorkspaceContext(startupId), reloadStartups()]);
  };

  const handleSubmitPeerReview = async () => {
    if (!selectedStartup || !currentUser) return;
    if (!reviewDraft.to_user_id) return alert("Kimga baho berishni tanlang.");
    try {
      await dbOperations.createPeerReview(selectedStartup.id, {
        from_user_id: currentUser.id,
        to_user_id: reviewDraft.to_user_id,
        rating: Number(reviewDraft.rating || 5),
        task_delivery: Number(reviewDraft.task_delivery || 5),
        collaboration: Number(reviewDraft.collaboration || 5),
        reliability: Number(reviewDraft.reliability || 5),
        comment: reviewDraft.comment || ''
      });
      setReviewDraft({
        to_user_id: '',
        rating: 5,
        task_delivery: 5,
        collaboration: 5,
        reliability: 5,
        comment: ''
      });
      await refreshWorkspaceAndStartup(selectedStartup.id);
    } catch (e) {
      alert("Jamoa bahosini yuborishda xatolik.");
    }
  };

  const handleCreateDecision = async () => {
    if (!selectedStartup || !currentUser) return;
    if (!decisionDraft.title.trim()) return alert("Qaror sarlavhasini kiriting.");
    try {
      await dbOperations.createDecision(selectedStartup.id, {
        title: decisionDraft.title,
        description: decisionDraft.description,
        proposer_id: currentUser.id
      });
      setDecisionDraft({ title: '', description: '' });
      await refreshWorkspaceAndStartup(selectedStartup.id);
    } catch (e) {
      alert("Qaror yaratishda xatolik.");
    }
  };

  const handleVoteDecision = async (decisionId, vote) => {
    if (!currentUser) return;
    try {
      await dbOperations.voteDecision(decisionId, { voter_id: currentUser.id, vote });
      await refreshWorkspaceAndStartup(selectedStartup?.id);
    } catch (e) {
      alert("Ovoz berishda xatolik.");
    }
  };

  const handleCreateMemberVote = async () => {
    if (!selectedStartup || !currentUser) return;
    if (!voteCaseDraft.target_user_id || !voteCaseDraft.reason.trim()) {
      return alert("Nomzod va sabab majburiy.");
    }
    try {
      await dbOperations.createMemberVote(selectedStartup.id, {
        target_user_id: voteCaseDraft.target_user_id,
        reason: voteCaseDraft.reason,
        proposer_id: currentUser.id
      });
      setVoteCaseDraft({ target_user_id: '', reason: '' });
      await refreshWorkspaceAndStartup(selectedStartup.id);
    } catch (e) {
      alert("Asoschi ovozini ochishda xatolik.");
    }
  };

  const handleCastMemberVote = async (voteCaseId, vote) => {
    if (!currentUser) return;
    try {
      await dbOperations.castMemberVote(voteCaseId, { voter_id: currentUser.id, vote });
      await refreshWorkspaceAndStartup(selectedStartup?.id);
    } catch (e) {
      alert("Asoschi ovozida xatolik.");
    }
  };

  const handleUpsertEquity = async () => {
    if (!selectedStartup || !currentUser) return;
    if (!equityDraft.user_id || !equityDraft.share_percent) return alert("A'zo va ulush foizini kiriting.");
    try {
      await dbOperations.upsertEquity(selectedStartup.id, {
        user_id: equityDraft.user_id,
        share_percent: Number(equityDraft.share_percent),
        vesting_months: Number(equityDraft.vesting_months || 48),
        cliff_months: Number(equityDraft.cliff_months || 12),
        notes: equityDraft.notes,
        status: 'active'
      });
      setEquityDraft({
        user_id: '',
        share_percent: '',
        vesting_months: 48,
        cliff_months: 12,
        notes: ''
      });
      await refreshWorkspaceAndStartup(selectedStartup.id);
    } catch (e) {
      alert("Ulush yozishda xatolik.");
    }
  };

  const handleArchiveEquity = async (equityId) => {
    if (!confirm("Bu ulush yozuvini arxiv qilasizmi?")) return;
    try {
      await dbOperations.archiveEquity(equityId);
      await refreshWorkspaceAndStartup(selectedStartup?.id);
    } catch (e) {
      alert("Ulushni arxivlashda xatolik.");
    }
  };

  const handleCreateAgreement = async () => {
    if (!selectedStartup) return;
    if (!agreementDraft.title.trim() || !agreementDraft.body.trim()) {
      return alert("Kelishuv sarlavhasi va matni majburiy.");
    }
    try {
      await dbOperations.createAgreement(selectedStartup.id, {
        title: agreementDraft.title,
        body: agreementDraft.body,
        status: agreementDraft.status,
        signed_by: []
      });
      setAgreementDraft({ title: '', body: '', status: 'draft' });
      await refreshWorkspaceAndStartup(selectedStartup.id);
    } catch (e) {
      alert("Kelishuv yaratishda xatolik.");
    }
  };

  const handleSignAgreement = async (agreement) => {
    if (!currentUser) return;
    const signedBy = Array.isArray(agreement.signed_by) ? agreement.signed_by : [];
    if (signedBy.includes(currentUser.id)) return;
    try {
      await dbOperations.updateAgreement(agreement.id, {
        signed_by: [...signedBy, currentUser.id],
        status: 'active'
      });
      await refreshWorkspaceAndStartup(selectedStartup?.id);
    } catch (e) {
      alert("Kelishuvni imzolashda xatolik.");
    }
  };

  const handleCreateInvestorIntro = async () => {
    if (!selectedStartup || !currentUser) return;
    if (!investorDraft.investor_name.trim()) return alert("Investor nomini kiriting.");
    try {
      await dbOperations.createInvestorIntro(selectedStartup.id, {
        investor_name: investorDraft.investor_name,
        introduced_by: currentUser.id,
        stage: investorDraft.stage,
        amount: Number(investorDraft.amount || 0),
        status: investorDraft.status,
        notes: investorDraft.notes
      });
      setInvestorDraft({
        investor_name: '',
        stage: 'seed',
        amount: '',
        status: 'planned',
        notes: ''
      });
      await refreshWorkspaceAndStartup(selectedStartup.id);
    } catch (e) {
      alert("Investor bo'yicha yozuv yaratishda xatolik.");
    }
  };

  const handleUpdateRegistry = async () => {
    if (!selectedStartup || !currentUser) return;
    try {
      await dbOperations.updateStartupRegistry(selectedStartup.id, {
        lifecycle_status: registryDraft.lifecycle_status,
        success_fee_percent: Number(registryDraft.success_fee_percent || 1.5),
        registry_notes: registryDraft.registry_notes,
        actor_id: currentUser.id
      });
      await refreshWorkspaceAndStartup(selectedStartup.id);
    } catch (e) {
      alert("Ro'yxat ma'lumotini yangilashda xatolik.");
    }
  };

  // --- FILTERS ---
  const filtered = useMemo(() => {
    return startups.filter(s => 
      s.status === 'approved' && 
      (selectedCategory === 'Hammasi' || s.category === selectedCategory) &&
      (s.nomi.toLowerCase().includes(searchTerm.toLowerCase()) || s.tavsif.toLowerCase().includes(searchTerm.toLowerCase()))
    );
  }, [startups, selectedCategory, searchTerm]);

  const myStartups = useMemo(() => 
    currentUser ? startups.filter(s => s.egasi_id === currentUser.id || s.a_zolar.some(m => m.user_id === currentUser.id)) : [], 
    [startups, currentUser]
  );
  
  const incomingRequests = useMemo(() => 
    currentUser ? joinRequests.filter(r => startups.find(s => s.id === r.startup_id && s.egasi_id === currentUser.id)) : [], 
    [joinRequests, startups, currentUser]
  );
  
  const userNotifications = useMemo(() => 
    notifications.filter(n => n.user_id === currentUser?.id || (currentUser?.role === 'admin' && n.user_id === 'admin')), 
    [notifications, currentUser]
  );
  
  const unreadNotifCount = userNotifications.filter(n => !n.is_read).length;
  const invitationByNotification = useMemo(
    () => Object.fromEntries((pendingInvitations || []).map((inv) => [inv.notification_id, inv])),
    [pendingInvitations]
  );
  const joinRequestById = useMemo(
    () => Object.fromEntries((joinRequests || []).map((req) => [req.id, req])),
    [joinRequests]
  );
  const usersById = useMemo(
    () => Object.fromEntries((allUsers || []).map((user) => [user.id, user])),
    [allUsers]
  );

  const selectedStartup = startups.find(s => s.id === selectedStartupId);
  const workspaceData = workspaceContext || {};
  const workspaceReputation = workspaceData.reputation || { members: [], edges: [] };
  const workspaceDecisions = workspaceData.decisions || [];
  const workspaceMemberVotes = workspaceData.member_votes || [];
  const workspaceEquity = workspaceData.equity || [];
  const workspaceAgreements = workspaceData.agreements || [];
  const workspaceInvestorIntros = workspaceData.investor_intros || [];
  const workspaceReviews = workspaceData.reviews || [];
  const workspaceAiRisk = workspaceData.ai_risk || null;
  const workspaceKpi = workspaceData.kpi || null;
  const workspaceWeeklyReport = workspaceData.weekly_report || null;
  const startupTasks = Array.isArray(selectedStartup?.tasks) ? selectedStartup.tasks : [];
  const filteredStartupTasks = useMemo(() => {
    const q = taskSearch.toLowerCase().trim();
    return startupTasks.filter((task) => {
      if (q) {
        const text = `${task.title || ''} ${task.description || ''} ${task.assigned_to_name || ''}`.toLowerCase();
        if (!text.includes(q)) return false;
      }
      if (taskFilter === 'mine' && task.assigned_to_id !== currentUser?.id) return false;
      const deadlineState = getTaskDeadlineState(task);
      if (taskFilter === 'overdue' && deadlineState !== 'overdue') return false;
      if (taskFilter === 'today' && deadlineState !== 'today') return false;
      if (taskFilter === 'week' && !['today', 'week'].includes(deadlineState)) return false;
      if (taskFilter === 'critical' && !['high', 'critical'].includes(task.priority)) return false;
      return true;
    });
  }, [startupTasks, taskSearch, taskFilter, currentUser?.id]);
  const visibleTaskCounts = useMemo(() => ({
    todo: filteredStartupTasks.filter((task) => task.status === 'todo').length,
    'in-progress': filteredStartupTasks.filter((task) => task.status === 'in-progress').length,
    done: filteredStartupTasks.filter((task) => task.status === 'done').length
  }), [filteredStartupTasks]);
  const equityTotal = workspaceEquity
    .filter((e) => e.status !== 'archived')
    .reduce((acc, e) => acc + Number(e.share_percent || 0), 0);
  const ownedStartupsCount = currentUser ? startups.filter((s) => s.egasi_id === currentUser.id).length : 0;
  const proEnabled = proConfig?.pro_enabled !== false;
  const isProUser = !!currentUser?.is_pro || currentUser?.role === 'admin';
  const hasProAccess = !proEnabled || isProUser;
  const freeStartupLimit = Number(proConfig?.startup_limit_free || 1);
  const canCreateStartup = !currentUser || !proEnabled || isProUser || ownedStartupsCount < freeStartupLimit;

  const renderProLocked = (title = 'Bu bo\'lim Pro uchun') => (
    <div className="max-w-xl mx-auto mt-6">
      <div className="bg-white/80 backdrop-blur border border-slate-200 rounded-3xl p-8 shadow-xl text-center space-y-4">
        <div className="w-14 h-14 mx-auto rounded-2xl bg-amber-50 border border-amber-200 text-amber-600 flex items-center justify-center">
          <i className="fa-solid fa-crown text-xl"></i>
        </div>
        <h3 className="text-lg font-black tracking-tight">{title}</h3>
        <p className="text-[13px] text-gray-500">
          {proConfig?.plan_name || 'GarajHub Pro'} bilan ushbu bo'limlar ochiladi. To'lov yuborib Pro holatga o'ting.
        </p>
        <div className="flex justify-center">
          <Button onClick={() => setShowProModal(true)} className="px-7">Pro ga o'tish</Button>
        </div>
      </div>
    </div>
  );

  const topNavItems = [
    { key: 'explore', label: 'Kashf', icon: 'fa-compass' },
    { key: 'my-projects', label: 'Loyiha', icon: 'fa-layer-group', auth: true },
    { key: 'create', label: 'Yarat', icon: 'fa-plus' },
    { key: 'inbox', label: 'Xabar', icon: 'fa-bell', auth: true },
    { key: 'profile', label: 'Profil', icon: 'fa-user', auth: true }
  ];
  const activeTabTitle = {
    explore: 'Kashfiyot',
    'my-projects': 'Loyihalarim',
    create: 'Yaratish',
    inbox: 'Xabarlar',
    profile: 'Profil',
    details: 'Loyiha',
    requests: "So'rovlar",
    admin: 'Boshqaruv'
  }[activeTab] || activeTab;

  const mapStatusText = (value) => {
    const map = {
      pending_admin: 'Moderatsiyada',
      pending: 'Kutilmoqda',
      approved: 'Tasdiqlangan',
      rejected: 'Rad etilgan',
      open: 'Ochiq',
      resolved: 'Yakunlangan',
      active: 'Faol',
      blocked: 'Bloklangan',
      archived: 'Arxiv',
      draft: 'Qoralama',
      locked: 'Qulflangan',
      planned: 'Rejalangan',
      introduced: 'Tanishtirilgan',
      meeting: 'Uchrashuv',
      won: 'Yakunlangan',
      lost: "To'xtatilgan",
      live: 'Faol',
      pivoted: "Yo'nalish o'zgargan",
      closed: 'Yopilgan',
      acquired: 'Sotilgan',
      keep: 'Qoldirish',
      remove: 'Chiqarish'
    };
    return map[value] || value;
  };

  const mapRoleText = (value) => {
    if (value === 'admin') return 'Admin';
    if (value === 'user') return 'Foydalanuvchi';
    return value;
  };

  const mapRiskLevelText = (value) => {
    const map = { high: 'yuqori', medium: "o'rtacha", low: 'past' };
    return map[value] || value;
  };

  const mapRiskTypeText = (value) => {
    const map = {
      deadline: 'muddat',
      execution: 'bajarilish',
      delivery: 'yetkazish',
      governance: 'boshqaruv',
      team: 'jamoa',
      equity: 'ulush',
      activity: 'faollik'
    };
    return map[value] || value;
  };

  // --- RENDERERS ---

  const renderSidebar = () => (
    <>
      <div className={`fixed inset-0 bg-gray-900/40 z-[80] lg:hidden backdrop-blur-sm transition-all duration-300 ${isMobileMenuOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`} onClick={() => setIsMobileMenuOpen(false)} />
      <aside className={`fixed lg:relative z-[90] w-[260px] md:w-[240px] h-full bg-white border-r border-gray-100 flex flex-col p-6 md:p-8 transition-transform duration-300 ease-in-out ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}>
        <div className="flex items-center justify-between mb-10">
          <div className="flex items-center gap-3 cursor-pointer group" onClick={() => navigateTo('explore')}>
            <div className="w-10 h-10 flex items-center justify-center transition-transform"><img src={Logo} alt="Logo" /></div>
            <span className="text-[18px] font-extrabold tracking-tighter text-gray-900">GarajHub</span>
          </div>
          <button onClick={() => setIsMobileMenuOpen(false)} className="lg:hidden text-gray-400 p-2"><i className="fa-solid fa-xmark text-lg"></i></button>
        </div>

        <nav className="flex-grow space-y-1 overflow-y-auto custom-scrollbar pr-2">
          <NavItem active={activeTab === 'explore'} onClick={() => navigateTo('explore')} label="Kashfiyot" icon="fa-compass" />
          {currentUser && <NavItem active={activeTab === 'my-projects'} onClick={() => navigateTo('my-projects')} label="Loyihalarim" icon="fa-rocket" />}
          {currentUser && <NavItem active={activeTab === 'requests'} onClick={() => navigateTo('requests')} label="So'rovlar" icon="fa-user-group" badge={incomingRequests.length} />}
          {currentUser && <NavItem active={activeTab === 'profile'} onClick={() => navigateTo('profile')} label="Profil" icon="fa-user" />}
          {currentUser?.role === 'admin' && (
            <div className="pt-8">
              <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest px-4 mb-3">Moderatsiya</p>
              <NavItem active={activeTab === 'admin'} onClick={() => navigateTo('admin')} label="Arizalar" icon="fa-shield-check" badge={startups.filter(s => s.status === 'pending_admin').length} />
            </div>
          )}
        </nav>

        <div className="mt-auto pt-8 border-t border-gray-100">
          {currentUser ? (
            <div className="flex items-center gap-3 group">
              <img src={currentUser.avatar} className="w-10 h-10 rounded-full border border-gray-100 object-cover" alt="Avatar" />
              <div className="flex-grow min-w-0">
                <p className="text-[13px] font-bold text-gray-900 truncate">{currentUser.name}</p>
                <p className="text-[11px] text-gray-400 truncate">{currentUser.email}</p>
              </div>
              <button onClick={handleLogout} className="text-gray-300 hover:text-rose-600 transition-colors shrink-0 p-1">
                <i className="fa-solid fa-power-off text-sm"></i>
              </button>
            </div>
          ) : (
            <Button onClick={() => openAuth('register')} className="w-full">Tizimga kirish</Button>
          )}
        </div>
      </aside>
    </>
  );

  const NavItem = ({ active, onClick, label, icon, badge }) => (
    <button
      onClick={onClick}
      className={`w-full flex items-center h-10 px-4 rounded-lg transition-all relative ${active ? 'bg-black text-white shadow-md' : 'text-gray-600 hover:bg-gray-50'}`}
    >
      <i className={`fa-solid ${icon} w-5 text-[14px] ${active ? 'text-white' : 'text-gray-400'} mr-3`}></i>
      <span className="text-[13px] font-semibold">{label}</span>
      {badge > 0 && (
        <span className={`absolute right-4 h-5 min-w-[20px] flex items-center justify-center text-[10px] font-black rounded-full px-1.5 ${active ? 'bg-white text-black' : 'bg-black text-white'}`}>
          {badge}
        </span>
      )}
    </button>
  );

  const renderExplore = () => (
    <div className="space-y-8 md:space-y-12 animate-in fade-in">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="space-y-2">
          <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight italic">Innovatsiyalarni kashf eting</h1>
          <p className="text-gray-500 text-[14px] md:text-[15px]">O'zbekistondagi eng yaxshi startuplar va jamoalar.</p>
        </div>
        {currentUser && <Button onClick={() => navigateTo('create')} icon="fa-plus" className="w-full md:w-auto h-12 md:h-10">Loyiha Yaratish</Button>}
      </header>

      <div className="flex flex-col gap-6">
        <div className="relative group w-full md:max-w-lg">
          <i className="fa-solid fa-magnifying-glass absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-black transition-colors"></i>
          <input 
            type="text" placeholder="Startup yoki ko'nikma..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
            className="w-full h-12 md:h-11 bg-white border border-gray-200 rounded-lg pl-11 pr-4 text-[14px] focus:border-black outline-none transition-all shadow-sm"
          />
        </div>
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar -mx-4 px-4 pb-2 md:mx-0 md:px-0">
          {['Hammasi', ...categories].map(c => (
            <button 
              key={c} onClick={() => setSelectedCategory(c)} 
              className={`h-8 px-4 rounded-full text-[12px] font-semibold border transition-all whitespace-nowrap ${selectedCategory === c ? 'bg-black border-black text-white' : 'bg-white border-gray-200 text-gray-600 hover:border-black'}`}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6">
        {filtered.map(s => (
          <div key={s.id} onClick={() => navigateTo('details', s.id)} className="bg-white border border-gray-100 rounded-xl p-5 md:p-6 flex flex-col hover:border-black hover:shadow-lg transition-all group relative overflow-hidden cursor-pointer">
            <div className="flex items-start justify-between mb-4 md:mb-6">
              <img src={s.logo} className="w-12 h-12 md:w-14 md:h-14 bg-gray-50 object-cover rounded-lg border border-gray-100 shadow-sm" alt="Logo" />
              <Badge>{s.category}</Badge>
            </div>
            <div className="flex-grow space-y-2 md:space-y-3 mb-6 md:mb-8">
              <h3 className="text-base md:text-[18px] font-extrabold text-gray-900 tracking-tight leading-tight group-hover:pl-1 transition-all">{s.nomi}</h3>
              <p className="text-gray-500 text-[13px] md:text-[14px] leading-relaxed line-clamp-2">"{s.tavsif}"</p>
            </div>
            <div className="flex items-center justify-between pt-4 md:pt-6 border-t border-gray-50">
              <div className="flex -space-x-2">
                {s.a_zolar.slice(0, 3).map((m, i) => (
                  <div key={i} className="w-7 h-7 md:w-8 md:h-8 rounded-full bg-gray-100 border-2 border-white flex items-center justify-center text-[9px] md:text-[10px] font-bold text-gray-700 uppercase" title={m.name}>
                    {m.name[0]}
                  </div>
                ))}
                {s.a_zolar.length > 3 && (
                  <div className="w-7 h-7 md:w-8 md:h-8 rounded-full bg-black text-white border-2 border-white flex items-center justify-center text-[8px] md:text-[9px] font-bold">
                    +{s.a_zolar.length - 3}
                  </div>
                )}
              </div>
              <Button onClick={(e) => { e.stopPropagation(); handleJoinRequest(s); }} variant="secondary" size="sm">Qo'shilish</Button>
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="col-span-full py-16 bg-gray-50/50 rounded-2xl border-2 border-dashed border-gray-200 flex flex-col items-center justify-center opacity-50">
            <i className="fa-solid fa-rocket-launch text-3xl md:text-4xl text-gray-200 mb-4"></i>
            <p className="text-[12px] md:text-[13px] font-bold uppercase tracking-widest text-center px-4">Hech qanday startup topilmadi</p>
          </div>
        )}
      </div>
    </div>
  );

  const renderCreateStartup = () => {
    if (!currentUser) {
      return <EmptyState icon="fa-lock" title="Kirish talab qilinadi" subtitle="Startup yaratish uchun tizimga kiring" action={<Button onClick={() => openAuth('login')}>Kirish</Button>} />;
    }
    if (!canCreateStartup) {
      return (
        <div className="max-w-[620px] mx-auto">
          <div className="bg-white border border-amber-200 rounded-3xl p-8 md:p-10 shadow-xl space-y-5">
            <div className="w-14 h-14 rounded-2xl bg-amber-50 border border-amber-200 text-amber-600 flex items-center justify-center">
              <i className="fa-solid fa-crown text-xl"></i>
            </div>
            <h2 className="text-2xl font-black tracking-tight">Bepul limit tugadi</h2>
            <p className="text-[14px] text-gray-600">
              Bepul rejimda maksimal {freeStartupLimit} ta startup yaratish mumkin. Pro bo'lsangiz cheksiz startup yarata olasiz.
            </p>
            <div className="bg-slate-900 text-white rounded-2xl p-5">
              <p className="text-[11px] uppercase tracking-[0.18em] text-slate-300 font-bold">{proConfig.plan_name}</p>
              <p className="text-2xl font-black mt-2">{proConfig.price_text}</p>
            </div>
            <div className="flex gap-3">
              <Button variant="secondary" onClick={() => navigateTo('my-projects')} className="flex-1">Orqaga</Button>
              <Button onClick={() => setShowProModal(true)} icon="fa-credit-card" className="flex-1">Pro olish</Button>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="max-w-[600px] mx-auto animate-in slide-up">
        <div className="flex items-center gap-4 mb-8 md:mb-10">
          <button onClick={() => navigateTo('explore')} className="text-gray-400 hover:text-black transition-colors p-2"><i className="fa-solid fa-arrow-left text-lg"></i></button>
          <h1 className="text-xl md:text-2xl font-extrabold italic tracking-tight">Yangi startup yaratish</h1>
        </div>

        <form onSubmit={handleCreateStartup} className="bg-white border border-gray-200 rounded-2xl p-6 md:p-8 space-y-6 md:space-y-8 shadow-md">
          <FileUpload label="Startup logotipi" onChange={handleFileChange} preview={tempFileBase64 || undefined} />

          <div className="space-y-3">
            <label className="block text-[11px] font-bold text-gray-700 uppercase tracking-widest ml-1">Startup template</label>
            <select
              name="template_key"
              value={selectedTemplateKey}
              onChange={(e) => setSelectedTemplateKey(e.target.value)}
              className="w-full h-[44px] bg-white border border-gray-200 rounded-lg px-4 text-[14px] outline-none focus:border-black shadow-sm"
            >
              {startupTemplates.map((template) => (
                <option key={template.key} value={template.key}>
                  {template.name}
                </option>
              ))}
            </select>
            {activeTemplate && (
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                <p className="text-[12px] font-semibold text-slate-700">{activeTemplate.description}</p>
                <p className="text-[11px] text-slate-500 mt-1">
                  Segment: {activeTemplate.segment} | Standart mutaxassislar: {(activeTemplate.specialists || []).join(', ')}
                </p>
              </div>
            )}
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 md:gap-6">
            <Input required name="nomi" label="Startup nomi" placeholder="Rocket.io" icon="fa-rocket" />
            <div className="space-y-1.5 w-full">
              <label className="block text-[11px] font-bold text-gray-700 uppercase tracking-widest ml-1">Kategoriya</label>
              <select name="category" className="w-full h-[44px] bg-white border border-gray-200 rounded-lg px-4 text-[14px] outline-none focus:border-black shadow-sm">
                {categories.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>

          <div className="space-y-1.5 w-full">
            <p className="text-[11px] text-gray-500 ml-1">Kategoriya va tavsifga e'tibor bering, keyin jamoangizni tuzasiz.</p>
          </div>

          <TextArea required name="tavsif" label="Tavsif" placeholder="Startupingizning asosiy maqsadi..." />
          
          <Input
            required
            name="specialists"
            label="Kerakli Mutaxassislar"
            helper="Vergul bilan ajrating"
            placeholder="Frontend, UI/UX Designer"
            icon="fa-users"
            value={startupSpecialistsInput}
            onChange={(e) => setStartupSpecialistsInput(e.target.value)}
          />
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 md:gap-6">
            <Input name="github_url" label="GitHub" placeholder="https://github.com/..." icon="fa-github" />
            <Input name="website_url" label="Veb-sayt" placeholder="https://..." icon="fa-globe" />
          </div>

          <div className="flex flex-col sm:flex-row gap-3 md:gap-4 pt-6 border-t border-gray-50">
            <Button onClick={() => navigateTo('explore')} variant="secondary" className="w-full">Bekor qilish</Button>
            <Button type="submit" className="w-full">Arizani Yuborish</Button>
          </div>
        </form>
      </div>
    );
  };

  const renderMyProjects = () => {
    if (!currentUser) {
      return <EmptyState icon="fa-lock" title="Kirish talab qilinadi" action={<Button onClick={() => openAuth('login')}>Kirish</Button>} />;
    }

    return (
      <div className="space-y-8 md:space-y-12 animate-in fade-in">
        <header className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight italic">Loyihalarim</h1>
            <Badge variant="active" size="md">{myStartups.length}</Badge>
          </div>
          <Button onClick={() => navigateTo('create')} icon="fa-plus" className="w-full md:w-auto h-12 md:h-10">Yangi Loyiha</Button>
        </header>

        {myStartups.length > 0 ? (
          <div className="space-y-4">
            {myStartups.map(s => (
              <div key={s.id} className="bg-white border border-gray-100 rounded-xl p-5 md:p-6 flex flex-col md:flex-row items-center gap-5 md:gap-6 hover:shadow-md transition-all">
                <img src={s.logo} className="w-16 h-16 rounded-lg object-cover border border-gray-100" alt="Logo" />
                <div className="flex-grow min-w-0 text-center md:text-left">
                  <div className="flex items-center justify-center md:justify-start gap-3 mb-1">
                    <h3 className="text-base md:text-lg font-bold truncate">{s.nomi}</h3>
                    <Badge variant={s.status === 'approved' ? 'success' : s.status === 'pending_admin' ? 'default' : 'danger'}>
                      {s.status === 'pending_admin' ? 'Moderatsiyada' : s.status === 'approved' ? 'Faol' : 'Rad etilgan'}
                    </Badge>
                  </div>
                  <div className="flex flex-wrap justify-center md:justify-start gap-3 md:gap-4 text-[10px] md:text-[11px] font-bold text-gray-400 uppercase tracking-widest">
                    <span>{s.category}</span>
                    <span><i className="fa-solid fa-users mr-1"></i> {s.a_zolar.length} a'zo</span>
                    <span><i className="fa-solid fa-tasks mr-1"></i> {s.tasks?.length || 0} vazifa</span>
                  </div>
                </div>
                <div className="flex gap-2 shrink-0 w-full md:w-auto">
                  <Button variant="secondary" size="md" onClick={() => navigateTo('details', s.id)} className="flex-grow md:flex-none h-12 md:h-10">Boshqarish</Button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState 
            icon="fa-rocket-launch" 
            title="Hali loyihalar yo'q" 
            subtitle="G'oyangiz bormi? Uni hozir platformada e'lon qiling." 
            action={<Button onClick={() => navigateTo('create')}>Loyiha Yaratish</Button>}
          />
        )}
      </div>
    );
  };

  const renderDetails = () => {
    if (!selectedStartup) return <EmptyState icon="fa-ban" title="Loyiha topilmadi" action={<Button onClick={() => navigateTo('explore')}>Ortga qaytish</Button>} />;

    const isOwner = currentUser && selectedStartup.egasi_id === currentUser.id;
    const isMember = currentUser && selectedStartup.a_zolar.some(m => m.user_id === currentUser.id);

    return (
      <div className="space-y-8 md:space-y-12 animate-in fade-in">
        <header className="flex flex-col md:flex-row items-start md:items-center gap-6 md:gap-8 border-b border-gray-100 pb-8 md:pb-10">
          <img src={selectedStartup.logo} className="w-20 h-20 md:w-24 md:h-24 rounded-2xl border border-gray-100 shadow-sm object-cover shrink-0" alt="Logo" />
          <div className="flex-grow space-y-3 md:space-y-4 min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-3xl md:text-4xl font-extrabold tracking-tighter italic leading-none">{selectedStartup.nomi}</h1>
              <Badge variant="active" size="md">{selectedStartup.category}</Badge>
              <Badge variant={selectedStartup.status === 'approved' ? 'success' : 'default'} size="md">{selectedStartup.status === 'approved' ? 'Faol' : 'Moderatsiyada'}</Badge>
            </div>
            <p className="text-gray-500 text-[14px] md:text-[16px] max-w-2xl leading-relaxed italic">"{selectedStartup.tavsif}"</p>
            <div className="flex gap-4 flex-wrap">
              <span className="text-[10px] md:text-[11px] font-bold text-gray-400 uppercase tracking-widest">Egasi: <span className="text-black">{selectedStartup.egasi_name}</span></span>
              <span className="text-[10px] md:text-[11px] font-bold text-gray-400 uppercase tracking-widest">Sana: <span className="text-black">{new Date(selectedStartup.yaratilgan_vaqt).toLocaleDateString()}</span></span>
            </div>
          </div>
          <div className="flex gap-2 md:gap-3 w-full md:w-auto shrink-0">
            {selectedStartup.github_url && <Button variant="secondary" icon="fa-github" onClick={() => window.open(selectedStartup.github_url, '_blank')} className="flex-1 md:flex-none" />}
            {selectedStartup.website_url && <Button variant="secondary" icon="fa-globe" onClick={() => window.open(selectedStartup.website_url, '_blank')} className="flex-1 md:flex-none" />}
            <Button onClick={() => navigateTo('my-projects')} variant="ghost" icon="fa-arrow-left" className="flex-1 md:flex-none" />
          </div>
        </header>

        <nav className="flex items-center border-b border-gray-100 gap-6 md:gap-8 h-10 overflow-x-auto no-scrollbar scroll-smooth">
          {[
            { key: 'vazifalar', label: 'Vazifalar' },
            { key: 'chat', label: 'Suhbat' },
            { key: 'reputatsiya', label: 'Reputatsiya' },
            { key: 'governance', label: 'Boshqaruv' },
            { key: 'kapital', label: 'Ulush' },
            { key: 'registry', label: "Ro'yxat" },
            { key: 'airadar', label: 'AI Tahlil' },
            { key: 'jamoa', label: 'Jamoa' },
            { key: 'sozlamalar', label: 'Sozlamalar' }
          ].map((tab) => (
            <button 
              key={tab.key} 
              onClick={() => setActiveDetailTab(tab.key)}
              className={`h-full uppercase text-[11px] md:text-[12px] font-extrabold tracking-widest transition-all px-2 border-b-2 whitespace-nowrap ${activeDetailTab === tab.key ? 'border-black text-black' : 'border-transparent text-gray-400 hover:text-black'}`}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        {workspaceLoading && (
          <div className="mt-4 flex items-center gap-2 text-[11px] uppercase tracking-widest font-bold text-emerald-700">
            <i className="fa-solid fa-spinner animate-spin"></i>
            Ish maydoni yuklanmoqda...
          </div>
        )}

        <div className="min-h-[400px]">
          {activeDetailTab === 'vazifalar' && (
            <div className="space-y-6">
              {workspaceKpi && (
                <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-3">
                  {[
                    { label: 'Jami', value: workspaceKpi.tasks_total ?? 0 },
                    { label: 'Bajarildi', value: workspaceKpi.tasks_done ?? 0 },
                    { label: 'Jarayonda', value: workspaceKpi.tasks_in_progress ?? 0 },
                    { label: 'Muddati o`tgan', value: workspaceKpi.overdue_tasks ?? 0 },
                    { label: 'Haftalik muddat', value: workspaceKpi.due_this_week ?? 0 },
                    { label: 'Bajarilish %', value: `${workspaceKpi.completion_rate ?? 0}%` },
                    { label: 'Faol a`zolar', value: workspaceKpi.active_members_7d ?? 0 },
                    { label: 'Burn ratio', value: `${workspaceKpi.burn_ratio ?? 0}%` }
                  ].map((item, index) => (
                    <div key={`${item.label}-${index}`} className="bg-white border border-gray-200 rounded-xl p-3 text-center">
                      <p className="text-lg font-black">{item.value}</p>
                      <p className="text-[10px] text-gray-500 uppercase tracking-widest mt-1">{item.label}</p>
                    </div>
                  ))}
                </div>
              )}

              {workspaceWeeklyReport && (
                <div className="bg-white border border-gray-200 rounded-2xl p-5 space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-[13px] font-black uppercase tracking-widest text-gray-600">Haftalik hisobot</h3>
                    <p className="text-[11px] text-gray-500">
                      {new Date(workspaceWeeklyReport.period_start).toLocaleDateString()} - {new Date(workspaceWeeklyReport.period_end).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      {(workspaceWeeklyReport.highlights || []).map((line, idx) => (
                        <p key={`hl-${idx}`} className="text-[12px] text-gray-700 bg-slate-50 border border-slate-100 rounded-lg px-3 py-2">
                          {line}
                        </p>
                      ))}
                    </div>
                    <div className="space-y-2">
                      <p className="text-[11px] font-bold uppercase tracking-widest text-gray-500">Keyingi ustuvorliklar</p>
                      {(workspaceWeeklyReport.next_priorities || []).slice(0, 5).map((item, idx) => (
                        <p key={`np-${idx}`} className="text-[12px] text-gray-700 border border-gray-100 rounded-lg px-3 py-2">
                          {idx + 1}. {item}
                        </p>
                      ))}
                      {(!workspaceWeeklyReport.next_priorities || workspaceWeeklyReport.next_priorities.length === 0) && (
                        <p className="text-[12px] text-gray-500">Muammoli ustuvorlik topilmadi.</p>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {startupCalendar && (
                <div className="bg-white border border-gray-200 rounded-2xl p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-[13px] font-black uppercase tracking-widest text-gray-600">Kalendar</h3>
                    <Badge variant="default">Deadline: {startupCalendar.summary?.total_with_deadline ?? 0}</Badge>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                    {[
                      { label: "O'tib ketgan", value: startupCalendar.summary?.overdue ?? 0 },
                      { label: 'Bugun', value: startupCalendar.summary?.today ?? 0 },
                      { label: 'Shu hafta', value: startupCalendar.summary?.this_week ?? 0 },
                      { label: 'Keyingi hafta', value: startupCalendar.summary?.next_week ?? 0 },
                      { label: "Muddat yo'q", value: startupCalendar.summary?.no_deadline ?? 0 }
                    ].map((item, index) => (
                      <div key={`cal-${index}`} className="bg-slate-50 border border-slate-100 rounded-lg p-3 text-center">
                        <p className="text-lg font-black">{item.value}</p>
                        <p className="text-[10px] text-slate-500 uppercase tracking-widest">{item.label}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="bg-white border border-gray-200 rounded-2xl p-4 md:p-5 space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  {[
                    { key: 'all', label: 'Hammasi' },
                    { key: 'overdue', label: "Muddati o'tgan" },
                    { key: 'today', label: 'Bugungi' },
                    { key: 'week', label: 'Haftalik' },
                    { key: 'mine', label: 'Mening vazifam' },
                    { key: 'critical', label: 'Muhim' }
                  ].map((filterItem) => (
                    <button
                      key={filterItem.key}
                      onClick={() => setTaskFilter(filterItem.key)}
                      className={`h-8 px-3 rounded-full border text-[11px] font-semibold ${taskFilter === filterItem.key ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'}`}
                    >
                      {filterItem.label}
                    </button>
                  ))}
                </div>
                <Input
                  value={taskSearch}
                  onChange={(e) => setTaskSearch(e.target.value)}
                  placeholder="Vazifa bo'yicha qidiruv..."
                  icon="fa-magnifying-glass"
                />
              </div>

              {(isOwner || isMember) && (
                <div className="bg-white border border-gray-200 rounded-2xl p-5 space-y-4">
                  <h3 className="text-[13px] font-black uppercase tracking-widest text-gray-600">Yangi vazifa yaratish</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <Input
                      label="Vazifa nomi"
                      value={taskDraft.title}
                      onChange={(e) => setTaskDraft((prev) => ({ ...prev, title: e.target.value }))}
                      placeholder="Masalan: Login oqimini tugatish"
                    />
                    <div className="space-y-1.5">
                      <label className="block text-[11px] font-bold text-gray-700 uppercase tracking-widest ml-1">Mas'ul</label>
                      <select
                        value={taskDraft.assigned_to_id}
                        onChange={(e) => setTaskDraft((prev) => ({ ...prev, assigned_to_id: e.target.value }))}
                        className="w-full h-[44px] border border-gray-200 rounded-lg px-3 text-[13px]"
                      >
                        <option value={currentUser?.id || ''}>Mening zimamda</option>
                        {selectedStartup.a_zolar.map((member) => (
                          <option key={member.user_id} value={member.user_id}>{member.name}</option>
                        ))}
                      </select>
                    </div>
                    <TextArea
                      label="Batafsil tavsif"
                      value={taskDraft.description}
                      onChange={(e) => setTaskDraft((prev) => ({ ...prev, description: e.target.value }))}
                      placeholder="Qanday natija chiqishi kerak..."
                    />
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <Input
                          type="date"
                          label="Muddat"
                          value={taskDraft.deadline}
                          onChange={(e) => setTaskDraft((prev) => ({ ...prev, deadline: e.target.value }))}
                        />
                        <div className="space-y-1.5">
                          <label className="block text-[11px] font-bold text-gray-700 uppercase tracking-widest ml-1">Ustuvorlik</label>
                          <select
                            value={taskDraft.priority}
                            onChange={(e) => setTaskDraft((prev) => ({ ...prev, priority: e.target.value }))}
                            className="w-full h-[44px] border border-gray-200 rounded-lg px-3 text-[13px]"
                          >
                            <option value="low">Past</option>
                            <option value="medium">O'rtacha</option>
                            <option value="high">Yuqori</option>
                            <option value="critical">Kritik</option>
                          </select>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <Input
                          type="number"
                          min="0"
                          label="Reja soat"
                          value={taskDraft.estimate_hours}
                          onChange={(e) => setTaskDraft((prev) => ({ ...prev, estimate_hours: e.target.value }))}
                          placeholder="8"
                        />
                        <Input
                          type="number"
                          min="0"
                          label="Amaldagi soat"
                          value={taskDraft.actual_hours}
                          onChange={(e) => setTaskDraft((prev) => ({ ...prev, actual_hours: e.target.value }))}
                          placeholder="0"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="block text-[11px] font-bold text-gray-700 uppercase tracking-widest ml-1">Kalendar turi</label>
                        <select
                          value={taskDraft.calendar_tag}
                          onChange={(e) => setTaskDraft((prev) => ({ ...prev, calendar_tag: e.target.value }))}
                          className="w-full h-[44px] border border-gray-200 rounded-lg px-3 text-[13px]"
                        >
                          <option value="backlog">Backlog</option>
                          <option value="planning">Rejalash</option>
                          <option value="development">Dasturlash</option>
                          <option value="design">Dizayn</option>
                          <option value="qa">Test</option>
                          <option value="release">Chiqarish</option>
                        </select>
                      </div>
                    </div>
                  </div>
                  <Button onClick={() => handleAddTask(selectedStartup.id)} icon="fa-plus">Vazifa qo'shish</Button>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8">
                {['todo', 'in-progress', 'done'].map((status) => (
                  <div key={status} className="flex flex-col gap-4">
                    <div className="flex items-center justify-between px-2">
                      <h4 className="text-[10px] md:text-[11px] font-extrabold uppercase tracking-widest text-gray-400 italic">
                        {status === 'todo' ? 'Kutilmoqda' : status === 'in-progress' ? 'Jarayonda' : 'Bajarildi'}
                      </h4>
                      <Badge variant="default">{visibleTaskCounts[status] || 0}</Badge>
                    </div>
                    <div className="space-y-3 min-h-[120px] md:min-h-[400px] p-4 bg-gray-50/30 rounded-2xl border border-gray-100">
                      {filteredStartupTasks.filter((task) => task.status === status).map((task) => {
                        const deadlineState = getTaskDeadlineState(task);
                        const deadlineClass = deadlineState === 'overdue'
                          ? 'text-rose-600'
                          : deadlineState === 'today'
                            ? 'text-amber-600'
                            : 'text-slate-500';
                        const priorityClass = task.priority === 'critical'
                          ? 'bg-rose-100 text-rose-700 border-rose-200'
                          : task.priority === 'high'
                            ? 'bg-amber-100 text-amber-700 border-amber-200'
                            : task.priority === 'low'
                              ? 'bg-emerald-100 text-emerald-700 border-emerald-200'
                              : 'bg-slate-100 text-slate-700 border-slate-200';
                        return (
                          <div key={task.id} className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm group hover:border-black transition-all">
                            <div className="flex items-start justify-between mb-3 gap-3">
                              <div className="space-y-2 min-w-0">
                                <h5 className="text-[14px] font-bold leading-tight break-words">{task.title}</h5>
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className={`text-[10px] font-bold uppercase tracking-widest border rounded-full px-2 py-0.5 ${priorityClass}`}>
                                    {task.priority || "o'rtacha"}
                                  </span>
                                  {task.calendar_tag && (
                                    <span className="text-[10px] uppercase tracking-widest text-gray-500">{task.calendar_tag}</span>
                                  )}
                                </div>
                              </div>
                              <div className="flex gap-1 shrink-0">
                                <button
                                  onClick={() => {
                                    if (status === 'todo') handleMoveTask(selectedStartup.id, task.id, 'in-progress');
                                    else if (status === 'in-progress') handleMoveTask(selectedStartup.id, task.id, 'done');
                                    else handleMoveTask(selectedStartup.id, task.id, 'todo');
                                  }}
                                  className="text-gray-300 hover:text-black transition-colors p-2 shrink-0"
                                  title="Keyingi bosqichga o'tkazish"
                                >
                                  <i className="fa-solid fa-arrow-right-long text-[10px]"></i>
                                </button>
                                {isOwner && (
                                  <button onClick={() => handleDeleteTask(selectedStartup.id, task.id)} className="text-gray-300 hover:text-rose-600 transition-colors p-2 shrink-0" title="O'chirish">
                                    <i className="fa-solid fa-trash text-[10px]"></i>
                                  </button>
                                )}
                              </div>
                            </div>
                            <p className="text-[12px] text-gray-500 mb-3 line-clamp-3">{task.description}</p>
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2 min-w-0">
                                <div className="w-5 h-5 bg-gray-100 rounded-full border border-gray-200 flex items-center justify-center text-[8px] font-bold uppercase shrink-0">
                                  {(task.assigned_to_name || 'A')[0]}
                                </div>
                                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest truncate">{task.assigned_to_name || 'Belgilanmagan'}</span>
                              </div>
                              <div className="text-right shrink-0">
                                {task.deadline && <p className={`text-[9px] font-bold uppercase tracking-widest ${deadlineClass}`}>{task.deadline}</p>}
                                <p className="text-[9px] text-gray-400">
                                  {Number(task.actual_hours || 0)}h / {Number(task.estimate_hours || 0)}h
                                </p>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                      {filteredStartupTasks.filter((task) => task.status === status).length === 0 && (
                        <p className="text-[12px] text-gray-500 text-center py-8">Bu ustunda vazifa yo'q.</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeDetailTab === 'chat' && (
            (isOwner || isMember) ? (
              <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-6">
                <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
                  <div className="h-[430px] md:h-[520px] p-4 md:p-5 space-y-3 overflow-y-auto custom-scrollbar bg-slate-50/60">
                    {startupChatMessages.map((msg) => {
                      const mine = msg.sender_id === currentUser?.id;
                      return (
                        <div key={msg.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                          <div className={`max-w-[88%] rounded-2xl border p-3 space-y-2 ${mine ? 'bg-blue-600 text-white border-blue-500' : 'bg-white text-gray-900 border-gray-200'}`}>
                            <div className={`text-[10px] font-bold uppercase tracking-widest ${mine ? 'text-blue-100' : 'text-gray-400'}`}>
                              {msg.sender_name}
                            </div>
                            {msg.content && (
                              <p className={`text-[13px] whitespace-pre-wrap break-words ${mine ? 'text-white' : 'text-gray-800'}`}>
                                {renderLinkifiedText(msg.content)}
                              </p>
                            )}
                            {msg.message_type === 'image' && msg.file_url && (
                              <a href={msg.file_url} target="_blank" rel="noreferrer" className="block">
                                <img src={msg.file_url} alt={msg.file_name || 'Yuklangan rasm'} className="max-h-[230px] rounded-xl border border-white/30 object-contain bg-black/5" />
                              </a>
                            )}
                            {msg.message_type === 'file' && msg.file_url && (
                              <a href={msg.file_url} target="_blank" rel="noreferrer" download={msg.file_name || 'fayl'} className={`inline-flex items-center gap-2 text-[12px] font-semibold underline ${mine ? 'text-white' : 'text-blue-600'}`}>
                                <i className="fa-solid fa-file-arrow-down"></i>
                                <span className="break-all">{msg.file_name || 'Faylni ochish'}</span>
                              </a>
                            )}
                            <p className={`text-[10px] ${mine ? 'text-blue-100' : 'text-gray-400'}`}>
                              {new Date(msg.created_at).toLocaleString()}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                    {startupChatMessages.length === 0 && (
                      <EmptyState icon="fa-comments" title="Suhbat bo'sh" subtitle="Birinchi xabarni yuboring." />
                    )}
                    <div ref={startupChatEndRef} />
                  </div>
                  <div className="border-t border-gray-200 p-3 md:p-4 space-y-3 bg-white">
                    {startupChatAttachment && (
                      <div className="flex items-center justify-between bg-slate-100 border border-slate-200 rounded-xl px-3 py-2">
                        <p className="text-[12px] font-medium text-slate-700 truncate pr-3">
                          <i className={`fa-solid ${startupChatAttachment.type.startsWith('image/') ? 'fa-image' : 'fa-file'} mr-2`}></i>
                          {startupChatAttachment.name}
                        </p>
                        <button onClick={() => setStartupChatAttachment(null)} className="text-slate-400 hover:text-rose-600">
                          <i className="fa-solid fa-xmark"></i>
                        </button>
                      </div>
                    )}
                    <div className="flex items-end gap-2">
                      <textarea
                        value={startupChatText}
                        onChange={(e) => setStartupChatText(e.target.value)}
                        placeholder="Xabar yozing, link yuboring yoki fayl biriktiring..."
                        className="flex-grow min-h-[42px] max-h-[130px] border border-gray-200 rounded-xl px-3 py-2 text-[13px] outline-none focus:border-blue-500 resize-y"
                      />
                      <input
                        ref={startupChatFileRef}
                        type="file"
                        onChange={handleStartupChatFileChange}
                        className="hidden"
                      />
                      <Button
                        variant="secondary"
                        className="h-11 px-4"
                        onClick={() => startupChatFileRef.current?.click()}
                        icon="fa-paperclip"
                      >
                        Fayl
                      </Button>
                      <Button
                        className="h-11 px-5"
                        onClick={handleSendStartupMessage}
                        icon="fa-paper-plane"
                        loading={startupChatSending}
                      >
                        Yuborish
                      </Button>
                    </div>
                  </div>
                </div>
                <div className="bg-white border border-gray-200 rounded-2xl p-5 space-y-4">
                  <h3 className="text-[12px] font-black uppercase tracking-widest text-gray-600">Suhbat qoidalari</h3>
                  <div className="space-y-3 text-[12px] text-gray-600">
                    <p>Faqat shu startup a'zolari chatni ko'ra oladi.</p>
                    <p>Link yuborsangiz avtomatik bosiladigan ko'rinishda chiqadi.</p>
                    <p>Rasm va hujjatlarni biriktirib yuborishingiz mumkin.</p>
                  </div>
                </div>
              </div>
            ) : (
              <EmptyState icon="fa-lock" title="Suhbat yopiq" subtitle="Suhbat faqat startup a'zolariga ochiq." />
            )
          )}

          {activeDetailTab === 'reputatsiya' && (
            hasProAccess ? (
            <div className="space-y-8">
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                {workspaceReputation.members.map((m) => (
                  <div key={m.user_id} className="bg-gradient-to-br from-emerald-50 via-white to-teal-50 border border-emerald-100 rounded-2xl p-5 space-y-3 shadow-sm">
                    <div className="flex items-center justify-between">
                      <p className="text-[12px] font-bold uppercase tracking-widest text-emerald-700">{m.role}</p>
                      <span className="text-[26px] font-black text-emerald-700">{m.score}</span>
                    </div>
                    <div>
                      <p className="text-[15px] font-bold">{m.user_name}</p>
                      <p className="text-[11px] text-gray-500">O'rtacha baho: {m.avg_rating} / 5 ({m.reviews_count})</p>
                      <p className="text-[11px] text-gray-500">Vazifa bajarilishi: {m.completion_rate}%</p>
                    </div>
                  </div>
                ))}
                {workspaceReputation.members.length === 0 && (
                  <EmptyState icon="fa-chart-line" title="Reputatsiya ma'lumoti yo'q" subtitle="Jamoa baholari boshlangandan keyin grafik chiqadi." />
                )}
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                <div className="bg-white border border-gray-200 rounded-2xl p-6 space-y-4">
                  <h3 className="text-[13px] font-black uppercase tracking-widest text-gray-600">Jamoa bahosi qo'shish</h3>
                  {(isOwner || isMember) ? (
                    <div className="space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <select
                          value={reviewDraft.to_user_id}
                          onChange={(e) => setReviewDraft((p) => ({ ...p, to_user_id: e.target.value }))}
                          className="h-10 px-3 border border-gray-200 rounded-lg text-[13px]"
                        >
                          <option value="">Jamoa a'zosini tanlang</option>
                          {selectedStartup.a_zolar.filter((m) => m.user_id !== currentUser?.id).map((m) => (
                            <option key={m.user_id} value={m.user_id}>{m.name}</option>
                          ))}
                        </select>
                        <select
                          value={reviewDraft.rating}
                          onChange={(e) => setReviewDraft((p) => ({ ...p, rating: Number(e.target.value) }))}
                          className="h-10 px-3 border border-gray-200 rounded-lg text-[13px]"
                        >
                          {[5, 4, 3, 2, 1].map((s) => <option key={s} value={s}>Umumiy baho: {s}</option>)}
                        </select>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <select
                          value={reviewDraft.task_delivery}
                          onChange={(e) => setReviewDraft((p) => ({ ...p, task_delivery: Number(e.target.value) }))}
                          className="h-10 px-3 border border-gray-200 rounded-lg text-[13px]"
                        >
                          {[5, 4, 3, 2, 1].map((s) => <option key={s} value={s}>Bajarish {s}/5</option>)}
                        </select>
                        <select
                          value={reviewDraft.collaboration}
                          onChange={(e) => setReviewDraft((p) => ({ ...p, collaboration: Number(e.target.value) }))}
                          className="h-10 px-3 border border-gray-200 rounded-lg text-[13px]"
                        >
                          {[5, 4, 3, 2, 1].map((s) => <option key={s} value={s}>Hamkorlik {s}/5</option>)}
                        </select>
                        <select
                          value={reviewDraft.reliability}
                          onChange={(e) => setReviewDraft((p) => ({ ...p, reliability: Number(e.target.value) }))}
                          className="h-10 px-3 border border-gray-200 rounded-lg text-[13px]"
                        >
                          {[5, 4, 3, 2, 1].map((s) => <option key={s} value={s}>Ishonchlilik {s}/5</option>)}
                        </select>
                      </div>
                      <textarea
                        value={reviewDraft.comment}
                        onChange={(e) => setReviewDraft((p) => ({ ...p, comment: e.target.value }))}
                        placeholder="Ish sifati bo'yicha izoh..."
                        className="w-full min-h-[90px] border border-gray-200 rounded-lg p-3 text-[13px]"
                      />
                      <Button onClick={handleSubmitPeerReview} className="w-full md:w-auto">Baho yuborish</Button>
                    </div>
                  ) : (
                    <p className="text-[12px] text-gray-500">Baho yuborish uchun jamoa a'zosi bo'lish kerak.</p>
                  )}
                </div>

                <div className="bg-white border border-gray-200 rounded-2xl p-6 space-y-4">
                  <h3 className="text-[13px] font-black uppercase tracking-widest text-gray-600">Hamkorlik grafigi</h3>
                  <div className="space-y-3 max-h-[320px] overflow-y-auto custom-scrollbar pr-2">
                    {workspaceReputation.edges.map((edge, idx) => (
                      <div key={`${edge.source}_${edge.target}_${idx}`} className="bg-gray-50 border border-gray-100 rounded-xl p-3">
                        <p className="text-[12px] font-semibold text-gray-700">{`${edge.source} -> ${edge.target}`}</p>
                        <p className="text-[11px] text-gray-500">Aloqalar: {edge.interactions} | O'rtacha baho: {edge.avg_rating}</p>
                      </div>
                    ))}
                    {workspaceReputation.edges.length === 0 && (
                      <p className="text-[12px] text-gray-500">Hali bog'lanishlar yo'q.</p>
                    )}
                  </div>
                </div>
              </div>

              <div className="bg-white border border-gray-200 rounded-2xl p-6 space-y-3">
                <h3 className="text-[13px] font-black uppercase tracking-widest text-gray-600">So'nggi baholar</h3>
                {workspaceReviews.slice(0, 8).map((r) => (
                  <div key={r.id} className="border border-gray-100 rounded-xl p-4 bg-gray-50/60">
                      <p className="text-[12px] font-bold text-gray-800">{`${r.from_user_name} -> ${r.to_user_name}`}</p>
                    <p className="text-[11px] text-gray-500">Umumiy {r.rating}/5 | Bajarish {r.task_delivery}/5 | Hamkorlik {r.collaboration}/5 | Ishonchlilik {r.reliability}/5</p>
                    {r.comment && <p className="text-[12px] text-gray-700 mt-2">{r.comment}</p>}
                    <p className="text-[10px] text-gray-400 mt-2">{new Date(r.created_at).toLocaleString()}</p>
                  </div>
                ))}
                {workspaceReviews.length === 0 && <p className="text-[12px] text-gray-500">Hali baholar yo'q.</p>}
              </div>
            </div>
            ) : renderProLocked("Reputatsiya grafigi Pro uchun")
          )}

          {activeDetailTab === 'governance' && (
            hasProAccess ? (
            <div className="space-y-8">
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                <div className="bg-white border border-gray-200 rounded-2xl p-6 space-y-4">
                  <h3 className="text-[13px] font-black uppercase tracking-widest text-gray-600">Qaror taklifi</h3>
                  {(isOwner || isMember) ? (
                    <>
                      <Input
                        label="Qaror sarlavhasi"
                        value={decisionDraft.title}
                        onChange={(e) => setDecisionDraft((p) => ({ ...p, title: e.target.value }))}
                        placeholder="Masalan: Mahsulot yo'nalishini o'zgartirish"
                      />
                      <TextArea
                        label="Izoh"
                        value={decisionDraft.description}
                        onChange={(e) => setDecisionDraft((p) => ({ ...p, description: e.target.value }))}
                        placeholder="Nega bu qaror kerak?"
                      />
                      <Button onClick={handleCreateDecision}>Qaror ochish</Button>
                    </>
                  ) : (
                    <p className="text-[12px] text-gray-500">Faqat jamoa a'zolari qaror ochadi.</p>
                  )}
                </div>

                <div className="bg-white border border-gray-200 rounded-2xl p-6 space-y-4">
                  <h3 className="text-[13px] font-black uppercase tracking-widest text-gray-600">Asoschi ovozi (kim qoladi/kim chiqadi)</h3>
                  {(isOwner || isMember) ? (
                    <>
                      <select
                        value={voteCaseDraft.target_user_id}
                        onChange={(e) => setVoteCaseDraft((p) => ({ ...p, target_user_id: e.target.value }))}
                        className="h-10 px-3 border border-gray-200 rounded-lg text-[13px] w-full"
                      >
                        <option value="">A'zo tanlang</option>
                        {selectedStartup.a_zolar.filter((m) => m.user_id !== currentUser?.id).map((m) => (
                          <option key={m.user_id} value={m.user_id}>{m.name}</option>
                        ))}
                      </select>
                      <TextArea
                        label="Sabab"
                        value={voteCaseDraft.reason}
                        onChange={(e) => setVoteCaseDraft((p) => ({ ...p, reason: e.target.value }))}
                        placeholder="Aniq sabab yozing..."
                      />
                      <Button onClick={handleCreateMemberVote} variant="danger">Asoschi ovozini ochish</Button>
                    </>
                  ) : (
                    <p className="text-[12px] text-gray-500">Faqat jamoa a'zolari asoschi ovozini ochadi.</p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                <div className="bg-white border border-gray-200 rounded-2xl p-6 space-y-3">
                  <h3 className="text-[13px] font-black uppercase tracking-widest text-gray-600">Qarorlar</h3>
                  {workspaceDecisions.map((d) => (
                    <div key={d.id} className="border border-gray-100 rounded-xl p-4 bg-gray-50/40">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-[13px] font-bold">{d.title}</p>
                        <Badge variant={d.status === 'approved' ? 'success' : d.status === 'rejected' ? 'danger' : 'default'}>{mapStatusText(d.status)}</Badge>
                      </div>
                      {d.description && <p className="text-[12px] text-gray-600 mt-2">{d.description}</p>}
                      <p className="text-[11px] text-gray-500 mt-2">Tasdiq: {d.votes?.approve || 0} | Rad: {d.votes?.reject || 0}</p>
                      {d.status === 'open' && (isOwner || isMember) && (
                        <div className="flex gap-2 mt-3">
                          <Button size="sm" onClick={() => handleVoteDecision(d.id, 'approve')}>Tasdiqlash</Button>
                          <Button size="sm" variant="danger" onClick={() => handleVoteDecision(d.id, 'reject')}>Rad etish</Button>
                        </div>
                      )}
                    </div>
                  ))}
                  {workspaceDecisions.length === 0 && <p className="text-[12px] text-gray-500">Qarorlar yo'q.</p>}
                </div>

                <div className="bg-white border border-gray-200 rounded-2xl p-6 space-y-3">
                  <h3 className="text-[13px] font-black uppercase tracking-widest text-gray-600">Asoschi ovozi holatlari</h3>
                  {workspaceMemberVotes.map((v) => (
                    <div key={v.id} className="border border-gray-100 rounded-xl p-4 bg-gray-50/40">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-[13px] font-bold">{v.target_user_name}</p>
                        <Badge variant={v.status === 'resolved' ? 'active' : 'default'}>{mapStatusText(v.status)}{v.resolution ? `: ${mapStatusText(v.resolution)}` : ''}</Badge>
                      </div>
                      <p className="text-[12px] text-gray-600 mt-2">{v.reason}</p>
                      <p className="text-[11px] text-gray-500 mt-2">Qoldirish: {v.votes?.keep || 0} | Chiqarish: {v.votes?.remove || 0}</p>
                      {v.status === 'open' && (isOwner || isMember) && currentUser?.id !== v.target_user_id && (
                        <div className="flex gap-2 mt-3">
                          <Button size="sm" variant="secondary" onClick={() => handleCastMemberVote(v.id, 'keep')}>Qoldirish</Button>
                          <Button size="sm" variant="danger" onClick={() => handleCastMemberVote(v.id, 'remove')}>Chiqarish</Button>
                        </div>
                      )}
                    </div>
                  ))}
                  {workspaceMemberVotes.length === 0 && <p className="text-[12px] text-gray-500">Asoschi ovozi holati yo'q.</p>}
                </div>
              </div>
            </div>
            ) : renderProLocked("Boshqaruv paneli Pro uchun")
          )}

          {activeDetailTab === 'kapital' && (
            hasProAccess ? (
            <div className="space-y-8">
              <div className="bg-white border border-gray-200 rounded-2xl p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-[13px] font-black uppercase tracking-widest text-gray-600">Ulush daftari</h3>
                  <Badge variant={Math.round(equityTotal) === 100 ? 'success' : 'danger'}>{equityTotal.toFixed(2)}%</Badge>
                </div>
                <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                  <div className={`h-full ${Math.round(equityTotal) === 100 ? 'bg-emerald-500' : 'bg-rose-500'}`} style={{ width: `${Math.min(equityTotal, 100)}%` }} />
                </div>
                <p className="text-[12px] text-gray-500">Ideal balans: 100%. Ulush nomutanosib bo'lsa AI tahlil signal beradi.</p>
              </div>

              {isOwner && (
                <div className="bg-white border border-gray-200 rounded-2xl p-6 space-y-4">
                  <h3 className="text-[13px] font-black uppercase tracking-widest text-gray-600">Ulush qo'shish / yangilash</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
                    <select value={equityDraft.user_id} onChange={(e) => setEquityDraft((p) => ({ ...p, user_id: e.target.value }))} className="h-10 px-3 border border-gray-200 rounded-lg text-[13px]">
                      <option value="">A'zo</option>
                      {selectedStartup.a_zolar.map((m) => <option key={m.user_id} value={m.user_id}>{m.name}</option>)}
                    </select>
                    <input type="number" value={equityDraft.share_percent} onChange={(e) => setEquityDraft((p) => ({ ...p, share_percent: e.target.value }))} placeholder="Ulush %" className="h-10 px-3 border border-gray-200 rounded-lg text-[13px]" />
                    <input type="number" value={equityDraft.vesting_months} onChange={(e) => setEquityDraft((p) => ({ ...p, vesting_months: e.target.value }))} placeholder="Vesting oy" className="h-10 px-3 border border-gray-200 rounded-lg text-[13px]" />
                    <input type="number" value={equityDraft.cliff_months} onChange={(e) => setEquityDraft((p) => ({ ...p, cliff_months: e.target.value }))} placeholder="Kutish oy" className="h-10 px-3 border border-gray-200 rounded-lg text-[13px]" />
                    <Button onClick={handleUpsertEquity}>Saqlash</Button>
                  </div>
                  <textarea value={equityDraft.notes} onChange={(e) => setEquityDraft((p) => ({ ...p, notes: e.target.value }))} placeholder="Ulush bo'yicha izoh..." className="w-full min-h-[80px] border border-gray-200 rounded-lg p-3 text-[13px]" />
                </div>
              )}

              <div className="space-y-3">
                {workspaceEquity.map((e) => (
                  <div key={e.id} className="bg-white border border-gray-200 rounded-xl p-4 flex flex-col md:flex-row md:items-center gap-4">
                    <div className="flex-grow">
                      <p className="text-[14px] font-bold">{e.user_name}</p>
                      <p className="text-[12px] text-gray-500">{e.share_percent}% | Bosqichli muddat {e.vesting_months} oy | Kutish davri {e.cliff_months} oy</p>
                      {e.notes && <p className="text-[12px] text-gray-600 mt-1">{e.notes}</p>}
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={e.status === 'active' ? 'success' : 'default'}>{mapStatusText(e.status)}</Badge>
                      {isOwner && e.status !== 'archived' && <Button size="sm" variant="ghost" className="border border-gray-200" onClick={() => handleArchiveEquity(e.id)}>Arxiv</Button>}
                    </div>
                  </div>
                ))}
                {workspaceEquity.length === 0 && <p className="text-[12px] text-gray-500">Ulush hali kiritilmagan.</p>}
              </div>
            </div>
            ) : renderProLocked("Ulush daftari Pro uchun")
          )}

          {activeDetailTab === 'registry' && (
            hasProAccess ? (
            <div className="space-y-8">
              <div className="bg-white border border-gray-200 rounded-2xl p-6 space-y-4">
                <h3 className="text-[13px] font-black uppercase tracking-widest text-gray-600">Startup ro'yxati</h3>
                {isOwner ? (
                  <>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <select value={registryDraft.lifecycle_status} onChange={(e) => setRegistryDraft((p) => ({ ...p, lifecycle_status: e.target.value }))} className="h-10 px-3 border border-gray-200 rounded-lg text-[13px]">
                        <option value="live">Faol</option>
                        <option value="pivoted">Yo'nalish o'zgargan</option>
                        <option value="closed">Yopilgan</option>
                        <option value="acquired">Sotilgan</option>
                      </select>
                      <input type="number" step="0.1" value={registryDraft.success_fee_percent} onChange={(e) => setRegistryDraft((p) => ({ ...p, success_fee_percent: e.target.value }))} className="h-10 px-3 border border-gray-200 rounded-lg text-[13px]" placeholder="Muvaffaqiyat foizi %" />
                      <Button onClick={handleUpdateRegistry}>Ro'yxatni yangilash</Button>
                    </div>
                    <textarea value={registryDraft.registry_notes} onChange={(e) => setRegistryDraft((p) => ({ ...p, registry_notes: e.target.value }))} className="w-full min-h-[90px] border border-gray-200 rounded-lg p-3 text-[13px]" placeholder="Startup ro'yxati bo'yicha izoh..." />
                  </>
                ) : (
                  <p className="text-[12px] text-gray-500">Bosqich: {mapStatusText(registryDraft.lifecycle_status)} | Muvaffaqiyat ulushi: {registryDraft.success_fee_percent}%</p>
                )}
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                <div className="bg-white border border-gray-200 rounded-2xl p-6 space-y-4">
                  <h3 className="text-[13px] font-black uppercase tracking-widest text-gray-600">Saqlash kelishuvlari</h3>
                  {isOwner && (
                    <div className="space-y-3">
                      <input value={agreementDraft.title} onChange={(e) => setAgreementDraft((p) => ({ ...p, title: e.target.value }))} className="h-10 px-3 border border-gray-200 rounded-lg text-[13px] w-full" placeholder="Kelishuv nomi" />
                      <textarea value={agreementDraft.body} onChange={(e) => setAgreementDraft((p) => ({ ...p, body: e.target.value }))} className="w-full min-h-[90px] border border-gray-200 rounded-lg p-3 text-[13px]" placeholder="Kelishuv matni..." />
                      <select value={agreementDraft.status} onChange={(e) => setAgreementDraft((p) => ({ ...p, status: e.target.value }))} className="h-10 px-3 border border-gray-200 rounded-lg text-[13px] w-full">
                        <option value="draft">Qoralama</option>
                        <option value="active">Faol</option>
                        <option value="locked">Qulflangan</option>
                      </select>
                      <Button onClick={handleCreateAgreement}>Kelishuv yaratish</Button>
                    </div>
                  )}
                  <div className="space-y-3">
                    {workspaceAgreements.map((a) => (
                      <div key={a.id} className="border border-gray-100 rounded-xl p-4 bg-gray-50/40">
                        <div className="flex items-center justify-between">
                          <p className="text-[13px] font-bold">{a.title}</p>
                          <Badge>{mapStatusText(a.status)}</Badge>
                        </div>
                        <p className="text-[12px] text-gray-600 mt-2 whitespace-pre-wrap">{a.body}</p>
                        <p className="text-[11px] text-gray-500 mt-2">Imzolaganlar: {(a.signed_by || []).length}</p>
                        {currentUser && !(a.signed_by || []).includes(currentUser.id) && (isOwner || isMember) && (
                          <Button size="sm" variant="secondary" className="mt-3" onClick={() => handleSignAgreement(a)}>Imzolash</Button>
                        )}
                      </div>
                    ))}
                    {workspaceAgreements.length === 0 && <p className="text-[12px] text-gray-500">Kelishuv yo'q.</p>}
                  </div>
                </div>

                <div className="bg-white border border-gray-200 rounded-2xl p-6 space-y-4">
                  <h3 className="text-[13px] font-black uppercase tracking-widest text-gray-600">Investor aloqalari jurnali</h3>
                  {(isOwner || isMember) && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <input value={investorDraft.investor_name} onChange={(e) => setInvestorDraft((p) => ({ ...p, investor_name: e.target.value }))} className="h-10 px-3 border border-gray-200 rounded-lg text-[13px]" placeholder="Investor nomi" />
                      <select value={investorDraft.stage} onChange={(e) => setInvestorDraft((p) => ({ ...p, stage: e.target.value }))} className="h-10 px-3 border border-gray-200 rounded-lg text-[13px]">
                        <option value="pre-seed">Dastlabki bosqich</option>
                        <option value="seed">Urug' bosqichi</option>
                        <option value="series-a">A seriya</option>
                      </select>
                      <input type="number" value={investorDraft.amount} onChange={(e) => setInvestorDraft((p) => ({ ...p, amount: e.target.value }))} className="h-10 px-3 border border-gray-200 rounded-lg text-[13px]" placeholder="Miqdor (USD)" />
                      <select value={investorDraft.status} onChange={(e) => setInvestorDraft((p) => ({ ...p, status: e.target.value }))} className="h-10 px-3 border border-gray-200 rounded-lg text-[13px]">
                        <option value="planned">Rejalangan</option>
                        <option value="introduced">Tanishtirilgan</option>
                        <option value="meeting">Uchrashuv</option>
                        <option value="won">Yakunlangan</option>
                        <option value="lost">To'xtatilgan</option>
                      </select>
                      <textarea value={investorDraft.notes} onChange={(e) => setInvestorDraft((p) => ({ ...p, notes: e.target.value }))} className="md:col-span-2 w-full min-h-[80px] border border-gray-200 rounded-lg p-3 text-[13px]" placeholder="Izoh..." />
                      <Button onClick={handleCreateInvestorIntro} className="md:col-span-2">Investor yozuvi qo'shish</Button>
                    </div>
                  )}
                  <div className="space-y-3">
                    {workspaceInvestorIntros.map((i) => (
                      <div key={i.id} className="border border-gray-100 rounded-xl p-4 bg-gray-50/40">
                        <div className="flex items-center justify-between">
                          <p className="text-[13px] font-bold">{i.investor_name}</p>
                          <Badge>{mapStatusText(i.status)}</Badge>
                        </div>
                        <p className="text-[12px] text-gray-600 mt-2">Bosqich: {i.stage} | Miqdor: ${Number(i.amount || 0).toLocaleString()}</p>
                        <p className="text-[11px] text-gray-500 mt-1">Kiritgan: {i.introduced_by_name || i.introduced_by}</p>
                        {i.notes && <p className="text-[12px] text-gray-600 mt-2">{i.notes}</p>}
                      </div>
                    ))}
                    {workspaceInvestorIntros.length === 0 && <p className="text-[12px] text-gray-500">Investor jurnali bo'sh.</p>}
                  </div>
                </div>
              </div>
            </div>
            ) : renderProLocked("Startup ro'yxati Pro uchun")
          )}

          {activeDetailTab === 'airadar' && (
            hasProAccess ? (
            <div className="space-y-8">
              {workspaceAiRisk ? (
                <>
                  <div className="bg-gradient-to-br from-slate-900 via-gray-900 to-black text-white rounded-2xl p-8 border border-slate-700 shadow-2xl">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                      <div>
                        <p className="text-[11px] uppercase tracking-[0.25em] text-slate-300 font-bold">AI qaror tizimi</p>
                        <h3 className="text-3xl font-black mt-2">Xavf bali: {workspaceAiRisk.score}/100</h3>
                        <p className="text-[13px] text-slate-300 mt-2">Daraja: {mapRiskLevelText(workspaceAiRisk.level)}</p>
                      </div>
                      <div className="w-32 h-32 rounded-full border-8 border-white/20 flex items-center justify-center text-3xl font-black bg-white/5">
                        {workspaceAiRisk.score}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {[
                      { label: "Muddati o'tgan", value: workspaceAiRisk.metrics?.overdue_tasks ?? 0 },
                      { label: "To'xtab qolgan", value: workspaceAiRisk.metrics?.stalled_tasks ?? 0 },
                      { label: 'Bajarilish', value: `${workspaceAiRisk.metrics?.completion_rate ?? 0}%` },
                      { label: '7 kun faollik', value: workspaceAiRisk.metrics?.activity_7d ?? 0 }
                    ].map((m, idx) => (
                      <div key={idx} className="bg-white border border-gray-200 rounded-xl p-5 text-center">
                        <p className="text-2xl font-black">{m.value}</p>
                        <p className="text-[10px] uppercase tracking-widest text-gray-500 font-bold mt-1">{m.label}</p>
                      </div>
                    ))}
                  </div>

                  <div className="bg-white border border-gray-200 rounded-2xl p-6 space-y-3">
                    <h4 className="text-[13px] font-black uppercase tracking-widest text-gray-600">Xavf signallari</h4>
                    {workspaceAiRisk.signals?.map((s, idx) => (
                      <div key={idx} className={`border rounded-xl p-4 ${s.level === 'high' ? 'border-rose-200 bg-rose-50' : 'border-amber-200 bg-amber-50'}`}>
                        <p className="text-[11px] uppercase tracking-widest font-bold">{mapRiskTypeText(s.type)} / {mapRiskLevelText(s.level)}</p>
                        <p className="text-[13px] mt-1">{s.text}</p>
                      </div>
                    ))}
                    {(!workspaceAiRisk.signals || workspaceAiRisk.signals.length === 0) && (
                      <p className="text-[12px] text-gray-500">Xavf signal topilmadi, jamoa sog'lom ishlayapti.</p>
                    )}
                  </div>
                </>
              ) : (
                <EmptyState icon="fa-brain" title="AI xavf hisoblanmadi" subtitle="Ish maydoni ma'lumotlarini to'ldiring va qayta urinib ko'ring." />
              )}
            </div>
            ) : renderProLocked("AI tahlil Pro uchun")
          )}

          {activeDetailTab === 'jamoa' && (
            <div className="space-y-8">
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 md:gap-6">
                {selectedStartup.a_zolar.map((m, i) => (
                  <div
                    key={i}
                    onClick={() => handleOpenUserProfile(m.user_id)}
                    className="bg-white border border-gray-100 rounded-xl p-5 md:p-6 flex items-center gap-4 md:gap-5 hover:border-black transition-all relative group min-w-0 cursor-pointer"
                  >
                    <div className="w-10 h-10 md:w-12 md:h-12 bg-gray-50 border border-gray-100 rounded-full flex items-center justify-center text-[14px] md:text-[16px] font-black uppercase italic shadow-inner shrink-0">
                      {m.name[0]}
                    </div>
                    <div className="min-w-0">
                      <h4 className="text-[14px] md:text-[15px] font-bold tracking-tight truncate">{m.name}</h4>
                      <Badge variant="active" size="sm" className="mt-1 truncate max-w-full">{m.role}</Badge>
                      <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-2">{new Date(m.joined_at).toLocaleDateString()}</p>
                    </div>
                  </div>
                ))}
              </div>

              {(isOwner || isMember) && (
                <div className="bg-white border border-gray-200 rounded-2xl p-5 md:p-6 space-y-4">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-[13px] font-black uppercase tracking-widest text-gray-600">Tavsiya</h3>
                    <Badge variant="default">{memberRecommendations.length}</Badge>
                  </div>
                  <p className="text-[12px] text-gray-500">
                    Startupga kerakli mutaxassislar asosida mos nomzodlar.
                  </p>
                  <div className="space-y-3">
                    {memberRecommendations.map((candidate) => (
                      <div key={candidate.id} className="border border-gray-100 rounded-xl p-3 md:p-4 flex items-start justify-between gap-3">
                        <button
                          onClick={() => handleOpenUserProfile(candidate.id)}
                          className="flex items-start gap-3 min-w-0 text-left"
                        >
                          <img
                            src={candidate.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(candidate.name || 'Foydalanuvchi')}&background=111&color=fff`}
                            className="w-11 h-11 rounded-xl object-cover border border-gray-100 shrink-0"
                            alt={candidate.name}
                          />
                          <div className="min-w-0 space-y-1">
                            <p className="text-[13px] font-bold truncate">{candidate.name}</p>
                            <p className="text-[11px] text-gray-500 truncate">
                              Moslik: {candidate.match_score}/100 | Reputatsiya: {candidate.reputation_score ?? 0}/100 | Bandlik: {candidate.availability_score ?? 0}/100
                            </p>
                            <p className="text-[11px] text-gray-500 truncate">
                              Mutaxassislik: {(candidate.matched_specialties || []).join(', ')}
                            </p>
                            {(candidate.reason || []).slice(0, 2).map((reasonLine, idx) => (
                              <p key={`${candidate.id}-reason-${idx}`} className="text-[11px] text-gray-600 bg-slate-50 border border-slate-100 rounded-md px-2 py-1">
                                {reasonLine}
                              </p>
                            ))}
                          </div>
                        </button>
                        <Button
                          size="sm"
                          className="shrink-0"
                          onClick={() => handleSendStartupInvite(candidate)}
                        >
                          Taklif qilish
                        </Button>
                      </div>
                    ))}
                    {memberRecommendations.length === 0 && (
                      <p className="text-[12px] text-gray-500">Hozircha mos tavsiya topilmadi.</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {activeDetailTab === 'sozlamalar' && isOwner && (
            <div className="max-w-xl mx-auto md:mx-0 space-y-10 md:space-y-12">
              <section className="space-y-6 pt-10 md:pt-12 border-t border-gray-100">
                <h3 className="text-[11px] md:text-[12px] font-bold uppercase tracking-widest text-rose-500/50 border-b border-rose-100 pb-2">Xavfli hudud</h3>
                <div className="p-5 md:p-6 bg-rose-50 border border-rose-100 rounded-xl flex flex-col sm:flex-row items-center justify-between gap-6">
                  <div className="text-center sm:text-left">
                    <p className="text-[14px] font-bold text-rose-900 mb-1">Loyihani o'chirish</p>
                    <p className="text-[12px] text-rose-600/80">Loyiha o'chirilgach, uni qayta tiklab bo'lmaydi.</p>
                  </div>
                  <Button onClick={() => handleDeleteStartup(selectedStartup.id)} variant="danger" className="shrink-0 w-full sm:w-auto h-12 md:h-10">O'chirish</Button>
                </div>
              </section>
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderProfile = () => {
    if (!currentUser) {
      return <EmptyState icon="fa-lock" title="Kirish talab qilinadi" action={<Button onClick={() => openAuth('login')}>Kirish</Button>} />;
    }

    return (
      <div className="max-w-[860px] mx-auto space-y-10 md:space-y-12 animate-in fade-in">
        <div className="bg-white/90 backdrop-blur border border-gray-200 rounded-3xl overflow-hidden shadow-xl group">
          <div className="relative h-[170px] md:h-[220px]">
            {currentUser.banner ? (
              <img src={currentUser.banner} className="absolute inset-0 w-full h-full object-cover" alt="Profil banneri" />
            ) : (
              <div className="absolute inset-0 bg-gradient-to-r from-cyan-600 via-teal-600 to-emerald-500" />
            )}
            <div className="absolute inset-0 bg-black/15" />
            <button
              onClick={openEditProfileModal}
              className="absolute top-4 right-4 bg-white/80 border border-white rounded-full h-9 w-9 flex items-center justify-center text-gray-700 hover:bg-white transition"
              title="Banner tahrirlash"
            >
              <i className="fa-solid fa-camera"></i>
            </button>
          </div>

          <div className="px-6 md:px-10 pb-7 md:pb-9 -mt-12 md:-mt-14">
            <div className="flex flex-col md:flex-row md:items-end gap-5">
              <div className="relative group/avatar">
                <img src={currentUser.avatar} className="w-24 h-24 md:w-28 md:h-28 rounded-2xl border-4 border-white shadow-xl object-cover" alt="Profil rasmi" />
                <button onClick={openEditProfileModal} className="absolute inset-0 bg-black/40 rounded-2xl flex items-center justify-center text-white opacity-0 group-hover/avatar:opacity-100 transition-all"><i className="fa-solid fa-camera"></i></button>
              </div>
              <div className="flex-grow">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-2xl md:text-3xl font-black tracking-tight">{currentUser.name}</h2>
                  <Badge variant={currentUser.is_pro ? 'success' : 'default'}>{currentUser.is_pro ? 'PRO' : 'BEPUL'}</Badge>
                </div>
                <div className="flex gap-2 mt-2 flex-wrap">
                  <Badge variant="active" className="truncate max-w-[220px]">{currentUser.email}</Badge>
                  {currentUser.phone && currentUser.phone !== '000' && <Badge>{currentUser.phone}</Badge>}
                </div>
              </div>
              <div className="flex gap-2 md:justify-end">
                {!currentUser.is_pro && proEnabled && (
                  <Button onClick={() => setShowProModal(true)} className="h-10" icon="fa-crown">Pro</Button>
                )}
                <Button onClick={openEditProfileModal} variant="secondary" size="md" className="h-10">Tahrirlash</Button>
                <Button onClick={handleLogout} variant="danger" size="md" className="h-10">Chiqish</Button>
                {currentUser.cv_data && (
                  <Button variant="secondary" icon="fa-file-lines" onClick={() => handleOpenCv(currentUser)} className="h-10 border border-gray-100">
                    CV
                  </Button>
                )}
                {currentUser.portfolio_url && <Button variant="ghost" icon="fa-link" onClick={() => window.open(currentUser.portfolio_url, '_blank')} className="h-10 border border-gray-100" />}
              </div>
            </div>
            <p className="text-[13px] md:text-[14px] text-gray-500 mt-4">
              {currentUser.bio || "O'zingiz haqingizda bir necha so'z yozing."}
            </p>
            <div className="mt-4">
              {currentUser.cv_data ? (
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[12px] font-semibold text-slate-700 truncate">
                      <i className="fa-solid fa-file-lines mr-2"></i>
                      {currentUser.cv_file_name || 'CV'}
                    </p>
                    <p className="text-[11px] text-slate-500 mt-1">
                      Hajm: {formatFileSize(Number(currentUser.cv_size || 0))}
                      {currentUser.cv_updated_at ? ` | Yangilangan: ${new Date(currentUser.cv_updated_at).toLocaleString()}` : ''}
                    </p>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <Button size="sm" variant="secondary" onClick={() => handleOpenCv(currentUser)} icon="fa-eye">Ko'rish</Button>
                    <Button size="sm" variant="secondary" onClick={() => handleDownloadCv(currentUser)} icon="fa-download">Yuklab olish</Button>
                  </div>
                </div>
              ) : (
                <p className="text-[12px] text-gray-500">CV yuklanmagan.</p>
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
          {[
            { val: myStartups.length, label: 'Loyihalar' },
            { val: myStartups.reduce((acc, s) => acc + (s.tasks?.length || 0), 0), label: 'Vazifalar' },
            { val: profileReputation?.score ?? 0, label: 'Ball' },
            { val: currentUser.is_pro ? 'Pro' : 'Oddiy', label: 'Reja' }
          ].map((s, i) => (
            <div key={i} className="bg-white border border-gray-100 rounded-xl p-4 md:p-6 text-center shadow-sm hover:border-black transition-all">
              <p className="text-xl md:text-3xl font-extrabold italic mb-1">{s.val}</p>
              <p className="text-[9px] md:text-[10px] font-bold text-gray-400 uppercase tracking-widest">{s.label}</p>
            </div>
          ))}
        </div>

        {profileReputation && (
          <div className="bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600 rounded-2xl p-6 md:p-8 text-white shadow-xl">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div>
                <p className="text-[10px] uppercase tracking-[0.25em] font-bold text-white/80">Reputatsiya grafigi</p>
                <h3 className="text-3xl md:text-4xl font-black mt-2">{profileReputation.score}/100</h3>
                <p className="text-[13px] mt-2 text-white/90">
                  Tarmoq: {profileReputation.stats?.network_size || 0} | Hamkorlik: {profileReputation.stats?.collaboration_count || 0} loyiha
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3 w-full md:w-auto">
                <div className="bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-center">
                  <p className="text-xl font-black">{profileReputation.stats?.avg_rating || 0}</p>
                  <p className="text-[10px] uppercase tracking-widest">O'rtacha baho</p>
                </div>
                <div className="bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-center">
                  <p className="text-xl font-black">{profileReputation.stats?.completion_rate || 0}%</p>
                  <p className="text-[10px] uppercase tracking-widest">Bajarish</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {!currentUser.is_pro && proEnabled && (
          <div className="bg-white border border-amber-200 rounded-2xl p-6 md:p-7 flex flex-col md:flex-row md:items-center justify-between gap-5">
            <div>
              <p className="text-[11px] uppercase tracking-[0.2em] text-amber-600 font-bold">{proConfig.plan_name}</p>
              <h3 className="text-xl font-black mt-1">{proConfig.price_text}</h3>
              <p className="text-[13px] text-gray-500 mt-2">Bepul rejim: {freeStartupLimit} ta startup. Pro bilan cheksiz va premium bo'limlar ochiladi.</p>
            </div>
            <Button onClick={() => setShowProModal(true)} icon="fa-credit-card" className="h-11 px-7">To'lov yuborish</Button>
          </div>
        )}

        <div className="space-y-4 md:space-y-6 px-2">
          <h3 className="text-[11px] md:text-[12px] font-bold uppercase tracking-widest text-black/30 border-b border-gray-100 pb-2">Ko'nikmalar</h3>
          <div className="flex flex-wrap gap-2">
            {currentUser.skills && currentUser.skills.length > 0 ? currentUser.skills.map((s, i) => <Badge key={i} variant="default" size="md" className="!text-[11px] md:!text-[12px]"># {s}</Badge>) : (
              <p className="text-[12px] md:text-[13px] text-gray-400 italic">Hali ko'nikmalar kiritilmagan.</p>
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderAdmin = () => {
    if (!currentUser || currentUser.role !== 'admin') {
      return <EmptyState icon="fa-lock" title="Ruxsat yo'q" action={<Button onClick={() => navigateTo('explore')}>Ortga</Button>} />;
    }

    const stats = adminStats || {
      users: allUsers.length,
      startups: startups.length,
      pending_startups: startups.filter(s => s.status === 'pending_admin').length,
      join_requests: joinRequests.length,
      notifications: notifications.length,
      pro_users: allUsers.filter((u) => u.is_pro).length,
      pending_pro_requests: proRequests.filter((r) => r.status === 'pending').length
    };

    const adminTabs = [
      { key: 'moderation', label: 'Moderatsiya' },
      { key: 'users', label: 'Foydalanuvchilar' },
      { key: 'startups', label: 'Startuplar' },
      { key: 'pro', label: 'Pro' },
      { key: 'categories', label: 'Kategoriya' },
      { key: 'stats', label: 'Statistika' },
      { key: 'audit', label: 'Audit' }
    ];

    return (
      <div className="space-y-8 md:space-y-12 animate-in fade-in">
        <header className="flex flex-col gap-4">
          <div className="flex items-center gap-4">
            <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight italic">Boshqaruv paneli</h1>
            <Badge variant="danger" size="md">{stats.pending_startups}</Badge>
          </div>
          <div className="flex flex-wrap gap-2">
            {adminTabs.map(t => (
              <button
                key={t.key}
                onClick={() => setAdminTab(t.key)}
                className={`h-9 px-4 rounded-full text-[12px] font-semibold border transition-all ${adminTab === t.key ? 'bg-black border-black text-white' : 'bg-white border-gray-200 text-gray-600 hover:border-black'}`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </header>

        {adminTab === 'moderation' && (
          <div className="space-y-4">
            {startups.filter(s => s.status === 'pending_admin').map(s => (
              <div key={s.id} className="bg-white border border-gray-200 rounded-2xl p-6 md:p-8 flex flex-col xl:flex-row items-start gap-6 md:gap-8 hover:shadow-lg transition-all">
                <img src={s.logo} className="w-16 h-16 md:w-20 md:h-20 rounded-xl grayscale shadow-sm border border-gray-100 object-cover shrink-0" alt="Logo" />
                <div className="flex-grow space-y-3 md:space-y-4 min-w-0">
                  <div>
                    <h3 className="text-xl md:text-2xl font-extrabold tracking-tight italic truncate">{s.nomi}</h3>
                    <Badge variant="active" className="mt-2">{s.category}</Badge>
                  </div>
                  <p className="text-gray-500 text-[13px] md:text-[14px] italic leading-relaxed">"{s.tavsif}"</p>
                  <div className="flex flex-wrap gap-4 text-[10px] md:text-[11px] font-bold text-gray-400 uppercase tracking-widest">
                    <span>Egasi: <span className="text-black">{s.egasi_name}</span></span>
                    <span>Sana: <span className="text-black">{new Date(s.yaratilgan_vaqt).toLocaleDateString()}</span></span>
                  </div>
                </div>
                <div className="flex flex-col sm:flex-row gap-3 shrink-0 w-full xl:w-auto">
                  <Button onClick={() => handleAdminStartupStatus(s.id, 'approved')} className="flex-1 xl:flex-none h-12 px-10">Tasdiqlash</Button>
                  <Button onClick={() => handleAdminStartupStatus(s.id, 'rejected')} variant="danger" className="flex-1 xl:flex-none h-12 px-10">Rad etish</Button>
                </div>
              </div>
            ))}
            {startups.filter(s => s.status === 'pending_admin').length === 0 && (
              <EmptyState icon="fa-check-circle" title="Moderatsiya kutayotgan arizalar yo'q" />
            )}
          </div>
        )}

        {adminTab === 'users' && (
          <div className="space-y-3">
            {allUsers.map(u => (
              <div key={u.id} className="bg-white border border-gray-200 rounded-xl p-4 md:p-5 flex flex-col md:flex-row items-start md:items-center gap-4">
                <img src={u.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(u.name)}`} className="w-12 h-12 rounded-full border border-gray-100 object-cover" alt="Avatar" />
                <div className="flex-grow min-w-0">
                  <p className="text-[14px] font-bold truncate">{u.name}</p>
                  <p className="text-[12px] text-gray-500 truncate">{u.email}</p>
                  <div className="flex gap-2 mt-2">
                    <Badge variant={u.role === 'admin' ? 'active' : 'default'}>{mapRoleText(u.role)}</Badge>
                    {u.banned && <Badge variant="danger">Bloklangan</Badge>}
                    {u.is_pro && <Badge variant="success">PRO</Badge>}
                  </div>
                </div>
                <div className="flex flex-col sm:flex-row gap-2 w-full md:w-auto">
                  <select
                    value={u.role}
                    onChange={(e) => handleAdminUserRole(u.id, e.target.value)}
                    className="h-10 px-3 text-[12px] border border-gray-200 rounded-lg bg-white"
                  >
                    <option value="user">Foydalanuvchi</option>
                    <option value="admin">Admin</option>
                  </select>
                  <Button
                    variant={u.banned ? 'secondary' : 'danger'}
                    className="h-10 px-5"
                    onClick={() => handleAdminUserBan(u.id, !u.banned)}
                  >
                    {u.banned ? 'Blokdan chiqarish' : 'Bloklash'}
                  </Button>
                  <Button
                    variant={u.is_pro ? 'secondary' : 'primary'}
                    className="h-10 px-5"
                    onClick={() => handleAdminUserPro(u.id, !u.is_pro)}
                  >
                    {u.is_pro ? "Pro o'chirish" : 'Pro yoqish'}
                  </Button>
                  <Button variant="ghost" className="h-10 px-5 border border-gray-100" onClick={() => handleAdminUserDelete(u.id)}>O'chirish</Button>
                </div>
              </div>
            ))}
            {allUsers.length === 0 && <EmptyState icon="fa-user-slash" title="Foydalanuvchilar yo'q" />}
          </div>
        )}

        {adminTab === 'startups' && (
          <div className="space-y-3">
            {startups.map(s => (
              <div key={s.id} className="bg-white border border-gray-200 rounded-xl p-4 md:p-5 flex flex-col md:flex-row items-start md:items-center gap-4">
                <img src={s.logo} className="w-12 h-12 rounded-lg border border-gray-100 object-cover" alt="Logo" />
                <div className="flex-grow min-w-0">
                  <p className="text-[14px] font-bold truncate">{s.nomi}</p>
                  <p className="text-[12px] text-gray-500 truncate">{s.egasi_name}</p>
                  <div className="flex gap-2 mt-2">
                    <Badge variant={s.status === 'approved' ? 'success' : s.status === 'rejected' ? 'danger' : 'default'}>{mapStatusText(s.status)}</Badge>
                    <Badge>{s.category}</Badge>
                  </div>
                </div>
                <div className="flex flex-col sm:flex-row gap-2 w-full md:w-auto">
                  <Button className="h-10 px-5" onClick={() => handleAdminStartupStatus(s.id, 'approved')}>Tasdiqlash</Button>
                  <Button variant="danger" className="h-10 px-5" onClick={() => handleAdminStartupStatus(s.id, 'rejected')}>Rad etish</Button>
                  <Button variant="ghost" className="h-10 px-5 border border-gray-100" onClick={() => handleAdminStartupDelete(s.id)}>O'chirish</Button>
                </div>
              </div>
            ))}
            {startups.length === 0 && <EmptyState icon="fa-rocket" title="Loyihalar yo'q" />}
          </div>
        )}

        {adminTab === 'pro' && (
          <div className="space-y-6">
            <div className="bg-white border border-gray-200 rounded-2xl p-6 md:p-8 space-y-5">
              <div className="flex items-center justify-between gap-4">
                <h3 className="text-[13px] font-black uppercase tracking-widest text-gray-600">Pro konfiguratsiya</h3>
                <Badge variant={adminProConfigDraft.pro_enabled ? 'success' : 'danger'}>{adminProConfigDraft.pro_enabled ? 'YOQILGAN' : "O'CHIRILGAN"}</Badge>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input label="Reja nomi" value={adminProConfigDraft.plan_name} onChange={(e) => setAdminProConfigDraft((p) => ({ ...p, plan_name: e.target.value }))} />
                <Input label="Narx matni" value={adminProConfigDraft.price_text} onChange={(e) => setAdminProConfigDraft((p) => ({ ...p, price_text: e.target.value }))} />
                <Input label="Bepul startup limiti" type="number" value={adminProConfigDraft.startup_limit_free} onChange={(e) => setAdminProConfigDraft((p) => ({ ...p, startup_limit_free: Number(e.target.value || 1) }))} />
                <div className="space-y-1.5">
                  <label className="block text-[11px] font-bold text-gray-700 uppercase tracking-widest ml-1">Pro rejim</label>
                  <select className="w-full h-[44px] border border-gray-200 rounded-lg px-4 text-[14px]" value={adminProConfigDraft.pro_enabled ? 'on' : 'off'} onChange={(e) => setAdminProConfigDraft((p) => ({ ...p, pro_enabled: e.target.value === 'on' }))}>
                    <option value="on">Yoqilgan</option>
                    <option value="off">O'chirilgan</option>
                  </select>
                </div>
                <Input label="Karta egasi (ism familya)" value={adminProConfigDraft.card_holder} onChange={(e) => setAdminProConfigDraft((p) => ({ ...p, card_holder: e.target.value }))} />
                <Input label="Karta raqami" value={adminProConfigDraft.card_number} onChange={(e) => setAdminProConfigDraft((p) => ({ ...p, card_number: e.target.value }))} />
                <Input label="Bank nomi" value={adminProConfigDraft.bank_name} onChange={(e) => setAdminProConfigDraft((p) => ({ ...p, bank_name: e.target.value }))} />
                <Input label="Chek yuklash matni" value={adminProConfigDraft.receipt_note} onChange={(e) => setAdminProConfigDraft((p) => ({ ...p, receipt_note: e.target.value }))} />
              </div>
              <Button onClick={handleSaveProConfig} className="h-11 px-7">Saqlash</Button>
            </div>

            <div className="bg-white border border-gray-200 rounded-2xl p-6 md:p-8 space-y-4">
              <div className="flex items-center justify-between gap-4">
                <h3 className="text-[13px] font-black uppercase tracking-widest text-gray-600">Kutilayotgan Pro to'lovlar</h3>
                <Badge variant="danger">{proRequests.filter((r) => r.status === 'pending').length}</Badge>
              </div>
              {proRequests.filter((r) => r.status === 'pending').map((r) => (
                <div key={r.id} className="border border-gray-200 rounded-2xl p-4 md:p-5 space-y-4">
                  <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                    <div>
                      <p className="text-[14px] font-bold">{r.user_name} ({r.user_id})</p>
                      <p className="text-[12px] text-gray-500">Karta egasi: {r.sender_full_name} | Karta: {r.sender_card_number}</p>
                      <p className="text-[11px] text-gray-400">{new Date(r.created_at).toLocaleString()}</p>
                    </div>
                    <Badge>{mapStatusText(r.status)}</Badge>
                  </div>
                  <div className="rounded-xl overflow-hidden border border-gray-200 bg-gray-50">
                    <img src={r.receipt_image} alt="Chek rasmi" className="w-full max-h-[260px] object-contain" />
                  </div>
                  <div className="flex flex-col sm:flex-row gap-3">
                    <Button className="flex-1 h-10" onClick={() => handleReviewProRequest(r.id, 'approve')}>Tasdiqlash</Button>
                    <Button variant="danger" className="flex-1 h-10" onClick={() => handleReviewProRequest(r.id, 'reject')}>Rad etish</Button>
                  </div>
                </div>
              ))}
              {proRequests.filter((r) => r.status === 'pending').length === 0 && <EmptyState icon="fa-receipt" title="Kutilayotgan chek yo'q" />}
            </div>
          </div>
        )}

        {adminTab === 'categories' && (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {categories.map((c, i) => (
                <div key={`${c}-${i}`} className="flex items-center gap-2 bg-white border border-gray-200 rounded-full px-4 py-2 text-[12px]">
                  <span className="font-semibold">{c}</span>
                  <button onClick={() => handleDeleteCategory(c)} className="text-gray-400 hover:text-rose-600"><i className="fa-solid fa-xmark"></i></button>
                </div>
              ))}
              {categories.length === 0 && <p className="text-[12px] text-gray-400 italic">Kategoriya yo'q</p>}
            </div>
            <Button onClick={handleAddCategory} className="h-10 px-6">Kategoriya qo'shish</Button>
          </div>
        )}

        {adminTab === 'stats' && (
          <div className="grid grid-cols-2 md:grid-cols-7 gap-4 md:gap-6">
            {[
              { val: stats.users, label: 'Foydalanuvchilar' },
              { val: stats.startups, label: 'Startup' },
              { val: stats.pending_startups, label: 'Kutilmoqda' },
              { val: stats.join_requests, label: "So'rov" },
              { val: stats.notifications, label: 'Xabarnoma' },
              { val: stats.pro_users || 0, label: 'Pro foydalanuvchilar' },
              { val: stats.pending_pro_requests || 0, label: 'Kutilayotgan Pro' }
            ].map((s, i) => (
              <div key={i} className="bg-white border border-gray-100 rounded-xl p-4 md:p-6 text-center shadow-sm hover:border-black transition-all">
                <p className="text-xl md:text-3xl font-extrabold italic mb-1">{s.val}</p>
                <p className="text-[9px] md:text-[10px] font-bold text-gray-400 uppercase tracking-widest">{s.label}</p>
              </div>
            ))}
          </div>
        )}

        {adminTab === 'audit' && (
          <div className="space-y-3">
            {auditLogs.map(log => (
              <div key={log.id} className="bg-white border border-gray-200 rounded-xl p-4 md:p-5">
                <div className="flex items-center justify-between">
                  <p className="text-[12px] font-bold uppercase tracking-widest text-gray-400">{log.action}</p>
                  <p className="text-[10px] text-gray-400">{new Date(log.created_at).toLocaleString()}</p>
                </div>
                <p className="text-[12px] text-gray-600 mt-2">
                  Obyekt: <span className="font-semibold">{log.entity_type}</span> / {log.entity_id}
                </p>
                <p className="text-[12px] text-gray-600">Amal bajargan: {log.actor_id}</p>
              </div>
            ))}
            {auditLogs.length === 0 && <EmptyState icon="fa-list" title="Audit log bo'sh" />}
          </div>
        )}
      </div>
    );
  };

  const renderRequests = () => {
    if (!currentUser) {
      return <EmptyState icon="fa-lock" title="Kirish talab qilinadi" action={<Button onClick={() => openAuth('login')}>Kirish</Button>} />;
    }

    return (
      <div className="max-w-[800px] mx-auto space-y-8 md:space-y-12 animate-in fade-in">
        <header className="flex items-center gap-4">
          <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight italic">So'rovlar</h1>
          <Badge variant="active" size="md">{incomingRequests.length}</Badge>
        </header>

        <div className="space-y-4">
          {incomingRequests.map(r => (
            <div key={r.id} className="bg-white border border-gray-200 rounded-xl p-6 md:p-8 flex flex-col md:flex-row items-center gap-6 md:gap-8 hover:shadow-md transition-all">
              <button
                onClick={() => handleOpenUserProfile(r.user_id)}
                className="shrink-0"
                title="Profilni ochish"
              >
                {(usersById[r.user_id]?.avatar) ? (
                  <img
                    src={usersById[r.user_id].avatar}
                    alt={r.user_name}
                    className="w-12 h-12 md:w-14 md:h-14 rounded-full border border-gray-100 shadow-inner object-cover"
                  />
                ) : (
                  <div className="w-12 h-12 md:w-14 md:h-14 bg-gray-50 rounded-full flex items-center justify-center font-black text-lg md:text-xl italic border border-gray-100 shadow-inner">
                    {String(r.user_name || 'F').slice(0, 1).toUpperCase()}
                  </div>
                )}
              </button>
              <div className="flex-grow text-center md:text-left space-y-2 min-w-0">
                <button onClick={() => handleOpenUserProfile(r.user_id)} className="text-lg md:text-xl font-bold tracking-tight truncate hover:underline">
                  {r.user_name}
                </button>
                <div className="flex gap-2 justify-center md:justify-start flex-wrap">
                  <Badge variant="active">{r.specialty}</Badge>
                  <Badge className="truncate max-w-[150px]">Loyiha: {r.startup_name}</Badge>
                </div>
                <p className="text-gray-500 text-[12px] md:text-[13px] italic">"{r.comment}"</p>
                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">{new Date(r.created_at).toLocaleDateString()}</p>
              </div>
              <div className="flex gap-3 w-full md:w-auto shrink-0">
                <Button onClick={() => handleOpenUserProfile(r.user_id)} variant="secondary" className="flex-1 md:flex-none px-6 md:px-8 h-12">Profil</Button>
                <Button onClick={() => handleRequestAction(r.id, 'accept')} className="flex-1 md:flex-none px-6 md:px-8 h-12">Qabul</Button>
                <Button onClick={() => handleRequestAction(r.id, 'decline')} variant="danger" className="flex-1 md:flex-none px-6 md:px-8 h-12">Rad</Button>
              </div>
            </div>
          ))}
          {incomingRequests.length === 0 && (
            <EmptyState icon="fa-user-clock" title="Yangi so'rovlar yo'q" />
          )}
        </div>
      </div>
    );
  };

  const renderInbox = () => {
    if (!currentUser) {
      return <EmptyState icon="fa-lock" title="Kirish talab qilinadi" action={<Button onClick={() => openAuth('login')}>Kirish</Button>} />;
    }

    return (
      <div className="max-w-[600px] mx-auto space-y-6 md:space-y-8 animate-in fade-in">
        <header className="flex items-center justify-between border-b border-gray-100 pb-4 md:pb-6 px-2">
          <div className="flex items-center gap-3">
            <h1 className="text-xl md:text-2xl font-extrabold italic tracking-tight">Bildirishnomalar</h1>
            {unreadNotifCount > 0 && <Badge variant="danger" size="md">{unreadNotifCount}</Badge>}
          </div>
          {unreadNotifCount > 0 && (
            <Button variant="ghost" size="sm" onClick={handleMarkAllAsRead} className="text-[10px] md:text-[12px]">Barchasi o'qildi</Button>
          )}
        </header>

        <div className="space-y-3 px-2">
          {userNotifications.map(n => {
            const invitation = invitationByNotification[n.id] || null;
            const joinMeta = n?.meta?.type === 'join_request' ? n.meta : null;
            const linkedJoinRequest = joinMeta ? joinRequestById[joinMeta.join_request_id] : null;
            const joinRequester = joinMeta
              ? (usersById[joinMeta.requester_id] || null)
              : null;
            const joinRequesterName = joinRequester?.name || joinMeta?.requester_name || "Foydalanuvchi";
            const joinRequesterAvatar = joinRequester?.avatar || joinMeta?.requester_avatar || '';
            const joinRequesterId = joinRequester?.id || joinMeta?.requester_id || '';
            return (
              <div 
                key={n.id} 
                onClick={() => handleMarkAsRead(n.id)}
                className={`p-4 md:p-5 rounded-xl border flex items-start gap-3 md:gap-4 transition-all cursor-pointer ${n.is_read ? 'bg-white border-gray-100 opacity-60' : 'bg-gray-50 border-black shadow-sm'}`}
              >
                <div className={`w-8 h-8 md:w-10 md:h-10 rounded-lg flex items-center justify-center shrink-0 ${n.type === 'success' ? 'bg-emerald-100 text-emerald-700' : n.type === 'danger' ? 'bg-rose-100 text-rose-700' : 'bg-black text-white'}`}>
                  <i className={`fa-solid ${n.type === 'success' ? 'fa-check' : n.type === 'danger' ? 'fa-triangle-exclamation' : 'fa-info'} text-[12px] md:text-sm`}></i>
                </div>
                <div className="flex-grow min-w-0">
                  <h5 className="text-[13px] md:text-[14px] font-bold italic mb-1 truncate">{n.title}</h5>
                  <p className="text-[12px] md:text-[13px] text-gray-500 leading-relaxed mb-2 line-clamp-3">{n.text}</p>
                  {joinMeta && (
                    <div className="bg-white border border-gray-100 rounded-lg p-3 mb-2 space-y-3">
                      <div className="flex items-center justify-between gap-3">
                        <button
                          className="flex items-center gap-3 min-w-0 text-left"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (joinRequesterId) handleOpenUserProfile(joinRequesterId);
                          }}
                        >
                          {joinRequesterAvatar ? (
                            <img
                              src={joinRequesterAvatar}
                              alt={joinRequesterName}
                              className="w-10 h-10 rounded-full object-cover border border-gray-200 shrink-0"
                            />
                          ) : (
                            <div className="w-10 h-10 rounded-full bg-gray-100 border border-gray-200 flex items-center justify-center text-[12px] font-bold shrink-0">
                              {String(joinRequesterName || 'F').slice(0, 1).toUpperCase()}
                            </div>
                          )}
                          <div className="min-w-0">
                            <p className="text-[12px] font-bold text-gray-800 truncate">{joinRequesterName}</p>
                            <p className="text-[11px] text-gray-500 truncate">
                              {joinMeta.specialty || linkedJoinRequest?.specialty || "Mutaxassislik ko'rsatilmagan"}
                            </p>
                          </div>
                        </button>
                        {joinMeta.startup_name && (
                          <Badge variant="active" className="max-w-[150px] truncate">
                            {joinMeta.startup_name}
                          </Badge>
                        )}
                      </div>

                      {(joinMeta.comment || linkedJoinRequest?.comment) && (
                        <p className="text-[12px] text-gray-600">
                          "{joinMeta.comment || linkedJoinRequest?.comment}"
                        </p>
                      )}

                      {linkedJoinRequest ? (
                        <div className="flex gap-2 flex-wrap">
                          <Button
                            size="sm"
                            className="h-8 px-4"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRequestAction(linkedJoinRequest.id, 'accept', {
                                notificationId: n.id,
                                requestPayload: linkedJoinRequest
                              });
                            }}
                          >
                            Tasdiqlash
                          </Button>
                          <Button
                            size="sm"
                            variant="danger"
                            className="h-8 px-4"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRequestAction(linkedJoinRequest.id, 'decline', {
                                notificationId: n.id,
                                requestPayload: linkedJoinRequest
                              });
                            }}
                          >
                            Rad etish
                          </Button>
                        </div>
                      ) : (
                        <p className="text-[11px] text-gray-500">Bu so'rov allaqachon ko'rib chiqilgan.</p>
                      )}
                    </div>
                  )}
                  {invitation && invitation.status === 'pending' && (
                    <div className="bg-white border border-blue-100 rounded-lg p-3 mb-2 space-y-2">
                      <p className="text-[12px] font-semibold text-gray-700">
                        Sizni <span className="text-blue-700">{invitation.startup_name}</span> startupiga taklif qilishdi.
                      </p>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          className="h-8 px-4"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRespondInvitation(invitation.id, 'accept', n.id);
                          }}
                        >
                          Qo'shilish
                        </Button>
                        <Button
                          size="sm"
                          variant="danger"
                          className="h-8 px-4"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRespondInvitation(invitation.id, 'reject', n.id);
                          }}
                        >
                          Rad etish
                        </Button>
                      </div>
                    </div>
                  )}
                  <p className="text-[9px] md:text-[10px] font-bold text-gray-400 uppercase tracking-widest">{new Date(n.created_at).toLocaleString()}</p>
                </div>
              </div>
            );
          })}
          {userNotifications.length === 0 && (
            <EmptyState icon="fa-bell-slash" title="Bildirishnomalar yo'q" />
          )}
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-white">
        <div className="text-center space-y-4">
          <i className="fa-solid fa-spinner animate-spin text-4xl text-gray-900"></i>
          <p className="text-[14px] font-bold text-gray-400 uppercase tracking-widest">Yuklanmoqda...</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`app-shell ${isDarkTheme ? 'theme-dark' : ''} flex h-screen text-gray-900 selection:bg-emerald-700 selection:text-white overflow-hidden`}>
      <main className="flex-grow flex flex-col overflow-hidden relative">
        <header className="sticky top-0 z-50 px-3 md:px-8 pt-3 md:pt-4 pb-2">
          <div className="max-w-[1180px] mx-auto space-y-3">
            <div className="ios-topbar rounded-[24px] border border-white/70 bg-white/75 backdrop-blur-xl px-4 md:px-6 py-3 flex items-center justify-between shadow-lg">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <img src={Logo} alt="GarajHub" className="w-7 h-7 rounded-lg" />
                  <p className="text-[28px] leading-none font-black tracking-[-0.04em]">GarajHub</p>
                </div>
                <p className="text-[9px] uppercase tracking-[0.2em] font-bold text-slate-500 mt-1">{activeTabTitle}</p>
              </div>
              <div className="flex items-center gap-2">
                {!isProUser && proEnabled && (
                  <button onClick={() => setShowProModal(true)} className="h-10 px-3 rounded-full border border-amber-200 bg-amber-50 text-amber-700 text-[12px] font-bold">
                    Pro
                  </button>
                )}
                {currentUser?.role === 'admin' && (
                  <button onClick={() => navigateTo('admin')} className="h-10 px-3 rounded-full border border-indigo-200 bg-indigo-50 text-indigo-700 text-[12px] font-bold">
                    Boshqaruv
                  </button>
                )}
                <button
                  onClick={() => setIsDarkTheme((prev) => !prev)}
                  className="relative h-10 w-10 rounded-full border border-slate-200 bg-slate-100 text-slate-700"
                  title="Fon rejimini almashtirish"
                >
                  <i className={`fa-regular ${isDarkTheme ? 'fa-sun' : 'fa-moon'}`}></i>
                </button>
                <button onClick={() => navigateTo('inbox')} className="relative h-10 w-10 rounded-full border border-slate-200 bg-slate-100 text-slate-700">
                  <i className="fa-regular fa-bell"></i>
                  {unreadNotifCount > 0 && <span className="absolute -top-1 -right-1 h-5 min-w-[20px] px-1 rounded-full bg-blue-600 text-white text-[10px] font-black flex items-center justify-center">{unreadNotifCount}</span>}
                </button>
              </div>
            </div>
          </div>
        </header>

        <section className="flex-grow overflow-y-auto p-3 md:p-8 lg:p-10 custom-scrollbar scroll-smooth">
          <div className="max-w-[1180px] mx-auto pb-32 md:pb-24">
            {activeTab === 'explore' && renderExplore()}
            {activeTab === 'create' && renderCreateStartup()}
            {activeTab === 'my-projects' && renderMyProjects()}
            {activeTab === 'details' && renderDetails()}
            {activeTab === 'requests' && renderRequests()}
            {activeTab === 'profile' && renderProfile()}
            {activeTab === 'admin' && renderAdmin()}
            {activeTab === 'inbox' && renderInbox()}
          </div>
        </section>

        <div className="fixed left-0 right-0 bottom-3 md:bottom-4 z-50 px-3 md:px-8">
          <nav className="ios-navbar max-w-[1180px] mx-auto rounded-[24px] border border-slate-200/80 bg-white/92 backdrop-blur-xl p-1.5 shadow-xl">
            <div className="grid grid-cols-5 gap-1">
              {topNavItems.map((item) => {
                const isActive = activeTab === item.key || (item.key === 'my-projects' && activeTab === 'details');
                const lockRequired = item.auth && !currentUser;
                return (
                  <button
                    key={item.key}
                    onClick={() => {
                      if (lockRequired) return openAuth('login');
                      navigateTo(item.key);
                    }}
                    className={`relative h-[58px] rounded-[18px] flex flex-col items-center justify-center gap-1 text-[11px] font-semibold transition-all ${isActive ? 'bg-blue-50 text-blue-700 border border-blue-100' : 'text-slate-600 hover:bg-slate-100'}`}
                  >
                    <i className={`fa-solid ${item.icon} text-[15px]`}></i>
                    <span>{item.label}</span>
                    {item.key === 'inbox' && unreadNotifCount > 0 && (
                      <span className="absolute top-2 right-3 h-4 min-w-[16px] px-1 rounded-full bg-blue-600 text-white text-[9px] font-black flex items-center justify-center">{unreadNotifCount}</span>
                    )}
                  </button>
                );
              })}
            </div>
          </nav>
        </div>

        {/* AI MENTOR FAB */}
        <button 
           onClick={() => setShowAIMentor(!showAIMentor)}
           className={`fixed bottom-24 right-6 md:bottom-8 md:right-8 w-14 h-14 md:w-16 md:h-16 bg-gradient-to-br from-cyan-500 to-blue-600 text-white flex items-center justify-center text-xl rounded-[22px] shadow-2xl hover:scale-105 active:scale-95 transition-all z-[110] border border-white/80 ${showAIMentor ? 'from-rose-500 to-pink-600' : ''}`}
        >
           <i className={`fa-solid ${showAIMentor ? 'fa-xmark' : 'fa-robot'} text-lg md:text-xl`}></i>
        </button>

        {showAIMentor && (
          <div className="fixed bottom-32 right-4 left-4 md:left-auto md:bottom-28 md:right-8 md:w-[400px] h-[500px] md:h-[600px] bg-white border border-gray-100 shadow-2xl rounded-2xl flex flex-col z-[100] animate-in slide-in-from-bottom-8 duration-300 overflow-hidden">
             <div className="p-4 md:p-5 bg-gradient-to-r from-cyan-600 to-blue-700 flex items-center justify-between text-white shrink-0">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center text-sm"><i className="fa-solid fa-robot"></i></div>
                  <h4 className="text-[11px] md:text-[13px] font-extrabold uppercase tracking-widest italic">AI Ustoz</h4>
                </div>
                <button onClick={() => setShowAIMentor(false)} className="text-white/40 hover:text-white transition-colors p-2 -mr-2"><i className="fa-solid fa-xmark text-lg"></i></button>
             </div>
             <div className="flex-grow p-4 md:p-6 space-y-4 overflow-y-auto custom-scrollbar bg-white">
                <div className="p-4 bg-gray-50 border border-gray-100 rounded-xl text-[12px] md:text-[13px] text-gray-600 italic leading-relaxed">
                  Assalomu alaykum! Men sizning startup bo'yicha maslahatchi AI mentorigizman. Savollaringizni bering!
                </div>
                {aiChat.map(m => (
                   <div key={m.id} className={`flex ${m.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[85%] p-3 md:p-4 text-[12px] md:text-[13px] font-medium leading-relaxed rounded-2xl shadow-sm ${m.sender === 'user' ? 'bg-black text-white' : 'bg-gray-100 text-gray-900 border border-gray-200 italic'}`}>
                        {m.text}
                      </div>
                   </div>
                ))}
                {aiLoading && <div className="text-[10px] md:text-[11px] font-black text-gray-300 animate-pulse italic uppercase tracking-widest pl-2">Mentor o'ylamoqda...</div>}
                <div ref={chatEndRef} />
             </div>
             <div className="p-4 border-t border-gray-100 bg-white flex gap-2 shrink-0">
                <input 
                  type="text" value={aiInput} onChange={e => setAiInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSendAIMessage()}
                  placeholder="Savolingizni yozing..."
                  className="flex-grow bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-[14px] md:text-[13px] outline-none focus:border-black transition-all"
                />
                <button onClick={handleSendAIMessage} disabled={aiLoading} className="w-10 h-10 md:w-12 md:h-12 bg-black text-white flex items-center justify-center rounded-xl hover:scale-105 active:scale-95 transition-all shrink-0 disabled:opacity-50"><i className="fa-solid fa-paper-plane text-xs"></i></button>
             </div>
          </div>
        )}
      </main>

      {/* AUTH MODAL */}
      {showAuthModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 animate-in fade-in duration-300">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-md" onClick={() => setShowAuthModal(false)} />
          <div className="relative bg-white w-full max-w-sm rounded-2xl shadow-2xl p-6 md:p-10 animate-in slide-in-from-bottom-12 duration-500 overflow-y-auto max-h-[95vh] custom-scrollbar">
            <div className="text-center space-y-4 md:space-y-6 mb-8">
              <div className="w-14 h-14 md:w-16 md:h-16 bg-black text-white flex items-center justify-center text-3xl md:text-4xl font-black mx-auto rounded-2xl shadow-xl">G</div>
              <div>
                <h3 className="text-2xl md:text-3xl font-extrabold italic tracking-tighter text-gray-900 uppercase">{authMode === 'login' ? 'Kirish' : 'Ro\'yxat'}</h3>
                <p className="text-gray-400 text-[12px] md:text-[13px] mt-2 px-2">Startup ekotizimiga hush kelibsiz.</p>
              </div>
            </div>
            
            <form onSubmit={handleAuth} className="space-y-4">
              {authMode === 'register' && (
                <div className="space-y-4 animate-in fade-in duration-300">
                  <Input required name="name" label="To'liq ism" icon="fa-signature" placeholder="Ism Sharif" />
                  <Input name="phone" label="Telefon" icon="fa-phone" placeholder="+998" />
                  <FileUpload label="Profil rasmi" onChange={handleFileChange} preview={tempFileBase64 || undefined} />
                </div>
              )}
              <div className="space-y-4">
                <Input required name="email" type="email" label="Elektron pochta" icon="fa-at" placeholder="namuna@mail.com" />
                <Input required name="password" type="password" label="Parol" icon="fa-lock" placeholder="********" />
              </div>
              <Button type="submit" className="w-full h-12 md:h-12 mt-4 font-bold uppercase tracking-widest italic shadow-lg">Davom etish</Button>
            </form>
            
            <div className="text-center space-y-4 pt-6 border-t border-gray-50 mt-8">
              <button 
                type="button"
                onClick={() => setAuthMode(authMode === 'login' ? 'register' : 'login')} 
                className="text-[10px] md:text-[11px] font-bold text-gray-400 uppercase tracking-widest hover:text-black transition-colors italic w-full text-center"
              >
                {authMode === 'login' ? "Hisobingiz yo'qmi? Ro'yxatdan o'tish" : "Hisobingiz bormi? Kirishga o'tish"}
              </button>
              <button 
                type="button"
                onClick={() => setShowAuthModal(false)} 
                className="block mx-auto text-[10px] font-bold text-rose-300 uppercase tracking-widest hover:text-rose-600 transition-colors italic p-2"
              >
                Bekor qilish
              </button>
            </div>
          </div>
        </div>
      )}

      {/* EDIT PROFILE MODAL */}
      <Modal isOpen={isEditProfileModalOpen} onClose={closeEditProfileModal} title="Profilni tahrirlash">
        <div className="space-y-6 md:space-y-8">
          <FileUpload label="Profil banneri" onChange={handleBannerChange} preview={tempBannerBase64 || editedUser.banner || currentUser?.banner} icon="fa-image" />
          <FileUpload label="Profil rasmi" onChange={handleFileChange} preview={editedUser.avatar || currentUser?.avatar} />
          <div className="space-y-2">
            <label className="block text-[11px] font-bold text-gray-700 uppercase tracking-widest ml-1">CV yuklash (PDF, DOC, DOCX)</label>
            <div className="border border-gray-200 rounded-xl p-4 bg-slate-50/70 space-y-3">
              {(editedUser.cv_data || currentUser?.cv_data) ? (
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[12px] font-semibold text-gray-700 truncate">
                      <i className="fa-solid fa-file-lines mr-2"></i>
                      {editedUser.cv_file_name || currentUser?.cv_file_name || 'CV'}
                    </p>
                    <p className="text-[11px] text-gray-500">
                      Hajm: {formatFileSize(Number(editedUser.cv_size || currentUser?.cv_size || 0))}
                    </p>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <Button size="sm" variant="secondary" onClick={() => handleOpenCv(editedUser.cv_data ? editedUser : currentUser)} icon="fa-eye">Ko'rish</Button>
                    <Button size="sm" variant="danger" onClick={handleRemoveCv} icon="fa-trash">O'chirish</Button>
                  </div>
                </div>
              ) : (
                <p className="text-[12px] text-gray-500">CV hali yuklanmagan.</p>
              )}
              <label className="inline-flex items-center gap-2 px-3 h-9 rounded-lg border border-gray-300 bg-white text-[12px] font-semibold cursor-pointer hover:border-black transition">
                <i className="fa-solid fa-upload"></i>
                CV fayl tanlash
                <input
                  type="file"
                  accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  onChange={handleCvFileChange}
                  className="hidden"
                />
              </label>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
            <Input label="Ism" value={editedUser.name || currentUser?.name || ''} onChange={(e) => setEditedUser(prev => ({ ...prev, name: e.target.value }))} icon="fa-signature" />
            <Input label="Telefon" value={editedUser.phone || currentUser?.phone || ''} onChange={(e) => setEditedUser(prev => ({ ...prev, phone: e.target.value }))} icon="fa-phone" />
          </div>
          <TextArea label="Qisqacha bio" value={editedUser.bio || currentUser?.bio || ''} onChange={(e) => setEditedUser(prev => ({ ...prev, bio: e.target.value }))} placeholder="Sizning startup tajribangiz..." />
          <Input
            label="Ko'nikmalar"
            value={editedSkillsText}
            onChange={(e) => {
              const raw = e.target.value;
              setEditedSkillsText(raw);
              setEditedUser((prev) => ({ ...prev, skills: parseSkillsInput(raw) }));
            }}
            helper="Vergul, probel yoki yangi qator bilan ajrating"
            icon="fa-bolt"
            placeholder="frontend backend, ui ux, python"
          />
          <Input label="Portfolio" value={editedUser.portfolio_url || currentUser?.portfolio_url || ''} onChange={(e) => setEditedUser(prev => ({ ...prev, portfolio_url: e.target.value }))} placeholder="https://..." icon="fa-link" />
          
          <div className="flex flex-col sm:flex-row gap-3 md:gap-4 pt-4">
             <Button variant="secondary" className="w-full h-12 md:h-10" onClick={closeEditProfileModal}>Bekor qilish</Button>
             <Button className="w-full h-12 md:h-10" onClick={handleUpdateProfile}>Saqlash</Button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={showProModal} onClose={() => { setShowProModal(false); setProReceiptBase64(''); }} title={proConfig.plan_name || 'GarajHub Pro'} size="lg">
        <div className="space-y-7">
          <div className="bg-gradient-to-r from-slate-900 via-gray-900 to-black rounded-2xl p-5 text-white space-y-2">
            <p className="text-[11px] uppercase tracking-[0.2em] text-slate-300 font-bold">To'lov ma'lumotlari</p>
            <p className="text-xl font-black">{proConfig.price_text}</p>
            <p className="text-[13px] text-slate-300">Karta egasi: <span className="text-white font-semibold">{proConfig.card_holder || 'Admin tomonidan kiritiladi'}</span></p>
            <p className="text-[13px] text-slate-300">Karta raqami: <span className="text-white font-semibold">{proConfig.card_number || 'Admin tomonidan kiritiladi'}</span></p>
            <p className="text-[13px] text-slate-300">Bank: <span className="text-white font-semibold">{proConfig.bank_name || '-'}</span></p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label="Karta egasining ism-familiyasi"
              value={proRequestDraft.sender_full_name}
              onChange={(e) => setProRequestDraft((p) => ({ ...p, sender_full_name: e.target.value }))}
              placeholder="Ozodbek Mamatov"
              icon="fa-id-card"
            />
            <Input
              label="To'lov qilgan karta raqami"
              value={proRequestDraft.sender_card_number}
              onChange={(e) => setProRequestDraft((p) => ({ ...p, sender_card_number: e.target.value }))}
              placeholder="8600 **** **** 1234"
              icon="fa-credit-card"
            />
          </div>

          <FileUpload label={proConfig.receipt_note || 'Chek rasmini yuklang'} onChange={handleProReceiptChange} preview={proReceiptBase64 || undefined} icon="fa-receipt" />

          <div className="flex flex-col sm:flex-row gap-3">
            <Button variant="secondary" className="w-full" onClick={() => { setShowProModal(false); setProReceiptBase64(''); }}>Bekor qilish</Button>
            <Button className="w-full" onClick={handleSubmitProRequest} icon="fa-paper-plane">Yuborish</Button>
          </div>

          {currentUser && proRequests.length > 0 && currentUser.role !== 'admin' && (
            <div className="border-t border-gray-100 pt-6 space-y-3">
              <h4 className="text-[11px] font-bold uppercase tracking-widest text-gray-500">So'nggi Pro so'rovlar</h4>
              {proRequests.slice(0, 5).map((r) => (
                <div key={r.id} className="border border-gray-100 rounded-xl p-3 bg-gray-50/70">
                  <div className="flex items-center justify-between">
                    <p className="text-[12px] font-semibold">{r.sender_full_name}</p>
                    <Badge variant={r.status === 'approved' ? 'success' : r.status === 'rejected' ? 'danger' : 'default'}>{mapStatusText(r.status)}</Badge>
                  </div>
                  <p className="text-[11px] text-gray-500 mt-1">{new Date(r.created_at).toLocaleString()}</p>
                  {r.admin_note && <p className="text-[12px] text-gray-600 mt-2">Izoh: {r.admin_note}</p>}
                </div>
              ))}
            </div>
          )}
        </div>
      </Modal>

      <Modal
        isOpen={isUserProfileModalOpen}
        onClose={() => { setIsUserProfileModalOpen(false); setViewedUser(null); setViewedUserReputation(null); }}
        title="Foydalanuvchi profili"
        size="lg"
      >
        {viewedUser ? (
          <div className="space-y-6">
            <div className="rounded-2xl overflow-hidden border border-gray-200">
              <div className="h-40 relative">
                {viewedUser.banner ? (
                  <img src={viewedUser.banner} className="absolute inset-0 w-full h-full object-cover" alt="Profil banneri" />
                ) : (
                  <div className="absolute inset-0 bg-gradient-to-r from-slate-100 via-blue-50 to-cyan-50" />
                )}
              </div>
              <div className="px-6 pb-6 -mt-10 flex flex-col md:flex-row md:items-end gap-4">
                <img src={viewedUser.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(viewedUser.name || 'Foydalanuvchi')}`} className="w-20 h-20 rounded-2xl border-4 border-white shadow-lg object-cover" alt="Profil rasmi" />
                <div className="flex-grow">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-xl font-black">{viewedUser.name}</h3>
                    <Badge variant={viewedUser.is_pro ? 'success' : 'default'}>{viewedUser.is_pro ? 'PRO' : 'Oddiy'}</Badge>
                  </div>
                  <p className="text-[12px] text-gray-500 mt-1">{viewedUser.email}</p>
                  {viewedUser.phone && <p className="text-[12px] text-gray-500">{viewedUser.phone}</p>}
                  {viewedUser.cv_data && (
                    <div className="flex gap-2 mt-3">
                      <Button size="sm" variant="secondary" onClick={() => handleOpenCv(viewedUser)} icon="fa-file-lines">CV ko'rish</Button>
                      <Button size="sm" variant="secondary" onClick={() => handleDownloadCv(viewedUser)} icon="fa-download">Yuklab olish</Button>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {viewedUserReputation && (
              <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-4">
                <p className="text-[11px] uppercase tracking-widest font-bold text-emerald-700">Reputatsiya</p>
                <p className="text-2xl font-black text-emerald-800 mt-1">{viewedUserReputation.score}/100</p>
                <p className="text-[12px] text-emerald-700 mt-1">Baholar soni: {viewedUserReputation.stats?.reviews_received || 0} | Vazifa bajarish: {viewedUserReputation.stats?.completion_rate || 0}%</p>
              </div>
            )}

            <div className="space-y-2">
              <h4 className="text-[11px] uppercase tracking-widest font-bold text-gray-500">Qisqacha ma'lumot</h4>
              <p className="text-[13px] text-gray-700">{viewedUser.bio || "Foydalanuvchi bio kiritmagan."}</p>
            </div>

            <div className="space-y-2">
              <h4 className="text-[11px] uppercase tracking-widest font-bold text-gray-500">Ko'nikmalar</h4>
              <div className="flex flex-wrap gap-2">
                {Array.isArray(viewedUser.skills) && viewedUser.skills.length > 0 ? (
                  viewedUser.skills.map((skill, idx) => <Badge key={idx}>{skill}</Badge>)
                ) : (
                  <p className="text-[12px] text-gray-500">Ko'nikmalar kiritilmagan.</p>
                )}
              </div>
            </div>
          </div>
        ) : (
          <p className="text-[13px] text-gray-500">Profil yuklanmoqda...</p>
        )}
      </Modal>

      <style>{`
        .app-shell {
          --brand-1: #2563eb;
          --brand-2: #0ea5e9;
          --surface-1: #f8fafc;
          --surface-2: #f1f5f9;
          font-family: 'Space Grotesk', 'Manrope', system-ui, -apple-system, sans-serif;
          background:
            radial-gradient(circle at 8% 8%, rgba(37, 99, 235, 0.07), transparent 42%),
            radial-gradient(circle at 88% 12%, rgba(14, 165, 233, 0.06), transparent 36%),
            linear-gradient(180deg, var(--surface-1), var(--surface-2));
        }

        .app-shell.theme-dark {
          --surface-1: #0b1220;
          --surface-2: #111827;
          --card: #111c2f;
          --card-soft: #0f1a2b;
          --card-muted: #16243a;
          --text-1: #ecf4ff;
          --text-2: #c9d8ee;
          --text-3: #98abc6;
          --border-1: rgba(148, 163, 184, 0.28);
          --border-2: rgba(71, 85, 105, 0.6);
          color: var(--text-2);
          background:
            radial-gradient(circle at 8% 8%, rgba(59, 130, 246, 0.2), transparent 42%),
            radial-gradient(circle at 88% 12%, rgba(14, 165, 233, 0.18), transparent 36%),
            linear-gradient(180deg, var(--surface-1), var(--surface-2));
        }

        .ios-topbar,
        .ios-navbar {
          backdrop-filter: blur(18px) saturate(1.15);
          -webkit-backdrop-filter: blur(18px) saturate(1.15);
        }

        .app-shell.theme-dark .ios-topbar,
        .app-shell.theme-dark .ios-navbar {
          background: rgba(15, 23, 42, 0.78) !important;
          border-color: rgba(148, 163, 184, 0.28) !important;
        }

        .app-shell.theme-dark .ios-navbar button[class*="bg-blue-50"] {
          background: #1a3358 !important;
          color: #dbeafe !important;
          border-color: #2a4a76 !important;
        }

        .app-shell.theme-dark .ios-navbar button:not([class*="bg-blue-50"]) {
          color: #9eb3cf !important;
        }

        .app-shell.theme-dark .ios-navbar button:not([class*="bg-blue-50"]):hover {
          background: rgba(30, 41, 59, 0.8) !important;
        }

        .app-shell.theme-dark [class*="bg-white"]:not([class*="bg-white/"]) {
          background-color: var(--card) !important;
        }

        .app-shell.theme-dark [class*="bg-gray-50"],
        .app-shell.theme-dark [class*="bg-gray-100"],
        .app-shell.theme-dark [class*="bg-slate-50"],
        .app-shell.theme-dark [class*="bg-slate-100"] {
          background-color: var(--card-soft) !important;
        }

        .app-shell.theme-dark [class*="bg-amber-50"],
        .app-shell.theme-dark [class*="bg-emerald-50"],
        .app-shell.theme-dark [class*="bg-rose-50"],
        .app-shell.theme-dark [class*="bg-blue-50"] {
          background-color: var(--card-muted) !important;
        }

        .app-shell.theme-dark [class*="border-gray-"],
        .app-shell.theme-dark [class*="border-slate-"] {
          border-color: var(--border-2) !important;
        }

        .app-shell.theme-dark .text-black,
        .app-shell.theme-dark .text-gray-900,
        .app-shell.theme-dark [class*="text-slate-900"] {
          color: var(--text-1) !important;
        }

        .app-shell.theme-dark .text-gray-800,
        .app-shell.theme-dark .text-gray-700 {
          color: var(--text-2) !important;
        }

        .app-shell.theme-dark .text-gray-600,
        .app-shell.theme-dark .text-gray-500,
        .app-shell.theme-dark .text-gray-400,
        .app-shell.theme-dark [class*="text-slate-500"],
        .app-shell.theme-dark [class*="text-slate-400"] {
          color: var(--text-3) !important;
        }

        .app-shell.theme-dark input,
        .app-shell.theme-dark textarea,
        .app-shell.theme-dark select {
          background-color: #0d1728 !important;
          color: var(--text-1) !important;
          border-color: var(--border-2) !important;
        }

        .app-shell.theme-dark input::placeholder,
        .app-shell.theme-dark textarea::placeholder {
          color: #7f96b5 !important;
        }

        .app-shell.theme-dark .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #3b4f6d;
        }

        .ios-topbar {
          box-shadow: 0 8px 30px rgba(15, 23, 42, 0.08);
        }

        .ios-navbar {
          box-shadow: 0 10px 25px rgba(15, 23, 42, 0.07);
        }

        @media (max-width: 640px) {
          .ios-topbar {
            border-radius: 22px;
            padding-top: 12px;
            padding-bottom: 12px;
          }
          .ios-navbar {
            border-radius: 20px;
          }
          .ios-navbar button {
            border-radius: 16px;
          }
        }

        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #E5E7EB; border-radius: 10px; }
        
        .fade-in { animation: fadeIn 200ms ease-out; }
        .slide-up { animation: slideUp 300ms ease-out; }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes slideUp { 
          from { transform: translateY(10px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        
        input, select, textarea { border-radius: 8px; font-size: 14px; }
        @media (max-width: 640px) {
          input, select, textarea { font-size: 16px; }
        }
        
        .animate-in {
          animation-duration: 300ms;
          animation-fill-mode: both;
        }
        
        .slide-in-from-bottom-8 {
          animation: slideInFromBottom 300ms ease-out;
        }
        
        .slide-in-from-bottom-12 {
          animation: slideInFromBottom12 500ms ease-out;
        }
        
        @keyframes slideInFromBottom {
          from {
            transform: translateY(2rem);
            opacity: 0;
          }
          to {
            transform: translateY(0);
            opacity: 1;
          }
        }
        
        @keyframes slideInFromBottom12 {
          from {
            transform: translateY(3rem);
            opacity: 0;
          }
          to {
            transform: translateY(0);
            opacity: 1;
          }
        }
      `}</style>
    </div>
  );
};

export default App;
