# Phase Checklists

Copy and use these checklists to track progress through each phase.

## Pre-Work Checklist (Week -1)

```markdown
## Pre-Work: Team Alignment & Tool Setup

- [ ] Kick-off meeting completed
  - [ ] SDD artifact framework explained to team
  - [ ] Roles and responsibilities assigned
  - [ ] Timeline agreed upon
- [ ] Tool setup completed
  - [ ] Git repository created with folder structure
  - [ ] Markdown templates prepared
  - [ ] CI/CD pipeline skeleton configured
- [ ] Training scheduled
  - [ ] DDD concepts overview
  - [ ] AI prompt engineering basics
  - [ ] Artifact validation tools
- [ ] Stakeholders identified
  - [ ] Product Owner confirmed
  - [ ] Domain Expert(s) identified
  - [ ] Technical Lead assigned
```

## Phase 1 Checklist: Foundation (Weeks 1-2)

```markdown
## Phase 1: Foundation

### Domain Vision Statement
- [ ] Draft created
- [ ] What/Why/Scope sections complete
- [ ] Success metrics defined (3-5 quantifiable)
- [ ] IN/OUT boundaries explicit
- [ ] Reviewed by PO
- [ ] Approved by stakeholders
- [ ] Saved to: domain/vision.md

### Core Glossary v0.1
- [ ] 20+ terms defined
- [ ] Each term has: definition, type
- [ ] Entity types have 2+ invariants
- [ ] Synonyms identified and documented
- [ ] No circular definitions
- [ ] YAML syntax validated
- [ ] Saved to: domain/glossary.yaml

### Bounded Context Map
- [ ] 3-5 contexts identified
- [ ] Each context has clear responsibility
- [ ] Owning team assigned to each
- [ ] Relationships documented (Partnership, Customer/Supplier, etc.)
- [ ] Integration patterns noted (sync/async/events)
- [ ] External systems flagged for ACL
- [ ] Saved to: architecture/context-map.md

### Infrastructure
- [ ] Git repository structure created
- [ ] README.md with project overview
- [ ] Team has write access
- [ ] Branch protection configured

### Validation
- [ ] All used terms defined in glossary
- [ ] Context map references valid terms
- [ ] No undefined terms in vision statement
- [ ] Glossary completeness check passes
```

## Phase 2 Checklist: Requirements (Weeks 3-5)

```markdown
## Phase 2: Requirements

### User Stories v1
- [ ] Stories created (target: 15-20 total)
  - [ ] Sprint 1: 5-10 stories
  - [ ] Sprint 2: 5-10 stories
- [ ] Each story has:
  - [ ] As/I want/So that format
  - [ ] Priority assigned (High/Medium/Low)
  - [ ] Story points estimated (1-13)
  - [ ] Related BC(s) identified
- [ ] Saved to: requirements/user-stories.md

### Acceptance Criteria
- [ ] Each story has 2+ ACs
- [ ] Given-When-Then format used
- [ ] Happy path covered
- [ ] Error scenarios covered
- [ ] Edge cases identified
- [ ] Formal constraints added (predicate logic)

### Feature Breakdown
- [ ] Epic(s) defined
- [ ] Features grouped logically
- [ ] Dependencies documented
- [ ] Priority order established
- [ ] Saved to: requirements/feature-breakdown.md

### AI Prompt Templates
- [ ] Story generation prompt tested
- [ ] AC refinement prompt tested
- [ ] Outputs validated against glossary

### Validation
- [ ] All story terms exist in glossary
- [ ] AC formal constraints are satisfiable
- [ ] No contradictory requirements
- [ ] PO has reviewed and approved
- [ ] Story-BC mapping is consistent
```

## Phase 3 Checklist: Conceptual Design (Weeks 6-8)

```markdown
## Phase 3: Conceptual Design

### Domain Model
- [ ] Aggregates defined for each key entity
- [ ] Root entities identified
- [ ] Value Objects extracted
- [ ] Each aggregate has:
  - [ ] Private fields with encapsulation
  - [ ] Factory method(s)
  - [ ] Business methods for state transitions
  - [ ] 2+ invariant assertions
- [ ] Saved to: domain-design/

### Domain Events
- [ ] Events defined for each state transition
- [ ] Event naming: [Aggregate][PastTenseVerb]
- [ ] Event properties include:
  - [ ] Aggregate ID
  - [ ] Relevant state data
  - [ ] Timestamp
- [ ] Saved to: domain-design/events/

### Event Flow
- [ ] Flow diagram created
- [ ] Event → subscriber mapping documented
- [ ] Cross-BC events identified
- [ ] Async vs sync handling noted
- [ ] Saga patterns identified (if needed)
- [ ] Saved to: domain-design/diagrams/

### Service Specifications
- [ ] Application services defined
- [ ] Domain services defined
- [ ] Input/output types specified
- [ ] Error types documented
- [ ] Saved to: domain-design/services/

### Validation
- [ ] Model covers all glossary entities
- [ ] Invariants match AC formal constraints
- [ ] Events cover all state transitions
- [ ] No circular aggregate dependencies
- [ ] Tech Lead has reviewed and approved
```

