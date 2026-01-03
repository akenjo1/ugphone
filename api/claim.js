const { db, admin } = require('./lib/firebaseAdmin');

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({error: 'Method Not Allowed'});
    
    const { uid, code } = req.body;
    if (!uid || !code) return res.status(400).json({ error: "Thiếu thông tin" });

    const codeInput = code.trim().toUpperCase();
    const userRef = db.collection('users').doc(uid);

    try {
        await db.runTransaction(async (t) => {
            // --- KIỂM TRA MÃ VƯỢT LINK (Ưu tiên 1) ---
            const linkCodeRef = db.collection('pending_codes').doc(codeInput);
            const linkCodeSnap = await t.get(linkCodeRef);

            if (linkCodeSnap.exists) {
                // ... (Logic cũ của mã vượt link) ...
                const data = linkCodeSnap.data();
                if (data.uid !== uid) throw new Error("Mã vượt link này không phải của bạn.");
                if (!data.valid) throw new Error("Mã này đã dùng rồi.");
                
                // Cộng 100 Xu
                const userSnap = await t.get(userRef);
                const userData = userSnap.data() || {};
                const currentBal = userData.balance || 0;

                t.update(linkCodeRef, { valid: false, usedAt: new Date().toISOString() });
                t.set(userRef, { balance: currentBal + 100 }, { merge: true });
                
                return "Nhận thành công 100 Xu từ vượt link!";
            }

            // --- KIỂM TRA GIFTCODE (Ưu tiên 2) ---
            const promoRef = db.collection('promo_codes').doc(codeInput);
            const promoSnap = await t.get(promoRef);

            if (promoSnap.exists) {
                const pData = promoSnap.data();
                
                if (!pData.active) throw new Error("Mã này đang bị khóa.");
                if (pData.used_count >= pData.max_uses) throw new Error("Mã này đã hết lượt sử dụng.");
                
                // Kiểm tra xem user này đã nhập chưa
                const redeemedBy = pData.redeemed_by || [];
                if (redeemedBy.includes(uid)) throw new Error("Bạn đã nhập mã này rồi!");

                // Cập nhật Giftcode
                t.update(promoRef, {
                    used_count: admin.firestore.FieldValue.increment(1),
                    redeemed_by: admin.firestore.FieldValue.arrayUnion(uid)
                });

                // Cộng Xu cho user
                const userSnap = await t.get(userRef);
                const userData = userSnap.data() || {};
                const currentBal = userData.balance || 0;
                
                t.set(userRef, { balance: currentBal + pData.reward }, { merge: true });

                return `Chúc mừng! Bạn nhận được ${pData.reward} Xu.`;
            }

            throw new Error("Mã không tồn tại hoặc không hợp lệ.");
        });

        // Nếu transaction thành công
        // Vì trong transaction mình return string, nên nó sẽ trả về result
        // Tuy nhiên cách viết trên trả về Promise, ta cần bắt message ở đây hơi khó trong JS thuần
        // -> Sửa lại: Transaction thành công nghĩa là không throw Error.
        
        return res.status(200).json({ success: true, message: "Nhập mã thành công! Tiền đã được cộng." });

    } catch (e) {
        return res.status(400).json({ error: e.message });
    }
}
