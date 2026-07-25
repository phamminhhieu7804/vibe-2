import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyB6Uy-j3rzb8QV-k0oqkBh_g3OH9OX1qtM",
  authDomain: "note-for-love.firebaseapp.com",
  projectId: "note-for-love",
  storageBucket: "note-for-love.firebasestorage.app",
  messagingSenderId: "198293982554",
  appId: "1:198293982554:web:66bd3038a9e5cccd3c7763",
  measurementId: "G-T4YWRR78GJ"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
