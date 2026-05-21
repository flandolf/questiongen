import { AlertCircle, CheckCircle2, Eye, EyeOff, Plus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAppStore } from '@/store';
import type { ProviderState } from '@/types/provider';
import { BUILTIN_PROVIDERS } from '@/types/provider';
import {
  AnimatedSection,
  FieldGroup,
  SectionHeader,
} from '@/views/settings/SettingsUI';

function getStatusIcon(status: ProviderState['keyStatus']) {
  if (status === 'valid') return <CheckCircle2 className="w-4 h-4 text-green-500" />;
  if (status === 'invalid') return <AlertCircle className="w-4 h-4 text-red-500" />;
  return null;
}

interface ProviderCardProps {
  provider: ProviderState;
  providerId: string;
  onKeyChange: (id: string, key: string) => void;
  onRemove: (id: string) => void;
}

function ProviderCard({ provider, providerId, onKeyChange, onRemove }: ProviderCardProps) {
  const [localKey, setLocalKey] = useState(provider.apiKey);
  const [showKey, setShowKey] = useState(false);

  useEffect(() => {
    setLocalKey(provider.apiKey);
  }, [provider.apiKey]);

  const handleKeyChange = (value: string) => {
    setLocalKey(value);
    onKeyChange(providerId, value);
  };

  const isBuiltin = BUILTIN_PROVIDERS[providerId] != null;

  return (
    <div className="rounded-lg border p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">{provider.config.name}</h3>
        <div className="flex items-center gap-2">
          {getStatusIcon(provider.keyStatus)}
          {!isBuiltin && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onRemove(providerId)}
              className="text-muted-foreground hover:text-destructive"
              aria-label="Remove provider"
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          )}
        </div>
      </div>
      <div className="text-xs text-muted-foreground font-mono">
        {provider.config.baseUrl}
      </div>
      <div className="relative">
        <Input
          type={showKey ? 'text' : 'password'}
          value={localKey}
          onChange={(e) => handleKeyChange(e.target.value)}
          placeholder={providerId === 'deepseek' ? 'sk-...' : 'sk-or-v1-...'}
          className="pr-10 font-mono text-sm"
        />
        <button
          type="button"
          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          onClick={() => setShowKey(!showKey)}
        >
          {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );
}

export function ApiSection() {
  const providers = useAppStore((s) => s.providers);
  const setProviderApiKey = useAppStore((s) => s.setProviderApiKey);
  const addCustomProvider = useAppStore((s) => s.addCustomProvider);
  const removeCustomProvider = useAppStore((s) => s.removeCustomProvider);

  const [showAddCustom, setShowAddCustom] = useState(false);
  const [customName, setCustomName] = useState('');
  const [customUrl, setCustomUrl] = useState('');

  function handleAddCustom() {
    const name = customName.trim();
    const url = customUrl.trim();
    if (!name || !url) return;
    addCustomProvider(name, url);
    setShowAddCustom(false);
    setCustomName('');
    setCustomUrl('');
  }

  const providerList = Object.values(providers);

  return (
    <AnimatedSection className='space-y-6'>
      <SectionHeader
        key='header'
        title='API Providers'
        description='Configure API keys for each provider. Models from all providers will be available.'
      />

      {/* Provider cards */}
      <div className="grid gap-4">
        {providerList.map((provider) => (
          <ProviderCard
            key={provider.config.id}
            provider={provider}
            providerId={provider.config.id}
            onKeyChange={setProviderApiKey}
            onRemove={removeCustomProvider}
          />
        ))}
      </div>

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
    </AnimatedSection>
  );
}
