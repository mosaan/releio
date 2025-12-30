# Phase 5: Integration & Operations (Weeks 10-12)

## Objective

Establish complete artifact lifecycle management with automated validation and CI/CD integration.

## Deliverables

### 1. Architecture Decision Records (ADRs)

Document all major design decisions.

**Template**:

```markdown
# ADR-[NNN]: [Decision Title]

## Status
[Proposed | Accepted | Deprecated | Superseded by ADR-XXX]

## Date
YYYY-MM-DD

## Context
[Describe the issue motivating this decision]
- What is the problem we're trying to solve?
- What constraints exist?
- What options were considered?

## Decision
[Describe what we decided to do]

## Consequences

### Positive
- [Benefit 1]
- [Benefit 2]

### Negative
- [Tradeoff 1]
- [Tradeoff 2]

### Risks
- [Risk 1 and mitigation]

## Alternatives Considered

### Option A: [Name]
- Description: [What it is]
- Pros: [Benefits]
- Cons: [Drawbacks]
- Why rejected: [Reason]

### Option B: [Name]
...

## Related Decisions
- ADR-XXX: [Related decision]

## References
- [Link to relevant documentation]
```

**Example**:

```markdown
# ADR-001: Use Event Sourcing for Order Domain

## Status
Accepted

## Date
2025-01-15

## Context
The Order domain requires:
- Complete audit trail of all state changes
- Ability to replay events for debugging and recovery
- High write throughput (1000+ orders/second at peak)
- Support for temporal queries ("what was the state at time T?")

Current CRUD approach loses history and makes auditing difficult.

## Decision
Implement CQRS + Event Sourcing pattern for the Order aggregate:
- Write model: Event store using PostgreSQL with JSONB events
- Read model: Materialized views for query optimization
- Event replay: Support full reconstruction from event history

## Consequences

### Positive
- Complete audit trail automatically maintained
- Temporal queries enabled (state-at-time-T)
- Event replay for debugging production issues
- Natural fit for event-driven architecture

### Negative
- Eventual consistency (50-100ms lag for read model)
- Increased storage requirements (~3x vs CRUD)
- Higher complexity for developers unfamiliar with ES

### Risks
- Event schema evolution needs careful versioning
  - Mitigation: Use upcasting pattern, version all events

## Alternatives Considered

### Option A: Traditional ACID with audit log
- Description: CRUD with separate audit table
- Pros: Simpler, familiar to team
- Cons: Audit log can drift, no replay capability
- Why rejected: Doesn't support temporal queries

### Option B: CDC (Change Data Capture)
- Description: Capture changes via database triggers/logs
- Pros: Non-invasive, works with existing code
- Cons: Captures physical changes, not domain events
- Why rejected: Loses business intent in events

## Related Decisions
- ADR-002: PostgreSQL as Event Store
- ADR-003: Read Model Update Strategy

## References
- Martin Fowler: Event Sourcing
- Greg Young: CQRS Documents
```

### 2. Validation & Quality Check Automation

Scripts to validate artifact consistency.

**Validation Script**:

