# Validation Guide

Automated and manual validation procedures for SDD artifacts.

## Validation Principles

1. **Fail Fast**: Catch issues early in artifact creation
2. **Automate**: Script repeatable checks
3. **Integrate**: Run validation in CI/CD
4. **Document**: Clear error messages guide fixes

## Validation Categories

### 1. Syntax Validation

Check that artifacts are well-formed.

#### YAML Syntax (Glossary)

```bash
#!/bin/bash
# validate_yaml.sh

echo "Validating YAML syntax..."

for file in domain/*.yaml; do
    python -c "import yaml; yaml.safe_load(open('$file'))" 2>&1
    if [ $? -ne 0 ]; then
        echo "ERROR: Invalid YAML in $file"
        exit 1
    fi
done

echo "YAML syntax: OK"
```

#### Markdown Lint

```bash
# Install: npm install -g markdownlint-cli

markdownlint 'domain/**/*.md' 'architecture/**/*.md' 'requirements/**/*.md' 'adr/**/*.md'
```

#### OpenAPI Validation

```bash
# Install: npm install -g @apidevtools/swagger-cli

swagger-cli validate api-specs/openapi.yaml
```

### 2. Semantic Validation

Check that artifacts make sense together.

#### Glossary Completeness

```python
#!/usr/bin/env python3
"""
check_glossary_completeness.py
Ensures all terms used in artifacts are defined in glossary.
"""

import yaml
import re
from pathlib import Path

def load_glossary(path='domain/glossary.yaml'):
    with open(path) as f:
        data = yaml.safe_load(f)
    return set(term['term'] for term in data.get('glossary', []))

def extract_domain_terms(text):
    """Extract PascalCase terms (likely domain terms)."""
    return set(re.findall(r'\b[A-Z][a-z]+(?:[A-Z][a-z]+)+\b', text))

def check_file(file_path, glossary_terms, ignore_terms):
    with open(file_path) as f:
        content = f.read()
    
    used_terms = extract_domain_terms(content)
    undefined = used_terms - glossary_terms - ignore_terms
    
    return undefined

def main():
    glossary_terms = load_glossary()
    
    # Common terms to ignore (not domain-specific)
    ignore_terms = {
        'GitHub', 'PostgreSQL', 'TypeScript', 'JavaScript',
        'OpenAPI', 'README', 'JSON', 'YAML', 'UUID',
        'String', 'Number', 'Boolean', 'Array', 'Object',
        'Given', 'When', 'Then', 'And'
    }
    
    errors = []
    
    # Check requirements
    for file_path in Path('requirements').glob('**/*.md'):
        undefined = check_file(file_path, glossary_terms, ignore_terms)
        if undefined:
            errors.append(f"{file_path}: Undefined terms: {undefined}")
    
    # Check architecture
    for file_path in Path('architecture').glob('**/*.md'):
        undefined = check_file(file_path, glossary_terms, ignore_terms)
        if undefined:
            errors.append(f"{file_path}: Undefined terms: {undefined}")
    
    if errors:
        print("Glossary completeness check FAILED:")
        for error in errors:
            print(f"  - {error}")
        return 1
    
    print("Glossary completeness: OK")
    return 0

if __name__ == '__main__':
    exit(main())
```

#### Referential Integrity

```python
#!/usr/bin/env python3
"""
check_referential_integrity.py
Ensures cross-references between artifacts are valid.
"""

import yaml
import re
from pathlib import Path

def load_glossary(path='domain/glossary.yaml'):
    with open(path) as f:
        data = yaml.safe_load(f)
    return {term['term']: term for term in data.get('glossary', [])}

def check_context_map(context_map_path, glossary):
    """Check that context map references valid glossary terms."""
    with open(context_map_path) as f:
        content = f.read()
    
    errors = []
    
    # Extract BC names
    bc_pattern = r'###\s+(\w+)\s+BC'
    bcs = re.findall(bc_pattern, content)
    
    # Extract aggregate references
    agg_pattern = r'Key Aggregates?:\s*([^\n]+)'
    for match in re.finditer(agg_pattern, content):
        aggregates = [a.strip() for a in match.group(1).split(',')]
        for agg in aggregates:
            # Clean up the aggregate name
            agg_clean = agg.strip('*').strip()
            if agg_clean and agg_clean not in glossary:
                errors.append(f"Aggregate '{agg_clean}' not in glossary")
    
    return errors

def check_user_stories(stories_dir, glossary):
    """Check that user stories reference valid BCs and terms."""
    errors = []
    
    for story_file in Path(stories_dir).glob('**/*.md'):
        with open(story_file) as f:
            content = f.read()
        
        # Check Related BC references
        bc_pattern = r'Related BC:\s*([^\n]+)'
        for match in re.finditer(bc_pattern, content):
            bcs = [bc.strip() for bc in match.group(1).split(',')]
            # Note: Could validate against context map
    
    return errors

def main():
    glossary = load_glossary()
    errors = []
    
    # Check context map
    context_map_path = Path('architecture/context-map.md')
    if context_map_path.exists():
        errors.extend(check_context_map(context_map_path, glossary))
    
    # Check user stories
    stories_dir = Path('requirements')
    if stories_dir.exists():
        errors.extend(check_user_stories(stories_dir, glossary))
    
    if errors:
        print("Referential integrity check FAILED:")
        for error in errors:
            print(f"  - {error}")
        return 1
    
    print("Referential integrity: OK")
    return 0

if __name__ == '__main__':
    exit(main())
```

