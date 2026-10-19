import { useState } from 'react';
import { useAuth } from './auth.jsx';
import { Button, Field, Notice, TextInput } from './components/ui.jsx';
import { MembersPage } from './pages/MembersPage.jsx';
import { ImportPage } from './pages/ImportPage.jsx';
import { WishesPage } from './pages/WishesPage.jsx';
import { EmergencyAdminPage } from './pages/EmergencyAdminPage.jsx';
import { OccasionsAdminPage } from './pages/OccasionsAdminPage.jsx';
import { ContentAdminPage } from './pages/ContentAdminPage.jsx';
import { HistoryPage } from './pages/HistoryPage.jsx';
import { AdminsPage } from './pages/AdminsPage.jsx';

const SECTIONS = [
  { id: 'members', label: 'Member directory', Page: MembersPage },
  { id: 'import', label: 'Excel / CSV import', Page: ImportPage },
  { id: 'wishes', label: 'Birthday & anniversary wishes', Page: WishesPage },
  { id: 'emergency', label: 'Emergency contacts', Page: EmergencyAdminPage },
  { id: 'occasions', label: 'Calendar occasions', Page: OccasionsAdminPage },
  { id: 'content', label: 'Ads & notices', Page: ContentAdminPage },
  { id: 'history', label: 'History', Page: HistoryPage },
  { id: 'admins', label: 'Administrators', Page: AdminsPage },
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
      setMessage({ tone: 'error', text: 'Sign-in failed — check the email and password.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="mx-auto grid min-h-dvh max-w-sm place-items-center p-4">
      <form onSubmit={submit} className="card w-full space-y-3 p-5">
        <h1 className="font-display text-2xl text-maroon">Administrator sign-in</h1>
        <p className="text-xs text-muted">For authorised administrators only. There is no public registration.</p>
        <Field label="Email">
          <TextInput type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </Field>
        <Field label="Password">
          <TextInput type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </Field>
        {message && <Notice tone={message.tone}>{message.text}</Notice>}
        <Button type="submit" className="w-full" disabled={busy}>
          {busy ? 'Please wait…' : 'Sign in'}
        </Button>
        <Button
          variant="ghost"
          className="w-full"
          onClick={async () => {
            if (!email) return setMessage({ tone: 'error', text: 'Enter your email first.' });
            await resetPassword(email.trim()).catch(() => {});
            setMessage({ tone: 'info', text: 'If this account exists, a password-reset email has been sent.' });
          }}
        >
          Forgot password?
        </Button>
      </form>
    </main>
  );
}

export function AdminApp() {
  const auth = useAuth();
  const [section, setSection] = useState('members');

  if (auth.status === 'loading') return <p className="p-6 text-muted">Loading…</p>;
  if (auth.status === 'signedOut') return <LoginPage />;
  if (auth.status === 'notAdmin') {
    return (
      <main className="mx-auto max-w-md p-6">
        <div className="card space-y-3 p-5">
          <h1 className="font-display text-xl text-maroon">Access not granted</h1>
          <p className="text-sm">
            This account ({auth.user?.email}) has no administrator rights. Ask the main administrator to add your UID:{' '}
            <code className="break-all">{auth.user?.uid}</code>
          </p>
          <Button variant="secondary" onClick={auth.signOut}>
            Sign out
          </Button>
        </div>
      </main>
    );
  }

  const { Page } = SECTIONS.find((s) => s.id === section);
  return (
    <div className="min-h-dvh md:flex">
      <aside className="bg-maroon text-white md:min-h-dvh md:w-64 md:shrink-0">
        <div className="flex items-center justify-between gap-2 px-4 py-3">
          <div>
            <p className="font-display text-lg leading-tight">Maheshwari Calendar</p>
            <p className="text-xs text-gold-soft">Admin portal</p>
          </div>
          <Button variant="ghost" className="!text-gold-soft md:hidden" onClick={auth.signOut}>
            Sign out
          </Button>
        </div>
        <nav aria-label="Portal sections" className="flex gap-1 overflow-x-auto px-2 pb-2 md:flex-col md:overflow-visible">
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
              {s.label}
            </button>
          ))}
        </nav>
        <div className="hidden px-4 py-3 text-xs text-gold-soft/90 md:block">
          <span className="block break-all">{auth.user?.email}</span>
          <Button variant="ghost" className="!px-0 !text-gold-soft" onClick={auth.signOut}>
            Sign out
          </Button>
        </div>
      </aside>
      <main className="min-w-0 flex-1 space-y-4 p-4 md:p-6">
        <Page uid={auth.user.uid} />
      </main>
    </div>
  );
}
