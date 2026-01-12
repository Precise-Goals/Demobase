// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyCWZ1NILah-44Ue7GRnfJROxrMZ7-zkUEc",
  authDomain: "demofirebase-25820.firebaseapp.com",
  projectId: "demofirebase-25820",
  storageBucket: "demofirebase-25820.firebasestorage.app",
  messagingSenderId: "463332476031",
  appId: "1:463332476031:web:ae7156d31640a57af02b4a",
  measurementId: "G-0P0Q07DKS1",
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Guard analytics for non-browser runtimes to avoid reference errors.
let analytics;
if (typeof window !== "undefined") {
  analytics = getAnalytics(app);
}

const auth = getAuth(app);
const db = getFirestore(app);

export { app, analytics, auth, db };
