# 09 — Universal Racing Network

**Last updated**: 2026-07-14  
**Status**: Minimal current implementation + planned expansion

---

## 1. Intent

Universal Racing Network la lop community/racing layer sau contest hien tai. Muc tieu la tang tinh ket noi toan he thong ma khong pha boundary multi-tenant:

1. Driver Passport dung chung cho customer tren moi cafe trong RCField.
2. Global leaderboard lien tinh/toan quoc dua tren race records da verified.
3. Achievement/badge de khuyen khich driver di nhieu cafe va thi dau thuong xuyen.
4. Grand Prix Series gom nhieu contest da publish thanh mot chuoi giai.
5. Team War/Clan War la phase sau khi da co passport, verified records va roster rule.

Contest hien tai van la Provider-level contest. Universal Racing Network doc ket qua da xac thuc tu contest/session, khong thay the contest CRUD, booking/session, payment hoac inspection.

Phase hien tai da implement ban toi gian de phuc vu capstone:

- `users.racing_profile` luu passport state, current title, badge unlock va stats cache
- `achievement_definitions` la DB source of truth cho badge/rule
- `race_records` la source of truth cho global leaderboard
- Global leaderboard chi sync tu contest da publish
- Achievements visit/count chi tinh tu completed play that

---

## 2. Phase Boundary

| Phase | Capability | Scope |
|---|---|---|
| A | Provider contest hien tai | Provider tao contest trong cafe cua minh, publish leaderboard local |
| B | Driver Passport + Race Records | Phase hien tai lam ban toi gian bang `users.racing_profile` + sync contest published vao `race_records` |
| C | Achievements | Phase hien tai da co ban toi gian tu DB; phase sau moi tach bang/query sau hon |
| D | Grand Prix Series | RCField/Admin hoac opt-in Provider gom nhieu contest thanh series |
| E | Team War / Clan War | Team, roster lock, captain approval, team challenge |

Phase B la buoc nen lam dau tien vi no tao source of truth cho leaderboard va achievements.

---

## 3. Core Concepts

### Driver Passport

Driver Passport la ho so racing public cua Customer:

- Phase hien tai gan toi gian vao `users.racing_profile`.
- Co `driver_handle`, `display_name`, `passport_code`, privacy config, current title, unlocked badges va stats cache.
- QR/passport check-in community rieng la phase sau.

### Race Record

`race_records` la source of truth cho thanh tich co the dua len leaderboard public.

Nguon tao hop le:

- `CONTEST`: tu `contest_match_participants` sau khi contest leaderboard da publish.
- `SESSION_TIME_ATTACK`: phase sau.
- `ADMIN_IMPORT`: phase sau.

Global leaderboard chi doc record `verification_status = VERIFIED` va cafe/provider da opt-in public racing network.

### Global Leaderboard

Leaderboard lien tinh/toan quoc la view/query tren `race_records`, filter theo:

- city/province/cafe
- track type / track config
- vehicle source `RENTAL | BYOC`
- contest/session source
- time range: daily, weekly, monthly, all-time

Public leaderboard khong hien email, phone, payment, booking note, session private note.

### Achievements

Achievements la badge unlock tu event/rule:

- Hoan tat du so cafe khac nhau tu completed play that.
- Co du so race records verified.
- Dat top 3 theo leaderboard thang.
- Hoan thanh Grand Prix Series.

Definitions duoc seed/admin manage. Phase hien tai unlock result luu toi gian trong `users.racing_profile.unlocked_achievements`; phase sau co the tach `driver_achievements`.

### Grand Prix Series

Grand Prix Series la wrapper gom nhieu contest da publish:

- `league_series` la chuoi giai.
- `league_rounds` link toi `contest_id` cua tung round.
- `league_standings` tinh diem tu leaderboard da publish/race records verified.

Series khong tao match rieng; match/result van o contest con.

### Team War / Clan War

Team War la phase sau, chi nen lam khi da co Driver Passport va verified records:

