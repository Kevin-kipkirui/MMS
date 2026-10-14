import { initializeApp } from "firebase/app";
import { getAuth, signInAnonymously } from "firebase/auth";
import {
  getStorage, ref, uploadString, getDownloadURL, deleteObject, setMaxUploadRetryTime,
} from "firebase/storage";

const app = initializeApp({
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
});

const auth = getAuth(app);
const storage = getStorage(app);
setMaxUploadRetryTime(storage, 20000); // fail fast offline so the retry queue can take over

let uid = null; // your Supabase user id, used only to organise folders
export function setShotUser(id) {
  uid = id;
}

let authPromise = null;
function ensureAuth() {
  if (auth.currentUser) return Promise.resolve();
  if (!authPromise) {
    authPromise = signInAnonymously(auth)
      .then(() => {})
      .catch((e) => { authPromise = null; throw e; });
  }
  return authPromise;
}

const pathFor = (id) => `trade-shots/${uid}/${id}.jpg`;

export async function uploadShot(id, dataUrl) {
  if (!uid) throw new Error("no user");
  await ensureAuth();
  await uploadString(ref(storage, pathFor(id)), dataUrl, "data_url");
}

export async function fetchShotUrl(id) {
  if (!uid) throw new Error("no user");
  await ensureAuth();
  return getDownloadURL(ref(storage, pathFor(id)));
}

export async function removeShot(id) {
  if (!uid) return;
  await ensureAuth();
  await deleteObject(ref(storage, pathFor(id)));
}