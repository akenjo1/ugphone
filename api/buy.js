const { db, admin } = require('./lib/firebaseAdmin');
// Import node-fetch
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({error: 'Method Not Allowed'});

    const { uid, cloud_id, server, input_data } = req.body;
    const MACHINE_PRICE = 50; 
    
    const HOANG_TOKEN = process.env.HOANG_CLOUD_TOKEN;
    if (!HOANG_TOKEN) {
        return res.status(500).json({ success: false, message: "Lỗi cấu hình: Thiếu Token." });
    }

    if (!uid) return res.status(401).json({ error: "Chưa đăng nhập" });

    const userRef = db.collection('users').doc(uid);

    try {
        // 1. TRỪ TIỀN TRƯỚC
        await db.runTransaction(async (t) => {
            const doc = await t.get(userRef);
            const balance = doc.data()?.balance || 0;
            if (balance < MACHINE_PRICE) {
                throw new Error(`Không đủ Xu. Cần ${MACHINE_PRICE} Xu.`);
            }
            t.update(userRef, { balance: balance - MACHINE_PRICE });
        });

        // 2. GỌI API VỚI HEADERS NGỤY TRANG (Fake Browser)
        const payload = { user_token: HOANG_TOKEN, cloud_id, server, input_data };
        
        let apiSuccess = false;
        let apiMessage = "";

        try {
            console.log("Đang gọi API HoangCloud (Anti-Cloudflare Mode)...");
            
            const response = await fetch('https://hoang.cloud/dev/buy_device_cloud', {
                method: 'POST',
                headers: { 
                    'Host': 'hoang.cloud',
                    'Content-Type': 'application/json',
                    // Giả lập Chrome trên Windows 10
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': 'application/json, text/plain, */*',
                    'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7',
                    'Accept-Encoding': 'gzip, deflate, br',
                    'Origin': 'https://hoang.cloud',
                    'Referer': 'https://hoang.cloud/',
                    'Connection': 'keep-alive',
                    'Sec-Fetch-Dest': 'empty',
                    'Sec-Fetch-Mode': 'cors',
                    'Sec-Fetch-Site': 'same-origin',
                    'Pragma': 'no-cache',
                    'Cache-Control': 'no-cache'
                },
                body: JSON.stringify(payload)
            });

            const responseText = await response.text();
            
            // Log 100 ký tự đầu để debug
            console.log("Status:", response.status);
            console.log("Response Preview:", responseText.substring(0, 100));

            // Kiểm tra xem có bị Cloudflare chặn không (Status 403 hoặc HTML)
            if (response.status === 403 || responseText.includes('<title>Just a moment...</title>')) {
                apiMessage = "Hệ thống bảo mật Cloudflare chặn kết nối từ Server. Vui lòng thử lại sau ít phút.";
            } else {
                try {
                    const result = JSON.parse(responseText);
                    if (result.success) {
                        apiSuccess = true;
                        apiMessage = result.message;
                    } else {
                        apiMessage = result.message || "Lỗi API không xác định";
                    }
                } catch (jsonErr) {
                    apiMessage = "API trả về dữ liệu không đúng định dạng (Có thể do lỗi Server gốc).";
                }
            }

        } catch (err) {
            console.error("Network Error:", err);
            apiMessage = `Lỗi mạng: ${err.message}`;
        }

        // 3. XỬ LÝ KẾT QUẢ
        if (apiSuccess) {
            return res.status(200).json({ success: true, message: "Mua thành công! " + apiMessage });
        } else {
            // Hoàn tiền
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
