import { ModeToggle } from '@/components/mode-toggle';
import { Button } from '@/components/ui/button';
import { ButtonGroup } from '@/components/ui/button-group';
import { Input } from '@/components/ui/input';
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

const SANS_FONTS = [
  'Manrope Variable',
  'Inter Variable',
  'Roboto',
  'Open Sans',
  'Montserrat',
  'Lato',
  'Poppins',
  'Raleway',
  'Ubuntu',
  'Nunito',
  'Fira Sans',
  'Work Sans',
];

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
  const globalRounding = useAppStore((s) => s.globalRounding);
  const setGlobalRounding = useAppStore((s) => s.setGlobalRounding);
  const interfaceFont = useAppStore((s) => s.interfaceFont);
  const setInterfaceFont = useAppStore((s) => s.setInterfaceFont);
  const headingFont = useAppStore((s) => s.headingFont);
  const setHeadingFont = useAppStore((s) => s.setHeadingFont);

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

      {theme === 'custom' && (
        <Card className='flex items-center justify-between p-4'>
          <div>
            <p className='text-sm font-medium'>Seed color</p>
            <p className='text-xs text-muted-foreground mt-0.5'>
              Primary color for the custom theme.
            </p>
          </div>
          <div className='flex items-center gap-2'>
            <span className='text-xs font-mono text-muted-foreground uppercase'>
              {customThemeSeedColor}
            </span>
            <Input
              type='color'
              value={customThemeSeedColor}
              onChange={(e) => setCustomThemeSeedColor(e.target.value)}
              className='w-12 h-8 p-1 cursor-pointer'
            />
          </div>
        </Card>
      )}

      <Card className='flex items-center justify-between p-4'>
        <div>
          <p className='text-sm font-medium'>Interface rounding</p>
          <p className='text-xs text-muted-foreground mt-0.5'>
            Global corner radius for all UI elements.
          </p>
        </div>
        <ButtonGroup className='border border-border p-1 bg-muted/20'>
          {(['sm', 'md', 'lg', 'xl'] as const).map((r) => (
            <Button
              key={r}
              variant={globalRounding === r ? 'secondary' : 'ghost'}
              size='sm'
              className='h-7 px-3 text-xs uppercase'
              onClick={() => setGlobalRounding(r)}
            >
              {r}
            </Button>
          ))}
        </ButtonGroup>
      </Card>

      <Card className='flex items-center justify-between p-4'>
        <div>
          <p className='text-sm font-medium'>Interface font</p>
          <p className='text-xs text-muted-foreground mt-0.5'>
            Font used for general UI and text.
          </p>
        </div>
        <Select value={interfaceFont} onValueChange={setInterfaceFont}>
          <SelectTrigger className='w-[180px]'>
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

      <Card className='flex items-center justify-between p-4'>
        <div>
          <p className='text-sm font-medium'>Heading font</p>
          <p className='text-xs text-muted-foreground mt-0.5'>
            Font used for titles and headers.
          </p>
        </div>
        <Select value={headingFont} onValueChange={setHeadingFont}>
          <SelectTrigger className='w-[180px]'>
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
