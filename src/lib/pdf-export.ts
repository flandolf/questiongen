import { toast } from 'sonner';

import type { GeneratedQuestion, McQuestion } from '@/types';

export function exportToPdf(
  title: string,
  questions: (GeneratedQuestion | McQuestion)[],
  _questionMode: 'written' | 'multiple-choice',
) {
  try {
    // For now, since we don't have a native PDF generator yet,
    // we'll implement a "Print to PDF" approach using the browser's print functionality
    // but with a nicely formatted print-only stylesheet.

    // In a real production app with Rust backend, we'd call a native command.
    // Let's create a print-only container, populate it, and call window.print().

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      toast.error('Could not open print window. Please check your pop-up blocker.');
      return;
    }

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>${title}</title>
        <style>
          @media print {
            @page { margin: 2cm; }
            body { font-family: 'Inter', system-ui, sans-serif; line-height: 1.5; color: #000; }
            h1 { font-size: 24pt; margin-bottom: 0.5cm; }
            .meta { font-size: 10pt; color: #666; margin-bottom: 1cm; border-bottom: 1px solid #eee; padding-bottom: 0.5cm; }
            .question { margin-bottom: 1.5cm; page-break-inside: avoid; }
            .question-header { font-weight: bold; margin-bottom: 0.3cm; border-bottom: 1px solid #eee; padding-bottom: 0.1cm; display: flex; justify-content: space-between; }
            .prompt { font-size: 12pt; margin-bottom: 0.5cm; white-space: pre-wrap; }
            .options { display: grid; grid-template-columns: 1fr 1fr; gap: 0.5cm; }
            .option { border: 1px solid #ddd; padding: 0.3cm; border-radius: 4px; }
            .marks { font-style: italic; font-size: 10pt; }
          }
          body { padding: 2cm; max-width: 800px; margin: 0 auto; font-family: sans-serif; }
          .no-print { display: none; }
        </style>
      </head>
      <body>
        <h1>${title}</h1>
        <div class="meta">
          Generated via QuestionGen · ${new Date().toLocaleDateString()} · ${questions.length} Questions
        </div>
        ${questions.map((q, i) => `
          <div class="question">
            <div class="question-header">
              <span>Question ${i + 1}</span>
              ${'maxMarks' in q ? `<span class="marks">[${q.maxMarks} marks]</span>` : ''}
            </div>
            <div class="prompt">${q.promptMarkdown}</div>
            ${'options' in q ? `
              <div class="options">
                ${q.options.map(opt => `
                  <div class="option">
                    <strong>${opt.label}.</strong> ${opt.text}
                  </div>
                `).join('')}
              </div>
            ` : `
              <div style="height: 100px; border: 1px dashed #ccc; margin-top: 0.5cm; border-radius: 4px; display: flex; align-items: center; justify-content: center; color: #999; font-size: 9pt;">
                Response area
              </div>
            `}
          </div>
        `).join('')}
        <script>
          window.onload = () => {
            window.print();
            // window.close();
          };
        </script>
      </body>
      </html>
    `;

    printWindow.document.write(html);
    printWindow.document.close();

    toast.success('PDF Export window opened');
  } catch (error) {
    console.error('PDF Export failed:', error);
    toast.error('Failed to export PDF');
  }
}
