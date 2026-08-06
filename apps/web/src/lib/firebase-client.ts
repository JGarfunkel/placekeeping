"use client";

import { type FirebaseApp, getApps, initializeApp } from "firebase/app";
import {
  FacebookAuthProvider,
  GoogleAuthProvider,
  OAuthProvider,
  getAuth,
} from "firebase/auth";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

let cachedApp: FirebaseApp | undefined;

// Lazily initialized so importing this module never throws during SSR/build
// (the "use client" pages that use it are still rendered once on the server;
// Firebase Auth is a browser-only concern and should only be constructed in
// response to user interaction, e.g. inside a click handler).
function getFirebaseApp(): FirebaseApp {
  if (!cachedApp) {
    cachedApp = getApps().length ? getApps()[0]! : initializeApp(firebaseConfig);
  }
  return cachedApp;
}

export function getFirebaseAuth() {
  return getAuth(getFirebaseApp());
}

export function getGoogleProvider() {
  return new GoogleAuthProvider();
}

export function getFacebookProvider() {
  return new FacebookAuthProvider();
}

export function getAppleProvider() {
  return new OAuthProvider("apple.com");
}
