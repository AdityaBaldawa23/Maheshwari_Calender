import { useState } from 'react';
import { syncManager } from '../services/sync/syncManager.js';
import { DISTRICTS, districtLabel } from '../shared/districts.js';
import { ORGANIZATIONS } from '../shared/organizations.js';
import { maskPhone, normalizeIndianMobile } from '../shared/phoneIdentity.js';
import { num } from '../utils/format.js';

const inputClass = 'mt-0.5 min-h-12 w-full rounded-xl border border-line bg-paper px-3 text-base text-ink placeholder:text-muted';
const primaryButton = 'min-h-12 w-full rounded-full bg-maroon px-5 font-semibold text-white disabled:opacity-60';
const linkButton = 'min-h-11 text-sm font-semibold text-maroon underline';

/** Deliberately generic messages: they never reveal whether a number has an account. */
function signInMessage(err) {
  switch (err?.code) {
    case 'invalid-phone':
      return 'कृपया 10 अंकों का सही मोबाइल नंबर लिखें।';
    case 'invalid':
      return 'मोबाइल नंबर या पासवर्ड सही नहीं है, या खाता अभी सक्रिय नहीं है।';
    case 'throttled': {
      const minutes = Math.max(1, Math.ceil(((err.retryAt ?? 0) - Date.now()) / 60000));
      return `बहुत अधिक असफल प्रयास। कृपया ${num(minutes)} मिनट बाद फिर प्रयास करें।`;
    }
    case 'offline':
      return 'इंटरनेट उपलब्ध नहीं है। कनेक्शन जाँचकर पुनः प्रयास करें।';
    default:
      return 'सेवा अभी उपलब्ध नहीं है। कुछ देर बाद पुनः प्रयास करें।';
  }
}

function Field({ label, children, hint }) {
  return (
    <label className="block text-sm text-muted">
      {label}
      {children}
      {hint && <span className="mt-0.5 block text-xs">{hint}</span>}
    </label>
  );
}

function SignInForm({ onRequest }) {
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [showHelp, setShowHelp] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await syncManager.signIn(phone, password);
      setPassword('');
    } catch (err) {
      setError(signInMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="card space-y-3 p-4" aria-label="सदस्य साइन इन">
      <p className="text-sm leading-relaxed text-ink">
        माहेश्वरी परिवार निर्देशिका और जन्मदिन / वर्षगांठ केवल स्वीकृत सदस्यों के लिए है। अपने मोबाइल नंबर और पासवर्ड से साइन इन करें।
      </p>
      <Field label="मोबाइल नंबर">
        <input
          type="tel"
          inputMode="tel"
          autoComplete="tel-national"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="98XXXXXXXX"
          className={inputClass}
          required
        />
      </Field>
      <Field label="पासवर्ड">
        <input
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={inputClass}
          required
        />
      </Field>
      {error && (
        <p className="rounded-xl bg-saffron-soft px-3 py-2 text-sm text-maroon" role="alert">
          {error}
        </p>
      )}
      <button type="submit" disabled={busy} className={primaryButton}>
        {busy ? 'कृपया प्रतीक्षा करें…' : 'साइन इन करें'}
      </button>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button type="button" onClick={onRequest} className={linkButton}>
          नए सदस्य? पहुँच का अनुरोध करें
        </button>
        <button type="button" onClick={() => setShowHelp((v) => !v)} className={linkButton} aria-expanded={showHelp}>
          पासवर्ड भूल गए?
        </button>
      </div>
      {showHelp && (
        <p className="text-sm leading-relaxed text-muted">
          कृपया संगठन के IT प्रमुख से संपर्क करें। आपकी पहचान की पुष्टि के बाद ही पासवर्ड रीसेट किया जाता है।
        </p>
      )}
    </form>
  );
}

