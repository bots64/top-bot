const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder, ChannelType } = require('discord.js');
const Canvas = class CanvasMock {}; // يمكن استبدالها بمكتبة canvas الفعلية حسب رغبتك

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// تعبئة اIDs الخاصة بالرووم والأقسام
const TXT_CHANNEL_ID = '1543093370065260564'; // روم توب الرسائل
const VC_CHANNEL_ID = 'REPLACE_WITH_VC_CHANNEL_ID'; // روم توب الفويس

// قواعد بيانات وهمية لتخزين الرسائل، الكلمات، وأوقات الفويس
const db = {
    messages: new Map(), // userId -> count
    words: new Map(),    // userId -> total words
    voiceTime: new Map(), // userId -> milliseconds
    voiceRooms: new Map() // userId -> Map(roomName -> time)
};

client.once('ready', () => {
    console.log(`Logged in as ${client.user.tag}!`);
    startLeaderboardLoops();
});

// تتبع الرسائل والكلمات
client.on('messageCreate', message => {
    if (message.author.bot) return;
    
    const userId = message.author.id;
    const wordCount = message.content.trim().split(/\s+/).length;

    db.messages.set(userId, (db.messages.get(userId) || 0) + 1);
    db.words.set(userId, (db.words.get(userId) || 0) + wordCount);

    // نظام الرسالة من مجهول والتحقق من المنشن
    handleAnonymousMessage(message);
});

// حلقات التحديث التلقائي كل 30 ثانية لكل من اللوحتين
function startLeaderboardLoops() {
    // تحديث توب الرسائل
    setInterval(async () => {
        try {
            const channel = await client.channels.fetch(TXT_CHANNEL_ID);
            if (!channel) return;

            const embed = new EmbedBuilder()
                .setTitle('Top Messages')
                .setColor('#1e1f22')
                .setDescription(getTopMessagesText())
                .setFooter({ text: 'Updated 30 seconds ago' });

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('my_stats_txt').setLabel('My Stats').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId('anonymous_msg_btn').setLabel('رسالة من مجهول').setStyle(ButtonStyle.Secondary)
            );

            const messages = await channel.messages.fetch({ limit: 5 });
            const botMessage = messages.find(m => m.author.id === client.user.id);
            if (botMessage) await botMessage.delete().catch(() => {});

            await channel.send({ embeds: [embed], components: [row] });
        } catch (err) {
            console.error('Error updating txt leaderboard:', err);
        }
    }, 30000);
}

function getTopMessagesText() {
    const sorted = [...db.words.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
    if (sorted.length === 0) return 'لا توجد بيانات كافية بعد.';
    return sorted.map((item, index) => `${index + 1}. <@${item[0]}> — ${item[1]} words`).join('\n');
}

// التفاعل مع الأزرار (My Stats & Anonymous Message)
client.on('interactionCreate', async interaction => {
    if (!interaction.isButton()) return;

    if (interaction.customId === 'my_stats_txt') {
        await interaction.deferReply({ ephemeral: true });
        const userId = interaction.user.id;
        const userWords = db.words.get(userId) || 0;
        const userMsgs = db.messages.get(userId) || 0;
        
        const sorted = [...db.words.entries()].sort((a, b) => b[1] - a[1]);
        const rank = sorted.findIndex(item => item[0] === userId) + 1 || 'خارج التصنيف';

        const embed = new EmbedBuilder()
            .setTitle('My Message Stats')
            .setColor('#1e1f22')
            .setDescription(`**All Time Words:** ${userWords}\n**Messages:** ${userMsgs}\n**Rank:** #${rank}`);

        await interaction.editReply({ embeds: [embed] });
    }

    if (interaction.customId === 'anonymous_msg_btn') {
        await interaction.reply({ 
            content: 'اكتب رسالتك للمجهول وكل شيء بسرية تامة. قم بكتابة رسالتك مع منشن الشخص المطلوبة ولا تنسَ كتابة نص مع المنشن.', 
            ephemeral: true 
        });
    }
});

// معالجة الرسالة السرية ومنشن الشخص
async function handleAnonymousMessage(message) {
    if (message.mentions.users.size > 0 && message.content.length > 5) {
        // التحقق من وجود نص مع المنشن وليس منشنًا بمفرده
        const targetUser = message.mentions.users.first();
        if (targetUser.id === message.author.id) return;

        await message.delete().catch(() => {});

        const confirmRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`anon_reveal_${targetUser.id}_${message.author.id}`).setLabel('إفصاح عن الهوية').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(`anon_secret_${targetUser.id}`).setLabel('هوية سرية').setStyle(ButtonStyle.Secondary)
        );

        const sentMsg = await message.channel.send({
            content: `لديك رسالة من مجهول مرسلة إلى <@${targetUser.id}>. اختر نوع الإفصاح (خلال 5 ثوانٍ):`,
            components: [confirmRow]
        });

        // مؤقت 5 ثوانٍ للاختيار
        const filter = i => i.customId.startsWith('anon_');
        const collector = sentMsg.createMessageComponentCollector({ filter, time: 5000 });

        collector.on('collect', async i => {
            if (i.customId.startsWith('anon_reveal')) {
                const parts = i.customId.split('_');
                const targetId = parts[2];
                const senderId = parts[3];
                
                const targetUserObj = await client.users.fetch(targetId).catch(() => null);
                if (targetUserObj) {
                    await targetUserObj.send(`**عندك رسالة من مجهول**\nالرسالة: ${message.content}\nالراسل: <@${senderId}>`).catch(() => {});
                }
                await i.update({ content: 'تم إرسال الرسالة مع إفصاح الهوية بنجاح.', components: [] });
                setTimeout(() => sentMsg.delete().catch(() => {}), 2000);
            } else if (i.customId.startsWith('anon_secret')) {
                const targetId = i.customId.split('_')[2];
                const targetUserObj = await client.users.fetch(targetId).catch(() => null);
                if (targetUserObj) {
                    await targetUserObj.send(`**عندك رسالة من مجهول**\nالرسالة: ${message.content}\nالراسل: مجهول الهوية`).catch(() => {});
                }
                await i.update({ content: 'تم إرسال الرسالة بهوية سرية بنجاح.', components: [] });
                setTimeout(() => sentMsg.delete().catch(() => {}), 2000);
            }
        });

        collector.on('end', collected => {
            if (collected.size === 0) {
                sentMsg.delete().catch(() => {});
            }
        });
    }
}

client.login(process.env.TOKEN);
