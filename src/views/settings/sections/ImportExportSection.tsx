import { useState, useRef, useCallback } from 'react';
import {
  HardDriveDownload,
  HardDriveUpload,
  Loader2,
  CheckCircle2,
} from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { useAppStore } from '../../../store';
import { SectionHeader, Divider, ErrorBanner, Card } from '../SettingsUI';
import { ConfirmModal } from '../../../components/ui/ConfirmModal';
import {
  exportAppState,
  createExportEnvelope,
  downloadExport,
  parseImportFile,
  computeImportCounts,
  type ImportCounts,
} from '../../../lib/import-export';
import type { PersistedAppState } from '../../../types';

export function ImportExportSection() {
  const questionHistory = useAppStore((s) => s.questionHistory);
  const mcHistory = useAppStore((s) => s.mcHistory);
  const savedSets = useAppStore((s) => s.savedSets);
  const presets = useAppStore((s) => s.presets);
  const examHistory = useAppStore((s) => s.examHistory);
  const importState = useAppStore((s) => s.importState);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Import preview state
  const [showPreview, setShowPreview] = useState(false);
  const [pendingImport, setPendingImport] = useState<PersistedAppState | null>(
    null
  );
  const [importCounts, setImportCounts] = useState<ImportCounts | null>(null);

  const handleExport = useCallback(() => {
    setExporting(true);
    setError(null);
    setSuccess(null);
    try {
      const state = useAppStore.getState();
      const snapshot = exportAppState(state);
      const envelope = createExportEnvelope(snapshot);
      downloadExport(envelope);
      setSuccess('Export downloaded successfully.');
    } catch (err) {
      setError(
        `Export failed: ${err instanceof Error ? err.message : 'Unknown error'}`
      );
    } finally {
      setExporting(false);
    }
  }, []);

  const handleFileSelect = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      setError(null);
      setSuccess(null);
      setImporting(true);

      try {
        const imported = await parseImportFile(file);
        const state = useAppStore.getState();
        const counts = computeImportCounts(state, imported);

        setPendingImport(imported);
        setImportCounts(counts);
        setShowPreview(true);
      } catch (err) {
        setError(
          `Import failed: ${err instanceof Error ? err.message : 'Unknown error'}`
        );
      } finally {
        setImporting(false);
        // Reset file input so the same file can be selected again
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      }
    },
    []
  );

  const handleConfirmImport = useCallback(() => {
    if (!pendingImport) return;

    try {
      importState(pendingImport);
      setSuccess(
        'Import completed successfully. Data has been merged with your existing data.'
      );
    } catch (err) {
      setError(
        `Import failed: ${err instanceof Error ? err.message : 'Unknown error'}`
      );
    } finally {
      setShowPreview(false);
      setPendingImport(null);
      setImportCounts(null);
    }
  }, [pendingImport, importState]);

  const handleCancelImport = useCallback(() => {
    setShowPreview(false);
    setPendingImport(null);
    setImportCounts(null);
  }, []);

  const buildPreviewDescription = (): string => {
    if (!importCounts) return '';
    const parts: string[] = [];

    if (importCounts.newQuestionHistory > 0) {
      parts.push(`${importCounts.newQuestionHistory} written history entries`);
    }
    if (importCounts.newMcHistory > 0) {
      parts.push(`${importCounts.newMcHistory} MC history entries`);
    }
    if (importCounts.newSavedSets > 0) {
      parts.push(`${importCounts.newSavedSets} saved sets`);
    }
    if (importCounts.newPresets > 0) {
      parts.push(`${importCounts.newPresets} presets`);
    }
    if (importCounts.newExamHistory > 0) {
      parts.push(`${importCounts.newExamHistory} exam records`);
    }
    if (importCounts.newGenerationHistory > 0) {
      parts.push(`${importCounts.newGenerationHistory} generation records`);
    }
    if (importCounts.newSpacedCards > 0) {
      parts.push(`${importCounts.newSpacedCards} spaced repetition cards`);
    }

    if (parts.length === 0) {
      return 'No new data found. All entries in the import file already exist in your data. Nothing will be changed.';
    }

    return `The following new items will be added:\n\n${parts.join('\n')}\n\nDuplicate entries (matching IDs) will be skipped. Settings and preferences will be overwritten. Your API key will be preserved.`;
  };

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Import / Export"
        description="Backup your data locally or restore from a previous export."
      />

      {error && <ErrorBanner message={error} />}

      {success && (
        <div className="flex items-center gap-2 text-sm text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 rounded-lg px-3 py-2">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          {success}
        </div>
      )}

      {/* Export Card */}
      <Card className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <HardDriveDownload className="h-4 w-4 text-muted-foreground" />
          <p className="text-sm font-medium">Export Data</p>
        </div>
        <p className="text-xs text-muted-foreground">
          Download a complete backup of your data as a JSON file. Images in your
          history are included. Your API key is stripped for security.
        </p>
        <div className="text-xs text-muted-foreground space-y-0.5">
          <p>
            {questionHistory.length} written history entries, {mcHistory.length}{' '}
            MC history entries
          </p>
          <p>
            {savedSets.length} saved sets, {presets.length} presets,{' '}
            {examHistory.length} exam records
          </p>
        </div>
        <Button onClick={handleExport} disabled={exporting} className="gap-2">
          {exporting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <HardDriveDownload className="h-4 w-4" />
          )}
          {exporting ? 'Exporting...' : 'Export All Data'}
        </Button>
      </Card>

      <Divider />

      {/* Import Card */}
      <Card className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <HardDriveUpload className="h-4 w-4 text-muted-foreground" />
          <p className="text-sm font-medium">Import Data</p>
        </div>
        <p className="text-xs text-muted-foreground">
          Restore data from a previously exported backup file. Duplicate entries
          are automatically skipped. Settings and preferences will be
          overwritten (your API key is preserved).
        </p>
        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          onChange={handleFileSelect}
          className="hidden"
        />
        <Button
          variant="outline"
          onClick={() => fileInputRef.current?.click()}
          disabled={importing}
          className="gap-2"
        >
          {importing ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <HardDriveUpload className="h-4 w-4" />
          )}
          {importing ? 'Reading file...' : 'Choose File'}
        </Button>
      </Card>

      {/* Import Preview Modal */}
      {showPreview && importCounts && (
        <ConfirmModal
          open={showPreview}
          title="Import Preview"
          description={buildPreviewDescription()}
          confirmText={importCounts.totalImported > 0 ? 'Import Data' : 'Close'}
          cancelText="Cancel"
          onConfirm={
            importCounts.totalImported > 0
              ? handleConfirmImport
              : handleCancelImport
          }
          onCancel={handleCancelImport}
        />
      )}
    </div>
  );
}
