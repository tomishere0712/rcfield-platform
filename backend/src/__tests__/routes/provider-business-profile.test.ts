import request from 'supertest';
import { app } from '../../app';
import { AppDataSource } from '../../config/database';
import { uploadFile } from '../../services/cloudinary.service';
import { lookupBusinessByTaxCode } from '../../services/tax-lookup.service';
import { ProviderStatus, UserRole } from '../../types';
import { createTestUser, generateToken } from '../helpers';

jest.mock('../../services/cloudinary.service', () => ({
  uploadFile: jest.fn(),
  deleteFile: jest.fn(),
}));

// Đăng ký giờ đối chiếu mã số thuế với Cục Thuế. Không để test bắn request thật
// ra ngoài mỗi lần chạy; hành vi của chính hàm tra cứu đã có bộ test riêng.
jest.mock('../../services/tax-lookup.service', () => ({
  ...jest.requireActual('../../services/tax-lookup.service'),
  lookupBusinessByTaxCode: jest.fn(),
}));

const mockedUploadFile = uploadFile as jest.MockedFunction<typeof uploadFile>;
const mockedLookup = lookupBusinessByTaxCode as jest.MockedFunction<typeof lookupBusinessByTaxCode>;

function activeBusiness(taxCode: string) {
  return {
    status: 'ACTIVE' as const,
    business: {
      taxCode,
      legalName: 'HỘ KINH DOANH RC ARENA',
      internationalName: null,
      shortName: null,
      address: '12 Nguyễn Huệ, TP Hồ Chí Minh',
      taxStatus: 'NNT đang hoạt động',
    },
  };
}

/** Hộ kinh doanh cần CCCD hai mặt và ảnh mặt bằng. */
function attachIndividualKyc(req: request.Test): request.Test {
  return req
    .attach('cccd_front', Buffer.from('front'), 'front.jpg')
    .attach('cccd_back', Buffer.from('back'), 'back.jpg')
    .attach('venue_photo', Buffer.from('venue'), 'venue.jpg');
}

function registerBody(overrides: Record<string, string> = {}) {
  const unique = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  return {
    email: `provider_${unique}@test.com`,
    password: 'matkhau123',
    full_name: 'Nguyen Van Chu Quan',
    business_name: 'RC Arena Test',
    business_type: 'INDIVIDUAL',
    tax_code: `01${unique.slice(-8)}`,
    business_email: `lienhe_${unique}@rcarena.vn`,
    ...overrides,
  };
}

function sendRegister(body: Record<string, string>): request.Test {
  const req = request(app).post('/api/v1/auth/register-provider');
  for (const [key, value] of Object.entries(body)) req.field(key, value);
  return attachIndividualKyc(req);
}

async function readProfile(email: string) {
  const [row] = await AppDataSource.query<
    { tax_code: string | null; business_email: string | null }[]
  >(
    `SELECT pp.tax_code, pp.business_email
       FROM provider_profiles pp
       JOIN users u ON u.id = pp.user_id
      WHERE u.email = $1`,
    [email],
  );
  return row;
}

