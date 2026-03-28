import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signOut,
} from "firebase/auth";
import { auth, type FirebaseUser } from "./firebase-init";

export type { FirebaseUser };

export async function signInWithEmail(email: string, password: string): Promise<FirebaseUser | null> {
  try {
    console.log("Attempting sign in with:", email);
    const result = await signInWithEmailAndPassword(auth, email, password);
    console.log("Sign in successful, user:", result.user?.uid);
    return result.user;
  } catch (error) {
    console.error("Firebase sign-in error:", error);
    throw error;
  }
}

export async function signUpWithEmail(email: string, password: string): Promise<FirebaseUser | null> {
  try {
    console.log("Attempting sign up with:", email);
    const result = await createUserWithEmailAndPassword(auth, email, password);
    return result.user;
  } catch (error) {
    console.error("Firebase sign-up error:", error);
    throw error;
  }
}

export async function signOutFirebase(): Promise<void> {
  try {
    await signOut(auth);
  } catch (error) {
    console.error("Firebase sign-out error:", error);
  }
}

export function onAuthChange(callback: (user: FirebaseUser | null) => void): () => void {
  return onAuthStateChanged(auth, callback);
}
