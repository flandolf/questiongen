import {
  deleteObject,
  getDownloadURL,
  ref,
  uploadBytes,
  uploadString,
} from 'firebase/storage';

import { auth, storage } from '@/context/modules/firebase-init';

/**
 * Uploads a file to Firebase Storage.
 * @param file The file to upload.
 * @param path The path in storage where the file should be stored.
 * @returns An object containing the storage path and the download URL.
 */
export async function uploadImage(
  file: File | Blob,
  filename: string,
): Promise<{ storagePath: string; downloadUrl: string }> {
  /**
   * Upload a `File` or `Blob` to Firebase Storage for the authenticated user.
   * @param file - File or Blob to upload
   * @param filename - Suggested filename used in the storage path
   * @returns Object with `storagePath` and `downloadUrl`
   */
  const user = auth.currentUser;
  if (!user) {
    throw new Error('User must be authenticated to upload images.');
  }

  const storagePath = `users/${user.uid}/images/${Date.now()}-${filename}`;
  const storageRef = ref(storage, storagePath);

  await uploadBytes(storageRef, file);
  const downloadUrl = await getDownloadURL(storageRef);

  return { storagePath, downloadUrl };
}

/**
 * Uploads a data URL image to Firebase Storage.
 * @param dataUrl The data URL to upload.
 * @param questionId The ID of the question.
 * @param imageId The ID of the image.
 * @returns An object containing the storage path and the download URL.
 */
export async function uploadImageDataUrl(
  dataUrl: string,
  questionId: string,
  imageId: string,
): Promise<{ storagePath: string; downloadUrl: string }> {
  /**
   * Upload an image represented as a data URL to Firebase Storage.
   */
  const user = auth.currentUser;
  if (!user) {
    throw new Error('User must be authenticated to upload images.');
  }

  const storagePath = `users/${user.uid}/questions/${questionId}/${imageId}`;
  const storageRef = ref(storage, storagePath);

  await uploadString(storageRef, dataUrl, 'data_url');
  const downloadUrl = await getDownloadURL(storageRef);

  return { storagePath, downloadUrl };
}

/**
 * Converts a data URL to a Blob.
 * @param dataUrl The data URL to convert.
 * @returns A Blob representation of the data URL.
 */
export async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  /**
   * Convert a data URL string to a `Blob` via `fetch`.
   */
  const res = await fetch(dataUrl);
  return await res.blob();
}

/**
 * Deletes an image from Firebase Storage.
 * @param storagePath The path of the image in storage.
 */
export async function deleteImage(storagePath: string): Promise<void> {
  /**
   * Delete an object at `storagePath` from Firebase Storage.
   */
  const storageRef = ref(storage, storagePath);
  await deleteObject(storageRef);
}
