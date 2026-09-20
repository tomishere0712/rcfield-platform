import request from 'supertest';
import { app } from '../../app';
import { AppDataSource } from '../../config/database';
import { CafeStatus, ProviderStatus, SubscriptionStatus, UserRole } from '../../types';
import { createTestCafe, createTestUser, generateToken } from '../helpers';

async function activateProvider(providerId: string): Promise<void> {
  await AppDataSource.query(
    `INSERT INTO provider_profiles
       (user_id, business_name, registration_status)
     VALUES ($1, $2, $3)`,
    [providerId, 'Test RC Business', ProviderStatus.ACTIVE],
  );

  const [plan] = await AppDataSource.query<{ id: string }[]>(
    `SELECT id FROM subscription_plans WHERE name = 'TRIAL' LIMIT 1`,
  );

  await AppDataSource.query(
    `INSERT INTO provider_subscriptions
       (provider_id, plan_id, status, started_at, expires_at, ai_quota_reset_at)
     VALUES ($1, $2, $3, NOW(), NOW() + INTERVAL '30 days', NOW() + INTERVAL '1 month')`,
    [providerId, plan.id, SubscriptionStatus.TRIAL],
  );
}

let driftId: string;

beforeAll(async () => {
  const trackTypes = await AppDataSource.query(`SELECT id, code FROM track_types`);
  const trackTypeMap = new Map<string, string>(
    trackTypes.map((t: { id: string; code: string }) => [t.code, t.id]),
  );
  driftId = trackTypeMap.get('DRIFT')!;
});

function vehicleCatalogBody(overrides: Record<string, unknown> = {}) {
  return {
    name: 'Tamiya TT-02 Drift Spec',
    description: 'Perfect drift car for beginners',
    tier: 'STANDARD',
    hourly_rate: 40000,
    security_deposit: 200000,
    compatible_track_types: [driftId],
    cover_image_url: 'https://cdn.rcfield.vn/vehicles/tamiya-cover.jpg',
    images: [
      { url: 'https://cdn.rcfield.vn/vehicles/tamiya-detail1.jpg', sort_order: 0 },
      { url: 'https://cdn.rcfield.vn/vehicles/tamiya-detail2.jpg', sort_order: 1 },
    ],
    ...overrides,
  };
}