## Phase 4 Checklist: Data & API (Weeks 8-10)

```markdown
## Phase 4: Data & API Design

### Logical Data Model
- [ ] Tables defined for all aggregates
- [ ] Columns match entity attributes
- [ ] Primary keys defined
- [ ] ER diagram documented
- [ ] Saved to: data-model/logical-model.md

### Physical Data Model
- [ ] SQL schema created
- [ ] Foreign keys defined
- [ ] CHECK constraints for invariants
- [ ] Indexes for:
  - [ ] Foreign keys
  - [ ] Query patterns
  - [ ] Status fields
- [ ] Audit columns (created_at, updated_at)
- [ ] Saved to: data-model/schema.sql

### Migrations
- [ ] Migration files created
- [ ] Naming convention: NNN_description.sql
- [ ] Tested in dev environment
- [ ] Rollback scripts prepared
- [ ] Saved to: data-model/migrations/

### OpenAPI Specifications
- [ ] CRUD endpoints defined
- [ ] Action endpoints for state transitions
- [ ] Request schemas defined
- [ ] Response schemas defined
- [ ] Error responses (400, 404, 422)
- [ ] Pagination for list endpoints
- [ ] Examples included
- [ ] Saved to: api-specs/openapi.yaml

### Repository Interfaces
- [ ] Interface per aggregate
- [ ] CRUD methods defined
- [ ] Query methods for common patterns
- [ ] Saved to: src/repositories/

### Validation
- [ ] Schema satisfies all domain invariants
- [ ] API endpoints cover all user stories
- [ ] Error responses match domain exceptions
- [ ] OpenAPI spec passes validation
```

## Phase 5 Checklist: Operations (Weeks 10-12)

```markdown
## Phase 5: Integration & Operations

### Architecture Decision Records
- [ ] ADR created for each major decision:
  - [ ] Database choice
  - [ ] API design patterns
  - [ ] Event handling approach
  - [ ] Security architecture
- [ ] Each ADR has:
  - [ ] Status (Accepted/Proposed)
  - [ ] Context and problem
  - [ ] Decision and rationale
  - [ ] Consequences (positive/negative)
  - [ ] Alternatives considered
- [ ] Saved to: adr/

### Validation Automation
- [ ] Glossary completeness script
- [ ] Referential integrity script
- [ ] User story validation script
- [ ] Domain model invariant check
- [ ] All scripts passing
- [ ] Saved to: scripts/

### CI/CD Integration
- [ ] GitHub Actions workflow created
- [ ] Triggers on artifact changes
- [ ] Runs validation scripts
- [ ] Validates YAML/JSON syntax
- [ ] Validates OpenAPI spec
- [ ] Saved to: .github/workflows/

### Artifact Versioning
- [ ] Version tracking file created
- [ ] Change log maintained
- [ ] Sync rules documented
- [ ] Saved to: artifact-versions.yaml

### AI Prompt Registry
- [ ] All phase templates registered
- [ ] Context requirements documented
- [ ] Output formats specified
- [ ] Saved to: ai/prompt-templates.yaml

### Documentation
- [ ] README updated with artifact overview
- [ ] Contribution guide for artifacts
- [ ] Change management process documented

### Go-Live Readiness
- [ ] All Phase 1-4 checklists complete
- [ ] Validation pipeline green
- [ ] Team trained on artifact updates
- [ ] Stakeholder sign-off obtained
```

## Post-Implementation Checklist (Ongoing)

```markdown
## Ongoing: Artifact Evolution

### Per Sprint
- [ ] Glossary reviewed for new terms
- [ ] User stories updated/added
- [ ] Domain model refined if needed
- [ ] ADRs added for new decisions
- [ ] Validation scripts passing

### Per Release
- [ ] Artifact versions bumped
- [ ] Change log updated
- [ ] Cross-artifact consistency verified
- [ ] Documentation updated

### Quarterly
- [ ] Full artifact framework review
- [ ] Template effectiveness assessed
- [ ] Team feedback collected
- [ ] Process improvements identified
- [ ] Training needs assessed
```

## Quick Reference: Minimum Viable Artifacts

For teams with limited time, prioritize these minimum artifacts:

```markdown
## Minimum Viable SDD Artifacts

### Must Have (Phase 1)
- [ ] Domain Vision Statement (1 page)
- [ ] Core Glossary (15+ terms)
- [ ] Context Map (3+ contexts)

### Should Have (Phase 2)
- [ ] User Stories with ACs (10+ stories)
- [ ] Feature Breakdown

### Nice to Have (Phase 3-5)
- [ ] Domain Model
- [ ] API Specs
- [ ] ADRs
- [ ] Validation Automation
```

## Checklist Export

To use these checklists in your project:

1. Copy the relevant phase checklist
2. Paste into your project's issue tracker or wiki
3. Assign owners to checklist items
4. Track completion in standups
5. Mark phase complete when all items checked
