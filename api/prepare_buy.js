const { db, admin } = require('./lib/firebaseAdmin');

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({error: 'Method Not Allowed'});

    const { uid } = req.body;
    const MACHINE_PRICE = 50; 
    const HOANG_TOKEN = process.env.HOANG_CLOUD_TOKEN;

    if (!uid) return res.status(401).json({ error: "Chưa đăng nhập" });

    const userRef = db.collection('users').doc(uid);
    // Tạo ID giao dịch ngẫu nhiên để đối soát hoàn tiền
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

            // 2. Tạo bản ghi giao dịch (để lát nữa nếu lỗi thì hoàn tiền dựa vào cái này)
            t.set(db.collection('transactions').doc(transId), {
                uid: uid,
                amount: MACHINE_PRICE,
                type: 'buy_machine',
                status: 'pending', // Đang chờ kết quả từ Client
                createdAt: admin.firestore.FieldValue.serverTimestamp()
            });
        });

        // Trả về Token và TransID cho Web
        return res.status(200).json({ 
            success: true, 
            temp_token: HOANG_TOKEN, // Token để web dùng
            trans_id: transId 
        });

    } catch (e) {
        return res.status(400).json({ success: false, message: e.message });
    }
}
