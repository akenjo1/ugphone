const { db, admin } = require('./lib/firebaseAdmin');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({error: 'Method Not Allowed'});

    const { uid, cloud_id, server, input_data } = req.body;
    const MACHINE_PRICE = 50; 
    
    const HOANG_TOKEN = process.env.HOANG_CLOUD_TOKEN;
    const SCRAPER_KEY = process.env.SCRAPER_API_KEY || "5a704f2a085016e5a6ffa9f6a3cbcd97"; 

    if (!HOANG_TOKEN) return res.status(500).json({ success: false, message: "Lỗi Server: Thiếu Token." });
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

        // 2. GỌI QUA SCRAPERAPI (CHẾ ĐỘ PREMIUM RESIDENTIAL)
        const payload = { user_token: HOANG_TOKEN, cloud_id, server, input_data };
        const targetUrl = 'https://hoang.cloud/dev/buy_device_cloud';
        
        // Thay đổi quan trọng:
        // premium=true: Sử dụng IP dân cư (Sạch hơn, ít bị chặn)
        // keep_headers=true: Giữ nguyên Header giả lập của ta
        const proxyUrl = `http://api.scraperapi.com?api_key=${SCRAPER_KEY}&url=${encodeURIComponent(targetUrl)}&premium=true&keep_headers=true`;

        let apiSuccess = false;
        let apiMessage = "";

        try {
            console.log("Đang gọi ScraperAPI (Premium Mode)...");
            
            const response = await fetch(proxyUrl, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    // Header giả lập Chrome xịn để lừa Cloudflare
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
                    'Accept': 'application/json, text/plain, */*',
                    'Origin': 'https://hoang.cloud',
                    'Referer': 'https://hoang.cloud/'
                },
                body: JSON.stringify(payload),
                timeout: 30000 // 30s
            });

            const responseText = await response.text();
            
            // Log 200 ký tự đầu để debug xem nó trả về cái gì
            console.log("Scraper Response Body:", responseText.substring(0, 200));

            try {
                const result = JSON.parse(responseText);
                if (result.success) {
                    apiSuccess = true;
                    apiMessage = result.message;
                } else {
                    apiMessage = result.message || "Lỗi từ nhà cung cấp (API Success=False)";
                }
            } catch (e) {
                // Nếu trả về HTML
                if (responseText.includes("Just a moment") || responseText.includes("Attention Required")) {
                    apiMessage = "Vẫn bị Cloudflare chặn (Bot Detected).";
                } else if (response.status === 403 || response.status === 500) {
                    apiMessage = `Lỗi Server Đích: ${response.status}`;
                } else {
                    apiMessage = `Phản hồi lạ: ${responseText.substring(0, 50)}...`;
                }
            }

        } catch (err) {
            console.error("Fetch Error:", err);
            apiMessage = `Lỗi kết nối ScraperAPI: ${err.message}`;
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
