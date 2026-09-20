import type { Express } from 'express';
import listEndpoints from 'express-list-endpoints';
import { cafeOpenApiDocument } from './openapi/cafe.openapi';
import { menuOpenApiDocument } from './openapi/menu.openapi';

type OpenApiOperation = {
  tags: string[];
  summary: string;
  description?: string;
  security?: Array<{ bearerAuth: [] }>;
  parameters?: Array<{
    name: string;
    in: 'path' | 'query';
    required?: boolean;
    description?: string;
    schema: Record<string, unknown>;
    example?: unknown;
  }>;
  requestBody?: {
    required: boolean;
    content: Record<string, unknown>;
  };
  responses: Record<string, unknown>;
};

const METHODS_WITH_BODY = new Set(['post', 'put', 'patch']);
const AUTH_MIDDLEWARES = new Set(['authenticate', 'authorize', 'requireActiveProvider']);

const toOpenApiPath = (path: string) => path.replace(/:([A-Za-z0-9_]+)/g, '{$1}');

const toTitleCase = (value: string) =>
  value
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');

const getTag = (path: string) => {
  const pathWithoutApiPrefix = path.replace(/^\/api\/v\d+/, '') || '/';
  const [, first, second] = pathWithoutApiPrefix.split('/');

  if (!first) {
    return 'Root';
  }

  if (first === 'admin' && second) {
    return `Admin ${toTitleCase(second)}`;
  }

  if (first === 'cafes') {
    return 'Cafes';
  }

  return toTitleCase(first);
};

const getPathParameters = (path: string) => {
  const matches = [...path.matchAll(/:([A-Za-z0-9_]+)/g)];

  return matches.map((match) => ({
    name: match[1],
    in: 'path' as const,
    required: true as const,
    schema: {
      type: 'string',
      ...((match[1] === 'id' || match[1].endsWith('Id')) && { format: 'uuid' }),
    },
  }));
};

const buildSummary = (method: string, path: string) => `${method.toUpperCase()} ${path}`;

const buildRequestBody = (method: string, path: string) => {
  if (!METHODS_WITH_BODY.has(method)) {
    return undefined;
  }

  if (path.includes('/kb/documents') && method === 'post') {
    return {
      required: true,
      content: {
        'multipart/form-data': {
          schema: {
            type: 'object',
            properties: {
              file: {
                type: 'string',
                format: 'binary',
              },
            },
          },
        },
      },
    };
  }

  if (path.includes('/cafes/:cafeId/images') && method === 'post') {
    return {
      required: true,
      content: {
        'multipart/form-data': {
          schema: {
            type: 'object',
            required: ['files'],
            properties: {
              files: {
                type: 'array',
                items: {
                  type: 'string',
                  format: 'binary',
                },
                description: 'Mot hoac nhieu file anh JPG, PNG, WEBP.',
              },
              sort_order: {
                type: 'integer',
                minimum: 0,
                default: 0,
              },
            },
          },
        },
      },
    };
  }

  return {
    required: false,
    content: {
      'application/json': {
        schema: {
          type: 'object',
          additionalProperties: true,
        },
      },
    },
  };
};

const hasAuthMiddleware = (middlewares: string[]) =>
  middlewares.some((middleware) => AUTH_MIDDLEWARES.has(middleware));

const zodOperationDocs = {
  ...(cafeOpenApiDocument.paths as unknown as Record<
    string,
    Record<string, Partial<OpenApiOperation>>
  >),
  ...(menuOpenApiDocument.paths as unknown as Record<
    string,
    Record<string, Partial<OpenApiOperation>>
  >),
} as Record<string, Record<string, Partial<OpenApiOperation>>>;

const getOperationDocs = (path: string, method: string) => zodOperationDocs[path]?.[method];

export const createOpenApiSpec = (app: Express) => {
  const paths: Record<string, Record<string, OpenApiOperation>> = {};

  for (const endpoint of listEndpoints(app)) {
    if (endpoint.path.startsWith('/api-docs')) {
      continue;
    }

    const openApiPath = toOpenApiPath(endpoint.path);
    const parameters = getPathParameters(endpoint.path);

    paths[openApiPath] ??= {};

    for (const rawMethod of endpoint.methods) {
      const method = rawMethod.toLowerCase();
      const requestBody = buildRequestBody(method, endpoint.path);
      const operationDocs = getOperationDocs(openApiPath, method);

      const operation: OpenApiOperation = {
        tags: [getTag(endpoint.path)],
        summary: buildSummary(method, endpoint.path),
        ...(hasAuthMiddleware(endpoint.middlewares) && {
          security: [{ bearerAuth: [] }],
        }),
        ...(parameters.length > 0 && { parameters }),
        ...(requestBody && { requestBody }),
        responses: {
          200: {
            description: 'Successful response',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/ApiResponse',
                },
              },
            },
          },
          400: { $ref: '#/components/responses/BadRequest' },
          401: { $ref: '#/components/responses/Unauthorized' },
          403: { $ref: '#/components/responses/Forbidden' },
          404: { $ref: '#/components/responses/NotFound' },
          500: { $ref: '#/components/responses/InternalServerError' },
        },
      };

      paths[openApiPath][method] = {
        ...operation,
        ...operationDocs,
        tags: operationDocs?.tags ?? operation.tags,
        parameters: operationDocs?.parameters ?? operation.parameters,
        requestBody: operationDocs?.requestBody ?? operation.requestBody,
        responses: operationDocs?.responses ?? operation.responses,
      };
    }
  }

  for (const [path, methods] of Object.entries(zodOperationDocs)) {
    paths[path] ??= {};
    for (const [method, operationDocs] of Object.entries(methods)) {
      if (!paths[path][method]) {
        paths[path][method] = operationDocs as OpenApiOperation;
      }
    }
  }

  return {
    openapi: '3.0.3',
    info: {
      title: 'RCField Backend API',
      version: '1.0.0',
      description:
        'Auto-generated API documentation from Express routes. Request and response schemas are generic unless added manually.',
    },
    servers: [
      {
        url: '/',
        description: 'Current server',
      },
      {
        url: 'http://localhost:3000',
        description: 'Local development',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
      schemas: {
        ...(cafeOpenApiDocument.components?.schemas ?? {}),
        ...(menuOpenApiDocument.components?.schemas ?? {}),
        ApiResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' },
            data: { type: 'object', nullable: true, additionalProperties: true },
          },
          additionalProperties: true,
        },
      },
      responses: {
        BadRequest: {
          description: 'Bad request',
        },
        Unauthorized: {
          description: 'Missing or invalid authentication token',
        },
        Forbidden: {
          description: 'Authenticated user does not have permission',
        },
        NotFound: {
          description: 'Resource not found',
        },
        InternalServerError: {
          description: 'Internal server error',
        },
      },
    },
    paths,
  };
};
