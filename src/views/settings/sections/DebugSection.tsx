import { Bug } from "lucide-react";
import { Button } from "../../../components/ui/button";
import { useAppSettings } from "../../../AppContext";
import { SectionHeader, Card } from "../SettingsUI";

export function DebugSection() {
  const { debugMode, setDebugMode } = useAppSettings();

  return (
    <div className="space-y-6">
      <SectionHeader title="Debug Mode" description="Developer tools for inspecting LLM payloads." />
      <Card className="flex items-center justify-between p-4">
        <div>
          <p className="text-sm font-medium">Raw generation payload</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {debugMode ? "Enabled — raw LLM output shown on problem cards." : "Reveal the raw LLM generation payload for prompt inspection."}
          </p>
        </div>
        <Button type="button" variant={debugMode ? "default" : "outline"} size="sm" className="gap-2 shrink-0 ml-4" onClick={() => setDebugMode(!debugMode)}>
          <Bug className="h-4 w-4" />{debugMode ? "Disable" : "Enable"}
        </Button>
      </Card>
    </div>
  );
}
