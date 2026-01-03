const { db } = require('./lib/firebaseAdmin');
const fetch = require('node-fetch');

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({error: 'Method Not Allowed'});

    try {
        const { uid, host_url } = req.body;
        const SHRINK_API = process.env.SHRINKME_API_KEY || "a16ba54df502d11a43d8e2b10f2d2fbb9b8e29f7";

        if (!uid) return res.status(401).json({ error: "Chưa đăng nhập" });

        // 1. Kiểm tra giới hạn 3 lần/ngày
        const userRef = db.collection('users').doc(uid);
        const userSnap = await userRef.get();
        const userData = userSnap.data() || {};
        
        // Lấy ngày hiện tại theo giờ Việt Nam (UTC+7)
        const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }); // Format YYYY-MM-DD
        
        // Reset count nếu qua ngày mới
        let currentCount = userData.daily_count || 0;
        if (userData.last_date !== today) {
            currentCount = 0;
        }

        if (currentCount >= 3) {
            return res.status(400).json({ error: "Bạn đã hết 3 lượt vượt link hôm nay. Quay lại vào ngày mai nhé!" });
        }

        // 2. Tạo mã ngẫu nhiên (6 ký tự)
        const code = Math.random().toString(36).substring(2, 8).toUpperCase();

        // 3. Lưu mã vào Database (QUAN TRỌNG: valid = true)
        // Mã này sẽ hết hạn sau 15 phút để tránh spam
        await db.collection('pending_codes').doc(code).set({
            uid: uid,
            createdAt: Date.now(),
            valid: true,
            expiresAt: Date.now() + 15 * 60 * 1000 // 15 phút
        });

        // 4. Tạo Link đích (Trang hiển thị mã)
        const destinationUrl = `${host_url}/code.html?c=${code}`;

        // 5. Gọi API ShrinkMe
        const shrinkRes = await fetch(`https://shrinkme.io/api?api=${SHRINK_API}&url=${encodeURIComponent(destinationUrl)}`);
        const shrinkJson = await shrinkRes.json();

        if (shrinkJson.status === 'error') {
            throw new Error("Lỗi ShrinkMe: " + shrinkJson.message);
        }

        return res.status(200).json({ 
            success: true, 
            shortenedUrl: shrinkJson.shortenedUrl 
        });

    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
}
