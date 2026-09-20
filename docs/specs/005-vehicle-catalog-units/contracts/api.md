# API Contracts: Vehicle Catalogs & Physical Units

**Date**: 2026-05-30
**Base URL**: `/api/v1`
**Auth**: Bearer JWT

---

## Vehicle Catalog Management

### POST /cafes/:cafeId/vehicle-catalogs

**Auth**: Bearer – PROVIDER (Only active provider who owns this cafe)

**Description**: Create a new vehicle catalog representing a model of rental vehicle. This does not automatically create physical vehicle units.

**Request Body**:
```json
{
  "name": "Tamiya TT-02 Drift Spec",
  "description": "Perfect drift car for beginners",
  "tier": "STANDARD",
  "hourly_rate": 40000,
  "security_deposit": 200000,
  "damage_multiplier": 1.0,
  "compatible_track_types": ["DRIFT"],
  "cover_image_url": "https://cdn.rcfield.vn/vehicles/tamiya-cover.jpg",
  "images": [
    { "url": "https://cdn.rcfield.vn/vehicles/tamiya-detail1.jpg", "sort_order": 0 },
    { "url": "https://cdn.rcfield.vn/vehicles/tamiya-detail2.jpg", "sort_order": 1 }
  ]
}
```

**Response 201**:
```json
{
  "success": true,
  "data": {
    "id": "catalog_uuid",
    "cafeId": "cafe_uuid",
    "name": "Tamiya TT-02 Drift Spec",
    "description": "Perfect drift car for beginners",
    "tier": "STANDARD",
    "hourlyRate": 40000,
    "securityDeposit": 200000,
    "damageMultiplier": 1.0,
    "compatibleTrackTypes": ["DRIFT"],
    "coverImageUrl": "https://cdn.rcfield.vn/vehicles/tamiya-cover.jpg",
    "images": [
      "https://cdn.rcfield.vn/vehicles/tamiya-detail1.jpg",
      "https://cdn.rcfield.vn/vehicles/tamiya-detail2.jpg"
    ],
    "units": []
  }
}
```

**Errors**: `403 FORBIDDEN` | `400 VALIDATION_ERROR` | `404 CAFE_NOT_FOUND`

---

### GET /cafes/:cafeId/vehicle-catalogs

**Auth**: Public / Optional Bearer (All roles)

**Description**: List vehicle catalogs of a cafe, with counts of physical units (total, available, maintenance).

**Response 200**:
```json
{
  "success": true,
  "data": [
    {
      "id": "catalog_uuid",
      "name": "Tamiya TT-02 Drift Spec",
      "description": "Perfect drift car for beginners",
      "tier": "STANDARD",
      "hourlyRate": "40000.00",
      "securityDeposit": "200000.00",
      "damageMultiplier": "1.00",
      "compatibleTrackTypes": ["DRIFT"],
      "coverImageUrl": "https://cdn.rcfield.vn/vehicles/tamiya-cover.jpg",
      "images": [
        "https://cdn.rcfield.vn/vehicles/tamiya-detail1.jpg",
        "https://cdn.rcfield.vn/vehicles/tamiya-detail2.jpg"
      ],
      "total_units": 5,
      "available_units": 3,
      "in_use_units": 1,
      "maintenance_units": 1,
      "retired_units": 0
    }
  ]
}
```

---

### GET /cafes/:cafeId/vehicle-catalogs/:catalogId

**Auth**: Public / Optional Bearer (All roles)

**Description**: Retrieve details of a specific vehicle catalog, including all active physical units (excluding deleted ones). For public roles (Customer, Guest, Admin, unassigned Staff), units with status `RETIRED` are hidden, and the `last_maintenance_at` field is omitted.

**Response 200**:
```json
{
  "success": true,
  "data": {
    "id": "catalog_uuid",
    "name": "Tamiya TT-02 Drift Spec",
    "description": "Perfect drift car for beginners",
    "tier": "STANDARD",
    "hourlyRate": "40000.00",
    "securityDeposit": "200000.00",
    "damageMultiplier": "1.00",
    "compatibleTrackTypes": ["DRIFT"],
    "coverImageUrl": "https://cdn.rcfield.vn/vehicles/tamiya-cover.jpg",
    "images": [
      "https://cdn.rcfield.vn/vehicles/tamiya-detail1.jpg",
      "https://cdn.rcfield.vn/vehicles/tamiya-detail2.jpg"
    ],
    "units": [
      {
        "id": "unit_uuid",
        "status": "AVAILABLE",
        "last_maintenance_at": null,
        "identifier": "Tamiya-TT02-01",
        "color": "Blue",
        "distinctive_image_url": "https://cdn.rcfield.vn/vehicles/unit1.jpg",
        "notes": "Xe mới nhập",
        "metadata": { "body_shell": "Subaru Impreza" }
      }
    ]
  }
}
```

**Errors**: `404 CATALOG_NOT_FOUND`

---

### PATCH /cafes/:cafeId/vehicle-catalogs/:catalogId

**Auth**: Bearer – PROVIDER (Only active provider who owns this cafe)

**Description**: Update metadata and configuration of a vehicle catalog.

**Request Body**:
```json
{
  "name": "Tamiya TT-02 Drift Spec Upgraded",
  "hourly_rate": 45000
}
```

**Response 200**:
```json
{
  "success": true,
  "data": {
    "id": "catalog_uuid",
    "name": "Tamiya TT-02 Drift Spec Upgraded",
    "hourlyRate": 45000
  }
}
```

---

### DELETE /cafes/:cafeId/vehicle-catalogs/:catalogId

**Auth**: Bearer – PROVIDER (Only active provider who owns this cafe)

**Description**: Soft delete a catalog (retiring it from the catalog listing).

