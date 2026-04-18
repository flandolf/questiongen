import { open } from '@tauri-apps/plugin-dialog';
import {
  Clock,
  FolderOpen,
  HardDriveDownload,
  HardDriveUpload,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  createExportEnvelope,
  exportAppState,
  exportEnvelopeToDirectory,
  type JsonBackupFileInfo,
  listJsonBackupsInDirectory,
  parseImportText,
  readBackupJsonFile,
} from '@/lib/import-export';
import { useAppStore } from '@/store';
import type { PersistedAppState } from '@/types';
import { Card, FieldGroup } from '@/views/settings/SettingsUI';

const BACKUP_INTERVAL_OPTIONS: { value: string; label: string }[] = [
  { value: '0', label: 'Off' },
  { value: '15', label: 'Every 15 minutes' },
  { value: '30', label: 'Every 30 minutes' },
  { value: '60', label: 'Every hour' },
  { value: '360', label: 'Every 6 hours' },
  { value: '1440', label: 'Once a day' },
];

function formatBackupDate(ms: number): string {
  if (!ms) return '';
  try {
    return new Date(ms).toLocaleString();
  } catch {
    return '';
  }
}

type Props = {
  onError: (message: string) => void;
  onSuccess: (message: string) => void;
  onPreparedImport: (imported: PersistedAppState) => void;
};

