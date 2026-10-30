# Phase Execution Playbook — Quy luật triển khai Fonesi-Auto

Revision: 1.1-review · Updated: 2026-10-30
Repository: danhgold7979-cyber/fonesi-Auto
Mục tiêu: một quy trình chuẩn để AI/dev đọc plan, lập kế hoạch chi tiết từng Phase, code, tự test, commit và nghiệm thu mà không nhầm repo, lệch UI hoặc làm rối source.

## 1. Nguyên tắc vận hành

1. Một thời điểm chỉ triển khai một Phase. Không code Phase tiếp theo khi Phase hiện tại chưa nghiệm thu và merge.
2. Master Plan là bản đồ tổng thể, không phải chỉ dẫn code trực tiếp. Trước mỗi Phase phải đọc lại Master Plan và lập Phase Execution Plan riêng.
3. Không viết production code trước khi Phase Plan được người dùng duyệt.
4. Một task phải đi hết vòng: hiểu yêu cầu → xác định files → test → code → test lại → review diff → commit.
5. Task chưa PASS thì không chuyển sang task kế tiếp. Sửa lỗi và chạy lại; nếu thiếu phần cứng/quyền thì đánh dấu BLOCKED, không giả vờ PASS. Ngoại lệ chỉ áp dụng cho task độc lập trong cùng Phase theo hồ sơ được người dùng duyệt ở §6; không có ngoại lệ ngầm.
6. Phase chỉ hoàn tất sau full regression và acceptance. Build thành công không đồng nghĩa Phase đã hoàn thành.
7. Commit quan trọng phải được push lên đúng Phase branch để có backup trên GitHub.
8. Không merge main nếu chưa có nghiệm thu và người dùng đồng ý.
9. V9 là UI chuẩn bắt buộc. Chỉ thay demo data/mock handlers bằng service thật; không tự thiết kế lại.
10. Không đoán khi chưa rõ. Tạo decision/open item, đề xuất phương án và chờ chốt nếu quyết định ảnh hưởng kiến trúc hoặc hành vi.
11. Review/chuẩn hóa tài liệu xong không có nghĩa tool đã code xong, Phase đã nghiệm thu, hoặc được phép code production. Draft kế hoạch Phase tương lai không mở Phase đó.
12. Giữ nguyên lịch sử: G0-01..G0-19 là gate tổng; P0-01..P0-10 là task của Phase 0 đã duyệt. Không đổi ID bằng chứng cũ để khớp plan mới.

## 2. Luồng tổng thể bắt buộc

1. Đọc Master Plan, Product Scope, Architecture, Data/Workflow, Acceptance, UI Mapping và Open Items.
2. Chọn đúng một Phase tiếp theo theo thứ tự 0 → 1 → … → 11; technical dependency không phải quyền bỏ qua Phase.
3. Xác minh repository, remote, branch, HEAD và working tree.
4. Tạo Phase branch từ main mới nhất đã được chấp nhận.
5. Rà lại và hoàn thiện Phase Execution Plan chi tiết riêng (nếu đã có draft thì sửa tại chỗ, không tạo bản sao).
6. Người dùng review và duyệt Phase Plan.
7. Code từng task theo thứ tự dependency.
8. Mỗi task: test → code → test → self-review → commit/push.
9. Chạy full Phase regression và hardware acceptance.
10. Tạo Phase Acceptance Report và PR vào main.
11. Chỉ merge khi người dùng duyệt.
12. Phase tiếp theo bắt đầu từ main mới sau merge.

## 3. Đọc lại yêu cầu trước mỗi Phase

