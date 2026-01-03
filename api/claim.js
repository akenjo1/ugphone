const { db, admin } = require('./lib/firebaseAdmin');

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({error: 'Method Not Allowed'});
    
    const { uid, code } = req.body;
    const REWARD_AMOUNT = 100; // Số Xu thưởng

    if (!uid || !code) return res.status(400).json({ error: "Thiếu thông tin" });

    const codeRef = db.collection('pending_codes').doc(code.toUpperCase());
    const userRef = db.collection('users').doc(uid);

    try {
        await db.runTransaction(async (t) => {
            // 1. Đọc dữ liệu Code
            const codeSnap = await t.get(codeRef);
            if (!codeSnap.exists) {
                throw new Error("Mã không tồn tại hoặc sai.");
            }

            const codeData = codeSnap.data();

            // 2. Kiểm tra tính hợp lệ
            if (codeData.uid !== uid) throw new Error("Mã này không phải của bạn.");
            if (codeData.valid === false) throw new Error("Mã này ĐÃ ĐƯỢC SỬ DỤNG.");
            if (Date.now() > codeData.expiresAt) throw new Error("Mã đã hết hạn (chỉ có hiệu lực 15 phút).");

            // 3. Đọc dữ liệu User để kiểm tra lại giới hạn ngày
            const userSnap = await t.get(userRef);
            const userData = userSnap.data() || {};
            const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });
            
            let currentCount = userData.daily_count || 0;
            if (userData.last_date !== today) {
                currentCount = 0;
            }

            if (currentCount >= 3) throw new Error("Bạn đã đạt giới hạn nhận thưởng hôm nay.");

            // 4. THỰC HIỆN GHI (Cập nhật tất cả cùng lúc)
            
            // Hủy mã ngay lập tức
            t.update(codeRef, { valid: false, usedAt: Date.now() });

            // Cộng tiền và tăng biến đếm
            t.set(userRef, {
                balance: (userData.balance || 0) + REWARD_AMOUNT,
                daily_count: currentCount + 1,
                last_date: today
            }, { merge: true });
        });

        return res.status(200).json({ success: true, message: `Thành công! Bạn nhận được ${REWARD_AMOUNT} Xu.` });

    } catch (e) {
        return res.status(400).json({ error: e.message });
    }
}