function RequestForm({ onDone, onCancel }) {
  const [form, setForm] = useState({ name: '', phone: '', fatherName: '', city: '', district: '', org: '', note: '' });
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    const phone = normalizeIndianMobile(form.phone);
    const name = form.name.trim().replace(/\s+/g, ' ');
    if (!phone) return setError('कृपया 10 अंकों का सही मोबाइल नंबर लिखें।');
    if (name.length < 2) return setError('कृपया अपना पूरा नाम लिखें।');
    if (!form.district) return setError('कृपया अपना जिला चुनें।');
    if (!agreed) return setError('कृपया पुष्टि बॉक्स चुनें।');
    setBusy(true);
    setError(null);
    try {
      await syncManager.submitAccessRequest({
        phone,
        name: name.slice(0, 100),
        district: form.district,
        fatherName: form.fatherName.trim().slice(0, 100),
        city: form.city.trim().slice(0, 100),
        org: form.org,
        note: form.note.trim().slice(0, 300),
      });
      onDone();
    } catch (err) {
      if (err?.code === 'too-soon') setError('कृपया एक मिनट बाद फिर प्रयास करें।');
      else if (err?.offline) setError('इंटरनेट उपलब्ध नहीं है। कनेक्शन जाँचकर पुनः प्रयास करें।');
      else if (err?.denied) {
        setError('अनुरोध स्वीकार नहीं हुआ। हो सकता है इस नंबर से पहले ही अनुरोध भेजा जा चुका हो — कृपया स्वीकृति की प्रतीक्षा करें या संगठन से संपर्क करें।');
      } else setError('अनुरोध भेजा नहीं जा सका। कुछ देर बाद पुनः प्रयास करें।');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="card space-y-3 p-4" aria-label="पहुँच का अनुरोध">
      <h3 className="font-display text-xl text-maroon">पहुँच का अनुरोध</h3>
      <p className="text-sm leading-relaxed text-muted">
        आपका अनुरोध संगठन के IT प्रमुख को भेजा जाएगा। वे आपकी जानकारी की जाँच करके स्वीकृति देंगे। ईमेल की आवश्यकता नहीं है।
      </p>
      <Field label="पूरा नाम *">
        <input value={form.name} onChange={set('name')} maxLength={100} autoComplete="name" className={inputClass} required />
      </Field>
      <Field label="मोबाइल नंबर *" hint="इसी नंबर से आप बाद में साइन इन करेंगे।">
        <input type="tel" inputMode="tel" value={form.phone} onChange={set('phone')} placeholder="98XXXXXXXX" className={inputClass} required />
      </Field>
      <Field label="पिता का नाम">
        <input value={form.fatherName} onChange={set('fatherName')} maxLength={100} className={inputClass} />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="जिला *">
          <select value={form.district} onChange={set('district')} className={inputClass} required>
            <option value="">चुनें</option>
            {DISTRICTS.map((d) => (
              <option key={d.id} value={d.id}>
                {d.hi}
              </option>
            ))}
          </select>
        </Field>
        <Field label="शहर / गाँव">
          <input value={form.city} onChange={set('city')} maxLength={100} className={inputClass} />
        </Field>
      </div>
      <Field label="संगठन">
        <select value={form.org} onChange={set('org')} className={inputClass}>
          <option value="">—</option>
          {ORGANIZATIONS.map((o) => (
            <option key={o.id} value={o.id}>
              {o.hi}
            </option>
          ))}
        </select>
      </Field>
      <Field label="सदस्यता जानकारी" hint="जैसे सदस्य क्रमांक, पद या परिचित पदाधिकारी का नाम (वैकल्पिक)">
        <input value={form.note} onChange={set('note')} maxLength={300} className={inputClass} />
      </Field>
      <label className="flex items-start gap-2 text-sm leading-relaxed text-ink">
        <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-1 size-5 shrink-0" />
        <span>मैं पुष्टि करता/करती हूँ कि यह जानकारी सही है। पहचान की पुष्टि के लिए संगठन मुझसे इस नंबर पर संपर्क कर सकता है।</span>
      </label>
      {error && (
        <p className="rounded-xl bg-saffron-soft px-3 py-2 text-sm text-maroon" role="alert">
          {error}
        </p>
      )}
      <button type="submit" disabled={busy} className={primaryButton}>
        {busy ? 'भेजा जा रहा है…' : 'अनुरोध भेजें'}
      </button>
      <button type="button" onClick={onCancel} className={`${linkButton} w-full`}>
        वापस साइन इन पर
      </button>
    </form>
  );
}

function RequestSent({ request, onSignIn, onAgain }) {
  return (
    <div className="card space-y-3 p-4" role="status">
      <h3 className="font-display text-xl text-maroon">अनुरोध भेजा गया</h3>
      <p className="text-sm leading-relaxed text-ink">
        मोबाइल {maskPhone(request.phone)} ({districtLabel(request.district)}) के लिए आपका अनुरोध IT प्रमुख के पास स्वीकृति हेतु लंबित है।
        आवश्यकता होने पर आपसे संपर्क किया जाएगा। स्वीकृति के बाद अपने मोबाइल नंबर और पासवर्ड से साइन इन करें।
      </p>
      <button type="button" onClick={onSignIn} className={primaryButton}>
        साइन इन करें
      </button>
      <button type="button" onClick={onAgain} className={`${linkButton} w-full`}>
        दूसरे नंबर के लिए अनुरोध
      </button>
    </div>
  );
}

/** Signed-out view of the directory tab: sign in, or ask for access. */
export function MemberGate() {
  const request = syncManager.get('request');
  const [view, setView] = useState(request?.phone ? 'sent' : 'signIn');
  if (view === 'request') return <RequestForm onDone={() => setView('sent')} onCancel={() => setView('signIn')} />;
  if (view === 'sent' && syncManager.get('request')?.phone) {
    return <RequestSent request={syncManager.get('request')} onSignIn={() => setView('signIn')} onAgain={() => setView('request')} />;
  }
  return <SignInForm onRequest={() => setView('request')} />;
}

/** Signed in, but the directory may not be shown (pending / revoked / not verifiable). */
export function AccessNotice({ access, directoryStatus, onRetry }) {
  const signOut = () => syncManager.signOut();
  let text;
  let retry = false;
  if (access.status === 'revoked') {
    text = 'आपकी निर्देशिका पहुँच रद्द कर दी गई है। अधिक जानकारी के लिए संगठन के IT प्रमुख से संपर्क करें।';
  } else if (access.status === 'notApproved') {
    text = 'आपका खाता अभी निर्देशिका के लिए स्वीकृत नहीं है। स्वीकृति के लिए IT प्रमुख से संपर्क करें।';
  } else if (directoryStatus === 'offline' || directoryStatus === 'error' || directoryStatus === 'stale') {
    text = 'आपकी पहुँच की पुष्टि के लिए इंटरनेट आवश्यक है। कनेक्शन जाँचकर पुनः प्रयास करें।';
    retry = true;
  } else {
    return (
      <p className="card p-4 text-sm text-muted" role="status">
        आपकी पहुँच की पुष्टि हो रही है…
      </p>
    );
  }
  return (
    <div className="card space-y-3 p-4 text-sm leading-relaxed" role="alert">
      <p className="text-ink">{text}</p>
      {retry && (
        <button type="button" onClick={onRetry} className={primaryButton}>
          पुनः प्रयास करें
        </button>
      )}
      <button type="button" onClick={signOut} className={`${linkButton} w-full`}>
        साइन आउट
      </button>
    </div>
  );
}
