import { OpenApiGeneratorV3, OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';
import {
  CafeIdParamsSchema,
  CreateMenuCategorySchema,
  CreateMenuItemSchema,
  MenuCategoryParamsSchema,
  MenuCategoryResponseSchema,
  MenuItemParamsSchema,
  MenuItemResponseSchema,
  MenuListQuerySchema,
  ReorderMenuCategoriesSchema,
  UpdateMenuCategorySchema,
  UpdateMenuItemSchema,
} from '../../validate';

const registry = new OpenAPIRegistry();

const MenuItem = registry.register('MenuItem', MenuItemResponseSchema);
const CreateMenuItemRequest = registry.register('CreateMenuItemRequest', CreateMenuItemSchema);
const UpdateMenuItemRequest = registry.register('UpdateMenuItemRequest', UpdateMenuItemSchema);
const MenuListQuery = registry.register('MenuListQuery', MenuListQuerySchema);
const CafeIdParams = registry.register('CafeIdParams', CafeIdParamsSchema);
const MenuItemParams = registry.register('MenuItemParams', MenuItemParamsSchema);

const MenuCategory = registry.register('MenuCategory', MenuCategoryResponseSchema);
const CreateMenuCategoryRequest = registry.register(
  'CreateMenuCategoryRequest',
  CreateMenuCategorySchema,
);
const UpdateMenuCategoryRequest = registry.register(
  'UpdateMenuCategoryRequest',
  UpdateMenuCategorySchema,
);
const ReorderMenuCategoriesRequest = registry.register(
  'ReorderMenuCategoriesRequest',
  ReorderMenuCategoriesSchema,
);
const MenuCategoryParams = registry.register('MenuCategoryParams', MenuCategoryParamsSchema);

const menuListResponse = z.object({
  success: z.boolean().openapi({ example: true }),
  data: z.array(MenuItem),
  meta: z.object({
    total: z.number().int().openapi({ example: 4 }),
    page: z.number().int().openapi({ example: 1 }),
    limit: z.number().int().openapi({ example: 20 }),
  }),
});

const menuItemResponse = z.object({
  success: z.boolean().openapi({ example: true }),
  data: MenuItem,
});

const commonErrors = {
  400: { $ref: '#/components/responses/BadRequest' },
  401: { $ref: '#/components/responses/Unauthorized' },
  403: { $ref: '#/components/responses/Forbidden' },
  404: { $ref: '#/components/responses/NotFound' },
  500: { $ref: '#/components/responses/InternalServerError' },
};

const json = (schema: z.ZodTypeAny) => ({
  'application/json': {
    schema,
  },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/cafes/{cafeId}/menu',
  tags: ['Menu'],
  summary: 'List cafe menu items',
  description:
    'Lay danh sach mon an/uong cua cafe. Public chi thay mon dang ban cua cafe ACTIVE; provider so huu cafe co the loc ca mon tam an.',
  request: {
    params: CafeIdParams,
    query: MenuListQuery,
  },
  responses: {
    200: {
      description: 'Danh sach menu item.',
      content: json(menuListResponse),
    },
    ...commonErrors,
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/cafes/{cafeId}/menu',
  tags: ['Menu'],
  summary: 'Create cafe menu item',
  description: 'Provider tao mon an/uong moi cho cafe thuoc so huu cua minh.',
  security: [{ bearerAuth: [] }],
  request: {
    params: CafeIdParams,
    body: {
      required: true,
      content: json(CreateMenuItemRequest),
    },
  },
  responses: {
    201: {
      description: 'Menu item moi duoc tao.',
      content: json(menuItemResponse),
    },
    ...commonErrors,
  },
});

registry.registerPath({
  method: 'patch',
  path: '/api/v1/cafes/{cafeId}/menu/{itemId}',
  tags: ['Menu'],
  summary: 'Update cafe menu item',
  description: 'Provider cap nhat mot mon an/uong cua cafe thuoc so huu cua minh.',
  security: [{ bearerAuth: [] }],
  request: {
    params: MenuItemParams,
    body: {
      required: true,
      content: json(UpdateMenuItemRequest),
    },
  },
  responses: {
    200: {
      description: 'Menu item sau khi cap nhat.',
      content: json(menuItemResponse),
    },
    ...commonErrors,
  },
});

registry.registerPath({
  method: 'delete',
  path: '/api/v1/cafes/{cafeId}/menu/{itemId}',
  tags: ['Menu'],
  summary: 'Delete cafe menu item',
  description: 'Provider soft-delete mot mon an/uong cua cafe thuoc so huu cua minh.',
  security: [{ bearerAuth: [] }],
  request: {
    params: MenuItemParams,
  },
  responses: {
    204: {
      description: 'Menu item da duoc soft-delete.',
    },
    ...commonErrors,
  },
});

const popularMenuResponse = z.object({
  success: z.boolean().openapi({ example: true }),
  data: z.array(
    z.object({
      menuItemId: z.string().uuid().openapi({ example: '56d971ce-83ef-4456-b391-7f5673f88001' }),
      orderCount: z.number().int().openapi({ example: 12 }),
    }),
  ),
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/cafes/{cafeId}/menu/popular',
  tags: ['Menu'],
  summary: 'List most-ordered menu items',
  description:
    'Top 3 mon duoc dat nhieu nhat trong 90 ngay, dem tu don F&B co that (COUNT DISTINCT booking). Chi tra ve mon dat nguong toi thieu 3 luot dat — mang rong nghia la chua du du lieu, client KHONG duoc hien so lieu phong doan.',
  request: { params: CafeIdParams },
  responses: {
    200: { description: 'Danh sach mon pho bien.', content: json(popularMenuResponse) },
    ...commonErrors,
  },
});

// ── Menu categories ───────────────────────────────────────────────────────────

const menuCategoryListResponse = z.object({
  success: z.boolean().openapi({ example: true }),
  data: z.array(MenuCategory),
});

const menuCategoryResponse = z.object({
  success: z.boolean().openapi({ example: true }),
  data: MenuCategory,
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/cafes/{cafeId}/menu/categories',
  tags: ['Menu'],
  summary: 'List cafe menu categories',
  description:
    'Danh muc F&B cua chi nhanh, sap theo thu tu hien thi. Cong khai. itemCount tinh ca mon tam ngung ban nen chi dung cho man quan ly cua provider.',
  request: { params: CafeIdParams },
  responses: {
    200: { description: 'Danh sach danh muc.', content: json(menuCategoryListResponse) },
    ...commonErrors,
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/cafes/{cafeId}/menu/categories',
  tags: ['Menu'],
  summary: 'Create menu category',
  description: 'Provider tao danh muc moi cho chi nhanh cua minh. Danh muc moi xep xuong cuoi.',
  security: [{ bearerAuth: [] }],
  request: {
    params: CafeIdParams,
    body: { required: true, content: json(CreateMenuCategoryRequest) },
  },
  responses: {
    201: { description: 'Danh muc vua tao.', content: json(menuCategoryResponse) },
    409: { description: 'Trung ten (CATEGORY_NAME_DUPLICATE) hoac vuot 30 danh muc.' },
    ...commonErrors,
  },
});

registry.registerPath({
  method: 'patch',
  path: '/api/v1/cafes/{cafeId}/menu/categories/reorder',
  tags: ['Menu'],
  summary: 'Reorder menu categories',
  description:
    'Gan lai thu tu hien thi 0..N-1 theo dung thu tu mang. Mang phai chua day du va dung mot lan moi danh muc chua xoa cua chi nhanh.',
  security: [{ bearerAuth: [] }],
  request: {
    params: CafeIdParams,
    body: { required: true, content: json(ReorderMenuCategoriesRequest) },
  },
  responses: {
    200: { description: 'Danh sach sau khi sap xep.', content: json(menuCategoryListResponse) },
    ...commonErrors,
  },
});

registry.registerPath({
  method: 'patch',
  path: '/api/v1/cafes/{cafeId}/menu/categories/{categoryId}',
  tags: ['Menu'],
  summary: 'Rename menu category',
  security: [{ bearerAuth: [] }],
  request: {
    params: MenuCategoryParams,
    body: { required: true, content: json(UpdateMenuCategoryRequest) },
  },
  responses: {
    200: { description: 'Danh muc sau khi doi ten.', content: json(menuCategoryResponse) },
    409: { description: 'Trung ten voi danh muc chua xoa khac (CATEGORY_NAME_DUPLICATE).' },
    ...commonErrors,
  },
});

registry.registerPath({
  method: 'delete',
  path: '/api/v1/cafes/{cafeId}/menu/categories/{categoryId}',
  tags: ['Menu'],
  summary: 'Delete an empty menu category',
  description:
    'Xoa mem mot danh muc RONG. Danh muc con mon se bi tu choi 409 CATEGORY_NOT_EMPTY kem details.itemCount. Mon tam ngung ban van tinh la mon thuoc danh muc.',
  security: [{ bearerAuth: [] }],
  request: { params: MenuCategoryParams },
  responses: {
    204: { description: 'Da xoa mem danh muc.' },
    409: { description: 'Danh muc con mon (CATEGORY_NOT_EMPTY).' },
    ...commonErrors,
  },
});

const generator = new OpenApiGeneratorV3(registry.definitions);

export const menuOpenApiDocument = generator.generateDocument({
  openapi: '3.0.3',
  info: {
    title: 'RCField Menu API',
    version: '1.0.0',
  },
});
