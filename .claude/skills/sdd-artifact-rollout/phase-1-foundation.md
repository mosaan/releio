# Phase 1: Foundation (Weeks 1-2)

## Objective

Establish the ubiquitous language foundation and create AI-consumable context for specification-driven development.

## Deliverables

### 1. Domain Vision Statement (1-2 pages)

A concise document defining the domain's purpose, value proposition, and boundaries.

**Template**:

```markdown
# [Domain Name] Domain Vision

## What
[One paragraph describing what this domain/system does]

## Why
[Business value and problems solved]

## Scope
**IN**: [What's included]
**OUT**: [What's explicitly excluded]

## Success Metrics
- [Metric 1 with target]
- [Metric 2 with target]
- [Metric 3 with target]

## Key Stakeholders
- [Role 1]: [Responsibility]
- [Role 2]: [Responsibility]
```

**Example**:

```markdown
# Order Management Domain Vision

## What
A system that manages customer orders from creation through delivery,
enabling retailers to process orders efficiently and customers to track status.

## Why
Reduces manual order processing by 80%, improves customer satisfaction
through real-time tracking.

## Scope
IN: Order creation, inventory reservation, payment processing, status tracking
OUT: Warehouse management, shipping logistics, returns processing

## Success Metrics
- 95% order accuracy
- <24hr delivery confirmation
- 4.5+ customer satisfaction rating

## Key Stakeholders
- Product Owner: Defines order workflow requirements
- Tech Lead: Ensures system scalability
- Operations: Monitors order processing efficiency
```

### 2. Core Glossary v0.1 (20-30 terms)

Structured vocabulary in YAML format for machine readability.

**Template**:

```yaml
glossary:
  - term: "[Term Name]"
    definition: "[Clear, unambiguous definition]"
    type: "[Entity | Value Object | Enum | Service | Event]"
    attributes:
      - "[attribute_1]"
      - "[attribute_2]"
    invariants:
      - "[Constraint 1]"
      - "[Constraint 2]"
    synonyms:
      - "[Alternative term 1]"
    related_terms:
      - "[Related term 1]"
    evolution:
      - date: "YYYY-MM-DD"
        change: "[What changed and why]"
```

**Example**:

```yaml
glossary:
  - term: "Order"
    definition: "A customer's request for product delivery"
    type: "Entity"
    attributes:
      - "order_id: UUID"
      - "customer_id: UUID"
      - "items: OrderItem[]"
      - "status: OrderStatus"
      - "total_price: Money"
    invariants:
      - "order_id must be unique"
      - "items.length > 0"
      - "total_price = sum(item_prices) + tax - discount"
      - "status in [pending, confirmed, shipped, delivered, cancelled]"
    synonyms:
      - "Purchase"
      - "Transaction"
    related_terms:
      - "OrderItem"
      - "Customer"
      - "OrderStatus"

  - term: "OrderStatus"
    definition: "Current state of an order in its lifecycle"
    type: "Enum"
    values:
      - "pending: Order created, awaiting confirmation"
      - "confirmed: Payment received, preparing for shipment"
      - "shipped: Order dispatched to carrier"
      - "delivered: Order received by customer"
      - "cancelled: Order cancelled before delivery"
```

### 3. Bounded Context Map (3-5 contexts)

Visual and textual representation of context boundaries and relationships.

**Template**:

```markdown
# Bounded Context Map

## Contexts

### [Context Name] BC
- **Responsibility**: [What this context owns]
- **Team**: [Owning team]
- **Key Aggregates**: [Main aggregates]

## Relationships

```
[Context A] ←[Relationship Type]→ [Context B]
```

### Relationship Types
- **Partnership**: Mutual dependency, coordinated development
- **Shared Kernel**: Shared model subset
- **Customer/Supplier**: Upstream/downstream dependency
- **Conformist**: Downstream conforms to upstream model
- **Anti-Corruption Layer**: Translation layer to protect from external model
```

**Example**:

```markdown
# Bounded Context Map

## Contexts

### Order BC
- **Responsibility**: Order lifecycle management
- **Team**: Order Squad
- **Key Aggregates**: Order, OrderItem

### Inventory BC
- **Responsibility**: Stock management and reservation
- **Team**: Supply Chain Squad
- **Key Aggregates**: Product, StockItem, Reservation

### Billing BC
- **Responsibility**: Payment processing and invoicing
- **Team**: Finance Squad
- **Key Aggregates**: Payment, Invoice, Transaction

## Relationships

```
Order BC ←[Customer/Supplier]→ Inventory BC
    │
    └─[Shared Kernel]→ Billing BC

Inventory BC ←[Anti-Corruption Layer]→ External Warehouse API
```

## Integration Patterns
- Order → Inventory: Event-driven (OrderPlaced triggers ReserveStock)
- Order → Billing: Synchronous (ProcessPayment before OrderConfirmed)
- Inventory → Warehouse: ACL with adapter pattern
```

## AI-Assisted Generation

### Glossary Generation Prompt

```
Context:
- Domain Vision: [paste vision.md]
- Industry: [e.g., e-commerce, healthcare]

Task:
Generate a glossary of 20-30 key domain terms with definitions,
types, attributes, and basic invariants. Output as YAML.

Requirements:
1. Each term must have: definition, type, attributes (if applicable)
2. Include at least 3 invariants for Entity types
3. Mark synonyms to prevent terminology confusion
4. Use consistent naming (PascalCase for types, snake_case for attributes)
```

### Context Map Generation Prompt

```
Context:
- Domain Vision: [paste vision.md]
- Glossary: [paste glossary.yaml]

Task:
Identify 3-5 bounded contexts and their relationships.

Requirements:
1. Each context should have clear responsibility boundaries
2. Identify relationship types (Partnership, Customer/Supplier, etc.)
3. Note integration patterns (sync, async, events)
4. Flag potential anti-corruption layer needs
```

## Validation Checklist

Before proceeding to Phase 2:

- [ ] Domain Vision Statement created and approved by PO
- [ ] Core Glossary contains 20+ terms
- [ ] All Entity types have at least 2 invariants defined
- [ ] No undefined terms referenced in definitions
- [ ] Bounded Context Map identifies 3+ contexts
- [ ] Context relationships documented with types
- [ ] Git repository structure established
- [ ] Team trained on DDD basics and AI prompt engineering

## Common Issues

| Issue | Solution |
|-------|----------|
| Terms overlap between contexts | Define explicit boundaries; use Context Map to clarify ownership |
| Glossary too abstract | Add concrete examples and invariants |
| Vision too broad | Narrow scope with explicit IN/OUT boundaries |
| Team disagreement on terms | Schedule domain modeling session with domain expert |

## Output Artifacts Location

```
project-repo/
├── domain/
│   ├── vision.md           ← Domain Vision Statement
│   └── glossary.yaml       ← Core Glossary
└── architecture/
    └── context-map.md      ← Bounded Context Map
```