Không dựa vào trí nhớ chat. Mỗi lần bắt đầu Phase mới, đọc:
- AGENTS.md
- README.md
- docs/00_MASTER_PLAN.md
- docs/01_PRODUCT_SCOPE.md
- docs/02_TECHNICAL_ARCHITECTURE.md
- docs/03_DATA_AND_WORKFLOWS.md
- docs/04_MASTER_IMPLEMENTATION_PLAN.md
- docs/05_ACCEPTANCE_AND_RISKS.md
- docs/06_UI_V9_MAPPING.md
- docs/12_HARDWARE_RESOURCE_AND_STREAM_CONTROLS.md
- docs/08_DECISIONS_AND_OPEN_ITEMS.md
- docs/13_DOCUMENTATION_CHANGE_POLICY.md
- docs/09_GIT_WORKFLOW.md
- docs/PHASE_STATUS.md
- Complete V9 HTML nếu Phase có tác động UI.

Sau khi đọc, AI phải tóm tắt:
- Phase trước đã nghiệm thu đến đâu.
- Phase hiện tại phụ thuộc những gì.
- Các quyết định đã chốt.
- Open items nào ảnh hưởng Phase.
- Những gì Phase này được phép làm và không được phép làm.

Nếu plan tổng và yêu cầu mới mâu thuẫn, không tự sửa code; tạo change request/decision record trước.

## 4. Phase Preflight — kiểm tra trước khi làm

Chạy các lệnh sau:
- git rev-parse --show-toplevel
- git remote -v
- git branch --show-current
- git status --short
- git log -1 --oneline

Bắt buộc xác nhận:
- Remote đúng là https://github.com/danhgold7979-cyber/fonesi-Auto.git.
- Working tree không có thay đổi lạ.
- Base branch là main mới nhất đã được chấp nhận.
- Chỉ có một Phase đang hoạt động.
- Không làm trên fonesi-W, main hoặc nhánh cũ không được giao.

Nếu có thay đổi local chưa rõ nguồn gốc, STOP; không reset, checkout đè hoặc xóa.

## 5. Lập Phase Execution Plan chi tiết

Tạo file riêng theo mẫu docs/templates/PHASE_PLAN_TEMPLATE.md. Ví dụ:
- docs/phases/PHASE-00-feasibility.md
- docs/phases/PHASE-01-desktop-foundation.md
- docs/phases/PHASE-02-adb-device-fleet.md

Phase Plan bắt buộc có:
1. Mục tiêu và kết quả bàn giao.
2. Phạm vi IN / OUT.
3. Yêu cầu gốc liên quan và mapping tới Master Plan.
4. Điều kiện đầu vào và dependencies.
5. Open items và quyết định cần người dùng chốt.
6. Thiết kế kiến trúc riêng cho Phase.
7. Module/service/file dự kiến tạo hoặc sửa.
8. Data model/schema/API/IPC contracts liên quan.
9. UI mapping với V9: page, component, event, state, loading/error/empty.
10. Danh sách Task ID theo thứ tự dependency.
11. Với từng task: mục tiêu, files, test cases, acceptance criteria.
12. Failure modes, retry, cancel, recovery.
13. Security/privacy/platform-policy impact.
14. Migration, backup và rollback nếu có.
15. Test matrix: unit, integration, UI, hardware, performance.
16. If the Phase changes streaming/resource management, include host telemetry availability, Auto/Manual behavior, requested/effective settings, overload and recovery tests.
17. Definition of Done và Phase exit criteria.
18. Rủi ro, phương án giảm thiểu và phần chưa cam kết.
19. Ước lượng theo độ phức tạp/độ phụ thuộc; không bịa deadline.

Mỗi dòng requirement/gate cần mapping rõ tới task, test case, evidence và trạng thái nghiệm thu. Không dùng phần trăm tùy ý để thay thế coverage; mọi số đếm phải có mẫu số/phạm vi và các trường hợp bị loại trừ.

Không chia task quá lớn kiểu "build all ADB". Mỗi task phải có kết quả kiểm thử được và review được trong một phiên làm việc hợp lý.

