# Contest API README

File này mô tả contest flow hiện tại của BE theo góc nhìn thực tế cho `provider`, `staff`, `customer`, đồng thời chỉ rõ:

- customer đã đăng ký có xem được giải mình tham gia và bracket hay không
- contest banner đang đi qua API nào
- staff/provider handle được gì trong ngày thi đấu
- seed data nào đang có để test theo mốc **14/07/2026**

## 1. Trạng thái hiện tại sau khi cập nhật

Contest BE hiện đang support tốt nhất cho 2 cơ chế cốt lõi:

- `KNOCKOUT`: đối kháng loại trực tiếp
- `TIME_TRIAL`: tính best lap / total time

Các cơ chế khác nếu cần biểu đạt ở FE thì đang nên đi qua `config` của contest, ví dụ:

- `competition_mechanic`
- `prizes`
- `rulebook`
- `source_reference`

Chưa có runtime riêng cho:

- team war
- multi-class trong cùng một contest
- checkout riêng cho contest

Lưu ý rất quan trọng:

- **Contest không có check-out riêng**
- nếu contest dùng xe thuê thì **check-out / inspection / damage / hoàn xe** vẫn đi theo luồng `booking + session`
- contest chỉ quản lý:
  - đăng ký
  - check-in giải
  - bracket / match
  - kết quả
  - leaderboard

## 2. Banner ảnh giải đấu đang đi như thế nào

### Có up ảnh giải chưa?

Có.

Contest hiện có field:

- `banner_image_url`

### Có API ảnh cho contest chưa?

Có theo dạng **upload ảnh generic dùng lại cho contest**, chưa tách route riêng cho contest.

API dùng:

### `POST /api/v1/uploads/images`

Role:

- mọi user đã đăng nhập

FE flow chuẩn:

1. upload file ảnh trước qua `/api/v1/uploads/images`
2. nhận về URL Cloudinary
3. truyền URL đó vào `banner_image_url` khi:
   - `POST /api/v1/contests`
   - `PATCH /api/v1/contests/:contestId`

Khuyến nghị FE:

- truyền `usage=contest-banner`

Ví dụ:

```multipart
file=<image>
usage=contest-banner
```

## 3. Customer đã đăng ký thì xem giải của mình ở đâu?

Đây là điểm quan trọng nhất đã được chỉnh lại.

## 3.1 API list giải mình đã đăng ký

### `GET /api/v1/me/contest-registrations`

Role:

- `CUSTOMER`

BE hiện không còn trả raw registration trơ nữa, mà trả luôn:

- registration info
- participant info
- contest info
- latest match của registration đó
- `customer_journey_status`

Các field hữu ích FE có thể dùng trực tiếp:

- `participant.full_name`
- `participant.email`
- `contest.name`
- `contest.banner_image_url`
- `contest.status`
- `contest.host_branch`
- `latest_match`
- `customer_journey_status`

Các trạng thái journey hiện tại:

- `PENDING_APPROVAL`
- `APPROVED_WAITING_CHECKIN`
- `READY_TO_RACE`
- `IN_BRACKET`
- `ADVANCED`
- `ELIMINATED`
- `FINISHED`
- `CANCELLED`

## 3.2 API detail contest từ góc nhìn customer

### `GET /api/v1/contests/:contestId`

Role:

- public với contest public
- `CUSTOMER`
- `PROVIDER`
- `STAFF`

Nếu customer đã đăng ký contest đó, response sẽ có thêm:

- `my_registration`

FE có thể dùng để hiển thị:

- tôi đã đăng ký chưa
- mã check-in của tôi
- trạng thái duyệt
- đã check-in chưa

## 3.3 API xem bracket / match của contest

### `GET /api/v1/contests/:contestId/matches`

Role:

- public nếu contest public
- `CUSTOMER` đã đăng ký cũng xem được
- `STAFF` được assign vào cafe thuộc contest cũng xem được
- `PROVIDER` owner xem được

Đây là API chính để trả lời câu hỏi:

> người chơi đã tham gia thì có coi được bracket thi đấu hiện tại hay không?

**Có**. Sau cập nhật này, customer có thể xem được bracket/match của contest mình tham gia.

Response hiện trả thêm các field người dùng đọc được hơn:

- `registration.participant_name`
- `registration.participant_email`
- `registration.participant_avatar_url`
- `registration.is_my_registration`

FE có thể dựng:

- trận nào là của tôi
- đối thủ của tôi là ai
- tôi đang ở vòng nào
- tôi đã thắng / bị loại / chờ trận tiếp theo

## 4. Với tài khoản `customer@gmail.com` đang seed gì để test?

Seed contest mới được neo theo mốc thời gian:

- **14/07/2026**

Tài khoản:

