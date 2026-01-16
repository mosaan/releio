# UI Component Selection for Provider Configuration Tabs

## Context

For Issue #10 implementation, we need to create a tabbed interface to organize AI provider configurations (OpenAI, Anthropic, Google, Azure). This document evaluates different UI implementation approaches.

## Requirement

Display 4 provider configurations in a user-friendly tabbed interface with:
- Clear visual separation between providers
- Keyboard navigation support
- Accessibility (ARIA labels, screen reader support)
- Consistent with existing UI design

## Options Evaluated

### Option 1: Radix UI Tabs (Current Implementation)

**Implementation**: Use `@radix-ui/react-tabs` with shadcn/ui styling

**Pros**:
- ✅ Consistent with existing architecture (other components use Radix UI)
- ✅ Built-in accessibility (WAI-ARIA compliant)
- ✅ Keyboard navigation out-of-the-box (Arrow keys, Tab, Enter)
- ✅ Well-tested and maintained library
- ✅ Matches shadcn/ui design patterns
- ✅ Minimal custom code required

**Cons**:
- ❌ Adds new dependency (@radix-ui/react-tabs ~12KB gzipped)
- ❌ Slightly more complex component tree

**Code Example**:
```tsx
<Tabs defaultValue="openai">
  <TabsList>
    <TabsTrigger value="openai">OpenAI</TabsTrigger>
    <TabsTrigger value="anthropic">Anthropic</TabsTrigger>
    {/* ... */}
  </TabsList>
  <TabsContent value="openai">{/* Config form */}</TabsContent>
</Tabs>
```

**Dependencies Added**:
- @radix-ui/react-tabs: ^1.1.13

---

### Option 2: Custom Implementation with Existing Card Components

**Implementation**: Use existing Card + Button components with React state

**Pros**:
- ✅ No new dependencies
- ✅ Full control over behavior and styling
- ✅ Uses familiar existing components

**Cons**:
- ❌ Must manually implement keyboard navigation
- ❌ Must manually implement ARIA attributes for accessibility
- ❌ More custom code to maintain (~100-150 lines)
- ❌ Potential accessibility issues if not implemented correctly
- ❌ Inconsistent with shadcn/ui component patterns

**Code Example**:
```tsx
const [activeTab, setActiveTab] = useState('openai')

<div>
  <div className="flex gap-2 mb-4">
    <Button
      variant={activeTab === 'openai' ? 'default' : 'outline'}
      onClick={() => setActiveTab('openai')}
      aria-selected={activeTab === 'openai'}
      role="tab"
    >
      OpenAI
    </Button>
    {/* More buttons... */}
  </div>

  <Card style={{ display: activeTab === 'openai' ? 'block' : 'none' }}>
    {/* OpenAI config */}
  </Card>
  {/* More cards... */}
</div>
```

**Estimated Code**: ~150 lines for proper keyboard nav + accessibility

---

### Option 3: Pure CSS Accordion (No Tabs)

**Implementation**: Use `<details>` and `<summary>` HTML elements with CSS styling

**Pros**:
- ✅ No dependencies
- ✅ Native HTML semantic elements
- ✅ Allows multiple sections open simultaneously

**Cons**:
- ❌ Different UX pattern (accordion vs tabs)
- ❌ Not suitable for mutually exclusive content
- ❌ Less intuitive for switching between providers
- ❌ User explicitly said tabs were preferred over accordion

**Not Recommended**: User requirements favor tabs over accordion pattern.

---

### Option 4: Single Page Form with Section Headers

**Implementation**: One long scrollable form with section dividers

**Pros**:
- ✅ Simplest implementation
- ✅ All settings visible at once
- ✅ No state management needed

**Cons**:
- ❌ Poor UX with 4 providers (too much scrolling)
- ❌ Cluttered interface
- ❌ Doesn't meet "tabbed interface" requirement from Issue #10
- ❌ Hard to focus on one provider at a time

**Not Recommended**: Doesn't meet stated requirements.

---

## Existing Architecture Analysis

