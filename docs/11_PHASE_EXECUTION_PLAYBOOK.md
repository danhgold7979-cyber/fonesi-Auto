# Phase Execution Playbook — Quy luật triển khai Fonesi-Auto

Revision: 1.0-draft  
Repository: danhgold7979-cyber/fonesi-Auto  
Mục tiêu: một quy trình chuẩn để AI/dev đọc plan, lập kế hoạch chi tiết từng Phase, code, tự test, commit và nghiệm thu mà không nhầm repo, lệch UI hoặc làm rối source.

## 1. Nguyên tắc vận hành

1. Một thời điểm chỉ triển khai một Phase. Không code Phase tiếp theo khi Phase hiện tại chưa nghiệm thu và merge.
2. Master Plan là bản đồ tổng thể, không phải chỉ dẫn code trực tiếp. Trước mỗi Phase phải đọc lại Master Plan và lập Phase Execution Plan riêng.
3. Không viết production code trước khi Phase Plan được người dùng duyệt.
4. Một task phải đi hết vòng: hiểu yêu cầu → xác định files → test → code → test lại → review diff → commit.
5. Task chưa PASS thì không chuyển sang task kế tiếp. Sửa lỗi và chạy lại; nếu thiếu phần cứng/quyền thì đánh dấu BLOCKED, không giả vờ PASS.
6. Phase chỉ hoàn tất sau full regression và acceptance. Build thành công không đồng nghĩa Phase đã hoàn thành.
7. Commit quan trọng phải được push lên đúng Phase branch để có backup trên GitHub.
8. Không merge main nếu chưa có nghiệm thu và người dùng đồng ý.
9. V9 là UI chuẩn bắt buộc. Chỉ thay demo data/mock handlers bằng service thật; không tự thiết kế lại.
10. Không đoán khi chưa rõ. Tạo decision/open item, đề xuất phương án và chờ chốt nếu quyết định ảnh hưởng kiến trúc hoặc hành vi.

## 2. Luồng tổng thể bắt buộc

1. Đọc Master Plan, Product Scope, Architecture, Data/Workflow, Acceptance, UI Mapping và Open Items.
2. Chọn đúng một Phase tiếp theo.
3. Xác minh repository, remote, branch, HEAD và working tree.
4. Tạo Phase branch từ main mới nhất đã được chấp nhận.
5. Lập Phase Execution Plan chi tiết riêng.
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
16. Definition of Done và Phase exit criteria.
17. Rủi ro, phương án giảm thiểu và phần chưa cam kết.
18. Ước lượng theo độ phức tạp/độ phụ thuộc; không bịa deadline.

Không chia task quá lớn kiểu "build all ADB". Mỗi task phải có kết quả kiểm thử được và review được trong một phiên làm việc hợp lý.

### Approval gate
Phase Plan phải được người dùng xem và duyệt trước khi production code bắt đầu. Nếu còn blocker ảnh hưởng kiến trúc, scope hoặc dữ liệu, dừng và hỏi đúng câu hỏi đó. Không hỏi lại quyết định đã chốt trong repository.

## 6. Branch strategy — đơn giản, tuần tự, không rối

### Mô hình mặc định
- Một Phase = một Phase integration branch.
- Một thời điểm chỉ có một Phase branch đang code.
- Một developer/AI làm tuần tự các task trên Phase branch.
- Mỗi task PASS thì tạo commit có ý nghĩa và push lên Phase branch.
- Không cần task branch cho từng việc nhỏ; cách này giảm overhead và tránh rối.

Ví dụ:
- phase/00-feasibility
- phase/01-desktop-foundation
- phase/02-adb-device-fleet

### Khi nào cần task branch?
Chỉ tạo feat/pNN-TT-short-name hoặc fix/pNN-TT-short-name khi:
- Task lớn, độc lập và cần phát triển song song.
- Task có rủi ro cao cần cô lập.
- Có nhiều developer/agent cùng làm.
- Cần review riêng một module trước khi tích hợp.

Task branch merge vào Phase branch, không merge thẳng main.

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

Kết quả chỉ được là:
- PASS: tất cả test bắt buộc của task đạt.
- BLOCKED: thiếu phần cứng/quyền/dữ liệu; ghi bằng chứng và không coi là PASS.
- FAIL: test chạy và thất bại; phải sửa và chạy lại.

Không chuyển task kế tiếp khi task hiện tại FAIL hoặc còn test bắt buộc chưa chạy.

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
1. Tất cả task trong Phase Plan có trạng thái PASS hoặc được người dùng chấp thuận DEFERRED.
2. Lint, typecheck, unit, integration, UI và hardware tests bắt buộc đều pass.
3. Full regression của Phase pass.
4. Build/package smoke test pass nếu Phase có ảnh hưởng build.
5. Kiểm tra bảo mật, secrets, log redaction và cleanup.
6. Đối chiếu UI V9 nếu có thay đổi giao diện.
7. Kiểm tra không có file ngoài scope hoặc dependency thừa.
8. Cập nhật docs/PHASE_STATUS.md và Phase Plan.
9. Tạo Phase Acceptance Report gồm commit SHAs, test commands/output, hardware matrix, screenshots và known limitations.
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
- Mỗi phiên AI chỉ nhận một Task ID rõ ràng; kết thúc phiên phải cập nhật trạng thái, commit SHA và việc tiếp theo.

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
- Repository + remote.
- Branch + HEAD.
- Working tree.
- Phase/Task ID.
- Đã đọc các tài liệu nào.
- Mục tiêu và acceptance criteria.
- Files dự kiến thay đổi.
- Test commands dự kiến.

### Sau khi làm
- Files đã thay đổi.
- Commit SHA và branch đã push (nếu được phép).
- Test commands đã chạy và kết quả thực tế.
- Acceptance criteria PASS/FAIL/BLOCKED.
- Known issues.
- Task kế tiếp được đề xuất.

Không được nói "đã test" nếu chỉ đọc code. Không được nói "đã push" nếu chưa xác minh commit trên GitHub. Không được nói "đã hoàn thành" khi còn điều kiện nghiệm thu chưa đạt.
