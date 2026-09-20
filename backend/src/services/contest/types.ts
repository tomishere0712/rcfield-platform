import { ContestBanScopeType, ContestStatus, VehicleSource } from '../../types';
import { Viewer } from '../cafe.service';

export type ListContestsOptions = {
  page: number;
  limit: number;
  scope?: 'managed';
  status?: ContestStatus;
  contest_type_id?: string;
  contest_format_id?: string;
  cafe_id?: string;
  query?: string;
  viewer?: Viewer;
};

export type CreateContestBody = {
  name: string;
  description?: string | null;
  contest_type_id: string;
  contest_format_id: string;
  contest_template_id: string;
  track_type_id: string;
  participating_cafe_ids: string[];
  starts_at: Date;
  ends_at: Date;
  registration_opens_at: Date;
  registration_closes_at: Date;
  capacity: number;
  entry_fee: number;
  banner_image_url?: string | null;
  vehicle_rule: Record<string, unknown>;
  config: Record<string, unknown>;
};

export type UpdateContestBody = Partial<CreateContestBody>;

export type CreateRegistrationBody = {
  vehicle_source: VehicleSource;
  /**
   * Thuê xe của quán: khách chọn chi nhánh và DÒNG xe. Không có khung giờ vì
   * lịch thi đấu quyết định, không có giá vì lệ phí giải là khoản duy nhất.
   */
  rental?: {
    cafe_id: string;
    vehicle_catalog_id: string;
  } | null;
  byoc_vehicle_name?: string;
  byoc_vehicle_brand?: string;
  byoc_vehicle_class?: string;
  byoc_vehicle_notes?: string;
  byoc_vehicle_photos?: string[];
};

export type MyContestRegistrationsQuery = {
  query?: string;
  contest_status?: ContestStatus;
  customer_journey_status?:
    | 'PENDING_APPROVAL'
    | 'APPROVED_WAITING_CHECKIN'
    | 'CHECKED_IN_WAITING_BRACKET'
    | 'IN_BRACKET'
    | 'ADVANCED'
    | 'ELIMINATED'
    | 'FINISHED'
    | 'CANCELLED';
};

export type ContestRegistrationsQuery = {
  query?: string;
  status?: 'PENDING' | 'CONFIRMED' | 'CANCELLED' | 'CHECKED_IN';
  payment_status?: 'NOT_REQUIRED' | 'PENDING_PAYMENT' | 'PENDING_REVIEW' | 'WAIVED' | 'MARKED_PAID';
};

export type ContestBanPayload = {
  user_id: string;
  scope_type: ContestBanScopeType;
  reason: string;
  evidence?: Record<string, unknown>;
  expires_at?: Date | null;
};
