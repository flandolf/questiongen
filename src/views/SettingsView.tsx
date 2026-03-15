import { useState, useEffect } from "react";
import { useAppContext } from "../AppContext";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "../components/ui/card";
import { Eye, EyeOff, Bug, Braces } from "lucide-react";
import { ModeToggle } from "@/components/mode-toggle";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

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
  } = useAppContext();
  const [localKey, setLocalKey] = useState(apiKey);
  const [localModel, setLocalModel] = useState(model);
  const [showCustomModelInput, setShowCustomModelInput] = useState(false);
  const [customModelId, setCustomModelId] = useState("");

  const models = [
    { id: "openrouter/hunter-alpha", name: "Hunter Alpha" },
    { id: "openrouter/healer-alpha", name: "Healer Alpha" },
    { id: "openrouter/aurora-alpha", name: "Aurora Alpha" },
    { id: "openrouter/free", name: "Free" },
    { id: "custom", name: "Custom..." },
  ]

  // Sync back to context when leaving or saving. Let's just update on save button for explicit action.
  useEffect(() => {
    setLocalKey(apiKey);
    setLocalModel(model);
  }, [apiKey, model]);

  function handleSave() {
    setApiKey(localKey);
    setModel(localModel);
  }

  return (
    <div className="p-3 sm:p-4 lg:p-5 max-w-4xl mx-auto flex flex-col gap-4">
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
                onChange={(e) => setLocalKey(e.target.value)}
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
            <Select value={localModel} onValueChange={(value) => {
              if (value === "custom") {
                setShowCustomModelInput(true);
              } else {
                setShowCustomModelInput(false);
                setLocalModel(value);
              }
            }}>
              <SelectTrigger>
                <SelectValue placeholder="Select a model" />
              </SelectTrigger>
              <SelectContent>
                {models.map((model) => (
                  <SelectItem key={model.id} value={model.id}>
                    {model.name}
                  </SelectItem>
                ))}
              </SelectContent>

            </Select>
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
                <Button className="mt-2" onClick={() => {
                  setLocalModel(customModelId);
                  setShowCustomModelInput(false);
                }}>
                  Use Custom Model
                </Button>
              </div>
            )}
          </div>
        </CardContent>
        <CardFooter>
          <Button onClick={handleSave}>Save Settings</Button>
        </CardFooter>
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
          <Button type="button" variant={debugMode ? "default" : "outline"} className="gap-2" onClick={() => setDebugMode(!debugMode)}>
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
    </div>
  );
}