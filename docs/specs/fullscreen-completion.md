# Spec: fullscreen-completion

Scope: feature

## Feature Summary

A post-session completion screen for VCE practice exams. It summarizes the
student's performance, highlights weak areas, and provides detailed
question-by-question review in a comprehensive dashboard view, moving away from
the previous constrained card interface.

## Primary User Action

Quickly assess overall score and accuracy, then scroll down to review specific
questions and criteria that need improvement.

## Design Direction

"Dashboard-style" with a refined, academic, and serious tone. It should feel
like a high-end data dashboard (e.g., Vercel, Linear)—precise, dense but clean,
using subtle branding colors (OKLCH) to distinguish performance tiers. Avoid
generic "plain spreadsheet" feel by using excellent typography and spatial
rhythm.

## Layout Strategy

A fullscreen, long-scrolling layout.

- **Top:** A prominent stat grid featuring the hero Score & Accuracy alongside
  key session metrics (Time, Lifetime trends).
- **Middle:** Visual breakdowns of topics and criteria (areas to improve).
- **Bottom:** Detailed, tabular or list-based view of individual questions and
  timing data, expanding natively within the page instead of being hidden behind
  tabs.

## Key States

- **Default/Complete:** Full dashboard populated with session data.
- **Perfect Score:** Subtle, refined celebratory cues (e.g., a quiet glow or
  specific accent color) without gamification.
- **Low Score:** Focused heavily on "Areas to improve" and "Weak topics" with an
  encouraging, actionable tone.
- **Empty/Aborted:** Graceful handling of empty charts or 0s if a session ends
  prematurely.

## Interaction Model

Vertical scroll as the primary navigation through the data hierarchy. Hover
states on question rows or charts to reveal more detail. Quick access to "Review
Answers" or "New Session" via a sticky footer.

## Content Requirements

- **Hero metrics:** Score, Accuracy %, Elapsed Time.
- **Analytics:** Lifetime accuracy, trend chart, written vs. MC averages.
- **Session breakdowns:** Topics covered, criteria weak spots (with marks lost).
- **Question details:** Q#, Topic/Subtopic, Correct/Incorrect, Score, Time used
  vs Limit.
- **Actions:** Review Answers, Start Over.

## Recommended References

- `spatial-design.md`: For the fullscreen grid layout, 4pt spacing scale, and
  container queries.
- `typography.md`: For establishing a clear hierarchy in the dense stat grid and
  tabular data.
- `color-and-contrast.md`: For semantic colors (success/warning/error) that
  align with the brand hue.
