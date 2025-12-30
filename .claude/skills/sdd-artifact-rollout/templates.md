# AI Prompt Templates

Reusable prompts for AI-assisted artifact generation across all phases.

## Phase 1: Foundation

### Template 1: Domain Vision Generation

```
Context:
- Industry: [e.g., e-commerce, healthcare, finance]
- Problem Statement: [What problem does this system solve?]
- Target Users: [Who will use this system?]
- Business Goals: [Key business objectives]

Task:
Generate a Domain Vision Statement with the following sections:
1. What - One paragraph describing the domain/system
2. Why - Business value and problems solved
3. Scope - IN/OUT boundaries (be explicit)
4. Success Metrics - 3-5 measurable targets
5. Key Stakeholders - Roles and responsibilities

Output Format: Markdown

Requirements:
- Keep total length under 2 pages
- Success metrics must be quantifiable
- Scope must explicitly list what's OUT
```

### Template 2: Glossary Generation

```
Context:
- Domain Vision: {vision_content}
- Industry: [industry type]
- Existing Terms (if any): [list known terms]

Task:
Generate a glossary of 20-30 key domain terms.

Requirements:
1. Each term must have:
   - definition (clear, unambiguous, one sentence)
   - type (Entity | Value Object | Enum | Service | Event)
   - attributes (for Entity/VO types)
2. Entity types must have at least 3 invariants
3. Mark synonyms to prevent terminology confusion
4. Use consistent naming:
   - PascalCase for type names
   - snake_case for attributes
5. Include related_terms for cross-references

Output Format: YAML

Example structure:
```yaml
glossary:
  - term: "TermName"
    definition: "Clear definition"
    type: "Entity"
    attributes:
      - "attr1: Type"
    invariants:
      - "constraint description"
    synonyms:
      - "AltName"
    related_terms:
      - "RelatedTerm"
```
```

### Template 3: Context Map Generation

```
Context:
- Domain Vision: {vision_content}
- Glossary: {glossary_content}

Task:
Identify bounded contexts and their relationships.

Requirements:
1. Identify 3-5 bounded contexts
2. Each context must have:
   - Clear responsibility (one sentence)
   - Owning team
   - Key aggregates (from glossary)
3. Define relationships between contexts:
   - Partnership, Shared Kernel, Customer/Supplier
   - Conformist, Anti-Corruption Layer
4. Note integration patterns (sync/async/events)
5. Flag external systems requiring ACL

Output Format: Markdown with ASCII diagram
```

## Phase 2: Requirements

### Template 4: User Story Generation

```
Context:
- Domain Vision: {vision_content}
- Glossary: {glossary_content}
- Context Map: {context_map_content}
- Feature: {feature_name} - {feature_description}

Task:
Generate 5-8 user stories for the "{feature_name}" feature.

Requirements:
1. Each story follows: "As a [persona], I want [action] so that [benefit]"
2. Use ONLY terms from the provided glossary
3. Include 2-3 acceptance criteria per story in Given-When-Then format
4. Include formal constraints using predicate logic:
   - ∀ (for all), ∃ (exists)
   - ∧ (and), ∨ (or), → (implies)
5. Assign priority (High/Medium/Low)
6. Estimate story points (1, 2, 3, 5, 8, 13)

Output Format:
## US-XXX: [Title]

**As** [persona]
**I want** [action]
**so that** [benefit]

**Priority:** [H/M/L] | **Points:** [N]
**Related BC:** [contexts]

### Acceptance Criteria
**AC-1:**
```
Given: [precondition]
When: [action]
Then: [outcome]
```

### Formal Constraints
```
∀ x ∈ Domain: predicate → consequence
```
```

### Template 5: Acceptance Criteria Refinement

```
Context:
- User Story: {story_content}
- Domain Model (if available): {domain_model}
- Glossary: {glossary_content}

Task:
Expand and refine acceptance criteria.

Requirements:
1. Add edge cases:
   - Boundary values (min, max, empty)
   - Concurrent operations
2. Add error conditions:
   - Invalid inputs
   - System failures
   - Authorization failures
3. Add formal constraints in predicate logic
4. Identify integration points with other BCs
5. Note pre-conditions and post-conditions

Output Format:
### Refined Acceptance Criteria

**AC-1: [Happy path]**
```
Given: [detailed preconditions]
When: [specific action]
Then: [verifiable outcome]
And: [additional outcomes]
```

**AC-2: [Edge case]**
...

**AC-3: [Error handling]**
...

### Formal Constraints
∀ [entity] ∈ [domain]:
  [predicate]
  → [consequence]

### Integration Points
- [Other BC]: [interaction description]
```

