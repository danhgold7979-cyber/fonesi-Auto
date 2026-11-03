import { useState, useRef, useEffect } from 'react';
import { createScheduleDraftEditor, type ScheduleDraftPort } from './schedule-draft-model.js';

type Editor = ReturnType<typeof createScheduleDraftEditor>;
type Snapshot = ReturnType<Editor['snapshot']>;
const WEEKDAYS = Object.freeze([
  'Thứ Hai',
  'Thứ Ba',
  'Thứ Tư',
  'Thứ Năm',
  'Thứ Sáu',
  'Thứ Bảy',
  'Chủ Nhật',
]);
const RULE_LABELS = Object.freeze({
  ONCE: 'Một ngày',
  WEEKDAYS: 'Các ngày trong tuần',
  EVERY_N_DAYS: 'Cách N ngày',
});
function offset(seconds: number) {
  const value = Math.abs(seconds);
  return `UTC${seconds < 0 ? '-' : '+'}${String(Math.floor(value / 3600)).padStart(2, '0')}:${String(Math.floor((value % 3600) / 60)).padStart(2, '0')}${value % 60 ? `:${String(value % 60).padStart(2, '0')}` : ''}`;
}
/** Unsaved time intent only; selection never grants device/account or scheduling authority. */
export function ScheduleDraftPanel({
  port,
  context,
  groupTargets = false,
}: Readonly<{ port: ScheduleDraftPort | undefined; context: string; groupTargets?: boolean }>) {
  const owner = useRef<Editor | null>(null);
  const [draft, setDraft] = useState<Snapshot | null>(null);
  const [previewContext, setPreviewContext] = useState<string | null>(null);
  const lastContext = useRef(context);
  useEffect(() => {
    const editor = createScheduleDraftEditor(port);
    owner.current = editor;
    setDraft(editor.snapshot());
    const unsubscribe = editor.subscribe(setDraft);
    return () => {
      owner.current = null;
      unsubscribe();
      editor.dispose();
    };
  }, [port]);
  useEffect(() => {
    if (lastContext.current !== context) {
      lastContext.current = context;
      owner.current?.contextChanged();
    }
  }, [context]);
  if (!draft)
    return (
      <p className="muted" role="status">
        Đang chuẩn bị bản nháp chưa lưu…
      </p>
    );
  const result = previewContext === context ? draft.result : null;
  const fail = draft.code;
  return (
    <>
      <div className="formgrid">
        <label className="field">
          Số video / ngày đăng
          <input
            aria-label="Số video / ngày đăng"
            inputMode="numeric"
            value={draft.posts}
            onChange={(e) => owner.current?.setCount(e.target.value)}
          />
          <small>1–1440 ô giờ là giới hạn biểu diễn, không phải hạn mức đăng.</small>
        </label>
        <label className="field">
          Kiểu lặp
          <select
            aria-label="Kiểu lặp"
            value={draft.ruleKind}
            onChange={(e) => owner.current?.setRule(e.target.value)}
          >
            <option value="EVERY_N_DAYS">Cách N ngày</option>
            <option value="ONCE">Một ngày</option>
            <option value="WEEKDAYS">Các ngày trong tuần</option>
          </select>
          <small>Một ngày dùng mọi ô giờ của ngày bắt đầu, không có nghĩa chỉ một bài.</small>
        </label>
        {draft.ruleKind === 'EVERY_N_DAYS' && (
          <label className="field">
            Chu kỳ đăng (ngày)
            <input
              aria-label="Chu kỳ đăng (ngày)"
              inputMode="numeric"
              value={draft.every}
              onChange={(e) => owner.current?.setField('every', e.target.value)}
            />
            <small>Ngày bắt đầu là mốc lặp. Nhập số nguyên từ 1 đến 3652059.</small>
          </label>
        )}
        {draft.ruleKind === 'WEEKDAYS' && (
          <fieldset
            className="field wide"
            style={{ border: 0, margin: 0, padding: 0 }}
            aria-label="Ngày trong tuần"
          >
            <legend style={{ padding: 0 }}>Chọn ít nhất một ngày trong tuần</legend>
            <div className="rowflex wrap">
              {WEEKDAYS.map((label, index) => (
                <label className="checkline" key={label}>
                  <input
                    aria-label={label}
                    type="checkbox"
                    style={{ width: 14 }}
                    checked={draft.weekdays.includes(index + 1)}
                    onChange={() => owner.current?.toggleWeekday(index + 1)}
                  />
                  {label}
                </label>
              ))}
            </div>
          </fieldset>
        )}
        <label className="field">
          Ngày bắt đầu
          <input
            aria-label="Ngày bắt đầu"
            type="date"
            min="1970-01-01"
            max="2099-12-31"
            value={draft.startDate}
            onChange={(e) => owner.current?.setField('startDate', e.target.value)}
          />
        </label>
        <label className="field">
          Ngày kết thúc (bao gồm, tùy chọn)
          <input
            aria-label="Ngày kết thúc (bao gồm)"
            type="date"
            min="0001-01-01"
            max="9999-12-31"
            value={draft.endDate}
            onChange={(e) => owner.current?.setField('endDate', e.target.value)}
          />
          <small>Để trống nếu không giới hạn ngày kết thúc. Không được trước ngày bắt đầu.</small>
        </label>
        <label className="field">
          Tối đa lần dự kiến (tùy chọn)
          <input
            aria-label="Tối đa lần dự kiến"
            inputMode="numeric"
            value={draft.maximum}
            onChange={(e) => owner.current?.setField('maximum', e.target.value)}
          />
          <small>
            Để trống nếu không giới hạn. Số nguyên dương, tối đa 9007199254740991 theo giới hạn biểu
            diễn; không phải hạn mức đăng. Mỗi ô giờ được tính, kể cả giờ DST bị bỏ qua.
          </small>
        </label>
        <label className="field">
          Xem trước đến ngày (bao gồm)
          <input
            aria-label="Xem trước đến ngày"
            type="date"
            min="1970-01-01"
            max="2099-12-31"
            value={draft.throughDate}
            onChange={(e) => owner.current?.setField('throughDate', e.target.value)}
          />
          <small>
            Chỉ giới hạn cửa sổ xem trước, tối đa 366 ngày; không đặt ngày kết thúc lịch.
          </small>
        </label>
        <label className="field">
          Múi giờ IANA
          <input
            aria-label="Múi giờ IANA"
            maxLength={128}
            value={draft.zone}
            onChange={(e) => owner.current?.setField('zone', e.target.value)}
          />
          <small>Ví dụ Asia/Ho_Chi_Minh, America/New_York hoặc UTC.</small>
        </label>
        <label className="field">
          Nếu gần / trùng giờ trên cùng máy
          <select disabled defaultValue="QUEUE" aria-describedby="draft-excluded-controls">
            <option value="QUEUE">QUEUE · Giữ giờ, xếp hàng đợi</option>
            <option value="AUTO_SHIFT">AUTO_SHIFT · Đề xuất dời giờ</option>
          </select>
        </label>
        <label className="field">
          Chờ sau khi bài đăng thành công (phút)
          <input type="number" disabled value={2} readOnly />
        </label>
        <label className="field">
          Khoảng cách giữa các bình luận (phút)
          <input type="number" disabled value={3} readOnly />
        </label>
        {groupTargets && (
          <label className="field">
            Giãn cách đăng giữa các nhóm (phút)
            <input type="number" disabled value={60} readOnly />
          </label>
        )}
      </div>
      <div className="rowflex between">
        <strong>{draft.slots.length} ô giờ đang giữ</strong>
        <span className="pill amber">Cảnh báo khi dưới 30 phút · không chặn</span>
      </div>
      <p className="muted">
        Giờ mẫu chưa lưu có thể sửa. Ô thêm mới để trống; hãy nhập giờ rõ ràng.
      </p>
      <div className="slot-grid">
        {draft.slots.map((slot, index) => (
          <label className="slot" key={slot.id}>
            <span>Video {index + 1}</span>
            <input
              aria-label={`Giờ video ${index + 1}`}
              type="time"
              value={slot.time}
              onChange={(e) => owner.current?.setTime(slot.id, e.target.value)}
            />
          </label>
        ))}
      </div>
      {draft.removal && (
        <div className="notice" role="status">
          <p>Chưa bỏ ô giờ nào. Xác nhận bỏ các ô sau khỏi bản nháp:</p>
          <ul>
            {draft.removal.slots.map((slot) => (
              <li key={slot.id}>
                {slot.time || 'Chưa nhập giờ'} · {slot.id}
              </li>
            ))}
          </ul>
          <button type="button" className="btn" onClick={() => owner.current?.confirmRemoval()}>
            Xác nhận bỏ các ô giờ
          </button>
          <button type="button" className="btn" onClick={() => owner.current?.cancelRemoval()}>
            Giữ các ô giờ
          </button>
        </div>
      )}
      <p className="muted" id="draft-excluded-controls">
        Bản nháp thời gian chưa lưu · Không gắn thiết bị/tài khoản/media, không tạo job. Không kiểm
        tra xung đột hoặc áp dụng chính sách hàng đợi, dời giờ và bình luận.
      </p>
      <div className="buttonrow">
        <button
          type="button"
          className="btn"
          disabled
          title="Chưa có chính sách chia giờ được phê duyệt"
        >
          Tự chia khung giờ
        </button>
        <button
          type="button"
          className="btn"
          disabled={draft.pending || draft.removal !== null}
          onClick={() => {
            setPreviewContext(context);
            void owner.current?.preview();
          }}
        >
          Xem trước bản nháp
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => {
            setPreviewContext(null);
            owner.current?.cancel();
          }}
        >
          Hủy xem trước
        </button>
      </div>
      <p className="muted">Tự chia giờ chưa khả dụng; giờ bạn nhập không bị thay thế tự động.</p>
      {draft.pending && (
        <p role="status">
          Đang tính bản nháp. Chỉnh sửa hoặc hủy sẽ bỏ kết quả cũ; không tự thử lại.
        </p>
      )}
      {fail && (
        <p role="status">
          Chưa có kết quả xem trước ({fail}). Kiểm tra ngày, múi giờ, kiểu lặp, ngày trong tuần, chu
          kỳ, giới hạn số lần và từng ô giờ. Dữ liệu đang sửa được giữ nguyên.
        </p>
      )}
      {result && (
        <section className="preview-summary" aria-label="Kết quả bản nháp chưa lưu">
          <p>
            <strong>Chỉ xem trước · chưa lưu · không tạo job</strong>
          </p>
          <p>
            {result.window.fromDate} đến {result.window.throughDate} · {result.preview.zone} ·{' '}
            {result.preview.occurrences.length}/{result.window.limit} dòng tối đa.
          </p>
          <p>
            Quy tắc bản nháp: {RULE_LABELS[draft.ruleKind]}
            {draft.ruleKind === 'EVERY_N_DAYS' ? ` · mỗi ${draft.every} ngày` : ''}
            {draft.ruleKind === 'WEEKDAYS'
              ? ` · ${draft.weekdays.map((day) => WEEKDAYS[day - 1]).join(', ')}`
              : ''}
            . Ngày kết thúc: {draft.endDate || 'không giới hạn'} · tối đa lần dự kiến:{' '}
            {draft.maximum || 'không giới hạn'}. Dừng ở giới hạn đạt trước; không tạo lần thay thế.
          </p>
          <p>
            Múi giờ được phân giải: {result.preview.resolvedZone}. Quy tắc: {result.preview.policy}.
            Dữ liệu múi giờ: {result.preview.runtime.tzVersion}.
          </p>
          <p>
            {result.coverage === 'TRUNCATED_PREFIX'
              ? 'Kết quả chưa đầy đủ: chỉ so sánh các thời điểm đã trả về trong phần đầu cửa sổ. Thu hẹp khoảng ngày để xem phần còn lại.'
              : 'Đã xét hết các thời điểm trong cửa sổ này; không xét lịch ngoài cửa sổ và không kiểm tra xung đột thiết bị/tài khoản.'}
          </p>
          {result.preview.next && (
            <p>
              Mốc tiếp theo chưa hiển thị trong bảng: {result.preview.next.date}{' '}
              {result.preview.next.time} · {result.preview.next.resolution}.
            </p>
          )}
          <div className="media-table-wrap">
            <div className="media-table-scroll">
              <table className="media-table">
                <thead>
                  <tr>
                    <th>LẦN DỰ KIẾN</th>
                    <th>NGÀY / GIỜ ĐÃ NHẬP</th>
                    <th>UTC</th>
                    <th>ĐỘ LỆCH</th>
                    <th>KẾT QUẢ</th>
                  </tr>
                </thead>
                <tbody>
                  {result.preview.occurrences.map((row) => (
                    <tr key={`${row.date}/${row.slotId}`}>
                      <td>{row.plannedOrdinal}</td>
                      <td>
                        {row.date} {row.time}
                      </td>
                      <td>
                        {row.utcMs === null ? 'Không có UTC' : new Date(row.utcMs).toISOString()}
                      </td>
                      <td>
                        {row.offsetSeconds === null ? 'Không áp dụng' : offset(row.offsetSeconds)}
                      </td>
                      <td>
                        {row.resolution === 'SKIPPED_GAP'
                          ? 'Bỏ qua giờ không tồn tại do DST · không tạo giờ thay thế'
                          : row.resolution === 'OVERLAP_EARLIER'
                            ? 'Giờ trùng DST: chọn lần sớm hơn đúng một lần'
                            : 'Thời điểm duy nhất'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <p>
            {result.warnings.length} cặp dưới 30 phút trong phần đã so sánh. Đây là cảnh báo, không
            phải xung đột hay lệnh dời giờ.
          </p>
          <ul>
            {result.warnings.map((warning) => (
              <li key={`${warning.earlierPlannedOrdinal}/${warning.laterPlannedOrdinal}`}>
                Lần {warning.earlierPlannedOrdinal} → {warning.laterPlannedOrdinal}:{' '}
                {warning.gapMs / 60000} phút. Giữ nguyên giờ đã nhập.
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
