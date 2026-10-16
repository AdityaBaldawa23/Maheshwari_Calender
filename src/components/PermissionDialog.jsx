import { useReminders } from '../hooks/useReminders.jsx';
import { Sheet } from './Sheet.jsx';
import { BellIcon } from './Icons.jsx';

const CONTENT = {
  explain: {
    title: 'त्योहारों का स्मरण पाएँ',
    body: [
      'महेश नवमी, गणगौर, तीज, दीपावली जैसे अवसरों पर हम आपको सुबह एक छोटी-सी सूचना भेजेंगे।',
      'स्मरण पूरी तरह आपके फ़ोन पर बनते हैं — इंटरनेट की आवश्यकता नहीं, कोई व्यक्तिगत जानकारी कहीं नहीं भेजी जाती।',
      'अगली स्क्रीन पर “अनुमति दें” (Allow) चुनें।',
    ],
  },
  denied: {
    title: 'सूचना की अनुमति बंद है',
    body: [
      'स्मरण पाने के लिए फ़ोन में इस ऐप की सूचनाएँ (Notifications) चालू करनी होंगी:',
      'फ़ोन की सेटिंग्स → ऐप्स → माहेश्वरी कैलेंडर → सूचनाएँ → चालू करें।',
      'अनुमति देने के बाद ऐप में वापस आएँ — स्मरण अपने-आप चालू हो जाएँगे।',
    ],
  },
  unsupported: {
    title: 'स्मरण मोबाइल ऐप में',
    body: ['स्मरण (नोटिफ़िकेशन) Android ऐप में काम करते हैं। आपकी पसंद सहेज ली गई है।'],
  },
};

/** Our own explanation shown before (and after) the Android system permission prompt. */
export function PermissionDialog() {
  const { dialog, confirmPermission, closeDialog } = useReminders();
  if (!dialog) return null;
  const content = CONTENT[dialog];

  return (
    <Sheet labelledBy="permission-title" onClose={closeDialog}>
      <div className="px-5 pt-2 pb-6">
        <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-full bg-saffron-soft text-saffron">
          <BellIcon width={28} height={28} />
        </div>
        <h2 id="permission-title" className="text-center font-display text-2xl text-maroon">
          {content.title}
        </h2>
        <div className="mt-3 space-y-2 text-ink/90">
          {content.body.map((p) => (
            <p key={p} className="leading-relaxed">
              {p}
            </p>
          ))}
        </div>
        <div className="mt-5 flex flex-col gap-2">
          {dialog === 'explain' ? (
            <>
              <button
                type="button"
                onClick={confirmPermission}
                className="min-h-12 rounded-full bg-maroon px-5 text-lg font-semibold text-white active:bg-maroon-dark"
              >
                आगे बढ़ें
              </button>
              <button type="button" onClick={closeDialog} className="min-h-12 rounded-full px-5 font-semibold text-muted">
                अभी नहीं
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={closeDialog}
              className="min-h-12 rounded-full bg-maroon px-5 text-lg font-semibold text-white active:bg-maroon-dark"
            >
              ठीक है
            </button>
          )}
        </div>
      </div>
    </Sheet>
  );
}