- `customer@gmail.com` / `123456`

Sau khi chạy:

```bash
npm run seed:contests
```

thì `customer@gmail.com` đang là người chơi trong contest runtime:

- `"[SEED-CONTEST] Victory Challenge RC Cup 2026 - Nhánh Đối Kháng"`

Customer này:

- đã đăng ký
- đã được check-in
- đã có match trong bracket

Luồng test chuẩn cho FE:

1. login `customer@gmail.com`
2. gọi `GET /api/v1/me/contest-registrations`
3. lấy `contest.id`
4. gọi `GET /api/v1/contests/:contestId`
5. gọi `GET /api/v1/contests/:contestId/matches`

## 5. Provider flow đúng theo source hiện tại

## 5.1 Tạo giải

### `POST /api/v1/contests`

Role:

- `PROVIDER`

Provider tạo contest với:

- tên giải
- mô tả
- banner
- type / format / template
- branch tham gia
- registration window
- race window
- capacity
- entry fee
- `vehicle_rule`
- `config`

### Catalog cần load trước khi create

- `GET /api/v1/contest-catalog/types`
- `GET /api/v1/contest-catalog/formats`
- `GET /api/v1/contest-catalog/templates?contest_type_id=...&contest_format_id=...`
- `GET /api/v1/track-types`
- branch list từ module cafe/provider

## 5.2 Mở giải

### `POST /api/v1/contests/:contestId/open`

Role:

- `PROVIDER`

Sau bước này customer mới đăng ký được.

## 5.3 Người chơi đăng ký

### `POST /api/v1/contests/:contestId/register`

Role:

- `CUSTOMER`

Hiện tại contract BE thực tế vẫn đang là:

- chỉ support `vehicle_source = RENTAL`
- cần `booking_id`
- cần `vehicle_id`

Guard:

- contest phải `OPEN`
- phải nằm trong registration window
- chưa full capacity
- booking phải `CONFIRMED`
- booking phải đúng customer
- booking phải đúng branch contest
- booking phải đúng track type contest
- booking phải overlap với thời gian contest

## 5.4 Provider review registration

### `GET /api/v1/contests/:contestId/registrations`

Role:

- `PROVIDER`

Response hiện đã enrich thêm:

- `participant.full_name`
- `participant.email`
- `contest`
- `latest_match`

Provider không cần tự join thêm user name ở FE mới đọc được bảng người chơi.

### Các action review

- `POST /api/v1/contest-registrations/:registrationId/mark-entry-fee-paid`
- `POST /api/v1/contest-registrations/:registrationId/waive-entry-fee`
- `POST /api/v1/contest-registrations/:registrationId/approve`
- `POST /api/v1/contest-registrations/:registrationId/reject`
- `POST /api/v1/contest-registrations/:registrationId/cancel`

Role:

- `PROVIDER`

## 5.5 Staff / Provider check-in

### `GET /api/v1/contests/:contestId/registrations/lookup?check_in_code=...`

Role:

- `PROVIDER`
- `STAFF`

### `POST /api/v1/contest-registrations/:registrationId/check-in`

Role:

- `PROVIDER`
- `STAFF`

Body:

```json
{
  "checked_in_cafe_id": "uuid"
}
```

Guard:

- registration phải `CONFIRMED`
- cafe check-in phải thuộc contest
- nếu là staff thì staff phải được assign đúng cafe check-in

## 5.6 Đóng đăng ký và tạo bracket

### `POST /api/v1/contests/:contestId/close`

Role:

- `PROVIDER`

### `POST /api/v1/contests/:contestId/matches/generate`

Role:

- `PROVIDER`

Body chính:

- `cafe_id`
- `track_config_id`
- `registration_ids`
- `drivers_per_match`
- `seeding_mode`

## 5.7 Trong lúc thi đấu ai handle được gì?

### Xem bracket

- `GET /api/v1/contests/:contestId/matches`

Role:

- public contest viewer
- customer đã đăng ký
- staff được assign
- provider owner

### Reorder participant trong match

- `PATCH /api/v1/contest-matches/:matchId/participants`

Role:

- `PROVIDER`
- `STAFF`

Guard staff:

- staff phải thuộc đúng `match.cafe_id`

### Submit kết quả

- `POST /api/v1/contest-matches/:matchId/results`

Role:

- `PROVIDER`
- `STAFF`

### Correct kết quả

- `POST /api/v1/contest-matches/:matchId/results/correct`

Role:

- `PROVIDER`
- `STAFF`

Nhưng:

- nếu dùng `force_cascade=true` thì chỉ `PROVIDER` được làm

### Advance người thắng lên vòng sau

- `POST /api/v1/contest-matches/:matchId/advance`

Role:

- `PROVIDER`
- `STAFF`

