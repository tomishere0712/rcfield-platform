# Feature Specification: Vehicle Catalogs & Physical Units

**Feature Branch**: `005-vehicle-catalog-units`
**Created**: 2026-05-30
**Status**: Active

## User Scenarios & Testing

### User Story 1 — Catalog-Level Definition (Priority: P1)

A Cafe Owner (PROVIDER) wants to define the types of RC cars they offer for rent (e.g. brand, model, speed, category, hourly rate, compatible track types) without managing individual inventory during the catalog setup. 

**Why this priority**: Catalog metadata is the cornerstone of rental bookings, scheduling logic, and storefront display.

**Independent Test**: Can be tested by creating a catalog item and ensuring it exists in the catalog list with 0 physical units, and details display correctly to customers.

**Acceptance Scenarios**:
1. **Given** an active Provider submits valid catalog fields, **When** they create it, **Then** the catalog is saved with 0 physical units.
2. **Given** a catalog is defined, **When** a Customer lists catalogs for the cafe, **Then** they see catalog metadata, hourly rates, and real-time availability counters.

---

### User Story 2 — Physical Fleet Provisioning (Priority: P1)

A Cafe Owner (PROVIDER) wants to register specific physical cars in their inventory (using distinct identifiers, colors, and notes) and link them to a catalog model.

**Why this priority**: Actual session assignments and inventory checking depend on concrete physical units.

**Independent Test**: Can be tested by adding a physical unit under a catalog and verifying it shows in the flat fleet list and catalog details.

**Acceptance Scenarios**:
1. **Given** a catalog exists, **When** a Provider adds a unit with `identifier`, `color`, `distinctive_image_url`, and `notes`, **Then** the unit is saved and linked to the catalog.
2. **Given** a physical unit is added, **When** the catalog is listed, **Then** the catalog's unit counters (`total_units`, `available_units`, `maintenance_units`) update immediately.

---

### User Story 3 — Operations & Maintenance Updates (Priority: P2)

A Cafe Operator (STAFF) assigned to the cafe or the Cafe Owner (PROVIDER) needs to record operational notes (e.g., "damaged body shell", "replaced motor") and update a physical unit's state (e.g., moving to `MAINTENANCE` or `AVAILABLE`).

**Why this priority**: Keeps fleet health status up to date in real time, preventing customers from renting broken cars.

**Independent Test**: Can be tested by authenticating as a Staff member, sending a PATCH to update a physical unit's status and notes, and verifying the changes.

**Acceptance Scenarios**:
1. **Given** a physical unit is `AVAILABLE`, **When** Staff patches its status to `MAINTENANCE` and adds `notes` like "trầy xước body, thay motor", **Then** the unit's status changes, notes are updated, and it is excluded from immediate customer rentals.
2. **Given** a physical unit is in `MAINTENANCE`, **When** Staff completes the repair and patches it back to `AVAILABLE`, **Then** it is immediately available for customer sessions.

---

### User Story 4 — Role-Based Security Enforcement (Priority: P1)

The system restricts access to operations according to user roles:
1. **Platform Administrator (`ADMIN`)**: Does not participate in cafe operations. Blocked from modifying catalogs/units (write/update/delete). Can read public fleet listings and details in a filtered format (no retired units, no maintenance dates).
2. **Business Owner (`PROVIDER`)**: Must own the specific cafe to perform write/update/delete operations on catalogs and units. Can read full details (including retired units and maintenance dates) for their own cafe, but gets filtered public views for other cafes.
3. **Cafe Operator (`STAFF`)**: Must be assigned to the specific cafe to update physical unit statuses/notes. Can view full details for their assigned cafe, but is treated as a public viewer (filtered view) for other cafes. Blocked from creating or deleting catalogs/units.
4. **Customer / Guest**: Can view catalogs and physical unit listings/details. However, physical units with status `RETIRED` are excluded, and the `last_maintenance_at` field is omitted (hidden).

**Why this priority**: Prevents unauthorized modifications of fleet inventory while opening public visibility for customers to inspect available cars before renting.

**Acceptance Scenarios**:
1. **Given** a Staff member assigned to Cafe A, **When** they try to write or update units in Cafe B, **Then** the action is blocked with a `403 Forbidden` error.
2. **Given** an Admin, Customer, or Guest user, **When** they request list/detail of physical units, **Then** they receive a `200 OK` response but `last_maintenance_at` is hidden, and `RETIRED` units are excluded.
3. **Given** an Admin, Customer, or Guest user, **When** they try to write or update units, **Then** the action is blocked with `403 Forbidden`.

---

## Edge Cases

- **Catalog soft-deletion**: When a catalog is soft-deleted, all its linked physical units are also hidden.
- **Deleting units with active bookings**: Physical units cannot be deleted or set to `RETIRED` if they are currently assigned to active play sessions.
- **Staff assignment change**: If a staff member is reassigned to another cafe, their permissions to access the previous cafe's vehicles are revoked immediately.

---

## Requirements

### Functional Requirements

- **FR-001**: System MUST allow PROVIDER to create, update, and soft-delete vehicle catalogs.
- **FR-002**: Creating a catalog MUST NOT automatically generate any physical vehicle units.
- **FR-003**: System MUST allow PROVIDER to create and delete physical vehicle units under a catalog.
- **FR-004**: System MUST allow all roles (including Customer, Guest, Admin, and unassigned Staff) to list and retrieve catalogs and physical units, but MUST filter out `RETIRED` units and hide `last_maintenance_at` for these public roles.
- **FR-005**: System MUST allow both PROVIDER and assigned STAFF to update physical unit properties: `status`, `color`, `distinctive_image_url`, `notes`, `last_maintenance_at`, and `metadata`.
- **FR-006**: System MUST enforce that only the owning PROVIDER and assigned STAFF can perform write/update/delete operations for their cafe.
- **FR-007**: System MUST block ADMIN users from catalog/unit write management, treating them as public read-only viewers.

---

## Success Criteria

### Measurable Outcomes

- **SC-001**: Catalog availability counters are computed and returned within 100ms.
- **SC-002**: Unauthorized role access is blocked 100% of the time, verified via unit and integration tests.
- **SC-003**: Staff operational note updates are persisted and reflected immediately in detail queries.

---

## Clarifications

- **Why rename `vehicle_images`?**: Renamed to `vehicle_catalog_images` to clarify that these are design specs/marketing images for the catalog model, whereas `distinctive_image_url` on the `vehicles` table represents the actual picture of that specific physical unit (e.g. showing color, current scratches).
- **Staff Access**: Operator staff are at the storefront and handle cars directly. They need to mark cars as broken/repaired and write comments (e.g., "body trầy nhẹ") without having permission to alter catalogs or pricing.

---

## Assumptions

- A staff member is assigned to at most one cafe at any point in time.
- Flat listing of vehicles is accessible to all users under filtered visibility, but only managers/assigned staff get full maintenance details and retired units.
- Image storage and upload configurations are handled by the core media service.
