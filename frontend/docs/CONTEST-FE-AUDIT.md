# Contest FE Audit

Ngay kiem tra: 2026-06-22

Nguon doi chieu:

- BE contract: `rcfield-be/postman/CONTEST-FE-README.md`
- FE commits da xem: `9eb9d1d`, `ce9a682`, `8e08ff4`
- Branch FE: `toan/feat/contest`

Tai khoan smoke test chuan:

- Admin: `admin@gmail.com / 123456`
- Provider: `provider@gmail.com / 123456`
- Customer: `customer@gmail.com / 123456`
- Staff: `staff@gmail.com / 123456`
- Bracket nhieu nguoi co the dung them seed demo `contest_player01@gmail.com` den `contest_player08@gmail.com / 123456`.

## Ket qua validation hien tai

| Lenh | Ket qua | Ghi chu |
|---|---|---|
| `npm test` | Pass ky thuat | Khong co test file nao duoc tim thay, nen chua cover Contest |
| `npm run build` | Fail | Co loi Contest va loi package/type ngoai Contest |
| `npm run lint` | Fail | 223 problems, trong do Contest co nhieu loi import thua, `any`, va React rules |

Build blockers lien quan Contest:

- `CustomerRewardsPage.tsx` goi `contestsApi.getCustomerClaims()` nhung API method dung la `getMyRewardClaims()`.
- Nhieu file Contest co unused imports/variables lam TypeScript fail vi `noUnusedLocals`.
- `ProviderContestDetailPage.tsx` co loi `contest` co the `undefined` trong effect set default cafe.

Build blockers ngoai Contest:

- Thieu module/type: `react-markdown`, `leaflet`, `react-dnd`, `react-dnd-html5-backend`.
- Mot so component ngoai Contest co implicit `any` va React hook lint errors.

## Issue nghiem trong

### 1. Public/customer detail dang goi endpoint provider-only

File: `src/features/contests/pages/ContestDetailPage.tsx`

- Trang public detail goi `GET /contests/:id/registrations` qua `contestsApi.getContestRegistrations`.
- Theo BE docs, endpoint nay chi danh cho `PROVIDER owner`.
- Guest/customer se bi 401/403, va `myRegistration` khong the xac dinh dung.

Huong sua:

- Public detail khong duoc fetch full registrations.
- Can BE bo sung `GET /me/contest-registrations?contest_id=...` hoac FE luu registration response sau khi dang ky.
- So luong nguoi dang ky nen dung `contest.registration_summary`, khong dung private registration list.

### 2. Staff check-in dang goi endpoint provider-only

File: `src/features/contests/pages/StaffContestDetailPage.tsx`

- Staff page cung goi `GET /contests/:id/registrations`.
- BE docs hien tai chi cho provider owner xem danh sach nay.
- Neu staff dang nhap that, trang check-in se khong co data de quet/check-in.

Huong sua:

- Hoac BE mo endpoint registration list gioi han cho staff thuoc cafe tham gia contest.
- Hoac tao API rieng cho staff lookup/check-in bang `check_in_code`.

### 3. Bracket UI chua noi voi API that

Files:

- `src/features/contests/pages/ContestDetailPage.tsx`
- `src/features/contests/pages/ProviderContestDetailPage.tsx`

Van de:

- Public bracket dang render `dummyMatches` hard-coded.
- Provider bracket dung `localMatches` trong memory, `handleSaveMatchResult` chi set state local.
- Chua goi `POST /contest-rounds/:id/bracket-matches`.
- Chua goi `POST /contest-bracket-matches/:id/decide`.
- Sau refresh, toan bo bracket local bien mat.

Huong sua:

- Neu BE chua co list API, UI nen hien trang thai "chua ho tro reload bracket" thay vi fake data.
- Can bo sung/call API list bracket: `GET /contests/:id/bracket` hoac `GET /contest-rounds/:id/bracket-matches`.
- Provider decide winner phai goi API BE de winner tu day sang vong sau.

### 4. Leaderboard/reward dang dung hard-coded class id

File: `src/features/contests/pages/ProviderContestDetailPage.tsx`

Van de:

- `publishLeaderboardMutation.mutate("default-class-id")`
- `issueRewardsMutation.mutate("default-class-id")`
- Create reward gui `contest_class_id: "default-class-id"`

Backend can UUID/class id that, nen request se fail validation.

Huong sua:

- Luu `contest_class_id` sau khi tao class.
- Cho provider chon class tu danh sach class.
- Neu BE cho phep overall nullable, FE co the gui body khong co `contest_class_id` thay vi fake id.

### 5. Provider form lay cafe chua dung scope va validate thieu

File: `src/features/contests/pages/ProviderContestFormPage.tsx`

Van de:

- Goi `GET /v1/cafes` voi `limit` ma thieu `scope=managed&status=ACTIVE`.
- Co the hien cafe khong thuoc provider hoac cafe chua active, tao contest se fail `CONTEST_CAFE_INVALID`.
- Validate form moi check required co ban, chua check thu tu thoi gian.

Huong sua:

- Goi `GET /cafes?scope=managed&status=ACTIVE&limit=100`.
- Validate:
  - `ends_at > starts_at`
  - `registration_closes_at > registration_opens_at`
  - `registration_closes_at <= starts_at`
  - `capacity > 0`
  - `entry_fee >= 0`
  - `banner_image_url` dung URL neu co
  - Khong cho doi participating cafes khi contest khong con `DRAFT`.

### 6. Provider management list co the hien contest cua provider khac

File: `src/features/contests/pages/ProviderContestsPage.tsx`