describe('Hồ sơ doanh nghiệp của provider', () => {
  beforeEach(() => {
    mockedLookup.mockReset();
    mockedLookup.mockImplementation(async (taxCode: string) => activeBusiness(taxCode));
    mockedUploadFile.mockReset();
    mockedUploadFile.mockResolvedValue({
      publicId: 'kyc/test',
      url: 'https://cdn.test/kyc.jpg',
    } as Awaited<ReturnType<typeof uploadFile>>);
  });

  it('đăng ký lưu mã số thuế và email doanh nghiệp thật', async () => {
    const body = registerBody();

    await sendRegister(body).expect(201);

    const profile = await readProfile(body.email);
    expect(profile.tax_code).toBe(body.tax_code);
    expect(profile.business_email).toBe(body.business_email);
  });

  it('thiếu mã số thuế hoặc email doanh nghiệp thì không đăng ký được', async () => {
    const missingTax = registerBody();
    delete (missingTax as Record<string, unknown>).tax_code;
    await sendRegister(missingTax).expect(400);

    const missingEmail = registerBody();
    delete (missingEmail as Record<string, unknown>).business_email;
    await sendRegister(missingEmail).expect(400);
  });

  it('mã số thuế sai định dạng bị chặn ngay ở cửa đăng ký', async () => {
    await sendRegister(registerBody({ tax_code: '12345' })).expect(400);
    await sendRegister(registerBody({ tax_code: 'MST0123456789' })).expect(400);
    // 10 số kèm mã đơn vị phụ thuộc là hợp lệ.
    await sendRegister(registerBody({ tax_code: '0123456789-001' })).expect(201);
  });

  it('hai hồ sơ không được dùng chung một mã số thuế', async () => {
    const first = registerBody({ tax_code: '0111222333' });
    await sendRegister(first).expect(201);

    const second = registerBody({ tax_code: '0111222333' });
    const res = await sendRegister(second).expect(409);
    expect(res.body.code).toBe('TAX_CODE_EXISTS');
  });

  it('provider sửa được hồ sơ của mình qua API, không phải localStorage', async () => {
    const provider = await createTestUser({ role: UserRole.PROVIDER });
    await AppDataSource.query(
      `INSERT INTO provider_profiles
         (user_id, business_name, registration_status, tax_code, business_email)
       VALUES ($1, 'Tên cũ', $2, '0999888777', 'cu@rcarena.vn')`,
      [provider.id, ProviderStatus.ACTIVE],
    );
    const token = generateToken(provider);

    const res = await request(app)
      .patch('/api/v1/provider/me')
      .set('Authorization', `Bearer ${token}`)
      .send({ business_name: 'Tên mới', business_email: 'moi@rcarena.vn' })
      .expect(200);

    expect(res.body.data).toMatchObject({
      business_name: 'Tên mới',
      business_email: 'moi@rcarena.vn',
      // Không gửi lên thì phải giữ nguyên, không bị xoá trắng.
      tax_code: '0999888777',
    });
  });

  it('form đăng ký tra được mã số thuế ở đúng đường dẫn công khai', async () => {
    // Route này từng gắn nhờ vào router `/auth` nên đường dẫn thật lệch thành
    // /api/v1/auth/business-lookup/... và form nhận 404. Bài test khoá đúng URL.
    mockedLookup.mockResolvedValue(activeBusiness('0319336205'));

    const res = await request(app).get('/api/v1/business-lookup/0319336205').expect(200);

    expect(res.body.data).toMatchObject({
      status: 'ACTIVE',
      business: { legalName: 'HỘ KINH DOANH RC ARENA' },
    });
  });

  it('tra mã không tìm thấy vẫn trả 200 kèm status NOT_FOUND', async () => {
    // "Không tìm thấy" là câu trả lời hợp lệ của việc tra cứu, không phải lỗi
    // của người gọi — form đọc `status` để quyết định, không đọc mã HTTP.
    mockedLookup.mockResolvedValue({ status: 'NOT_FOUND' });

    const res = await request(app).get('/api/v1/business-lookup/8765432109').expect(200);

    expect(res.body.data.status).toBe('NOT_FOUND');
  });

  it('chặn mã số thuế của cơ sở đã ngừng hoạt động', async () => {
    mockedLookup.mockResolvedValue({
      status: 'INACTIVE',
      business: {
        taxCode: '0316871243',
        legalName: 'CÔNG TY CỔ PHẦN PACIFFIC GOLD',
        internationalName: null,
        shortName: null,
        address: null,
        taxStatus: 'NNT không hoạt động tại địa chỉ đã đăng ký',
      },
    });

    const res = await sendRegister(registerBody({ tax_code: '0316871243' })).expect(400);

    expect(res.body.code).toBe('TAX_CODE_INACTIVE');
    expect(res.body.message).toContain('không hoạt động tại địa chỉ đã đăng ký');
  });

  it('chặn mã số thuế không có trên dữ liệu Cục Thuế', async () => {
    mockedLookup.mockResolvedValue({ status: 'NOT_FOUND' });

    const res = await sendRegister(registerBody({ tax_code: '8765432109' })).expect(400);

    expect(res.body.code).toBe('TAX_CODE_NOT_FOUND');
  });

  it('API Cục Thuế sập thì vẫn đăng ký được nhưng đánh dấu chưa xác minh', async () => {
    // Chặn đứng lúc này là để sự cố bên thứ ba khoá luôn cửa đăng ký của mình.
    // Hồ sơ vẫn phải qua admin duyệt KYC, nên không có gì lọt lưới.
    mockedLookup.mockResolvedValue({ status: 'UNAVAILABLE' });
    const body = registerBody();

    await sendRegister(body).expect(201);

    const [row] = await AppDataSource.query<
      { tax_verified_at: Date | null; business_legal_name: string | null }[]
    >(
      `SELECT pp.tax_verified_at, pp.business_legal_name
         FROM provider_profiles pp
         JOIN users u ON u.id = pp.user_id
        WHERE u.email = $1`,
      [body.email],
    );
    expect(row.tax_verified_at).toBeNull();
    expect(row.business_legal_name).toBeNull();
  });

  it('mã hợp lệ thì lưu luôn tên pháp lý và địa chỉ từ Cục Thuế', async () => {
    const body = registerBody();

    await sendRegister(body).expect(201);

    const [row] = await AppDataSource.query<
      {
        business_legal_name: string | null;
        business_address: string | null;
        tax_status: string | null;
        tax_verified_at: Date | null;
      }[]
    >(
      `SELECT pp.business_legal_name, pp.business_address, pp.tax_status, pp.tax_verified_at
         FROM provider_profiles pp
         JOIN users u ON u.id = pp.user_id
        WHERE u.email = $1`,
      [body.email],
    );
    expect(row.business_legal_name).toBe('HỘ KINH DOANH RC ARENA');
    expect(row.business_address).toBe('12 Nguyễn Huệ, TP Hồ Chí Minh');
    expect(row.tax_status).toBe('NNT đang hoạt động');
    expect(row.tax_verified_at).not.toBeNull();
  });

  it('không cho sửa sang mã số thuế của hồ sơ khác', async () => {
    const other = await createTestUser({ role: UserRole.PROVIDER });
    await AppDataSource.query(
      `INSERT INTO provider_profiles (user_id, business_name, registration_status, tax_code)
       VALUES ($1, 'Quán khác', $2, '0777666555')`,
      [other.id, ProviderStatus.ACTIVE],
    );

    const provider = await createTestUser({ role: UserRole.PROVIDER });
    await AppDataSource.query(
      `INSERT INTO provider_profiles (user_id, business_name, registration_status, tax_code)
       VALUES ($1, 'Quán mình', $2, '0666555444')`,
      [provider.id, ProviderStatus.ACTIVE],
    );

    const res = await request(app)
      .patch('/api/v1/provider/me')
      .set('Authorization', `Bearer ${generateToken(provider)}`)
      .send({ tax_code: '0777666555' })
      .expect(409);

    expect(res.body.code).toBe('TAX_CODE_EXISTS');
  });
});
