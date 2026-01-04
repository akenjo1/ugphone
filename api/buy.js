const { db, admin } = require('./lib/firebaseAdmin');
const axios = require('axios');
const { HttpsProxyAgent } = require('https-proxy-agent');

export default async function handler(req, res) {
    // 1. CHỈ CHO PHÉP POST
    if (req.method !== 'POST') return res.status(405).json({error: 'Method Not Allowed'});

    const { uid, cloud_id, server, input_data } = req.body;
    const MACHINE_PRICE = 50; 
    
    const HOANG_TOKEN = process.env.HOANG_CLOUD_TOKEN;

    // --- CẤU HÌNH PROXY CỦA BẠN (ĐÃ THÊM) ---
    const PROXY_STRING = "http://cbqcn_akenj:XpMQ3py0@117.0.198.94:15924";
    // ----------------------------------------

    if (!HOANG_TOKEN) return res.status(500).json({ success: false, message: "Lỗi: Thiếu Token HoangCloud." });
    if (!uid) return res.status(401).json({ error: "Chưa đăng nhập" });

    const userRef = db.collection('users').doc(uid);

    try {
        // 2. TRỪ TIỀN TRƯỚC
        await db.runTransaction(async (t) => {
            const doc = await t.get(userRef);
            const balance = doc.data()?.balance || 0;
            if (balance < MACHINE_PRICE) {
                throw new Error(`Không đủ Xu. Cần ${MACHINE_PRICE} Xu.`);
            }
            t.update(userRef, { balance: balance - MACHINE_PRICE });
        });

        // 3. CẤU HÌNH GỌI API QUA PROXY
        console.log("Đang kết nối qua Proxy: 117.0.198.94...");
        
        const httpsAgent = new HttpsProxyAgent(PROXY_STRING);

        const axiosConfig = {
            headers: {
                'Host': 'hoang.cloud',
                // Giả lập Chrome Windows mới nhất để uy tín
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'Origin': 'https://hoang.cloud',
                'Referer': 'https://hoang.cloud/'
            },
            httpsAgent: httpsAgent, // Kích hoạt Proxy
            proxy: false, // Tắt proxy mặc định của axios
            timeout: 60000 // Chờ tối đa 60s
        };

        let apiSuccess = false;
        let apiMessage = "";

        try {
            const response = await axios.post('https://hoang.cloud/dev/buy_device_cloud', {
                user_token: HOANG_TOKEN,
                cloud_id,
                server,
                input_data
            }, axiosConfig);

            const result = response.data;
            console.log("Kết quả từ HoangCloud:", result);

            // Kiểm tra kỹ xem có bị trả về HTML (lỗi Cloudflare) không
            if (typeof result === 'string' && result.includes('<!DOCTYPE html>')) {
                throw new Error("Proxy vẫn bị Cloudflare chặn (HTML Response).");
            }

            if (result.success) {
                apiSuccess = true;
                apiMessage = result.message;
            } else {
                apiMessage = result.message || "Lỗi từ nhà cung cấp (Success=False)";
            }

        } catch (err) {
            console.error("Lỗi gọi API:", err.message);
            apiMessage = `Lỗi kết nối: ${err.message}`;
            
            if (err.response) {
                if (err.response.status === 403) apiMessage = "Cloudflare chặn IP Proxy này (403).";
                if (err.response.status === 407) apiMessage = "Sai mật khẩu Proxy.";
                if (err.response.status === 502) apiMessage = "Proxy không phản hồi (Bad Gateway).";
            }
        }

        // 4. XỬ LÝ KẾT QUẢ
        if (apiSuccess) {
            return res.status(200).json({ success: true, message: "Mua thành công! " + apiMessage });
        } else {
            // HOÀN TIỀN
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
