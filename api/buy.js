const { db, admin } = require('./lib/firebaseAdmin');
const axios = require('axios'); // Dùng axios thay vì fetch

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

        // 2. GỌI API VỚI AXIOS & FULL HEADERS
        const payload = { user_token: HOANG_TOKEN, cloud_id, server, input_data };
        
        let apiSuccess = false;
        let apiMessage = "";

        try {
            console.log("Đang gọi API HoangCloud (Axios Mode)...");
            
            // Cấu hình Request giả lập Chrome Windows 10
            const response = await axios.post('https://hoang.cloud/dev/buy_device_cloud', payload, {
                headers: {
                    'Host': 'hoang.cloud',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': 'application/json, text/plain, */*',
                    'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7',
                    'Accept-Encoding': 'gzip, deflate, br',
                    'Content-Type': 'application/json',
                    'Origin': 'https://hoang.cloud',
                    'Referer': 'https://hoang.cloud/',
                    'Sec-Ch-Ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
                    'Sec-Ch-Ua-Mobile': '?0',
                    'Sec-Ch-Ua-Platform': '"Windows"',
                    'Sec-Fetch-Dest': 'empty',
                    'Sec-Fetch-Mode': 'cors',
                    'Sec-Fetch-Site': 'same-origin',
                    'Connection': 'keep-alive'
                },
                timeout: 10000 // Chờ tối đa 10s
            });

            // Nếu Axios không throw lỗi, nghĩa là status 200
            console.log("Axios Response Data:", response.data);
            
            const result = response.data;
            
            // Kiểm tra kỹ xem nó có trả về HTML lỗi không (dù status 200)
            if (typeof result === 'string' && result.includes('<html')) {
                throw new Error("Vẫn bị Cloudflare chặn (HTML Response).");
            }

            if (result.success) {
                apiSuccess = true;
                apiMessage = result.message;
            } else {
                apiMessage = result.message || "Lỗi API không xác định";
            }

        } catch (err) {
            console.error("Axios Error:", err.message);
            if(err.response) {
                console.error("Data:", err.response.data);
                console.error("Status:", err.response.status);
            }
            apiMessage = `Lỗi kết nối: ${err.message}`;
            // Nếu lỗi 403 hoặc 503 -> Chắc chắn bị chặn
            if(err.response && (err.response.status === 403 || err.response.status === 503)) {
                apiMessage = "Cloudflare chặn IP Server Vercel.";
            }
        }

        // 3. XỬ LÝ KẾT QUẢ & HOÀN TIỀN
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
