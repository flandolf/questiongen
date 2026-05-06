import { Plus, Sparkles, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';

import { AiGenerateSubtopicsModal } from '@/components/AiGenerateSubtopicsModal';
import { SubtopicEditorModal } from '@/components/SubtopicEditorModal';
import { Button } from '@/components/ui/button';
import { useFirebaseSyncContext } from '@/context/FirebaseSyncContext';
import { useAppStore } from '@/store';
import type { CustomSubtopic, Topic } from '@/types';
import {
  BIOLOGY_SUBTOPICS,
  CHEMISTRY_SUBTOPICS,
  GENERAL_MATHEMATICS_SUBTOPICS,
  getTopicSubtopicGroups,
  MATH_METHODS_SUBTOPICS,
  PHYSICAL_EDUCATION_SUBTOPICS,
  SPECIALIST_MATH_SUBTOPICS,
  TOPICS,
} from '@/types';
import { SectionHeader } from '@/views/settings/SettingsUI';

export function SubtopicsSection() {
  const { user } = useFirebaseSyncContext();
  const {
    customSubtopics,
    loadCustomSubtopics,
    addCustomSubtopic,
    updateCustomSubtopic,
    deleteCustomSubtopic,
  } = useAppStore();
  const [expandedTopic, setExpandedTopic] = useState<Topic | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingSubtopic, setEditingSubtopic] = useState<
    CustomSubtopic | undefined
  >();
  const [editorTopic, setEditorTopic] = useState<Topic>(TOPICS[0]);
  const [aiModalOpen, setAiModalOpen] = useState(false);
  const [aiTopic, setAiTopic] = useState<Topic>(TOPICS[0]);

  useEffect(() => {
    if (user) {
      TOPICS.forEach((topic) => {
        void loadCustomSubtopics(topic);
      });
    }
  }, [user, loadCustomSubtopics]);

  const getCatalogSubtopics = (topic: Topic): readonly string[] => {
    switch (topic) {
      case 'Biology':
        return BIOLOGY_SUBTOPICS;
      case 'Chemistry':
        return CHEMISTRY_SUBTOPICS;
      case 'General Mathematics':
        return GENERAL_MATHEMATICS_SUBTOPICS;
      case 'Mathematical Methods':
        return MATH_METHODS_SUBTOPICS;
      case 'Physical Education':
        return PHYSICAL_EDUCATION_SUBTOPICS;
      case 'Specialist Mathematics':
        return SPECIALIST_MATH_SUBTOPICS;
    }
  };

  const getGroups = (topic: Topic): string[] => {
    const groups = getTopicSubtopicGroups(topic);
    return groups.map((g) => g.groupId);
  };

  const getExistingSubtopicNames = (topic: Topic): string[] => {
    return [
      ...getCatalogSubtopics(topic),
      ...(customSubtopics[topic] || []).map((s) => s.name),
    ];
  };

  const handleEditSubtopic = (topic: Topic, subtopic: CustomSubtopic) => {
    setEditorTopic(topic);
    setEditingSubtopic(subtopic);
    setEditorOpen(true);
  };

  const handleAddSubtopic = (topic: Topic) => {
    setEditorTopic(topic);
    setEditingSubtopic(undefined);
    setEditorOpen(true);
  };

  const handleSaveSubtopic = (subtopic: CustomSubtopic) => {
    if (editingSubtopic) {
      void updateCustomSubtopic(subtopic.topic, subtopic);
    } else {
      void addCustomSubtopic(subtopic.topic, subtopic);
    }
    setEditorOpen(false);
    setEditingSubtopic(undefined);
  };

  const handleDeleteSubtopic = () => {
    if (editingSubtopic) {
      void deleteCustomSubtopic(editingSubtopic.topic, editingSubtopic.id);
      setEditorOpen(false);
      setEditingSubtopic(undefined);
    }
  };

  const handleAddAiSubtopics = (subtopics: CustomSubtopic[]) => {
    subtopics.forEach((sub) => {
      void addCustomSubtopic(sub.topic, sub);
    });
    setAiModalOpen(false);
  };

  if (!user) {
    return (
      <div className='space-y-3'>
        <SectionHeader
          title='Custom Subtopics'
          description='Sign in to sync custom subtopics across devices'
        />
      </div>
    );
  }

  return (
    <div className='space-y-8'>
      <div className='space-y-2'>
        <SectionHeader
          title='Custom Subtopics'
          description='Add your own subtopics or AI-generate new ones for question generation'
        />
      </div>

      <div className='divide-y divide-border/60 rounded-lg border border-border/60 overflow-hidden'>
        {TOPICS.map((topic) => {
          const topicCustomCount = (customSubtopics[topic] || []).length;
          const isExpanded = expandedTopic === topic;

          return (
            <div key={topic}>
              <button
                type='button'
                className='w-full px-5 py-4 flex items-center justify-between hover:bg-muted/40 transition-colors duration-150 text-left'
                onClick={() => setExpandedTopic(isExpanded ? null : topic)}
              >
                <div className='flex items-center gap-3'>
                  <span className='font-medium text-[15px] text-foreground'>
                    {topic}
                  </span>
                  {topicCustomCount > 0 && (
                    <span className='px-2 py-0.5 text-xs font-medium bg-primary/10 text-primary rounded-full'>
                      {topicCustomCount}
                    </span>
                  )}
                </div>
                <ChevronIcon
                  className={`w-4 h-4 text-muted-foreground transition-transform duration-200 ${
                    isExpanded ? 'rotate-180' : ''
                  }`}
                />
              </button>

              {isExpanded && (
                <div className='px-5 pb-6 pt-2 space-y-6 bg-muted/20'>
                  <div className='flex items-center gap-3'>
                    <Button
                      size='sm'
                      className='h-8'
                      onClick={() => handleAddSubtopic(topic)}
                    >
                      <Plus className='w-3.5 h-3.5 mr-1.5' />
                      Add
                    </Button>
                    <Button
                      size='sm'
                      variant='outline'
                      className='h-8'
                      onClick={() => {
                        setAiTopic(topic);
                        setAiModalOpen(true);
                      }}
                    >
                      <Sparkles className='w-3.5 h-3.5 mr-1.5' />
                      AI Generate
                    </Button>
                  </div>

                  {topicCustomCount > 0 && (
                    <div className='space-y-3'>
                      <h4 className='text-xs font-semibold uppercase tracking-wider text-muted-foreground'>
                        Your Custom Subtopics
                      </h4>
                      <div className='grid gap-2'>
                        {customSubtopics[topic]?.map((sub) => (
                          <div
                            key={sub.id}
                            className='group flex items-center justify-between px-4 py-3 rounded-md border border-border/60 bg-background/80 hover:bg-background hover:border-border transition-colors duration-150'
                          >
                            <div className='min-w-0 flex-1'>
                              <div className='font-medium text-sm truncate'>
                                {sub.name}
                              </div>
                              {sub.group && (
                                <div className='text-xs text-muted-foreground truncate mt-0.5'>
                                  {sub.group.replace(/-/g, ' / ')}
                                </div>
                              )}
                            </div>
                            <div className='flex items-center gap-1 ml-3 opacity-0 group-hover:opacity-100 transition-opacity'>
                              <Button
                                size='sm'
                                variant='ghost'
                                className='h-7 px-2 text-muted-foreground hover:text-foreground'
                                onClick={() => handleEditSubtopic(topic, sub)}
                              >
                                Edit
                              </Button>
                              <Button
                                size='sm'
                                variant='ghost'
                                className='h-7 px-2 text-muted-foreground hover:text-destructive'
                                onClick={() =>
                                  void deleteCustomSubtopic(topic, sub.id)
                                }
                              >
                                <Trash2 className='w-3.5 h-3.5' />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className='space-y-2'>
                    <h4 className='text-xs font-semibold uppercase tracking-wider text-muted-foreground/70'>
                      Catalog Subtopics
                    </h4>
                    <div className='flex flex-wrap gap-1.5'>
                      {getCatalogSubtopics(topic)
                        .slice(0, 12)
                        .map((s) => (
                          <span
                            key={s}
                            className='px-2 py-1 text-xs text-muted-foreground/80 bg-muted/40 rounded border border-transparent'
                          >
                            {s}
                          </span>
                        ))}
                      {getCatalogSubtopics(topic).length > 12 && (
                        <span className='px-2 py-1 text-xs text-muted-foreground/60'>
                          +{getCatalogSubtopics(topic).length - 12} more
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <SubtopicEditorModal
        open={editorOpen}
        topic={editorTopic}
        subtopic={editingSubtopic}
        existingGroups={getGroups(editorTopic)}
        onSave={handleSaveSubtopic}
        onDelete={editingSubtopic ? handleDeleteSubtopic : undefined}
        onClose={() => {
          setEditorOpen(false);
          setEditingSubtopic(undefined);
        }}
      />

      <AiGenerateSubtopicsModal
        open={aiModalOpen}
        topic={aiTopic}
        existingSubtopicNames={getExistingSubtopicNames(aiTopic)}
        onAdd={handleAddAiSubtopics}
        onClose={() => setAiModalOpen(false)}
      />
    </div>
  );
}

function ChevronIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox='0 0 24 24'
      fill='none'
      stroke='currentColor'
      strokeWidth='2'
      strokeLinecap='round'
      strokeLinejoin='round'
    >
      <path d='m6 9 6 6 6-6' />
    </svg>
  );
}

export default SubtopicsSection;
