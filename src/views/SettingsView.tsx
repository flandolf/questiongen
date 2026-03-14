import { useState, useEffect } from "react";
import { useAppContext } from "../AppContext";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "../components/ui/card";
import { Eye, EyeOff } from "lucide-react";
import { ModeToggle } from "@/components/mode-toggle";

export function SettingsView() {
  const { apiKey, setApiKey, model, setModel, clearApiKey, showApiKey, setShowApiKey } = useAppContext();
  const [localKey, setLocalKey] = useState(apiKey);
  const [localModel, setLocalModel] = useState(model);

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
    <div className="p-8 max-w-4xl mx-auto flex flex-col space-y-4">
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
            <Input
              id="model-id"
              value={localModel}
              onChange={(e) => setLocalModel(e.target.value)}
              placeholder="e.g. openrouter/auto"
            />
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
    </div>
  );
}