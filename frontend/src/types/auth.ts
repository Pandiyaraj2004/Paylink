export interface AuthErrorInfo {
  code: string;
  message: string;
}

export type FirebaseAuthErrorCode =
  | 'auth/invalid-email'
  | 'auth/user-disabled'
  | 'auth/user-not-found'
  | 'auth/wrong-password'
  | 'auth/invalid-credential'
  | 'auth/email-already-in-use'
  | 'auth/weak-password'
  | 'auth/too-many-requests'
  | 'auth/popup-closed-by-user'
  | 'auth/network-request-failed';
