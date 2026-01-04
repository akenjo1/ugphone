const { db, admin } = require('./lib/firebaseAdmin');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({error: 'Method Not Allowed'});

    const { uid, cloud_id, server, input_data } = req.body;
    const MACHINE_PRICE = 50; 
    
    const HOANG_TOKEN = process.env.HOANG_CLOUD_TOKEN;
    const SCRAPER_KEY = process.env.SCRAPER_API_KEY || "5a704f2a085016e5a6ffa9f6a3cbcd97"; 

    if (!HOANG_TOKEN) return res.status(500).json({ success: false, message: "Thiếu Token HoangCloud." });
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

        // 2. GỌI SCRAPERAPI (CHẾ ĐỘ AUTO HEADER)
        const payload = { user_token: HOANG_TOKEN, cloud_id, server, input_data };
        const targetUrl = 'https://hoang.cloud/dev/buy_device_cloud';
        
        // Bỏ keep_headers=true để ScraperAPI tự sinh Header chuẩn nhất cho IP đó
        const proxyUrl = `http://api.scraperapi.com?api_key=${SCRAPER_KEY}&url=${encodeURIComponent(targetUrl)}&premium=true`;

        let apiSuccess = false;
        let apiMessage = "";

        try {
            console.log("Calling ScraperAPI (Auto Header)...");
            
            const response = await fetch(proxyUrl, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json' 
                    // KHÔNG gửi thêm User-Agent hay Origin nữa
                },
                body: JSON.stringify(payload),
                timeout: 40000 // 40s
            });

            const responseText = await response.text();
            console.log("Scraper Response:", responseText.substring(0, 200));

            try {
                const result = JSON.parse(responseText);
                if (result.success) {
                    apiSuccess = true;
                    apiMessage = result.message;
                } else {
                    apiMessage = result.message || `Lỗi API (Code ${response.status})`;
                }
            } catch (e) {
                if (responseText.includes("Just a moment") || response.status === 403) {
                    apiMessage = "Vẫn bị Cloudflare chặn.";
                } else {
                    apiMessage = `Lỗi phản hồi: ${responseText.substring(0, 50)}...`;
                }
            }

        } catch (err) {
            console.error("Fetch Error:", err);
            apiMessage = `Lỗi kết nối Proxy: ${err.message}`;
        }

        // 3. XỬ LÝ KẾT QUẢ
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
