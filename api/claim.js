const { db, admin } = require('./lib/firebaseAdmin');

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({error: 'Method Not Allowed'});
    
    const { uid, code } = req.body;
    if (!uid || !code) return res.status(400).json({ error: "Thiếu thông tin" });

    const codeInput = code.trim().toUpperCase();
    
    const userRef = db.collection('users').doc(uid);
    const linkCodeRef = db.collection('pending_codes').doc(codeInput);
    const promoRef = db.collection('promo_codes').doc(codeInput);

    try {
        const resultMessage = await db.runTransaction(async (t) => {
            // 1. Đọc dữ liệu
            const linkSnap = await t.get(linkCodeRef);
            const promoSnap = await t.get(promoRef);
            
            // Lưu ý: Không cần đọc User balance nữa, ta sẽ dùng lệnh increment để cộng thẳng

            // 2. Xử lý Logic

            // --- TRƯỜNG HỢP 1: Mã Vượt Link ---
            if (linkSnap.exists) {
                const data = linkSnap.data();
                if (data.uid !== uid) throw new Error("Mã này không phải của bạn.");
                if (!data.valid) throw new Error("Mã này đã được sử dụng.");
                
                // Hủy mã
                t.update(linkCodeRef, { valid: false, usedAt: new Date().toISOString() });
                
                // Cộng 100 Xu (Sử dụng FieldValue.increment để an toàn tuyệt đối)
                t.set(userRef, { 
                    balance: admin.firestore.FieldValue.increment(100) 
                }, { merge: true });

                return "Thành công! +100 Xu (Mã vượt link).";
            }

            // --- TRƯỜNG HỢP 2: Mã Giftcode ---
            if (promoSnap.exists) {
                const pData = promoSnap.data();
                
                if (!pData.active) throw new Error("Mã này đang tạm khóa.");
                if (pData.used_count >= pData.max_uses) throw new Error("Mã này đã hết lượt sử dụng.");
                
                const redeemedBy = pData.redeemed_by || [];
                if (redeemedBy.includes(uid)) throw new Error("Bạn đã nhập mã này rồi!");

                // Cập nhật lượt dùng mã
                t.update(promoRef, {
                    used_count: admin.firestore.FieldValue.increment(1),
                    redeemed_by: admin.firestore.FieldValue.arrayUnion(uid)
                });
                
                // Cộng Xu thưởng (Ép kiểu Number cho chắc chắn)
                const rewardAmount = Number(pData.reward);
                t.set(userRef, { 
                    balance: admin.firestore.FieldValue.increment(rewardAmount) 
                }, { merge: true });

                return `Thành công! +${rewardAmount} Xu (Giftcode).`;
            }

            throw new Error("Mã không tồn tại hoặc không hợp lệ.");
        });

        return res.status(200).json({ success: true, message: resultMessage });

    } catch (e) {
        return res.status(400).json({ error: e.message });
    }
}
