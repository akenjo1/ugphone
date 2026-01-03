const { db, admin } = require('./lib/firebaseAdmin');
// Sử dụng dynamic import hoặc require an toàn cho fetch
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

export default async function handler(req, res) {
    // 1. CHẶN NẾU KHÔNG PHẢI POST
    if (req.method !== 'POST') return res.status(405).json({error: 'Method Not Allowed'});

    const { uid, cloud_id, server, input_data } = req.body;
    const MACHINE_PRICE = 50; 
    
    // Kiểm tra Token
    const HOANG_TOKEN = process.env.HOANG_CLOUD_TOKEN;
    if (!HOANG_TOKEN) {
        return res.status(500).json({ success: false, message: "Lỗi cấu hình: Chưa có HOANG_CLOUD_TOKEN trong Vercel." });
    }

    if (!uid) return res.status(401).json({ error: "Chưa đăng nhập" });

    const userRef = db.collection('users').doc(uid);

    try {
        // 2. TRỪ TIỀN TRƯỚC (TRANSACTION)
        await db.runTransaction(async (t) => {
            const doc = await t.get(userRef);
            const balance = doc.data()?.balance || 0;
            if (balance < MACHINE_PRICE) {
                throw new Error(`Không đủ Xu. Cần ${MACHINE_PRICE} Xu. Số dư hiện tại: ${balance}`);
            }
            t.update(userRef, { balance: balance - MACHINE_PRICE });
        });

        // 3. GỌI API MUA MÁY (CÓ LOG CHI TIẾT)
        const payload = { user_token: HOANG_TOKEN, cloud_id, server, input_data };
        
        let apiSuccess = false;
        let apiMessage = "";
        let debugError = "";

        try {
            console.log("Đang gọi API HoangCloud...");
            
            const response = await fetch('https://hoang.cloud/dev/buy_device_cloud', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) CloudShop/1.0' // Giả lập trình duyệt để tránh bị chặn
                },
                body: JSON.stringify(payload)
            });

            // Đọc text trước để tránh lỗi JSON parse nếu server trả về HTML lỗi
            const responseText = await response.text();
            console.log("HoangCloud Response:", response.status, responseText);

            try {
                const result = JSON.parse(responseText);
                if (result.success) {
                    apiSuccess = true;
                    apiMessage = result.message;
                } else {
                    apiMessage = result.message || "Lỗi không xác định từ nhà cung cấp";
                }
            } catch (jsonErr) {
                // Nếu không phải JSON (thường do lỗi 502, 503 từ Cloudflare)
                apiMessage = `Lỗi định dạng phản hồi: ${responseText.substring(0, 100)}...`;
            }

        } catch (err) {
            console.error("Fetch Error:", err);
            apiMessage = `Lỗi mạng: ${err.message}`;
            debugError = err.message;
        }

        // 4. XỬ LÝ KẾT QUẢ
        if (apiSuccess) {
            return res.status(200).json({ success: true, message: "Mua thành công! " + apiMessage });
        } else {
            // Mua thất bại -> HOÀN TIỀN
            await userRef.update({ 
                balance: admin.firestore.FieldValue.increment(MACHINE_PRICE) 
            });
            
            return res.status(400).json({ 
                success: false, 
                message: `Thất bại: ${apiMessage}. (Đã hoàn lại 50 Xu)`
            });
        }

    } catch (e) {
        return res.status(400).json({ success: false, message: e.message });
    }
}
