import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyBWOqj1xGfDt-b27EDRSPXQ_D0GrOSxw88",
  authDomain: "quiz-app-c8bfc.firebaseapp.com",
  projectId: "quiz-app-c8bfc",
  storageBucket: "quiz-app-c8bfc.firebasestorage.app",
  messagingSenderId: "1073922729062",
  appId: "1:1073922729062:web:a33640a58db80be36c79a7"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
