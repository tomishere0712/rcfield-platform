export type UserRole = 'CUSTOMER' | 'PROVIDER' | 'STAFF' | 'ADMIN';

export type ContestStatus = 'DRAFT' | 'OPEN' | 'CLOSED' | 'RUNNING' | 'COMPLETED' | 'CANCELLED';

export type ContestRegistrationStatus = 'PENDING' | 'CONFIRMED' | 'CHECKED_IN' | 'CANCELLED';

export type ContestEntryFeePaymentStatus = 'PENDING_PAYMENT' | 'PENDING_REVIEW' | 'MARKED_PAID' | 'WAIVED' | 'NOT_REQUIRED';

export type ContestMatchStatus = 'DRAFT' | 'READY' | 'RUNNING' | 'COMPLETED' | 'CANCELLED';

export type ContestParticipantStatus = 'READY' | 'FINISHED' | 'DNS' | 'DNF' | 'DQ';

export type VehicleSource = 'RENTAL' | 'BYOC';

export interface ByocDeclaration {
  vehicle_name: string;
  vehicle_brand: string | null;
  vehicle_class: string | null;
  notes: string | null;
  photos: string[];
}

export interface ContestRegistration {
  id: string;
  contest_id: string;
  user_id: string;
  participant_role_snapshot?: UserRole;
  vehicle_source: VehicleSource;
  rental_catalog_id: string | null;
  rental_cafe_id: string | null;
  vehicle_id: string | null;
  customer_vehicle_id?: string | null;
  booking_id: string | null;
  status: ContestRegistrationStatus;
  check_in_code: string;
  entry_fee_amount: number;
  payment_status: ContestEntryFeePaymentStatus;
  metadata: {
    byoc_declaration?: ByocDeclaration | null;
    fee_note?: string | null;
    [key: string]: any;
  } | null;
  created_at: string;
  updated_at: string;
  
  contest?: Contest;
  participant?: {
    id: string;
    full_name: string;
    email: string;
    avatar_url: string | null;
  };
  participant_name?: string | null;
  participant_email?: string | null;
  participant_avatar_url?: string | null;
  driver_handle?: string | null;
  customer_journey_status?: string | null;
  entry_fee_hold_expires_at?: string | null;
  cancellation_reason?: string | null;
  checked_in_at?: string | null;
}

export interface LeaderboardEntry {
  rank: number;
  registration_id: string;
  user_id: string | null;
  display_name: string | null;
  driver_handle: string | null;
  driver_title_label: string | null;
  wins: number;
  best_lap_seconds: number | null;
  best_lap_ms?: number | null;
  total_time_seconds: number | null;
  latest_finish_position: number | null;
  matches_completed: number;
  progressed_round: number;
  last_played_round: number;
  won_last_match: boolean;
  real_wins: number;
  fixed_rank: number | null;
}

export interface PublishedLeaderboard {
  mode: string;
  entries: LeaderboardEntry[];
  match_count: number;
  published_at: string;
  published_by: string;
}

export interface HostBranch {
  id: string;
  cafe_id: string;
  role: string;
  display_order: number;
  check_in_enabled: boolean;
  cafe: {
    id: string;
    name: string;
    district: string;
    city: string;
    status: string;
  } | null;
}

export interface Contest {
  id: string;
  provider_id: string;
  name: string;
  description: string | null;
  track_type_id: string;
  contest_type_id: string;
  contest_format_id: string;
  contest_template_id: string;
  registration_opens_at: string | null;
  registration_closes_at: string | null;
  starts_at: string | null;
  ends_at: string | null;
  capacity: number | null;
  entry_fee: number;
  status: ContestStatus;
  banner_image_url: string | null;
  vehicle_rule: {
    vehicle_policy: 'RENTAL_ONLY' | 'BYOC_ONLY' | 'MIXED';
    assignment_policy?: string;
    byoc_require_tech_inspection?: boolean;
    allowed_catalog_ids?: string[];
  } | null;
  config: {
    format?: string;
    runtime_format?: string;
    drivers_per_match?: number;
    seeding_mode?: string;
    auto_bye?: boolean;
    competition_mechanic?: string;
    prizes?: { rank: number; title: string; description: string }[];
    published_leaderboard?: PublishedLeaderboard | null;
    [key: string]: any;
  } | null;
  prize_structure?: any[] | null;
  contest_format?: {
    id: string;
    code: 'KNOCKOUT' | 'TIME_TRIAL';
    name: string;
    description: string | null;
    supports_bracket: boolean;
    supports_time_attack: boolean;
    supports_multi_round: boolean;
  } | null;
  track_type?: {
    id: string;
    code: string;
    name: string;
    description: string | null;
    image_url?: string | null;
    layout_image_url?: string | null;
  } | null;
  public_stats?: {
    registration_count: number;
    confirmed_count: number;
    checked_in_count: number;
    capacity_remaining: number | null;
  } | null;
  
  host_branch: HostBranch | null;
  participating_branches: HostBranch[];
  my_registration?: ContestRegistration | null;
  published_leaderboard?: PublishedLeaderboard | null;
}

export interface ContestMatchParticipant {
  registration_id: string;
  fullName?: string;
  status: ContestParticipantStatus;
  is_winner: boolean;
  slot_no: number;
  lane: string | null;
  seed_no: number | null;
  finish_position: number | null;
  best_lap_seconds: number | null;
  total_time_seconds: number | null;
  result_note?: string | null;
  registration?: ContestRegistration | null;
}

export interface ContestMatch {
  id: string;
  contest_id: string;
  cafe_id: string;
  round_no: number;
  match_no: number;
  name: string | null;
  match_type: string;
  status: ContestMatchStatus;
  next_match_id: string | null;
  scheduled_at: string;
  started_at: string | null;
  ended_at: string | null;
  created_by: string;
  decided_by: string | null;
  decided_at: string | null;
  advancement_rule: {
    winners_to_advance?: number;
    format?: string;
    [key: string]: any;
  } | null;
  result_summary: {
    winner_registration_id?: string | null;
    participants_count?: number;
    bye?: boolean;
    [key: string]: any;
  } | null;
  metadata: {
    seeded?: boolean;
    bye?: boolean;
    empty_slot?: boolean;
    third_place?: boolean;
    [key: string]: any;
  } | null;
  participants: ContestMatchParticipant[];
}
