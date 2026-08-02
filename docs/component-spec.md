# QuestionGen 2.0 — Atomic Component Library Specification

> **Status**: Draft  
> **Scope**: All reusable UI primitives and composite components for the redesign.

---

## Table of Contents

1. [Design Tokens Reference](#1-design-tokens-reference)
2. [Atomic Components (src/components/ui/)](#2-atomic-components)
3. [Layout Components (src/components/layout/)](#3-layout-components)
4. [Composite Components](#4-composite-components)
5. [Component Patterns & Conventions](#5-component-patterns--conventions)

---

## 1. Design Tokens Reference

All components consume these CSS custom properties. No hardcoded values.

### Surface Colors

```css
--surface-primary: #ffffff;
--surface-secondary: #f7f7f5;
--surface-tertiary: #f1f1ef;
--surface-hover: rgba(55, 53, 47, 0.06);
--surface-active: rgba(55, 53, 47, 0.1);
--surface-overlay: rgba(0, 0, 0, 0.4);
```

### Text Colors

```css
--text-primary: #37352f;
--text-secondary: #6b6b67;
--text-tertiary: #9fa6b2;
--text-inverted: #ffffff;
--text-accent: #2563eb;
--text-danger: #dc2626;
--text-success: #16a34a;
--text-warning: #ca8a04;
```

### Accent Colors

```css
--accent-primary: #2563eb;
--accent-hover: #1d4ed8;
--accent-subtle: rgba(37, 99, 235, 0.1);
--accent-border: rgba(37, 99, 235, 0.3);
```

### Border Colors

```css
--border-subtle: #e3e2e0;
--border-hover: #d1d1cf;
--border-focus: #2563eb;
--border-danger: #fca5a5;
```

### Shadows

```css
--shadow-sm: 0 1px 2px rgba(0,0,0,0.04);
--shadow-md: 0 4px 6px rgba(0,0,0,0.04), 0 1px 3px rgba(0,0,0,0.08);
--shadow-lg: 0 12px 24px rgba(0,0,0,0.08);
--shadow-xl: 0 24px 48px rgba(0,0,0,0.12);
```

### Spacing

```css
--space-1: 4px;   --space-2: 8px;   --space-3: 12px;
--space-4: 16px;  --space-5: 20px;  --space-6: 24px;
--space-8: 32px;  --space-10: 40px; --space-12: 48px;
```

### Typography

```css
--font-sans: 'Spline Sans Variable', system-ui, sans-serif;
--font-mono: 'JetBrains Mono Variable', monospace;

--text-3xl: 30px; --text-2xl: 24px; --text-xl: 20px;
--text-lg: 18px;  --text-base: 16px; --text-sm: 14px;
--text-xs: 12px;
```

### Radius

```css
--radius-sm: 4px; --radius-md: 6px; --radius-lg: 8px; --radius-full: 9999px;
```

---

## 2. Atomic Components

Each component follows this pattern:
- ForwardRef for ref support
- `className` prop for style overrides (via `cn()` utility)
- Polymorphic `as` prop where appropriate
- Compound component pattern for complex pieces (Tabs, Dialog)

### 2.1 Button

**File:** `src/components/ui/button.tsx`

```typescript
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'link';
  size?: 'sm' | 'md' | 'lg' | 'icon';
  loading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}
```

**Variants:**

| Variant | Background | Text | Border | Hover |
|---------|-----------|------|--------|-------|
| `primary` | `accent-primary` | `text-inverted` | none | `accent-hover` |
| `secondary` | `surface-secondary` | `text-primary` | `border-subtle` | `surface-hover` |
| `ghost` | transparent | `text-primary` | none | `surface-hover` |
| `danger` | `text-danger` | `text-inverted` | none | darken 10% |
| `link` | transparent | `accent-primary` | none | underline |

**Sizes:**

| Size | Height | Padding | Font |
|------|--------|---------|------|
| `sm` | 32px | 0 12px | `text-xs` |
| `md` | 40px | 0 16px | `text-sm` |
| `lg` | 48px | 0 24px | `text-base` |
| `icon` | 32px | 0 | — |

**States:**
- `loading`: Spinner replaces left icon, disabled cursor
- `disabled`: Opacity 0.5, no hover
- Focus: `ring-2 ring-accent-primary ring-offset-2`

**Usage:**
```tsx
<Button variant="primary" size="lg" leftIcon={<Sparkles />}>Generate</Button>
<Button variant="ghost" size="icon"><Settings /></Button>
<Button loading>Processing...</Button>
```

---

### 2.2 Input

**File:** `src/components/ui/input.tsx`

```typescript
interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  fullWidth?: boolean;
}
```

**Design:**
- Height: 40px (md), 36px (sm)
- Background: `surface-primary`
- Border: 1px solid `border-subtle`, radius `radius-md`
- Padding: 0 `space-3`, with icon: left padding `space-10`
- Focus: border `border-focus`, subtle shadow
- Error: border `text-danger`, error text below in `text-danger` `text-xs`
- Label: `text-sm` `text-secondary`, above input, `space-1` gap
- Hint: `text-xs` `text-tertiary`, below input

**States:**
- Default: `border-subtle`
- Hover: `border-hover`
- Focus: `border-focus`, `shadow-sm`
- Error: `border-danger`, red left border accent (3px)
- Disabled: opacity 0.5, `surface-tertiary` bg

**Usage:**
```tsx
<Input label="Subject" placeholder="e.g. Mathematical Methods" />
<Button>Connect ChatGPT</Button>
<Input leftIcon={<Search />} placeholder="Search questions..." />
```

---

### 2.3 Textarea

**File:** `src/components/ui/textarea.tsx`

Same props as Input (minus type). Auto-resize optional via `autoResize` prop.

- Min-height: 80px
- Resize: vertical only
- Same border/focus/error states as Input

---

### 2.4 Select

**File:** `src/components/ui/select.tsx`

```typescript
interface SelectOption {
  value: string;
  label: string;
  icon?: React.ReactNode;
  disabled?: boolean;
}

interface SelectProps {
  options: SelectOption[];
  value?: string;
  onChange: (value: string) => void;
  placeholder?: string;
  label?: string;
  error?: string;
  searchable?: boolean;
  disabled?: boolean;
}
```

**Design:**
- Trigger: same dimensions/styling as Input
- Dropdown: `shadow-lg`, `radius-lg`, `surface-primary`, max-height 300px with scroll
- Option hover: `surface-hover`
- Selected option: `accent-subtle` background, `text-accent` text
- Searchable: filterable input at top of dropdown
- Empty state: "No results" in `text-tertiary`

**Animation:** Dropdown fades in (150ms) + slight translateY(-4px → 0)

**Usage:**
```tsx
<Select
  label="Subject"
  options={[{ value: 'methods', label: 'Mathematical Methods' }]}
  value={subject}
  onChange={setSubject}
/>
```

---

### 2.5 Slider

**File:** `src/components/ui/slider.tsx`

```typescript
interface SliderProps {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
  label?: string;
  showValue?: boolean;
  valueFormatter?: (value: number) => string;
}
```

**Design:**
- Track height: 4px, `surface-tertiary`, radius full
- Fill: `accent-primary`, radius full
- Thumb: 16px circle, `surface-primary`, border 2px `accent-primary`, shadow-sm
- Thumb hover: scale 1.1
- Active thumb: `shadow-md`
- Label + value on same row, value right-aligned in `text-sm` `text-secondary`

**Usage:**
```tsx
<Slider
  label="Multiple Choice"
  value={mcCount}
  min={0} max={10}
  showValue
  valueFormatter={(v) => `${v} questions`}
/>
```

---

### 2.6 Switch

**File:** `src/components/ui/switch.tsx`

```typescript
interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  description?: string;
  disabled?: boolean;
}
```

**Design:**
- Track: 36px wide × 20px tall, radius full
- Off: `surface-tertiary`, border `border-subtle`
- On: `accent-primary`
- Thumb: 16px circle, white, shadow-sm
- Transition: 150ms ease
- Label: `text-sm` `text-primary` to the right
- Description: `text-xs` `text-tertiary` below label

**Usage:**
```tsx
<Switch
  label="Enable diversity"
  description="Ensure varied question types and approaches"
  checked={diversityEnabled}
  onChange={setDiversityEnabled}
/>
```

---

### 2.7 Checkbox

**File:** `src/components/ui/checkbox.tsx`

```typescript
interface CheckboxProps {
  checked: boolean | 'indeterminate';
  onChange: (checked: boolean) => void;
  label?: string;
  disabled?: boolean;
}
```

**Design:**
- Box: 16px × 16px, radius `radius-sm`, border 1.5px `border-subtle`
- Checked: `accent-primary` fill, white checkmark (Lucide Check, 12px)
- Indeterminate: `accent-primary` fill, white horizontal line
- Hover: border darkens
- Label: `text-sm` `text-primary`, `space-2` gap from box

**Usage:**
```tsx
<Checkbox checked={selected} onChange={toggle} label="Functions and graphs" />
```

---

### 2.8 RadioGroup

**File:** `src/components/ui/radio-group.tsx`

```typescript
interface RadioOption {
  value: string;
  label: string;
  description?: string;
}

interface RadioGroupProps {
  options: RadioOption[];
  value: string;
  onChange: (value: string) => void;
  label?: string;
  direction?: 'vertical' | 'horizontal';
}
```

**Design:**
- Circle: 16px diameter, border 1.5px `border-subtle`
- Selected: inner 8px circle `accent-primary`
- Hover: border darkens
- Options spaced `space-3` apart
- Horizontal: flex row, `space-4` gap
- Description: `text-xs` `text-tertiary` below label

**Usage:**
```tsx
<RadioGroup
  label="Difficulty"
  options={[
    { value: 'easy', label: 'Easy' },
    { value: 'medium', label: 'Medium' },
    { value: 'hard', label: 'Hard' },
  ]}
  value={difficulty}
  onChange={setDifficulty}
/>
```

---

### 2.9 Badge

**File:** `src/components/ui/badge.tsx`

```typescript
interface BadgeProps {
  variant?: 'default' | 'accent' | 'success' | 'warning' | 'danger' | 'subtle';
  size?: 'sm' | 'md';
  children: React.ReactNode;
  dot?: boolean; // Shows colored dot before text
}
```

**Variants:**

| Variant | Background | Text | Border |
|---------|-----------|------|--------|
| `default` | `surface-secondary` | `text-primary` | `border-subtle` |
| `accent` | `accent-subtle` | `text-accent` | `accent-border` |
| `success` | rgba(22,163,74,0.1) | `#16a34a` | rgba(22,163,74,0.2) |
| `warning` | rgba(202,138,4,0.1) | `#ca8a04` | rgba(202,138,4,0.2) |
| `danger` | rgba(220,38,38,0.1) | `#dc2626` | rgba(220,38,38,0.2) |
| `subtle` | transparent | `text-secondary` | none |

**Sizes:**
- `sm`: height 20px, padding 0 8px, `text-xs`
- `md`: height 24px, padding 0 10px, `text-xs`

**Usage:**
```tsx
<Badge variant="accent">Mathematical Methods</Badge>
<Badge variant="success" dot>Completed</Badge>
<Badge variant="subtle">12 questions</Badge>
```

---

### 2.10 Dialog (Modal)

**File:** `src/components/ui/dialog.tsx`

Compound component pattern:

```typescript
// Compound API
<Dialog>
  <Dialog.Trigger asChild>
    <Button>Open</Button>
  </Dialog.Trigger>
  <Dialog.Content>
    <Dialog.Header>
      <Dialog.Title>Title</Dialog.Title>
      <Dialog.Description>Description text</Dialog.Description>
    </Dialog.Header>
    <div>Content</div>
    <Dialog.Footer>
      <Button variant="secondary">Cancel</Button>
      <Button>Confirm</Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog>
```

**Design:**
- Backdrop: `surface-overlay`, blur 4px
- Content: `surface-primary`, `shadow-xl`, `radius-lg`, max-width 480px (sm), 640px (md), 900px (lg)
- Padding: `space-6`
- Header: title `text-xl` weight 600, description `text-sm` `text-secondary`
- Footer: flex row, right-aligned, `space-3` gap, top border `border-subtle`, padding-top `space-4`
- Close button: top-right `IconButton`, X icon

**Animation:** Backdrop fades in (200ms), content scales from 0.95 → 1 + fades (200ms, ease-out)

**Usage:**
```tsx
<Dialog>
  <Dialog.Trigger><Button>Delete</Button></Dialog.Trigger>
  <Dialog.Content size="sm">
    <Dialog.Header>
      <Dialog.Title>Confirm deletion</Dialog.Title>
      <Dialog.Description>This cannot be undone.</Dialog.Description>
    </Dialog.Header>
    <Dialog.Footer>
      <Button variant="ghost">Cancel</Button>
      <Button variant="danger">Delete</Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog>
```

---

### 2.11 Tooltip

**File:** `src/components/ui/tooltip.tsx`

```typescript
interface TooltipProps {
  content: React.ReactNode;
  children: React.ReactElement;
  side?: 'top' | 'bottom' | 'left' | 'right';
  align?: 'start' | 'center' | 'end';
  delay?: number; // ms before show, default 300
}
```

**Design:**
- Background: `text-primary` (dark)
- Text: `text-inverted` (white), `text-xs`
- Padding: `space-2` `space-3`
- Radius: `radius-md`
- Arrow: 6px, same background
- Max-width: 240px

**Animation:** Fade in 150ms, slight translate toward target

**Usage:**
```tsx
<Tooltip content="Estimated cost based on token count">
  <Button variant="ghost" size="icon"><Info /></Button>
</Tooltip>
```

---

### 2.12 Popover

**File:** `src/components/ui/popover.tsx`

```typescript
interface PopoverProps {
  trigger: React.ReactElement;
  children: React.ReactNode;
  side?: 'top' | 'bottom' | 'left' | 'right';
  align?: 'start' | 'center' | 'end';
  width?: number | 'trigger'; // 'trigger' matches trigger width
}
```

**Design:**
- Background: `surface-primary`
- Border: 1px `border-subtle`
- Shadow: `shadow-lg`
- Radius: `radius-lg`
- Padding: `space-3`
- Max-height: 400px with scroll

**Animation:** Same as Select dropdown

**Usage:**
```tsx
<Popover trigger={<Button>Filters</Button>} width={280}>
  <div>Filter content here</div>
</Popover>
```

---

### 2.13 Dropdown Menu

**File:** `src/components/ui/dropdown-menu.tsx`

Compound component:

```typescript
<DropdownMenu>
  <DropdownMenu.Trigger asChild>
    <Button>...</Button>
  </DropdownMenu.Trigger>
  <DropdownMenu.Content>
    <DropdownMenu.Item onSelect={...}>Action</DropdownMenu.Item>
    <DropdownMenu.Separator />
    <DropdownMenu.Item disabled>Disabled</DropdownMenu.Item>
    <DropdownMenu.Sub>
      <DropdownMenu.SubTrigger>Submenu</DropdownMenu.SubTrigger>
      <DropdownMenu.SubContent>
        <DropdownMenu.Item>Nested</DropdownMenu.Item>
      </DropdownMenu.SubContent>
    </DropdownMenu.Sub>
  </DropdownMenu.Content>
</DropdownMenu>
```

**Design:**
- Same as Popover for container
- Item height: 36px, padding 0 `space-3`
- Item hover: `surface-hover`
- Item focus: `surface-active`
- Item with icon: icon left, `space-3` gap, `text-secondary`
- Separator: 1px `border-subtle`, margin `space-1` 0
- Shortcut: right-aligned, `text-xs` `text-tertiary`, monospace

**Usage:**
```tsx
<DropdownMenu>
  <DropdownMenu.Trigger asChild>
    <Button variant="ghost" size="icon"><MoreHorizontal /></Button>
  </DropdownMenu.Trigger>
  <DropdownMenu.Content>
    <DropdownMenu.Item onSelect={handleEdit}>Edit</DropdownMenu.Item>
    <DropdownMenu.Item onSelect={handleDuplicate}>Duplicate</DropdownMenu.Item>
    <DropdownMenu.Separator />
    <DropdownMenu.Item variant="danger" onSelect={handleDelete}>Delete</DropdownMenu.Item>
  </DropdownMenu.Content>
</DropdownMenu>
```

---

### 2.14 Tabs

**File:** `src/components/ui/tabs.tsx`

```typescript
interface TabsProps {
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
}

interface TabsListProps {
  children: React.ReactNode;
}

interface TabsTriggerProps {
  value: string;
  children: React.ReactNode;
}

interface TabsContentProps {
  value: string;
  children: React.ReactNode;
}
```

**Design:**
- List: flex row, `space-1` gap, bottom border `border-subtle`
- Trigger: padding `space-2` `space-3`, `text-sm` `text-secondary`
- Active trigger: `text-primary`, bottom border 2px `accent-primary`
- Hover: `text-primary`
- Content: padding-top `space-4`

**Animation:** Content fades in 150ms

**Usage:**
```tsx
<Tabs value={tab} onChange={setTab}>
  <Tabs.List>
    <Tabs.Trigger value="generator">Generator</Tabs.Trigger>
    <Tabs.Trigger value="history">History</Tabs.Trigger>
  </Tabs.List>
  <Tabs.Content value="generator">...</Tabs.Content>
  <Tabs.Content value="history">...</Tabs.Content>
</Tabs>
```

---

### 2.15 Accordion

**File:** `src/components/ui/accordion.tsx`

```typescript
interface AccordionProps {
  type?: 'single' | 'multiple';
  value?: string | string[];
  onChange?: (value: string | string[]) => void;
  children: React.ReactNode;
}

interface AccordionItemProps {
  value: string;
  children: React.ReactNode;
}

interface AccordionTriggerProps {
  children: React.ReactNode;
}

interface AccordionContentProps {
  children: React.ReactNode;
}
```

**Design:**
- Trigger: full width, padding `space-3` 0, flex between
- Trigger text: `text-sm` `text-primary`, weight 500
- Chevron icon right, rotates 180° when open
- Content: padding `space-3` 0, `text-sm` `text-secondary`
- Border: bottom `border-subtle` per item

**Animation:** Content height animates 200ms ease, chevron rotates

**Usage:**
```tsx
<Accordion type="single">
  <Accordion.Item value="advanced">
    <Accordion.Trigger>Advanced options</Accordion.Trigger>
    <Accordion.Content>
      <div>Model selection, cost limits...</div>
    </Accordion.Content>
  </Accordion.Item>
</Accordion>
```

---

### 2.16 Separator

**File:** `src/components/ui/separator.tsx`

```typescript
interface SeparatorProps {
  orientation?: 'horizontal' | 'vertical';
  decorative?: boolean;
}
```

**Design:**
- Horizontal: 1px height, full width, `border-subtle`
- Vertical: 1px width, full height, `border-subtle`

**Usage:**
```tsx
<Separator />
<Separator orientation="vertical" />
```

---

### 2.17 ScrollArea

**File:** `src/components/ui/scroll-area.tsx`

```typescript
interface ScrollAreaProps {
  children: React.ReactNode;
  className?: string;
  horizontal?: boolean;
}
```

**Design:**
- Custom scrollbar: 8px wide, `radius-full`
- Track: transparent
- Thumb: `text-tertiary` at 30% opacity, hover 50%
- Mac-style overlay scrollbars (hidden until scroll/hover)

**Usage:**
```tsx
<ScrollArea className="h-[400px]">
  <div>Long content...</div>
</ScrollArea>
```

---

### 2.18 Skeleton

**File:** `src/components/ui/skeleton.tsx`

```typescript
interface SkeletonProps {
  className?: string;
  circle?: boolean; // For avatar/profile images
}
```

**Design:**
- Background: `surface-tertiary`
- Animation: Shimmer gradient sweep, 1.5s infinite
- Default: rectangle with `radius-md`
- Circle: `radius-full`, width = height

**Usage:**
```tsx
<div className="space-y-2">
  <Skeleton className="h-4 w-[250px]" />
  <Skeleton className="h-4 w-[200px]" />
</div>
<Skeleton circle className="h-10 w-10" />
```

---

### 2.19 Toast

**File:** `src/components/ui/toast.tsx`

```typescript
interface ToastProps {
  id: string;
  title: string;
  description?: string;
  variant?: 'default' | 'success' | 'error' | 'warning';
  duration?: number; // ms, default 5000
  onDismiss: (id: string) => void;
}
```

**Design:**
- Container: fixed bottom-right, `space-3` gap between toasts
- Toast: `surface-primary`, `shadow-lg`, `radius-lg`, padding `space-4`
- Icon left: Check (success), XCircle (error), AlertTriangle (warning), Info (default)
- Title: `text-sm` weight 500
- Description: `text-xs` `text-secondary`
- Dismiss: X button top-right
- Progress bar at bottom: indicates remaining duration

**Animation:** Slide in from right (300ms), slide out to right (200ms)

**Usage (via hook):**
```tsx
const toast = useToast();
toast.success("Questions generated!");
toast.error("Generation failed", { description: "Rate limited. Try again in 60s." });
```

---

### 2.20 Command Palette

**File:** `src/components/ui/command.tsx`

```typescript
interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  groups: CommandGroup[];
  placeholder?: string;
  emptyText?: string;
}

interface CommandGroup {
  heading: string;
  items: CommandItem[];
}

interface CommandItem {
  id: string;
  label: string;
  icon?: React.ReactNode;
  shortcut?: string;
  onSelect: () => void;
  disabled?: boolean;
}
```

**Design:**
- Backdrop: `surface-overlay`, blur 4px
- Container: centered, max-width 640px, `surface-primary`, `shadow-xl`, `radius-lg`
- Input: full-width, `text-lg`, no border, padding `space-4`
- Separator below input: `border-subtle`
- Groups: `text-xs` `text-tertiary` uppercase heading, padding `space-2` `space-4`
- Items: padding `space-3` `space-4`, flex between
- Selected item: `surface-hover`
- Shortcut: right-aligned, `text-xs` `text-tertiary`, `surface-secondary` bg, `radius-sm`, padding 2px 6px
- Empty state: centered `text-sm` `text-tertiary`, padding `space-8`

**Animation:** Same as Dialog

**Usage:**
```tsx
<CommandPalette
  open={open}
  onClose={() => setOpen(false)}
  placeholder="Type a command or search..."
  groups={[
    {
      heading: "Actions",
      items: [
        { id: "generate", label: "New study session", icon: <Plus />, shortcut: "⌘G", onSelect: ... },
        { id: "history", label: "View study log", icon: <History />, shortcut: "⌘H", onSelect: ... },
      ]
    }
  ]}
/>
```

---

### 2.21 Label

**File:** `src/components/ui/label.tsx`

```typescript
interface LabelProps extends React.LabelHTMLAttributes<HTMLLabelElement> {
  required?: boolean;
}
```

**Design:**
- `text-sm` `text-secondary`, weight 500
- Required asterisk: `text-danger`
- Margin-bottom: `space-1`

---

### 2.22 Calendar

**File:** `src/components/ui/calendar.tsx`

```typescript
interface CalendarProps {
  value?: Date;
  onChange: (date: Date) => void;
  minDate?: Date;
  maxDate?: Date;
  disabledDates?: Date[];
}
```

**Design:**
- Header: month/year navigation with chevrons
- Days: `text-sm`, 36px × 36px cells
- Today: `accent-subtle` circle
- Selected: `accent-primary` circle, white text
- Disabled: `text-tertiary`, strikethrough cursor
- Hover: `surface-hover`

---

### 2.23 DatePicker

**File:** `src/components/ui/date-picker.tsx`

Composes Input + Popover + Calendar.

```typescript
interface DatePickerProps {
  value?: Date;
  onChange: (date: Date) => void;
  label?: string;
  placeholder?: string;
  format?: string; // default: "MMM d, yyyy"
}
```

**Usage:**
```tsx
<DatePicker
  label="Start date"
  value={startDate}
  onChange={setStartDate}
/>
```

---

### 2.24 Avatar

**File:** `src/components/ui/avatar.tsx`

```typescript
interface AvatarProps {
  src?: string;
  fallback: string; // Initials or icon
  size?: 'sm' | 'md' | 'lg';
}
```

**Design:**
- `sm`: 24px, `md`: 32px, `lg`: 40px
- Circle, `radius-full`
- Fallback: `surface-secondary` bg, `text-secondary`, `text-xs`, centered

---

### 2.25 ContextMenu

**File:** `src/components/ui/context-menu.tsx`

Same API and design as DropdownMenu, but triggered on right-click.

---

## 3. Layout Components

### 3.1 AppShell

**File:** `src/components/layout/AppShell.tsx`

```typescript
interface AppShellProps {
  children: React.ReactNode;
}
```

**Structure:**
```
<div className="flex h-screen w-screen overflow-hidden">
  <Sidebar />
  <main className="flex-1 flex flex-col min-w-0">
    <Header />
    <div className="flex-1 overflow-auto">{children}</div>
  </main>
</div>
```

### 3.2 Sidebar

**File:** `src/components/layout/Sidebar.tsx`

**States:**
- Expanded: 240px width
- Collapsed: 64px width (icons only)
- Persistent preference in `ui-slice`

**Sections:**
1. **Logo area** — App icon + name (hidden when collapsed)
2. **Navigation** — Main views with icons
3. **Quick access** — Recent sessions / favorites
4. **Footer** — Settings, theme toggle, collapse button

**Active item:** `accent-subtle` background, `text-accent` icon

**Hover item:** `surface-hover`

### 3.3 Header

**File:** `src/components/layout/Header.tsx`

**Content:**
- Left: Breadcrumb (current view context)
- Center: Search bar (quick find)
- Right: Actions specific to current view + user menu

**Design:**
- Height: 56px
- Border-bottom: 1px `border-subtle`
- Background: `surface-primary`

### 3.4 CommandPalette (Global)

**File:** `src/components/layout/CommandPalette.tsx`

Wraps the `ui/command.tsx` primitive with app-specific commands:
- Navigation between views
- Quick actions (new session, open recent)
- Search questions by text
- Settings toggles

**Keyboard shortcut:** `Cmd/Ctrl + K`

---

## 4. Composite Components

### 4.1 QuestionCard

**File:** `src/components/question/QuestionCard.tsx`

```typescript
interface QuestionCardProps {
  question: Question;
  showAnswer?: boolean;
  showMarking?: boolean;
  onMarkAsKnown?: () => void;
  onFlagForReview?: () => void;
  className?: string;
}
```

**Design:**
- Background: `surface-primary`
- Border: 1px `border-subtle`, `radius-lg`
- Padding: `space-6`
- Header row: Question number + type badge + difficulty badge + alignment score
- Body: MathJax-rendered question text
- Footer: Action buttons (Show answer, Flag)
- Expandable answer section with animation

### 4.2 SessionComposer

**File:** `src/components/generator/SessionComposer.tsx`

The main generator form. Composes:
- `Select` (Subject)
- Custom subtopic picker (built on Checkbox + Popover)
- `Slider` × 3 (Question mix)
- `RadioGroup` (Difficulty)
- `Accordion` (Advanced options)
- `Button` (Generate)
- `CostEstimator` (inline)

### 4.3 StudyLogTable

**File:** `src/components/study-log/StudyLogTable.tsx`

Database-style table. Composes:
- Custom table primitives (or simple div grid)
- `Badge` for subjects
- `Button` variant ghost for actions
- `DropdownMenu` for row actions
- `Skeleton` rows for loading

### 4.4 StatCard

**File:** `src/components/insights/StatCard.tsx`

```typescript
interface StatCardProps {
  title: string;
  value: string | number;
  change?: { value: number; positive: boolean }; // e.g. +12%
  icon: React.ReactNode;
  chart?: React.ReactNode; // Mini sparkline
}
```

**Design:**
- Background: `surface-primary`
- Border: 1px `border-subtle`, `radius-lg`
- Padding: `space-5`
- Icon: top-right, `text-tertiary`
- Value: `text-2xl` weight 600
- Title: `text-sm` `text-secondary`
- Change: `text-xs`, green/red color

---

## 5. Component Patterns & Conventions

### 5.1 File Naming

- All components: PascalCase filename matching export name
- `index.ts` barrel exports in `ui/`, `layout/`, etc.

### 5.2 Styling

- Use Tailwind utility classes exclusively
- Reference design tokens via CSS variables (e.g., `bg-[var(--surface-primary)]`)
- Use `cn()` utility (clsx + tailwind-merge) for conditional classes
- Never use `style={{}}` prop
- Prefer `gap` over margin for spacing within components

### 5.3 Props

- Extend appropriate HTML element types
- Always include `className` for overrides
- Use `React.ReactNode` for children/content props
- Use discriminated unions for variant props

### 5.4 Accessibility

- All interactive elements keyboard-focusable
- Proper ARIA attributes on complex components (tabs, dialogs, menus)
- Focus rings visible and consistent (`ring-2 ring-accent-primary ring-offset-2`)
- Color contrast meets WCAG AA minimums

### 5.5 Animation Defaults

| Type | Duration | Easing |
|------|----------|--------|
| Fade | 150ms | ease |
| Scale (dialog) | 200ms | ease-out |
| Slide | 200–300ms | cubic-bezier(0.16, 1, 0.3, 1) |
| Layout | 300ms | ease-in-out |
| Hover | 150ms | ease |

### 5.6 Icons

- Source: **Lucide React** exclusively
- Size mapping: `sm` → 14px, `md` → 16px, `lg` → 20px, `xl` → 24px
- Color: inherit from parent text color
- Stroke width: default (2)

---

## Component Checklist

### Phase 1 (Foundation)
- [ ] Button
- [ ] Input
- [ ] Textarea
- [ ] Label
- [ ] Select
- [ ] Dialog
- [ ] Tooltip
- [ ] Badge
- [ ] Skeleton
- [ ] Toast
- [ ] Separator
- [ ] ScrollArea
- [ ] Switch
- [ ] Checkbox
- [ ] AppShell
- [ ] Sidebar
- [ ] Header

### Phase 2 (Core Views)
- [ ] Slider
- [ ] RadioGroup
- [ ] Accordion
- [ ] Tabs
- [ ] Popover
- [ ] DropdownMenu
- [ ] CommandPalette (primitive)
- [ ] Calendar
- [ ] DatePicker
- [ ] Avatar
- [ ] ContextMenu
- [ ] QuestionCard
- [ ] SessionComposer

### Phase 3 (Supporting Views)
- [ ] StudyLogTable
- [ ] StatCard
- [ ] CommandPalette (global)
