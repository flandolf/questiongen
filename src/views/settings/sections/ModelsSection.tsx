import { LoginWithChatGPT } from '@opencoredev/loginwithchatgpt-react';
import { Loader2, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import { useAppSettings } from '@/AppContext';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  chatGPTFetch,
  getChatGPTBasePath,
  listChatGPTModels,
} from '@/lib/chatgpt';
import {
  AnimatedSection,
  Card,
  FieldGroup,
  SectionHeader,
  ToggleRow,
} from '@/views/settings/SettingsUI';

type ModelTarget = 'model' | 'markingModel' | 'imageMarkingModel' | 'tutorModel';

function ModelSelect({
  id,
  value,
  models,
  disabled,
  onChange,
}: {
  id: string;
  value: string;
  models: string[];
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <Select value={models.includes(value) ? value : ''} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger id={id} className='w-full'>
        <SelectValue placeholder='Connect ChatGPT to choose a model' />
      </SelectTrigger>
      <SelectContent>
        {models.map((model) => (
          <SelectItem key={model} value={model}>
            {model}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function ModelsSection() {
  const settings = useAppSettings();
  const [models, setModels] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const refreshModels = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const available = await listChatGPTModels();
      setModels(available);
      const fallback = available[0];
      if (fallback) {
        if (!available.includes(settings.model)) settings.setModel(fallback);
        if (!available.includes(settings.markingModel)) {
          settings.setMarkingModel(fallback);
        }
        if (!available.includes(settings.imageMarkingModel)) {
          settings.setImageMarkingModel(fallback);
        }
        if (!available.includes(settings.tutorModel)) {
          settings.setTutorModel(fallback);
        }
      }
    } catch (cause) {
      const status =
        cause && typeof cause === 'object' && 'status' in cause
          ? Number(cause.status)
          : 0;
      if (status !== 401) {
        setError(cause instanceof Error ? cause.message : String(cause));
      }
    } finally {
      setLoading(false);
    }
  }, [settings]);

  useEffect(() => {
    void refreshModels();
  }, [refreshModels]);

  const updateModel = (target: ModelTarget, value: string) => {
    const setters = {
      model: settings.setModel,
      markingModel: settings.setMarkingModel,
      imageMarkingModel: settings.setImageMarkingModel,
      tutorModel: settings.setTutorModel,
    };
    setters[target](value);
  };

  return (
    <AnimatedSection className='space-y-5'>
      <Card className='space-y-4 p-4'>
        <SectionHeader
          title='ChatGPT account'
          description='Connect your ChatGPT account to use models available on your plan. QuestionGen never receives your password or an API key.'
        />
        <LoginWithChatGPT
          basePath={getChatGPTBasePath()}
          fetch={chatGPTFetch}
          consent={{ appName: 'QuestionGen' }}
          onAuthenticated={() => void refreshModels()}
        />
      </Card>

      <Card className='space-y-4 p-4'>
        <div className='flex items-start justify-between gap-3'>
          <SectionHeader
            title='Models'
            description='The list comes directly from the connected ChatGPT account.'
          />
          <Button
            type='button'
            variant='outline'
            size='sm'
            onClick={() => void refreshModels()}
            disabled={loading}
          >
            {loading ? (
              <Loader2 className='h-4 w-4 animate-spin' />
            ) : (
              <RefreshCw className='h-4 w-4' />
            )}
            Refresh
          </Button>
        </div>
        {error && <p className='text-sm text-destructive'>{error}</p>}
        <FieldGroup label='Question generation' htmlFor='generation-model'>
          <ModelSelect
            id='generation-model'
            value={settings.model}
            models={models}
            disabled={!models.length}
            onChange={(value) => updateModel('model', value)}
          />
        </FieldGroup>
        <ToggleRow
          id='model-reasoning'
          checked={settings.modelReasoningEnabled}
          onChange={settings.setModelReasoningEnabled}
          label='Extended reasoning for generation'
        />
        {settings.modelReasoningEnabled && (
          <ReasoningSelect
            id='model-reasoning-effort'
            value={settings.modelReasoningEffort}
            onChange={settings.setModelReasoningEffort}
          />
        )}
        <ToggleRow
          id='separate-marking-model'
          checked={settings.useSeparateMarkingModel}
          onChange={settings.setUseSeparateMarkingModel}
          label='Use a separate marking model'
        />
        {settings.useSeparateMarkingModel && (
          <ModelSelect
            id='marking-model'
            value={settings.markingModel}
            models={models}
            disabled={!models.length}
            onChange={(value) => updateModel('markingModel', value)}
          />
        )}
        <ToggleRow
          id='separate-image-model'
          checked={settings.useSeparateImageMarkingModel}
          onChange={settings.setUseSeparateImageMarkingModel}
          label='Use a separate handwritten-answer model'
        />
        {settings.useSeparateImageMarkingModel && (
          <ModelSelect
            id='image-marking-model'
            value={settings.imageMarkingModel}
            models={models}
            disabled={!models.length}
            onChange={(value) => updateModel('imageMarkingModel', value)}
          />
        )}
        <FieldGroup label='Tutor' htmlFor='tutor-model'>
          <ModelSelect
            id='tutor-model'
            value={settings.tutorModel}
            models={models}
            disabled={!models.length}
            onChange={(value) => updateModel('tutorModel', value)}
          />
        </FieldGroup>
      </Card>

      <Card className='space-y-4 p-4'>
        <SectionHeader
          title='Academic context'
          description='Control how local VCE reference material is used.'
        />
        <ToggleRow
          id='include-exam-context'
          checked={settings.includeExamContext}
          onChange={settings.setIncludeExamContext}
          label='Reference local examiner reports'
        />
        <div className='space-y-2'>
          <Label htmlFor='marker-style'>Marking style</Label>
          <Select value={settings.markerStyle} onValueChange={settings.setMarkerStyle}>
            <SelectTrigger id='marker-style'>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='strict'>Strict</SelectItem>
              <SelectItem value='relaxed'>Relaxed</SelectItem>
              <SelectItem value='targeted'>Targeted</SelectItem>
              <SelectItem value='custom'>Custom</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </Card>
    </AnimatedSection>
  );
}

function ReasoningSelect({
  id,
  value,
  onChange,
}: {
  id: string;
  value: 'xhigh' | 'high' | 'max' | 'medium' | 'low' | 'minimal' | 'none';
  onChange: (value: 'xhigh' | 'high' | 'max' | 'medium' | 'low' | 'minimal' | 'none') => void;
}) {
  return (
    <FieldGroup label='Reasoning effort' htmlFor={id}>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id={id}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value='none'>None</SelectItem>
          <SelectItem value='low'>Low</SelectItem>
          <SelectItem value='medium'>Medium</SelectItem>
          <SelectItem value='high'>High</SelectItem>
          <SelectItem value='xhigh'>Maximum</SelectItem>
        </SelectContent>
      </Select>
    </FieldGroup>
  );
}
