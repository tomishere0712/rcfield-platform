import request from 'supertest';
import { app } from '../../app';

describe('GET /api-docs.json', () => {
  it('documents Cafe endpoints with clean tags, descriptions, and examples', async () => {
    const res = await request(app).get('/api-docs.json');

    expect(res.status).toBe(200);

    const cafeList = res.body.paths['/api/v1/cafes'];
    const cafeDetail = res.body.paths['/api/v1/cafes/{cafeId}'];
    const cafeStatus = res.body.paths['/api/v1/cafes/{cafeId}/status'];
    const cafeMenu = res.body.paths['/api/v1/cafes/{cafeId}/menu'];
    const cafeMenuItem = res.body.paths['/api/v1/cafes/{cafeId}/menu/{itemId}'];

    expect(cafeList).toBeDefined();
    expect(cafeDetail).toBeDefined();
    expect(cafeStatus).toBeDefined();
    expect(cafeMenu).toBeDefined();
    expect(cafeMenuItem).toBeDefined();
    expect(res.body.paths['/api/v1/cafes/{id}']).toBeUndefined();
    expect(res.body.paths['/api/v1/cafes/{cafeId}/images']).toBeDefined();
    expect(res.body.paths['/api/v1/cafe-images/{id}']).toBeDefined();

    const cafeOperations = [
      cafeList.get,
      cafeList.post,
      cafeDetail.get,
      cafeDetail.patch,
      cafeStatus.patch,
    ];

    for (const operation of cafeOperations) {
      expect(operation.tags).toEqual(['Cafes']);
      expect(operation.summary).toEqual(expect.any(String));
      expect(operation.summary).not.toMatch(/^GET |^POST |^PATCH /);
      expect(operation.description).toEqual(expect.any(String));
      expect(operation.description.length).toBeGreaterThan(20);
      expect(operation.responses).toBeDefined();
    }

    expect(cafeList.get.parameters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'page',
          in: 'query',
          schema: expect.objectContaining({ example: 1 }),
        }),
        expect.objectContaining({
          name: 'limit',
          in: 'query',
          schema: expect.objectContaining({ example: 20 }),
        }),
        // Bộ lọc nhận CẢ uuid lẫn mã loại sân (`DRIFT`) để đường dẫn chia sẻ đọc
        // được; ví dụ trong tài liệu dùng mã cho sát cách người dùng thật gõ.
        expect.objectContaining({
          name: 'track_type',
          in: 'query',
          schema: expect.objectContaining({ example: 'DRIFT' }),
        }),
        expect.objectContaining({
          name: 'play_mode',
          in: 'query',
          schema: expect.objectContaining({ example: 'RENTAL' }),
        }),
      ]),
    );

    expect(cafeList.post.requestBody.content['application/json'].schema).toEqual({
      $ref: '#/components/schemas/CreateCafeRequest',
    });
    expect(cafeDetail.patch.requestBody.content['application/json'].schema).toEqual({
      $ref: '#/components/schemas/UpdateCafeRequest',
    });
    expect(cafeStatus.patch.requestBody.content['application/json'].schema).toEqual({
      $ref: '#/components/schemas/UpdateCafeStatusRequest',
    });
    expect(res.body.components.schemas.CreateCafeRequest.properties.name.example).toBe(
      'RC Arena Sai Gon',
    );
    expect(res.body.components.schemas.CreateCafeRequest.properties.track_types.example).toEqual([
      '550e8400-e29b-41d4-a716-446655440000',
      '550e8400-e29b-41d4-a716-446655440001',
    ]);

    expect(cafeDetail.get.parameters).toEqual([
      expect.objectContaining({
        name: 'cafeId',
        in: 'path',
        schema: expect.objectContaining({ format: 'uuid' }),
      }),
    ]);
    expect(cafeDetail.get.responses[200].content['application/json'].schema).toBeDefined();
    expect(cafeStatus.patch.responses[200].content['application/json'].schema).toBeDefined();
    expect(res.body.components.schemas.Cafe.properties.status.enum).toEqual([
      'PENDING',
      'ACTIVE',
      'SUSPENDED',
    ]);
    expect(res.body.components.schemas.Cafe.properties.status.example).toBe('ACTIVE');
    expect(res.body.components.schemas.CafeImageUpload.properties.files.items).toMatchObject({
      type: 'string',
      format: 'binary',
    });
    expect(
      res.body.paths['/api/v1/cafes/{cafeId}/images'].post.requestBody.content[
        'multipart/form-data'
      ].schema,
    ).toEqual({ $ref: '#/components/schemas/CafeImageUpload' });
    expect(res.body.paths['/api/v1/cafe-images/{id}'].delete.responses[204]).toBeDefined();

    const cafeTags = cafeOperations.flatMap((operation) => operation.tags);
    expect(cafeTags).not.toEqual(expect.arrayContaining(['Id', ':id', 'CafeId']));

    const menuOperations = [cafeMenu.get, cafeMenu.post, cafeMenuItem.patch, cafeMenuItem.delete];
    for (const operation of menuOperations) {
      expect(operation.tags).toEqual(['Menu']);
      expect(operation.summary).toEqual(expect.any(String));
      expect(operation.summary).not.toMatch(/^GET |^POST |^PATCH |^DELETE /);
      expect(operation.description).toEqual(expect.any(String));
      expect(operation.description.length).toBeGreaterThan(20);
    }
    expect(cafeMenu.get.security).toBeUndefined();
    expect(cafeMenu.post.security).toEqual([{ bearerAuth: [] }]);
    expect(cafeMenuItem.patch.security).toEqual([{ bearerAuth: [] }]);
    expect(cafeMenuItem.delete.security).toEqual([{ bearerAuth: [] }]);

    expect(cafeMenu.get.parameters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'cafeId', in: 'path' }),
        expect.objectContaining({ name: 'page', in: 'query' }),
        expect.objectContaining({ name: 'limit', in: 'query' }),
        expect.objectContaining({ name: 'category_id', in: 'query' }),
        expect.objectContaining({ name: 'available', in: 'query' }),
      ]),
    );
    expect(cafeMenu.post.requestBody.content['application/json'].schema).toEqual({
      $ref: '#/components/schemas/CreateMenuItemRequest',
    });
    expect(cafeMenuItem.patch.requestBody.content['application/json'].schema).toEqual({
      $ref: '#/components/schemas/UpdateMenuItemRequest',
    });
    expect(cafeMenuItem.patch.parameters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'cafeId',
          in: 'path',
          schema: expect.objectContaining({ format: 'uuid' }),
        }),
        expect.objectContaining({
          name: 'itemId',
          in: 'path',
          schema: expect.objectContaining({ format: 'uuid' }),
        }),
      ]),
    );
    expect(cafeMenuItem.delete.responses[204]).toBeDefined();
    expect(res.body.components.schemas.CreateMenuItemRequest.properties.price.example).toBe(55000);
    expect(res.body.components.schemas.MenuItem.properties.isAvailable.example).toBe(true);
  });
});