Van de:

- Trang provider goi public `listContests()` roi filter theo search/status.
- BE list co the tra public contest cua provider khac.
- Provider click "Quan ly giai" vao contest khong phai minh so huu se gap 403.

Huong sua:

- FE filter `contest.provider_id === currentUser.id`.
- Tot hon: BE bo sung query `scope=owned` cho provider management.

### 7. Rental registration UI gui payload thieu `vehicle_id`

File: `src/features/contests/pages/ContestDetailPage.tsx`

Van de:

- UI cho chon `RENTAL`.
- Mutation chi gui `vehicle_source` va `metadata`, khong gui `vehicle_id`.
- Theo BE docs, rental body bat buoc co `vehicle_id`.

Huong sua:

- Tam thoi disable option `RENTAL` neu chua co vehicle picker.
- Hoac them vehicle picker theo cafe/contest va gui `vehicle_id`.

### 8. Type FE chua khop response BE

Files:

- `src/features/contests/types/index.ts`
- `src/features/contests/api/contests.api.ts`

Van de:

- Mot so field BE co the `null` nhung FE type la `string`.
- Registration UI ky vong `registration.user`, nhung BE registration DTO hien khong dam bao join user.
- Reward claim type chua khop endpoint `GET /me/contest-reward-claims`.
- API file dung nhieu `any`, lint fail va lam mat contract safety.

Huong sua:

- Tach DTO theo BE response that: `ContestDto`, `ContestRegistrationDto`, `ContestRewardClaimDto`.
- Chi render name/email participant khi BE tra user summary; neu khong thi can BE bo sung.

### 9. Popup thong bao contest chua dung y do

File: `src/features/contests/pages/ContestListPage.tsx`

Van de:

- Goi `listContests()` khong truyen `upcoming=true&status=OPEN&notify_within_hours=72`.
- UI count down theo `starts_at`, trong khi BE `should_notify` duoc tinh theo registration window.

Huong sua:

- Goi `GET /contests?upcoming=true&status=OPEN&notify_within_hours=72`.
- Popup nen dua vao `should_notify`, `is_registration_open`, `remaining_capacity`, va localStorage dismissed state.

## Ke hoach sua theo phase

### Phase 1: Lam build xanh truoc

- Cai/restore missing deps hoac dong bo lai lockfile cho `react-markdown`, `leaflet`, `react-dnd`, `react-dnd-html5-backend`.
- Sua Contest compile errors:
  - Doi `getCustomerClaims` thanh `getMyRewardClaims`.
  - Xoa unused imports/variables.
  - Sua `ProviderContestDetailPage` effect de khong doc `contest` khi undefined.
  - Bo `default-class-id`.
- Chay lai:
  - `npm run build`
  - `npm run lint`

### Phase 2: Chinh lai API contract theo role

- Public/customer:
  - Khong fetch provider registration list.
  - Dung `registration_summary` cho so luong.
  - Can API `GET /me/contest-registrations` de biet user da dang ky chua.
- Staff:
  - Can API staff lookup/check-in bang code hoac staff-safe registration list.
- Provider:
  - Filter owned contests.
  - Fetch managed active cafes.

### Phase 3: Form validation va UX guard

- Them validation helper/Zod cho contest form.
- Disable action theo status:
  - Chi edit config/cafe khi `DRAFT`.
  - Chi open khi contest hop le.
  - Chi cancel khi owner va contest chua completed/cancelled.
- Rental registration phai co vehicle picker hoac bi disable.

### Phase 4: Competition/bracket that

- Them UI flow tao class, round, bracket match dung API.
- Decide winner bang `POST /contest-bracket-matches/:id/decide`.
- Khong render dummy bracket tren public.
- De reload bracket, can BE bo sung list endpoint:
  - `GET /contests/:id/classes`
  - `GET /contests/:id/rounds`
  - `GET /contests/:id/bracket`

### Phase 5: Test FE nghiem tuc

Can them test thay vi chi `--passWithNoTests`:

- API client tests:
  - Dung path `/v1/contests`, `/v1/cafes/:id/contests`, `/v1/me/contest-reward-claims`.
  - Register BYOC khong gui `vehicle_id`.
  - Rental bat buoc co `vehicle_id`.
- Form validation tests:
  - Date range sai bi chan.
  - Capacity <= 0 bi chan.
  - Cafe rong bi chan.
- Component tests:
  - Guest contest detail khong goi registrations endpoint.
  - Customer da dang ky hien status dung.
  - Provider form chi hien managed active cafes.
  - Staff check-in submit dung `cafe_id`.
- E2E/manual smoke sau khi BE local chay:
  - Provider tao/open contest.
  - Customer dang ky.
  - Staff check-in.
  - Provider tao bracket va decide winner.
  - Publish leaderboard/rewards.

### Phase 6: Visual QA

- Sau khi build xanh, chay dev server.
- Kiem tra desktop/mobile:
  - Contest list popup khong che content.
  - Contest detail CTA dung role.
  - Provider management table/card khong overflow.
  - Staff check-in usable voi scan/manual code.

## De xuat issue moi can mo

1. BE: them `GET /me/contest-registrations` de FE biet registration cua user hien tai.
2. BE: them staff-safe registration lookup/check-in by code.
3. BE: them list/read API cho class/round/bracket de FE reload duoc bracket.
4. FE: thay dummy bracket/local bracket bang API-backed bracket.
5. FE: them test suite Contest vi hien `npm test` chua chay test nao.
6. FE: dong bo package dependency/type de `npm run build` pass.
