const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

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
const ANON_CHANNEL_ID = '1543113579962835054';

const db = {
    messages: new Map(),       // إجمالي الرسائل لكل مستخدم
    words: new Map(),          // إجمالي الكلمات لكل مستخدم
    voiceMinutes: new Map(),   // إجمالي دقائق الفويس لكل مستخدم
    dailyMessages: new Map(),  // رسائل اليوم
    dailyVoice: new Map()      // فويس اليوم
};

client.once('ready', async () => {
    console.log(`Logged in as ${client.user.tag}!`);
    await updateLeaderboards();
    setInterval(updateLeaderboards, 30000);
});

// تتبع الكلمات والرسائل
client.on('messageCreate', async message => {
    if (message.author.bot) return;

    // فحص نظام رسالة من مجهول في روم الروم المخصص أو أي شات
    if (message.channel.id === ANON_CHANNEL_ID || message.content.includes('@')) {
        const handled = await handleAnonymousMessage(message);
        if (handled) return;
    }
    
    const userId = message.author.id;
    const wordCount = message.content.trim().split(/\s+/).length;

    db.messages.set(userId, (db.messages.get(userId) || 0) + 1);
    db.words.set(userId, (db.words.get(userId) || 0) + wordCount);
    db.dailyMessages.set(userId, (db.dailyMessages.get(userId) || 0) + 1);
});

// تتبع الفويس وحساب النقاط (10 نقاط لكل دقيقة وتخزين الساعات والدقائق)
client.on('voiceStateUpdate', (oldState, newState) => {
    if (!oldState.channelId && newState.channelId) {
        newState.member.voiceJoinTime = Date.now();
    } else if (oldState.channelId && !newState.channelId && oldState.member.voiceJoinTime) {
        const durationMins = Math.floor((Date.now() - oldState.member.voiceJoinTime) / 60000);
        const userId = oldState.member.id;
        
        const currentMins = db.voiceMinutes.get(userId) || 0;
        db.voiceMinutes.set(userId, currentMins + durationMins);

        const currentDailyMins = db.dailyVoice.get(userId) || 0;
        db.dailyVoice.set(userId, currentDailyMins + durationMins);
    }
});

async function updateLeaderboards() {
    try {
        // 1. تحديث توب الكلمات
        const txtChannel = await client.channels.fetch(TXT_CHANNEL_ID).catch(() => null);
        if (txtChannel) {
            const embed = new EmbedBuilder()
                .setTitle('Top Messages')
                .setColor('#1e1f22')
                .setDescription(getTopMessagesText())
                .setFooter({ text: 'Updated 30 seconds ago' });

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('my_stats_txt').setLabel('My Stats').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId('anonymous_msg_btn').setLabel('رسالة من مجهول').setStyle(ButtonStyle.Secondary)
            );

            const messages = await txtChannel.messages.fetch({ limit: 10 }).catch(() => null);
            if (messages) {
                const botMessage = messages.find(m => m.author.id === client.user.id);
                if (botMessage) await botMessage.delete().catch(() => {});
            }
            await txtChannel.send({ embeds: [embed], components: [row] });
        }

        // 2. تحديث توب الفويس
        const vcChannel = await client.channels.fetch(VC_CHANNEL_ID).catch(() => null);
        if (vcChannel) {
            const embed = new EmbedBuilder()
                .setTitle('Top Voice')
                .setColor('#1e1f22')
                .setDescription(getTopVoiceText())
                .setFooter({ text: 'Updated 30 seconds ago' });

            const messages = await vcChannel.messages.fetch({ limit: 10 }).catch(() => null);
            if (messages) {
                const botMessage = messages.find(m => m.author.id === client.user.id);
                if (botMessage) await botMessage.delete().catch(() => {});
            }
            await vcChannel.send({ embeds: [embed] });
        }

        // 3. إرسال رسالة "رسالة من مجهول" في القناة المخصصة بخلفية سوداء فارغة
        const anonChannel = await client.channels.fetch(ANON_CHANNEL_ID).catch(() => null);
        if (anonChannel) {
            const messages = await anonChannel.messages.fetch({ limit: 5 }).catch(() => null);
            const botMessage = messages ? messages.find(m => m.author.id === client.user.id) : null;
            
            if (!botMessage) {
                const embed = new EmbedBuilder()
                    .setColor('#1e1f22')
                    .setDescription('اكتب رسالتك بسرية تامة\nوكل شي محفوظ هنا');

                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('anonymous_msg_btn').setLabel('رسالة من مجهول').setStyle(ButtonStyle.Secondary)
                );

                await anonChannel.send({ embeds: [embed], components: [row] });
            }
        }
    } catch (err) {
        console.error('Error in updateLeaderboards:', err);
    }
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