Current codebase already uses Radix UI primitives:
```json
"@radix-ui/react-label": "^2.1.7",
"@radix-ui/react-select": "^2.2.5",
"@radix-ui/react-slot": "^1.2.3",
"@radix-ui/react-tooltip": "^1.2.7"
```

All shadcn/ui components (Button, Card, Select, Input, Dialog) are built on Radix UI foundations. Adding `@radix-ui/react-tabs` maintains this consistency.

## Bundle Size Impact

| Option | New Dependencies | Approximate Size |
|--------|-----------------|------------------|
| Radix UI Tabs | @radix-ui/react-tabs | ~12KB gzipped |
| Custom Card-based | None | 0KB (but ~150 lines custom code) |
| Pure CSS Accordion | None | 0KB |
| Single Page Form | None | 0KB |

## Accessibility Comparison

| Feature | Radix Tabs | Custom Implementation | Pure CSS |
|---------|------------|----------------------|----------|
| ARIA roles | ✅ Built-in | ❌ Must implement | ⚠️ Limited |
| Keyboard nav | ✅ Arrow keys, Tab | ❌ Must implement | ⚠️ Basic only |
| Screen reader | ✅ Fully supported | ⚠️ Depends on impl | ⚠️ Limited |
| Focus management | ✅ Automatic | ❌ Must implement | ❌ Manual |

## Recommendation

**Selected: Option 1 - Radix UI Tabs**

### Rationale

1. **Consistency**: Aligns with existing architecture (all other components use Radix UI)
2. **Accessibility**: Production-ready ARIA implementation saves development time and reduces risk
3. **Maintenance**: Well-tested library reduces long-term maintenance burden
4. **Developer Experience**: Familiar pattern for developers already using shadcn/ui
5. **Bundle Size**: 12KB addition is acceptable for a desktop Electron app
6. **Time to Implementation**: Faster development compared to custom implementation

### Trade-offs Accepted

- **Dependency count**: +1 npm package
  - *Mitigation*: Already using Radix UI ecosystem, so incremental risk is low

- **Bundle size**: +12KB gzipped
  - *Mitigation*: Electron app context where bundle size is less critical than web apps

### Rejected Alternatives

- **Option 2 (Custom)**: While 0 dependencies is appealing, the accessibility and keyboard navigation implementation effort outweighs the benefits. Risk of incomplete accessibility support.

- **Option 3 (Accordion)**: User explicitly requested tabs, and accordion UX doesn't fit the "switch between providers" use case.

- **Option 4 (Single page)**: Doesn't meet requirements for focused, organized UI.

## Implementation Status

### Initial Implementation (Commit: 032d62f)
- ✅ Package installed: @radix-ui/react-tabs@1.1.13
- ✅ Tabs component manually created: src/renderer/src/components/ui/tabs.tsx

### Correction to shadcn/ui Standard (Commit: dce6bbe)
- ⚠️ **Issue Identified**: Initial Tabs component was custom implementation, not shadcn/ui standard
- ✅ **Corrected**: Replaced with shadcn/ui standard Tabs component via `pnpm run shadcn add tabs`
- ✅ **Result**: Now consistent with other UI components (Button, Card, Select, etc.)

### AISettings.tsx Integration (Commit: c1b3b0c)
- ✅ AISettings.tsx refactored to use Tabs component
- ✅ 4 provider tabs implemented (OpenAI, Anthropic, Google, Azure)
- ✅ Per-provider configuration forms with baseURL and Azure-specific fields
- ✅ Integration with AISettingsV2 API complete

### Final Implementation Notes
- **Component Source**: shadcn/ui standard component (New York style)
- **Base Library**: @radix-ui/react-tabs (via shadcn/ui)
- **Pattern Consistency**: Uses `data-slot` attributes and `cn()` helper, matching existing components
- **No Breaking Changes**: Interface remained compatible during shadcn migration

## References

- [Radix UI Tabs Documentation](https://www.radix-ui.com/primitives/docs/components/tabs)
- [shadcn/ui Tabs](https://ui.shadcn.com/docs/components/tabs)
- [WAI-ARIA Tabs Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/tabs/)
