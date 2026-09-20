import { redis } from '../../config/redis';
import { appendTurn, clearHistory, loadHistory } from '../../services/fb-conversation-memory';

/**
 * Trí nhớ hội thoại của chatbot Facebook.
 *
 * Hỏng ở đây không có gì báo: bot vẫn trả lời, vẫn lịch sự, chỉ là không hiểu
 * câu nối tiếp. Nhìn log thấy "replied" bình thường. Người duy nhất biết là
 * khách đang hỏi "vậy chủ nhật thì sao" và nhận về một câu lạc đề.
 */

const PAGE = 'page-1';
const PSID = 'psid-abc';

describe('trí nhớ hội thoại Facebook', () => {
  beforeEach(async () => {
    await clearHistory(PAGE, PSID);
  });

  it('nhớ được lượt trước', async () => {
    await appendTurn(PAGE, PSID, 'quán mở mấy giờ', '9h đến 22h ạ');

    const history = await loadHistory(PAGE, PSID);

    expect(history).toEqual([
      { role: 'user', content: 'quán mở mấy giờ' },
      { role: 'model', content: '9h đến 22h ạ' },
    ]);
  });

  it('giữ đúng thứ tự qua nhiều lượt', async () => {
    // Thứ tự là toàn bộ giá trị của lịch sử. Đảo lộn thì model đọc ra một cuộc
    // trò chuyện khác hẳn, và trả lời theo cuộc đó.
    await appendTurn(PAGE, PSID, 'câu 1', 'đáp 1');
    await appendTurn(PAGE, PSID, 'câu 2', 'đáp 2');

    const history = await loadHistory(PAGE, PSID);

    expect(history.map((t) => t.content)).toEqual(['câu 1', 'đáp 1', 'câu 2', 'đáp 2']);
  });

  it('chỉ giữ 10 tin gần nhất', async () => {
    // Lịch sử đi thẳng vào prompt nên tốn token MỖI lượt. Không cắt thì một
    // khách nhắn cả buổi sẽ kéo theo cả cuộc trò chuyện vào từng lượt gọi —
    // chậm dần và đắt dần mà không ai để ý.
    for (let i = 1; i <= 8; i += 1) {
      await appendTurn(PAGE, PSID, `hỏi ${i}`, `đáp ${i}`);
    }

    const history = await loadHistory(PAGE, PSID);

    expect(history).toHaveLength(10);
    // Giữ phần MỚI nhất, không phải phần cũ nhất.
    expect(history[0].content).toBe('hỏi 4');
    expect(history[9].content).toBe('đáp 8');
  });

  it('hai chi nhánh khác nhau thì hai cuộc riêng', async () => {
    // Một người nhắn cho hai chi nhánh là hai trang Facebook khác nhau. Khoá
    // chỉ theo psid thì hai cuộc trộn vào nhau, và bot trả lời chi nhánh này
    // bằng ngữ cảnh của chi nhánh kia — giá sân, giờ mở cửa đều sai.
    await appendTurn('page-A', PSID, 'hỏi bên A', 'đáp bên A');
    await appendTurn('page-B', PSID, 'hỏi bên B', 'đáp bên B');

    expect((await loadHistory('page-A', PSID)).map((t) => t.content)).toEqual([
      'hỏi bên A',
      'đáp bên A',
    ]);
    expect((await loadHistory('page-B', PSID)).map((t) => t.content)).toEqual([
      'hỏi bên B',
      'đáp bên B',
    ]);

    await clearHistory('page-A', PSID);
    await clearHistory('page-B', PSID);
  });

  it('hai người khác nhau thì hai cuộc riêng', async () => {
    await appendTurn(PAGE, 'psid-1', 'tôi là người 1', 'chào người 1');
    await appendTurn(PAGE, 'psid-2', 'tôi là người 2', 'chào người 2');

    expect((await loadHistory(PAGE, 'psid-1'))[0].content).toBe('tôi là người 1');
    expect((await loadHistory(PAGE, 'psid-2'))[0].content).toBe('tôi là người 2');

    await clearHistory(PAGE, 'psid-1');
    await clearHistory(PAGE, 'psid-2');
  });

  it('xoá thì sạch', async () => {
    await appendTurn(PAGE, PSID, 'a', 'b');
    await clearHistory(PAGE, PSID);

    expect(await loadHistory(PAGE, PSID)).toEqual([]);
  });

  it('chưa nói gì thì trả mảng rỗng, không nổ', async () => {
    expect(await loadHistory('page-moi', 'psid-chua-tung-nhan')).toEqual([]);
  });

  it('dữ liệu hỏng trong Redis không làm gãy cuộc chat', async () => {
    // Bản ghi có thể sót lại từ phiên bản trước, hoặc bị ghi đè bởi thứ khác.
    // Nhét thẳng vào prompt là hỏng cả lượt gọi model; thà mất ngữ cảnh.
    await redis.set(`fb:chat:${PAGE}:${PSID}`, 'không phải json', 'EX', 60);
    expect(await loadHistory(PAGE, PSID)).toEqual([]);

    await redis.set(`fb:chat:${PAGE}:${PSID}`, '{"khong":"phai mang"}', 'EX', 60);
    expect(await loadHistory(PAGE, PSID)).toEqual([]);

    // Mảng đúng nhưng phần tử méo — lọc từng cái, giữ lại cái dùng được.
    await redis.set(
      `fb:chat:${PAGE}:${PSID}`,
      JSON.stringify([{ role: 'user', content: 'giữ lại' }, { role: 'sai' }, null, 42]),
      'EX',
      60,
    );
    expect(await loadHistory(PAGE, PSID)).toEqual([{ role: 'user', content: 'giữ lại' }]);
  });
});
