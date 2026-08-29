const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType } = require('discord.js');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

const TXT_CHANNEL_ID = '1543093337165144084';
const VC_CHANNEL_ID = '1543093370065260564';

// قواعد البيانات
const db = {
    messages: new Map(),
    words: new Map(),
    voiceMinutes: new Map()
};

client.once('ready', () => {
    console.log(`Logged in as ${client.user.tag}!`);
    startLeaderboardLoops();
});

// تتبع الكلمات والرسائل
client.on('messageCreate', message => {
    if (message.author.bot) return;
    
    const userId = message.author.id;
    const wordCount = message.content.trim().split(/\s+/).length;

    db.messages.set(userId, (db.messages.get(userId) || 0) + 1);
    db.words.set(userId, (db.words.get(userId) || 0) + wordCount);

    handleAnonymousMessage(message);
});

// تتبع تواجد الفويس وحساب النقاط (10 نقاط لكل دقيقة)
client.on('voiceStateUpdate', (oldState, newState) => {
    // منطق تتبع الفويس البسيط
    if (!oldState.channelId && newState.channelId) {
        newState.member.voiceJoinTime = Date.now();
    } else if (oldState.channelId && !newState.channelId && oldState.member.voiceJoinTime) {
        const durationMins = Math.floor((Date.now() - oldState.member.voiceJoinTime) / 60000);
        const userId = oldState.member.id;
        const currentMins = db.voiceMinutes.get(userId) || 0;
        db.voiceMinutes.set(userId, currentMins + durationMins);
    }
});

// حلقات التحديث التلقائي كل 30 ثانية لكل من اللوحتين
function startLeaderboardLoops() {
    // توب الكلمات
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

    // توب الفويس
    setInterval(async () => {
        try {
            const channel = await client.channels.fetch(VC_CHANNEL_ID);
            if (!channel) return;

            const embed = new EmbedBuilder()
                .setTitle('Top Voice')
                .setColor('#1e1f22')
                .setDescription(getTopVoiceText())
                .setFooter({ text: 'Updated 30 seconds ago' });

            const messages = await channel.messages.fetch({ limit: 5 });
            const botMessage = messages.find(m => m.author.id === client.user.id);
            if (botMessage) await botMessage.delete().catch(() => {});

            await channel.send({ embeds: [embed] });
        } catch (err) {
            console.error('Error updating vc leaderboard:', err);
        }
    }, 30000);
}

function getTopMessagesText() {
    const sorted = [...db.words.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
    if (sorted.length === 0) return 'لا توجد بيانات كافية بعد.';
    return sorted.map((item, index) => `${index + 1}. <@${item[0]}> ⎯ ${item[1]}`).join('\n');
}

function getTopVoiceText() {
    const sorted = [...db.voiceMinutes.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
    if (sorted.length === 0) return 'لا توجد بيانات كافية بعد.';
    return sorted.map((item, index) => `${index + 1}. <@${item[0]}> ⎯ ${item[1] * 10}`).join('\n');
}

// التفاعل مع الأزرار
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
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('start_anon_flow').setLabel('رسالة من مجهول').setStyle(ButtonStyle.Secondary)
        );
        await interaction.reply({ content: 'أرسل الرسالة وتطمئن، كل شيء بسرية تامّة.', components: [row], ephemeral: true });
    }

    if (interaction.customId === 'start_anon_flow') {
        await interaction.update({ content: 'يرجى كتابة رسالتك الآن متضمنة منشن الشخص المراد (مع نص إضافي).', components: [] });
    }
});

// معالجة الرسالة السرية ومنشن الشخص
async function handleAnonymousMessage(message) {
    if (message.mentions.users.size > 0 && message.content.length > 3) {
        const targetUser = message.mentions.users.first();
        if (targetUser.id === message.author.id) return;

        await message.delete().catch(() => {});

        const confirmRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`anon_reveal_${targetUser.id}_${message.author.id}`).setLabel('إفصاح عن الهوية').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(`anon_secret_${targetUser.id}_${message.author.id}`).setLabel('مجهول الهوية').setStyle(ButtonStyle.Secondary)
        );

        const sentMsg = await message.channel.send({
            content: `يرجى الاختيار للإفصاح عن الهوية أو لا لـ <@${targetUser.id}>:`,
            components: [confirmRow]
        });

        const filter = i => i.customId.startsWith('anon_');
        const collector = sentMsg.createMessageComponentCollector({ filter, time: 5000 });

        collector.on('collect', async i => {
            const parts = i.customId.split('_');
            const type = parts[1];
            const targetId = parts[2];
            const senderId = parts[3];
            
            const targetUserObj = await client.users.fetch(targetId).catch(() => null);
            const senderTag = type === 'reveal' ? `الراسل <@${senderId}>` : `الراسل مجهول الهوية`;

            if (targetUserObj) {
                await targetUserObj.send(`**عندك رسالة من مجهول**\n\n**${message.content}**\n\n${senderTag}`).catch(() => {});
            }
            await i.update({ content: 'تم إرسال الرسالة بنجاح.', components: [] });
            setTimeout(() => sentMsg.delete().catch(() => {}), 2000);
        });

        collector.on('end', collected => {
            if (collected.size === 0) {
                sentMsg.delete().catch(() => {});
            }
        });
    }
}

client.login(process.env.TOKEN);
