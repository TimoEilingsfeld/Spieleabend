// Öffentliche Firebase-WEB-Konfiguration des bereits funktionierenden Spieleabend-Projekts.
// Kein Administrator- oder Service-Account-Schlüssel! Die Sicherheit liegt in database.rules.json.
export const firebaseConfig = {
  apiKey: "AIzaSyCI2aBPnTHnjDFztyozxr0KFAvpHJkvpJ4",
  authDomain: "spieleabend-20e34.firebaseapp.com",
  databaseURL: "https://spieleabend-20e34-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "spieleabend-20e34",
  storageBucket: "spieleabend-20e34.firebasestorage.app",
  messagingSenderId: "644857238902",
  appId: "1:644857238902:web:828bc5219a871dcbaf1657"
};
// Wird NUR manuell auf true gesetzt, nachdem das monatliche Kontingent in
// der Firebase-Konsole tatsächlich als aufgebraucht bestätigt wurde.
export const FIREBASE_LIMIT_CONFIRMED = false;
