export default async function handler(req, res) {
    // Chỉ cho phép phương thức POST
    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, message: 'Method not allowed' });
    }

    const MY_HIDDEN_TOKEN = process.env.HOANG_CLOUD_TOKEN;

    if (!MY_HIDDEN_TOKEN) {
        return res.status(500).json({ success: false, message: "Server chưa cấu hình Token" });
    }

    // Lấy dữ liệu người dùng gửi lên (chỉ lấy cloud_id, server, input_data)
    // KHÔNG lấy user_token từ người dùng gửi
    const { cloud_id, server, input_data } = req.body;

    const payload = {
        user_token: MY_HIDDEN_TOKEN, // Token của bạn được chèn ở đây (Server-side)
        cloud_id,
        server,
        input_data
    };

    try {
        const response = await fetch('https://hoang.cloud/dev/buy_device_cloud', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        const data = await response.json();
        res.status(200).json(data);

    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
}
