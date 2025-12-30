# Phase 4: Data & Implementation Design (Weeks 8-10)

## Objective

Define data schemas and external interfaces that satisfy domain model invariants.

## Deliverables

### 1. Logical & Physical Data Models

Database schema derived from domain model.

**Logical Model Template**:

```sql
-- ============================================
-- Table: [table_name]
-- Description: [What this table stores]
-- Aggregate: [Related aggregate from domain model]
-- ============================================

CREATE TABLE [table_name] (
    -- Primary Key
    [pk_column] [type] PRIMARY KEY,
    
    -- Foreign Keys
    [fk_column] [type] REFERENCES [other_table]([pk]),
    
    -- Attributes
    [column1] [type] NOT NULL,
    [column2] [type] DEFAULT [value],
    
    -- Domain Invariant Constraints
    CONSTRAINT [constraint_name] CHECK ([condition]),
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for common queries
CREATE INDEX idx_[table]_[column] ON [table]([column]);
```

**Example**:

```sql
-- ============================================
-- Table: orders
-- Description: Stores order headers
-- Aggregate: Order
-- ============================================

CREATE TABLE orders (
    -- Primary Key
    order_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Foreign Keys
    customer_id UUID NOT NULL REFERENCES customers(customer_id),
    
    -- Attributes
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    total_amount DECIMAL(10, 2) NOT NULL,
    currency CHAR(3) NOT NULL DEFAULT 'USD',
    
    -- Domain Invariant Constraints
    CONSTRAINT chk_order_status CHECK (
        status IN ('pending', 'confirmed', 'shipped', 'delivered', 'cancelled')
    ),
    CONSTRAINT chk_total_positive CHECK (total_amount > 0),
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- Table: order_items
-- Description: Stores line items for each order
-- Aggregate: Order (child entity)
-- ============================================

CREATE TABLE order_items (
    item_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES orders(order_id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(product_id),
    quantity INT NOT NULL,
    unit_price DECIMAL(10, 2) NOT NULL,
    
    -- Domain Invariant Constraints
    CONSTRAINT chk_quantity_positive CHECK (quantity > 0),
    CONSTRAINT chk_unit_price_positive CHECK (unit_price > 0),
    
    -- Unique constraint
    CONSTRAINT uq_order_product UNIQUE (order_id, product_id)
);

-- ============================================
-- Indexes
-- ============================================

CREATE INDEX idx_orders_customer ON orders(customer_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_created ON orders(created_at DESC);
CREATE INDEX idx_order_items_order ON order_items(order_id);

-- ============================================
-- Trigger: Update timestamp
-- ============================================

CREATE OR REPLACE FUNCTION update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER orders_updated
    BEFORE UPDATE ON orders
    FOR EACH ROW
    EXECUTE FUNCTION update_timestamp();
```

**Migration File Template**:

```sql
-- migrations/001_create_orders_table.sql
-- Description: Creates orders and order_items tables
-- Date: YYYY-MM-DD

BEGIN;

-- Create tables
CREATE TABLE orders (...);
CREATE TABLE order_items (...);

-- Create indexes
CREATE INDEX ...;

-- Create triggers
CREATE TRIGGER ...;

COMMIT;
```

### 2. OpenAPI Specifications

RESTful API definitions.

**Template**:

```yaml
openapi: 3.0.3
info:
  title: [API Name]
  version: 1.0.0
  description: [API description]

servers:
  - url: https://api.example.com/v1
    description: Production

paths:
  /[resource]:
    get:
      summary: [List resources]
      operationId: list[Resources]
      tags:
        - [Resource]
      parameters:
        - name: limit
          in: query
          schema:
            type: integer
            default: 20
      responses:
        '200':
          description: Success
          content:
            application/json:
              schema:
                type: array
                items:
                  $ref: '#/components/schemas/[Resource]'
    
    post:
      summary: [Create resource]
      operationId: create[Resource]
      tags:
        - [Resource]
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/Create[Resource]Request'
      responses:
        '201':
          description: Created
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/[Resource]'
        '400':
          $ref: '#/components/responses/BadRequest'

components:
  schemas:
    [Resource]:
      type: object
      properties:
        id:
          type: string
          format: uuid
        # ... other properties
      required:
        - id
  
  responses:
    BadRequest:
      description: Invalid request
      content:
        application/json:
          schema:
            $ref: '#/components/schemas/Error'
```