function formatTime(totalMins) {
    const hours = Math.floor(totalMins / 60);
    const mins = totalMins % 60;
    if (hours > 0) {
        return `${hours}h ${mins}m`;
    }
    return `${mins}m`;
}

client.on('interactionCreate', async interaction => {
    if (!interaction.isButton()) return;

    if (interaction.customId === 'my_stats_txt') {
        await interaction.deferReply({ ephemeral: true });
        const userId = interaction.user.id;
        
        const allWords = db.words.get(userId) || 0;
        const msgToday = db.dailyMessages.get(userId) || 0;
        
        const sortedWords = [...db.words.entries()].sort((a, b) => b[1] - a[1]);
        const rank = sortedWords.findIndex(item => item[0] === userId) + 1 || sortedWords.length + 1;

        const embed = new EmbedBuilder()
            .setTitle('My Message Stats')
            .setColor('#1e1f22')
            .setDescription(`all messages server ${allWords}\nmessages this day ${msgToday}\n#rank ${rank}`);

        await interaction.editReply({ embeds: [embed] });
    }

    if (interaction.customId === 'my_stats_vc') {
        await interaction.deferReply({ ephemeral: true });
        const userId = interaction.user.id;
        
        const totalMins = db.voiceMinutes.get(userId) || 0;
        const dailyMins = db.dailyVoice.get(userId) || 0;
        
        const sortedVc = [...db.voiceMinutes.entries()].sort((a, b) => b[1] - a[1]);
        const rank = sortedVc.findIndex(item => item[0] === userId) + 1 || sortedVc.length + 1;

        const embed = new EmbedBuilder()
            .setTitle('My Voice Stats')
            .setColor('#1e1f22')
            .setDescription(`time server ${formatTime(totalMins)}\ntime this day ${formatTime(dailyMins)}\n#rank ${rank}`);

        await interaction.editReply({ embeds: [embed] });
    }

    if (interaction.customId === 'anonymous_msg_btn') {
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('start_anon_flow').setLabel('ابدأ كتابة الرسالة').setStyle(ButtonStyle.Secondary)
        );
        await interaction.reply({ content: 'اكتب رسالتك الآن متضمنة المنشن.', components: [row], ephemeral: true });
    }

    if (interaction.customId === 'start_anon_flow') {
        await interaction.update({ content: 'قم بإرسال رسالتك مع المنشن في الشات الآن.', components: [] });
    }
});

// معالجة رسالة من مجهول والتحقق الفوري من المنشن والسرعة
async function handleAnonymousMessage(message) {
    if (message.author.bot) return false;

    if (message.mentions.users.size > 0) {
        const targetUser = message.mentions.users.first();
        if (targetUser.id === message.author.id) return false;

        const content = message.content;
        const senderId = message.author.id;

        // حذف الرسالة فوراً لتكون سرية
        await message.delete().catch(() => {});

        const confirmRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`anon_reveal_${targetUser.id}_${senderId}`).setLabel('كشف').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(`anon_secret_${targetUser.id}_${senderId}`).setLabel('إخفاء').setStyle(ButtonStyle.Secondary)
        );

        const sentMsg = await message.channel.send({
            content: `اختر لكشف هويتك أو إخفائها لـ <@${targetUser.id}>:`,
            components: [confirmRow]
        });

        const filter = i => i.customId.startsWith('anon_') && i.user.id === senderId;
        const collector = sentMsg.createMessageComponentCollector({ filter, time: 20000 });

        collector.on('collect', async i => {
            const parts = i.customId.split('_');
            const type = parts[1];
            const targetId = parts[2];
            const originalSenderId = parts[3];
            
            const targetUserObj = await client.users.fetch(targetId).catch(() => null);
            const senderTag = type === 'reveal' ? `الراسل <@${originalSenderId}>` : `الراسل مجهول الهوية`;

            if (targetUserObj) {
                // إرسال الرسالة بالخاص خلال أقل من ثانية وبدون نقطتين أم راس
                await targetUserObj.send(`**${content}**\n\n${senderTag}`).catch(() => {});
            }

            await i.update({ content: 'تم إرسال الرسالة', components: [] });
            setTimeout(() => sentMsg.delete().catch(() => {}), 1000);
        });

        collector.on('end', collected => {
            if (collected.size === 0) {
                sentMsg.delete().catch(() => {});
            }
        });

        return true;
    } else if (message.channel.id === ANON_CHANNEL_ID) {
        // إذا لم يتم منشن أي شخص
        await message.delete().catch(() => {});
        const warnMsg = await message.channel.send({ content: 'لم تقم بمنشن أي شخص، يجدر بك منشن شخص لإرسال الرسالة.' });
        setTimeout(() => warnMsg.delete().catch(() => {}), 3000);
        return true;
    }

    return false;
}

client.login(process.env.TOKEN);
