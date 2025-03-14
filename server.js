const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const mysql = require('mysql2/promise'); // 引入 MySQL2
const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*", // 允许所有来源，生产环境请修改为你的域名
        methods: ["GET", "POST"]
    }
});
// MySQL 连接配置
const dbConfig = {
    host: '127.0.0.1',
    user: 'root',
    password: 'zcw19980710', // 替换为你的 MySQL 密码
    database: 'idol_msg'
};
let pool;
async function initializeDatabase() {
    try {
        pool = mysql.createPool(dbConfig);
        console.log('Connected to MySQL');
        // 创建 idols 表
        // await pool.query(`
        //     CREATE TABLE IF NOT EXISTS idols (
        //         id INT PRIMARY KEY,
        //         name VARCHAR(255),
        //         image VARCHAR(255),
        //         description TEXT,
        //         phone VARCHAR(255),
        //         age INT,
        //         location VARCHAR(255)
        //     )
        // `);
        // // 创建 fans 表
        // await pool.query(`
        //     CREATE TABLE IF NOT EXISTS fans (
        //         userId VARCHAR(255) PRIMARY KEY,
        //         username VARCHAR(255),
        //         avatar VARCHAR(255),
        //         device VARCHAR(255),
        //         location VARCHAR(255),
        //         age INT,
        //         danmakuCount INT DEFAULT 0,
        //         favoriteIdol INT,
        //         FOREIGN KEY (favoriteIdol) REFERENCES idols(id)
        //     )
        // `);
        // console.log('Tables created (if not exist)');
        // // 初始化偶像数据
        // await initializeIdols();
    } catch (error) {
        console.error('Database initialization error:', error);
    }
}
// 初始化偶像数据
const initializeIdols = async () => {
    try {
        // 检查偶像数据是否已存在
        const [rows] = await pool.query('SELECT COUNT(*) AS count FROM idols');
        const idolCount = rows[0].count;
        console.log(`idolCount: ${idolCount}`);
        if (idolCount === 0) {
            // 创建偶像数据
            const idolsData = [{
                id: 1,
                name: "星野爱",
                image: "images/1.jpg",
                description: "18岁｜东京出身｜擅长rap",
                phone: "iOS 15",
                age: 18,
                location: "东京"
            }, {
                id: 2,
                name: "白石琴乃",
                image: "images/2.jpg",
                description: "19岁｜大阪出身｜舞蹈天才",
                phone: "Android",
                age: 19,
                location: "大阪"
            }];
            // 插入偶像数据
            for (const idol of idolsData) {
                await pool.query(`
                    INSERT INTO idols (id, name, image, description, phone, age, location)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                `, [idol.id, idol.name, idol.image, idol.description, idol.phone, idol.age, idol.location]);
            }
            console.log('Initialized idol data');
        } else {
            console.log('Idol data already exists');
        }
    } catch (err) {
        console.error('Error initializing idol data:', err);
    }
};
// 在启动服务器后初始化数据库
(async () => {
    await initializeDatabase();
})();
// 静态资源目录
app.use('/css', express.static(__dirname + '/public/css'));
app.use('/images', express.static(__dirname + '/public/images'));
app.use('/script.js', express.static(__dirname + '/public/script.js'));
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/public/index.html');
});
// 获取用户唯一ID，建议用更可靠的方式生成（例如：根据session）
function generateUserId() {
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}
// 处理Socket连接
io.on('connection', async (socket) => {
    console.log('用户连接成功！');
    // 为新用户生成ID
    // const userId = generateUserId();
    const userId = "dw3y14npwpk2rzdci21kw4";
    socket.userId = userId; // 将用户ID附加到socket对象
    socket.favoriteIdol = null; // 初始喜欢的偶像为空
    try {
        // 查找用户
        console.log(`查询用户 ${userId}`);
        const [rows] = await pool.query(`SELECT * FROM fans WHERE userId = '${userId}'`);
        let fan = rows[0];
        if (!fan) {
            // 创建用户
            await pool.query(`
                INSERT INTO fans (userId, username, avatar, device, location, age)
                VALUES (?, ?, ?, ?, ?, ?)
            `, [userId, '匿名用户', 'images/default_avatar.png', 'Unknown', 'Unknown', null]);
            console.log(`用户 ${userId} 创建成功！`);
        }
    } catch (error) {
        console.error('创建用户失败:', error);
    }
    // 接收弹幕
    socket.on('send-danmaku', async (data) => {
        const {
            text,
            idolId
        } = data; // 接收偶像ID
        socket.favoriteIdol = idolId; // 更新喜欢的偶像
        try {
            // 更新粉丝弹幕数量和喜欢的偶像
            await pool.query('UPDATE fans SET danmakuCount = danmakuCount + 1, favoriteIdol = ? WHERE userId = ?', [idolId, userId]);
            // 广播给所有人,带上idolId
            io.emit('new-danmaku', {
                text: text,
                userId: socket.userId,
                idolId: idolId
            });
        } catch (error) {
            console.error('发送弹幕失败:', error);
        }
    });
    // 更新用户信息
    socket.on('update-user-info', async (userInfo) => {
        try {
            const {
                username,
                avatar,
                device,
                location,
                age
            } = userInfo;
            await pool.query(`
                UPDATE fans
                SET username = ?, avatar = ?, device = ?, location = ?, age = ?
                WHERE userId = ?
            `, [username, avatar, device, location, age, userId]);
            console.log(`用户 ${userId} 信息更新成功！`);
        } catch (error) {
            console.error('更新用户信息失败:', error);
        }
    });
    // 断开连接
    socket.on('disconnect', () => {
        console.log('用户断开连接');
    });
});
// 获取偶像列表 API
app.get('/api/idols', async (req, res) => {
    try {
        const [idols] = await pool.query('SELECT * FROM idols');
        res.json(idols); // 返回偶像数据
    } catch (error) {
        console.error('获取偶像列表失败:', error);
        res.status(500).json({
            error: '获取偶像列表失败'
        });
    }
});
// 获取粉丝画像 API
app.get('/api/idol/:idolId/fans/profile', async (req, res) => {
    const idolId = req.params.idolId;
    try {
        const [fans] = await pool.query('SELECT * FROM fans WHERE favoriteIdol = ?', [idolId]);
        // 统计地域分布
        const locationCounts = {};
        fans.forEach(fan => {
            const location = fan.location || '未知';
            locationCounts[location] = (locationCounts[location] || 0) + 1;
        });
        // 统计年龄分布
        const ageCounts = {};
        fans.forEach(fan => {
            const age = fan.age || '未知';
            ageCounts[age] = (ageCounts[age] || 0) + 1;
        });
        // 获取弹幕数量排名
        const ranking = [...fans].sort((a, b) => b.danmakuCount - a.danmakuCount).slice(0, 10);
        res.json({
            locationCounts: locationCounts,
            ageCounts: ageCounts,
            ranking: ranking
        });
    } catch (error) {
        console.error('获取粉丝画像失败:', error);
        res.status(500).json({
            error: '获取粉丝画像失败'
        });
    }
});
// 启动服务器
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`服务器运行在 http://localhost:${PORT}`);
});