**Response 200**:
```json
{
  "success": true,
  "message": "Đã xóa catalog xe thành công"
}
```

---

## Physical Vehicle Unit Management

### POST /cafes/:cafeId/vehicle-catalogs/:catalogId/units

**Auth**: Bearer – PROVIDER (Only active provider who owns this cafe)

**Description**: Add a new physical vehicle unit belonging to a catalog.

**Request Body**:
```json
{
  "status": "AVAILABLE",
  "identifier": "Tamiya-TT02-02",
  "color": "Green",
  "distinctive_image_url": "https://cdn.rcfield.vn/vehicles/unit2.jpg",
  "notes": "Xe trầy xước nhẹ ở vỏ",
  "metadata": { "body_shell": "Ford Mustang" }
}
```

**Response 201**:
```json
{
  "success": true,
  "data": {
    "id": "unit_uuid",
    "status": "AVAILABLE",
    "last_maintenance_at": null,
    "identifier": "Tamiya-TT02-02",
    "color": "Green",
    "distinctive_image_url": "https://cdn.rcfield.vn/vehicles/unit2.jpg",
    "notes": "Xe trầy xước nhẹ ở vỏ",
    "metadata": { "body_shell": "Ford Mustang" }
  }
}
```

---

### GET /cafes/:cafeId/vehicle-catalogs/:catalogId/units

**Auth**: Public / Optional Bearer (All roles)

**Description**: List physical vehicle units of a specific catalog with filters. For public roles (Customer, Guest, Admin, unassigned Staff), units with status `RETIRED` are hidden, and the `last_maintenance_at` field is omitted.

**Query Params**:
```
status    enum    optional    AVAILABLE | IN_USE | MAINTENANCE | RETIRED
search    string  optional    Search by color, identifier, notes
```

**Response 200**:
```json
{
  "success": true,
  "data": [
    {
      "id": "unit_uuid",
      "status": "AVAILABLE",
      "last_maintenance_at": null,
      "identifier": "Tamiya-TT02-02",
      "color": "Green",
      "distinctive_image_url": "https://cdn.rcfield.vn/vehicles/unit2.jpg",
      "notes": "Xe trầy xước nhẹ ở vỏ",
      "metadata": { "body_shell": "Ford Mustang" }
    }
  ]
}
```

---

### GET /cafes/:cafeId/vehicle-catalogs/:catalogId/units/:unitId

**Auth**: Public / Optional Bearer (All roles)

**Description**: Get detail of a specific physical vehicle unit. For public roles (Customer, Guest, Admin, unassigned Staff), `RETIRED` units return a 404 error, and the `last_maintenance_at` field is omitted.

**Response 200**:
```json
{
  "success": true,
  "data": {
    "id": "unit_uuid",
    "catalogId": "catalog_uuid",
    "status": "AVAILABLE",
    "last_maintenance_at": null,
    "identifier": "Tamiya-TT02-02",
    "color": "Green",
    "distinctive_image_url": "https://cdn.rcfield.vn/vehicles/unit2.jpg",
    "notes": "Xe trầy xước nhẹ ở vỏ",
    "metadata": { "body_shell": "Ford Mustang" },
    "createdAt": "2026-05-30T10:00:00.000Z",
    "updatedAt": "2026-05-30T10:00:00.000Z"
  }
}
```

---

### PATCH /cafes/:cafeId/vehicle-catalogs/:catalogId/units/:unitId

**Auth**: Bearer – PROVIDER (Owner) / STAFF (Assigned to cafe)

**Description**: Update a physical unit's status, identifier, color, notes, distinctive image, last maintenance, or metadata.

**Request Body**:
```json
{
  "status": "MAINTENANCE",
  "notes": "Mới thay motor và bánh xe, sẵn sàng cho thuê lại"
}
```

**Response 200**:
```json
{
  "success": true,
  "data": {
    "id": "unit_uuid",
    "status": "MAINTENANCE",
    "notes": "Mới thay motor và bánh xe, sẵn sàng cho thuê lại"
  }
}
```

---

### DELETE /cafes/:cafeId/vehicle-catalogs/:catalogId/units/:unitId

**Auth**: Bearer – PROVIDER (Only active provider who owns this cafe)

**Description**: Soft delete a physical vehicle unit from the fleet.

**Response 200**:
```json
{
  "success": true,
  "message": "Đã xóa xe vật lý thành công"
}
```

---

### GET /cafes/:cafeId/vehicles

**Auth**: Public / Optional Bearer (All roles)

**Description**: Flat fleet listing of all physical vehicles of the cafe with catalog details joined. For public roles (Customer, Guest, Admin, unassigned Staff), units with status `RETIRED` are hidden, and the `last_maintenance_at` field is omitted.

**Query Params**:
```
status      enum    optional    AVAILABLE | IN_USE | MAINTENANCE | RETIRED
catalog_id  uuid    optional    Filter by specific catalog
search      string  optional    Search by identifier, color, notes, catalog name
```

**Response 200**:
```json
{
  "success": true,
  "data": [
    {
      "id": "unit_uuid",
      "catalogId": "catalog_uuid",
      "status": "AVAILABLE",
      "last_maintenance_at": null,
      "identifier": "Tamiya-TT02-02",
      "color": "Green",
      "distinctive_image_url": "https://cdn.rcfield.vn/vehicles/unit2.jpg",
      "notes": "Xe trầy xước nhẹ ở vỏ",
      "metadata": { "body_shell": "Ford Mustang" },
      "catalog": {
        "id": "catalog_uuid",
        "name": "Tamiya TT-02 Drift Spec",
        "tier": "STANDARD",
        "hourlyRate": "40000.00"
      }
    }
  ]
}
```
