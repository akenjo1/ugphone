const { db, admin } = require('./lib/firebaseAdmin');
const fetch = require('node-fetch');
const HttpsProxyAgent = require('https-proxy-agent');

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({error: 'Method Not Allowed'});

    const { uid, cloud_id, server, input_data } = req.body;
    const MACHINE_PRICE = 50; 
    
    const HOANG_TOKEN = process.env.HOANG_CLOUD_TOKEN;
    
    // Proxy của bạn
    const PROXY_STRING = "http://cbqcn_akenj:XpMQ3py0@117.0.198.94:15924";

    if (!HOANG_TOKEN) return res.status(500).json({ success: false, message: "Thiếu Token HoangCloud." });
    if (!uid) return res.status(401).json({ error: "Chưa đăng nhập" });

    const userRef = db.collection('users').doc(uid);

    try {
        // 1. TRỪ TIỀN
        await db.runTransaction(async (t) => {
            const doc = await t.get(userRef);
            const balance = doc.data()?.balance || 0;
            if (balance < MACHINE_PRICE) {
                throw new Error(`Không đủ Xu. Cần ${MACHINE_PRICE} Xu.`);
            }
            t.update(userRef, { balance: balance - MACHINE_PRICE });
        });

        // 2. GỌI API QUA PROXY (DÙNG NODE-FETCH)
        console.log("Đang kết nối Proxy...");
        
        const proxyAgent = new HttpsProxyAgent(PROXY_STRING);
        const targetUrl = 'https://hoang.cloud/dev/buy_device_cloud';
        
        let apiSuccess = false;
        let apiMessage = "";

        try {
            const response = await fetch(targetUrl, {
                method: 'POST',
                headers: {
                    'Host': 'hoang.cloud',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    'Origin': 'https://hoang.cloud',
                    'Referer': 'https://hoang.cloud/'
                },
                body: JSON.stringify({
                    user_token: HOANG_TOKEN,
                    cloud_id,
                    server,
                    input_data
                }),
                agent: proxyAgent, // Gắn Proxy vào đây
                timeout: 9000 // Giới hạn 9 giây để tránh Vercel crash
            });

            const text = await response.text();
            console.log("Kết quả:", text.substring(0, 100));

            if (text.includes('<!DOCTYPE html>')) {
                throw new Error("Proxy bị Cloudflare chặn.");
            }

            try {
                const json = JSON.parse(text);
                if (json.success) {
                    apiSuccess = true;
                    apiMessage = json.message;
                } else {
                    apiMessage = json.message || "Lỗi từ HoangCloud";
                }
            } catch {
                apiMessage = "Lỗi đọc dữ liệu JSON.";
            }

        } catch (err) {
            console.error("Fetch Error:", err.message);
            apiMessage = err.message.includes('timeout') ? "Proxy phản hồi quá chậm." : err.message;
        }

        // 3. XỬ LÝ KẾT QUẢ
        if (apiSuccess) {
            return res.status(200).json({ success: true, message: "Thành công! " + apiMessage });
        } else {
            // Hoàn tiền
            await userRef.update({ balance: admin.firestore.FieldValue.increment(MACHINE_PRICE) });
            return res.status(400).json({ 
                success: false, 
                message: `Thất bại: ${apiMessage}. (Đã hoàn lại 50 Xu)`
            });
        }

    } catch (e) {
        return res.status(400).json({ success: false, message: e.message });
    }
}
