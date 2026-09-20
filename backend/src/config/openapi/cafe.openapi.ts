import { OpenApiGeneratorV3, OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';
import {
  CafeIdParamsSchema,
  CafeImageIdParamsSchema,
  CafeImageResponseSchema,
  CafeImageUploadSchema,
  CafeListQuerySchema,
  CafeResponseSchema,
  CreateCafeSchema,
  UpdateCafeSchema,
  UpdateCafeStatusSchema,
} from '../../validate';

const registry = new OpenAPIRegistry();

const Cafe = registry.register('Cafe', CafeResponseSchema);
const CafeImage = registry.register('CafeImage', CafeImageResponseSchema);
const CreateCafeRequest = registry.register('CreateCafeRequest', CreateCafeSchema);
const UpdateCafeRequest = registry.register('UpdateCafeRequest', UpdateCafeSchema);
const UpdateCafeStatusRequest = registry.register(
  'UpdateCafeStatusRequest',
  UpdateCafeStatusSchema,
);
const CafeListQuery = registry.register('CafeListQuery', CafeListQuerySchema);
const CafeIdParams = registry.register('CafeIdParams', CafeIdParamsSchema);
const CafeImageIdParams = registry.register('CafeImageIdParams', CafeImageIdParamsSchema);
const CafeImageUpload = registry.register('CafeImageUpload', CafeImageUploadSchema);

const cafeListResponse = z.object({
  success: z.boolean().openapi({ example: true }),
  data: z.array(Cafe),
  meta: z.object({
    total: z.number().int().openapi({ example: 1 }),
    page: z.number().int().openapi({ example: 1 }),
    limit: z.number().int().openapi({ example: 20 }),
  }),
});

const cafeResponse = z.object({
  success: z.boolean().openapi({ example: true }),
  data: Cafe,
});

const cafeImageListResponse = z.object({
  success: z.boolean().openapi({ example: true }),
  data: z.array(CafeImage),
});

const cafeImageCreateResponse = z.object({
  success: z.boolean().openapi({ example: true }),
  data: z.array(CafeImage),
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
  path: '/api/v1/cafes',
  tags: ['Cafes'],
  summary: 'List cafes',
  description:
    'Lay danh sach cafe dang hoat dong, ho tro loc theo khu vuc, loai track va phan trang. Public luon chi thay cafe ACTIVE; status filter chi ap dung cho admin/provider.',
  request: {
    query: CafeListQuery,
  },
  responses: {
    200: {
      description: 'Danh sach cafe.',
      content: json(cafeListResponse),
    },
    ...commonErrors,
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/cafes',
  tags: ['Cafes'],
  summary: 'Create cafe',
  description: 'Provider tao cafe moi. Cafe mac dinh o trang thai PENDING cho den khi admin duyet.',
  security: [{ bearerAuth: [] }],
  request: {
    body: {
      required: true,
      content: json(CreateCafeRequest),
    },
  },
  responses: {
    201: {
      description: 'Cafe moi duoc tao.',
      content: json(cafeResponse),
    },
    ...commonErrors,
  },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/cafes/{cafeId}',
  tags: ['Cafes'],
  summary: 'Get cafe by ID',
  description: 'Lay chi tiet mot cafe theo ID. Public chi xem duoc cafe ACTIVE.',
  request: {
    params: CafeIdParams,
  },
  responses: {
    200: {
      description: 'Thong tin chi tiet cafe.',
      content: json(cafeResponse),
    },
    ...commonErrors,
  },
});

registry.registerPath({
  method: 'patch',
  path: '/api/v1/cafes/{cafeId}',
  tags: ['Cafes'],
  summary: 'Update cafe profile',
  description: 'Provider cap nhat thong tin profile cafe thuoc so huu cua minh.',
  security: [{ bearerAuth: [] }],
  request: {
    params: CafeIdParams,
    body: {
      required: true,
      content: json(UpdateCafeRequest),
    },
  },
  responses: {
    200: {
      description: 'Cafe sau khi cap nhat.',
      content: json(cafeResponse),
    },
    ...commonErrors,
  },
});

registry.registerPath({
  method: 'patch',
  path: '/api/v1/cafes/{cafeId}/status',
  tags: ['Cafes'],
  summary: 'Update cafe status',
  description: 'Admin duyet, kich hoat hoac tam ngung cafe.',
  security: [{ bearerAuth: [] }],
  request: {
    params: CafeIdParams,
    body: {
      required: true,
      content: json(UpdateCafeStatusRequest),
    },
  },
  responses: {
    200: {
      description: 'Cafe sau khi doi trang thai.',
      content: json(cafeResponse),
    },
    ...commonErrors,
  },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/cafes/{cafeId}/images',
  tags: ['Cafes'],
  summary: 'List cafe images',
  description: 'Lay danh sach anh gallery cua cafe. Public chi xem duoc anh cua cafe ACTIVE.',
  request: {
    params: CafeIdParams,
  },
  responses: {
    200: {
      description: 'Danh sach anh cafe.',
      content: json(cafeImageListResponse),
    },
    ...commonErrors,
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/cafes/{cafeId}/images',
  tags: ['Cafes'],
  summary: 'Upload cafe images',
  description:
    'Provider so huu cafe hoac admin upload mot hoac nhieu anh JPG, PNG, WEBP vao gallery cafe.',
  security: [{ bearerAuth: [] }],
  request: {
    params: CafeIdParams,
    body: {
      required: true,
      content: {
        'multipart/form-data': {
          schema: CafeImageUpload,
        },
      },
    },
  },
  responses: {
    201: {
      description: 'Anh cafe vua upload.',
      content: json(cafeImageCreateResponse),
    },
    ...commonErrors,
  },
});

registry.registerPath({
  method: 'delete',
  path: '/api/v1/cafe-images/{id}',
  tags: ['Cafes'],
  summary: 'Delete cafe image',
  description: 'Provider so huu cafe hoac admin xoa mot anh khoi gallery cafe.',
  security: [{ bearerAuth: [] }],
  request: {
    params: CafeImageIdParams,
  },
  responses: {
    204: {
      description: 'Anh da duoc xoa.',
    },
    ...commonErrors,
  },
});

const generator = new OpenApiGeneratorV3(registry.definitions);

export const cafeOpenApiDocument = generator.generateDocument({
  openapi: '3.0.3',
  info: {
    title: 'RCField Cafe API',
    version: '1.0.0',
  },
});