export function LocalBackupFolderCard({
  onError,
  onSuccess,
  onPreparedImport,
}: Props) {
  const localBackupFolderPath = useAppStore((s) => s.localBackupFolderPath);
  const localBackupIntervalMinutes = useAppStore(
    (s) => s.localBackupIntervalMinutes,
  );
  const setLocalBackupFolderPath = useAppStore(
    (s) => s.setLocalBackupFolderPath,
  );
  const setLocalBackupIntervalMinutes = useAppStore(
    (s) => s.setLocalBackupIntervalMinutes,
  );

  const [exportingToFolder, setExportingToFolder] = useState(false);
  const [importingFromFolder, setImportingFromFolder] = useState(false);
  const [pickingFolder, setPickingFolder] = useState(false);
  const [backupFiles, setBackupFiles] = useState<JsonBackupFileInfo[]>([]);
  const [loadingBackups, setLoadingBackups] = useState(false);
  const [selectedBackupPath, setSelectedBackupPath] = useState<string>('');

  const refreshBackupList = useCallback(async () => {
    if (!localBackupFolderPath.trim()) {
      setBackupFiles([]);
      setSelectedBackupPath('');
      return;
    }
    setLoadingBackups(true);
    try {
      const list = await listJsonBackupsInDirectory(
        localBackupFolderPath.trim(),
      );
      setBackupFiles(list);
      setSelectedBackupPath((prev) => {
        if (prev && list.some((f) => f.path === prev)) return prev;
        return list[0]?.path ?? '';
      });
    } catch {
      setBackupFiles([]);
      setSelectedBackupPath('');
    } finally {
      setLoadingBackups(false);
    }
  }, [localBackupFolderPath]);

  useEffect(() => {
    void refreshBackupList();
  }, [refreshBackupList]);

  const handleExportToBackupFolder = useCallback(async () => {
    const dir = localBackupFolderPath.trim();
    if (!dir) {
      onError('Choose a backup folder first.');
      return;
    }
    setExportingToFolder(true);
    try {
      const state = useAppStore.getState();
      const envelope = createExportEnvelope(exportAppState(state));
      const today = new Date().toISOString().slice(0, 10);
      const savedPath = await exportEnvelopeToDirectory(
        dir,
        envelope,
        `questiongen-export-${today}.json`,
      );
      onSuccess(`Backup saved: ${savedPath}`);
      void refreshBackupList();
    } catch (err) {
      onError(
        `Backup export failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
      );
    } finally {
      setExportingToFolder(false);
    }
  }, [localBackupFolderPath, onError, onSuccess, refreshBackupList]);

  const handleChooseBackupFolder = useCallback(async () => {
    setPickingFolder(true);
    try {
      const choice = await open({
        directory: true,
        multiple: false,
        title: 'Choose backup folder',
      });
      let path: string | null = null;
      if (typeof choice === 'string') {
        path = choice;
      } else if (Array.isArray(choice)) {
        const first = choice[0];
        path = typeof first === 'string' ? first : null;
      }
      if (path) {
        setLocalBackupFolderPath(path);
        onSuccess('Backup folder set.');
      }
    } catch (err) {
      onError(
        `Could not open folder picker: ${err instanceof Error ? err.message : 'Unknown error'}`,
      );
    } finally {
      setPickingFolder(false);
    }
  }, [onError, onSuccess, setLocalBackupFolderPath]);

  const handleImportFromBackupFolder = useCallback(async () => {
    if (!selectedBackupPath) {
      onError('Select a backup file from the list.');
      return;
    }
    setImportingFromFolder(true);
    try {
      const text = await readBackupJsonFile(selectedBackupPath);
      const imported = parseImportText(text);
      onPreparedImport(imported);
    } catch (err) {
      onError(
        `Import failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
      );
    } finally {
      setImportingFromFolder(false);
    }
  }, [onError, onPreparedImport, selectedBackupPath]);

  return (
    <Card className='p-4 space-y-4'>
      <div className='flex items-center gap-2'>
        <FolderOpen className='h-4 w-4 text-muted-foreground' />
        <p className='text-sm font-medium'>Local backup folder</p>
      </div>
      <p className='text-xs text-muted-foreground'>
        Exports run on a timer while the app is open. Files use the same format
        as manual exports. Your API key is never included.
      </p>

      <div className='flex flex-wrap items-center gap-2'>
        <Button
          type='button'
          variant='outline'
          size='sm'
          className='gap-2'
          disabled={pickingFolder}
          onClick={() => void handleChooseBackupFolder()}
        >
          {pickingFolder ? (
            <Loader2 className='h-4 w-4 animate-spin' />
          ) : (
            <FolderOpen className='h-4 w-4' />
          )}
          Choose folder
        </Button>
        <Button
          type='button'
          variant='ghost'
          size='sm'
          disabled={!localBackupFolderPath}
          onClick={() => {
            setLocalBackupFolderPath('');
            setBackupFiles([]);
            setSelectedBackupPath('');
          }}
        >
          Clear
        </Button>
      </div>
      {localBackupFolderPath ? (
        <p
          className='text-xs font-mono text-muted-foreground break-all'
          title={localBackupFolderPath}
        >
          {localBackupFolderPath}
        </p>
      ) : (
        <p className='text-xs text-muted-foreground'>No folder selected.</p>
      )}

      <FieldGroup label='Automatic export' htmlFor='backup-interval'>
        <Select
          value={String(localBackupIntervalMinutes)}
          onValueChange={(v) =>
            setLocalBackupIntervalMinutes(Number.parseInt(v, 10) || 0)
          }
        >
          <SelectTrigger id='backup-interval' className='w-full max-w-xs'>
            <div className='flex items-center gap-2'>
              <Clock className='h-3.5 w-3.5 text-muted-foreground' />
              <SelectValue />
            </div>
          </SelectTrigger>
          <SelectContent>
            {BACKUP_INTERVAL_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className='text-xs text-muted-foreground'>
          Requires the app to be running. Set a folder above to enable timed
          exports.
        </p>
      </FieldGroup>

      <Button
        type='button'
        variant='secondary'
        className='gap-2'
        disabled={!localBackupFolderPath.trim() || exportingToFolder}
        onClick={() => void handleExportToBackupFolder()}
      >
        {exportingToFolder ? (
          <Loader2 className='h-4 w-4 animate-spin' />
        ) : (
          <HardDriveDownload className='h-4 w-4' />
        )}
        {exportingToFolder ? 'Saving…' : 'Export to backup folder now'}
      </Button>

      <div className='border-t border-border pt-4 space-y-2'>
        <Label className='text-sm font-medium'>Import from this folder</Label>
        <p className='text-xs text-muted-foreground'>
          JSON files in the folder (newest first). Merge behavior matches file
          import above.
        </p>
        <div className='flex flex-wrap items-center gap-2'>
          <Select
            value={selectedBackupPath}
            onValueChange={setSelectedBackupPath}
            disabled={
              !localBackupFolderPath.trim() ||
              backupFiles.length === 0 ||
              loadingBackups
            }
          >
            <SelectTrigger className='w-full min-w-50 max-w-md'>
              <SelectValue
                placeholder={
                  loadingBackups ? 'Loading…' : 'Select a backup file'
                }
              />
            </SelectTrigger>
            <SelectContent>
              {backupFiles.map((f) => (
                <SelectItem key={f.path} value={f.path}>
                  {f.name}
                  {f.modifiedAtMs
                    ? ` — ${formatBackupDate(f.modifiedAtMs)}`
                    : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            type='button'
            variant='outline'
            size='icon'
            title='Refresh file list'
            disabled={!localBackupFolderPath.trim() || loadingBackups}
            onClick={() => void refreshBackupList()}
          >
            <RefreshCw
              className={`h-4 w-4 ${loadingBackups ? 'animate-spin' : ''}`}
            />
          </Button>
          <Button
            type='button'
            className='gap-2'
            disabled={
              !selectedBackupPath || importingFromFolder || loadingBackups
            }
            onClick={() => void handleImportFromBackupFolder()}
          >
            {importingFromFolder ? (
              <Loader2 className='h-4 w-4 animate-spin' />
            ) : (
              <HardDriveUpload className='h-4 w-4' />
            )}
            Import selected
          </Button>
        </div>
      </div>
    </Card>
  );
}