## Phase 3: Domain Design

### Template 6: Domain Model Generation

```
Context:
- User Stories: {stories_content}
- Glossary: {glossary_content}
- Context Map: {context_map_content}

Task:
Generate TypeScript domain model for the {aggregate_name} aggregate.

Requirements:
1. Define root entity with:
   - Private fields (encapsulation)
   - Factory method for creation
   - Business methods for state transitions
2. Define value objects for:
   - IDs (with validation)
   - Complex attributes (Money, Address, etc.)
3. Express invariants as assertions:
   - assertInvariants() method
   - Call after every state change
4. Define domain events:
   - One event per state transition
   - Include aggregate ID and relevant data
5. Use DDD naming conventions:
   - [Aggregate]Id for identifiers
   - [Aggregate][Action] for events
6. Add JSDoc comments

Output Format: TypeScript with comments
```

### Template 7: Event Flow Generation

```
Context:
- Domain Model: {domain_model_content}
- User Stories: {stories_content}

Task:
Design event flow for the {aggregate_name} aggregate.

Requirements:
1. Identify all domain events (state transitions)
2. Map event → subscriber reactions
3. Show cross-BC event propagation
4. Note async vs sync handling
5. Identify saga/orchestration needs

Output Format:
[Trigger Action]
    ↓
[Event Name]
    ↓
├─→ [Subscriber 1]: [Action]
│      ↓
│   [Result/Next Event]
│
└─→ [Subscriber 2]: [Action]
       ↓
    [Result]
```

## Phase 4: Data & API

### Template 8: Data Model Generation

```
Context:
- Domain Model: {domain_model_content}
- Glossary: {glossary_content}

Task:
Generate PostgreSQL database schema.

Requirements:
1. Map aggregates to tables
2. Map value objects to columns or separate tables
3. Implement invariants as CHECK constraints
4. Add foreign keys for references
5. Create indexes for:
   - Foreign keys
   - Common query patterns
   - Status fields
6. Add audit columns (created_at, updated_at)
7. Include migration file structure

Output Format: SQL (PostgreSQL)
```

### Template 9: OpenAPI Generation

```
Context:
- Domain Model: {domain_model_content}
- User Stories: {stories_content}
- Service Specifications: {service_specs}

Task:
Generate OpenAPI 3.0 specification.

Requirements:
1. REST endpoints for CRUD operations
2. Action endpoints for state transitions
3. Request/response schemas from domain model
4. Error responses:
   - 400 for validation errors
   - 404 for not found
   - 422 for business rule violations
5. Pagination for list endpoints
6. Include examples

Output Format: YAML (OpenAPI 3.0)
```

## Phase 5: Operations

### Template 10: ADR Generation

```
Context:
- Decision Topic: {topic}
- Current Problem: {problem_description}
- Constraints: {constraints}
- Options Considered: {options}

Task:
Generate Architecture Decision Record.

Requirements:
1. Clear problem statement
2. Decision with rationale
3. Consequences (positive, negative, risks)
4. Alternatives with pros/cons
5. Related decisions (if any)

Output Format:
# ADR-XXX: [Decision Title]

## Status
[Proposed/Accepted]

## Date
[YYYY-MM-DD]

## Context
[Problem description, constraints, drivers]

## Decision
[What we decided]

## Consequences
### Positive
- [Benefit]
### Negative
- [Tradeoff]
### Risks
- [Risk + mitigation]

## Alternatives Considered
### Option A
- Pros: [...]
- Cons: [...]
- Why rejected: [...]
```

## Usage Guidelines

### How to Use These Templates

1. **Copy the template** for your current phase
2. **Fill in context variables** (marked with {curly braces})
3. **Submit to AI** (Claude, GPT, etc.)
4. **Review and refine** the output
5. **Validate** against glossary and existing artifacts

### Template Selection by Task

| Task | Template |
|------|----------|
| Starting a new project | Template 1, 2, 3 |
| Writing user stories | Template 4 |
| Refining acceptance criteria | Template 5 |
| Designing aggregates | Template 6 |
| Planning event flows | Template 7 |
| Creating database schema | Template 8 |
| Defining APIs | Template 9 |
| Documenting decisions | Template 10 |

### Best Practices

1. **Always provide glossary** - Ensures term consistency
2. **Include existing artifacts** - Maintains coherence
3. **Review AI output** - AI generates drafts, humans validate
4. **Iterate** - First output rarely perfect; refine prompts
5. **Version templates** - Track template changes