#### User Story Validation

```python
#!/usr/bin/env python3
"""
check_user_stories.py
Validates user story structure and completeness.
"""

import re
from pathlib import Path

def check_story_structure(content, file_path):
    """Check that story has required sections."""
    errors = []
    
    # Check for As/I want/So that
    if not re.search(r'\*\*As\*\*', content):
        errors.append(f"{file_path}: Missing 'As' persona")
    if not re.search(r'\*\*I want\*\*', content):
        errors.append(f"{file_path}: Missing 'I want' goal")
    if not re.search(r'\*\*so that\*\*', content, re.IGNORECASE):
        errors.append(f"{file_path}: Missing 'so that' benefit")
    
    return errors

def check_acceptance_criteria(content, file_path):
    """Check for proper AC format."""
    errors = []
    
    # Must have Given-When-Then
    if 'Given:' not in content:
        errors.append(f"{file_path}: No 'Given:' in acceptance criteria")
    if 'When:' not in content:
        errors.append(f"{file_path}: No 'When:' in acceptance criteria")
    if 'Then:' not in content:
        errors.append(f"{file_path}: No 'Then:' in acceptance criteria")
    
    # Count ACs
    ac_count = len(re.findall(r'\*\*AC-\d+', content))
    if ac_count < 2:
        errors.append(f"{file_path}: Need at least 2 acceptance criteria (found {ac_count})")
    
    return errors

def check_formal_constraints(content, file_path):
    """Check for formal constraint notation."""
    errors = []
    
    # Should have formal constraints section
    has_formal = any(sym in content for sym in ['∀', '∃', '→', 'forall', 'exists'])
    if not has_formal:
        errors.append(f"{file_path}: Missing formal constraints")
    
    return errors

def main():
    errors = []
    
    # Find all user story files
    for story_file in Path('requirements').glob('**/*.md'):
        if 'feature-breakdown' in str(story_file):
            continue  # Skip non-story files
        
        with open(story_file) as f:
            content = f.read()
        
        # Skip if not a user story file
        if 'US-' not in content:
            continue
        
        errors.extend(check_story_structure(content, story_file))
        errors.extend(check_acceptance_criteria(content, story_file))
        errors.extend(check_formal_constraints(content, story_file))
    
    if errors:
        print("User story validation FAILED:")
        for error in errors:
            print(f"  - {error}")
        return 1
    
    print("User story validation: OK")
    return 0

if __name__ == '__main__':
    exit(main())
```

### 3. Domain Model Validation

```python
#!/usr/bin/env python3
"""
check_domain_model.py
Validates domain model has proper invariants and events.
"""

import re
from pathlib import Path

def check_invariants(content, file_path):
    """Check for invariant assertions in domain model."""
    errors = []
    
    # If it's a class definition, should have invariants
    if 'class ' in content and 'extends AggregateRoot' in content:
        if 'assertInvariant' not in content and 'invariant' not in content.lower():
            errors.append(f"{file_path}: Aggregate missing invariant assertions")
    
    return errors

def check_domain_events(content, file_path):
    """Check for domain event definitions."""
    errors = []
    
    # Aggregates should emit events
    if 'extends AggregateRoot' in content:
        if 'DomainEvent' not in content and 'addDomainEvent' not in content:
            errors.append(f"{file_path}: Aggregate not emitting domain events")
    
    return errors

def check_value_objects(content, file_path):
    """Check value objects are immutable."""
    errors = []
    
    # Value objects should use readonly
    if 'extends ValueObject' in content:
        if 'readonly' not in content and 'private readonly' not in content:
            errors.append(f"{file_path}: Value object should use readonly fields")
    
    return errors

def main():
    errors = []
    
    # Check all TypeScript files in domain-design
    for model_file in Path('domain-design').glob('**/*.ts'):
        with open(model_file) as f:
            content = f.read()
        
        errors.extend(check_invariants(content, model_file))
        errors.extend(check_domain_events(content, model_file))
        errors.extend(check_value_objects(content, model_file))
    
    if errors:
        print("Domain model validation FAILED:")
        for error in errors:
            print(f"  - {error}")
        return 1
    
    print("Domain model validation: OK")
    return 0

if __name__ == '__main__':
    exit(main())
```

### 4. Data Model Validation

