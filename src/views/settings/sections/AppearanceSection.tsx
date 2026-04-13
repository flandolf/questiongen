import { ModeToggle } from '@/components/mode-toggle';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { useAppStore } from '@/store';
import { getDesignThemeLabel, themes } from '@/themes/designThemes';

import { useAppSettings } from '../../../AppContext';
import {
  AnimatedSection,
  Card,
  FieldGroup,
  SectionHeader,
} from '../SettingsUI';

export function AppearanceSection() {
  const {
    questionTextSize,
    setQuestionTextSize,
    responseTextSize,
    setResponseTextSize,
  } = useAppSettings();
  const theme = useAppStore((s) => s.theme);
  const setTheme = useAppStore((s) => s.setTheme);

  return (
    <AnimatedSection className='space-y-6'>
      <SectionHeader
        title='Appearance'
        description='Customize the look and feel of the application.'
      />
      <Card className='flex items-center justify-between p-4'>
        <div>
          <p className='text-sm font-medium'>Color theme</p>
          <p className='text-xs text-muted-foreground mt-0.5'>
            Light, dark, or follow system.
          </p>
        </div>
        <ModeToggle />
      </Card>
      <Card className='flex items-center justify-between p-4'>
        <div>
          <p className='text-sm font-medium'>Design theme</p>
          <p className='text-xs text-muted-foreground mt-0.5'>
            Choose a design theme for the interface.
          </p>
        </div>
        <div className='flex gap-2'>
          <Select
            value={theme ? String(theme) : undefined}
            onValueChange={(value: string) => setTheme(value)}
          >
            <SelectTrigger>
              <SelectValue placeholder='Select a theme' />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {themes.map((designTheme) => (
                  <SelectItem
                    key={designTheme.name}
                    value={String(designTheme.name)}
                  >
                    {getDesignThemeLabel(designTheme)}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
      </Card>
      <FieldGroup
        label='Question text size'
        htmlFor='question-text-size'
        hint='Adjust the font size used for question prompt text.'
      >
        <div className='space-y-2'>
          <div className='flex items-center gap-3'>
            <div className='flex-1'>
              <Slider
                id='question-text-size'
                min={12}
                max={28}
                step={1}
                value={[questionTextSize]}
                onValueChange={(v) => setQuestionTextSize(v[0])}
              />
            </div>
            <div className='w-14 text-right text-sm text-muted-foreground'>
              {questionTextSize}px
            </div>
          </div>
          <div
            className='p-3 rounded border border-border bg-muted/10 text-sm'
            style={{ fontSize: `${questionTextSize}px` }}
          >
            The quick brown fox jumps over the lazy dog — question preview.
          </div>
        </div>
      </FieldGroup>
      <FieldGroup
        label='Response text size'
        htmlFor='response-text-size'
        hint='Adjust the font size used for AI response and feedback text.'
      >
        <div className='space-y-2'>
          <div className='flex items-center gap-3'>
            <div className='flex-1'>
              <Slider
                id='response-text-size'
                min={12}
                max={28}
                step={1}
                value={[responseTextSize]}
                onValueChange={(v) => setResponseTextSize(v[0])}
              />
            </div>
            <div className='w-14 text-right text-sm text-muted-foreground'>
              {responseTextSize}px
            </div>
          </div>
          <div
            className='p-3 rounded border border-border bg-muted/10 text-sm'
            style={{ fontSize: `${responseTextSize}px` }}
          >
            The quick brown fox jumps over the lazy dog — response preview.
          </div>
        </div>
      </FieldGroup>
    </AnimatedSection>
  );
}
