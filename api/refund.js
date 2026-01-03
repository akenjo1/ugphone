const { db, admin } = require('./lib/firebaseAdmin');

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({error: 'Method Not Allowed'});

    const { uid, trans_id, error_reason } = req.body;

    if (!uid || !trans_id) return res.status(400).json({ error: "Thiếu thông tin" });

    const transRef = db.collection('transactions').doc(trans_id);
    const userRef = db.collection('users').doc(uid);

    try {
        await db.runTransaction(async (t) => {
            const transDoc = await t.get(transRef);
            
            if (!transDoc.exists) throw new Error("Giao dịch không tồn tại.");
            const data = transDoc.data();

            if (data.uid !== uid) throw new Error("Giao dịch không chính chủ.");
            if (data.status !== 'pending') throw new Error("Giao dịch này đã xử lý xong hoặc đã hoàn tiền rồi.");

            // Hoàn tiền
            t.update(userRef, { 
                balance: admin.firestore.FieldValue.increment(data.amount) 
            });

            // Đánh dấu giao dịch là đã hoàn tiền (failed)
            t.update(transRef, { 
                status: 'refunded',
                reason: error_reason || 'Client reported failure'
            });
        });

        return res.status(200).json({ success: true, message: "Đã hoàn lại Xu thành công." });

    } catch (e) {
        return res.status(400).json({ success: false, message: e.message });
    }
}
