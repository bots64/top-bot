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
            const attachment = new AttachmentBuilder(imageBuffer, { name: 'ryth-top.png' });

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

// دالة توليد صورة المتصدرين بدون سواد
async function createLeaderboardImage() {
    const canvas = Canvas.createCanvas(1200, 675);
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 45px Arial';
    ctx.fillText('Ryth Voice Leaderboard', 60, 90);

    ctx.fillStyle = '#94a3b8';
    ctx.font = '24px Arial';
    ctx.fillText('Active Voice Members Ranking', 60, 140);

    return canvas.toBuffer('image/png');
}

// التفاعل مع الزر وإرسال البروفايل الخاص
client.on('interactionCreate', async interaction => {
    if (!interaction.isButton() || interaction.customId !== 'interactive_stats') return;

    await interaction.deferReply({ ephemeral: true });

    const userId = interaction.user.id;
    const userData = db.users.get(userId) || { voiceMinutes: 0, messages: 0 };
    
    const rank = '#1'; 
    const level = Math.floor(userData.voiceMinutes / 10); 
    const chatXP = userData.messages * 5;

    const profileBuffer = await createProfileImage(interaction.user, level, chatXP, rank, userData.messages);
    const attachment = new AttachmentBuilder(profileBuffer, { name: 'profile.png' });

    await interaction.editReply({ files: [attachment] });
});

// دالة توليد صورة البروفايل الشخصي بدون سواد
async function createProfileImage(user, level, chatXP, rank, messages) {
    const canvas = Canvas.createCanvas(1000, 600);
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#1e1b4b';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 36px Arial';
    ctx.fillText(`أنت ضمن أفضل ${rank}!`, 80, 150);
    
    ctx.font = '24px Arial';
    ctx.fillStyle = '#c084fc';
    ctx.fillText(`Level: ${level}  |  Chat XP: ${chatXP}  |  Messages: ${messages}`, 80, 230);

    return canvas.toBuffer('image/png');
}

client.login(process.env.TOKEN);
