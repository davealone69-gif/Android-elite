import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  projectId: "turing-torch-w5jvd",
  appId: "1:994005100787:web:d6a2e567d44b9023582f86",
  apiKey: "AIzaSyB1lMYLMzS1UBt6wGo9Z-GI0RILhWv4PV8",
  authDomain: "turing-torch-w5jvd.firebaseapp.com",
  storageBucket: "turing-torch-w5jvd.firebasestorage.app",
  messagingSenderId: "994005100787",
  measurementId: ""
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
export const db = getFirestore(app, "ai-studio-githubreadmedesc-940f4804-d4e8-4389-8a35-fdb7ff398390");