### Approval gate
Phase Plan phải được người dùng xem và duyệt trước khi production code bắt đầu; Phase trước phải ACCEPTED và merge. Các draft Phase 1–11 trong repo hiện chỉ phục vụ review, chưa có approval hoặc authorization. Nếu còn blocker ảnh hưởng kiến trúc, scope hoặc dữ liệu, dừng và hỏi đúng câu hỏi đó. Không hỏi lại quyết định đã chốt trong repository.

## 6. Branch strategy — đơn giản, tuần tự, không rối

### Mô hình mặc định
- Một Phase = một Phase integration branch.
- Một thời điểm chỉ có một Phase branch đang code.
- Một developer/AI làm tuần tự các task trên Phase branch.
- Mỗi task PASS thì tạo commit có ý nghĩa và push lên Phase branch.
- Không cần task branch cho từng việc nhỏ; cách này giảm overhead và tránh rối.

Ví dụ:
- phase/00-feasibility
- phase-01
- phase-02

### Khi nào cần task branch?
Chỉ tạo feat/pNN-TT-short-name hoặc fix/pNN-TT-short-name khi:
- Task lớn, độc lập và cần phát triển song song.
- Task có rủi ro cao cần cô lập.
- Có nhiều developer/agent cùng làm.
- Cần review riêng một module trước khi tích hợp.

Task branch merge vào Phase branch, không merge thẳng main. Việc tạo branch/có nhiều agent không tự cấp quyền làm song song.

### Ngoại lệ task độc lập trong cùng Phase — phải được duyệt trước

Mặc định vẫn tuần tự. Khi có blocker hoặc muốn xử lý task độc lập, lập hồ sơ đề xuất tại Phase plan nếu chưa duyệt, hoặc amendment/decision riêng nếu baseline đã duyệt. Hồ sơ phải có:
1. Phase và từng Task ID, lý do, trạng thái hiện tại và bằng chứng blocker.
2. Dependency graph chứng minh task mới không phụ thuộc kết quả đang FAIL/BLOCKED/NOT_RUN; không đổi contract/schema/thiết bị dùng chung một cách xung đột.
3. Phạm vi và files độc quyền của từng người/agent; shared state, hardware, account/target và side effects cần tránh.
4. Test/evidence riêng cho từng task, thứ tự tích hợp, regression chung và cách rollback.
5. Người chịu trách nhiệm, điều kiện dừng, việc nào phải tiếp tục đợi và tác động tới exit criteria.
6. Quyết định rõ của người dùng, timestamp/timezone và liên kết nguồn; chưa có thì ghi PROPOSED / AWAITING APPROVAL.

Trước khi được duyệt, chỉ tiếp tục phần việc đã được phép của task hiện tại hoặc review tài liệu/read-only trong phạm vi được giao. Không dùng đề xuất này để bắt đầu production task khác. Ngoại lệ không cho phép chạy hai Phase, bỏ required tests, chấp nhận gate thiếu bằng chứng, hay thay đổi product behavior. Đề xuất DEFERRED cũng cần lý do, hậu quả, owner, revisit gate và approval; không tự biến requirement bắt buộc thành tùy chọn.

**Reconcile Phase 0 hiện tại:** snapshot `34b9649` có P0-01/03/04/05 IN_PROGRESS và sáu task NOT_STARTED. Đây là lịch sử ghi nhận, không phải bằng chứng rằng đã có approval làm song song. Không sửa lịch sử thành PASS hoặc bịa approval. Trước lần thực thi tiếp theo, liệt kê đúng các phần đang chờ, hỏi người dùng xác nhận một task tiếp tục; nếu đề nghị thêm task độc lập thì trình hồ sơ ngoại lệ trên. Ghi quyết định mới bằng timestamp mới, không backdate. Review tài liệu hiện tại không thay đổi trạng thái thực thi đó.

### Không làm
- Không tạo branch cho mỗi commit.
- Không tạo sẵn tất cả Phase branches từ đầu.
- Không có hai Phase cùng thay đổi chung contracts/schema/UI đồng thời.
- Không code trực tiếp trên planning branch.
- Không commit trực tiếp trên main.

