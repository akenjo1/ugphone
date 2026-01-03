export default async function handler(req, res) {
    const MY_HIDDEN_TOKEN = process.env.HOANG_CLOUD_TOKEN;

    // 1. Kiểm tra Token nội bộ
    if (!MY_HIDDEN_TOKEN) {
        console.error("Thiếu HOANG_CLOUD_TOKEN trong Vercel Envs");
        return res.status(500).json({ status: "error", message: "Server Misconfiguration" });
    }

    try {
        // 2. Gọi API gốc
        const response = await fetch(`https://hoang.cloud/dev/check_status_ugphone?token=${MY_HIDDEN_TOKEN}`, {
            method: 'GET'
        });
        
        const rawData = await response.json();

        // Log kết quả thực tế từ hoang.cloud để debug trong Vercel Logs
        console.log("HoangCloud Response:", JSON.stringify(rawData));

        // 3. Xử lý trả về
        if (rawData.success && rawData.data) {
            return res.status(200).json({
                status: "ok",
                // Trả về nguyên cục data: { "America": true, "Singapore": false ... }
                server_data: rawData.data 
            });
        } else {
            // Nếu Token sai hoặc API lỗi, trả về danh sách rỗng nhưng báo lỗi nhẹ
            return res.status(200).json({
                status: "failed",
                server_data: {} 
            });
        }
    } catch (error) {
        console.error("Fetch Error:", error);
        res.status(500).json({ status: "error", server_data: {} });
    }
}