- Team co captain, members, home cafe optional.
- Roster lock truoc thoi diem war.
- Captain approve invite/join.
- Team war dung contest/session verified result lam bang chung.

---

## 4. Data Flow

### Contest to Global Record

```text
contest_match_participants
  -> publish contest leaderboard
  -> sync race_records(source_type=CONTEST)
  -> global leaderboard / achievements / passport stats
```

Guard bat buoc:

1. Contest da publish leaderboard local.
2. Khong con match non-terminal.
3. Staff/Provider correction da audit.
4. Cafe/provider opt-in public network.
5. Record co lap/time/score hop le theo format.

### Passport Check-in

```text
Customer shows passport QR
  -> Staff scans at cafe
  -> validate Staff assigned cafe
  -> create driver_cafe_checkins
  -> achievement service evaluates cafe visit badges
```

Passport check-in khong thay the booking/session check-in. No chi la community visit/check-in de tinh badge va history.

---

## 5. Public Privacy Boundary

Du lieu public duoc hien thi:

- driver handle/display name
- avatar neu user cho phep
- cafe/city/track
- vehicle source
- best lap, total time, rank, score
- contest/series public title

Du lieu khong public:

- email, phone
- booking payment/session payment
- inspection photos/private notes
- internal audit payload
- staff notes/rejection reason noi bo

Admin/Provider co the xem them trace noi bo neu co quyen, nhung public API khong tra ve cac truong tren.

---

## 6. Backend Phases

### Phase B — Driver Passport + Race Records

Current minimal implementation:

- `users.racing_profile`
- `race_records`
- `achievement_definitions`

Planned expansion:

- `driver_profiles`
- `driver_cafe_checkins`

Services:

- DriverPassportService
- RaceRecordSyncService
- LeaderboardQueryService

### Phase C — Achievements

Current minimal implementation:

- `achievement_definitions`
- unlock state trong `users.racing_profile`

Planned expansion:

- `driver_achievements`

Services:

- AchievementEvaluator
- AchievementDefinitionAdminService

### Phase D — Grand Prix Series

Tables:

- `league_series`
- `league_rounds`
- `league_standings`

Services:

- SeriesService
- SeriesStandingService

### Phase E — Team War

Tables:

- `racing_teams`
- `racing_team_members`
- `team_wars`
- `team_war_results`

Services:

- RacingTeamService
- TeamWarService

---

## 7. Frontend Surfaces

Customer:

- Driver Passport page.
- Passport QR/check-in history.
- Global leaderboard with filters.
- Achievement shelf.
- Series standings.

Provider/Staff:

- Contest publish screen shows global sync status.
- Staff passport QR scan/check-in.
- Provider opt-in public leaderboard per cafe.

Admin:

- Manage achievements.
- Moderate suspicious race records.
- Create/manage Grand Prix Series.

---

## 8. Acceptance Scenarios

1. Provider contest is completed and leaderboard is published; sync creates verified race records for eligible participants.
2. Global leaderboard excludes unverified, superseded, private, or non-opt-in records.
3. Driver visits 5 distinct cafes; system unlocks the cafe explorer achievement.
4. Corrected contest result supersedes old race record and leaderboard shows corrected time only.
5. Grand Prix Series standings aggregate points from published round contests.

---

## 9. Planned expansion / Next phase

Phase sau se mo rong khi can scale, khong phai requirement bat buoc cua dot capstone nay:

- Tach `driver_profiles` khoi `users.racing_profile` neu public identity can query/doc lap hon.
- Them `driver_cafe_checkins` cho passport QR community check-in rieng.
- Them `driver_achievements` neu can analytics/query badge chi tiet.
- Them session time attack sync vao `race_records`.
- Them Grand Prix Series.
- Them Team War / Clan War.

## 10. References

- `docs/spec/03-contest.md`
- `docs/spec/business-rules/BR-contest.md`
- `docs/spec/business-rules/BR-racing-network.md`
- `docs/spec/01-domain-model.md`
- `docs/spec/05-api-contracts.md`
- `docs/spec/06-database.md`
