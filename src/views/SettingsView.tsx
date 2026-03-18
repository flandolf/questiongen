import { useState, useEffect } from "react";
import { useAppSettings } from "../AppContext";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "../components/ui/card";
import { Eye, EyeOff, Bug, Braces, Loader } from "lucide-react";
import { ModeToggle } from "@/components/mode-toggle";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { invoke } from "@tauri-apps/api/core";
import { MarkdownMath } from "@/components/MarkdownMath";

export function SettingsView() {
  const {
    apiKey,
    setApiKey,
    model,
    setModel,
    clearApiKey,
    showApiKey,
    setShowApiKey,
    debugMode,
    setDebugMode,
    useStructuredOutput,
    setUseStructuredOutput,
    pendingDollarDelimiterMigrations,
    migrateDollarDelimiterContent,
  } = useAppSettings();
  const [localKey, setLocalKey] = useState(apiKey);
  const [localModel, setLocalModel] = useState(model);
  const [showCustomModelInput, setShowCustomModelInput] = useState(false);
  const [customModelId, setCustomModelId] = useState("");
  const [_tps, setTps] = useState<number | null>(null);
  const [modelTpsMap, setModelTpsMap] = useState<Record<string, number | null>>({});
  const [testOutput, setTestOutput] = useState<string>("");
  const [isTestLoading, setIsTestLoading] = useState(false);
  const [testStartTime, setTestStartTime] = useState<number | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [testDurationSeconds, setTestDurationSeconds] = useState<number | null>(null);
  const [migrationResult, setMigrationResult] = useState<string>("");
  const models = [
    { id: "openrouter/hunter-alpha", name: "Hunter Alpha" },
    { id: "openrouter/healer-alpha", name: "Healer Alpha" },
    { id: "minimax/minimax-m2.5:free", name: "Minimax M2.5 (free)" },
    { id: "qwen/qwen3-next-80b-a3b-instruct:free", name: "Qwen3 Next 80B (free)" },
    { id: "openrouter/free", name: "Free" },
    { id: "custom", name: "Custom..." },
  ];

  useEffect(() => {
    setLocalKey(apiKey);
    setLocalModel(model);
  }, [apiKey, model]);

  useEffect(() => {
    if (isTestLoading && testStartTime) {
      const timer = setInterval(() => {
        const now = Date.now();
        setElapsedMs(now - testStartTime);
      }, 100);
      return () => clearInterval(timer);
    }
  }, [isTestLoading, testStartTime]);

  useEffect(() => {
    async function fetchTpsForModels() {
      const updatedModelTpsMap: Record<string, number | null> = {};
      for (const model of models) {
        if (model.id !== "custom" && localKey) {
          try {
            const result = await invoke("get_tps", { model: model.id, apiKey: localKey });
            updatedModelTpsMap[model.id] = result as number;
          } catch (error) {
            console.error(`Failed to fetch TPS for model ${model.id}:`, error);
            updatedModelTpsMap[model.id] = null;
          }
        }
      }
      setModelTpsMap(updatedModelTpsMap);
    }
    fetchTpsForModels();
  }, [localKey]);

  useEffect(() => {
    async function fetchTps() {
      if (localModel && localKey) {
        try {
          const result = await invoke("get_tps", { model: localModel, apiKey: localKey });
          setTps(result as number);
        } catch (error) {
          console.error("Failed to fetch TPS:", error);
          setTps(null);
        }
      }
    }
    fetchTps();
  }, [localModel, localKey]);

  function handleSave() {
    setApiKey(localKey);
    setModel(localModel);
  }

  function handleTestModel() {
    if (localModel && localKey) {
      const startTime = Date.now();
      setIsTestLoading(true);
      setTestStartTime(startTime);
      setElapsedMs(0);
      setTestDurationSeconds(null);
      invoke("test_model", { model: localModel, apiKey: localKey }).then((result) => {
        const endTime = Date.now();
        const duration = (endTime - startTime) / 1000;
        setTestOutput(result as string);
        setTestDurationSeconds(duration);
        setIsTestLoading(false);
      }).catch((error) => {
        const endTime = Date.now();
        const duration = (endTime - startTime) / 1000;
        console.error("Model test failed:", error);
        setTestOutput(`Error: ${error}`);
        setTestDurationSeconds(duration);
        setIsTestLoading(false);
      });
    }
  }

  function handleMigrateDollarDelimiters() {
    const migratedFieldCount = migrateDollarDelimiterContent();
    if (migratedFieldCount === 0) {
      setMigrationResult("No saved question content needed migration.");
      return;
    }

    setMigrationResult(`Migrated ${migratedFieldCount} field${migratedFieldCount === 1 ? "" : "s"} from dollar delimiters.`);
  }

  return (
    <div className="min-w-full p-4.5 mx-auto flex flex-col gap-4">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground mt-2">Manage your OpenRouter API key and model preferences.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>OpenRouter API Key</CardTitle>
          <CardDescription>
            You need a valid API key from OpenRouter to generate and mark questions.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="api-key">API Key</Label>
            <div className="relative">
              <Input
                id="api-key"
                type={showApiKey ? "text" : "password"}
                value={localKey}
                onChange={(e) => {
                  setLocalKey(e.target.value);
                }}
                placeholder="sk-or-v1-..."
                className="pr-10"
              />
              <button
                type="button"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                onClick={() => setShowApiKey(!showApiKey)}
              >
                {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-xs text-muted-foreground">Changes are saved when you click “Save Settings.”</p>
          </div>
        </CardContent>
        <CardFooter className="flex justify-between">
          <Button variant="outline" onClick={clearApiKey}>
            Clear Key
          </Button>
          <Button onClick={handleSave}>Save Settings</Button>
        </CardFooter>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Model Selection</CardTitle>
          <CardDescription>
            Which OpenRouter model to use for generation and marking.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <Label htmlFor="model-id">Model ID</Label>
            <Select
              value={localModel}
              onValueChange={(value) => {
                if (value === "custom") {
                  setShowCustomModelInput(true);
                } else {
                  setShowCustomModelInput(false);
                  setLocalModel(value);
                  setModel(value);
                }
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a model" />
              </SelectTrigger>
              <SelectContent>
                {models.map((model) => (
                  <SelectItem key={model.id} value={model.id}>
                    {model.name}
                    {modelTpsMap[model.id] !== undefined && modelTpsMap[model.id] !== null && (
                      `: ${modelTpsMap[model.id]} tps`
                    )}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button size="sm" onClick={handleTestModel} disabled={isTestLoading}>
              {isTestLoading ? (
                <>
                  <Loader className="h-4 w-4 animate-spin mr-2" />
                  {elapsedMs}ms
                </>
              ) : (
                "Test"
              )}
            </Button>
            {testDurationSeconds !== null && (
              <p className="text-sm text-muted-foreground">done in {testDurationSeconds.toFixed(2)} s</p>
            )}
            {testOutput && (
              <div className="px-4 py-2 bg-muted rounded">
                <MarkdownMath content={testOutput}></MarkdownMath>
              </div>
            )}
            {showCustomModelInput && (
              <div className="mt-2 space-y-2">
                <Label htmlFor="custom-model-id">Custom Model ID</Label>
                <Input
                  id="custom-model-id"
                  type="text"
                  value={customModelId}
                  onChange={(e) => setCustomModelId(e.target.value)}
                  placeholder="e.g. openrouter/my-custom-model"
                />
                <Button
                  className="mt-2"
                  onClick={() => {
                    setLocalModel(customModelId);
                    setShowCustomModelInput(false);
                    setModel(customModelId);
                  }}
                >
                  Use Custom Model
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Theme</CardTitle>
          <CardDescription>
            Toggle between light, dark, or system theme modes.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ModeToggle />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Debug Mode</CardTitle>
          <CardDescription>
            Reveal the raw LLM generation payload from the problem card for debugging and prompt inspection.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">
            {debugMode ? "Debug mode is enabled." : "Debug mode is disabled."}
          </p>
          <Button
            type="button"
            variant={debugMode ? "default" : "outline"}
            className="gap-2"
            onClick={() => setDebugMode(!debugMode)}
          >
            <Bug className="h-4 w-4" />
            {debugMode ? "Disable Debug Mode" : "Enable Debug Mode"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Structured Output</CardTitle>
          <CardDescription>
            Request OpenRouter JSON schema-constrained responses when supported by the selected model.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">
            {useStructuredOutput
              ? "Structured output is enabled. If the model rejects it, the app automatically retries without it."
              : "Structured output is disabled."}
          </p>
          <Button
            type="button"
            variant={useStructuredOutput ? "default" : "outline"}
            className="gap-2"
            onClick={() => setUseStructuredOutput(!useStructuredOutput)}
          >
            <Braces className="h-4 w-4" />
            {useStructuredOutput ? "Disable Structured Output" : "Enable Structured Output"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Math Delimiter Migration</CardTitle>
          <CardDescription>
            Dollar-sign math delimiters are deprecated. Migrate saved question content from $...$ and $$...$$ to \\( ... \\) and \\[ ... \\].
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {pendingDollarDelimiterMigrations > 0
              ? `${pendingDollarDelimiterMigrations} field${pendingDollarDelimiterMigrations === 1 ? "" : "s"} can be migrated.`
              : "No legacy dollar delimiters were found in saved question content."}
          </p>
          <Button
            type="button"
            onClick={handleMigrateDollarDelimiters}
            disabled={pendingDollarDelimiterMigrations === 0}
          >
            Migrate Saved Questions
          </Button>
          {migrationResult && <p className="text-sm text-muted-foreground">{migrationResult}</p>}
        </CardContent>
      </Card>
    </div>
  );
}
