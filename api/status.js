export default async function handler(req, res) {
    const MY_HIDDEN_TOKEN = process.env.HOANG_CLOUD_TOKEN;

    if (!MY_HIDDEN_TOKEN) {
        return res.status(500).json({ error: "Config Error" });
    }

    try {
        const response = await fetch(`https://hoang.cloud/dev/check_status_ugphone?token=${MY_HIDDEN_TOKEN}`, {
            method: 'GET'
        });
        
        const rawData = await response.json();

        // Kiểm tra xem có lấy được data không
        if (rawData.success && rawData.data) {
            // Chỉ trả về đúng phần data danh sách máy, bỏ qua các message của họ
            return res.status(200).json({
                status: "ok",
                server_list: rawData.data // { "America": true, ... }
            });
        } else {
            return res.status(200).json({
                status: "maintenance",
                server_list: {}
            });
        }
    } catch (error) {
        res.status(500).json({ status: "error" });
    }
}