**Example**:

```yaml
openapi: 3.0.3
info:
  title: Order Management API
  version: 1.0.0
  description: API for managing customer orders

servers:
  - url: https://api.example.com/v1
    description: Production
  - url: https://api-staging.example.com/v1
    description: Staging

paths:
  /orders:
    get:
      summary: List orders
      operationId: listOrders
      tags:
        - Orders
      parameters:
        - name: customer_id
          in: query
          schema:
            type: string
            format: uuid
        - name: status
          in: query
          schema:
            $ref: '#/components/schemas/OrderStatus'
        - name: limit
          in: query
          schema:
            type: integer
            default: 20
            maximum: 100
        - name: offset
          in: query
          schema:
            type: integer
            default: 0
      responses:
        '200':
          description: List of orders
          content:
            application/json:
              schema:
                type: object
                properties:
                  data:
                    type: array
                    items:
                      $ref: '#/components/schemas/Order'
                  pagination:
                    $ref: '#/components/schemas/Pagination'
    
    post:
      summary: Create a new order
      operationId: createOrder
      tags:
        - Orders
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/CreateOrderRequest'
      responses:
        '201':
          description: Order created
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Order'
        '400':
          $ref: '#/components/responses/BadRequest'
        '422':
          $ref: '#/components/responses/UnprocessableEntity'

  /orders/{orderId}:
    get:
      summary: Get order by ID
      operationId: getOrder
      tags:
        - Orders
      parameters:
        - name: orderId
          in: path
          required: true
          schema:
            type: string
            format: uuid
      responses:
        '200':
          description: Order details
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Order'
        '404':
          $ref: '#/components/responses/NotFound'

  /orders/{orderId}/confirm:
    post:
      summary: Confirm order
      operationId: confirmOrder
      tags:
        - Orders
      parameters:
        - name: orderId
          in: path
          required: true
          schema:
            type: string
            format: uuid
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/ConfirmOrderRequest'
      responses:
        '200':
          description: Order confirmed
        '400':
          $ref: '#/components/responses/BadRequest'
        '404':
          $ref: '#/components/responses/NotFound'

components:
  schemas:
    Order:
      type: object
      properties:
        id:
          type: string
          format: uuid
        customer_id:
          type: string
          format: uuid
        status:
          $ref: '#/components/schemas/OrderStatus'
        items:
          type: array
          items:
            $ref: '#/components/schemas/OrderItem'
        total_amount:
          type: number
          format: decimal
        currency:
          type: string
          pattern: '^[A-Z]{3}$'
        created_at:
          type: string
          format: date-time
      required:
        - id
        - customer_id
        - status
        - items
        - total_amount
        - currency
    
    OrderStatus:
      type: string
      enum:
        - pending
        - confirmed
        - shipped
        - delivered
        - cancelled
    
    OrderItem:
      type: object
      properties:
        product_id:
          type: string
          format: uuid
        quantity:
          type: integer
          minimum: 1
        unit_price:
          type: number
          format: decimal
      required:
        - product_id
        - quantity
        - unit_price
    
    CreateOrderRequest:
      type: object
      properties:
        customer_id:
          type: string
          format: uuid
        items:
          type: array
          items:
            type: object
            properties:
              product_id:
                type: string
                format: uuid
              quantity:
                type: integer
                minimum: 1
            required:
              - product_id
              - quantity
          minItems: 1
      required:
        - customer_id
        - items
    
    ConfirmOrderRequest:
      type: object
      properties:
        payment_reference:
          type: string
      required:
        - payment_reference
    
    Error:
      type: object
      properties:
        code:
          type: string
        message:
          type: string
        details:
          type: array
          items:
            type: object
      required:
        - code
        - message
    
    Pagination:
      type: object
      properties:
        total:
          type: integer
        limit:
          type: integer
        offset:
          type: integer
  
  responses:
    BadRequest:
      description: Invalid request
      content:
        application/json:
          schema:
            $ref: '#/components/schemas/Error'
    NotFound:
      description: Resource not found
      content:
        application/json:
          schema:
            $ref: '#/components/schemas/Error'
    UnprocessableEntity:
      description: Business rule violation
      content:
        application/json:
          schema:
            $ref: '#/components/schemas/Error'
```