```python
#!/usr/bin/env python3
"""
check_data_model.py
Validates database schema against domain invariants.
"""

import re
from pathlib import Path

def extract_check_constraints(sql_content):
    """Extract CHECK constraints from SQL."""
    pattern = r'CONSTRAINT\s+(\w+)\s+CHECK\s*\(([^)]+)\)'
    return re.findall(pattern, sql_content, re.IGNORECASE)

def check_audit_columns(sql_content, file_path):
    """Check for audit columns."""
    errors = []
    
    if 'created_at' not in sql_content.lower():
        errors.append(f"{file_path}: Missing created_at audit column")
    if 'updated_at' not in sql_content.lower():
        errors.append(f"{file_path}: Missing updated_at audit column")
    
    return errors

def check_foreign_keys(sql_content, file_path):
    """Check foreign key definitions."""
    errors = []
    
    # Count REFERENCES vs potential FK columns
    fk_pattern = r'(\w+_id)\s+\w+(?:\s+NOT NULL)?(?:\s+REFERENCES)?'
    id_columns = re.findall(fk_pattern, sql_content, re.IGNORECASE)
    
    ref_pattern = r'REFERENCES\s+\w+'
    references = re.findall(ref_pattern, sql_content, re.IGNORECASE)
    
    # Heuristic: _id columns should have REFERENCES
    # This is a simplistic check; adjust as needed
    
    return errors

def main():
    errors = []
    
    for sql_file in Path('data-model').glob('**/*.sql'):
        with open(sql_file) as f:
            content = f.read()
        
        errors.extend(check_audit_columns(content, sql_file))
        errors.extend(check_foreign_keys(content, sql_file))
    
    if errors:
        print("Data model validation FAILED:")
        for error in errors:
            print(f"  - {error}")
        return 1
    
    print("Data model validation: OK")
    return 0

if __name__ == '__main__':
    exit(main())
```

## Combined Validation Script

```bash
#!/bin/bash
# validate_all.sh
# Run all artifact validations

set -e

echo "========================================="
echo "SDD Artifact Validation Suite"
echo "========================================="
echo ""

# 1. Syntax checks
echo "--- Syntax Validation ---"
./scripts/validate_yaml.sh
markdownlint 'domain/**/*.md' 'architecture/**/*.md' 'requirements/**/*.md' --quiet || true
echo ""

# 2. Semantic checks
echo "--- Semantic Validation ---"
python scripts/check_glossary_completeness.py
python scripts/check_referential_integrity.py
python scripts/check_user_stories.py
echo ""

# 3. Model checks
echo "--- Model Validation ---"
python scripts/check_domain_model.py || true
python scripts/check_data_model.py || true
echo ""

# 4. API checks
echo "--- API Validation ---"
if [ -f "api-specs/openapi.yaml" ]; then
    swagger-cli validate api-specs/openapi.yaml
fi
echo ""

echo "========================================="
echo "All validations complete!"
echo "========================================="
```

## CI/CD Integration

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
      - 'data-model/**'
      - 'api-specs/**'
      - 'adr/**'
  pull_request:
    paths:
      - 'domain/**'
      - 'architecture/**'
      - 'requirements/**'
      - 'domain-design/**'
      - 'data-model/**'
      - 'api-specs/**'
      - 'adr/**'

jobs:
  syntax:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Python
        uses: actions/setup-python@v5
        with:
          python-version: '3.11'
      
      - name: Install Python deps
        run: pip install pyyaml
      
      - name: Validate YAML
        run: |
          for f in domain/*.yaml; do
            python -c "import yaml; yaml.safe_load(open('$f'))"
          done
      
      - name: Lint Markdown
        uses: DavidAnson/markdownlint-cli2-action@v16
        with:
          globs: |
            domain/**/*.md
            architecture/**/*.md
            requirements/**/*.md
            adr/**/*.md

  semantic:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Python
        uses: actions/setup-python@v5
        with:
          python-version: '3.11'
      
      - name: Install deps
        run: pip install pyyaml
      
      - name: Check glossary completeness
        run: python scripts/check_glossary_completeness.py
      
      - name: Check referential integrity
        run: python scripts/check_referential_integrity.py
      
      - name: Validate user stories
        run: python scripts/check_user_stories.py

  api:
    runs-on: ubuntu-latest
    if: hashFiles('api-specs/openapi.yaml') != ''
    steps:
      - uses: actions/checkout@v4
      
      - name: Validate OpenAPI
        uses: char0n/swagger-editor-validate@v1
        with:
          definition-file: api-specs/openapi.yaml
```

## Manual Review Checklist

Some validations require human judgment:

```markdown
## Manual Review Items

### Glossary Review
- [ ] Definitions are clear and unambiguous
- [ ] No jargon without explanation
- [ ] Invariants are actually enforced in code
- [ ] Synonyms are consistently mapped

### User Story Review
- [ ] Stories deliver business value
- [ ] ACs are testable
- [ ] Formal constraints are correct
- [ ] Priority reflects business needs

### Domain Model Review
- [ ] Aggregates have correct boundaries
- [ ] Invariants prevent invalid states
- [ ] Events capture all important state changes
- [ ] No anemic domain model

### API Review
- [ ] Endpoints follow REST best practices
- [ ] Error responses are helpful
- [ ] Security considerations addressed
- [ ] Pagination implemented correctly
```
