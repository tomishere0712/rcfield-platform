// Chạy 1 lần sau khi tất cả test xong
// Hiện tại không cần làm gì — giữ DB test để debug nếu cần
export default async function globalTeardown() {
  // Nếu muốn xóa DB test sau mỗi lần chạy, uncomment:
  // const adminDS = new DataSource({ database: 'postgres', ... });
  // await adminDS.query(`DROP DATABASE IF EXISTS rcfeild_test`);
}
