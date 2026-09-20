import * as dotenv from 'dotenv';
import * as path from 'path';

// Load .env.test trước khi bất kỳ module nào được import
// Đảm bảo DB_NAME = rcfeild_test trong suốt quá trình test
dotenv.config({ path: path.resolve(__dirname, '../../.env.test') });
