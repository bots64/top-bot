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

// قاعدة بيانات وهمية مؤقتة
const db = {
    users: new Map()
};

client.once('ready', () => {
    console.log(`Logged in as ${client.user.tag}!`);
    startLeaderboardLoop();
});

// نظام تتبع الرسائل
client.on('messageCreate', message => {
    if (message.author.bot) return;
    let data = db.users.get(message.author.id) || { voiceMinutes: 0, messages: 0 };
    data.messages += 1;
    db.users.set(message.author.id, data);
});

// حلقة التحديث كل 15 ثانية لوحة المتصدرين
function startLeaderboardLoop() {
    setInterval(async () => {
        try {
            const channel = await client.channels.fetch(CHANNEL_ID);
            if (!channel) return;

            const imageBuffer = await createLeaderboardImage();
            const attachment = new AttachmentBuilder(imageBuffer, { name: 'leaderboard.png' });

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('interactive_stats')
                    .setLabel('تفاعلي')
                    .setStyle(ButtonStyle.Primary)
            );

            const messages = await channel.messages.fetch({ limit: 5 });
            const botMessage = messages.find(m => m.author.id === client.user.id);
            if (botMessage) await botMessage.delete().catch(() => {});

            await channel.send({ files: [attachment], components: [row] });
        } catch (error) {
            console.error('Error updating leaderboard:', error);
        }
    }, 15000);
}

// دالة رسم اللوحة مع ضمان ظهور النصوص بوضوح وتجنب السواد
async function createLeaderboardImage() {
    const canvas = Canvas.createCanvas(1200, 675);
    const ctx = canvas.getContext('2d');

    // تعبئة خلفية ملونة واضحة (ليست سوداء صامتة)
    ctx.fillStyle = '#1e1b4b';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // إضافة إطار جمالي
    ctx.strokeStyle = '#6366f1';
    ctx.lineWidth = 10;
    ctx.strokeRect(0, 0, canvas.width, canvas.height);

    // كتابة العنوان الرئيسي
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 50px Arial';
    ctx.fillText('Ryth Voice Leaderboard', 80, 120);

    // كتابة وصف فرعي
    ctx.fillStyle = '#a5b4fc';
    ctx.font = '28px Arial';
    ctx.fillText('أفضل الأعضاء تفاعلاً في الصوتي والتشات', 80, 180);

    return canvas.toBuffer('image/png');
}

// التفاعل مع الزر وإرسال البروفايل
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

// دالة رسم البروفايل الشخصي
async function createProfileImage(user, level, chatXP, rank, messages) {
    const canvas = Canvas.createCanvas(1000, 600);
    const ctx = canvas.getContext('2d');

    // خلفية البروفايل
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 8;
    ctx.strokeRect(0, 0, canvas.width, canvas.height);

    // النصوص
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 40px Arial';
    ctx.fillText(`إحصائيات المستخدم الشخصية`, 70, 100);
    
    ctx.fillStyle = `\#38bdf8`;
    ctx.font = '30px Arial';
    ctx.fillText(`المرتبة (Rank): ${rank}`, 70, 190);
    ctx.fillText(`المستوى (Level): ${level}`, 70, 260);
    ctx.fillText(`نقاط الشات (Chat XP): ${chatXP}`, 70, 330);
    ctx.fillText(`عدد الرسائل: ${messages}`, 70, 400);

    return canvas.toBuffer('image/png');
}

client.login(process.env.TOKEN);