### 3. Implementation Code Skeleton

Repository pattern interfaces.

**Template**:

```typescript
// --- Repository Interface ---
interface [Aggregate]Repository {
  findById(id: [AggregateId]): Promise<[Aggregate] | null>;
  save(aggregate: [Aggregate]): Promise<void>;
  delete(id: [AggregateId]): Promise<void>;
  // Query methods
  findBy[Criteria]([params]): Promise<[Aggregate][]>;
}
```

**Example**:

```typescript
// --- Repository Interface ---
interface OrderRepository {
  findById(id: OrderId): Promise<Order | null>;
  save(order: Order): Promise<void>;
  delete(id: OrderId): Promise<void>;
  findByCustomer(customerId: CustomerId, options?: QueryOptions): Promise<Order[]>;
  findByStatus(status: OrderStatus, options?: QueryOptions): Promise<Order[]>;
}

// --- Query Options ---
interface QueryOptions {
  limit?: number;
  offset?: number;
  orderBy?: string;
  orderDirection?: 'ASC' | 'DESC';
}
```

## AI-Assisted Generation

### Data Model Generation Prompt

```
Context:
- Domain Model: [URL to domain-model.ts]
- User Stories with AC: [URL to stories.md]

Task:
Generate:
1. SQL CREATE TABLE statements for PostgreSQL
2. Include all domain invariants as CHECK constraints
3. Add appropriate indexes for common queries
4. Include migration file structure

Requirements:
- Map aggregates to tables
- Preserve referential integrity
- Add audit timestamps (created_at, updated_at)
```

### API Specification Generation Prompt

```
Context:
- Domain Model: [URL to domain-model.ts]
- User Stories: [URL to stories.md]

Task:
Generate OpenAPI 3.0 specification with:
1. CRUD endpoints for each aggregate
2. Action endpoints for state transitions
3. Error responses matching domain errors
4. Request/response schemas from domain model

Output Format: YAML
```

## Validation Checklist

Before proceeding to Phase 5:

- [ ] Data model covers all domain entities
- [ ] All domain invariants implemented as DB constraints
- [ ] Foreign keys match aggregate references
- [ ] Indexes created for query patterns
- [ ] OpenAPI spec covers all user story operations
- [ ] API error responses match domain exceptions
- [ ] Repository interfaces defined for all aggregates
- [ ] Migration scripts tested in dev environment

## Common Issues

| Issue | Solution |
|-------|----------|
| Constraint too complex for DB | Move to application layer validation |
| N+1 query patterns | Add batch query methods to repository |
| Missing API error codes | Map each domain exception to HTTP status |
| Schema drift | Use migration tool (Flyway, Prisma) |

## Output Artifacts Location

```
project-repo/
├── data-model/
│   ├── logical-model.md    ← ER diagram description
│   ├── schema.sql          ← Full schema
│   └── migrations/
│       ├── 001_create_orders.sql
│       └── 002_add_indexes.sql
├── api-specs/
│   ├── openapi.yaml        ← Full API spec
│   └── v1/
│       └── orders.yaml     ← Orders endpoints
└── src/
    └── repositories/
        └── order-repository.ts
```
