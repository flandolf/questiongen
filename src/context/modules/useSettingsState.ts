import { useState } from "react";
import { EMPTY_PERSISTED_APP_STATE } from "../../lib/persistence";

export function useSettingsState() {
  const [apiKey, setApiKey] = useState(EMPTY_PERSISTED_APP_STATE.settings.apiKey);
  const [showApiKey, setShowApiKey] = useState(false);
  const [model, setModel] = useState(EMPTY_PERSISTED_APP_STATE.settings.model);
  const [markingModel, setMarkingModel] = useState(EMPTY_PERSISTED_APP_STATE.settings.markingModel);
  const [useSeparateMarkingModel, setUseSeparateMarkingModel] = useState(EMPTY_PERSISTED_APP_STATE.settings.useSeparateMarkingModel);
  const [debugMode, setDebugMode] = useState(EMPTY_PERSISTED_APP_STATE.settings.debugMode);

  return {
    apiKey,
    setApiKey,
    showApiKey,
    setShowApiKey,
    model,
    setModel,
    markingModel,
    setMarkingModel,
    useSeparateMarkingModel,
    setUseSeparateMarkingModel,
    debugMode,
    setDebugMode,
  };
}
