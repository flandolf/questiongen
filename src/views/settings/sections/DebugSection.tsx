import { Bug } from 'lucide-react';

import { useAppSettings } from '@/AppContext';
import { Button } from '@/components/ui/button';
import {
  AnimatedSection,
  Card,
  SectionHeader,
} from '@/views/settings/SettingsUI';

export function DebugSection() {
  const { debugMode, setDebugMode, showRawLlmOutput, setShowRawLlmOutput } =
    useAppSettings();

  return (
    <AnimatedSection className='space-y-6'>
      <SectionHeader
        key='header'
        title='Debug Mode'
        description='Developer tools for inspecting LLM payloads.'
      />
      <Card
        key='debug-toggle'
        className='flex items-center justify-between p-4'
      >
        <div>
          <p className='text-sm font-medium'>Debug Mode</p>
          <p className='text-xs text-muted-foreground mt-0.5'>
            {debugMode ? 'Debug mode is enabled.' : 'Debug mode is disabled.'}
          </p>
        </div>
        <Button
          type='button'
          variant={debugMode ? 'default' : 'outline'}
          size='sm'
          className='gap-2 shrink-0 ml-4'
          onClick={() => setDebugMode(!debugMode)}
        >
          <Bug className='h-4 w-4' />
          {debugMode ? 'Disable' : 'Enable'}
        </Button>
      </Card>
      <Card
        key='raw-llm-toggle'
        className='flex items-center justify-between p-4'
      >
        <div>
          <p className='text-sm font-medium'>Show Raw LLM Output</p>
          <p className='text-xs text-muted-foreground mt-0.5'>
            {showRawLlmOutput
              ? 'Raw LLM streaming output is visible.'
              : 'Raw LLM streaming output is hidden.'}
          </p>
        </div>
        <Button
          type='button'
          variant={showRawLlmOutput ? 'default' : 'outline'}
          size='sm'
          className='gap-2 shrink-0 ml-4'
          onClick={() => setShowRawLlmOutput(!showRawLlmOutput)}
        >
          <Bug className='h-4 w-4' />
          {showRawLlmOutput ? 'Hide' : 'Show'}
        </Button>
      </Card>
    </AnimatedSection>
  );
}
