import { useState } from "react";
import { EMPTY_PERSISTED_APP_STATE } from "../../lib/persistence";

export function useSettingsState() {
  const [apiKey, setApiKey] = useState(EMPTY_PERSISTED_APP_STATE.settings.apiKey);
  const [showApiKey, setShowApiKey] = useState(false);
  const [model, setModel] = useState(EMPTY_PERSISTED_APP_STATE.settings.model);
  const [debugMode, setDebugMode] = useState(EMPTY_PERSISTED_APP_STATE.settings.debugMode);

  return {
    apiKey,
    setApiKey,
    showApiKey,
    setShowApiKey,
    model,
    setModel,
    debugMode,
    setDebugMode,
  };
}
