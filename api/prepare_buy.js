const { db, admin } = require('./lib/firebaseAdmin');

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({error: 'Method Not Allowed'});

    const { uid } = req.body;
    const MACHINE_PRICE = 50; 
    
    // Lấy Token và Key từ biến môi trường
    const HOANG_TOKEN = process.env.HOANG_CLOUD_TOKEN;
    // Nếu chưa cấu hình biến môi trường thì dùng key cứng bạn đã cung cấp
    const SCRAPER_KEY = process.env.SCRAPER_API_KEY || "5a704f2a085016e5a6ffa9f6a3cbcd97";

    if (!uid) return res.status(401).json({ error: "Chưa đăng nhập" });

    const userRef = db.collection('users').doc(uid);
    const transId = db.collection('transactions').doc().id; 

    try {
        await db.runTransaction(async (t) => {
            const doc = await t.get(userRef);
            const balance = doc.data()?.balance || 0;
            if (balance < MACHINE_PRICE) {
                throw new Error(`Không đủ Xu. Cần ${MACHINE_PRICE} Xu.`);
            }
            
            // 1. Trừ tiền
            t.update(userRef, { balance: balance - MACHINE_PRICE });

            // 2. Lưu lịch sử
            t.set(db.collection('transactions').doc(transId), {
                uid: uid,
                amount: MACHINE_PRICE,
                type: 'buy_machine',
                status: 'pending',
                createdAt: admin.firestore.FieldValue.serverTimestamp()
            });
        });

        // 3. Trả về Token và Key cho Client tự gọi
        return res.status(200).json({ 
            success: true, 
            temp_token: HOANG_TOKEN,
            scraper_key: SCRAPER_KEY,
            trans_id: transId 
        });

    } catch (e) {
        return res.status(400).json({ success: false, message: e.message });
    }
}
