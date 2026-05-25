import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { initializeAuth, getAuth } from "firebase/auth";
// @ts-ignore
import { getReactNativePersistence } from "firebase/auth";
import AsyncStorage from "@react-native-async-storage/async-storage";

const firebaseConfig = {
  apiKey: "AIzaSyCghvMEyvK-0xm2XPwMGweBblOZCSzpW9k",
  authDomain: "araya-coach-app.firebaseapp.com",
  projectId: "araya-coach-app",
  storageBucket: "araya-coach-app.firebasestorage.app",
  messagingSenderId: "267719532806",
  appId: "1:267719532806:web:dfd30ebb8ce389906efe87",
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

export const db = getFirestore(app);

let authInstance;

try {
  authInstance = initializeAuth(app, {
    persistence: getReactNativePersistence(AsyncStorage),
  });
} catch {
  authInstance = getAuth(app);
}

export const auth = authInstance;