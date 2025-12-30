# Phase 2: Requirements (Weeks 3-5)

## Objective

Transform domain understanding into structured user stories with formal acceptance criteria optimized for AI code generation.

## Deliverables

### 1. User Stories v1 (5-10 per sprint)

Structured stories with AI-consumable metadata.

**Template**:

```markdown
## US-[ID]: [Title]

**As** [persona]
**I want** [action/goal]
**so that** [benefit/value]

**Priority:** [High | Medium | Low]
**Story Points:** [estimate]
**Related BC:** [Bounded Context names]

### Acceptance Criteria

**AC-1: [Scenario name]**
```
Given: [preconditions]
When: [action]
Then: [expected outcome]
And: [additional outcomes]
```

**AC-2: [Error scenario]**
```
Given: [preconditions]
When: [invalid action]
Then: [error handling]
```

### Formal Constraints
```
∀ [variable] ∈ [domain]:
  [predicate] → [consequence]
```

### AI Prompt Template
**Template ID:** [template reference]
**Required Context:** [glossary, domain model, etc.]
```

**Example**:

```markdown
## US-001: Customer Places Order

**As** a retail customer
**I want** to place an order for multiple items
**so that** I can purchase products in bulk with discounts

**Priority:** High
**Story Points:** 8
**Related BC:** OrderBC, InventoryBC, BillingBC

### Acceptance Criteria

**AC-1: Successful order placement**
```
Given: Customer is authenticated and has items in cart
When: Customer clicks "Place Order" and confirms payment
Then: Order is created with status "pending"
And: Confirmation email is sent to customer
And: Inventory items are reserved
```

**AC-2: Insufficient inventory handling**
```
Given: Some items in cart are out of stock
When: Customer attempts to place order
Then: Error message "Item [name] is unavailable" is shown
And: Customer can remove item and retry
```

**AC-3: Credit limit exceeded**
```
Given: Order total exceeds customer credit limit
When: Customer submits order
Then: Error message "Credit limit exceeded" is shown
And: Order is not created
```

### Formal Constraints
```
∀ customer ∈ Customer, items ∈ OrderItem[]:
  (authenticated(customer) ∧ inventory_available(items))
  → (status = "pending" ∧ email_sent)

∀ item ∈ OrderItem:
  quantity > 0 ∧ price > 0
```

### AI Prompt Template
**Template ID:** user_story_with_formal_ac_v1
**Required Context:** glossary.yaml, context-map.md
```

### 2. Acceptance Criteria (Formal + Natural Language)

Each AC must have:
- Natural language Given-When-Then format (human readable)
- Formal constraint notation (machine verifiable)

**Formal Notation Guide**:

| Symbol | Meaning | Example |
|--------|---------|---------|
| ∀ | For all | ∀ order ∈ Order |
| ∃ | There exists | ∃ item where available |
| ∧ | AND | a ∧ b |
| ∨ | OR | a ∨ b |
| → | Implies | condition → result |
| ¬ | NOT | ¬cancelled |

### 3. Feature Breakdown & Dependencies

Hierarchical decomposition of features.

**Template**:

```markdown
# Feature Breakdown

## Epic: [Epic Name]

### Feature: F1 - [Feature Name]
**Description:** [Brief description]
**Dependencies:** [Other features or external systems]
**Priority:** [P0 | P1 | P2]

#### User Stories
- US-001: [Story title] (Must have)
- US-002: [Story title] (Must have)
- US-003: [Story title] (Nice to have)

### Feature: F2 - [Feature Name]
**Dependencies:** F1 (partial)
...
```

**Example**:

```markdown
# Feature Breakdown

## Epic: E-commerce Order Management

### Feature: F1 - Order Creation
**Description:** Enable customers to create and submit orders
**Dependencies:** Authentication system, Product catalog
**Priority:** P0

#### User Stories
- US-001: Customer places order (Must have)
- US-002: Add items to order (Must have)
- US-003: Apply discount codes (Nice to have)

### Feature: F2 - Inventory Management
**Description:** Track and reserve inventory for orders
**Dependencies:** F1 (OrderPlaced event)
**Priority:** P0

#### User Stories
- US-004: Check stock availability (Must have)
- US-005: Reserve items for order (Must have)
- US-006: Release reservation on cancel (Must have)

### Feature: F3 - Order Tracking
**Description:** Allow customers to track order status
**Dependencies:** F1, Shipping integration
**Priority:** P1

#### User Stories
- US-007: View order status (Must have)
- US-008: Receive status notifications (Nice to have)
```

## AI-Assisted Generation

### User Story Generation Prompt

```
Context:
- Domain Vision: [URL to vision.md]
- Glossary: [URL to glossary.yaml]
- Context Map: [URL to context-map.md]
- Feature: [Feature name and description]

Task:
Generate 5-8 user stories for the "[Feature Name]" feature.

Requirements:
1. Each story follows: "As a [persona], I want [action] so that [benefit]"
2. Use ONLY terms from the provided glossary
3. Include 2-3 acceptance criteria per story in Given-When-Then format
4. Include formal constraints using predicate logic notation
5. Assign priority (High/Medium/Low) and story points (1-13)

Output Format:
[Use the US-XXX template structure]
```

### AC Refinement Prompt

```
Context:
- User Story: [paste story]
- Domain Model: [if available]
- Current AC: [paste current acceptance criteria]

Task:
Refine and expand the acceptance criteria with:
1. Edge cases (boundary conditions)
2. Error conditions (invalid inputs, system failures)
3. Formal constraints (predicate logic)
4. Integration points with other Bounded Contexts

Output Format:
### Refined Acceptance Criteria
[Given-When-Then blocks with formal constraints]
```

## Validation Checklist

Before proceeding to Phase 3:

- [ ] User Stories created (5-10 per sprint, 15-20 total)
- [ ] Each story has 2+ acceptance criteria
- [ ] Formal constraints defined for critical paths
- [ ] All terms in stories exist in glossary
- [ ] Feature breakdown shows dependencies
- [ ] Stories prioritized and estimated
- [ ] PO has reviewed and approved stories
- [ ] AC satifiability checked (no contradictions)

## Validation Script

```python
def validate_user_stories(stories, glossary):
    errors = []
    for story in stories:
        # Check glossary term usage
        terms_used = extract_terms(story)
        undefined = [t for t in terms_used if t not in glossary]
        if undefined:
            errors.append(f"US-{story.id}: Undefined terms: {undefined}")
        
        # Check AC completeness
        if len(story.acceptance_criteria) < 2:
            errors.append(f"US-{story.id}: Needs at least 2 ACs")
        
        # Check formal constraint presence
        if not story.formal_constraints:
            errors.append(f"US-{story.id}: Missing formal constraints")
    
    return errors
```

## Common Issues

| Issue | Solution |
|-------|----------|
| Stories too large | Split by AC; each AC could be a story |
| Missing error scenarios | Add AC for each failure mode |
| Ambiguous terms | Cross-reference with glossary |
| No formal constraints | Start with happy path, add ∀ and → |

## Output Artifacts Location

```
project-repo/
└── requirements/
    ├── user-stories.md       ← All stories in one file
    ├── feature-breakdown.md  ← Epic/Feature hierarchy
    └── features/
        ├── order-creation.md ← Feature-specific stories
        ├── inventory-mgmt.md
        └── order-tracking.md
```
