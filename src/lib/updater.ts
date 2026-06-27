import { relaunch } from '@tauri-apps/plugin-process';
import { check } from '@tauri-apps/plugin-updater';

import { isTauriRuntime } from './persistence';

let updateCheckStarted = false;

export async function checkForAppUpdate(): Promise<void> {
  if (updateCheckStarted || !isTauriRuntime()) return;

  updateCheckStarted = true;

  try {
    const update = await check();
    if (!update) return;

    await update.downloadAndInstall();
    await relaunch();
  } catch (error) {
    console.warn('Update check failed', error);
  }
}
