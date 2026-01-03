var admin = require("firebase-admin");

// Khởi tạo Firebase Admin an toàn từ biến môi trường
// Giúp ẩn hoàn toàn thông tin đăng nhập Database
if (!admin.apps.length) {
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
  } else {
    console.error("Thiếu biến môi trường FIREBASE_SERVICE_ACCOUNT");
  }
}

const db = admin.firestore();
module.exports = { admin, db };
