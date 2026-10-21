# Directory Publication & Consent Policy (to be confirmed by the organisation)

Audience: the office-bearers of the organisation that publishes the directory.

The Maheshwari Directory in the app is **for approved members only**: a person must sign in with an account the IT Head
approved, and then sees only the records of the **one district** assigned to them (enforced by Firestore Security Rules).
Approved members can still read, note or screenshot what they see, so the organisation remains responsible for what it
publishes and to whom it grants access. Access process: [MEMBER_ACCESS.md](MEMBER_ACCESS.md).
This document is a template. **The software does not obtain, record or prove consent. Nothing here is legal advice.**
The owner must confirm the policy before the first publication, ideally after advice that covers India's Digital
Personal Data Protection Act, 2023.

## Purpose of each published field

| Field | Purpose in the community directory |
| --- | --- |
| Name, father's / mother's name | Identify the member and family within the community |
| City / locality | Find members nearby |
| Contact number | Let community members get in touch |
| Blood group | Find donors quickly in medical emergencies |
| Date of birth / anniversary | Community greetings and age (computed automatically) |
| Public note | Short role/committee information approved by an admin |
| Photo | Recognise members; used on greeting posters |
| Profession, designation | Find professionals within the community; show committee roles |

Internal notes and inactive members are never published.

## Policy the organisation should adopt (edit as needed)

1. **Permission first.** A person's details are published only after that person (or a guardian, for minors) has agreed
   to their information being shown to approved members of their district in the app. Keep the collected forms or messages in the organisation's own records.
2. **Photos need consent too.** Only publish a photo the member has agreed to share; remove the link to unpublish it
   (the image itself stays on Cloudinary until deleted there).
3. **Minimum data.** Leave any field blank that a member does not want published (blank fields show "—" in the app).
   Consider not publishing full dates of birth or phone numbers of minors.
4. **Correction & removal.** Any member can ask an office-bearer to correct or remove their entry. The admin edits or
   deactivates the record in the portal and publishes. Phones pick up the change the next time they sync with
   internet; copies already on devices cannot be recalled instantly (a phone that stays offline keeps its last copy,
   at most 30 days before the app hides it).
5. **Access requests.** People asking for access give their name, mobile number, district and optional details. These
   are visible only to administrators. Delete requests that are not approved once they are no longer needed.
6. **Administrator duties.** Only provisioned admins may edit. Each publication requires the admin to confirm (checkbox)
   that permission was obtained. Imports and publications are logged with the admin's account.
7. **Security of source files.** Spreadsheets and CSV exports contain personal data. Store them securely and do not
   circulate them on open groups.
8. **Review.** Re-confirm the list and the members with access at least once a year; deactivate entries and revoke
   access of people who have left or asked to be removed.

Contact for corrections: [ORGANISATION NAME, PHONE / EMAIL] (shown to users in the app's directory screen).