## 7. Task implementation loop — bắt buộc từng task

### A. Task brief
Ghi rõ Task ID, mục tiêu, scope in/out, files dự kiến, dependencies, acceptance criteria, test commands và risks.

### B. Test-first / test-alongside
- Viết test cho acceptance criteria trước khi code nếu khả thi.
- Nếu test cần phần cứng, chuẩn bị fixture/mock tách biệt và ghi rõ test nào bắt buộc chạy trên Android thật.
- Không tạo test giả chỉ để làm CI xanh.
- Test phải kiểm tra hành vi và lỗi, không chỉ kiểm tra function được gọi.

### C. Implement nhỏ và tập trung
- Chỉ thay đổi files cần thiết.
- Không thêm abstraction/framework khi chưa có use case rõ.
- Không refactor ngoài phạm vi nếu không cần thiết.
- Không để demo/mock data bị hiểu nhầm là production data.
- Không tạo TODO/stub rồi đánh dấu task PASS.

### D. Self-review trước commit
- Đọc lại toàn bộ diff.
- Kiểm tra đúng task, không có file ngoài phạm vi.
- Kiểm tra error handling, timeout, cancellation.
- Kiểm tra logs không lộ secrets/PII.
- Kiểm tra race condition, duplicate side effects và cleanup.
- Kiểm tra migration/backward compatibility nếu có.
- Kiểm tra UI so với full V9 reference nếu có renderer change.

### E. Test gate
Chạy theo thứ tự phù hợp:
1. Format/lint.
2. Typecheck.
3. Unit tests của module.
4. Integration tests liên quan.
5. UI tests/visual comparison nếu có UI.
6. Hardware tests nếu task phụ thuộc ADB/Android.
7. Build/package smoke test khi cần.

Trạng thái kết luận task/gate:
- PASS: tất cả test bắt buộc của task đạt.
- BLOCKED: thiếu phần cứng/quyền/dữ liệu; ghi bằng chứng và không coi là PASS.
- FAIL: test chạy và thất bại; phải sửa và chạy lại.

Không chuyển task kế tiếp khi task hiện tại FAIL hoặc còn test bắt buộc chưa chạy, trừ deferral được duyệt hoặc ngoại lệ task độc lập cùng Phase ở §6. Ngoại lệ không tự chấp nhận test/gate còn thiếu.

### F. Evidence record — không trộn test result và task status

Mỗi check bắt buộc ghi: Test ID + requirement/gate/task, exact command/procedure, commit/script version, timestamp/timezone, environment/tool versions và profile thiết bị/host đã ẩn danh, expected/actual result, output/evidence path và reviewer. Kết quả từng check:

| Result | Ý nghĩa |
|---|---|
| PASS | Đã chạy, kết quả thực tế thỏa criterion; ghi số case pass và tổng số |
| FAIL | Đã chạy, không thỏa criterion; giữ lỗi/bằng chứng và lần rerun tách biệt |
| NOT_RUN | Chưa chạy; ghi lý do, blocker, owner và hành động cần thiết |
| NOT_APPLICABLE | Không áp dụng theo phạm vi đã duyệt; ghi lý do, không dùng để bỏ required test |

BLOCKED là trạng thái task/gate khi thiếu phần cứng/quyền/quyết định, không phải test PASS. Review source không phải runtime test; emulator/mock PASS không thay physical-device evidence. Coverage cần liệt kê feature/capability + supported profile + test + evidence, không suy ra toàn bộ tool từ một screenshot, một máy hay một thao tác.

Không đưa secrets, OTP/token, raw serial, IP, username/local path, ảnh/UI tree có dữ liệu riêng tư hoặc raw diagnostic ZIP lên public repo. Chỉ commit manifest/report/fixtures đã review và ẩn danh; bằng chứng raw nếu cần phải nằm ở nơi riêng tư được người dùng cho phép, với quyền truy cập và retention rõ.

## 8. Commit và push đúng thời điểm

