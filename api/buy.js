const { db, admin } = require('./lib/firebaseAdmin');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({error: 'Method Not Allowed'});

    const { uid, cloud_id, server, input_data } = req.body;
    const MACHINE_PRICE = 50; 
    
    const HOANG_TOKEN = process.env.HOANG_CLOUD_TOKEN;
    const SCRAPER_KEY = process.env.SCRAPER_API_KEY || "5a704f2a085016e5a6ffa9f6a3cbcd97"; 

    if (!HOANG_TOKEN) return res.status(500).json({ success: false, message: "Lỗi Server: Thiếu Token HoangCloud." });
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

        // 2. CẤU HÌNH GỌI SCRAPERAPI (PHIÊN BẢN VIỆT NAM)
        const payload = { user_token: HOANG_TOKEN, cloud_id, server, input_data };
        const targetUrl = 'https://hoang.cloud/dev/buy_device_cloud';
        
        // Thêm tham số: country_code=vn (Dùng IP Việt Nam)
        // device_type=desktop (Giả lập máy tính)
        // premium=true (Dùng IP sạch)
        const proxyUrl = `http://api.scraperapi.com?api_key=${SCRAPER_KEY}&url=${encodeURIComponent(targetUrl)}&premium=true&country_code=vn&device_type=desktop`;

        let apiSuccess = false;
        let apiMessage = "";

        try {
            console.log("Đang gọi ScraperAPI (VN IP)...");
            
            const response = await fetch(proxyUrl, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload),
                timeout: 90000 // Tăng thời gian chờ lên 90s
            });

            const responseText = await response.text();
            console.log("Response:", responseText.substring(0, 150));

            try {
                const result = JSON.parse(responseText);
                if (result.success) {
                    apiSuccess = true;
                    apiMessage = result.message;
                } else {
                    apiMessage = result.message || "Lỗi từ nhà cung cấp (Success=False)";
                }
            } catch (e) {
                // Kiểm tra các lỗi đặc thù
                if (responseText.includes("Just a moment") || response.status === 403) {
                    apiMessage = "Cloudflare vẫn chặn (Cần thử lại sau).";
                } else if (response.status === 500) {
                    apiMessage = "ScraperAPI không kết nối được đích (Thử lại).";
                } else {
                    apiMessage = `Phản hồi lạ: ${responseText.substring(0, 100)}...`;
                }
            }

        } catch (err) {
            apiMessage = `Lỗi Timeout/Mạng: ${err.message}`;
        }

        // 3. KẾT QUẢ
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