describe('Vehicle Catalog Routes', () => {
  it('Provider ACTIVE tạo vehicle catalog được, không tự động tạo xe vật lý nào', async () => {
    const provider = await createTestUser({ role: UserRole.PROVIDER });
    await activateProvider(provider.id);
    const cafe = await createTestCafe({ provider_id: provider.id });

    const res = await request(app)
      .post(`/api/v1/cafes/${cafe.id}/vehicle-catalogs`)
      .set('Authorization', `Bearer ${generateToken(provider)}`)
      .send(vehicleCatalogBody());

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.name).toBe('Tamiya TT-02 Drift Spec');
    expect(res.body.data.images).toHaveLength(2);
    // Check that 0 physical units were automatically created
    expect(res.body.data.units).toHaveLength(0);
  });

  it('Provider chưa được duyệt hoặc inactive không tạo được vehicle catalog', async () => {
    const provider = await createTestUser({ role: UserRole.PROVIDER });
    const cafe = await createTestCafe({ provider_id: provider.id });

    const res = await request(app)
      .post(`/api/v1/cafes/${cafe.id}/vehicle-catalogs`)
      .set('Authorization', `Bearer ${generateToken(provider)}`)
      .send(vehicleCatalogBody());

    expect(res.status).toBe(403);
  });

  it('Khách hàng/Customer list được catalog xe của quán', async () => {
    const provider = await createTestUser({ role: UserRole.PROVIDER });
    await activateProvider(provider.id);
    const cafe = await createTestCafe({ provider_id: provider.id });

    // Create a catalog item
    const catalogRes = await request(app)
      .post(`/api/v1/cafes/${cafe.id}/vehicle-catalogs`)
      .set('Authorization', `Bearer ${generateToken(provider)}`)
      .send(vehicleCatalogBody({ name: 'Car A' }));

    const catalogId = catalogRes.body.data.id;

    // Manually add 1 physical unit
    await request(app)
      .post(`/api/v1/cafes/${cafe.id}/vehicle-catalogs/${catalogId}/units`)
      .set('Authorization', `Bearer ${generateToken(provider)}`)
      .send({ status: 'AVAILABLE' });

    const customer = await createTestUser({ role: UserRole.CUSTOMER });

    const res = await request(app)
      .get(`/api/v1/cafes/${cafe.id}/vehicle-catalogs`)
      .set('Authorization', `Bearer ${generateToken(customer)}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].name).toBe('Car A');
    expect(res.body.data[0].total_units).toBe(1);
    expect(res.body.data[0].available_units).toBe(1);
  });

  it('Provider cập nhật được catalog xe của mình', async () => {
    const provider = await createTestUser({ role: UserRole.PROVIDER });
    await activateProvider(provider.id);
    const cafe = await createTestCafe({ provider_id: provider.id });

    const createRes = await request(app)
      .post(`/api/v1/cafes/${cafe.id}/vehicle-catalogs`)
      .set('Authorization', `Bearer ${generateToken(provider)}`)
      .send(vehicleCatalogBody());

    const catalogId = createRes.body.data.id;

    const res = await request(app)
      .patch(`/api/v1/cafes/${cafe.id}/vehicle-catalogs/${catalogId}`)
      .set('Authorization', `Bearer ${generateToken(provider)}`)
      .send({ name: 'Tamiya TT-02 Upgraded', hourly_rate: 55000 });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.name).toBe('Tamiya TT-02 Upgraded');
    expect(Number(res.body.data.hourlyRate)).toBe(55000);
  });

  it('Provider delete (retire) catalog xe thành công (soft delete)', async () => {
    const provider = await createTestUser({ role: UserRole.PROVIDER });
    await activateProvider(provider.id);
    const cafe = await createTestCafe({ provider_id: provider.id });

    const createRes = await request(app)
      .post(`/api/v1/cafes/${cafe.id}/vehicle-catalogs`)
      .set('Authorization', `Bearer ${generateToken(provider)}`)
      .send(vehicleCatalogBody());

    const catalogId = createRes.body.data.id;

    const deleteRes = await request(app)
      .delete(`/api/v1/cafes/${cafe.id}/vehicle-catalogs/${catalogId}`)
      .set('Authorization', `Bearer ${generateToken(provider)}`);

    expect(deleteRes.status).toBe(200);

    // Should not show in listing
    const listRes = await request(app)
      .get(`/api/v1/cafes/${cafe.id}/vehicle-catalogs`)
      .set('Authorization', `Bearer ${generateToken(provider)}`);

    expect(listRes.body.data).toHaveLength(0);
  });

  describe('Physical Vehicle Unit Operations', () => {
    it('Cho phép Provider thêm, cập nhật, và xóa xe vật lý cho một catalog', async () => {
      const provider = await createTestUser({ role: UserRole.PROVIDER });
      await activateProvider(provider.id);
      const cafe = await createTestCafe({ provider_id: provider.id });

      // 1. Create Catalog
      const catalogRes = await request(app)
        .post(`/api/v1/cafes/${cafe.id}/vehicle-catalogs`)
        .set('Authorization', `Bearer ${generateToken(provider)}`)
        .send(vehicleCatalogBody());
      const catalogId = catalogRes.body.data.id;

      // 2. Add physical unit
      const addUnitRes = await request(app)
        .post(`/api/v1/cafes/${cafe.id}/vehicle-catalogs/${catalogId}/units`)
        .set('Authorization', `Bearer ${generateToken(provider)}`)
        .send({
          status: 'AVAILABLE',
          identifier: 'Tamiya-TT02-RED-01',
          color: 'Red',
          distinctive_image_url: 'http://example.com/red-car.jpg',
          notes: 'Xe mới nhập, chạy rất êm',
          metadata: { body_shell: 'Nissan GT-R', scale: '1:10' },
        });

      expect(addUnitRes.status).toBe(201);
      expect(addUnitRes.body.success).toBe(true);
      expect(addUnitRes.body.data.status).toBe('AVAILABLE');
      expect(addUnitRes.body.data.identifier).toBe('Tamiya-TT02-RED-01');
      expect(addUnitRes.body.data.color).toBe('Red');
      expect(addUnitRes.body.data.distinctive_image_url).toBe('http://example.com/red-car.jpg');
      expect(addUnitRes.body.data.notes).toBe('Xe mới nhập, chạy rất êm');
      expect(addUnitRes.body.data.metadata).toEqual({ body_shell: 'Nissan GT-R', scale: '1:10' });
      const unitId = addUnitRes.body.data.id;

      // 3. Update physical unit (maintenance status and fields)
      const maintenanceTime = new Date().toISOString();
      const updateUnitRes = await request(app)
        .patch(`/api/v1/cafes/${cafe.id}/vehicle-catalogs/${catalogId}/units/${unitId}`)
        .set('Authorization', `Bearer ${generateToken(provider)}`)
        .send({
          status: 'MAINTENANCE',
          last_maintenance_at: maintenanceTime,
          identifier: 'Tamiya-TT02-RED-01-Updated',
          color: 'Dark Red',
          distinctive_image_url: 'http://example.com/red-car-updated.jpg',
          notes: 'Đã thay motor và trầy xước nhẹ ở body',
          metadata: { body_shell: 'Nissan GT-R R35', scale: '1:10' },
        });

      expect(updateUnitRes.status).toBe(200);
      expect(updateUnitRes.body.data.status).toBe('MAINTENANCE');
      expect(new Date(updateUnitRes.body.data.last_maintenance_at).getTime()).toBeCloseTo(
        new Date(maintenanceTime).getTime(),
        -3,
      );
      expect(updateUnitRes.body.data.identifier).toBe('Tamiya-TT02-RED-01-Updated');
      expect(updateUnitRes.body.data.color).toBe('Dark Red');
      expect(updateUnitRes.body.data.distinctive_image_url).toBe(
        'http://example.com/red-car-updated.jpg',
      );
      expect(updateUnitRes.body.data.notes).toBe('Đã thay motor và trầy xước nhẹ ở body');
      expect(updateUnitRes.body.data.metadata).toEqual({
        body_shell: 'Nissan GT-R R35',
        scale: '1:10',
      });

      // Verify stats count on listing
      const listRes = await request(app)
        .get(`/api/v1/cafes/${cafe.id}/vehicle-catalogs`)
        .set('Authorization', `Bearer ${generateToken(provider)}`);
      expect(listRes.body.data[0].total_units).toBe(1);
      expect(listRes.body.data[0].available_units).toBe(0);
      expect(listRes.body.data[0].maintenance_units).toBe(1);

      // Verify catalog detail returns all new fields
      const detailResBeforeDelete = await request(app)
        .get(`/api/v1/cafes/${cafe.id}/vehicle-catalogs/${catalogId}`)
        .set('Authorization', `Bearer ${generateToken(provider)}`);
      expect(detailResBeforeDelete.body.data.units).toHaveLength(1);
      expect(detailResBeforeDelete.body.data.units[0].identifier).toBe(
        'Tamiya-TT02-RED-01-Updated',
      );
      expect(detailResBeforeDelete.body.data.units[0].color).toBe('Dark Red');
      expect(detailResBeforeDelete.body.data.units[0].distinctive_image_url).toBe(
        'http://example.com/red-car-updated.jpg',
      );
      expect(detailResBeforeDelete.body.data.units[0].notes).toBe(
        'Đã thay motor và trầy xước nhẹ ở body',
      );
      expect(detailResBeforeDelete.body.data.units[0].metadata).toEqual({
        body_shell: 'Nissan GT-R R35',
        scale: '1:10',
      });

      // 3b. Verify fetching a single vehicle unit detail
      const singleUnitRes = await request(app)
        .get(`/api/v1/cafes/${cafe.id}/vehicle-catalogs/${catalogId}/units/${unitId}`)
        .set('Authorization', `Bearer ${generateToken(provider)}`);
      expect(singleUnitRes.status).toBe(200);
      expect(singleUnitRes.body.data.identifier).toBe('Tamiya-TT02-RED-01-Updated');
      expect(singleUnitRes.body.data.notes).toBe('Đã thay motor và trầy xước nhẹ ở body');
      expect(singleUnitRes.body.data.status).toBe('MAINTENANCE');

      // 3c. Verify flat list of all physical vehicles of the cafe
      const flatListRes = await request(app)
        .get(`/api/v1/cafes/${cafe.id}/vehicles`)
        .set('Authorization', `Bearer ${generateToken(provider)}`);
      expect(flatListRes.status).toBe(200);
      expect(flatListRes.body.data).toHaveLength(1);
      expect(flatListRes.body.data[0].identifier).toBe('Tamiya-TT02-RED-01-Updated');
      expect(flatListRes.body.data[0].catalog.name).toBe('Tamiya TT-02 Drift Spec');

      // 3d. Verify flat list filters
      const filterResMatch = await request(app)
        .get(`/api/v1/cafes/${cafe.id}/vehicles?status=MAINTENANCE&search=motor`)
        .set('Authorization', `Bearer ${generateToken(provider)}`);
      expect(filterResMatch.body.data).toHaveLength(1);

      const filterResNoMatch = await request(app)
        .get(`/api/v1/cafes/${cafe.id}/vehicles?status=AVAILABLE`)
        .set('Authorization', `Bearer ${generateToken(provider)}`);
      expect(filterResNoMatch.body.data).toHaveLength(0);

      // 3e. Verify listing units for specific catalog
      const catalogUnitsRes = await request(app)
        .get(`/api/v1/cafes/${cafe.id}/vehicle-catalogs/${catalogId}/units?status=MAINTENANCE`)
        .set('Authorization', `Bearer ${generateToken(provider)}`);
      expect(catalogUnitsRes.status).toBe(200);
      expect(catalogUnitsRes.body.data).toHaveLength(1);
      expect(catalogUnitsRes.body.data[0].identifier).toBe('Tamiya-TT02-RED-01-Updated');

      // 4. Delete physical unit
      const deleteUnitRes = await request(app)
        .delete(`/api/v1/cafes/${cafe.id}/vehicle-catalogs/${catalogId}/units/${unitId}`)
        .set('Authorization', `Bearer ${generateToken(provider)}`);
      expect(deleteUnitRes.status).toBe(200);

      // Verify deleted unit is no longer in catalog detail
      const detailRes = await request(app)
        .get(`/api/v1/cafes/${cafe.id}/vehicle-catalogs/${catalogId}`)
        .set('Authorization', `Bearer ${generateToken(provider)}`);
      expect(detailRes.body.data.units).toHaveLength(0);
    });

    it('Cho phép Staff thuộc chi nhánh xem danh sách và cập nhật trạng thái/notes của xe vật lý', async () => {
      const provider = await createTestUser({ role: UserRole.PROVIDER });
      await activateProvider(provider.id);
      const cafe = await createTestCafe({ provider_id: provider.id });

      // Create Catalog & Physical Unit
      const catalogRes = await request(app)
        .post(`/api/v1/cafes/${cafe.id}/vehicle-catalogs`)
        .set('Authorization', `Bearer ${generateToken(provider)}`)
        .send(vehicleCatalogBody());
      const catalogId = catalogRes.body.data.id;

      const addUnitRes = await request(app)
        .post(`/api/v1/cafes/${cafe.id}/vehicle-catalogs/${catalogId}/units`)
        .set('Authorization', `Bearer ${generateToken(provider)}`)
        .send({ status: 'AVAILABLE', identifier: 'Unit-A' });
      const unitId = addUnitRes.body.data.id;

      // Create Staff and assign to Cafe
      const staff = await createTestUser({ role: UserRole.STAFF });
      await AppDataSource.query(
        `INSERT INTO staff_cafe_assignments (staff_id, cafe_id, assigned_by) VALUES ($1, $2, $3)`,
        [staff.id, cafe.id, provider.id],
      );

      // 1. Staff can view flat fleet list
      const staffListRes = await request(app)
        .get(`/api/v1/cafes/${cafe.id}/vehicles`)
        .set('Authorization', `Bearer ${generateToken(staff)}`);
      expect(staffListRes.status).toBe(200);
      expect(staffListRes.body.data).toHaveLength(1);

      // 2. Staff can view catalog units list
      const staffCatalogListRes = await request(app)
        .get(`/api/v1/cafes/${cafe.id}/vehicle-catalogs/${catalogId}/units`)
        .set('Authorization', `Bearer ${generateToken(staff)}`);
      expect(staffCatalogListRes.status).toBe(200);
      expect(staffCatalogListRes.body.data).toHaveLength(1);

      // 3. Staff can view unit detail
      const staffDetailRes = await request(app)
        .get(`/api/v1/cafes/${cafe.id}/vehicle-catalogs/${catalogId}/units/${unitId}`)
        .set('Authorization', `Bearer ${generateToken(staff)}`);
      expect(staffDetailRes.status).toBe(200);
      expect(staffDetailRes.body.data.identifier).toBe('Unit-A');

      // 4. Staff can update unit (status, notes, etc.)
      const staffUpdateRes = await request(app)
        .patch(`/api/v1/cafes/${cafe.id}/vehicle-catalogs/${catalogId}/units/${unitId}`)
        .set('Authorization', `Bearer ${generateToken(staff)}`)
        .send({ status: 'MAINTENANCE', notes: 'Thay motor bởi Staff' });
      expect(staffUpdateRes.status).toBe(200);
      expect(staffUpdateRes.body.data.status).toBe('MAINTENANCE');
      expect(staffUpdateRes.body.data.notes).toBe('Thay motor bởi Staff');

      // 5. Staff cannot create new physical units
      const staffCreateRes = await request(app)
        .post(`/api/v1/cafes/${cafe.id}/vehicle-catalogs/${catalogId}/units`)
        .set('Authorization', `Bearer ${generateToken(staff)}`)
        .send({ status: 'AVAILABLE', identifier: 'Unit-B' });
      expect(staffCreateRes.status).toBe(403);

      // 6. Staff cannot delete physical units
      const staffDeleteRes = await request(app)
        .delete(`/api/v1/cafes/${cafe.id}/vehicle-catalogs/${catalogId}/units/${unitId}`)
        .set('Authorization', `Bearer ${generateToken(staff)}`);
      expect(staffDeleteRes.status).toBe(403);
    });

    it('Staff không thuộc chi nhánh và Admin/Customer/Guest được xem chi tiết xe dạng rút gọn nhưng không được write/update/delete', async () => {
      const provider = await createTestUser({ role: UserRole.PROVIDER });
      await activateProvider(provider.id);
      const cafe = await createTestCafe({ provider_id: provider.id });

      const catalogRes = await request(app)
        .post(`/api/v1/cafes/${cafe.id}/vehicle-catalogs`)
        .set('Authorization', `Bearer ${generateToken(provider)}`)
        .send(vehicleCatalogBody());
      const catalogId = catalogRes.body.data.id;

      const addUnitRes = await request(app)
        .post(`/api/v1/cafes/${cafe.id}/vehicle-catalogs/${catalogId}/units`)
        .set('Authorization', `Bearer ${generateToken(provider)}`)
        .send({
          status: 'AVAILABLE',
          identifier: 'Unit-X',
          notes: 'No issue',
          metadata: { body_shell: 'Mustang' },
        });
      const unitId = addUnitRes.body.data.id;

      // Update last_maintenance_at manually using query to have a value to test
      await AppDataSource.query(`UPDATE vehicles SET last_maintenance_at = NOW() WHERE id = $1`, [
        unitId,
      ]);

      const otherStaff = await createTestUser({ role: UserRole.STAFF });
      const admin = await createTestUser({ role: UserRole.ADMIN });
      const customer = await createTestUser({ role: UserRole.CUSTOMER });

      // 1. Other staff, admin, customer, guest can read details but last_maintenance_at is hidden
      for (const token of [
        generateToken(otherStaff),
        generateToken(admin),
        generateToken(customer),
        null,
      ]) {
        const reqBuilder = request(app).get(
          `/api/v1/cafes/${cafe.id}/vehicle-catalogs/${catalogId}/units/${unitId}`,
        );
        if (token) {
          reqBuilder.set('Authorization', `Bearer ${token}`);
        }
        const res = await reqBuilder;
        expect(res.status).toBe(200);
        expect(res.body.data.identifier).toBe('Unit-X');
        expect(res.body.data.metadata).toEqual({ body_shell: 'Mustang' });
        expect(res.body.data.last_maintenance_at).toBeUndefined();
      }

      // 2. Write operations (e.g. update unit status) are forbidden for other staff, admin, and customer
      for (const token of [
        generateToken(otherStaff),
        generateToken(admin),
        generateToken(customer),
      ]) {
        const res = await request(app)
          .patch(`/api/v1/cafes/${cafe.id}/vehicle-catalogs/${catalogId}/units/${unitId}`)
          .set('Authorization', `Bearer ${token}`)
          .send({ status: 'MAINTENANCE' });
        expect(res.status).toBe(403);
      }
    });

    it('Không hiển thị xe vật lý có trạng thái RETIRED cho Customer/Guest và chặn truy cập chi tiết', async () => {
      const provider = await createTestUser({ role: UserRole.PROVIDER });
      await activateProvider(provider.id);
      const cafe = await createTestCafe({ provider_id: provider.id });

      const catalogRes = await request(app)
        .post(`/api/v1/cafes/${cafe.id}/vehicle-catalogs`)
        .set('Authorization', `Bearer ${generateToken(provider)}`)
        .send(vehicleCatalogBody());
      const catalogId = catalogRes.body.data.id;

      // Add a retired unit
      const retiredUnitRes = await request(app)
        .post(`/api/v1/cafes/${cafe.id}/vehicle-catalogs/${catalogId}/units`)
        .set('Authorization', `Bearer ${generateToken(provider)}`)
        .send({ status: 'RETIRED', identifier: 'Retired-Car' });
      const retiredUnitId = retiredUnitRes.body.data.id;

      const customer = await createTestUser({ role: UserRole.CUSTOMER });

      // 1. Guest/Customer querying catalog details should see 0 units (since it's retired)
      const catalogDetailRes = await request(app)
        .get(`/api/v1/cafes/${cafe.id}/vehicle-catalogs/${catalogId}`)
        .set('Authorization', `Bearer ${generateToken(customer)}`);
      expect(catalogDetailRes.body.data.units).toHaveLength(0);

      // 2. Guest/Customer querying flat units list should see 0 units
      const flatListRes = await request(app)
        .get(`/api/v1/cafes/${cafe.id}/vehicles`)
        .set('Authorization', `Bearer ${generateToken(customer)}`);
      expect(flatListRes.body.data).toHaveLength(0);

      // 3. Guest/Customer querying units for catalog list should see 0 units
      const unitsListRes = await request(app)
        .get(`/api/v1/cafes/${cafe.id}/vehicle-catalogs/${catalogId}/units`)
        .set('Authorization', `Bearer ${generateToken(customer)}`);
      expect(unitsListRes.body.data).toHaveLength(0);

      // 4. Guest/Customer accessing detail of retired unit directly gets 404
      const directDetailRes = await request(app)
        .get(`/api/v1/cafes/${cafe.id}/vehicle-catalogs/${catalogId}/units/${retiredUnitId}`)
        .set('Authorization', `Bearer ${generateToken(customer)}`);
      expect(directDetailRes.status).toBe(404);

      // 5. Provider querying details STILL sees the retired unit
      const providerDetailRes = await request(app)
        .get(`/api/v1/cafes/${cafe.id}/vehicle-catalogs/${catalogId}`)
        .set('Authorization', `Bearer ${generateToken(provider)}`);
      expect(providerDetailRes.body.data.units).toHaveLength(1);
      expect(providerDetailRes.body.data.units[0].identifier).toBe('Retired-Car');
    });
  });
});
