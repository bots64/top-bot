const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder } = require('discord.js');
const Canvas = require('canvas');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

const CHANNEL_ID = '1543093370065260564';

// قاعدة بيانات وهمية مؤقتة (يمكنك ربطها بـ MongoDB أو SQLite لاحقاً)
const db = {
    users: new Map() // userId -> { voiceMinutes, messages }
};

client.once('ready', () => {
    console.log(`Logged in as ${client.user.tag}!`);
    startLeaderboardLoop();
});

// نظام تتبع الرسائل لحساب الـ Chat XP (5 XP لكل كلمة/رسالة)
client.on('messageCreate', message => {
    if (message.author.bot) return;
    let data = db.users.get(message.author.id) || { voiceMinutes: 0, messages: 0 };
    data.messages += 1;
    db.users.set(message.author.id, data);
});

// حلقة التحديث كل 15 ثانية للوحة المتصدرين
function startLeaderboardLoop() {
    setInterval(async () => {
        try {
            const channel = await client.channels.fetch(CHANNEL_ID);
            if (!channel) return;

            // توليد صورة اللوحة (Voice Leaderboard)
            const imageBuffer = await createLeaderboardImage();
            const attachment = new AttachmentBuilder(imageBuffer, { name: 'ryth-top.jpg' });

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('interactive_stats')
                    .setLabel('تفاعلي')
                    .setStyle(ButtonStyle.Primary)
            );

            // جلب آخر رسالة للبوت وحذفها لتجنب التراكم، ثم إرسال الجديدة
            const messages = await channel.messages.fetch({ limit: 5 });
            const botMessage = messages.find(m => m.author.id === client.user.id);
            if (botMessage) await botMessage.delete().catch(() => {});

            await channel.send({ files: [attachment], components: [row] });
        } catch (error) {
            console.error('Error updating leaderboard:', error);
        }
    }, 15000);
}

// دالة توليد صورة المتصدرين باستخدام Canvas
async function createLeaderboardImage() {
    const canvas = Canvas.createCanvas(1200, 675);
    const ctx = canvas.getContext('2d');

    // خلفية بسيطة مؤقتة (يمكنك استبدالها بخلفيتك الخاصة)
    ctx.fillStyle = '#0a1128';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 36px Arial';
    ctx.fillText('Ryth', 50, 60);

    ctx.font = '18px Arial';
    ctx.fillText('VOICE TIME RANKING', 50, 95);

    return canvas.toBuffer();
}

// التفاعل مع الزر وإرسال البروفايل الخاص
client.on('interactionCreate', async interaction => {
    if (!interaction.isButton() || interaction.customId !== 'interactive_stats') return;

    await interaction.deferReply({ ephemeral: true });

    const userId = interaction.user.id;
    const userData = db.users.get(userId) || { voiceMinutes: 0, messages: 0 };
    
    // حساب الرانك والمستوى
    const rank = '#1'; // مثال، يفضل حسابه من قاعدة البيانات
    const level = Math.floor(userData.voiceMinutes / 10); // كل دقيقة 10 XP
    const chatXP = userData.messages * 5;

    // توليد صورة البروفايل الشخصي
    const profileBuffer = await createProfileImage(interaction.user, level, chatXP, rank, userData.messages);
    const attachment = new AttachmentBuilder(profileBuffer, { name: 'profile.jpg' });

    await interaction.editReply({ files: [attachment] });
});

// دالة توليد صورة البروفايل الشخصي
async function createProfileImage(user, level, chatXP, rank, messages) {
    const canvas = Canvas.createCanvas(1000, 600);
    const ctx = canvas.getContext('2d');

    // خلفية البروفايل الأرجوانية
    ctx.fillStyle = '#161026';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // كتابة النصوص المطلوبة بدقة
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 28px Arial';
    ctx.fillText(`أنت ضمن أفضل ${rank}!`, 400, 250);
    
    ctx.font = '22px Arial';
    ctx.fillText(`You are among the top ${rank}!`, 400, 300);

    return canvas.toBuffer();
}

client.login(process.env.TOKEN);
