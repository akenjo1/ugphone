export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ code: 405, msg: 'Method not allowed' });
    }

    const MY_HIDDEN_TOKEN = process.env.HOANG_CLOUD_TOKEN;

    if (!MY_HIDDEN_TOKEN) {
        return res.status(500).json({ code: 500, msg: "Lỗi cấu hình hệ thống (Thiếu Token)" });
    }

    const { cloud_id, server, input_data } = req.body;

    const payload = {
        user_token: MY_HIDDEN_TOKEN,
        cloud_id,
        server,
        input_data
    };

    try {
        // 1. Gọi âm thầm đến nhà cung cấp gốc
        const response = await fetch('https://hoang.cloud/dev/buy_device_cloud', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        // 2. Lấy dữ liệu gốc
        const rawData = await response.json();

        // 3. XỬ LÝ ẨN DANH (QUAN TRỌNG)
        // Chúng ta không trả về rawData, mà tự tạo object mới
        
        if (rawData.success) {
            // Nếu thành công -> Trả về thông báo chung chung
            return res.status(200).json({
                success: true,
                // Tự viết lại thông báo, không dùng thông báo của họ
                message: "Hệ thống đã tiếp nhận đơn hàng. Đang khởi tạo máy..." 
            });
        } else {
            // Nếu thất bại -> Trả về lỗi chung chung hoặc map lại lỗi
            // Ví dụ: họ trả về "Token sai", mình báo "Lỗi xác thực"
            return res.status(400).json({
                success: false,
                message: "Không thể tạo máy lúc này. Vui lòng thử lại sau."
                // Ta có thể log lỗi thật ra console của Vercel để mình tự xem, chứ ko gửi cho khách
                // debug_info: rawData.message (Xóa dòng này khi chạy thật)
            });
        }

    } catch (error) {
        // Lỗi mạng hoặc server sập
        res.status(500).json({ success: false, message: "Hệ thống đang bảo trì." });
    }
}
