import { CheckCircle2, Eye, EyeOff, Key, Plus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';

import { useAppSettings } from '@/AppContext';
import { useAppStore } from '@/store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  AnimatedSection,
  FieldGroup,
  SectionHeader,
} from '@/views/settings/SettingsUI';
import {
  BUILTIN_PROVIDERS,
} from '@/types/provider';

export function ApiSection() {
  const {
    apiKey,
    setApiKey,
    clearApiKey,
    showApiKey,
    setShowApiKey,
  } = useAppSettings();
  const providers = useAppStore((s) => s.providers);
  const activeProviderId = useAppStore((s) => s.activeProviderId);
  const setActiveProvider = useAppStore((s) => s.setActiveProvider);
  const setProviderApiKey = useAppStore((s) => s.setProviderApiKey);
  const addCustomProvider = useAppStore((s) => s.addCustomProvider);
  const removeCustomProvider = useAppStore((s) => s.removeCustomProvider);

  const [localKey, setLocalKey] = useState(apiKey);
  const [keySaved, setKeySaved] = useState(false);
  const [showAddCustom, setShowAddCustom] = useState(false);
  const [customName, setCustomName] = useState('');
  const [customUrl, setCustomUrl] = useState('');

  useEffect(() => {
    setLocalKey(apiKey);
  }, [apiKey]);

  function handleSaveKey() {
    setApiKey(localKey);
    setKeySaved(true);
    setTimeout(() => setKeySaved(false), 2000);
  }

  function handleProviderChange(id: string) {
    // Save current API key to active provider before switching
    setProviderApiKey(activeProviderId, localKey);
    setActiveProvider(id);
  }

  function handleAddCustom() {
    const name = customName.trim();
    const url = customUrl.trim();
    if (!name || !url) return;
    const id = addCustomProvider(name, url);
    setShowAddCustom(false);
    setCustomName('');
    setCustomUrl('');
    setActiveProvider(id);
  }

  const providerList = Object.values(providers);
  const activeProvider = providers[activeProviderId];
  const activeConfig = activeProvider?.config;
  const isBuiltin = BUILTIN_PROVIDERS[activeProviderId] != null;

  return (
    <AnimatedSection className='space-y-6'>
      <SectionHeader
        key='header'
        title='API Provider'
        description='Configure your LLM API provider and key.'
      />

      {/* Provider selector */}
      <FieldGroup
        key='provider-select'
        label='Provider'
        htmlFor='provider'
        hint={activeConfig ? `Base URL: ${activeConfig.baseUrl}` : undefined}
      >
        <div className='flex items-center gap-2'>
          <select
            id='provider'
            value={activeProviderId}
            onChange={(e) => handleProviderChange(e.target.value)}
            className='flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring'
          >
            {providerList.map((p) => (
              <option key={p.config.id} value={p.config.id}>
                {p.config.name}
              </option>
            ))}
          </select>
          {!isBuiltin && (
            <Button
              variant='ghost'
              size='icon'
              onClick={() => removeCustomProvider(activeProviderId)}
              className='text-muted-foreground hover:text-destructive shrink-0'
              aria-label='Remove provider'
            >
              <Trash2 className='w-4 h-4' />
            </Button>
          )}
        </div>
      </FieldGroup>

      {/* Custom provider form */}
      {showAddCustom ? (
        <div className='space-y-3 rounded-lg border p-4'>
          <FieldGroup label='Provider Name' htmlFor='custom-name'>
            <Input
              id='custom-name'
              value={customName}
              onChange={(e) => setCustomName(e.target.value)}
              placeholder='My LLM Server'
              className='font-mono text-sm'
            />
          </FieldGroup>
          <FieldGroup
            label='Base URL'
            htmlFor='custom-url'
            hint='e.g. https://api.openai.com/v1 or http://localhost:11434/v1'
          >
            <Input
              id='custom-url'
              value={customUrl}
              onChange={(e) => setCustomUrl(e.target.value)}
              placeholder='https://api.example.com/v1'
              className='font-mono text-sm'
            />
          </FieldGroup>
          <div className='flex items-center gap-2'>
            <Button onClick={handleAddCustom} size='sm'>
              Add Provider
            </Button>
            <Button
              variant='ghost'
              size='sm'
              onClick={() => setShowAddCustom(false)}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <Button
          variant='outline'
          size='sm'
          onClick={() => setShowAddCustom(true)}
          className='gap-1.5'
        >
          <Plus className='w-3.5 h-3.5' />
          Add Custom Provider
        </Button>
      )}

      {/* API Key */}
      <FieldGroup
        key='api-key-field'
        label='API Key'
        htmlFor='api-key'
        hint='Stored locally — never leaves your device except to the selected provider.'
      >
        <div className='relative'>
          <Input
            id='api-key'
            type={showApiKey ? 'text' : 'password'}
            value={localKey}
            onChange={(e) => setLocalKey(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSaveKey()}
            placeholder={
              activeProviderId === 'openrouter'
                ? 'sk-or-v1-…'
                : activeProviderId === 'deepseek'
                  ? 'sk-…'
                  : 'Enter API key…'
            }
            className='pr-10 font-mono text-sm'
          />
          <button
            type='button'
            aria-label={showApiKey ? 'Hide API key' : 'Show API key'}
            className='absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors'
            onClick={() => setShowApiKey(!showApiKey)}
          >
            {showApiKey ? (
              <EyeOff className='w-4 h-4' />
            ) : (
              <Eye className='w-4 h-4' />
            )}
          </button>
        </div>
      </FieldGroup>

      <div key='actions' className='flex items-center gap-3'>
        <Button onClick={handleSaveKey} className='gap-2'>
          {keySaved ? (
            <CheckCircle2 className='h-4 w-4' />
          ) : (
            <Key className='h-4 w-4' />
          )}
          {keySaved ? 'Saved!' : 'Save Key'}
        </Button>
        <Button
          variant='ghost'
          onClick={clearApiKey}
          className='text-muted-foreground hover:text-destructive hover:bg-destructive/10'
        >
          Clear
        </Button>
      </div>
    </AnimatedSection>
  );
}
