import {
  definition as checkAvailabilityDef,
  handler as checkAvailabilityHandler,
} from './check-availability';
import type { CheckAvailabilityArgs } from './check-availability';
import { definition as getPromotionsDef, handler as getPromotionsHandler } from './get-promotions';
import { definition as getPackagesDef, handler as getPackagesHandler } from './get-packages';
import { definition as getMenuDef, handler as getMenuHandler } from './get-menu';
import { definition as getVehiclesDef, handler as getVehiclesHandler } from './get-vehicles';
import { definition as getPricingDef, handler as getPricingHandler } from './get-pricing';
import type { GetPricingArgs } from './get-pricing';

export const toolDefinitions = [
  checkAvailabilityDef,
  getPromotionsDef,
  getPackagesDef,
  getMenuDef,
  getVehiclesDef,
  getPricingDef,
];

// cafeId luôn đến từ widget context, không bao giờ từ args
export async function dispatchTool(
  cafeId: string,
  toolName: string,
  args: Record<string, unknown>,
): Promise<string> {
  switch (toolName) {
    case 'check_availability':
      return checkAvailabilityHandler(cafeId, args as CheckAvailabilityArgs);
    case 'get_promotions':
      return getPromotionsHandler(cafeId);
    case 'get_packages':
      return getPackagesHandler(cafeId);
    case 'get_menu':
      return getMenuHandler(cafeId);
    case 'get_vehicles':
      return getVehiclesHandler(cafeId);
    case 'get_pricing':
      return getPricingHandler(cafeId, args as GetPricingArgs);
    default:
      return JSON.stringify({ error: `Unknown tool: ${toolName}` });
  }
}
