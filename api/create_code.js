const { db } = require('./lib/firebaseAdmin');

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({error: 'Method Not Allowed'});

    const { code, amount, max_users, admin_password } = req.body;
    
    // Kiểm tra mật khẩu Admin (Cài trong Vercel Env)
    const SECRET = process.env.ADMIN_SECRET || "123456"; 

    if (admin_password !== SECRET) {
        return res.status(403).json({ error: "Sai mật khẩu Admin!" });
    }

    if (!code || !amount || !max_users) {
        return res.status(400).json({ error: "Thiếu thông tin tạo mã." });
    }

    const codeId = code.trim().toUpperCase();

    try {
        // Lưu vào Collection riêng tên là 'promo_codes'
        await db.collection('promo_codes').doc(codeId).set({
            type: 'giftcode',         // Loại mã quà tặng
            reward: parseInt(amount), // Số xu thưởng
            max_uses: parseInt(max_users), // Số lượt tối đa
            used_count: 0,            // Đã dùng bao nhiêu
            redeemed_by: [],          // Danh sách UID đã nhập (để tránh nhập trùng)
            createdAt: new Date().toISOString(),
            active: true
        });

        return res.status(200).json({ success: true, message: `Đã tạo mã [${codeId}] - ${amount} Xu - ${max_users} lượt.` });
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
}
