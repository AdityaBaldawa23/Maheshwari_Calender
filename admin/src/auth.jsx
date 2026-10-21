import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged, sendPasswordResetEmail, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from './firebase.js';
import { AUTH_DOMAIN } from '../../src/shared/phoneIdentity.js';

const AuthContext = createContext(null);

/**
 * Sign-in state for the portal: 'loading' | 'signedOut' | 'notAdmin' | 'admin'.
 * The admins/{uid} check here only decides what to SHOW; every read/write is
 * independently enforced by firestore.rules.
 */
export function AuthProvider({ children }) {
  const [state, setState] = useState({ status: 'loading', user: null, admin: null });

  useEffect(
    () =>
      onAuthStateChanged(auth, async (user) => {
        if (!user) return setState({ status: 'signedOut', user: null, admin: null });
        try {
          const snap = await getDoc(doc(db, 'admins', user.uid));
          const admin = snap.exists() ? snap.data() : null;
          setState({ status: admin?.active === true ? 'admin' : 'notAdmin', user, admin });
        } catch {
          setState({ status: 'notAdmin', user, admin: null });
        }
      }),
    [],
  );

  const value = useMemo(
    () => ({
      ...state,
      signIn: (email, password) => signInWithEmailAndPassword(auth, email, password),
      // Administrators have real email addresses. Member accounts use synthetic
      // addresses that can never receive mail, so no reset email is sent for them
      // (member passwords are reset by the IT Head — docs/MEMBER_ACCESS.md).
      resetPassword: async (email) => {
        if (email.toLowerCase().endsWith(`@${AUTH_DOMAIN}`)) return;
        await sendPasswordResetEmail(auth, email);
      },
      signOut: () => signOut(auth),
    }),
    [state],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
