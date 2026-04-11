import { useAppSettings } from '@/AppContext';
import { Textarea } from '@/components/ui/textarea';

import { SectionHeader } from '../SettingsUI';

export function TutorSection() {
  const { tutorPersona, setTutorPersona } = useAppSettings();

  return (
    <div className="space-y-6">
      <SectionHeader
        title="AI Tutor"
        description="Configure the persona and behavior of the AI Tutor."
      />
      <div className="space-y-4 max-w-2xl">
        <div className="space-y-2">
          <label
            htmlFor="tutor-persona"
            className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
          >
            Tutor Persona & Instructions
          </label>
          <Textarea
            id="tutor-persona"
            value={tutorPersona}
            onChange={(e) => setTutorPersona(e.target.value)}
            placeholder="Enter custom instructions for how the AI Tutor should behave. For example: 'You are a helpful VCE tutor. Guide the student step-by-step using the Socratic method. Do not give away the final answer immediately.'"
            className="min-h-[200px] resize-y text-sm"
          />
          <p className="text-[0.8rem] text-muted-foreground">
            This prompt will be injected into the system instructions whenever
            the AI Tutor is used.
          </p>
        </div>
      </div>
    </div>
  );
}
