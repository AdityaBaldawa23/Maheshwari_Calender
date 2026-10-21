## Minor UI Changes — User-Provided Requirements

### Change 1
- The calender should have english and hindi toggle 
- Also instead of letter A or hindi A write complete hindi or english

### Change 2
- On opening the app the current loader i have to chnage in a way that there are 2 logos one on the uper half which is slighlty big and one below it slighlty small 
and also developed by iKRA Studio line on that loader

### Change 3
- Also whenever admin pushes a notification from the admin portal it should go as a pop up like it goes for festivals 

---

## Implementation notes (kept separate from the requirements above)

| Change | Where | Status |
| --- | --- | --- |
| 1 | `src/components/MonthNavigator.jsx` → `DateLangToggle` | Done. The button next to the month name now says **English** (while dates are in Hindi) or **हिंदी** (while dates are in English) instead of "A" / "अ". |
| 2 | `index.html` (`#boot-loader`), `src/main.jsx`, `public/branding/` | Done, with **placeholder logos**. Upper logo 136 px (`public/branding/logo-primary.svg`, currently the app mark), lower logo 84 px (`public/branding/logo-secondary.svg`, currently a placeholder star), "Developed by iKRA Studio" at the bottom. Shown for about 1.2 s, then fades. **To finish:** replace the two files with your logos (same names; SVG, or change the `src` to a PNG/WebP). On Android 12+ the system shows its own one-icon launch screen for a moment before this loader — Android does not allow two logos or text there. |
| 3 | Portal: *Ads & notices* → notice → **Pop-up notification**. App: `src/components/NoticePopup.jsx`, `src/services/noticePopups.js`, `notificationService.showNotice()` | Done. When the admin publishes a notice with the box ticked, each phone shows it once as a notification (heads-up, like festival reminders, if notifications are allowed) and once as an in-app pop-up. **Limitation:** phones receive it the next time the app is opened or resumed with internet. A real instant push (Firebase Cloud Messaging) needs a trusted server or Cloud Functions to send it, which the Spark plan cannot provide. |

Code areas carry a comment pointing to this file.
