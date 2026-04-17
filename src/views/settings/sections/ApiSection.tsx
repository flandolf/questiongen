import { CheckCircle2, Eye, EyeOff, Key } from 'lucide-react';
import { useState } from 'react';

import { useAppSettings } from '../../../AppContext';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { AnimatedSection, FieldGroup, SectionHeader } from '../SettingsUI';

export function ApiSection() {
  const { apiKey, setApiKey, clearApiKey, showApiKey, setShowApiKey } =
    useAppSettings();
  const [localKey, setLocalKey] = useState(apiKey);
  const [keySaved, setKeySaved] = useState(false);

  function handleSaveKey() {
    setApiKey(localKey);
    setKeySaved(true);
    setTimeout(() => setKeySaved(false), 2000);
  }

  return (
    <AnimatedSection className='space-y-6'>
      <SectionHeader
        key='header'
        title='OpenRouter API Key'
        description='Required for question generation, marking, and account info.'
      />
      <FieldGroup
        key='api-key-field'
        label='API Key'
        htmlFor='api-key'
        hint='Stored locally — never leaves your device except to OpenRouter.'
      >
        <div className='relative'>
          <Input
            id='api-key'
            type={showApiKey ? 'text' : 'password'}
            value={localKey}
            onChange={(e) => setLocalKey(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSaveKey()}
            placeholder='sk-or-v1-…'
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
