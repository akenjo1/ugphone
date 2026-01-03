const { db, admin } = require('./lib/firebaseAdmin');

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({error: 'Method Not Allowed'});
    
    const { uid, code } = req.body;
    if (!uid || !code) return res.status(400).json({ error: "Thiếu thông tin" });

    const codeInput = code.trim().toUpperCase();
    
    // Khai báo các Ref cần dùng
    const userRef = db.collection('users').doc(uid);
    const linkCodeRef = db.collection('pending_codes').doc(codeInput);
    const promoRef = db.collection('promo_codes').doc(codeInput);

    try {
        const resultMessage = await db.runTransaction(async (t) => {
            // ============================================================
            // BƯỚC 1: ĐỌC TOÀN BỘ DỮ LIỆU CẦN THIẾT (READS)
            // Firebase bắt buộc phải đọc hết trước khi thực hiện bất kỳ lệnh ghi nào
            // ============================================================
            const linkSnap = await t.get(linkCodeRef);
            const promoSnap = await t.get(promoRef);
            const userSnap = await t.get(userRef);

            const userData = userSnap.data() || {};
            const currentBal = userData.balance || 0;

            // ============================================================
            // BƯỚC 2: KIỂM TRA LOGIC & THỰC HIỆN GHI (WRITES)
            // ============================================================

            // TRƯỜNG HỢP 1: Mã từ Link Rút Gọn
            if (linkSnap.exists) {
                const data = linkSnap.data();

                if (data.uid !== uid) throw new Error("Mã này không phải của bạn.");
                if (!data.valid) throw new Error("Mã này đã được sử dụng.");
                
                // Ghi dữ liệu
                t.update(linkCodeRef, { valid: false, usedAt: new Date().toISOString() });
                t.set(userRef, { balance: currentBal + 100 }, { merge: true });

                return "Thành công! +100 Xu (Mã vượt link).";
            }

            // TRƯỜNG HỢP 2: Mã Giftcode (Admin tạo)
            if (promoSnap.exists) {
                const pData = promoSnap.data();
                
                if (!pData.active) throw new Error("Mã này đang tạm khóa.");
                if (pData.used_count >= pData.max_uses) throw new Error("Mã này đã hết lượt sử dụng.");
                
                const redeemedBy = pData.redeemed_by || [];
                if (redeemedBy.includes(uid)) throw new Error("Bạn đã nhập mã này rồi!");

                // Ghi dữ liệu
                t.update(promoRef, {
                    used_count: admin.firestore.FieldValue.increment(1),
                    redeemed_by: admin.firestore.FieldValue.arrayUnion(uid)
                });
                
                t.set(userRef, { balance: currentBal + pData.reward }, { merge: true });

                return `Thành công! +${pData.reward} Xu (Giftcode).`;
            }

            // Nếu không thuộc cả 2 loại trên
            throw new Error("Mã không tồn tại hoặc không hợp lệ.");
        });

        return res.status(200).json({ success: true, message: resultMessage });

    } catch (e) {
        return res.status(400).json({ error: e.message });
    }
}