```python
#!/usr/bin/env python3
"""
validate_artifacts.py
Validates SDD artifact consistency and completeness.
"""

import yaml
import re
import sys
from pathlib import Path

def load_glossary(path: str) -> dict:
    """Load glossary YAML file."""
    with open(path) as f:
        data = yaml.safe_load(f)
    return {term['term']: term for term in data.get('glossary', [])}

def extract_terms_from_file(path: str) -> set:
    """Extract potential domain terms from a file."""
    with open(path) as f:
        content = f.read()
    # Match PascalCase and specific patterns
    terms = set(re.findall(r'\b[A-Z][a-z]+(?:[A-Z][a-z]+)*\b', content))
    return terms

def check_glossary_completeness(glossary: dict, files: list) -> list:
    """Check if all used terms are defined in glossary."""
    errors = []
    glossary_terms = set(glossary.keys())
    
    for file_path in files:
        used_terms = extract_terms_from_file(file_path)
        undefined = used_terms - glossary_terms - COMMON_TERMS
        if undefined:
            errors.append(f"{file_path}: Potentially undefined terms: {undefined}")
    
    return errors

def check_referential_integrity(context_map: str, glossary: dict) -> list:
    """Check that context map references defined terms."""
    errors = []
    with open(context_map) as f:
        content = f.read()
    
    # Extract BC names from context map
    bc_pattern = r'### (\w+) BC'
    bcs = set(re.findall(bc_pattern, content))
    
    # Check each BC is mentioned in glossary
    for bc in bcs:
        if bc not in glossary:
            errors.append(f"Bounded Context '{bc}' not defined in glossary")
    
    return errors

def check_user_story_coverage(stories_dir: str, glossary: dict) -> list:
    """Check user stories use glossary terms consistently."""
    errors = []
    glossary_terms = set(glossary.keys())
    
    for story_file in Path(stories_dir).glob('*.md'):
        with open(story_file) as f:
            content = f.read()
        
        # Check AC presence
        if 'Given:' not in content or 'When:' not in content or 'Then:' not in content:
            errors.append(f"{story_file}: Missing Given-When-Then acceptance criteria")
        
        # Check formal constraints
        if '∀' not in content and 'forall' not in content.lower():
            errors.append(f"{story_file}: Missing formal constraints")
    
    return errors

def check_invariants_in_domain_model(model_dir: str) -> list:
    """Check domain model has invariant assertions."""
    errors = []
    
    for model_file in Path(model_dir).glob('*.ts'):
        with open(model_file) as f:
            content = f.read()
        
        # Check for invariant methods
        if 'class ' in content and 'assertInvariant' not in content:
            errors.append(f"{model_file}: Missing invariant assertions")
    
    return errors

def main():
    """Run all validation checks."""
    print("=== SDD Artifact Validation ===\n")
    
    all_errors = []
    
    # 1. Glossary completeness
    print("Checking glossary completeness...")
    glossary = load_glossary('domain/glossary.yaml')
    files_to_check = list(Path('requirements').glob('**/*.md'))
    errors = check_glossary_completeness(glossary, files_to_check)
    all_errors.extend(errors)
    
    # 2. Referential integrity
    print("Checking referential integrity...")
    errors = check_referential_integrity('architecture/context-map.md', glossary)
    all_errors.extend(errors)
    
    # 3. User story coverage
    print("Checking user story coverage...")
    errors = check_user_story_coverage('requirements', glossary)
    all_errors.extend(errors)
    
    # 4. Domain model invariants
    print("Checking domain model invariants...")
    errors = check_invariants_in_domain_model('domain-design')
    all_errors.extend(errors)
    
    # Report results
    print("\n=== Results ===")
    if all_errors:
        print(f"\nFound {len(all_errors)} issue(s):\n")
        for error in all_errors:
            print(f"  - {error}")
        sys.exit(1)
    else:
        print("\nAll validations passed!")
        sys.exit(0)

# Common terms to ignore (not domain-specific)
COMMON_TERMS = {
    'String', 'Number', 'Boolean', 'Date', 'Array', 'Object',
    'Promise', 'Error', 'Event', 'Response', 'Request',
    'Given', 'When', 'Then', 'And', 'Example'
}

if __name__ == '__main__':
    main()
```

### 3. CI/CD Integration

GitHub Actions workflow for artifact validation.

```yaml
# .github/workflows/validate-artifacts.yml
name: Validate SDD Artifacts

on:
  push:
    paths:
      - 'domain/**'
      - 'architecture/**'
      - 'requirements/**'
      - 'domain-design/**'
      - 'adr/**'
  pull_request:
    paths:
      - 'domain/**'
      - 'architecture/**'
      - 'requirements/**'
      - 'domain-design/**'
      - 'adr/**'

jobs:
  validate:
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v4
      
      - name: Set up Python
        uses: actions/setup-python@v5
        with:
          python-version: '3.11'
      
      - name: Install dependencies
        run: |
          pip install pyyaml jsonschema
      
      - name: Validate YAML syntax
        run: |
          python -c "import yaml; yaml.safe_load(open('domain/glossary.yaml'))"
      
      - name: Run artifact validation
        run: |
          python scripts/validate_artifacts.py
      
      - name: Check markdown formatting
        uses: DavidAnson/markdownlint-cli2-action@v16
        with:
          globs: |
            domain/**/*.md
            architecture/**/*.md
            requirements/**/*.md
            adr/**/*.md

  schema-validation:
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v4
      
      - name: Validate OpenAPI spec
        uses: char0n/swagger-editor-validate@v1
        with:
          definition-file: api-specs/openapi.yaml
```

### 4. Artifact Versioning & Change Management

Version tracking for artifacts.

