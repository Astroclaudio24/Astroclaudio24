// Punto di ingresso per creare vendor/firebase.js (vedi tools/build-firebase.sh).
export { initializeApp } from 'firebase/app';
export {
  getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect,
  getRedirectResult, onAuthStateChanged, signOut, connectAuthEmulator
} from 'firebase/auth';
export {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
  collection, doc, onSnapshot, writeBatch, connectFirestoreEmulator
} from 'firebase/firestore';
