const { db, admin } = require('./lib/firebaseAdmin');
const fetch = require('node-fetch');

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({error: 'Method Not Allowed'});

    const { uid, cloud_id, server, input_data } = req.body;
    
    // --- CẬP NHẬT GIÁ TẠI ĐÂY ---
    const MACHINE_PRICE = 50; 
    // ----------------------------
    
    const HOANG_TOKEN = process.env.HOANG_CLOUD_TOKEN;

    if (!uid) return res.status(401).json({ error: "Chưa đăng nhập" });

    const userRef = db.collection('users').doc(uid);

    try {
        // BƯỚC 1: Trừ tiền trong Database (Transaction)
        await db.runTransaction(async (t) => {
            const doc = await t.get(userRef);
            const balance = doc.data()?.balance || 0;
            if (balance < MACHINE_PRICE) {
                throw new Error(`Bạn không đủ Xu. Cần ${MACHINE_PRICE} Xu.`);
            }
            t.update(userRef, { balance: balance - MACHINE_PRICE });
        });

        // BƯỚC 2: Gọi API Mua máy (Ẩn Token server-side)
        const payload = { user_token: HOANG_TOKEN, cloud_id, server, input_data };
        
        let apiSuccess = false;
        let apiMessage = "";

        try {
            const response = await fetch('https://hoang.cloud/dev/buy_device_cloud', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const result = await response.json();
            
            if (result.success) {
                apiSuccess = true;
                apiMessage = result.message;
            } else {
                apiMessage = result.message;
            }
        } catch (err) {
            apiMessage = "Lỗi kết nối đến nhà cung cấp.";
        }

        // BƯỚC 3: Xử lý kết quả
        if (apiSuccess) {
            return res.status(200).json({ success: true, message: "Mua thành công! " + apiMessage });
        } else {
            // Mua thất bại -> HOÀN TIỀN LẠI
            await userRef.update({ 
                balance: admin.firestore.FieldValue.increment(MACHINE_PRICE) 
            });
            return res.status(400).json({ 
                success: false, 
                message: "Lỗi khởi tạo: " + apiMessage + ". Đã hoàn lại Xu." 
            });
        }

    } catch (e) {
        return res.status(400).json({ success: false, message: e.message });
    }
}
