const { db, admin } = require('./lib/firebaseAdmin');
// Dùng Dynamic Import cho node-fetch
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({error: 'Method Not Allowed'});

    const { uid, cloud_id, server, input_data } = req.body;
    const MACHINE_PRICE = 50; 
    
    // --- CẤU HÌNH ---
    const HOANG_TOKEN = process.env.HOANG_CLOUD_TOKEN;
    // Key ScraperAPI của bạn (Nên đưa vào biến môi trường SCRAPER_API_KEY thì tốt hơn)
    const SCRAPER_KEY = process.env.SCRAPER_API_KEY || "5a704f2a085016e5a6ffa9f6a3cbcd97"; 

    if (!HOANG_TOKEN) return res.status(500).json({ success: false, message: "Lỗi Server: Thiếu Token." });
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

        // 2. GỌI HOANG.CLOUD QUA SCRAPERAPI
        const payload = { user_token: HOANG_TOKEN, cloud_id, server, input_data };
        const targetUrl = 'https://hoang.cloud/dev/buy_device_cloud';
        
        // Cấu hình Proxy ScraperAPI
        // render=true: Giả lập trình duyệt (Vượt Cloudflare)
        // keep_headers=true: Giữ nguyên Content-Type JSON
        const proxyUrl = `http://api.scraperapi.com?api_key=${SCRAPER_KEY}&url=${encodeURIComponent(targetUrl)}&keep_headers=true&render=true`;

        let apiSuccess = false;
        let apiMessage = "";

        try {
            console.log("Đang gọi qua ScraperAPI...");
            const response = await fetch(proxyUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
                timeout: 60000 // Chờ tối đa 60 giây vì ScraperAPI render hơi lâu
            });

            const responseText = await response.text();
            console.log("Scraper Response:", responseText.substring(0, 200));

            try {
                const result = JSON.parse(responseText);
                if (result.success) {
                    apiSuccess = true;
                    apiMessage = result.message;
                } else {
                    apiMessage = result.message || "Lỗi từ nhà cung cấp (API trả về Failed)";
                }
            } catch (e) {
                // Nếu trả về HTML -> Vẫn bị chặn hoặc lỗi Server Scraper
                if (responseText.includes("Just a moment") || response.status === 403) {
                    apiMessage = "Vẫn bị Cloudflare chặn (ScraperAPI chưa xuyên qua được).";
                } else {
                    apiMessage = "Lỗi định dạng dữ liệu trả về.";
                }
            }

        } catch (err) {
            console.error("Fetch Error:", err);
            apiMessage = `Lỗi kết nối Server Proxy: ${err.message}`;
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
