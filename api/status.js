export default async function handler(req, res) {
    // Cấu hình Token được lấy từ Biến môi trường (Environment Variable) của Vercel
    // TUYỆT ĐỐI KHÔNG ĐIỀN TOKEN VÀO ĐÂY KHI UPLOAD CODE
    const MY_HIDDEN_TOKEN = process.env.HOANG_CLOUD_TOKEN;

    if (!MY_HIDDEN_TOKEN) {
        return res.status(500).json({ success: false, message: "Server chưa cấu hình Token" });
    }

    try {
        // Server Vercel gọi đến Hoang Cloud
        const response = await fetch(`https://hoang.cloud/dev/check_status_ugphone?token=${MY_HIDDEN_TOKEN}`, {
            method: 'GET'
        });
        
        const data = await response.json();
        res.status(200).json(data);
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
}
