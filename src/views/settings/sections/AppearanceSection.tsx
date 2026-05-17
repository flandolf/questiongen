import { useAppSettings } from '@/AppContext';
import { ColorPicker } from '@/components/color-picker';
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

import {
  AnimatedSection,
  Card,
  FieldGroup,
  SectionHeader,
} from '../SettingsUI';

const SANS_FONTS = ['Spline Sans Variable', 'JetBrains Mono Variable'];

export function AppearanceSection() {
  const {
    questionTextSize,
    setQuestionTextSize,
    responseTextSize,
    setResponseTextSize,
  } = useAppSettings();
  const theme = useAppStore((s) => s.theme);
  const setTheme = useAppStore((s) => s.setTheme);
  const customThemeSeedColor = useAppStore((s) => s.customThemeSeedColor);
  const setCustomThemeSeedColor = useAppStore((s) => s.setCustomThemeSeedColor);
  const interfaceFont = useAppStore((s) => s.interfaceFont);
  const setInterfaceFont = useAppStore((s) => s.setInterfaceFont);
  const headingFont = useAppStore((s) => s.headingFont);
  const setHeadingFont = useAppStore((s) => s.setHeadingFont);

  return (
    <AnimatedSection className='space-y-6'>
      <SectionHeader
        key='appearance-header'
        title='Appearance'
        description='Customize the look and feel of the application.'
      />
      <Card key='color-theme' className='flex items-center justify-between p-4'>
        <div>
          <p className='text-sm font-medium'>Color theme</p>
          <p className='text-xs text-muted-foreground mt-0.5'>
            Light, dark, or follow system.
          </p>
        </div>
        <ModeToggle />
      </Card>
      <Card
        key='design-theme'
        className='flex items-center justify-between p-4'
      >
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

      {theme === 'custom' && (
        <Card
          key='custom-theme-seed'
          className='flex items-center justify-between p-4'
        >
          <div>
            <p className='text-sm font-medium'>Seed color</p>
            <p className='text-xs text-muted-foreground mt-0.5'>
              Primary color for the custom theme.
            </p>
          </div>
          <ColorPicker
            value={customThemeSeedColor}
            onChange={setCustomThemeSeedColor}
            label='Seed color'
            triggerClassName='w-44'
            contentClassName='w-80'
          />
        </Card>
      )}

      <Card
        key='interface-font'
        className='flex items-center justify-between p-4'
      >
        <div>
          <p className='text-sm font-medium'>Interface font</p>
          <p className='text-xs text-muted-foreground mt-0.5'>
            Font used for general UI and text.
          </p>
        </div>
        <Select value={interfaceFont} onValueChange={setInterfaceFont}>
          <SelectTrigger className='w-45'>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SANS_FONTS.map((font) => (
              <SelectItem key={font} value={font} style={{ fontFamily: font }}>
                {font}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Card>

      <Card
        key='heading-font'
        className='flex items-center justify-between p-4'
      >
        <div>
          <p className='text-sm font-medium'>Heading font</p>
          <p className='text-xs text-muted-foreground mt-0.5'>
            Font used for titles and headers.
          </p>
        </div>
        <Select value={headingFont} onValueChange={setHeadingFont}>
          <SelectTrigger className='w-45'>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SANS_FONTS.map((font) => (
              <SelectItem key={font} value={font} style={{ fontFamily: font }}>
                {font}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Card>

      <FieldGroup
        key='question-text-size'
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
        key='response-text-size'
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
