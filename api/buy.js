const { db, admin } = require('./lib/firebaseAdmin');
const axios = require('axios'); // Bắt buộc phải có axios trong package.json

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({error: 'Method Not Allowed'});

    const { uid, cloud_id, server, input_data } = req.body;
    const MACHINE_PRICE = 50; 
    
    // Cấu hình Key
    const HOANG_TOKEN = process.env.HOANG_CLOUD_TOKEN;
    const SCRAPER_KEY = process.env.SCRAPER_API_KEY || "5a704f2a085016e5a6ffa9f6a3cbcd97"; 

    if (!HOANG_TOKEN) return res.status(500).json({ success: false, message: "Server: Thiếu Token HoangCloud." });
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

        // 2. CHIẾN THUẬT GỌI API ĐA TẦNG
        const targetUrl = 'https://hoang.cloud/dev/buy_device_cloud';
        const payload = { user_token: HOANG_TOKEN, cloud_id, server, input_data };
        
        let apiSuccess = false;
        let apiMessage = "";
        let finalError = "";

        // --- CÁCH 1: GIẢ LẬP MOBILE (SAMSUNG S23) ---
        try {
            console.log("👉 Cách 1: Direct Mobile Fake...");
            const res1 = await axios.post(targetUrl, payload, {
                headers: {
                    'Content-Type': 'application/json',
                    // User-Agent của App Mobile (Thường không bị Cloudflare chặn gắt)
                    'User-Agent': 'Dalvik/2.1.0 (Linux; U; Android 13; SM-S918B Build/TP1A.220624.014)',
                    'Host': 'hoang.cloud',
                    'Connection': 'Keep-Alive',
                    'Accept-Encoding': 'gzip'
                },
                timeout: 10000
            });
            
            if (res1.data && res1.data.success) {
                apiSuccess = true;
                apiMessage = res1.data.message;
            } else {
                throw new Error("API Mobile Failed");
            }
        } catch (e1) {
            console.log("❌ Cách 1 thất bại:", e1.message);
            finalError = e1.message;

            // --- CÁCH 2: SCRAPERAPI STANDARD (Không render, chỉ Proxy) ---
            try {
                console.log("👉 Cách 2: ScraperAPI Standard...");
                // Bỏ render=true để chạy nhanh hơn và tránh lỗi timeout
                // country_code=vn để dùng IP Việt Nam
                const proxyUrl2 = `http://api.scraperapi.com?api_key=${SCRAPER_KEY}&url=${encodeURIComponent(targetUrl)}&country_code=vn`;
                
                const res2 = await axios.post(proxyUrl2, payload, {
                    headers: { 'Content-Type': 'application/json' },
                    timeout: 40000
                });

                if (res2.data && res2.data.success) {
                    apiSuccess = true;
                    apiMessage = res2.data.message;
                } else {
                    throw new Error("ScraperAPI Standard Failed");
                }
            } catch (e2) {
                console.log("❌ Cách 2 thất bại:", e2.message);
                finalError = e2.message;

                // --- CÁCH 3: SCRAPERAPI ULTRA PREMIUM (Vũ khí cuối cùng) ---
                try {
                    console.log("👉 Cách 3: ScraperAPI Premium...");
                    // premium=true: Dùng IP dân cư xịn
                    const proxyUrl3 = `http://api.scraperapi.com?api_key=${SCRAPER_KEY}&url=${encodeURIComponent(targetUrl)}&premium=true&country_code=vn`;
                    
                    const res3 = await axios.post(proxyUrl3, payload, {
                        headers: { 'Content-Type': 'application/json' },
                        timeout: 60000 // Chờ tới 60s
                    });

                    if (res3.data && res3.data.success) {
                        apiSuccess = true;
                        apiMessage = res3.data.message;
                    } else {
                        // Nếu API trả về thành công 200 nhưng nội dung báo lỗi (hết hàng, sai token...)
                        apiMessage = res3.data.message || "Lỗi không xác định từ HoangCloud";
                    }
                } catch (e3) {
                    console.log("❌ Cách 3 thất bại:", e3.message);
                    // Nếu lỗi HTML Cloudflare
                    if (e3.response && e3.response.data && typeof e3.response.data === 'string' && e3.response.data.includes('Just a moment')) {
                        apiMessage = "Server HoangCloud đang bảo trì hoặc chặn tất cả kết nối.";
                    } else {
                        apiMessage = e3.message;
                    }
                }
            }
        }

        // 3. XỬ LÝ KẾT QUẢ CUỐI CÙNG
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
