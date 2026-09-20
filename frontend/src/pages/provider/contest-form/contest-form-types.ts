export type ContestFormState = {
  name: string
  description: string
  contest_type_id: string
  contest_format_id: string
  contest_template_id: string
  track_type_id: string
  participating_cafe_ids: string[]
  starts_at: string
  ends_at: string
  registration_opens_at: string
  registration_closes_at: string
  capacity: string
  entry_fee: string
  banner_image_url: string
  vehicle_policy: "RENTAL_ONLY" | "BYOC_ONLY" | "MIXED"
  assignment_policy: "AT_CHECK_IN" | "PRE_ASSIGNED"
  finalists: string
  /** Số lượt chạy mỗi VĐV ở các thể thức có pha tính giờ. */
  runs_per_driver: string
  /** Cơ cấu giải thưởng hiện trên trang công khai; để trống thì phần đó báo "sẽ công bố sau". */
  prizes: PrizeTierState[]
}

export type PrizeTierState = {
  /** Hạng, ví dụ "Vô địch" hoặc "Hạng 3". */
  position: string
  /** Phần thưởng, ví dụ "2.000.000đ + cúp". */
  reward: string
  note: string
}

export const defaultPrizeTiers: PrizeTierState[] = [
  { position: "Vô địch", reward: "", note: "" },
  { position: "Á quân", reward: "", note: "" },
  { position: "Hạng 3", reward: "", note: "" },
]

export type ResourceLockScope = "FULL_BRANCH" | "SELECTED_TRACKS"

export type ResourceLockState = Record<
  string,
  {
    scope: ResourceLockScope
    track_config_ids: string[]
  }
>

export const defaultForm: ContestFormState = {
  name: "",
  description: "",
  contest_type_id: "",
  contest_format_id: "",
  contest_template_id: "",
  track_type_id: "",
  participating_cafe_ids: [],
  starts_at: "",
  ends_at: "",
  registration_opens_at: "",
  registration_closes_at: "",
  capacity: "16",
  entry_fee: "0",
  banner_image_url: "",
  prizes: defaultPrizeTiers.map((tier) => ({ ...tier })),
  // Mặc định cho giải MỚI: khách tự mang xe. Trước đây mặc định là "chỉ dùng xe
  // thuê" nên phần lớn giải vô tình đi vào luồng phức tạp nhất.
  vehicle_policy: "BYOC_ONLY",
  assignment_policy: "AT_CHECK_IN",
  finalists: "4",
  runs_per_driver: "3",
  // Mặc định hợp lý cho giải mới: VĐV đã trả lệ phí nên miễn tiền sân, và xe do
  // quán vận hành trong giải nên không bắt cọc. Giải CŨ đang sửa thì đọc lại
  // giá trị đã lưu, không áp mặc định này (xem useContestForm).
}
