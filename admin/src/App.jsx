import { useState } from 'react';
import { useAuth } from './auth.jsx';
import { Button, Field, Notice, TextInput } from './components/ui.jsx';
import { MembersPage } from './pages/MembersPage.jsx';
import { ImportPage } from './pages/ImportPage.jsx';
import { EmergencyAdminPage } from './pages/EmergencyAdminPage.jsx';
import { OccasionsAdminPage } from './pages/OccasionsAdminPage.jsx';
import { ContentAdminPage } from './pages/ContentAdminPage.jsx';
import { HistoryPage } from './pages/HistoryPage.jsx';
import { AdminsPage } from './pages/AdminsPage.jsx';

const SECTIONS = [
  { id: 'members', label: 'सदस्य निर्देशिका', en: 'Directory', Page: MembersPage },
  { id: 'import', label: 'Excel / CSV आयात', en: 'Import', Page: ImportPage },
  { id: 'emergency', label: 'आपातकालीन संपर्क', en: 'Emergency', Page: EmergencyAdminPage },
  { id: 'occasions', label: 'कैलेंडर अवसर', en: 'Occasions', Page: OccasionsAdminPage },
  { id: 'content', label: 'विज्ञापन एवं सूचनाएँ', en: 'Ads & notices', Page: ContentAdminPage },
  { id: 'history', label: 'इतिहास', en: 'History', Page: HistoryPage },
  { id: 'admins', label: 'व्यवस्थापक', en: 'Admins', Page: AdminsPage },
];

function LoginPage() {
  const { signIn, resetPassword } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      await signIn(email.trim(), password);
    } catch {
      setMessage({ tone: 'error', text: 'लॉगिन असफल — ईमेल या पासवर्ड गलत है। (Sign-in failed)' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="mx-auto grid min-h-dvh max-w-sm place-items-center p-4">
      <form onSubmit={submit} className="card w-full space-y-3 p-5">
        <h1 className="font-display text-2xl text-maroon">व्यवस्थापक लॉगिन</h1>
        <p className="text-xs text-muted">केवल अधिकृत व्यवस्थापकों के लिए। कोई सार्वजनिक पंजीकरण नहीं। (Authorized administrators only.)</p>
        <Field label="ईमेल (Email)">
          <TextInput type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </Field>
        <Field label="पासवर्ड (Password)">
          <TextInput type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </Field>
        {message && <Notice tone={message.tone}>{message.text}</Notice>}
        <Button type="submit" className="w-full" disabled={busy}>
          {busy ? 'प्रतीक्षा करें…' : 'लॉगिन'}
        </Button>
        <Button
          variant="ghost"
          className="w-full"
          onClick={async () => {
            if (!email) return setMessage({ tone: 'error', text: 'पहले ईमेल लिखें।' });
            await resetPassword(email.trim()).catch(() => {});
            setMessage({ tone: 'info', text: 'यदि यह खाता मौजूद है तो पासवर्ड रीसेट ईमेल भेजा गया है।' });
          }}
        >
          पासवर्ड भूल गए?
        </Button>
      </form>
    </main>
  );
}

export function AdminApp() {
  const auth = useAuth();
  const [section, setSection] = useState('members');

  if (auth.status === 'loading') return <p className="p-6 text-muted">लोड हो रहा है…</p>;
  if (auth.status === 'signedOut') return <LoginPage />;
  if (auth.status === 'notAdmin') {
    return (
      <main className="mx-auto max-w-md p-6">
        <div className="card space-y-3 p-5">
          <h1 className="font-display text-xl text-maroon">अनुमति नहीं</h1>
          <p className="text-sm">
            इस खाते ({auth.user?.email}) को व्यवस्थापक अधिकार नहीं दिए गए हैं। मुख्य व्यवस्थापक से संपर्क करें। UID:{' '}
            <code className="break-all">{auth.user?.uid}</code>
          </p>
          <Button variant="secondary" onClick={auth.signOut}>
            लॉग आउट
          </Button>
        </div>
      </main>
    );
  }

  const { Page } = SECTIONS.find((s) => s.id === section);
  return (
    <div className="min-h-dvh md:flex">
      <aside className="bg-maroon text-white md:min-h-dvh md:w-60 md:shrink-0">
        <div className="flex items-center justify-between gap-2 px-4 py-3">
          <div>
            <p className="font-display text-lg leading-tight">माहेश्वरी कैलेंडर</p>
            <p className="text-xs text-gold-soft">व्यवस्थापक पोर्टल</p>
          </div>
          <Button variant="ghost" className="!text-gold-soft md:hidden" onClick={auth.signOut}>
            लॉग आउट
          </Button>
        </div>
        <nav aria-label="पोर्टल मेनू" className="flex gap-1 overflow-x-auto px-2 pb-2 md:flex-col md:overflow-visible">
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setSection(s.id)}
              aria-current={section === s.id ? 'page' : undefined}
              className={`shrink-0 rounded-lg px-3 py-2 text-left text-sm whitespace-nowrap ${
                section === s.id ? 'bg-white/15 font-semibold' : 'hover:bg-white/10'
              }`}
            >
              {s.label} <span className="text-xs text-gold-soft/80">· {s.en}</span>
            </button>
          ))}
        </nav>
        <div className="hidden px-4 py-3 text-xs text-gold-soft/90 md:block">
          <span className="block break-all">{auth.user?.email}</span>
          <Button variant="ghost" className="!px-0 !text-gold-soft" onClick={auth.signOut}>
            लॉग आउट
          </Button>
        </div>
      </aside>
      <main className="min-w-0 flex-1 space-y-4 p-4 md:p-6">
        <Page uid={auth.user.uid} />
      </main>
    </div>
  );
}
