import { useAppSettings } from '@/AppContext';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

import { TUTOR_PERSONA_PRESETS } from '../constants';
import { AnimatedSection, SectionHeader } from '../SettingsUI';

export function TutorSection() {
  const { tutorPersona, setTutorPersona } = useAppSettings();

  return (
    <AnimatedSection className='space-y-6 w-full'>
      <SectionHeader
        title='AI Tutor'
        description='Configure the persona and behavior of the AI Tutor.'
      />
      <div className='space-y-4 flex flex-col items-start w-full'>
        <div className='space-y-4 w-full'>
          <div className='space-y-2'>
            <SectionHeader
              title='Quick Presets'
              description='Select a preset persona to automatically fill the instructions below.'
            />
            <div className='grid grid-cols-1 sm:grid-cols-2 gap-3'>
              {TUTOR_PERSONA_PRESETS.map((preset) => (
                <Button
                  key={preset.id}
                  variant='outline'
                  className='h-auto py-3 px-4 flex flex-col items-start text-left gap-1'
                  onClick={() => setTutorPersona(preset.prompt)}
                >
                  <span className='font-bold text-sm'>{preset.name}</span>
                  <span className='text-[10px] text-muted-foreground line-clamp-1'>
                    {preset.description}
                  </span>
                </Button>
              ))}
            </div>
          </div>

          <div className='space-y-2'>
            <SectionHeader
              title='Custom Persona'
              description='Customize the instructions that define how the AI Tutor should interact with students.'
            />
            <Textarea
              id='tutor-persona'
              value={tutorPersona}
              onChange={(e) => setTutorPersona(e.target.value)}
              placeholder="Enter custom instructions for how the AI Tutor should behave. For example: 'You are a helpful VCE tutor. Guide the student step-by-step using the Socratic method. Do not give away the final answer immediately.'"
              className='min-h-50 resize-y text-sm'
            />
            <p className='text-[0.8rem] text-muted-foreground'>
              This prompt will be injected into the system instructions whenever
              the AI Tutor is used.
            </p>
          </div>
        </div>
      </div>
    </AnimatedSection>
  );
}