Guard staff:

- staff phải đúng cafe của match đó

## 5.8 Kết thúc giải

### `POST /api/v1/contests/:contestId/leaderboard/publish`

Role:

- `PROVIDER`

Guard:

- contest phải có match
- không được còn match `DRAFT`
- không được còn match `READY`
- không được còn match `RUNNING`
- phải có ít nhất 1 result hợp lệ

Sau publish:

- `contests.config.published_leaderboard` được ghi lại
- `contest.status` được chuyển sang `COMPLETED`

## 6. Giải thưởng hiện đi như thế nào?

Giải thưởng hiện chưa có payout workflow riêng.

Prize hiện nằm trong:

- `contest.config.prizes`

Nghĩa là:

- FE có thể hiển thị giải thưởng
- BE chưa có claim/redeem/payment flow riêng cho prize

Đây là hướng đang hợp lý cho phase hiện tại vì:

- đủ để mô tả event thật
- chưa làm BE phình thành hệ payout

## 7. Cơ chế giải nên đang hiểu hợp lý như thế nào?

Trong source BE hiện tại, cách dùng hợp lý nhất là:

### `KNOCKOUT`

Dùng cho:

- đối kháng 1v1
- chia bracket
- thắng thì vào vòng sau

Field nên đọc:

- `contest_format.code = KNOCKOUT`
- `config.competition_mechanic = HEAD_TO_HEAD_ELIMINATION` hoặc tương tự

### `TIME_TRIAL`

Dùng cho:

- chạy tính best lap
- xếp hạng theo thời gian

Field nên đọc:

- `contest_format.code = TIME_TRIAL`
- `config.leaderboard_mode`
- `config.competition_mechanic = TIME_ATTACK_BEST_LAP`

Nếu sau này cần:

- team battle
- club battle
- nhiều hạng trong cùng event

thì phase hiện tại nên biểu đạt ở `config`, chưa nên vẽ thêm table runtime mới nếu chưa có workflow thật.

## 8. Seed data hiện tại đang tạo những contest nào?

`src/seeds/seed-contests.ts` đang tạo:

1. `"[SEED-CONTEST] Victory Challenge RC Cup 2026 - Bản Nháp Điều Hành"`
2. `"[SEED-CONTEST] Victory Challenge RC Sprint Qualifier 2026"`
3. `"[SEED-CONTEST] Victory Challenge RC Cup 2026 - Nhánh Đối Kháng"`
4. `"[SEED-CONTEST] Victory Challenge RC Time Attack 2026"`

Các contest seed đều dùng banner tham chiếu từ bài báo bạn đưa:

- bài báo: `https://baokhanhhoa.vn/the-thao/202605/giai-dua-xe-o-to-the-thao-dia-hinh-quoc-te-victory-challenge-2026-tro-lai-nha-trang-42b4cb8/`
- banner seed: `https://baokhanhhoa.vn/file/e7837c02857c8ca30185a8c39b582c03/052026/poster_victory_20260513161312.jpg`

## 9. Lệnh cần chạy

Nếu DB chưa có contest catalog:

```bash
npm run migration:run
```

Seed full:

```bash
npm run seed:all
```

Seed riêng contest:

```bash
npm run seed:contests
```

Chạy BE:

```bash
npm run dev
```

## 10. Tóm tắt API quan trọng nhất cho FE

### Customer

1. `GET /api/v1/me/contest-registrations`
2. `GET /api/v1/contests/:contestId`
3. `GET /api/v1/contests/:contestId/matches`
4. `POST /api/v1/contest-registrations/:registrationId/cancel`

### Staff

1. `GET /api/v1/contests/:contestId/registrations/lookup`
2. `POST /api/v1/contest-registrations/:registrationId/check-in`
3. `GET /api/v1/contests/:contestId/matches`
4. `PATCH /api/v1/contest-matches/:matchId/participants`
5. `POST /api/v1/contest-matches/:matchId/results`
6. `POST /api/v1/contest-matches/:matchId/results/correct`
7. `POST /api/v1/contest-matches/:matchId/advance`

### Provider

1. upload ảnh qua `POST /api/v1/uploads/images`
2. `POST /api/v1/contests`
3. `PATCH /api/v1/contests/:contestId`
4. `POST /api/v1/contests/:contestId/open`
5. `GET /api/v1/contests/:contestId/registrations`
6. approve / reject / fee actions
7. `POST /api/v1/contests/:contestId/close`
8. `POST /api/v1/contests/:contestId/matches/generate`
9. runtime match ops
10. `POST /api/v1/contests/:contestId/leaderboard/publish`
11. `GET /api/v1/contests/:contestId/metrics`
12. `GET /api/v1/contests/:contestId/audit-logs`
