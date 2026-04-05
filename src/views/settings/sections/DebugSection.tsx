import { Bug } from 'lucide-react';

import { useAppSettings } from '../../../AppContext';
import { Button } from '../../../components/ui/button';
import { Card, SectionHeader } from '../SettingsUI';

export function DebugSection() {
  const { debugMode, setDebugMode } = useAppSettings();

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Debug Mode"
        description="Developer tools for inspecting LLM payloads."
      />
      <Card className="flex items-center justify-between p-4">
        <div>
          <p className="text-sm font-medium">Debug Mode</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {debugMode ? 'Debug mode is enabled.' : 'Debug mode is disabled.'}
          </p>
        </div>
        <Button
          type="button"
          variant={debugMode ? 'default' : 'outline'}
          size="sm"
          className="gap-2 shrink-0 ml-4"
          onClick={() => setDebugMode(!debugMode)}
        >
          <Bug className="h-4 w-4" />
          {debugMode ? 'Disable' : 'Enable'}
        </Button>
      </Card>
    </div>
  );
}