Commit sau khi một logical task hoặc checkpoint có thể kiểm thử đã PASS. Không commit mỗi vài dòng; cũng không gom cả Phase vào một commit khổng lồ.

Ví dụ:
- feat(adb): add device discovery
- test(adb): cover unauthorized and offline states
- fix(adb): serialize commands per device
- feat(screen-wall): add adaptive stream profiles
- docs(phase-02): record device acceptance results

Quy tắc:
- Mỗi commit một thay đổi logic rõ ràng.
- Commit message theo Conventional Commits.
- Push commit lên đúng Phase branch sau checkpoint quan trọng.
- Không push lên main.
- Không force push.
- Không commit secrets, local database, token, screenshots riêng tư hoặc file build không cần thiết.
- Nếu test fail, không commit như thể task đã hoàn tất. Có thể giữ thay đổi local để sửa; nếu cần checkpoint WIP phải ghi rõ WIP và không mở PR nghiệm thu.

## 9. Phase acceptance — điều kiện kết thúc Phase

Trước khi báo Phase hoàn tất:
1. Tất cả task trong Phase Plan có trạng thái PASS hoặc được người dùng chấp thuận DEFERRED kèm hậu quả và revisit gate; các requirement không được defer vẫn bắt buộc.
2. Lint, typecheck, unit, integration, UI và hardware tests bắt buộc đều pass.
3. Full regression của Phase pass.
4. Build/package smoke test pass nếu Phase có ảnh hưởng build.
5. Kiểm tra bảo mật, secrets, log redaction và cleanup.
6. Đối chiếu UI V9 nếu có thay đổi giao diện.
7. Kiểm tra không có file ngoài scope hoặc dependency thừa.
8. Cập nhật docs/PHASE_STATUS.md và acceptance report; giữ nguyên approved baseline, dùng amendment được duyệt nếu scope/acceptance thay đổi.
9. Tạo Phase Acceptance Report gồm commit SHAs, test commands/output, hardware matrix, screenshots đã ẩn dữ liệu, requirement/capability coverage và known limitations.
10. Mở PR từ Phase branch vào main.

Không merge khi:
- Có test bắt buộc chưa chạy.
- Có lỗi critical/high chưa xử lý.
- Có task FAIL/BLOCKED chưa được quyết định.
- Có thay đổi UI chưa được duyệt.
- Có migration chưa có backup/rollback plan.
- Có kết quả chưa được xác minh nhưng lại báo PASS.

## 10. Sau khi Phase được nghiệm thu

1. Người dùng review Phase Acceptance Report và PR.
2. Chỉ merge khi người dùng đồng ý.
3. Gắn tag milestone nếu phù hợp, ví dụ v0.1.0-phase-01.
4. Cập nhật Phase Status thành ACCEPTED.
5. Tạo Phase branch kế tiếp từ main mới.
6. Đọc lại Master Plan và lập Phase Plan mới từ template.

Không làm Phase tiếp theo trên branch cũ sau khi Phase trước đã merge.

## 11. Quy tắc tăng tốc mà không giảm chất lượng

- Ưu tiên hoàn thành vertical slice nhỏ có thể chạy/test thay vì tạo nhiều module rỗng.
- Chốt interfaces sớm giữa Device Host, UI Automator, Vision Worker và Workflow Engine.
- Dùng fixtures/screenshot đã ẩn dữ liệu cá nhân cho test lặp lại.
- Có unit tests nhanh cho từng task; gom hardware regression theo checkpoint.
- Chỉ benchmark sâu ở điểm có rủi ro hiệu năng; không tối ưu sớm khi chưa có số đo.
- Không thêm thư viện nếu platform API hoặc dependency đã có đáp ứng.
- Giữ một nguồn sự thật cho tiến độ: docs/PHASE_STATUS.md.
- Mọi quyết định kiến trúc mới ghi ADR/decision log, tránh quyết định nằm rải rác trong chat.
- Mỗi phiên AI chỉ nhận một Task ID rõ ràng (hoặc một scope review tài liệu đã giao); nếu có nhiều agent thực thi thì phải theo hồ sơ ngoại lệ §6. Kết thúc phiên phải cập nhật trạng thái, commit SHA và việc tiếp theo.

