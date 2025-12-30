# Phase 3: Conceptual Design (Weeks 6-8)

## Objective

Develop explicit domain models with invariants that serve as constraints for AI code generation.

## Deliverables

### 1. Domain Model (Aggregates, Entities, Value Objects)

TypeScript-style domain model with explicit invariants.

**Template**:

```typescript
// ============================================
// Aggregate: [AggregateName]
// ============================================

// --- Value Objects ---
class [ValueObjectName] extends ValueObject {
  private readonly value: [type];
  
  constructor(value: [type]) {
    // Validation
    if (![validation]) {
      throw new InvalidValueError("[message]");
    }
    this.value = value;
  }
}

// --- Root Entity ---
class [AggregateName] extends AggregateRoot {
  private readonly id: [AggregateId];
  private [field1]: [Type1];
  private [field2]: [Type2];
  
  // --- Invariants ---
  private assertInvariants(): void {
    // Invariant 1: [description]
    if (![condition1]) {
      throw new InvariantViolationError("[message]");
    }
    // Invariant 2: [description]
    if (![condition2]) {
      throw new InvariantViolationError("[message]");
    }
  }
  
  // --- Business Methods ---
  public [methodName]([params]): void {
    // Pre-conditions
    // Business logic
    // Post-conditions
    this.addDomainEvent(new [EventName](...));
    this.assertInvariants();
  }
}
```

**Example**:

```typescript
// ============================================
// Aggregate: Order
// ============================================

// --- Value Objects ---
class OrderId extends ValueObject {
  private readonly value: UUID;
  
  constructor(value: string) {
    if (!isValidUUID(value)) {
      throw new InvalidValueError("OrderId must be valid UUID");
    }
    this.value = value as UUID;
  }
}

class Money extends ValueObject {
  private readonly amount: number;
  private readonly currency: Currency;
  
  constructor(amount: number, currency: Currency) {
    if (amount < 0) {
      throw new InvalidValueError("Money amount cannot be negative");
    }
    this.amount = amount;
    this.currency = currency;
  }
  
  add(other: Money): Money {
    if (this.currency !== other.currency) {
      throw new CurrencyMismatchError();
    }
    return new Money(this.amount + other.amount, this.currency);
  }
}

// --- Root Entity ---
class Order extends AggregateRoot {
  private readonly id: OrderId;
  private customer: CustomerRef;
  private items: OrderItem[];
  private status: OrderStatus;
  private totalPrice: Money;
  private createdAt: Date;
  
  // --- Invariants ---
  private assertInvariants(): void {
    // Invariant 1: Order must have at least one item
    if (this.items.length === 0) {
      throw new InvariantViolationError("Order must have at least one item");
    }
    
    // Invariant 2: Total price must match sum of items
    const calculatedTotal = this.items.reduce(
      (sum, item) => sum.add(item.subtotal()),
      new Money(0, this.totalPrice.currency)
    );
    if (!this.totalPrice.equals(calculatedTotal)) {
      throw new InvariantViolationError("Total price mismatch");
    }
    
    // Invariant 3: Status must be valid
    if (!OrderStatus.isValid(this.status)) {
      throw new InvariantViolationError("Invalid order status");
    }
  }
  
  // --- Factory Method ---
  static create(customerId: CustomerId, items: OrderItem[]): Order {
    const order = new Order();
    order.id = OrderId.generate();
    order.customer = new CustomerRef(customerId);
    order.items = items;
    order.status = OrderStatus.PENDING;
    order.totalPrice = order.calculateTotal();
    order.createdAt = new Date();
    
    order.assertInvariants();
    order.addDomainEvent(new OrderPlaced(order.id, customerId, items));
    
    return order;
  }
  
  // --- Business Methods ---
  confirm(paymentRef: PaymentRef): void {
    if (this.status !== OrderStatus.PENDING) {
      throw new InvalidOperationError("Can only confirm pending orders");
    }
    
    this.status = OrderStatus.CONFIRMED;
    this.assertInvariants();
    this.addDomainEvent(new OrderConfirmed(this.id, paymentRef));
  }
  
  cancel(reason: CancellationReason): void {
    if (this.status === OrderStatus.DELIVERED) {
      throw new InvalidOperationError("Cannot cancel delivered orders");
    }
    
    this.status = OrderStatus.CANCELLED;
    this.assertInvariants();
    this.addDomainEvent(new OrderCancelled(this.id, reason));
  }
}
```

### 2. Domain Events & Event Flow

Events that capture state transitions.

**Template**:

```typescript
// --- Domain Event ---
class [EventName] extends DomainEvent {
  constructor(
    public readonly aggregateId: [AggregateId],
    public readonly [property1]: [Type1],
    public readonly [property2]: [Type2],
    public readonly occurredAt: Date = new Date()
  ) {
    super();
  }
}
```

**Event Flow Diagram**:

```
[Trigger Action]
    ↓
[Event 1]
    ↓
├─→ [Subscriber A]: [Action]
│      ↓
│   [Event 2]
│      ↓
│   [Result A]
│
└─→ [Subscriber B]: [Action]
       ↓
    [Result B]
```

**Example**:

```typescript
// --- Domain Events ---
class OrderPlaced extends DomainEvent {
  constructor(
    public readonly orderId: OrderId,
    public readonly customerId: CustomerId,
    public readonly items: OrderItem[],
    public readonly occurredAt: Date = new Date()
  ) {
    super();
  }
}

class OrderConfirmed extends DomainEvent {
  constructor(
    public readonly orderId: OrderId,
    public readonly paymentRef: PaymentRef,
    public readonly occurredAt: Date = new Date()
  ) {
    super();
  }
}

class OrderCancelled extends DomainEvent {
  constructor(
    public readonly orderId: OrderId,
    public readonly reason: CancellationReason,
    public readonly occurredAt: Date = new Date()
  ) {
    super();
  }
}
```

**Event Flow**:

```
Customer places order
    ↓
OrderPlaced event
    ↓
├─→ InventoryBC: Reserve items
│      ↓
│   ItemsReserved event
│      ↓
│   Update stock levels
│
└─→ BillingBC: Process payment
       ↓
    PaymentProcessed event
       ↓
    OrderConfirmed event
       ↓
    Notify Customer (email)
```

### 3. Service Specifications

Application and Domain service definitions.

**Template**:

```typescript
// --- Application Service ---
interface [ServiceName] {
  /**
   * [Method description]
   * @param [param] - [description]
   * @returns [return description]
   * @throws [ErrorType] - [when]
   */
  [methodName]([params]): Promise<[ReturnType]>;
}

// --- Domain Service ---
class [DomainServiceName] {
  /**
   * [Description of domain logic that doesn't belong to a single aggregate]
   */
  [methodName]([params]): [ReturnType] {
    // Domain logic
  }
}
```

**Example**:

```typescript
// --- Application Service ---
interface OrderApplicationService {
  /**
   * Creates a new order for a customer
   * @param customerId - The customer placing the order
   * @param items - Items to include in the order
   * @returns The created order with generated ID
   * @throws CustomerNotFoundError - If customer doesn't exist
   * @throws InsufficientInventoryError - If items unavailable
   */
  createOrder(customerId: string, items: CreateOrderItemDto[]): Promise<OrderDto>;
  
  /**
   * Confirms an order after successful payment
   * @throws OrderNotFoundError - If order doesn't exist
   * @throws InvalidOrderStateError - If order not in PENDING state
   */
  confirmOrder(orderId: string, paymentRef: string): Promise<void>;
  
  /**
   * Cancels an existing order
   * @throws OrderNotFoundError - If order doesn't exist
   * @throws OrderAlreadyDeliveredError - If order already delivered
   */
  cancelOrder(orderId: string, reason: string): Promise<void>;
}

// --- Domain Service ---
class PricingService {
  /**
   * Calculates order total including discounts and tax
   * This logic spans multiple aggregates (Order, Customer tier, Promotions)
   */
  calculateOrderTotal(
    items: OrderItem[],
    customerTier: CustomerTier,
    promotions: Promotion[]
  ): Money {
    const subtotal = items.reduce((sum, item) => sum.add(item.subtotal()), Money.zero());
    const discount = this.applyPromotions(subtotal, promotions);
    const tierDiscount = this.applyTierDiscount(subtotal, customerTier);
    const tax = this.calculateTax(subtotal.subtract(discount).subtract(tierDiscount));
    
    return subtotal.subtract(discount).subtract(tierDiscount).add(tax);
  }
}
```

## AI-Assisted Generation

### Domain Model Generation Prompt

```
Context:
- User Stories: [URL to stories.md]
- Glossary: [URL to glossary.yaml]
- Context Map: [URL to context-map.md]

Task:
Generate TypeScript domain model code for the [AggregateName] aggregate.

Requirements:
1. Define root entity class with private fields and encapsulation
2. Include all domain concepts from glossary
3. Express invariants as assertions in methods
4. Include domain event definitions for state transitions
5. Use DDD tactical patterns (Value Objects, Aggregates, etc.)
6. Add JSDoc comments for all public methods

Output Format:
[TypeScript code with comments]
```

## Validation Checklist

Before proceeding to Phase 4:

- [ ] Domain Model covers all aggregates in glossary
- [ ] Each aggregate has 2+ invariants as code assertions
- [ ] All state transitions emit domain events
- [ ] Event flow documented with subscriber actions
- [ ] Service specifications match user story requirements
- [ ] Domain model aligns with acceptance criteria
- [ ] No circular dependencies between aggregates
- [ ] Value Objects are immutable

## Common Issues

| Issue | Solution |
|-------|----------|
| Large aggregate | Split into smaller aggregates with references |
| Missing invariants | Review AC formal constraints; each → invariant |
| Events not connected | Map each state change to event + subscribers |
| Anemic domain model | Move business logic from services into entities |

## Output Artifacts Location

```
project-repo/
└── domain-design/
    ├── domain-model.ts      ← Main domain model file
    ├── aggregates/
    │   ├── order.ts
    │   └── customer.ts
    ├── value-objects/
    │   ├── money.ts
    │   └── order-status.ts
    ├── events/
    │   └── order-events.ts
    ├── services/
    │   └── pricing-service.ts
    └── diagrams/
        └── event-flow.puml
```