```yaml
# artifact-versions.yaml
version: "1.0.0"
last_updated: "2025-01-20"

artifacts:
  glossary:
    version: "0.3.0"
    last_modified: "2025-01-18"
    changes:
      - version: "0.3.0"
        date: "2025-01-18"
        description: "Added 5 new terms for billing domain"
      - version: "0.2.0"
        date: "2025-01-10"
        description: "Refined Order invariants"
  
  context_map:
    version: "0.2.0"
    last_modified: "2025-01-15"
    changes:
      - version: "0.2.0"
        date: "2025-01-15"
        description: "Added Billing BC, updated relationships"
  
  user_stories:
    version: "1.0.0"
    last_modified: "2025-01-20"
    changes:
      - version: "1.0.0"
        date: "2025-01-20"
        description: "Complete stories for Sprint 1-3"

sync_rules:
  - trigger: "glossary version change"
    actions:
      - "Review all user stories for term consistency"
      - "Update domain model comments"
  
  - trigger: "context_map version change"
    actions:
      - "Review API specs for BC boundaries"
      - "Update event flow diagrams"
```

### 5. AI Prompt Template Registry

Centralized prompt management.

```yaml
# ai/prompt-templates.yaml
templates:
  - id: user_story_generation_v1
    name: "User Story Generator"
    description: "Generate user stories from feature descriptions"
    phase: 2
    context_required:
      - domain/glossary.yaml
      - architecture/context-map.md
    output_format: markdown
    validation:
      - glossary_terms_used
      - ac_completeness
    template: |
      Context:
      - Domain Vision: {vision_content}
      - Glossary: {glossary_content}
      - Context Map: {context_map_content}
      - Feature: {feature_description}

      Task:
      Generate 5-8 user stories for the "{feature_name}" feature.

      Requirements:
      1. Each story follows: "As a [persona], I want [action] so that [benefit]"
      2. Use ONLY terms from the provided glossary
      3. Include 2-3 acceptance criteria per story in Given-When-Then format
      4. Include formal constraints using predicate logic notation
      5. Assign priority (High/Medium/Low) and story points (1-13)

  - id: domain_model_refinement_v1
    name: "Domain Model Refiner"
    description: "Refine domain model from user stories"
    phase: 3
    context_required:
      - requirements/user-stories.md
      - domain/glossary.yaml
    output_format: typescript
    validation:
      - invariants_asserted
      - events_defined
    template: |
      Context:
      - User Stories: {stories_content}
      - Glossary: {glossary_content}
      - Existing Model: {existing_model}

      Task:
      Refine the domain model to satisfy all acceptance criteria.

      Requirements:
      1. Each AC formal constraint → invariant assertion
      2. Each state transition → domain event
      3. All glossary entities represented

  - id: ac_refinement_v1
    name: "Acceptance Criteria Refiner"
    description: "Expand and formalize acceptance criteria"
    phase: 2
    context_required:
      - domain/glossary.yaml
    output_format: markdown
    template: |
      Context:
      - User Story: {story_content}
      - Domain Model: {domain_model}
      - Current AC: {current_ac}

      Task:
      Refine acceptance criteria with:
      1. Edge cases (boundary conditions)
      2. Error conditions
      3. Formal constraints (predicate logic)
      4. Integration points
```

## Validation Checklist

Before go-live:

- [ ] ADRs created for all major decisions
- [ ] All ADRs have status, context, and consequences
- [ ] Validation scripts run without errors
- [ ] CI/CD pipeline configured and passing
- [ ] Artifact versioning in place
- [ ] Change management process documented
- [ ] AI prompt templates registered and tested
- [ ] Team trained on artifact update procedures

## Common Issues

| Issue | Solution |
|-------|----------|
| ADRs not maintained | Include ADR review in sprint retrospective |
| Validation too slow | Parallelize checks, cache glossary |
| CI/CD false positives | Tune validation rules, add exceptions |
| Version drift | Automate version bump on merge |

## Output Artifacts Location

```
project-repo/
├── adr/
│   ├── ADR-001-event-sourcing.md
│   ├── ADR-002-database-choice.md
│   └── template.md
├── scripts/
│   ├── validate_artifacts.py
│   ├── check_glossary.py
│   └── generate_diagrams.sh
├── .github/
│   └── workflows/
│       └── validate-artifacts.yml
├── ai/
│   └── prompt-templates.yaml
└── artifact-versions.yaml
```