## 12. Quản lý tài liệu và lịch sử thay đổi

- Khi yêu cầu hiện hành thay đổi, cập nhật canonical living docs tại chỗ; không tạo bản sao `final-v2`.
- Quyết định mới được thêm vào decision register/ADR; không xóa quyết định cũ, chỉ đánh dấu SUPERSEDED và liên kết quyết định thay thế.
- Phase Plan đang draft được sửa trực tiếp; sau khi được duyệt, thay đổi scope/acceptance phải có amendment và user approval.
- Phase Plan đã nghiệm thu được giữ nguyên như hồ sơ lịch sử.
- Không xóa file plan/UI/evidence cũ; Git history giữ các phiên bản trước.
- Thực hiện checklist trong docs/13_DOCUMENTATION_CHANGE_POLICY.md cho mọi thay đổi yêu cầu.

## 13. Quy tắc riêng cho Resource & Stream tuning

- Phân biệt target FPS/quality/resolution với effective FPS/quality/resolution thực tế.
- Không hard-code số stream tối đa cho mọi PC; benchmark theo cấu hình và driver.
- Telemetry phải có nguồn, timestamp, đơn vị và trạng thái availability.
- Không suy luận GPU=0 khi Windows/driver không cung cấp bộ đếm.
- Kiểm tra CPU, RAM, GPU decode/encode, USB/network và queue depth cùng lúc; không chỉ nhìn CPU.
- Dùng rolling window, hysteresis và cooldown cho cảnh báo.
- Khi quá tải, giảm/pause preview trước; không dừng ADB actor hoặc workflow đang chạy chỉ để giữ FPS.
- Test Auto/Manual, global/selected/per-device overrides, overload và recovery.

## 14. Báo cáo bắt buộc mỗi phiên

### Trước khi làm
- Start timestamp + timezone; loại việc: review tài liệu / feasibility / production.
- Repository + remote.
- Branch + HEAD.
- Working tree.
- Phase/Task ID.
- Đã đọc các tài liệu nào.
- Mục tiêu và acceptance criteria.
- Files dự kiến thay đổi.
- Test commands dự kiến.

### Trong khi làm
- Ở checkpoint có ý nghĩa: Phase/Task hiện tại, elapsed đo từ start thực tế, exact files đã thay đổi từ checkpoint trước, kết quả mới, blocker và bước tiếp theo.
- Báo kết quả hữu ích trước, không thay update bằng ghi chú nội bộ. Không bịa thời điểm bắt đầu Phase trước đây; nếu không biết thì ghi UNKNOWN.

### Sau khi làm
- End timestamp + timezone; elapsed của phiên/task này, không nhầm với tổng thời gian Phase.
- Files đã thay đổi.
- Commit SHA và branch đã push (nếu được phép).
- Test commands/environment đã chạy và kết quả PASS / FAIL / NOT_RUN / NOT_APPLICABLE, số case, sanitized evidence và lý do chưa chạy.
- Acceptance criteria PASS/FAIL/BLOCKED.
- Known issues.
- Requirement/feature coverage; task kế tiếp được đề xuất và quyền thực thi còn thiếu.

Không được nói "đã test" nếu chỉ đọc code. Không được nói "đã push" nếu chưa xác minh commit trên GitHub. Không được nói "đã hoàn thành" khi còn điều kiện nghiệm thu chưa đạt.


## 15. Change history

- 2026-10-30: Chuẩn hóa thứ tự Phase, distinction review/draft/acceptance, explicit same-Phase exception/clarification procedure, giữ đúng snapshot Phase 0, evidence/coverage/privacy và báo cáo start/elapsed/end. Không chấp nhận amendment hay Phase 0 thay người dùng.
